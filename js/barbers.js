
import { db } from "./firebase.js";
import { getAppointments, generateId } from "./storage.js";

import {
    collection,
    getDocs,
    doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const BARBERS_COLLECTION = "barbers";
const SERVICES_COLLECTION = "services";

const dayLabels = {
    monday: "Lunes",
    tuesday: "Martes",
    wednesday: "Miércoles",
    thursday: "Jueves",
    friday: "Viernes",
    saturday: "Sábado",
    sunday: "Domingo"
};

const defaultSchedule = {
    monday: { enabled: true, start: "09:00", end: "19:00" },
    tuesday: { enabled: true, start: "09:00", end: "19:00" },
    wednesday: { enabled: true, start: "09:00", end: "19:00" },
    thursday: { enabled: true, start: "09:00", end: "19:00" },
    friday: { enabled: true, start: "09:00", end: "19:00" },
    saturday: { enabled: true, start: "09:00", end: "17:00" },
    sunday: { enabled: false, start: "09:00", end: "17:00" }
};

const elements = {
    grid: document.getElementById("barbersGrid"),
    summary: document.getElementById("barberSummary"),
    modal: document.getElementById("barberModal"),
    name: document.getElementById("barberName"),
    phone: document.getElementById("barberPhone"),
    active: document.getElementById("barberActiveSwitch"),
    services: document.getElementById("barberServices"),
    schedule: document.getElementById("scheduleEditor"),
    avatar: document.getElementById("barberModalAvatar"),
    title: document.getElementById("barberModalTitle"),
    save: document.getElementById("saveBarberButton"),
    toast: document.getElementById("toast")
};

let barbers = [];
let services = [];
let appointments = [];
let editingBarberId = null;
let toastTimer = null;
let saving = false;

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

function getInitials(name) {
    return String(name || "")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join("") || "NB";
}

function showToast(message) {
    if (!elements.toast) {
        console.log(message);
        return;
    }

    elements.toast.textContent = message;
    elements.toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        elements.toast.classList.remove("show");
    }, 3500);
}

function createSchedule(overrides = {}) {
    const result = {};

    for (const day of Object.keys(dayLabels)) {
        result[day] = {
            ...defaultSchedule[day],
            ...(overrides[day] || {})
        };
    }

    return result;
}

function getLocalDate() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getTodaySchedule(barber) {
    const days = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday"
    ];

    return barber.schedule?.[days[new Date().getDay()]] || null;
}

function formatTime(time) {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
        return "--";
    }

    const [hours, minutes] = time.split(":").map(Number);
    const hour = hours % 12 || 12;
    const period = hours >= 12 ? "PM" : "AM";

    return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatTodaySchedule(schedule) {
    if (!schedule?.enabled) {
        return "Descanso";
    }

    return `${formatTime(schedule.start)} — ${formatTime(schedule.end)}`;
}

async function loadBarbers() {
    const snapshot = await getDocs(
        collection(db, BARBERS_COLLECTION)
    );

    return snapshot.docs.map(item => ({
        ...item.data(),
        id: item.id,
        serviceIds: Array.isArray(item.data().serviceIds)
            ? item.data().serviceIds
            : [],
        schedule: createSchedule(item.data().schedule || {})
    }));
}

async function loadServices() {
    const snapshot = await getDocs(
        collection(db, SERVICES_COLLECTION)
    );

    return snapshot.docs.map(item => ({
        ...item.data(),
        id: item.id
    }));
}

async function refreshData() {
    const [loadedBarbers, loadedServices, loadedAppointments] =
        await Promise.all([
            loadBarbers(),
            loadServices(),
            getAppointments()
        ]);

    barbers = loadedBarbers;
    services = loadedServices;
    appointments = Array.isArray(loadedAppointments)
        ? loadedAppointments
        : [];

    renderSummary();
    renderBarbers();
}

function renderSummary() {
    const active = barbers.filter(
        barber => barber.status === "active"
    );

    const workingToday = active.filter(
        barber => getTodaySchedule(barber)?.enabled
    );

    elements.summary.innerHTML = `
        <div class="barber-summary-item">
            <strong>${barbers.length}</strong>
            <span>Barberos</span>
        </div>

        <div class="barber-summary-divider"></div>

        <div class="barber-summary-item">
            <strong>${active.length}</strong>
            <span>Activos</span>
        </div>

        <div class="barber-summary-divider"></div>

        <div class="barber-summary-item">
            <strong>${workingToday.length}</strong>
            <span>Trabajando hoy</span>
        </div>
    `;
}

function getAppointmentsToday(barberId) {
    const today = getLocalDate();

    return appointments.filter(appointment =>
        appointment.barberId === barberId &&
        appointment.date === today &&
        appointment.status !== "cancelled" &&
        appointment.status !== "no-show"
    ).length;
}

function renderBarbers() {
    if (!barbers.length) {
        elements.grid.innerHTML = `
            <div class="panel" style="grid-column: 1 / -1;">
                <div class="empty">
                    No hay barberos registrados.
                    Agrega tu primer barbero para comenzar.
                </div>
            </div>
        `;
        return;
    }

    elements.grid.innerHTML = barbers.map(barber => {
        const serviceList = barber.serviceIds
            .map(id => services.find(service => service.id === id))
            .filter(Boolean);

        const todaySchedule = getTodaySchedule(barber);

        const serviceTags = serviceList.length
            ? serviceList.map(service => `
                <span>${escapeHTML(service.name)}</span>
            `).join("")
            : "<span>Sin servicios</span>";

        const inactive = barber.status !== "active";

        return `
            <article class="modern-barber-card ${inactive ? "is-inactive" : ""}">
                <div class="modern-barber-top">
                    <div class="modern-barber-person">
                        <div class="modern-barber-avatar">
                            ${escapeHTML(getInitials(barber.name))}
                        </div>

                        <div class="modern-barber-name">
                            <h3>${escapeHTML(barber.name)}</h3>
                            <span>Barbero</span>
                        </div>
                    </div>

                    <div class="modern-status ${inactive ? "inactive" : "active"}">
                        <span></span>
                        ${inactive ? "Inactivo" : "Activo"}
                    </div>
                </div>

                <div class="modern-barber-metrics">
                    <div>
                        <strong>${getAppointmentsToday(barber.id)}</strong>
                        <span>Citas hoy</span>
                    </div>

                    <div>
                        <strong>${serviceList.length}</strong>
                        <span>Servicios</span>
                    </div>
                </div>

                <div class="modern-barber-schedule">
                    <span>Horario de hoy</span>
                    <strong>
                        ${inactive
                            ? "No disponible"
                            : formatTodaySchedule(todaySchedule)}
                    </strong>
                </div>

                <div class="modern-barber-services">
                    ${serviceTags}
                </div>

                <div class="modern-barber-footer">
                    <span>
                        ${escapeHTML(barber.phone || "Sin teléfono")}
                    </span>

                    <button
                        type="button"
                        class="modern-edit-button"
                        data-action="edit"
                        data-id="${escapeHTML(barber.id)}"
                    >
                        Editar
                        <span>→</span>
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

function renderServices(selectedIds = []) {
    if (!services.length) {
        elements.services.innerHTML = `
            <div class="empty">
                Todavía no hay servicios en Firebase.
                Puedes registrar el barbero ahora y asignarle
                servicios cuando los hayas creado.
            </div>
        `;
        return;
    }

    elements.services.innerHTML = services.map(service => {
        const checked = selectedIds.includes(service.id)
            ? "checked"
            : "";

        return `
            <label class="modern-service-option">
                <input
                    type="checkbox"
                    value="${escapeHTML(service.id)}"
                    ${checked}
                >

                <span class="modern-service-check">✓</span>

                <div>
                    <strong>${escapeHTML(service.name)}</strong>
                    <small>
                        ${Number(service.duration) || 0} min ·
                        $${Number(service.price) || 0}
                    </small>
                </div>
            </label>
        `;
    }).join("");
}

function renderSchedule(schedule) {
    const completeSchedule = createSchedule(schedule);

    elements.schedule.innerHTML = Object.entries(dayLabels)
        .map(([day, label]) => {
            const config = completeSchedule[day];

            return `
                <div
                    class="modern-schedule-row ${config.enabled ? "" : "disabled"}"
                    data-day="${day}"
                >
                    <div class="modern-schedule-day">
                        <label class="modern-switch small">
                            <input
                                type="checkbox"
                                class="schedule-enabled"
                                ${config.enabled ? "checked" : ""}
                            >
                            <span class="modern-switch-slider"></span>
                        </label>

                        <strong>${label}</strong>
                    </div>

                    <div class="modern-schedule-times">
                        ${config.enabled ? `
                            <input
                                type="time"
                                class="schedule-start"
                                value="${escapeHTML(config.start)}"
                            >
                            <span>→</span>
                            <input
                                type="time"
                                class="schedule-end"
                                value="${escapeHTML(config.end)}"
                            >
                        ` : `
                            <span class="schedule-rest-label">
                                Descanso
                            </span>
                            <input
                                type="time"
                                class="schedule-start"
                                value="${escapeHTML(config.start)}"
                                hidden
                            >
                            <input
                                type="time"
                                class="schedule-end"
                                value="${escapeHTML(config.end)}"
                                hidden
                            >
                        `}
                    </div>
                </div>
            `;
        }).join("");
}

function collectSchedule() {
    const result = {};

    elements.schedule
        .querySelectorAll(".modern-schedule-row")
        .forEach(row => {
            const day = row.dataset.day;

            result[day] = {
                enabled: row.querySelector(".schedule-enabled").checked,
                start: row.querySelector(".schedule-start").value,
                end: row.querySelector(".schedule-end").value
            };
        });

    return result;
}

function validateSchedule(schedule) {
    for (const [day, config] of Object.entries(schedule)) {
        if (!config.enabled) {
            continue;
        }

        if (!config.start || !config.end) {
            showToast(`Completa el horario de ${dayLabels[day]}.`);
            return false;
        }

        if (config.start >= config.end) {
            showToast(`Revisa el horario de ${dayLabels[day]}.`);
            return false;
        }
    }

    return true;
}

function openModal() {
    elements.modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    elements.name.focus();
}

function closeModal() {
    elements.modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    editingBarberId = null;
}

function openNewBarber() {
    editingBarberId = null;

    elements.title.textContent = "Nuevo barbero";
    elements.name.value = "";
    elements.phone.value = "";
    elements.active.checked = true;
    elements.avatar.textContent = "NB";

    renderServices([]);
    renderSchedule(createSchedule());
    openModal();
}

function openEditBarber(id) {
    const barber = barbers.find(item => item.id === id);

    if (!barber) {
        showToast("No se encontró el barbero.");
        return;
    }

    editingBarberId = barber.id;

    elements.title.textContent = barber.name;
    elements.name.value = barber.name;
    elements.phone.value = barber.phone || "";
    elements.active.checked = barber.status === "active";
    elements.avatar.textContent = getInitials(barber.name);

    renderServices(barber.serviceIds || []);
    renderSchedule(barber.schedule || createSchedule());

    openModal();
}

async function saveBarber() {
    if (saving) {
        return;
    }

    const name = elements.name.value.trim();
    const phone = elements.phone.value.trim();

    if (!name) {
        showToast("Ingresa el nombre del barbero.");
        elements.name.focus();
        return;
    }

    const selectedServices = Array.from(
        elements.services.querySelectorAll(
            "input[type='checkbox']:checked"
        )
    ).map(input => input.value);

    if (services.length && !selectedServices.length) {
        showToast("Selecciona al menos un servicio.");
        return;
    }

    const schedule = collectSchedule();

    if (!validateSchedule(schedule)) {
        return;
    }

    const previousBarber = editingBarberId
        ? barbers.find(item => item.id === editingBarberId)
        : null;

    if (editingBarberId && !previousBarber) {
        showToast("El barbero que intentas editar ya no existe.");
        return;
    }

    const id = editingBarberId || generateId("barber");

    const barber = {
        ...(previousBarber || {}),
        id,
        name,
        phone,
        status: elements.active.checked ? "active" : "inactive",
        serviceIds: selectedServices,
        schedule
    };

    saving = true;
    elements.save.disabled = true;

    try {
        await setDoc(
            doc(db, BARBERS_COLLECTION, id),
            barber
        );

        closeModal();
        await refreshData();

        showToast(
            previousBarber
                ? `${name} actualizado correctamente.`
                : `${name} fue agregado al equipo.`
        );

    } catch (error) {
        console.error("Error guardando barbero:", error);

        showToast(
            error.code === "permission-denied"
                ? "Firebase no permite guardar barberos. Revisa los permisos."
                : "No fue posible guardar el barbero."
        );

    } finally {
        saving = false;
        elements.save.disabled = false;
    }
}

function configureEvents() {
    document.getElementById("newBarberButton")
        .addEventListener("click", openNewBarber);

    document.getElementById("closeBarberModal")
        .addEventListener("click", closeModal);

    document.getElementById("cancelBarberButton")
        .addEventListener("click", closeModal);

    elements.save.addEventListener("click", saveBarber);

    elements.grid.addEventListener("click", event => {
        const button = event.target.closest("[data-action]");

        if (button?.dataset.action === "edit") {
            openEditBarber(button.dataset.id);
        }
    });

    elements.schedule.addEventListener("change", event => {
        if (!event.target.matches(".schedule-enabled")) {
            return;
        }

        const schedule = collectSchedule();
        const row = event.target.closest(".modern-schedule-row");

        schedule[row.dataset.day].enabled = event.target.checked;
        renderSchedule(schedule);
    });

    elements.name.addEventListener("input", () => {
        elements.avatar.textContent = getInitials(
            elements.name.value
        );
    });

    elements.modal.addEventListener("click", event => {
        if (event.target === elements.modal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (
            event.key === "Escape" &&
            !elements.modal.classList.contains("hidden")
        ) {
            closeModal();
        }
    });
}

async function initialize() {
    const required = [
        ...Object.values(elements).filter(Boolean),
        document.getElementById("newBarberButton"),
        document.getElementById("closeBarberModal"),
        document.getElementById("cancelBarberButton")
    ];

    if (
        required.length !== Object.keys(elements).length + 3
    ) {
        console.error(
            "Faltan elementos HTML necesarios para la página Barberos."
        );
        return;
    }

    configureEvents();

    elements.grid.innerHTML = `
        <div class="panel" style="grid-column: 1 / -1;">
            <div class="empty">Cargando barberos...</div>
        </div>
    `;

    try {
        await refreshData();
    } catch (error) {
        console.error("Error cargando Barberos:", error);

        elements.grid.innerHTML = `
            <div class="panel" style="grid-column: 1 / -1;">
                <div class="empty">
                    No fue posible cargar los barberos desde Firebase.
                    Revisa la consola del navegador.
                </div>
            </div>
        `;

        showToast("Error al cargar los datos de Firebase.");
    }
}

initialize();
