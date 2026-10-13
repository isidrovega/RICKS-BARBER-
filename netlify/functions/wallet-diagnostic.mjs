
import { GoogleAuth } from "google-auth-library";
import { timingSafeEqual } from "node:crypto";

const CLASS_ID = `${ISSUER_ID}.3388000000023214898.ricks_barber_loyalty`;

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

  if (
    !validToken(
      request.headers.get("x-wallet-test-token"),
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
        error: "Credenciales inválidas."
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
        error: "No se obtuvo autorización de Google."
      });
    }

    const baseUrl =
      "https://walletobjects.googleapis.com/walletobjects/v1";

    const endpoints = [
      {
        name: "class",
        url: `${baseUrl}/loyaltyClass/${encodeURIComponent(CLASS_ID)}`
      },
      {
        name: "classes",
        url: `${baseUrl}/loyaltyClass?issuerId=${ISSUER_ID}&maxResults=100`
      }
    ];

    const results = {};

    for (const endpoint of endpoints) {
      const response = await fetch(endpoint.url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          Accept: "application/json"
        }
      });

      const data = await response.json();

      if (endpoint.name === "class") {
        results.class = {
          status: response.status,
          id: data.id || null,
          reviewStatus: data.reviewStatus || null,
          error: data.error?.message || null
        };
      } else {
        results.classes = {
          status: response.status,
          ids: Array.isArray(data.resources)
            ? data.resources.map(item => item.id)
            : [],
          nextPageTokenPresent: Boolean(data.pagination?.nextPageToken),
          error: data.error?.message || null
        };
      }
    }

    return respond(200, {
      ok: true,
      issuerId: ISSUER_ID,
      results
    });
  } catch {
    return respond(500, {
      ok: false,
      error: "No se pudo completar el diagnóstico."
    });
  }
}
