
import { auth } from "./firebase.js";

/**
 * Consulta de forma segura los datos de fidelidad
 * de un cliente en Firestore mediante Netlify.
 *
 * Por ahora NO modifica tarjetas de Google Wallet.
 */

export async function syncCustomerWallet(customerId, walletQrToken = null) {

    if (
        typeof customerId !== "string" ||
        !customerId.trim()
    ) {
        throw new Error("ID de cliente no válido.");
    }

    await auth.authStateReady();

    if (!auth.currentUser) {
        throw new Error("No hay una sesión activa.");
    }

    const token = await auth.currentUser.getIdToken();

    const response = await fetch(
        "/.netlify/functions/wallet-sync",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
           
body: JSON.stringify({
    customerId: customerId.trim(),
    ...(walletQrToken !== null
        ? { walletQrToken }
        : {})
})

        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error ||
            "No se pudo consultar la tarjeta."
        );
    }

    return result;
}
