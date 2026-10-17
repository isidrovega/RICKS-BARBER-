import { PKPass } from "passkit-generator";
import path from "node:path";

import { getWalletObjectId } from "../functions/wallet-id.mjs";
import { createApplePassToken } from "./apple-wallet-auth.mjs";
import { loadAppleCertificates } from "./apple-wallet-certificates.mjs";

const QR_PATTERN = /^[a-f0-9]{64}$/;

const WEB_SERVICE_URL =
  "https://ricksbarbershop.netlify.app";

function getLoyalty(customer) {
  const visits = Math.max(
    0,
    Math.floor(Number(customer.visits) || 0)
  );

  const redeemed = Math.max(
    0,
    Math.floor(Number(customer.rewardsRedeemed) || 0)
  );

  const rewardsAvailable = Math.max(
    0,
    Math.floor(visits / 5) - redeemed
  );

  let progress = visits % 5;

  if (rewardsAvailable > 0 && progress === 0) {
    progress = 5;
  }

  return { visits, progress, rewardsAvailable };
}

export async function createAppleWalletPass({
  event,
  customerId,
  customer,
  qrToken
}) {
  if (!QR_PATTERN.test(String(qrToken || ""))) {
    throw new Error("Código QR de Wallet no válido.");
  }

  const serialNumber = getWalletObjectId(customerId);

  const certificates = await loadAppleCertificates(event);

  const modelPath = path.join(
    process.env.LAMBDA_TASK_ROOT || process.cwd(),
    "passModels",
    "ricksLoyalty.pass"
  );

  const loyalty = getLoyalty(customer);

  const pass = await PKPass.from(
    {
      model: modelPath,
      certificates
    },
    {
      serialNumber,
      description: "Tarjeta de lealtad Rick's Barber Shop",
      webServiceURL: WEB_SERVICE_URL,
      authenticationToken: createApplePassToken(serialNumber)
    }
  );

  pass.primaryFields[0].value = loyalty.visits;

  pass.secondaryFields[0].value =
    `${loyalty.progress} de 5 visitas`;

  pass.auxiliaryFields.splice(
    0,
    pass.auxiliaryFields.length,
    {
      key: "rewardsAvailable",
      label: "CORTES GRATIS DISPONIBLES",
      value: loyalty.rewardsAvailable
    }
  );

  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: qrToken,
    messageEncoding: "iso-8859-1",
    altText: "Rick's Barber Shop"
  });

  return pass.getAsBuffer();
}
