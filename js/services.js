import { services as defaultServices } from "./data.js";
import { getAppointments, generateId } from "./storage.js";


/* =========================================================
   CONFIG
========================================================= */

const STORAGE_KEY = "barbershop_services";

let editingServiceId = null;
let toastTimer = null;


/* =========================================================
   DOM
========================================================= */

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


/* =========================================================
   INITIALIZATION
========================================================= */

function initialize() {
    seedServices();
    configureEvents();
    renderAll();
}


/* =========================================================
   STORAGE
========================================================= */

function getServices() {
    try {
        const stored = JSON.parse(
            localStorage.getItem(STORAGE_KEY)
        );

        return Array.isArray(stored)
            ? stored
            : [];
    } catch {
        return [];
    }
}


function saveServices(services) {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(services)
    );
}


/* =========================================================
   SEED
========================================================= */

function seedServices() {
    if (localStorage.getItem(STORAGE_KEY)) {
        return;
    }

    const initialServices =
        defaultServices.map(service => ({
            ...service,
            status: "active",
            createdAt: new Date().toISOString()
        }));

    saveServices(initialServices);
}


/* =========================================================
   EVENTS
========================================================= */

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

    serviceModal.addEventListener(
        "click",
        event => {
            if (event.target === serviceModal) {
                closeModal();
            }
        }
    );

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Escape" &&
                !serviceModal.classList.contains("hidden")
            ) {
                closeModal();
            }
        }
    );
}


/* =========================================================
   RENDER ALL
========================================================= */

function renderAll() {
    renderSummary();
    renderServices();
}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {
    const services = getServices();
    const appointments = getAppointments();

    const activeServices =
        services.filter(
            service =>
                service.status === "active"
        );

    const completedAppointments =
        appointments.filter(
            appointment =>
                appointment.status === "completed"
        );

    const revenue =
        completedAppointments.reduce(
            (total, appointment) => {
                const service =
                    services.find(
                        item =>
                            item.id ===
                            appointment.serviceId
                    );

                return total +
                    Number(service?.price || 0);
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


/* =========================================================
   SERVICES
========================================================= */

function renderServices() {
    const services = getServices();
    const appointments = getAppointments();

    if (!services.length) {
        servicesGrid.innerHTML = `
            <div class="module-empty-state">
                <div class="module-empty-icon">
                    ✂
                </div>

                <strong>
                    No hay servicios
                </strong>

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
            ?.addEventListener(
                "click",
                openNewService
            );

        return;
    }

    servicesGrid.innerHTML =
        services
            .map(service => {
                const completed =
                    appointments.filter(
                        appointment =>
                            appointment.serviceId === service.id &&
                            appointment.status === "completed"
                    );

                const revenue =
                    completed.length *
                    Number(service.price || 0);

                return createServiceCard(
                    service,
                    completed.length,
                    revenue
                );
            })
            .join("");
}


/* =========================================================
   SERVICE CARD
========================================================= */

function createServiceCard(
    service,
    completedCount,
    revenue
) {
    const isActive =
        service.status === "active";

    return `
        <article
            class="
                unified-card
                ${isActive ? "" : "is-inactive"}
            "
        >

            <div class="unified-card-header">

                <div class="unified-card-person">

                    <div class="unified-card-avatar">
                        ✂
                    </div>

                    <div class="unified-card-title">

                        <h3>
                            ${escapeHTML(service.name)}
                        </h3>

                        <span>
                            Servicio
                        </span>

                    </div>

                </div>


                <div
                    class="
                        unified-status
                        ${isActive ? "active" : "inactive"}
                    "
                >
                    <span></span>

                    ${
                        isActive
                            ? "Activo"
                            : "Inactivo"
                    }
                </div>

            </div>


            <div class="unified-card-metrics">

                <div>
                    <span>
                        Precio
                    </span>

                    <strong>
                        ${formatMoney(service.price)}
                    </strong>
                </div>


                <div>
                    <span>
                        Duración
                    </span>

                    <strong>
                        ${Number(service.duration)} min
                    </strong>
                </div>

            </div>


            <div class="unified-card-detail">

                <span>
                    Actividad
                </span>

                <strong>
                    ${completedCount}
                    ${
                        completedCount === 1
                            ? "servicio realizado"
                            : "servicios realizados"
                    }
                </strong>

                <small>
                    ${formatMoney(revenue)}
                    generados
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


/* =========================================================
   CARD ACTION
========================================================= */

function handleServiceAction(event) {
    const button =
        event.target.closest(
            "[data-action]"
        );

    if (!button) {
        return;
    }

    const action =
        button.dataset.action;

    const id =
        button.dataset.id;

    if (action === "edit") {
        openEditService(id);
    }
}


/* =========================================================
   NEW SERVICE
========================================================= */

function openNewService() {
    editingServiceId = null;

    serviceModalTitle.textContent =
        "Nuevo servicio";

    serviceName.value = "";

    servicePrice.value = "";

    serviceDuration.value = "30";

    serviceActiveSwitch.checked = true;

    openModal();
}


/* =========================================================
   EDIT SERVICE
========================================================= */

function openEditService(id) {
    const service =
        getServices().find(
            item => item.id === id
        );

    if (!service) {
        showToast(
            "No se encontró el servicio."
        );

        return;
    }

    editingServiceId =
        service.id;

    serviceName.value =
        service.name;

    servicePrice.value =
        service.price;

    serviceDuration.value =
        service.duration;

    serviceActiveSwitch.checked =
        service.status === "active";

    serviceModalTitle.textContent =
        service.name;

    openModal();
}


/* =========================================================
   MODAL
========================================================= */

function openModal() {
    serviceModal.classList.remove(
        "hidden"
    );

    document.body.classList.add(
        "modal-open"
    );

    setTimeout(
        () => {
            serviceName.focus();
        },
        50
    );
}


function closeModal() {
    serviceModal.classList.add(
        "hidden"
    );

    document.body.classList.remove(
        "modal-open"
    );

    editingServiceId = null;
}


/* =========================================================
   UPDATE MODAL TITLE
========================================================= */

function updateModalTitle() {
    if (!editingServiceId) {
        return;
    }

    const name =
        serviceName.value.trim();

    serviceModalTitle.textContent =
        name || "Editar servicio";
}


/* =========================================================
   SAVE SERVICE
========================================================= */

function saveService() {
    const name =
        serviceName.value.trim();

    const price =
        Number(servicePrice.value);

    const duration =
        Number(serviceDuration.value);

    if (!name) {
        showToast(
            "Ingresa el nombre del servicio."
        );

        serviceName.focus();

        return;
    }

    if (
        !Number.isFinite(price) ||
        price < 0
    ) {
        showToast(
            "Ingresa un precio válido."
        );

        servicePrice.focus();

        return;
    }

    if (
        !Number.isFinite(duration) ||
        duration < 5
    ) {
        showToast(
            "La duración debe ser de al menos 5 minutos."
        );

        serviceDuration.focus();

        return;
    }

    const services =
        getServices();

    const duplicate =
        services.find(
            service =>
                service.id !== editingServiceId &&
                service.name
                    .trim()
                    .toLowerCase() ===
                    name.toLowerCase()
        );

    if (duplicate) {
        showToast(
            "Ya existe un servicio con ese nombre."
        );

        serviceName.focus();

        return;
    }

    const status =
        serviceActiveSwitch.checked
            ? "active"
            : "inactive";

    if (editingServiceId) {
        const service =
            services.find(
                item =>
                    item.id ===
                    editingServiceId
            );

        if (!service) {
            showToast(
                "No se encontró el servicio."
            );

            return;
        }

        service.name =
            name;

        service.price =
            price;

        service.duration =
            duration;

        service.status =
            status;

        service.updatedAt =
            new Date().toISOString();

        saveServices(services);

        closeModal();

        renderAll();

        showToast(
            "Servicio actualizado correctamente."
        );

        return;
    }

    const newService = {
        id: generateId("service"),
        name,
        price,
        duration,
        status,
        createdAt:
            new Date().toISOString()
    };

    services.push(newService);

    saveServices(services);

    closeModal();

    renderAll();

    showToast(
        "Servicio agregado correctamente."
    );
}


/* =========================================================
   MONEY
========================================================= */

function formatMoney(value) {
    return new Intl.NumberFormat(
        "es-MX",
        {
            style: "currency",
            currency: "MXN",
            maximumFractionDigits: 0
        }
    ).format(
        Number(value) || 0
    );
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value) {
    const element =
        document.createElement("div");

    element.textContent =
        String(value ?? "");

    return element.innerHTML;
}


/* =========================================================
   TOAST
========================================================= */

function showToast(message) {
    const toast =
        document.getElementById("toast");

    toast.textContent =
        message;

    toast.classList.add(
        "show"
    );

    clearTimeout(toastTimer);

    toastTimer =
        setTimeout(
            () => {
                toast.classList.remove(
                    "show"
                );
            },
            2800
        );
}


/* =========================================================
   START
========================================================= */

initialize();