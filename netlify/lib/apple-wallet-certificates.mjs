import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { connectLambda, getStore } from "@netlify/blobs";

export async function loadAppleCertificates(event) {
  connectLambda(event);

  const keyHex = String(
    process.env.APPLE_WALLET_ENCRYPTION_KEY || ""
  ).trim();

  if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error("La clave de cifrado no está configurada correctamente.");
  }

  const encryptedData = await getStore("apple-wallet").get(
    "certificates.enc",
    { type: "arrayBuffer" }
  );

  if (!encryptedData) {
    throw new Error("No se encontraron los certificados en Netlify Blobs.");
  }

  const file = Buffer.from(encryptedData);

  if (
    file.length < 33 ||
    file.subarray(0, 4).toString("utf8") !== "RBS1"
  ) {
    throw new Error("El archivo cifrado tiene un formato incorrecto.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    file.subarray(4, 16)
  );

  decipher.setAuthTag(file.subarray(16, 32));

  const zipBuffer = Buffer.concat([
    decipher.update(file.subarray(32)),
    decipher.final()
  ]);

  const zip = new AdmZip(zipBuffer);

  function readCertificate(filename) {
    const entry = zip.getEntry(filename);

    if (!entry) {
      throw new Error(`Falta el certificado ${filename}.`);
    }

    return entry.getData();
  }

  return {
    signerCert: readCertificate("signerCert.pem"),
    signerKey: readCertificate("signerKey.pem"),
    wwdr: readCertificate("wwdr.pem")
  };
}
