
export default async function handler(request) {
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Método no permitido" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const credentialsText =
      process.env.GOOGLE_WALLET_CREDENTIALS;

    if (!credentialsText) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: "No se encontró la variable de Google Wallet."
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const credentials = JSON.parse(credentialsText);

    if (
      credentials.type !== "service_account" ||
      credentials.project_id !== "ricks-barber-shop" ||
      typeof credentials.client_email !== "string" ||
      !credentials.private_key
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: "Las credenciales no tienen el formato esperado."
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Rick's Barber Shop: credenciales configuradas.",
        project: credentials.project_id
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        message: "No fue posible validar la configuración."
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
