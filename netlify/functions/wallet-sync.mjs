
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

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

    return respond(200, {
      ok: true,
      customerId: customerSnapshot.id,
      visits,
      progress: visits % 5,
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

