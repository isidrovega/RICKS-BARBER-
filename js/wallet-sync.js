
import { auth } from "./firebase.js";

const WALLET_ENDPOINT = "/.netlify/functions/wallet-sync";

/**
 * Envía una solicitud autenticada al servidor de Netlify.
 * El servidor verifica que el usuario sea administrador.
 */
async function requestWallet(customerId, options = {}) {
    if (
        typeof customerId !== "string" ||
        !customerId.trim()
    ) {
        throw new Error("ID de cliente no válido.");
    }

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user) {
        throw new Error("Debes iniciar sesión como administrador.");
    }

    const firebaseToken = await user.getIdToken();

    const response = await fetch(WALLET_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${firebaseToken}`
        },
        body: JSON.stringify({
            customerId: customerId.trim(),
            ...options
        })
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error(
            "El servidor devolvió una respuesta no válida."
        );
    }

    if (!response.ok) {
        throw new Error(
            result.error ||
            `Error de Google Wallet (${response.status}).`
        );
    }

    return result;
}

/**
 * Consulta los datos de fidelidad de un cliente.
 *
 * No crea ni actualiza tarjetas.
 *
 * Se conserva el segundo parámetro para mantener
 * compatibilidad con las pruebas anteriores.
 */
export async function syncCustomerWallet(
    customerId,
    walletQrToken = null
) {
    const options = {};

    if (walletQrToken !== null) {
        options.walletQrToken = walletQrToken;
    }

    return requestWallet(customerId, options);
}

/**
 * Actualiza una tarjeta existente de Google Wallet
 * con las visitas y recompensas actuales de Firestore.
 *
 * Si el cliente todavía no tiene tarjeta, no crea ninguna.
 * Tampoco modifica los datos del cliente en Firestore.
 */
export async function updateCustomerWallet(customerId) {
    return requestWallet(customerId, {
        updateWallet: true
    });
}

/**
 * Crea una tarjeta personalizada si todavía no existe.
 *
 * Requiere que el cliente tenga un QR permanente
 * registrado previamente en Firestore.
 *
 * No modifica visitas ni recompensas.
 */
export async function createCustomerWallet(customerId) {
    return requestWallet(customerId, {
        createWallet: true
    });
}
