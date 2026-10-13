
import jwt from "jsonwebtoken";
import { timingSafeEqual } from "node:crypto";

const ISSUER_ID = "3388000000023214898";
const CLASS_ID = `${ISSUER_ID}.3388000000023214898.ricks_barber_loyalty`;

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function respond(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}

function validToken(provided, expected) {
  if (!provided || !expected) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return respond(405, {
      error: "Método no permitido. Utiliza POST."
    });
  }

  try {
    const expectedToken = process.env.WALLET_TEST_TOKEN;

    if (!expectedToken) {
      return respond(500, {
        error: "Falta configurar WALLET_TEST_TOKEN."
      });
    }

    const providedToken = request.headers.get("x-wallet-test-token");

    if (!validToken(providedToken, expectedToken)) {
      return respond(401, {
        error: "No autorizado."
      });
    }

    const credentialsText =
      process.env.GOOGLE_WALLET_CREDENTIALS;

    if (!credentialsText) {
      return respond(500, {
        error: "Faltan las credenciales de Google Wallet."
      });
    }

    const credentials = JSON.parse(credentialsText);

    if (
      credentials.type !== "service_account" ||
      credentials.project_id !== "ricks-barber-shop" ||
      !credentials.client_email ||
      !credentials.private_key
    ) {
      return respond(500, {
        error: "Configuración de Google Wallet inválida."
      });
    }

    // Cliente completamente ficticio.
    const customer = {
      id: "TEST001",
      name: "Cliente de Prueba",
      visits: 2,
      rewardsRedeemed: 0
    };

    const progress = customer.visits % 5;
    const earned = Math.floor(customer.visits / 5);
    const available = Math.max(
      0,
      earned - customer.rewardsRedeemed
    );

    const loyaltyObject = {
      id: `${ISSUER_ID}.ricks_test_001`,
      classId: CLASS_ID,
      state: "ACTIVE",
      accountId: customer.id,
      accountName: customer.name,
      loyaltyPoints: {
        label: "Visitas acumuladas",
        balance: {
          int: customer.visits
        }
      },
      barcode: {
        type: "QR_CODE",
        value: customer.id,
        alternateText: customer.id
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
          body: String(available)
        }
      ]
    };

    const payload = {
      iss: credentials.client_email,
      aud: "google",
      origins: [
        "https://ricksbarbershop.netlify.app"
      ],
      typ: "savetowallet",
      payload: {
        loyaltyObjects: [loyaltyObject]
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

    const saveUrl =
      `https://pay.google.com/gp/v/save/${signedJwt}`;

    return respond(200, {
      ok: true,
      customer: customer.name,
      visits: customer.visits,
      progress,
      rewardsAvailable: available,
      saveUrl
    });
  } catch {
    return respond(500, {
      ok: false,
      error: "No fue posible generar la tarjeta de prueba."
    });
  }
}
