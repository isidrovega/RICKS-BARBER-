import {
  initializeApp,
  cert,
  getApps
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "ricks-barber-shop";

export function getAppleWalletFirestore() {
  const credentials = JSON.parse(
    process.env.GOOGLE_WALLET_CREDENTIALS || "{}"
  );

  if (
    credentials.type !== "service_account" ||
    credentials.project_id !== PROJECT_ID ||
    !credentials.client_email ||
    !credentials.private_key
  ) {
    throw new Error(
      "Las credenciales de Firebase no están configuradas correctamente."
    );
  }

  const app = getApps().find(
    existing => existing.name === "[DEFAULT]"
  ) || initializeApp({
    credential: cert(credentials),
    projectId: PROJECT_ID
  });

  return getFirestore(app);
}
