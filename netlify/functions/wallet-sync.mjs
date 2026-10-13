
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { getWalletObjectId } from "./wallet-id.mjs";
import { GoogleAuth } from "google-auth-library";

import { randomBytes } from "node:crypto";


const GOOGLE_WALLET_SCOPE =
  "https://www.googleapis.com/auth/wallet_object.issuer";

async function getGoogleWalletClient(credentials) {
  const auth = new GoogleAuth({
    credentials,
    scopes: [GOOGLE_WALLET_SCOPE]
  });

  return auth.getClient();
}


const GOOGLE_WALLET_API_URL =
  "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject";


async function getGoogleWalletObject(client, walletObjectId) {
  const url = `${GOOGLE_WALLET_API_URL}/${encodeURIComponent(walletObjectId)}`;

  try {
    const response = await client.request({
      url,
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



const GOOGLE_WALLET_CLASS_ID =
  "3388000000023214898.3388000000023214898.ricks_barber_loyalty";


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


function generateWalletQrToken() {
  return randomBytes(32).toString("hex");
}

async function getOrCreateWalletQrToken(db, walletTokenRef) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(walletTokenRef);

    if (snapshot.exists) {
      const token = snapshot.data()?.token;

      if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
        throw new Error("El código QR guardado no es válido.");
      }

      return token;
    }

    const token = generateWalletQrToken();

    transaction.create(walletTokenRef, {
      token,
      createdAt: new Date().toISOString()
    });

    return token;
  });
}








function respond(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  };
}

function getFirebaseApp() {
  const credentials = JSON.parse(
    process.env.GOOGLE_WALLET_CREDENTIALS || "{}"
  );

  if (
    credentials.project_id !== "ricks-barber-shop" ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error("Credenciales del servidor no configuradas");
  }

  if (getApps().length > 0) {
    return getApps()[0];
  }

  return initializeApp({
    credential: cert(credentials),
    projectId: "ricks-barber-shop"
  });
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return respond(405, {
      error: "Método no permitido"
    });
  }

  const authorization =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const match = authorization.match(/^Bearer (.+)$/i);

  if (!match) {
    return respond(401, {
      error: "Se requiere iniciar sesión"
    });
  }

  let decodedToken;

  try {
    const app = getFirebaseApp();

    decodedToken = await getAuth(app).verifyIdToken(
      match[1],
      true
    );
  } catch (error) {
    console.error("Error de autenticación:", error.message);

    return respond(401, {
      error: "Sesión no válida"
    });
  }

  try {
    const db = getFirestore(getFirebaseApp());

    // Comprobar los permisos en el servidor.
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
        error: "No tienes permisos de administrador"
      });
    }

    const body = JSON.parse(event.body || "{}");
    const customerId = body.customerId;

    if (
      typeof customerId !== "string" ||
      !customerId.trim() ||
      customerId.length > 150 ||
      customerId.includes("/")
    ) {
      return respond(400, {
        error: "Identificador de cliente no válido"
      });
    }

    const customerSnapshot = await db
      .collection("customers")
      .doc(customerId)
      .get();

    if (!customerSnapshot.exists) {
      return respond(404, {
        error: "Cliente no encontrado"
      });
    }

    const customer = customerSnapshot.data();

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


    const walletObjectId = getWalletObjectId(customerSnapshot.id);

    const walletTokenRef = db
      .collection("walletTokens")
      .doc(walletObjectId);


    const walletTokenSnapshot = await walletTokenRef.get();

    const walletQrExists = walletTokenSnapshot.exists;


const walletQrToken = body.walletQrToken ?? null;

if (walletQrToken !== null) {
  if (
    typeof walletQrToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(walletQrToken)
  ) {
    return respond(400, {
      error: "Código QR no válido."
    });
  }

  if (
    !walletTokenSnapshot.exists ||
    walletTokenSnapshot.data()?.token !== walletQrToken
  ) {
    return respond(403, {
      error: "El código QR no corresponde a este cliente."
    });
  }
}




    const credentials = JSON.parse(
      process.env.GOOGLE_WALLET_CREDENTIALS || "{}"
    );

    const walletClient = await getGoogleWalletClient(credentials);
    const walletObject = await getGoogleWalletObject(
      walletClient,
      walletObjectId
    );



    
    return respond(200, {
      ok: true,
      customerId: customerSnapshot.id,
      walletObjectId,
      walletExists: walletObject !== null,
      walletQrExists,
      visits,
      progress,
      rewardsAvailable,
      walletUpdated: false
    });

  } catch (error) {
    console.error("Error consultando Firebase:", error.message);

    return respond(500, {
      error: "No se pudo consultar Firebase"
    });
  }
};

