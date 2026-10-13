
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";
import { getWalletObjectId } from "./wallet-id.mjs";

const PROJECT_ID = "ricks-barber-shop";

const GOOGLE_WALLET_SCOPE =
  "https://www.googleapis.com/auth/wallet_object.issuer";

const GOOGLE_WALLET_API_URL =
  "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject";

const GOOGLE_WALLET_CLASS_ID =
  "3388000000023214898.3388000000023214898.ricks_barber_loyalty";

const QR_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function respond(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  };
}

function getCredentials() {
  const credentials = JSON.parse(
    process.env.GOOGLE_WALLET_CREDENTIALS || "{}"
  );

  if (
    credentials.project_id !== PROJECT_ID ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error("Credenciales del servidor no configuradas.");
  }

  return credentials;
}

function getFirebaseApp(credentials) {
  const existingApp = getApps().find(
    (app) => app.name === "[DEFAULT]"
  );

  if (existingApp) {
    return existingApp;
  }

  return initializeApp({
    credential: cert(credentials),
    projectId: PROJECT_ID
  });
}

async function getGoogleWalletClient(credentials) {
  const auth = new GoogleAuth({
    credentials,
    scopes: [GOOGLE_WALLET_SCOPE]
  });

  return auth.getClient();
}

async function getGoogleWalletObject(client, walletObjectId) {
  try {
    const response = await client.request({
      url: `${GOOGLE_WALLET_API_URL}/${encodeURIComponent(walletObjectId)}`,
      method: "GET"
    });

    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }

    throw error;
  }
}

async function createGoogleWalletObject(client, loyaltyObject) {
  const response = await client.request({
    url: GOOGLE_WALLET_API_URL,
    method: "POST",
    data: loyaltyObject
  });

  return response.data;
}

async function updateGoogleWalletObject(
  client,
  walletObjectId,
  loyaltyObject
) {
  const response = await client.request({
    url: `${GOOGLE_WALLET_API_URL}/${encodeURIComponent(walletObjectId)}`,
    method: "PATCH",
    data: {
      accountName: loyaltyObject.accountName,
      loyaltyPoints: loyaltyObject.loyaltyPoints,
      barcode: loyaltyObject.barcode,
      textModulesData: loyaltyObject.textModulesData
    }
  });

  return response.data;
}

function getCustomerLoyalty(customer) {
  const visits = Math.max(
    0,
    Math.floor(Number(customer.visits) || 0)
  );

  const rewardsRedeemed = Math.max(
    0,
    Math.floor(Number(customer.rewardsRedeemed) || 0)
  );

  const rewardsAvailable = Math.max(
    0,
    Math.floor(visits / 5) - rewardsRedeemed
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

function buildGoogleWalletObject({
  walletObjectId,
  customerName,
  visits,
  progress,
  rewardsAvailable,
  qrValue
}) {
  return {
    id: walletObjectId,
    classId: GOOGLE_WALLET_CLASS_ID,
    state: "ACTIVE",
    accountName: customerName,
    loyaltyPoints: {
      label: "Visitas acumuladas",
      balance: {
        int: visits
      }
    },
    barcode: {
      type: "QR_CODE",
      value: qrValue
    },
    textModulesData: [
      {
        id: "progress",
        header: "Progreso",
        body: `${progress} de 5 visitas para el próximo corte gratis`
      },
      {
        id: "rewards",
        header: "Cortes gratis disponibles",
        body: String(rewardsAvailable)
      }
    ]
  };
}

function walletNeedsUpdate(existing, desired) {
  if (!existing) {
    return false;
  }

  const existingPoints =
    Number(existing.loyaltyPoints?.balance?.int ?? -1);

  const desiredPoints =
    Number(desired.loyaltyPoints.balance.int);

  const existingModules = Array.isArray(existing.textModulesData)
    ? existing.textModulesData
    : [];

  const getModuleBody = (modules, id) =>
    modules.find((module) => module.id === id)?.body ?? null;

  return (
    existing.accountName !== desired.accountName ||
    existingPoints !== desiredPoints ||
    existing.barcode?.value !== desired.barcode.value ||
    getModuleBody(existingModules, "progress") !==
      getModuleBody(desired.textModulesData, "progress") ||
    getModuleBody(existingModules, "rewards") !==
      getModuleBody(desired.textModulesData, "rewards")
  );
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return respond(405, {
      error: "Método no permitido."
    });
  }

  const authorization =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const match = authorization.match(/^Bearer (.+)$/i);

  if (!match) {
    return respond(401, {
      error: "Se requiere iniciar sesión."
    });
  }

  let credentials;
  let app;
  let decodedToken;

  try {
    credentials = getCredentials();
    app = getFirebaseApp(credentials);

    decodedToken = await getAuth(app).verifyIdToken(
      match[1],
      true
    );
  } catch (error) {
    console.error("Error de autenticación:", error.message);

    return respond(401, {
      error: "Sesión no válida."
    });
  }

  try {
    const db = getFirestore(app);

    // Verificar que la sesión pertenece a un administrador.
    const adminSnapshot = await db
      .collection("admins")
      .doc(decodedToken.uid)
      .get();

    const admin = adminSnapshot.data();

    if (
      !adminSnapshot.exists ||
      admin?.active !== true ||
      admin?.role !== "admin"
    ) {
      return respond(403, {
        error: "No tienes permisos de administrador."
      });
    }

    let body;

    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return respond(400, {
        error: "La solicitud no contiene JSON válido."
      });
    }

    if (
      body === null ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return respond(400, {
        error: "Formato de solicitud no válido."
      });
    }

    const customerId = body.customerId;

    if (
      typeof customerId !== "string" ||
      !customerId.trim() ||
      customerId.length > 150 ||
      customerId.includes("/")
    ) {
      return respond(400, {
        error: "Identificador de cliente no válido."
      });
    }

    const createRequested = body.createWallet === true;
    const updateRequested = body.updateWallet === true;

    if (createRequested && updateRequested) {
      return respond(400, {
        error: "No puedes crear y actualizar en la misma solicitud."
      });
    }

    const customerSnapshot = await db
      .collection("customers")
      .doc(customerId.trim())
      .get();

    if (!customerSnapshot.exists) {
      return respond(404, {
        error: "Cliente no encontrado."
      });
    }

    const customer = customerSnapshot.data();
    const loyalty = getCustomerLoyalty(customer);

    const walletObjectId = getWalletObjectId(
      customerSnapshot.id
    );

    const walletTokenSnapshot = await db
      .collection("walletTokens")
      .doc(walletObjectId)
      .get();

    const storedQrToken = walletTokenSnapshot.exists
      ? walletTokenSnapshot.data()?.token
      : null;

    const walletQrExists =
      typeof storedQrToken === "string" &&
      QR_TOKEN_PATTERN.test(storedQrToken);

    // Compatibilidad con las pruebas anteriores:
    // si el navegador envía un QR, debe coincidir.
    const providedQrToken = body.walletQrToken ?? null;

    if (providedQrToken !== null) {
      if (
        typeof providedQrToken !== "string" ||
        !QR_TOKEN_PATTERN.test(providedQrToken)
      ) {
        return respond(400, {
          error: "Código QR no válido."
        });
      }

      if (
        !walletQrExists ||
        providedQrToken !== storedQrToken
      ) {
        return respond(403, {
          error: "El código QR no corresponde a este cliente."
        });
      }
    }

    // Nunca crear ni actualizar una tarjeta sin su QR permanente.
    if (
      createRequested && !walletQrExists
    ) {
      return respond(400, {
        error: "El cliente no tiene un código QR permanente válido."
      });
    }

    // Clientes sin QR: omitir actualización sin error.
  // No se crea ninguna tarjeta ni se modifica Firestore.
  if (updateRequested && !walletQrExists) {
    return respond(200, {
      ok: true,
      customerId: customerSnapshot.id,
      walletObjectId,
      walletExists: false,
      walletCreated: false,
      walletUpdated: false,
      walletQrExists: false,
      visits: loyalty.visits,
      progress: loyalty.progress,
      rewardsAvailable: loyalty.rewardsAvailable
    });
  }

  const walletClient = await getGoogleWalletClient(
      credentials
    );

    let walletObject = await getGoogleWalletObject(
      walletClient,
      walletObjectId
    );

    let walletCreated = false;
    let walletUpdated = false;

    if (createRequested || updateRequested) {
      const desiredWalletObject = buildGoogleWalletObject({
        walletObjectId,
        customerName: String(customer.name || "Cliente"),
        visits: loyalty.visits,
        progress: loyalty.progress,
        rewardsAvailable: loyalty.rewardsAvailable,
        qrValue: storedQrToken
      });

      if (createRequested && walletObject === null) {
        try {
          walletObject = await createGoogleWalletObject(
            walletClient,
            desiredWalletObject
          );

          walletCreated = true;
        } catch (error) {
          // Si otra solicitud creó la tarjeta al mismo tiempo,
          // recuperar la tarjeta existente en vez de duplicarla.
          if (error.response?.status !== 409) {
            throw error;
          }

          walletObject = await getGoogleWalletObject(
            walletClient,
            walletObjectId
          );

          if (!walletObject) {
            throw error;
          }
        }
      }

      if (
        updateRequested &&
        walletObject !== null &&
        walletNeedsUpdate(walletObject, desiredWalletObject)
      ) {
        walletObject = await updateGoogleWalletObject(
          walletClient,
          walletObjectId,
          desiredWalletObject
        );

        walletUpdated = true;
      }
    }

    return respond(200, {
      ok: true,
      customerId: customerSnapshot.id,
      walletObjectId,
      walletExists: walletObject !== null,
      walletCreated,
      walletUpdated,
      walletQrExists,
      visits: loyalty.visits,
      progress: loyalty.progress,
      rewardsAvailable: loyalty.rewardsAvailable
    });
  } catch (error) {
    console.error(
      "Error en sincronización de Google Wallet:",
      error.message
    );

    return respond(500, {
      error: "No se pudo sincronizar Google Wallet."
    });
  }
};
