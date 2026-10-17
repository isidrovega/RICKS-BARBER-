import { getWalletObjectId } from "../functions/wallet-id.mjs";

const SERIAL_PATTERN =
  /^3388000000023214898\.ricks_customer_[a-f0-9]{64}$/;

export async function findAppleWalletCustomer(db, serialNumber) {
  if (
    typeof serialNumber !== "string" ||
    !SERIAL_PATTERN.test(serialNumber)
  ) {
    return null;
  }

  const customers = await db.collection("customers").get();

  for (const customer of customers.docs) {
    if (getWalletObjectId(customer.id) === serialNumber) {
      return customer;
    }
  }

  return null;
}
