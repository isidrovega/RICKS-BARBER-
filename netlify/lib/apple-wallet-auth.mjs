
import {
    createHmac,
    timingSafeEqual
} from "node:crypto";

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function getSecret() {
    const secret = String(
        process.env.APPLE_WALLET_UPDATE_SECRET || ""
    ).trim();

    if (!TOKEN_PATTERN.test(secret)) {
        throw new Error(
            "APPLE_WALLET_UPDATE_SECRET no está configurada correctamente."
        );
    }

    return Buffer.from(secret, "hex");
}

export function createApplePassToken(serialNumber) {
    if (
        typeof serialNumber !== "string" ||
        !serialNumber.trim()
    ) {
        throw new Error(
            "Número de serie de Apple Wallet no válido."
        );
    }

    return createHmac("sha256", getSecret())
        .update(`apple-wallet-pass:${serialNumber}`)
        .digest("hex");
}

export function verifyApplePassToken(
    serialNumber,
    suppliedToken
) {
    if (
        typeof suppliedToken !== "string" ||
        !TOKEN_PATTERN.test(suppliedToken)
    ) {
        return false;
    }

    const expectedToken = createApplePassToken(
        serialNumber
    );

    return timingSafeEqual(
        Buffer.from(expectedToken, "hex"),
        Buffer.from(suppliedToken, "hex")
    );
}
