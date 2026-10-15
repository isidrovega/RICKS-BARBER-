
import { auth } from "./firebase.js";

const APPLE_WALLET_ENDPOINT =
  "/.netlify/functions/apple-wallet";

/**
 * Descarga una tarjeta de Apple Wallet.
 * Requiere una sesión de administrador.
 *
 * No modifica visitas, recompensas ni clientes.
 */
export async function downloadAppleWallet(customerId) {
  if (
    typeof customerId !== "string" ||
    !customerId.trim()
  ) {
    throw new Error("ID de cliente no válido.");
  }

  await auth.authStateReady();

  const user = auth.currentUser;

  if (!user) {
    throw new Error(
      "Debes iniciar sesión como administrador."
    );
  }

  const firebaseToken = await user.getIdToken();

  const response = await fetch(APPLE_WALLET_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firebaseToken}`
    },
    body: JSON.stringify({
      customerId: customerId.trim()
    })
  });

  if (!response.ok) {
    let message = `Error de Apple Wallet (${response.status}).`;

    try {
      const result = await response.json();

      if (result.error) {
        message = result.error;
      }
    } catch {
      // Conservamos el mensaje de error HTTP.
    }

    throw new Error(message);
  }

  const blob = await response.blob();

  if (!blob.size) {
    throw new Error(
      "Apple Wallet devolvió un archivo vacío."
    );
  }

  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");

    link.href = url;
    link.download = "ricks-barber-shop.pkpass";

    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return true;
}

