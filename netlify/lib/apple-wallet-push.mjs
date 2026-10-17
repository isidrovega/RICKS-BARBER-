import http2 from "node:http2";
import { loadAppleCertificates } from "./apple-wallet-certificates.mjs";

const APNS_HOST = "https://api.push.apple.com";
const PASS_TYPE = "pass.com.ricksbarbershop.loyalty";
const PUSH_TOKEN_PATTERN = /^[a-fA-F0-9]{64,200}$/;

export async function sendAppleWalletPush(event, pushToken) {
  if (
    typeof pushToken !== "string" ||
    !PUSH_TOKEN_PATTERN.test(pushToken)
  ) {
    throw new Error("Token APNs no válido.");
  }

  const certificates = await loadAppleCertificates(event);

  const client = http2.connect(APNS_HOST, {
    cert: certificates.signerCert,
    key: certificates.signerKey,
    timeout: 10000
  });

  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      let responseStatus = 0;
      let responseBody = "";

      const finish = (error, result) => {
        if (settled) return;
        settled = true;

        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };

      client.on("error", error => finish(error));

      client.on("timeout", () => {
        finish(new Error("La conexión con APNs agotó el tiempo de espera."));
        client.destroy();
      });

      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${pushToken}`,
        "apns-topic": PASS_TYPE,
        "apns-push-type": "background",
        "apns-priority": "5"
      });

      request.setEncoding("utf8");
      request.setTimeout(10000, () => {
        request.close(http2.constants.NGHTTP2_CANCEL);
        finish(new Error("APNs no respondió a tiempo."));
      });

      request.on("response", headers => {
        responseStatus = Number(headers[":status"] || 0);
      });

      request.on("data", chunk => {
        if (responseBody.length < 2048) {
          responseBody += chunk;
        }
      });

      request.on("end", () => {
        if (responseStatus === 200) {
          finish(null, { delivered: true });
        } else {
          let reason = "Respuesta desconocida";

          try {
            reason = JSON.parse(responseBody).reason || reason;
          } catch {
            // APNs puede devolver una respuesta sin JSON.
          }

          finish(
            new Error(`APNs rechazó la notificación: ${responseStatus} (${reason}).`)
          );
        }
      });

      request.on("error", error => finish(error));
      request.end("{}");
    });
  } finally {
    client.close();
  }
}
