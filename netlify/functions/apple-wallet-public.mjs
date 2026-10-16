
import { PKPass } from "passkit-generator";
import {
  initializeApp,
  cert,
  getApps
} from "firebase-admin/app";
import jwt from "jsonwebtoken";
import { getFirestore } from "firebase-admin/firestore";
import path from "node:path";
import { createPublicKey } from "node:crypto";

import { getWalletObjectId } from "./wallet-id.mjs";
import { loadAppleCertificates } from "../lib/apple-wallet-certificates.mjs";

const PROJECT_ID = "ricks-barber-shop";
const QR_PATTERN = /^[a-f0-9]{64}$/;

function respond(statusCode, message) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify({ error: message })
  };
}

function getFirebaseApp() {
  const credentials = JSON.parse(
    process.env.GOOGLE_WALLET_CREDENTIALS || "{}"
  );

  if (
    credentials.type !== "service_account" ||
    credentials.project_id !== PROJECT_ID ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error("Firebase no está configurado.");
  }

  const existing = getApps().find(
    app => app.name === "[DEFAULT]"
  );

  return existing || initializeApp({
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

async function findCustomerByPhone(db, phone) {
  const result = await db
    .collection("customers")
    .where("normalizedPhone", "==", phone)
    .limit(2)
    .get();

  if (result.size > 1) {
    throw new Error("DUPLICATE_PHONE");
  }

  if (!result.empty) {
    return result.docs[0];
  }

  // Compatibilidad con clientes antiguos.
  const all = await db.collection("customers").get();

  const matches = all.docs.filter(snapshot => {
    return normalizePhone(snapshot.data().phone) === phone;
  });

  if (matches.length > 1) {
    throw new Error("DUPLICATE_PHONE");
  }

  return matches[0] || null;
}

export const handler = async event => {
  if (event.httpMethod !== "POST") {
    return respond(405, "Método no permitido.");
  }

  if (
    typeof event.body !== "string" ||
    event.body.length > 4096
  ) {
    return respond(400, "Solicitud no válida.");
  }

  const authorization =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const match = authorization.match(/^Bearer (.+)$/i);

  if (!match) {
    return respond(
      401,
      "Primero verifica tu teléfono mediante SMS."
    );
  }

  try {
    const app = getFirebaseApp();

    const credentials = JSON.parse(
      process.env.GOOGLE_WALLET_CREDENTIALS || "{}"
    );

    let decoded;

    try {
      decoded = jwt.verify(
        match[1],
        createPublicKey(credentials.private_key),
        {
          algorithms: ["RS256"],
          issuer: "ricks-barber-shop",
          audience: "apple-wallet-public"
        }
      );
    } catch {
      return respond(
        401,
        "El acceso a Apple Wallet expiró. Solicita tu tarjeta nuevamente."
      );
    }

    if (
      decoded.purpose !== "apple-wallet-public" ||
      typeof decoded.customerId !== "string" ||
      !decoded.customerId ||
      decoded.customerId.includes("/")
    ) {
      return respond(403, "Acceso no autorizado.");
    }

    const db = getFirestore(app);

    const customerSnapshot = await db
      .collection("customers")
      .doc(decoded.customerId)
      .get();

    if (!customerSnapshot.exists) {
      return respond(404, "No encontramos tu tarjeta.");
    }

    const customer = customerSnapshot.data();
    const walletObjectId = getWalletObjectId(
      customerSnapshot.id
    );

    const tokenSnapshot = await db
      .collection("walletTokens")
      .doc(walletObjectId)
      .get();

    const qrToken = tokenSnapshot.data()?.token;

    if (!QR_PATTERN.test(String(qrToken || ""))) {
      return respond(
        404,
        "Tu tarjeta todavía no tiene un código QR. Solicítala primero."
      );
    }

    const certificates = await loadAppleCertificates(
      event
    );

    const modelPath = path.join(
      process.env.LAMBDA_TASK_ROOT || process.cwd(),
      "passModels",
      "ricksLoyalty.pass"
    );

    const loyalty = getLoyalty(customer);

    const pass = await PKPass.from(
      {
        model: modelPath,
        certificates
      },
      {
        serialNumber: walletObjectId,
        description:
          "Tarjeta de lealtad Rick's Barber Shop"
      }
    );

   
    pass.primaryFields[0] = {
  key: "visits",
  label: "VISITAS ACUMULADAS",
  value: loyalty.visits
};

    pass.secondaryFields[0] = {
  key: "progress",
  label: "PRÓXIMO CORTE GRATIS",
  value: `${loyalty.progress} de 5 visitas`
};

    pass.auxiliaryFields.splice(
      0,
      pass.auxiliaryFields.length,
      {
        key: "rewardsAvailable",
        label: "CORTES GRATIS DISPONIBLES",
        value: loyalty.rewardsAvailable
      }
    );

    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: qrToken,
      messageEncoding: "iso-8859-1",
      altText: "Rick's Barber Shop"
    });

    const buffer = pass.getAsBuffer();

    return {
      statusCode: 200,
      headers: {
        "Content-Type":
          "application/vnd.apple.pkpass",
        "Content-Disposition":
          'attachment; filename="ricks-barber-shop.pkpass"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true
    };
  } catch (error) {
    console.error(
      "Error en Apple Wallet público:",
      error.message
    );

    if (error.message === "DUPLICATE_PHONE") {
      return respond(
        409,
        "Hay varios clientes con este teléfono. Consulta al personal."
      );
    }

    return respond(
      500,
      "No pudimos preparar tu tarjeta de Apple Wallet."
    );
  }
};

