
import { db } from "./firebase.js";
import { getCustomers } from "./storage.js";

import {
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const ISSUER_ID = "3388000000023214898";
const QR_PATTERN = /^[a-f0-9]{64}$/;

const scannerElement = document.getElementById("scanner");
const startButton = document.getElementById("startScanner");
const statusElement = document.getElementById("status");
const customerInfo = document.getElementById("customerInfo");
const customerName = document.getElementById("customerName");
const customerVisits = document.getElementById("customerVisits");
const confirmButton = document.getElementById("confirmVisit");

let scanner = null;
let currentCustomer = null;
let saving = false;
let processingScan = false;
let scanLocked = false;

function setStatus(message) {
    statusElement.textContent = message;
}

function normalizeVisits(value) {
    const number = Number(value);

    return Number.isSafeInteger(number) && number >= 0
        ? number
        : 0;
}

async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function findCustomerByQr(qrValue) {
    const token = String(qrValue || "").trim();

    if (!QR_PATTERN.test(token)) {
        throw new Error("Este QR no corresponde a una tarjeta válida.");
    }

    const tokenQuery = query(
        collection(db, "walletTokens"),
        where("token", "==", token)
    );

    const tokenSnapshot = await getDocs(tokenQuery);

    if (tokenSnapshot.empty) {
        throw new Error("No encontramos esta tarjeta en Firebase.");
    }

    if (tokenSnapshot.size !== 1) {
        throw new Error("Se encontraron registros QR duplicados.");
    }

    const walletObjectId = tokenSnapshot.docs[0].id;
    const customers = await getCustomers();

    for (const customer of customers) {
        const customerId = String(customer.id || "");

        if (!customerId) {
            continue;
        }

        const hash = await sha256(customerId);
        const expectedWalletId =
            `${ISSUER_ID}.ricks_customer_${hash}`;

        if (expectedWalletId === walletObjectId) {
            return customer;
        }
    }

    throw new Error("La tarjeta existe, pero no encontramos al cliente.");
}

async function stopScanner() {
    if (!scanner) {
        return;
    }

    const activeScanner = scanner;
    scanner = null;

    try {
        await activeScanner.stop();
    } catch (error) {
        console.warn("No se pudo detener la cámara:", error);
    }

    try {
        activeScanner.clear();
    } catch (error) {
        console.warn("No se pudo limpiar el escáner:", error);
    }
}

async function handleScan(decodedText) {
    if (processingScan || scanLocked || saving) {
        return;
    }

    processingScan = true;
    scanLocked = true;
    startButton.disabled = true;

    try {
        setStatus("Buscando cliente en Firebase...");

        await stopScanner();

        const customer = await findCustomerByQr(decodedText);

        const customerRef = doc(db, "customers", customer.id);
        const snapshot = await getDoc(customerRef);

        if (!snapshot.exists()) {
            throw new Error("El cliente ya no existe en Firebase.");
        }

        const customerData = snapshot.data();

        currentCustomer = {
            id: customer.id,
            visits: normalizeVisits(customerData.visits)
        };

        customerName.textContent =
            String(customerData.name || customer.name || "Cliente");

        customerVisits.textContent = String(currentCustomer.visits);

        customerInfo.classList.remove("hidden");
        confirmButton.disabled = false;

        setStatus("Cliente identificado. Confirma antes de sumar la visita.");
    } catch (error) {
        console.error("Error al leer QR:", error);

        currentCustomer = null;
        customerInfo.classList.add("hidden");
        confirmButton.disabled = true;
        scanLocked = false;
        startButton.disabled = false;

        setStatus(error.message || "No pudimos procesar el código QR.");
    } finally {
        processingScan = false;
    }
}

async function startScanner() {
    if (scanner || processingScan || saving) {
        return;
    }

    if (typeof Html5Qrcode === "undefined") {
        setStatus("No se pudo cargar el lector QR. Revisa tu conexión.");
        return;
    }

    currentCustomer = null;
    scanLocked = false;
    customerInfo.classList.add("hidden");
    confirmButton.disabled = true;
    startButton.disabled = true;

    setStatus("Solicitando permiso para utilizar la cámara...");

    scannerElement.textContent = "";

    const reader = new Html5Qrcode("scanner");
    scanner = reader;

    try {
        await reader.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 220, height: 220 }
            },
            decodedText => {
                void handleScan(decodedText);
            },
            () => {}
        );

        setStatus("Apunta la cámara al QR de la tarjeta del cliente.");
    } catch (error) {
        console.error("Error iniciando cámara:", error);

        scanner = null;

        try {
            reader.clear();
        } catch (clearError) {
            console.warn("No se pudo limpiar la cámara:", clearError);
        }

        startButton.disabled = false;

        setStatus(
            "No se pudo abrir la cámara. Verifica los permisos del navegador."
        );
    }
}

async function confirmVisit() {
    if (!currentCustomer || saving) {
        return;
    }

    saving = true;
    confirmButton.disabled = true;
    startButton.disabled = true;

    const customerId = currentCustomer.id;

    try {
        const customerRef = doc(db, "customers", customerId);

        const updatedVisits = await runTransaction(
            db,
            async transaction => {
                const snapshot = await transaction.get(customerRef);

                if (!snapshot.exists()) {
                    throw new Error("El cliente ya no existe.");
                }

                const previousVisits = normalizeVisits(
                    snapshot.data().visits
                );

                const nextVisits = previousVisits + 1;

                if (!Number.isSafeInteger(nextVisits)) {
                    throw new Error("El contador de visitas no es válido.");
                }

                transaction.update(customerRef, {
                    visits: nextVisits,
                    updatedAt: new Date().toISOString()
                });

                return nextVisits;
            }
        );

        customerVisits.textContent = String(updatedVisits);
        currentCustomer = null;
        scanLocked = true;

        setStatus(
            `Visita registrada correctamente. Total: ${updatedVisits}.`
        );
    } catch (error) {
        console.error("Error registrando visita:", error);

        setStatus(
            error.message || "No se pudo guardar la visita. Inténtalo de nuevo."
        );

        confirmButton.disabled = false;
    } finally {
        saving = false;
        startButton.disabled = false;
    }
}

async function loadScannerLibrary() {
    if (typeof Html5Qrcode !== "undefined") {
        return;
    }

    await new Promise((resolve, reject) => {
        const script = document.createElement("script");

        script.src =
            "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";

        script.onload = resolve;
        script.onerror = () => {
            reject(new Error("No se pudo descargar el lector QR."));
        };

        document.head.appendChild(script);
    });
}

startButton.addEventListener("click", () => {
    void startScanner();
});

confirmButton.addEventListener("click", () => {
    void confirmVisit();
});

window.addEventListener("pagehide", () => {
    void stopScanner();
});

try {
    setStatus("Cargando lector QR...");

    await loadScannerLibrary();

    startButton.disabled = false;
    setStatus("Escáner listo. Presiona «Iniciar cámara».");
} catch (error) {
    console.error("Error preparando escáner:", error);
    setStatus(error.message);
}
