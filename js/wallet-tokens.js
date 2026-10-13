
import { db, auth } from "./firebase.js";

import { verifyAdmin } from "./auth.js";



import {
  doc,
  getDoc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";



export async function requireWalletAdminSession() {
  await auth.authStateReady();

  if (!auth.currentUser) {
    throw new Error("Debes iniciar sesión como administrador.");
  }

  
  const isAdmin = await verifyAdmin(auth.currentUser);

  if (!isAdmin) {
    throw new Error("No tienes permisos de administrador.");
  }

  return auth.currentUser;

}


export function getWalletTokenReference(walletObjectId) {
  if (
    typeof walletObjectId !== "string" ||
    !/^3388000000023214898\.ricks_customer_[a-f0-9]{64}$/.test(walletObjectId)
  ) {
    throw new Error("Identificador de Google Wallet no válido.");
  }

  return doc(db, "walletTokens", walletObjectId);
}


export async function getExistingWalletToken(walletObjectId) {
  await requireWalletAdminSession();

  const tokenRef = getWalletTokenReference(walletObjectId);
  const snapshot = await getDoc(tokenRef);

  if (!snapshot.exists()) {
    return null;
  }

  const token = snapshot.data()?.token;

  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token)
  ) {
    throw new Error("El código QR guardado no es válido.");
  }

  return token;
}


function generateSecureWalletToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function getOrCreateWalletToken(walletObjectId) {
  await requireWalletAdminSession();

  const tokenRef = getWalletTokenReference(walletObjectId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(tokenRef);

    if (snapshot.exists()) {
      const token = snapshot.data()?.token;

      if (
        typeof token !== "string" ||
        !/^[a-f0-9]{64}$/.test(token)
      ) {
        throw new Error("El código QR guardado no es válido.");
      }

      return token;
    }

    const token = generateSecureWalletToken();

    transaction.set(tokenRef, {
      token,
      createdAt: new Date().toISOString()
    });

    return token;
  });
}



