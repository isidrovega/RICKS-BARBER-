
import { requireAdmin } from "./auth.js";

const user = await requireAdmin();

if (!user) {
    throw new Error("Acceso administrativo no autorizado.");
}
