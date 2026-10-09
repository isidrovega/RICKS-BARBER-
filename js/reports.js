
import { db } from "./firebase.js";
import { getAppointments } from "./storage.js";

import {
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

/* ==========================================
   CONFIGURACIÓN
========================================== */

let currentPeriod = "week";

let appointments = [];
let services = [];
let barbers = [];

const elements = {
    summary: document.getElementById("reportSummary"),
    dateRange: document.getElementById("reportDateRange"),
    revenue: document.getElementById("revenueReport"),
    statuses: document.getElementById("statusReport"),
    services: document.getElementById("servicesReport"),
    barbers: document.getElementById("barbersReport"),
    origins: document.getElementById("originsReport")
};

const originNames = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    facebook: "Facebook",
    phone: "Teléfono",
    "walk-in": "En persona",
    web: "Página web",
    unknown: "Sin origen"
};

const originIcons = {
    whatsapp: "W",
    instagram: "I",
    facebook: "F",
    phone: "☎",
    "walk-in": "P",
    web: "◎",
    unknown: "?"
};

/* ==========================================
   FIRESTORE
========================================== */

async function loadCollection(collectionName) {
    const snapshot = await getDocs(
        collection(db, collectionName)
    );

    return snapshot.docs.map(item => ({
        ...item.data(),
        id: item.id
    }));
}

async function loadReportsData() {
    const [
        loadedAppointments,
        loadedServices,
        loadedBarbers
    ] = await Promise.all([
        getAppointments(),
        loadCollection("services"),
        loadCollection("barbers")
    ]);

    if (!Array.isArray(loadedAppointments)) {
        throw new Error(
            "getAppointments() no devolvió un arreglo."
        );
    }

    appointments = loadedAppointments;
    services = loadedServices;
    barbers = loadedBarbers;

    renderReports();
}

/* ==========================================
   UTILIDADES
========================================== */

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function formatMoney(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function getInitials(name) {
    return String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(word => word.charAt(0))
        .join("")
        .toUpperCase() || "?";
}

function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
}

function emptyReport() {
    return `
        <div class="report-simple-empty">
            Sin información en este período.
        </div>
    `;
}

function getOriginName(origin) {
    return originNames[origin] ||
        (origin ? String(origin) : "Sin origen");
}

function getOriginIcon(origin) {
    return originIcons[origin] || "•";
}

/* ==========================================
   FECHAS
========================================== */

function parseDate(value) {
    if (typeof value !== "string") {
        return null;
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function startOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}

function endOfDay(date) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
}

function getFilteredAppointments() {
    if (currentPeriod === "all") {
        return [...appointments];
    }

    const today = startOfDay(new Date());

    const daysBack = {
        today: 0,
        week: 6,
        month: 29
    };

    const start = new Date(today);
    start.setDate(
        start.getDate() - (daysBack[currentPeriod] ?? 6)
    );

    const end = endOfDay(today);

    return appointments.filter(appointment => {
        const date = parseDate(appointment.date);

        return date !== null &&
            date >= start &&
            date <= end;
    });
}

function renderPeriod() {
    const labels = {
        today: "Actividad de hoy",
        week: "Últimos 7 días",
        month: "Últimos 30 días",
        all: "Todo el historial"
    };

    elements.dateRange.textContent =
        labels[currentPeriod] || labels.week;
}

/* ==========================================
   INGRESOS
========================================== */

/*
 * Si una cita tiene un precio cobrado guardado,
 * se utiliza ese valor. En caso contrario,
 * se utiliza el precio actual del servicio.
 *
 * Las citas antiguas sin precio guardado
 * pueden cambiar de valor cuando se edite
 * la tarifa del servicio.
 */
function getAppointmentRevenue(appointment) {
    if (appointment.loyaltyApplied === true) {
        return 0;
    }

    const savedPrice =
        appointment.amountPaid ??
        appointment.finalPrice ??
        appointment.pricePaid;

    if (
        savedPrice !== null &&
        savedPrice !== undefined &&
        savedPrice !== ""
    ) {
        const amount = Number(savedPrice);

        if (Number.isFinite(amount) && amount >= 0) {
            return amount;
        }
    }

    const service = services.find(
        item => item.id === appointment.serviceId
    );

    return Math.max(0, Number(service?.price) || 0);
}

function calculateRevenue(items) {
    return items.reduce(
        (total, appointment) =>
            total + getAppointmentRevenue(appointment),
        0
    );
}

/* ==========================================
   RESUMEN GENERAL
========================================== */

function renderSummary(filtered) {
    const completed = filtered.filter(
        item => item.status === "completed"
    );

    const cancelled = filtered.filter(
        item =>
            item.status === "cancelled" ||
            item.status === "no-show"
    );

    const revenue = calculateRevenue(completed);

    const uniqueCustomers = new Set(
        completed
            .map(item => {
                const phone = normalizePhone(item.phone);

                return phone
                    ? `phone:${phone}`
                    : item.customerId
                        ? `id:${item.customerId}`
                        : "";
            })
            .filter(Boolean)
    ).size;

    elements.summary.innerHTML = `
        <div class="module-summary-item">
            <strong>${formatMoney(revenue)}</strong>
            <span>Ingresos</span>
        </div>

        <div class="module-summary-divider"></div>

        <div class="module-summary-item">
            <strong>${filtered.length}</strong>
            <span>Citas</span>
        </div>

        <div class="module-summary-divider"></div>

        <div class="module-summary-item">
            <strong>${completed.length}</strong>
            <span>Completadas</span>
        </div>

        <div class="module-summary-divider"></div>

        <div class="module-summary-item">
            <strong>${uniqueCustomers}</strong>
            <span>Clientes</span>
        </div>

        <div class="module-summary-divider"></div>

        <div class="module-summary-item">
            <strong>${cancelled.length}</strong>
            <span>Canceladas / no-show</span>
        </div>
    `;
}

/* ==========================================
   REPORTE DE INGRESOS
========================================== */

function renderRevenue(filtered) {
    const completed = filtered.filter(
        item => item.status === "completed"
    );

    const revenue = calculateRevenue(completed);

    const ticket = completed.length
        ? revenue / completed.length
        : 0;

    elements.revenue.innerHTML = `
        <div class="report-primary-value">
            <span>Total</span>
            <strong>${formatMoney(revenue)}</strong>
        </div>

        <div class="report-info-row">
            <span>Servicios completados</span>
            <strong>${completed.length}</strong>
        </div>

        <div class="report-info-row">
            <span>Ticket promedio</span>
            <strong>${formatMoney(ticket)}</strong>
        </div>
    `;
}

/* ==========================================
   ESTADOS DE CITAS
========================================== */

function renderStatuses(filtered) {
    const statuses = [
        ["completed", "Completadas"],
        ["confirmed", "Confirmadas"],
        ["pending", "Pendientes"],
        ["cancelled", "Canceladas"],
        ["no-show", "No asistió"]
    ];

    elements.statuses.innerHTML = statuses
        .map(([id, label]) => {
            const count = filtered.filter(
                appointment => appointment.status === id
            ).length;

            return `
                <div class="report-info-row">
                    <span>${label}</span>
                    <strong>${count}</strong>
                </div>
            `;
        })
        .join("");
}

/* ==========================================
   SERVICIOS MÁS REALIZADOS
========================================== */

function renderServices(filtered) {
    const completed = filtered.filter(
        item => item.status === "completed"
    );

    const grouped = new Map();

    for (const appointment of completed) {
        const id = appointment.serviceId || "unknown";

        const service = services.find(
            item => item.id === id
        );

        if (!grouped.has(id)) {
            grouped.set(id, {
                name: service?.name ||
                    appointment.serviceName ||
                    "Servicio no disponible",
                count: 0,
                revenue: 0
            });
        }

        const item = grouped.get(id);

        item.count += 1;
        item.revenue += getAppointmentRevenue(appointment);
    }

    const data = [...grouped.values()]
        .sort((a, b) => b.count - a.count);

    if (!data.length) {
        elements.services.innerHTML = emptyReport();
        return;
    }

    elements.services.innerHTML = data.map(service => `
        <div class="report-entity-row">
            <div>
                <strong>
                    ${escapeHTML(service.name)}
                </strong>

                <span>
                    ${service.count}
                    ${
                        service.count === 1
                            ? "servicio"
                            : "servicios"
                    }
                </span>
            </div>

            <strong>
                ${formatMoney(service.revenue)}
            </strong>
        </div>
    `).join("");
}

/* ==========================================
   RENDIMIENTO DE BARBEROS
========================================== */

function renderBarbers(filtered) {
    const completed = filtered.filter(
        item => item.status === "completed"
    );

    const grouped = new Map();

    for (const appointment of completed) {
        const id = appointment.barberId || "unknown";

        const barber = barbers.find(
            item => item.id === id
        );

        if (!grouped.has(id)) {
            grouped.set(id, {
                name: barber?.name ||
                    appointment.barberName ||
                    "Barbero no disponible",
                count: 0,
                revenue: 0
            });
        }

        const item = grouped.get(id);

        item.count += 1;
        item.revenue += getAppointmentRevenue(appointment);
    }

    const data = [...grouped.values()]
        .sort((a, b) => b.count - a.count);

    if (!data.length) {
        elements.barbers.innerHTML = emptyReport();
        return;
    }

    elements.barbers.innerHTML = data.map(barber => `
        <div class="report-entity-row">
            <div class="report-entity-person">
                <div class="report-mini-avatar">
                    ${escapeHTML(getInitials(barber.name))}
                </div>

                <div>
                    <strong>
                        ${escapeHTML(barber.name)}
                    </strong>

                    <span>
                        ${barber.count}
                        ${
                            barber.count === 1
                                ? "cita"
                                : "citas"
                        }
                    </span>
                </div>
            </div>

            <strong>
                ${formatMoney(barber.revenue)}
            </strong>
        </div>
    `).join("");
}

/* ==========================================
   ORIGEN DE LAS CITAS
========================================== */

function renderOrigins(filtered) {
    if (!filtered.length) {
        elements.origins.innerHTML = emptyReport();
        return;
    }

    const counts = new Map();

    for (const appointment of filtered) {
        const origin = appointment.origin || "unknown";

        counts.set(
            origin,
            (counts.get(origin) || 0) + 1
        );
    }

    const data = [...counts.entries()]
        .map(([id, count]) => ({
            id,
            count,
            name: getOriginName(id)
        }))
        .sort((a, b) => b.count - a.count);

    elements.origins.innerHTML = data.map(item => {
        const percentage = Math.round(
            (item.count / filtered.length) * 100
        );

        return `
            <div class="report-origin-simple-row">
                <div class="report-origin-simple-icon">
                    ${escapeHTML(getOriginIcon(item.id))}
                </div>

                <div class="report-origin-simple-info">
                    <div>
                        <strong>
                            ${escapeHTML(item.name)}
                        </strong>

                        <span>
                            ${item.count}
                            ${
                                item.count === 1
                                    ? "cita"
                                    : "citas"
                            }
                        </span>
                    </div>

                    <div class="report-simple-progress">
                        <div
                            style="width: ${percentage}%;"
                        ></div>
                    </div>
                </div>

                <strong>${percentage}%</strong>
            </div>
        `;
    }).join("");
}

/* ==========================================
   RENDER GENERAL
========================================== */

function renderReports() {
    const filtered = getFilteredAppointments();

    renderPeriod();
    renderSummary(filtered);
    renderRevenue(filtered);
    renderStatuses(filtered);
    renderServices(filtered);
    renderBarbers(filtered);
    renderOrigins(filtered);
}

/* ==========================================
   FILTROS
========================================== */

function configureEvents() {
    document.querySelectorAll("[data-period]")
        .forEach(button => {
            button.addEventListener("click", () => {
                document.querySelectorAll("[data-period]")
                    .forEach(item => {
                        item.classList.remove("active");
                    });

                button.classList.add("active");

                currentPeriod =
                    button.dataset.period || "week";

                renderReports();
            });
        });
}

/* ==========================================
   ERRORES DE CARGA
========================================== */

function renderLoading() {
    const loading = `
        <div class="report-simple-empty">
            Cargando información de Firebase...
        </div>
    `;

    elements.revenue.innerHTML = loading;
    elements.statuses.innerHTML = loading;
    elements.services.innerHTML = loading;
    elements.barbers.innerHTML = loading;
    elements.origins.innerHTML = loading;

    elements.dateRange.textContent =
        "Cargando reportes...";
}

function renderError() {
    const errorMessage = `
        <div class="report-simple-empty">
            No fue posible cargar los reportes.
            Revisa la consola y los permisos de Firebase.
        </div>
    `;

    elements.revenue.innerHTML = errorMessage;
    elements.statuses.innerHTML = errorMessage;
    elements.services.innerHTML = errorMessage;
    elements.barbers.innerHTML = errorMessage;
    elements.origins.innerHTML = errorMessage;

    elements.dateRange.textContent =
        "Error al cargar información";
}

/* ==========================================
   INICIALIZACIÓN
========================================== */

async function initialize() {
    const missing = Object.entries(elements)
        .filter(([, element]) => !element)
        .map(([name]) => name);

    if (missing.length) {
        console.error(
            "Faltan elementos HTML en reportes.html:",
            missing
        );
        return;
    }

    configureEvents();
    renderLoading();

    try {
        await loadReportsData();
    } catch (error) {
        console.error(
            "Error cargando Reportes desde Firebase:",
            error
        );

        renderError();
    }
}

initialize();
