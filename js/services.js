
import { db } from "./firebase.js";
import { getAppointments, generateId } from "./storage.js";

import {
    collection,
    doc,
    getDocs,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

/* ==========================================
   CONFIGURACIÓN
========================================== */

const SERVICES_COLLECTION = "services";

let services = [];
let appointments = [];
let editingServiceId = null;
let toastTimer = null;
let isSaving = false;

/* ==========================================
   ELEMENTOS
========================================== */

const servicesGrid =
    document.getElementById("servicesGrid");

const serviceSummary =
    document.getElementById("serviceSummary");

const serviceModal =
    document.getElementById("serviceModal");

const serviceModalTitle =
    document.getElementById("serviceModalTitle");

const serviceName =
    document.getElementById("serviceName");

const servicePrice =
    document.getElementById("servicePrice");

const serviceDuration =
    document.getElementById("serviceDuration");

const serviceActiveSwitch =
    document.getElementById("serviceActiveSwitch");

const newServiceButton =
    document.getElementById("newServiceButton");

const closeServiceModalButton =
    document.getElementById("closeServiceModal");

const cancelServiceButton =
    document.getElementById("cancelServiceButton");

const saveServiceButton =
    document.getElementById("saveServiceButton");

/* ==========================================
   FIRESTORE
========================================== */

async function getServices() {
    const snapshot = await getDocs(
        collection(db, SERVICES_COLLECTION)
    );

    return snapshot.docs.map(serviceDoc => ({
        ...serviceDoc.data(),
        id: serviceDoc.id
    }));
}

async function saveServiceToFirestore(service) {
    await setDoc(
        doc(db, SERVICES_COLLECTION, service.id),
        service
    );

    return service;
}

/* ==========================================
   CARGA DE DATOS
========================================== */

async function refreshData() {
    const [loadedServices, loadedAppointments] =
        await Promise.all([
            getServices(),
            getAppointments()
        ]);

    services = loadedServices;

    appointments = Array.isArray(loadedAppointments)
        ? loadedAppointments
        : [];

    renderAll();
}

function renderAll() {
    renderSummary();
    renderServices();
}

/* ==========================================
   ESTADÍSTICAS
========================================== */

function renderSummary() {
    const activeServices = services.filter(
        service => service.status === "active"
    );

    const completedAppointments = appointments.filter(
        appointment => appointment.status === "completed"
    );

    const revenue = completedAppointments.reduce(
        (total, appointment) => {
            const service = services.find(
                item => item.id === appointment.serviceId
            );

            return total + Number(service?.price || 0);
        },
        0
    );

    serviceSummary.innerHTML = `
        <div class="module-summary-item">
            <strong>${services.length}</strong>
            <span>Servicios</span>
        </div>

        <div class="module-summary-divider"></div>

        <div class="module-summary-item">
            <strong>${activeServices.length}</strong>
            <span>Activos</span>
        </div>

        <div class="module-summary-divider"></div>

        <div class="module-summary-item">
            <strong>${completedAppointments.length}</strong>
            <span>Realizados</span>
        </div>

        <div class="module-summary-divider"></div>

        <div class="module-summary-item">
            <strong>${formatMoney(revenue)}</strong>
            <span>Ingresos</span>
        </div>
    `;
}

/* ==========================================
   TARJETAS DE SERVICIOS
========================================== */

function renderServices() {
    if (!services.length) {
        servicesGrid.innerHTML = `
            <div class="module-empty-state">
                <div class="module-empty-icon">✂</div>

                <strong>No hay servicios</strong>

                <p>
                    Agrega el primer servicio de la barbería.
                </p>

                <button
                    type="button"
                    class="btn btn-dark"
                    id="emptyNewServiceButton"
                >
                    + Nuevo servicio
                </button>
            </div>
        `;

        document
            .getElementById("emptyNewServiceButton")
            ?.addEventListener("click", openNewService);

        return;
    }

    servicesGrid.innerHTML = services.map(service => {
        const completed = appointments.filter(
            appointment =>
                appointment.serviceId === service.id &&
                appointment.status === "completed"
        );

        const revenue =
            completed.length * Number(service.price || 0);

        return createServiceCard(
            service,
            completed.length,
            revenue
        );
    }).join("");
}

function createServiceCard(
    service,
    completedCount,
    revenue
) {
    const isActive = service.status === "active";

    return `
        <article class="unified-card ${
            isActive ? "" : "is-inactive"
        }">
            <div class="unified-card-header">
                <div class="unified-card-person">
                    <div class="unified-card-avatar">
                        ✂
                    </div>

                    <div class="unified-card-title">
                        <h3>${escapeHTML(service.name)}</h3>
                        <span>Servicio</span>
                    </div>
                </div>

                <div class="unified-status ${
                    isActive ? "active" : "inactive"
                }">
                    <span></span>
                    ${isActive ? "Activo" : "Inactivo"}
                </div>
            </div>

            <div class="unified-card-metrics">
                <div>
                    <span>Precio</span>
                    <strong>
                        ${formatMoney(service.price)}
                    </strong>
                </div>

                <div>
                    <span>Duración</span>
                    <strong>
                        ${Number(service.duration)} min
                    </strong>
                </div>
            </div>

            <div class="unified-card-detail">
                <span>Actividad</span>

                <strong>
                    ${completedCount}
                    ${
                        completedCount === 1
                            ? "servicio realizado"
                            : "servicios realizados"
                    }
                </strong>

                <small>
                    ${formatMoney(revenue)} generados
                </small>
            </div>

            <div class="unified-card-footer">
                <span>
                    ${
                        isActive
                            ? "Disponible para citas"
                            : "No disponible para citas"
                    }
                </span>

                <button
                    type="button"
                    class="modern-edit-button"
                    data-action="edit"
                    data-id="${escapeHTML(service.id)}"
                >
                    Editar
                    <span>→</span>
                </button>
            </div>
        </article>
    `;
}

/* ==========================================
   EVENTOS
========================================== */

function configureEvents() {
    newServiceButton.addEventListener(
        "click",
        openNewService
    );

    closeServiceModalButton.addEventListener(
        "click",
        closeModal
    );

    cancelServiceButton.addEventListener(
        "click",
        closeModal
    );

    saveServiceButton.addEventListener(
        "click",
        saveService
    );

    servicesGrid.addEventListener(
        "click",
        handleServiceAction
    );

    serviceName.addEventListener(
        "input",
        updateModalTitle
    );

    serviceModal.addEventListener("click", event => {
        if (event.target === serviceModal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (
            event.key === "Escape" &&
            !serviceModal.classList.contains("hidden")
        ) {
            closeModal();
        }
    });
}

function handleServiceAction(event) {
    const button = event.target.closest(
        "[data-action]"
    );

    if (!button) {
        return;
    }

    if (button.dataset.action === "edit") {
        openEditService(button.dataset.id);
    }
}

/* ==========================================
   NUEVO SERVICIO
========================================== */

function openNewService() {
    editingServiceId = null;

    serviceModalTitle.textContent = "Nuevo servicio";

    serviceName.value = "";
    servicePrice.value = "";
    serviceDuration.value = "30";
    serviceActiveSwitch.checked = true;

    openModal();
}

/* ==========================================
   EDITAR SERVICIO
========================================== */

function openEditService(id) {
    const service = services.find(
        item => item.id === id
    );

    if (!service) {
        showToast("No se encontró el servicio.");
        return;
    }

    editingServiceId = service.id;

    serviceName.value = service.name;
    servicePrice.value = service.price;
    serviceDuration.value = service.duration;

    serviceActiveSwitch.checked =
        service.status === "active";

    serviceModalTitle.textContent = service.name;

    openModal();
}

/* ==========================================
   MODAL
========================================== */

function openModal() {
    serviceModal.classList.remove("hidden");

    document.body.classList.add("modal-open");

    serviceName.focus();
}

function closeModal() {
    serviceModal.classList.add("hidden");

    document.body.classList.remove("modal-open");

    editingServiceId = null;
}

function updateModalTitle() {
    if (!editingServiceId) {
        return;
    }

    serviceModalTitle.textContent =
        serviceName.value.trim() || "Editar servicio";
}

/* ==========================================
   GUARDAR SERVICIO
========================================== */

async function saveService() {
    if (isSaving) {
        return;
    }

    const name = serviceName.value.trim();

    const priceText = servicePrice.value.trim();
    const durationText = serviceDuration.value.trim();

    const price = Number(priceText);
    const duration = Number(durationText);

    if (!name) {
        showToast("Ingresa el nombre del servicio.");
        serviceName.focus();
        return;
    }

    if (
        priceText === "" ||
        !Number.isFinite(price) ||
        price < 0
    ) {
        showToast("Ingresa un precio válido.");
        servicePrice.focus();
        return;
    }

    if (
        durationText === "" ||
        !Number.isFinite(duration) ||
        duration < 5
    ) {
        showToast(
            "La duración debe ser de al menos 5 minutos."
        );
        serviceDuration.focus();
        return;
    }

    const duplicate = services.find(
        service =>
            service.id !== editingServiceId &&
            String(service.name || "")
                .trim()
                .toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
        showToast(
            "Ya existe un servicio con ese nombre."
        );
        serviceName.focus();
        return;
    }

    const existingService = editingServiceId
        ? services.find(
            service => service.id === editingServiceId
        )
        : null;

    if (editingServiceId && !existingService) {
        showToast("No se encontró el servicio.");
        return;
    }

    const now = new Date().toISOString();

    const service = {
        ...(existingService || {}),
        id: editingServiceId || generateId("service"),
        name,
        price,
        duration,
        status: serviceActiveSwitch.checked
            ? "active"
            : "inactive",
        createdAt: existingService?.createdAt || now,
        updatedAt: now
    };

    isSaving = true;
    saveServiceButton.disabled = true;

    try {
        await saveServiceToFirestore(service);

        closeModal();

        await refreshData();

        showToast(
            existingService
                ? "Servicio actualizado correctamente."
                : "Servicio agregado correctamente."
        );

    } catch (error) {
        console.error(
            "Error guardando servicio en Firebase:",
            error
        );

        showToast(
            error.code === "permission-denied"
                ? "No tienes permisos para guardar servicios."
                : "No fue posible guardar el servicio."
        );

    } finally {
        isSaving = false;
        saveServiceButton.disabled = false;
    }
}

/* ==========================================
   UTILIDADES
========================================== */

function formatMoney(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function escapeHTML(value) {
    const element = document.createElement("div");

    element.textContent = String(value ?? "");

    return element.innerHTML;
}

function showToast(message) {
    const toast = document.getElementById("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

/* ==========================================
   INICIALIZACIÓN
========================================== */

async function initialize() {
    const requiredElements = [
        servicesGrid,
        serviceSummary,
        serviceModal,
        serviceModalTitle,
        serviceName,
        servicePrice,
        serviceDuration,
        serviceActiveSwitch,
        newServiceButton,
        closeServiceModalButton,
        cancelServiceButton,
        saveServiceButton
    ];

    if (requiredElements.some(element => !element)) {
        console.error(
            "Faltan elementos HTML en servicios.html."
        );
        return;
    }

    configureEvents();

    servicesGrid.innerHTML = `
        <div class="module-empty-state">
            <p>Cargando servicios...</p>
        </div>
    `;

    try {
        await refreshData();

    } catch (error) {
        console.error(
            "Error cargando Servicios:",
            error
        );

        servicesGrid.innerHTML = `
            <div class="module-empty-state">
                <strong>
                    No fue posible cargar los servicios.
                </strong>

                <p>
                    Revisa la conexión y los permisos de Firebase.
                </p>
            </div>
        `;

        showToast(
            "No fue posible cargar los datos de Firebase."
        );
    }
}

initialize();
