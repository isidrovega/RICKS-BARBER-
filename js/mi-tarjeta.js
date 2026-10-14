
const form = document.getElementById("walletForm");
const submitButton = document.getElementById("submitButton");
const message = document.getElementById("message");
const walletResult = document.getElementById("walletResult");
const googleWalletLink = document.getElementById(
  "googleWalletLink"
);

const ENDPOINT = "/.netlify/functions/wallet-public";

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError
    ? "message error"
    : "message success";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document
    .getElementById("customerName")
    .value
    .trim();

  const phone = normalizePhone(
    document.getElementById("customerPhone").value
  );

  walletResult.classList.add("hidden");
  googleWalletLink.removeAttribute("href");

  if (name.length < 2 || name.length > 100) {
    showMessage("Escribe tu nombre completo.", true);
    return;
  }

  if (phone.length < 10 || phone.length > 13) {
    showMessage(
      "Introduce un número de teléfono válido.",
      true
    );
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Preparando tarjeta...";
  showMessage("Estamos preparando tu tarjeta.");

  try {
    const response = await fetch(ENDPOINT, {
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

    googleWalletLink.href = data.saveUrl;
    walletResult.classList.remove("hidden");

    showMessage(
      "¡Tu tarjeta está lista! Presiona el botón para guardarla."
    );
  } catch (error) {
    showMessage(
      error.message || "Ocurrió un error. Intenta de nuevo.",
      true
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Obtener mi tarjeta";
  }
});

