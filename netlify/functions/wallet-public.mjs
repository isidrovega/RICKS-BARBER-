
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import {
  initializeApp,
  cert,
  getApps
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";
import { getWalletObjectId } from "./wallet-id.mjs";

const PROJECT_ID = "ricks-barber-shop";

const CLASS_ID =
  "3388000000023214898.3388000000023214898.ricks_barber_loyalty";

const WALLET_API =
  "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject";

const WALLET_SCOPE =
  "https://www.googleapis.com/auth/wallet_object.issuer";

const SITE_ORIGIN =
  "https://ricksbarbershop.netlify.app";

const QR_PATTERN = /^[a-f0-9]{64}$/;

function respond(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(data)
  };
}

function getCredentials() {
  const credentials = JSON.parse(
    process.env.GOOGLE_WALLET_CREDENTIALS || "{}"
  );

  if (
    credentials.type !== "service_account" ||
    credentials.project_id !== PROJECT_ID ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error("Credenciales del servidor no configuradas.");
  }

  return credentials;
}

function getFirebaseApp(credentials) {
  const existing = getApps().find(
    app => app.name === "[DEFAULT]"
  );

  if (existing) {
    return existing;
  }

  return initializeApp({
    credential: cert(credentials),
    projectId: PROJECT_ID
  });
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function getLoyalty(customer) {
  const visits = Math.max(
    0,
    Math.floor(Number(customer.visits) || 0)
  );

  const redeemed = Math.max(
    0,
    Math.floor(Number(customer.rewardsRedeemed) || 0)
  );

  const rewardsAvailable = Math.max(
    0,
    Math.floor(visits / 5) - redeemed
  );

  let progress = visits % 5;

  if (rewardsAvailable > 0 && progress === 0) {
    progress = 5;
  }

  return {
    visits,
    progress,
    rewardsAvailable
  };
}

function getClientIp(event) {
  const forwarded = event.headers?.["x-forwarded-for"];

  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }

  return event.headers?.["client-ip"] || "";
}

function getRateLimitId(ip, credentials) {
  return crypto
    .createHmac("sha256", credentials.private_key)
    .update(ip)
    .digest("hex");
}

async function checkRateLimit(db, ip, credentials) {
  if (!ip) {
    throw new Error("No se pudo identificar la solicitud.");
  }

  const id = getRateLimitId(ip, credentials);
  const ref = db.collection("walletPublicLimits").doc(id);

  const now = Date.now();
  const hour = 60 * 60 * 1000;

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.data() || {};

    const startedAt = Number(previous.startedAt) || 0;

    const sameWindow =
      startedAt > 0 && now - startedAt < hour;

    const count = sameWindow
      ? Number(previous.count || 0)
      : 0;

    if (count >= 5) {
      return false;
    }

    transaction.set(ref, {
      startedAt: sameWindow ? startedAt : now,
      count: count + 1,
      updatedAt: now
    });

    return true;
  });
}

async function findExistingCustomer(db, phone) {
  const customers = db.collection("customers");

  const result = await customers
    .where("normalizedPhone", "==", phone)
    .limit(2)
    .get();

  if (result.size > 1) {
    throw new Error("DUPLICATE_PHONE");
  }

  if (!result.empty) {
    return result.docs[0];
  }

  // Compatibilidad con registros antiguos
  // que todavía no tengan normalizedPhone.
  const all = await customers.get();

  const matches = all.docs.filter(snapshot => {
    const data = snapshot.data();

    return normalizePhone(data.phone) === phone;
  });

  if (matches.length > 1) {
    throw new Error("DUPLICATE_PHONE");
  }

  return matches[0] || null;
}

async function getOrCreateCustomer(db, name, phone) {
  const existing = await findExistingCustomer(db, phone);

  if (existing) {
    // Nunca cambiamos nombre, visitas ni premios.
    return {
      id: existing.id,
      data: existing.data()
    };
  }

  // El ID del teléfono es determinista.
  // Dos solicitudes simultáneas no crean
  // dos clientes nuevos con el mismo número.
  const phoneHash = crypto
    .createHash("sha256")
    .update(phone)
    .digest("hex");

  const lockRef = db
    .collection("walletPhoneClaims")
    .doc(phoneHash);

  const customerRef = db
    .collection("customers")
    .doc(`wallet-${phoneHash}`);

  return db.runTransaction(async transaction => {
    const [lock, customer] = await Promise.all([
      transaction.get(lockRef),
      transaction.get(customerRef)
    ]);

    if (lock.exists) {
      const existingId = lock.data()?.customerId;

      if (
        typeof existingId === "string" &&
        existingId === customerRef.id &&
        customer.exists
      ) {
        return {
          id: customerRef.id,
          data: customer.data()
        };
      }

      throw new Error("PHONE_CLAIM_CONFLICT");
    }

    if (customer.exists) {
      // No sobrescribir registros existentes.
      throw new Error("CUSTOMER_ID_CONFLICT");
    }

    const data = {
      id: customerRef.id,
      name,
      phone,
      normalizedPhone: phone,
      visits: 0,
      rewardsRedeemed: 0,
      createdAt: new Date().toISOString()
    };

    transaction.create(customerRef, data);

    transaction.create(lockRef, {
      customerId: customerRef.id,
      createdAt: new Date().toISOString()
    });

    return {
      id: customerRef.id,
      data
    };
  });
}

async function getOrCreateQrToken(db, walletObjectId) {
  const ref = db
    .collection("walletTokens")
    .doc(walletObjectId);

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);

    if (snapshot.exists) {
      const token = snapshot.data()?.token;

      if (!QR_PATTERN.test(String(token || ""))) {
        throw new Error("INVALID_EXISTING_QR");
      }

      return token;
    }

    const token = crypto.randomBytes(32).toString("hex");

    transaction.create(ref, {
      token,
      createdAt: new Date().toISOString()
    });

    return token;
  });
}

function buildWalletObject(id, customer, qrToken) {
  const loyalty = getLoyalty(customer);

  return {
    id,
    classId: CLASS_ID,
    state: "ACTIVE",
    accountName: String(customer.name || "Cliente"),
    loyaltyPoints: {
      label: "Visitas acumuladas",
      balance: {
        int: loyalty.visits
      }
    },
    barcode: {
      type: "QR_CODE",
      value: qrToken
    },
    textModulesData: [
      {
        id: "progress",
        header: "Progreso",
        body:
          `${loyalty.progress} de 5 visitas ` +
          "para el próximo corte gratis"
      },
      {
        id: "rewards",
        header: "Cortes gratis disponibles",
        body: String(loyalty.rewardsAvailable)
      }
    ]
  };
}

async function ensureWalletObject(credentials, desired) {
  const auth = new GoogleAuth({
    credentials,
    scopes: [WALLET_SCOPE]
  });

  const client = await auth.getClient();

  const url =
    `${WALLET_API}/${encodeURIComponent(desired.id)}`;

  let existing = null;

  try {
    const result = await client.request({
      url,
      method: "GET"
    });

    existing = result.data;
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error;
    }
  }

  if (!existing) {
    try {
      await client.request({
        url: WALLET_API,
        method: "POST",
        data: desired
      });

      return;
    } catch (error) {
      if (error.response?.status !== 409) {
        throw error;
      }
    }
  }

  // Sincronizar los datos actuales, sin modificar
  // visitas ni recompensas en Firebase.
  await client.request({
    url,
    method: "PATCH",
    data: {
      accountName: desired.accountName,
      loyaltyPoints: desired.loyaltyPoints,
      barcode: desired.barcode,
      textModulesData: desired.textModulesData
    }
  });
}

function createSaveUrl(credentials, walletObjectId) {
  const payload = {
    iss: credentials.client_email,
    aud: "google",
    origins: [SITE_ORIGIN],
    typ: "savetowallet",
    payload: {
      loyaltyObjects: [
        {
          id: walletObjectId,
          classId: CLASS_ID
        }
      ]
    }
  };

  const signed = jwt.sign(
    payload,
    credentials.private_key,
    {
      algorithm: "RS256",
      noTimestamp: true
    }
  );

  return `https://pay.google.com/gp/v/save/${signed}`;
}

export const handler = async event => {
  if (event.httpMethod !== "POST") {
    return respond(405, {
      error: "Método no permitido."
    });
  }

  // Interruptor de seguridad:
  // la función no opera hasta que activemos
  // explícitamente la variable en Netlify.
  if (process.env.WALLET_PUBLIC_ENABLED !== "true") {
    return respond(503, {
      error: "La entrega de tarjetas aún no está habilitada."
    });
  }

  if (
    typeof event.body !== "string" ||
    event.body.length > 2048
  ) {
    return respond(400, {
      error: "Solicitud demasiado grande."
    });
  }

  let body;

  try {
    body = JSON.parse(event.body);
  } catch {
    return respond(400, {
      error: "Datos no válidos."
    });
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.name !== "string" ||
    typeof body.phone !== "string"
  ) {
    return respond(400, {
      error: "Introduce tu nombre y teléfono."
    });
  }

  const name = body.name.trim().replace(/\s+/g, " ");
  const phone = normalizePhone(body.phone);

  if (
    name.length < 2 ||
    name.length > 100 ||
    phone.length < 10 ||
    phone.length > 13
  ) {
    return respond(400, {
      error: "Revisa tu nombre y teléfono."
    });
  }

  try {
    const credentials = getCredentials();
    const app = getFirebaseApp(credentials);
    const db = getFirestore(app);

    const ip = getClientIp(event);

    const allowed = await checkRateLimit(
      db,
      ip,
      credentials
    );

    if (!allowed) {
      return respond(429, {
        error:
          "Demasiadas solicitudes. " +
          "Intenta nuevamente más tarde."
      });
    }

    const customer = await getOrCreateCustomer(
      db,
      name,
      phone
    );

    const walletObjectId = getWalletObjectId(
      customer.id
    );

    const qrToken = await getOrCreateQrToken(
      db,
      walletObjectId
    );

    const walletObject = buildWalletObject(
      walletObjectId,
      customer.data,
      qrToken
    );

    await ensureWalletObject(
      credentials,
      walletObject
    );

    const saveUrl = createSaveUrl(
      credentials,
      walletObjectId
    );

    const appleWalletToken = jwt.sign(
      {
        purpose: "apple-wallet-public",
        customerId: customer.id
      },
      credentials.private_key,
      {
        algorithm: "RS256",
        expiresIn: "5m",
        issuer: "ricks-barber-shop",
        audience: "apple-wallet-public"
      }
    );

    return respond(200, {
      ok: true,
      saveUrl,
      appleWalletToken
    });
  } catch (error) {
    console.error(
      "Error en wallet-public:",
      error.message
    );

    if (
      error.message === "DUPLICATE_PHONE" ||
      error.message === "PHONE_CLAIM_CONFLICT"
    ) {
      return respond(409, {
        error:
          "Encontramos un conflicto con este teléfono. " +
          "Consulta al personal de la barbería."
      });
    }

    return respond(500, {
      error:
        "No pudimos preparar tu tarjeta. " +
        "Intenta nuevamente más tarde."
    });
  }
};
