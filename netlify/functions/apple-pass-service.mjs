import { createHash } from "node:crypto";
import { getAppleWalletFirestore } from "../lib/apple-wallet-firebase.mjs";
import { verifyApplePassToken } from "../lib/apple-wallet-auth.mjs";
import { findAppleWalletCustomer } from "../lib/apple-wallet-customer.mjs";
import { createAppleWalletPass } from "../lib/apple-wallet-pass.mjs";

const PASS_TYPE = "pass.com.ricksbarbershop.loyalty";
const DEVICE_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const SERIAL_PATTERN = /^[A-Za-z0-9._-]{1,256}$/;
const PUSH_PATTERN = /^[a-fA-F0-9]{64,200}$/;

function respond(statusCode, data = null) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };

  if (data === null) {
    return { statusCode, headers, body: "" };
  }

  return {
    statusCode,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(data)
  };
}

function getPath(event) {
  const path = event.path || "";

  if (path.startsWith("/.netlify/functions/apple-pass-service/")) {
    return "/v1/" + path.split("/apple-pass-service/")[1];
  }

  return path;
}

function isAuthorized(event, serialNumber) {
  const authorization =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const match = /^ApplePass ([a-f0-9]{64})$/.exec(authorization);

  return Boolean(
    match && verifyApplePassToken(serialNumber, match[1])
  );
}

export const handler = async event => {
  try {
    const pathname = getPath(event);

    const registration = /^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)\/([^/]+)$/
      .exec(pathname);

    if (!registration) {
      const download = /^\/v1\/passes\/([^/]+)\/([^/]+)$/
        .exec(pathname);

      if (download) {
        const [, passType, serialNumber] = download;

        if (
          event.httpMethod !== "GET" ||
          passType !== PASS_TYPE ||
          !SERIAL_PATTERN.test(serialNumber)
        ) {
          return respond(404, { error: "Tarjeta no encontrada." });
        }

        if (!isAuthorized(event, serialNumber)) {
          return respond(401, { error: "No autorizado." });
        }

        const db = getAppleWalletFirestore();

        const customer = await findAppleWalletCustomer(
          db,
          serialNumber
        );

        if (!customer) {
          return respond(404, { error: "Tarjeta no encontrada." });
        }

        const tokenSnapshot = await db
          .collection("walletTokens")
          .doc(serialNumber)
          .get();

        const qrToken = tokenSnapshot.data()?.token;

        if (!/^[a-f0-9]{64}$/.test(String(qrToken || ""))) {
          return respond(404, { error: "Código QR no encontrado." });
        }

        const buffer = await createAppleWalletPass({
          event,
          customerId: customer.id,
          customer: customer.data(),
          qrToken
        });

        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/vnd.apple.pkpass",
            "Cache-Control": "no-store",
            "Content-Length": String(buffer.length)
          },
          body: buffer.toString("base64"),
          isBase64Encoded: true
        };
      }

      const updates = /^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)$/
        .exec(pathname);

      if (
        !updates ||
        event.httpMethod !== "GET" ||
        !DEVICE_PATTERN.test(updates[1]) ||
        updates[2] !== PASS_TYPE
      ) {
        return respond(404, { error: "Ruta no encontrada." });
      }

      const [, deviceId, passType] = updates;
      const db = getAppleWalletFirestore();

      const registrations = await db
        .collection("applePassRegistrations")
        .where("deviceLibraryIdentifier", "==", deviceId)
        .get();

      const registered = registrations.docs.filter(
        doc => doc.data().passTypeIdentifier === passType
      );

      if (registered.length === 0) {
        return respond(204);
      }

      const query = new URLSearchParams(
        event.queryStringParameters || {}
      );

      const since = query.get("passesUpdatedSince") || "";
      const sinceTime = since ? Date.parse(since) : NaN;

      if (since && !Number.isFinite(sinceTime)) {
        return respond(400, { error: "Fecha de actualización no válida." });
      }

      const serialNumbers = [];
      let newestTime = Number.isFinite(sinceTime) ? sinceTime : 0;

      for (const registrationDoc of registered) {
        const serial = registrationDoc.data().serialNumber;

        const customer = await findAppleWalletCustomer(db, serial);

        if (!customer) {
          continue;
        }

        const updatedAt = Date.parse(
          String(customer.data().updatedAt || "")
        );

        const customerTime = Number.isFinite(updatedAt)
          ? updatedAt
          : 0;

        if (
          !since ||
          !Number.isFinite(updatedAt) ||
          customerTime > sinceTime
        ) {
          serialNumbers.push(serial);
        }

        newestTime = Math.max(newestTime, customerTime);
      }

      if (serialNumbers.length === 0) {
        return respond(204);
      }

      return respond(200, {
        serialNumbers: [...new Set(serialNumbers)],
        lastUpdated: new Date(newestTime || Date.now()).toISOString()
      });
    }

    const [, deviceId, passType, serialNumber] = registration;

    if (
      passType !== PASS_TYPE ||
      !DEVICE_PATTERN.test(deviceId) ||
      !SERIAL_PATTERN.test(serialNumber)
    ) {
      return respond(404, { error: "Tarjeta no encontrada." });
    }

    if (!isAuthorized(event, serialNumber)) {
      return respond(401, { error: "No autorizado." });
    }

    const db = getAppleWalletFirestore();

    const customer = await findAppleWalletCustomer(
      db,
      serialNumber
    );

    if (!customer) {
      return respond(404, { error: "Tarjeta no encontrada." });
    }

    const walletToken = await db
      .collection("walletTokens")
      .doc(serialNumber)
      .get();

    if (!/^[a-f0-9]{64}$/.test(String(walletToken.data()?.token || ""))) {
      return respond(404, { error: "Tarjeta no encontrada." });
    }

    const documentId = createHash("sha256")
      .update(`${deviceId}:${passType}:${serialNumber}`)
      .digest("hex");

    const registrationRef = db
      .collection("applePassRegistrations")
      .doc(documentId);

    if (event.httpMethod === "POST") {
      if (
        typeof event.body !== "string" ||
        event.body.length > 4096
      ) {
        return respond(400, { error: "Solicitud no válida." });
      }

      let body;

      try {
        body = JSON.parse(event.body);
      } catch {
        return respond(400, { error: "JSON no válido." });
      }

      if (!PUSH_PATTERN.test(String(body?.pushToken || ""))) {
        return respond(400, { error: "Token de notificación no válido." });
      }

      const existing = await registrationRef.get();

      await registrationRef.set({
        deviceLibraryIdentifier: deviceId,
        passTypeIdentifier: passType,
        serialNumber,
        pushToken: body.pushToken,
        updatedAt: new Date().toISOString(),
        ...(existing.exists
          ? {}
          : { createdAt: new Date().toISOString() })
      }, { merge: true });

      return respond(existing.exists ? 200 : 201);
    }

    if (event.httpMethod === "DELETE") {
      await registrationRef.delete();
      return respond(200);
    }

    return respond(405, { error: "Método no permitido." });
  } catch (error) {
    console.error("Error en servicio Apple Wallet:", error.message);

    return respond(500, {
      error: "No se pudo procesar la solicitud de Apple Wallet."
    });
  }
};
