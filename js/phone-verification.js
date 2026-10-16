
import { auth } from "./firebase.js";

import {
  RecaptchaVerifier,
  signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

let recaptchaVerifier = null;
let confirmationResult = null;
let pendingPhone = "";
let requestId = 0;

async function clearRecaptcha() {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (error) {
      console.warn("No se pudo limpiar reCAPTCHA:", error);
    }

    recaptchaVerifier = null;
  }

  const container = document.getElementById(
    "recaptcha-container"
  );

  if (container) {
    container.replaceChildren();
  }
}

export async function sendPhoneVerificationCode(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (!/^\d{10}$/.test(digits)) {
    throw new Error(
      "Introduce un número mexicano de 10 dígitos."
    );
  }

  const currentRequest = ++requestId;

  confirmationResult = null;
  pendingPhone = "";

  await clearRecaptcha();

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "recaptcha-container",
    {
      size: "normal"
    }
  );

  try {
    await recaptchaVerifier.render();

    const result = await signInWithPhoneNumber(
      auth,
      `+52${digits}`,
      recaptchaVerifier
    );

    if (currentRequest !== requestId) {
      throw new Error(
        "La solicitud de verificación cambió."
      );
    }

    confirmationResult = result;
    pendingPhone = digits;

    return true;
  } catch (error) {
    confirmationResult = null;
    pendingPhone = "";

    await clearRecaptcha();

    throw error;
  }
}

export async function verifyPhoneCode(code) {
  if (!confirmationResult || !pendingPhone) {
    throw new Error(
      "Primero solicita tu código SMS."
    );
  }

  const verificationCode = String(code || "").trim();

  if (!/^\d{6}$/.test(verificationCode)) {
    throw new Error(
      "Introduce el código de 6 dígitos."
    );
  }

  const expectedPhone = pendingPhone;
  const currentRequest = requestId;
  const result = await confirmationResult.confirm(
    verificationCode
  );

  confirmationResult = null;
  pendingPhone = "";

  if (currentRequest !== requestId) {
    throw new Error(
      "La solicitud de verificación cambió."
    );
  }

  const actualPhone = String(
    result.user.phoneNumber || ""
  );

  if (actualPhone !== `+52${expectedPhone}`) {
    throw new Error(
      "El teléfono verificado no coincide."
    );
  }

  return result.user.getIdToken();
}
