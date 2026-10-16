
import {
  sendPhoneVerificationCode,
  verifyPhoneCode
} from "./phone-verification.js";

import { auth } from "./firebase.js";

const form = document.getElementById("walletForm");
const submitButton = document.getElementById("submitButton");
const message = document.getElementById("message");
const walletResult = document.getElementById("walletResult");

const googleWalletLink = document.getElementById(
  "googleWalletLink"
);

const appleWalletButton = document.getElementById(
  "appleWalletButton"
);

const phoneVerification = document.getElementById(
  "phoneVerification"
);

const sendVerificationCodeButton = document.getElementById(
  "sendVerificationCodeButton"
);

const verifyPhoneButton = document.getElementById(
  "verifyPhoneButton"
);

const verificationCodeInput = document.getElementById(
  "verificationCode"
);

const customerNameInput = document.getElementById(
  "customerName"
);

const customerPhoneInput = document.getElementById(
  "customerPhone"
);

const GOOGLE_ENDPOINT = "/.netlify/functions/wallet-public";

const APPLE_ENDPOINT =
  "/.netlify/functions/apple-wallet-public";

let registeredPhone = "";
let verifiedFirebaseToken = "";
let requestVersion = 0;
let verificationInProgress = false;

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError
    ? "message error"
    : "message success";
}

function resetVerification() {
  requestVersion += 1;
  registeredPhone = "";
  verifiedFirebaseToken = "";
  verificationCodeInput.value = "";

  appleWalletButton.disabled = true;
  phoneVerification.classList.add("hidden");
  walletResult.classList.add("hidden");

  googleWalletLink.removeAttribute("href");
}

function isCurrentPhone() {
  return (
    registeredPhone !== "" &&
    registeredPhone === normalizePhone(customerPhoneInput.value)
  );
}

function updateAppleButton() {
  appleWalletButton.disabled = !(
    verifiedFirebaseToken &&
    isCurrentPhone() &&
    !verificationInProgress
  );
}

customerNameInput.addEventListener("input", resetVerification);
customerPhoneInput.addEventListener("input", resetVerification);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  resetVerification();

  const version = requestVersion;
  const name = customerNameInput.value.trim();
  const phone = normalizePhone(customerPhoneInput.value);

  if (name.length < 2 || name.length > 100) {
    showMessage("Escribe tu nombre completo.", true);
    return;
  }

  if (phone.length !== 10) {
    showMessage(
      "Introduce un número mexicano de 10 dígitos.",
      true
    );
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Preparando tarjeta...";

  showMessage("Estamos preparando tu tarjeta.");

  try {
    const response = await fetch(GOOGLE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        phone
      })
    });

    const data = await response.json();

    if (version !== requestVersion) {
      return;
    }

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error || "No se pudo preparar tu tarjeta."
      );
    }

    if (
      typeof data.saveUrl !== "string" ||
      !data.saveUrl.startsWith(
        "https://pay.google.com/gp/v/save/"
      )
    ) {
      throw new Error(
        "El servidor no devolvió un enlace válido."
      );
    }

    registeredPhone = phone;

    googleWalletLink.href = data.saveUrl;

    walletResult.classList.remove("hidden");
    phoneVerification.classList.remove("hidden");

    updateAppleButton();

    showMessage(
      "¡Tu tarjeta está lista! Puedes guardarla en Google Wallet o verificar tu teléfono para Apple Wallet."
    );
  } catch (error) {
    if (version !== requestVersion) {
      return;
    }

    showMessage(
      error.message || "Ocurrió un error. Intenta de nuevo.",
      true
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Obtener mi tarjeta";
  }
});

sendVerificationCodeButton.addEventListener(
  "click",
  async () => {
    if (!isCurrentPhone()) {
      showMessage(
        "Primero registra tu nombre y teléfono.",
        true
      );
      return;
    }

    if (verificationInProgress) {
      return;
    }

    const version = requestVersion;

    verificationInProgress = true;
    verifiedFirebaseToken = "";
    updateAppleButton();

    sendVerificationCodeButton.disabled = true;
    sendVerificationCodeButton.textContent =
      "Enviando código...";

    try {
      await sendPhoneVerificationCode(registeredPhone);

      if (version !== requestVersion) {
        return;
      }

      showMessage(
        "Te enviamos un código SMS. Escríbelo para verificar tu número."
      );
    } catch (error) {
      console.error("Error al enviar SMS:", error);

      if (version === requestVersion) {
        showMessage(
          "No pudimos enviar el código. Revisa tu número e inténtalo nuevamente.",
          true
        );
      }
    } finally {
      verificationInProgress = false;
      sendVerificationCodeButton.disabled = false;
      sendVerificationCodeButton.textContent =
        "Enviar código SMS";
      updateAppleButton();
    }
  }
);

verifyPhoneButton.addEventListener("click", async () => {
  if (!isCurrentPhone()) {
    showMessage(
      "El teléfono cambió. Solicita tu tarjeta nuevamente.",
      true
    );
    return;
  }

  if (verificationInProgress) {
    return;
  }

  const code = verificationCodeInput.value.trim();
  const version = requestVersion;

  if (!/^\d{6}$/.test(code)) {
    showMessage(
      "Introduce el código SMS de 6 dígitos.",
      true
    );
    return;
  }

  verificationInProgress = true;

  verifyPhoneButton.disabled = true;
  verifyPhoneButton.textContent = "Verificando...";

  try {
    const token = await verifyPhoneCode(code);

    if (version !== requestVersion || !isCurrentPhone()) {
      return;
    }

    const user = auth.currentUser;

    if (!user || !user.phoneNumber) {
      throw new Error("No se pudo confirmar el teléfono.");
    }

    const verifiedPhone = normalizePhone(
      user.phoneNumber
    );

    if (
      !user.phoneNumber.startsWith("+52") ||
      verifiedPhone.slice(2) !== registeredPhone
    ) {
      throw new Error(
        "El teléfono verificado no coincide con el registrado."
      );
    }

    verifiedFirebaseToken = token;

    phoneVerification.classList.add("hidden");

    showMessage(
      "¡Número verificado! Ya puedes agregar tu tarjeta a Apple Wallet."
    );
  } catch (error) {
    verifiedFirebaseToken = "";

    console.error("Error al verificar SMS:", error);

    if (version === requestVersion) {
      showMessage(
        error.message ||
        "El código no es válido o ha expirado.",
        true
      );
    }
  } finally {
    verificationInProgress = false;
    verifyPhoneButton.disabled = false;
    verifyPhoneButton.textContent =
      "Verificar mi número";

    updateAppleButton();
  }
});

appleWalletButton.addEventListener("click", async () => {
  if (!verifiedFirebaseToken || !isCurrentPhone()) {
    showMessage(
      "Primero verifica tu número de teléfono.",
      true
    );
    return;
  }

  const version = requestVersion;

  appleWalletButton.disabled = true;
  appleWalletButton.textContent =
    "Preparando Apple Wallet...";

  try {
    const user = auth.currentUser;

    if (!user || !user.phoneNumber) {
      throw new Error(
        "La sesión de verificación ya no está disponible."
      );
    }

    const verifiedPhone = normalizePhone(
      user.phoneNumber
    );

    if (
      !user.phoneNumber.startsWith("+52") ||
      verifiedPhone.slice(2) !== registeredPhone
    ) {
      throw new Error(
        "El teléfono verificado no coincide."
      );
    }

    const freshToken = await user.getIdToken();

    const response = await fetch(APPLE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${freshToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const data = await response.json().catch(
        () => ({})
      );

      throw new Error(
        data.error ||
        "No pudimos preparar tu tarjeta de Apple Wallet."
      );
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error(
        "La tarjeta descargada está vacía."
      );
    }

    if (version !== requestVersion || !isCurrentPhone()) {
      return;
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

    showMessage(
      "¡Tu tarjeta está lista! Abre el archivo descargado para agregarlo a Apple Wallet."
    );
  } catch (error) {
    console.error("Error de Apple Wallet:", error);

    if (version === requestVersion) {
      showMessage(
        error.message ||
        "No fue posible descargar tu tarjeta.",
        true
      );
    }
  } finally {
    appleWalletButton.textContent =
      "Agregar a Apple Wallet";

    updateAppleButton();
  }
});

resetVerification();