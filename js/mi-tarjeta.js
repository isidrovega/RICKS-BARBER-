
const form = document.getElementById("walletForm");
const submitButton = document.getElementById("submitButton");
const message = document.getElementById("message");
const walletResult = document.getElementById("walletResult");

const googleWalletLink = document.getElementById("googleWalletLink");
const appleWalletButton = document.getElementById("appleWalletButton");

const customerNameInput = document.getElementById("customerName");
const customerPhoneInput = document.getElementById("customerPhone");

const GOOGLE_ENDPOINT = "/.netlify/functions/wallet-public";
const APPLE_ENDPOINT = "/.netlify/functions/apple-wallet-public";

let appleWalletToken = "";
let requestVersion = 0;

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError
    ? "message error"
    : "message success";
}

function resetWallet() {
  requestVersion += 1;
  appleWalletToken = "";

  walletResult.classList.add("hidden");
  googleWalletLink.removeAttribute("href");
  appleWalletButton.disabled = true;
}

customerNameInput.addEventListener("input", resetWallet);
customerPhoneInput.addEventListener("input", resetWallet);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  resetWallet();

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
      body: JSON.stringify({ name, phone })
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
      !data.saveUrl.startsWith("https://pay.google.com/gp/v/save/")
    ) {
      throw new Error(
        "El servidor no devolvió un enlace válido de Google Wallet."
      );
    }

    if (
      typeof data.appleWalletToken !== "string" ||
      !data.appleWalletToken
    ) {
      throw new Error(
        "El servidor no devolvió el acceso a Apple Wallet."
      );
    }

    googleWalletLink.href = data.saveUrl;
    appleWalletToken = data.appleWalletToken;

    appleWalletButton.disabled = false;
    walletResult.classList.remove("hidden");

    showMessage(
      "¡Tu tarjeta está lista! Elige Google Wallet o Apple Wallet."
    );
  } catch (error) {
    if (version === requestVersion) {
      showMessage(
        error.message || "Ocurrió un error. Intenta de nuevo.",
        true
      );
    }
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Obtener mi tarjeta";
  }
});

appleWalletButton.addEventListener("click", async () => {
  if (!appleWalletToken) {
    showMessage(
      "Primero solicita tu tarjeta.",
      true
    );
    return;
  }

  const version = requestVersion;
  const token = appleWalletToken;

  appleWalletButton.disabled = true;
  appleWalletButton.textContent = "Preparando Apple Wallet...";

  try {
    const response = await fetch(APPLE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      throw new Error(
        data.error || "No pudimos preparar tu tarjeta."
      );
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("La tarjeta descargada está vacía.");
    }

    if (version !== requestVersion) {
      return;
    }

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "ricks-barber-shop.pkpass";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 60000);

    showMessage(
      "¡Tu tarjeta está lista! Abre el archivo descargado para agregarlo a Apple Wallet."
    );
  } catch (error) {
    console.error("Error de Apple Wallet:", error);

    if (version === requestVersion) {
      showMessage(
        error.message || "No fue posible descargar tu tarjeta.",
        true
      );
    }
  } finally {
    appleWalletButton.textContent = "Agregar a Apple Wallet";
    appleWalletButton.disabled = !appleWalletToken;
  }
});

resetWallet();
