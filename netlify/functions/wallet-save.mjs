
import jwt from "jsonwebtoken";

import {
  initializeApp,
  cert,
  getApps
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";

import { getWalletObjectId } from "./wallet-id.mjs";

const PROJECT_ID = "ricks-barber-shop";

const CLASS_ID =
  "3388000000023214898.3388000000023214898.ricks_barber_loyalty";

const GOOGLE_WALLET_SCOPE =
  "https://www.googleapis.com/auth/wallet_object.issuer";

const WALLET_API_URL =
  "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject";

const SITE_ORIGIN =
  "https://ricksbarbershop.netlify.app";

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
    credentials.type !== "service_account" ||
    credentials.project_id !== PROJECT_ID ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error(
      "Las credenciales de Google Wallet no están configuradas."
    );
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

async function walletObjectExists(
  credentials,
  walletObjectId
) {
  const auth = new GoogleAuth({
    credentials,
    scopes: [GOOGLE_WALLET_SCOPE]
  });

  const client = await auth.getClient();

  try {
    const response = await client.request({
      url:
        `${WALLET_API_URL}/` +
        encodeURIComponent(walletObjectId),
      method: "GET"
    });

    return response.data?.id === walletObjectId;
  } catch (error) {
    if (error.response?.status === 404) {
      return false;
    }

    throw error;
  }
}

export const handler = async event => {
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
      error: "Debes iniciar sesión como administrador."
    });
  }

  try {
    const credentials = getCredentials();
    const app = getFirebaseApp(credentials);

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

    const customerSnapshot = await db
      .collection("customers")
      .doc(customerId.trim())
      .get();

    if (!customerSnapshot.exists) {
      return respond(404, {
        error: "Cliente no encontrado."
      });
    }

    const walletObjectId = getWalletObjectId(
      customerSnapshot.id
    );

    const exists = await walletObjectExists(
      credentials,
      walletObjectId
    );

    if (!exists) {
      return respond(409, {
        error:
          "Este cliente todavía no tiene una tarjeta " +
          "de Google Wallet creada."
      });
    }

    // Firmamos una referencia a la tarjeta existente.
    // No generamos un ID nuevo ni modificamos el objeto.
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

    const signedJwt = jwt.sign(
      payload,
      credentials.private_key,
      {
        algorithm: "RS256",
        noTimestamp: true
      }
    );

    return respond(200, {
      ok: true,
      customerId: customerSnapshot.id,
      customerName:
        String(customerSnapshot.data()?.name || "Cliente"),
      walletObjectId,
      saveUrl:
        `https://pay.google.com/gp/v/save/${signedJwt}`
    });
  } catch (error) {
    console.error(
      "Error generando enlace de Google Wallet:",
      error.message
    );

    return respond(500, {
      error:
        "No fue posible generar el enlace de Google Wallet."
    });
  }
};
