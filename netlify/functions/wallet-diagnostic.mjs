
import { GoogleAuth } from "google-auth-library";
import { timingSafeEqual } from "node:crypto";

const CLASS_ID =
  "3388000000023214898.ricks_barber_loyalty";

function respond(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function validToken(provided, expected) {
  if (
    typeof provided !== "string" ||
    typeof expected !== "string" ||
    !provided ||
    !expected
  ) {
    return false;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return respond(405, {
      error: "Método no permitido."
    });
  }

  const providedToken = request.headers.get(
    "x-wallet-test-token"
  );

  if (
    !validToken(
      providedToken,
      process.env.WALLET_TEST_TOKEN
    )
  ) {
    return respond(401, {
      error: "No autorizado."
    });
  }

  try {
    const credentials = JSON.parse(
      process.env.GOOGLE_WALLET_CREDENTIALS || "{}"
    );

    if (
      credentials.type !== "service_account" ||
      credentials.project_id !== "ricks-barber-shop" ||
      !credentials.client_email ||
      !credentials.private_key
    ) {
      return respond(500, {
        error: "Credenciales no configuradas correctamente."
      });
    }

    const auth = new GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/wallet_object.issuer"
      ]
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      return respond(502, {
        error: "Google no entregó un token de acceso."
      });
    }

    const url =
      "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/" +
      encodeURIComponent(CLASS_ID);

    const googleResponse = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        Accept: "application/json"
      }
    });

    const result = await googleResponse.json();

    if (!googleResponse.ok) {
      return respond(200, {
        ok: false,
        googleStatus: googleResponse.status,
        googleError:
          result.error?.status || "UNKNOWN",
        message:
          result.error?.message ||
          "Google Wallet devolvió un error."
      });
    }

    return respond(200, {
      ok: true,
      googleStatus: googleResponse.status,
      classId: result.id,
      reviewStatus: result.reviewStatus || "NO_DISPONIBLE",
      issuerName: result.issuerName || "NO_DISPONIBLE"
    });
  } catch {
    return respond(500, {
      ok: false,
      error: "No se pudo completar el diagnóstico."
    });
  }
}
