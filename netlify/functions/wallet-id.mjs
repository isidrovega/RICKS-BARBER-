
import { createHash } from "node:crypto";

const ISSUER_ID = "3388000000023214898";

/**
 * Genera un identificador estable de Google Wallet
 * a partir del ID de un documento de Firestore.
 *
 * No modifica Firestore ni crea tarjetas.
 */
export function getWalletObjectId(customerId) {
    if (
        typeof customerId !== "string" ||
        !customerId.trim() ||
        customerId.length > 150 ||
        customerId.includes("/")
    ) {
        throw new Error("ID de cliente no válido.");
    }

    const hash = createHash("sha256")
        .update(customerId, "utf8")
        .digest("hex");

    return `${ISSUER_ID}.ricks_customer_${hash}`;
}

