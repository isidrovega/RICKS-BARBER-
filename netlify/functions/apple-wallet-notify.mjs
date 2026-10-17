import { getAuth } from "firebase-admin/auth";
import { getAppleWalletFirestore } from "../lib/apple-wallet-firebase.mjs";
import { getWalletObjectId } from "./wallet-id.mjs";
import { sendAppleWalletPush } from "../lib/apple-wallet-push.mjs";

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

export const handler = async event => {
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Método no permitido." });
  }

  try {
    const authorization =
      event.headers?.authorization ||
      event.headers?.Authorization ||
      "";

    const match = /^Bearer (.+)$/i.exec(authorization);

    if (!match) {
      return respond(401, { error: "No autorizado." });
    }

    const db = getAppleWalletFirestore();

    const decoded = await getAuth()
      .verifyIdToken(match[1], true);

    const adminSnapshot = await db
      .collection("admins")
      .doc(decoded.uid)
      .get();

    if (
      !adminSnapshot.exists ||
      adminSnapshot.data()?.active !== true ||
      adminSnapshot.data()?.role !== "admin"
    ) {
      return respond(403, { error: "Permisos insuficientes." });
    }

    if (
      typeof event.body !== "string" ||
      event.body.length > 2048
    ) {
      return respond(400, { error: "Solicitud no válida." });
    }

    let body;

    try {
      body = JSON.parse(event.body);
    } catch {
      return respond(400, { error: "JSON no válido." });
    }

    const customerId = body?.customerId;

    if (
      typeof customerId !== "string" ||
      !customerId.trim() ||
      customerId.length > 150 ||
      customerId.includes("/")
    ) {
      return respond(400, { error: "Cliente no válido." });
    }

    const customer = await db
      .collection("customers")
      .doc(customerId.trim())
      .get();

    if (!customer.exists) {
      return respond(404, { error: "Cliente no encontrado." });
    }

    const serialNumber = getWalletObjectId(customer.id);

    const registrations = await db
      .collection("applePassRegistrations")
      .where("serialNumber", "==", serialNumber)
      .get();

    const pushTokens = [
      ...new Set(
        registrations.docs
          .map(doc => doc.data().pushToken)
          .filter(token => typeof token === "string")
      )
    ];

    const results = await Promise.allSettled(
      pushTokens.map(token => sendAppleWalletPush(event, token))
    );

    const delivered = results.filter(
      result => result.status === "fulfilled"
    ).length;

    for (const result of results) {
      if (result.status === "rejected") {
        console.error(
          "Error de notificación Apple Wallet:",
          result.reason?.message || "Error desconocido"
        );
      }
    }

    return respond(200, {
      ok: true,
      registeredDevices: pushTokens.length,
      notificationsAccepted: delivered,
      notificationsFailed: pushTokens.length - delivered
    });
  } catch (error) {
    console.error(
      "Error en Apple Wallet Notify:",
      error.message
    );

    return respond(500, {
      error: "No se pudo enviar la notificación de Apple Wallet."
    });
  }
};
