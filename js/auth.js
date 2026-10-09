
import { auth, db } from "./firebase.js";

import {
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

/* =====================================================
   VERIFY ADMIN
===================================================== */

export async function verifyAdmin(user) {
    if (!user) {
        return false;
    }

    const adminRef = doc(
        db,
        "admins",
        user.uid
    );

    const snapshot = await getDoc(adminRef);

    if (!snapshot.exists()) {
        console.warn(
            "No existe un documento admins para el UID:",
            user.uid
        );

        return false;
    }

    const data = snapshot.data();

    return (
        data.active === true &&
        data.role === "admin"
    );
}

/* =====================================================
   LOGIN
===================================================== */

export async function loginAdmin(email, password) {
    const cleanEmail = String(email || "").trim();

    if (!cleanEmail || !password) {
        throw new Error("Ingresa tu correo y contraseña.");
    }

    const credential = await signInWithEmailAndPassword(
        auth,
        cleanEmail,
        password
    );

    try {
        const authorized = await verifyAdmin(
            credential.user
        );

        if (!authorized) {
            await signOut(auth);

            throw new Error(
                "Tu cuenta existe, pero no está autorizada como administrador."
            );
        }

        return credential.user;
    } catch (error) {
        await signOut(auth);
        throw error;
    }
}

/* =====================================================
   LOGOUT
===================================================== */

export async function logoutAdmin() {
    await signOut(auth);
    window.location.replace("login.html");
}

/* =====================================================
   PROTECT ADMIN PAGE
===================================================== */

export async function requireAdmin() {
    try {
        await auth.authStateReady();

        const user = auth.currentUser;

        if (!user) {
            window.location.replace("login.html");
            return null;
        }

        const authorized = await verifyAdmin(user);

        if (!authorized) {
            await signOut(auth);
            window.location.replace("login.html");
            return null;
        }

        return user;
    } catch (error) {
        console.error(
            "Error verificando acceso administrativo:",
            error
        );

        window.location.replace("login.html");
        return null;
    }
}
