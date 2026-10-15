pass.primaryFields.splice(0, pass.primaryFields.length, {
  key: "visits",
  label: "VISITAS ACUMULADAS",
  value: loyalty.visits
});

pass.secondaryFields.splice(0, pass.secondaryFields.length, {
  key: "progress",
  label: "PRÓXIMO CORTE GRATIS",
  value: `${loyalty.progress} de 5 visitas`
});

pass.auxiliaryFields.splice(0, pass.auxiliaryFields.length, {
  key: "rewardsAvailable",
  label: "CORTES GRATIS DISPONIBLES",
  value: loyalty.rewardsAvailable
});
import { PKPass } from "passkit-generator";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import path from "node:path";

import { getWalletObjectId } from "./wallet-id.mjs";
import { loadAppleCertificates } from "../lib/apple-wallet-certificates.mjs";

const PROJECT_ID = "ricks-barber-shop";
const QR_PATTERN = /^[a-f0-9]{64}$/;

function respond(statusCode, message) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
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
    throw new Error("Credenciales de Firebase no configuradas.");
  }

  const existing = getApps().find(
    app => app.name === "[DEFAULT]"
  );

  return existing || initializeApp({
    credential: cert(credentials),
    projectId: PROJECT_ID
  });
}

function getLoyalty(data) {
  const visits = Math.max(
    0,
    Math.floor(Number(data.visits) || 0)
  );

  const redeemed = Math.max(
    0,
    Math.floor(Number(data.rewardsRedeemed) || 0)
  );

  const rewardsAvailable = Math.max(
    0,
    Math.floor(visits / 5) - redeemed
  );

  let progress = visits % 5;

  if (rewardsAvailable > 0 && progress === 0) {
    progress = 5;
  }

  return { visits, progress, rewardsAvailable };
}

export const handler = async event => {
  if (event.httpMethod !== "POST") {
    return respond(405, "Método no permitido.");
  }

  const authorization =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const match = authorization.match(/^Bearer (.+)$/i);

  if (!match) {
    return respond(
      401,
      "Debes iniciar sesión como administrador."
    );
  }

  try {
    const app = getFirebaseApp();

    const decodedToken = await getAuth(app)
      .verifyIdToken(match[1], true);

    const db = getFirestore(app);

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
      return respond(
        403,
        "No tienes permisos de administrador."
      );
    }

    let body;

    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return respond(400, "JSON no válido.");
    }

    const customerId = body?.customerId;

    if (
      typeof customerId !== "string" ||
      !customerId.trim() ||
      customerId.length > 150 ||
      customerId.includes("/")
    ) {
      return respond(
        400,
        "Identificador de cliente no válido."
      );
    }

    const id = customerId.trim();

    const customerSnapshot = await db
      .collection("customers")
      .doc(id)
      .get();

    if (!customerSnapshot.exists) {
      return respond(404, "Cliente no encontrado.");
    }

    const customer = customerSnapshot.data();
    const walletObjectId = getWalletObjectId(id);

    const tokenSnapshot = await db
      .collection("walletTokens")
      .doc(walletObjectId)
      .get();

    const qrToken = tokenSnapshot.data()?.token;

    if (!QR_PATTERN.test(String(qrToken || ""))) {
      return respond(
        404,
        "Este cliente todavía no tiene un código QR de Wallet."
      );
    }

    const certificates = await loadAppleCertificates(event);

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
        description: "Tarjeta de lealtad Rick's Barber Shop"
      }
    );

    pass.primaryFields.push({
      key: "totalVisits",
      label: "VISITAS ACUMULADAS",
      value: loyalty.visits
    });

    pass.secondaryFields.push({
      key: "rewardStatus",
      label: "RECOMPENSAS DISPONIBLES",
      value: loyalty.rewardsAvailable
    });

    pass.auxiliaryFields.push({
      key: "nextReward",
      label: "PROGRESO",
      value: `${loyalty.progress} de 5 visitas`
    });

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
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition":
          'attachment; filename="ricks-barber-shop.pkpass"',
        "Cache-Control": "no-store",
        "Content-Length": String(buffer.length)
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true
    };
  } catch (error) {
    console.error(
      "Error al generar Apple Wallet:",
      error.message
    );

    return respond(
      500,
      "No fue posible generar la tarjeta de Apple Wallet."
    );
  }
};

