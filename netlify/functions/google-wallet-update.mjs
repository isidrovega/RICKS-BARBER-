
import { GoogleAuth } from "google-auth-library";
import { timingSafeEqual } from "node:crypto";

const ISSUER_ID = "3388000000023214898";
const OBJECT_ID = `${ISSUER_ID}.ricks_test_001`;

const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  };
}

function validToken(received, expected) {
  if (
    typeof received !== "string" ||
    typeof expected !== "string" ||
    !received ||
    !expected
  ) {
    return false;
  }

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Método no permitido"
    });
  }

  const token =
    event.headers?.["x-wallet-test-token"] ??
    event.headers?.["X-Wallet-Test-Token"];

  if (!validToken(token, process.env.WALLET_TEST_TOKEN)) {
    return jsonResponse(401, {
      error: "No autorizado"
    });
  }

  try {
    const credentials = JSON.parse(
      process.env.GOOGLE_WALLET_CREDENTIALS || "{}"
    );

    if (
      !credentials.client_email ||
      !credentials.private_key
    ) {
      return jsonResponse(500, {
        error: "Credenciales de Google Wallet no configuradas"
      });
    }

    const auth = new GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/wallet_object.issuer"
      ]
    });

    const client = await auth.getClient();

    // Consultar la tarjeta existente antes de modificarla.
    const currentResponse = await client.request({
      url: `${WALLET_API}/loyaltyObject/${encodeURIComponent(OBJECT_ID)}`,
      method: "GET"
    });

    const current = currentResponse.data;

    // Evitar actualizar accidentalmente otra tarjeta.
    if (
      current.id !== OBJECT_ID ||
      current.accountId !== "TEST001"
    ) {
      return jsonResponse(409, {
        error: "La tarjeta encontrada no coincide con TEST001"
      });
    }

    const updatedTextModules = [
      ...(current.textModulesData || []).filter(
        (item) => item.id !== "progress" && item.id !== "rewards"
      ),
      {
        id: "progress",
        header: "Progreso",
        body: "3 de 5 visitas para el próximo corte gratis"
      },
      {
        id: "rewards",
        header: "Cortes gratis disponibles",
        body: "0"
      }
    ];

    // PATCH conserva el mismo ID y modifica solo estos campos.
    const updateResponse = await client.request({
      url: `${WALLET_API}/loyaltyObject/${encodeURIComponent(OBJECT_ID)}`,
      method: "PATCH",
      data: {
        loyaltyPoints: {
          label: "Visitas acumuladas",
          balance: {
            int: 3
          }
        },
        textModulesData: updatedTextModules
      }
    });

    return jsonResponse(200, {
      ok: true,
      message: "Tarjeta de prueba actualizada",
      objectId: updateResponse.data.id,
      visits: 3,
      progress: "3 de 5",
      rewardsAvailable: 0
    });
  } catch (error) {
    const status = error.response?.status;

    console.error("Error al actualizar Google Wallet:", {
      status,
      message: error.message
    });

    return jsonResponse(502, {
      error: "No se pudo actualizar la tarjeta de prueba",
      googleStatus: status || null
    });
  }
};
