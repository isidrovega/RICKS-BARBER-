
import {
    origins,
    availableTimes,
    getLocalDate
} from "./data.js";

import {
    getAppointments,
    findCustomerByPhone,
    getOrCreateCustomer,
    saveAppointment,
    generateId,
    normalizePhone
} from "./storage.js";

import { db } from "./firebase.js";

import {
    collection,
    getDocs,
    doc,
    getDoc,
    runTransaction,
    increment,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

/* ==========================================
   ESTADO
========================================== */

let appointmentsCache = [];
let services = [];
let barbers = [];

let currentFilter = "all";
let selectedTime = "";
let saving = false;
let updating = false;
let loadingModal = false;
let toastTimer;
let phoneSearchVersion = 0;
let modalVersion = 0;

/* ==========================================
   ELEMENTOS
========================================== */

const appointmentsTable =
    document.getElementById("appointmentsTable");

const modal =
    document.getElementById("appointmentModal");

const phoneInput =
    document.getElementById("appointmentPhone");

const nameInput =
    document.getElementById("appointmentName");

const serviceSelect =
    document.getElementById("appointmentService");

const barberSelect =
    document.getElementById("appointmentBarber");

const dateInput =
    document.getElementById("appointmentDate");

const originSelect =
    document.getElementById("appointmentOrigin");

const statusSelect =
    document.getElementById("appointmentStatus");

const notesInput =
    document.getElementById("appointmentNotes");

const timeContainer =
    document.getElementById("appointmentTimes");

const customerDetection =
    document.getElementById("customerDetection");

const saveButton =
    document.getElementById("saveAppointmentButton");

const DAYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
];

const DAY_LABELS = {
    sunday: "domingo",
    monday: "lunes",
    tuesday: "martes",
    wednesday: "miércoles",
    thursday: "jueves",
    friday: "viernes",
    saturday: "sábado"
};

/* ==========================================
   UTILIDADES
========================================== */

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function showToast(message) {
    const toast = document.getElementById("toast");

    if (!toast) {
        console.info(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

function getService(id) {
    return services.find(item => item.id === id) || null;
}

function getBarber(id) {
    return barbers.find(item => item.id === id) || null;
}

function formatTime(time) {
    if (!time) return "—";

    const [hours, minutes] =
        String(time).split(":").map(Number);

    if (
        !Number.isInteger(hours) ||
        !Number.isInteger(minutes)
    ) {
        return "—";
    }

    const period = hours >= 12 ? "PM" : "AM";
    const hour = hours % 12 || 12;

    return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatDate(dateString) {
    if (!dateString) return "—";

    const date = new Date(`${dateString}T12:00:00`);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
}

function minutesFromTime(time) {
    if (!/^\d{2}:\d{2}$/.test(String(time))) {
        return NaN;
    }

    const [hours, minutes] =
        String(time).split(":").map(Number);

    if (
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return NaN;
    }

    return hours * 60 + minutes;
}

function getDayKey(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || "")) {
        return null;
    }

    const [year, month, day] =
        dateString.split("-").map(Number);

    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return DAYS[date.getDay()];
}

function getBarberSchedule(barber, dateString) {
    const day = getDayKey(dateString);

    if (!barber || !day) {
        return null;
    }

    return barber.schedule?.[day] || null;
}

function isBarberWorking(barber, dateString) {
    if (!barber || barber.status !== "active") {
        return false;
    }

    const schedule = getBarberSchedule(
        barber,
        dateString
    );

    return (
        schedule?.enabled === true &&
        Number.isFinite(minutesFromTime(schedule.start)) &&
        Number.isFinite(minutesFromTime(schedule.end)) &&
        minutesFromTime(schedule.start) <
            minutesFromTime(schedule.end)
    );
}

function isServiceActive(service) {
    return service?.status === "active";
}

function barberOffersService(barber, serviceId) {
    return (
        Array.isArray(barber?.serviceIds) &&
        barber.serviceIds.includes(serviceId)
    );
}

function renderStatus(status) {
    const labels = {
        pending: "Pendiente",
        confirmed: "Confirmada",
        completed: "Completada",
        cancelled: "Cancelada",
        "no-show": "No asistió"
    };

    const safeStatus = Object.hasOwn(labels, status)
        ? status
        : "pending";

    return `
        <span class="status ${safeStatus}">
            ${labels[safeStatus]}
        </span>
    `;
}

function renderAvailabilityMessage(message) {
    timeContainer.innerHTML = `
        <div class="empty" style="grid-column: 1 / -1;">
            ${escapeHTML(message)}
        </div>
    `;
}

/* ==========================================
   FIRESTORE
========================================== */

async function loadCollection(name) {
    const snapshot = await getDocs(
        collection(db, name)
    );

    return snapshot.docs.map(item => ({
        ...item.data(),
        id: item.id
    }));
}

async function loadBookingData() {
    const [
        loadedServices,
        loadedBarbers,
        loadedAppointments
    ] = await Promise.all([
        loadCollection("services"),
        loadCollection("barbers"),
        getAppointments()
    ]);

    if (!Array.isArray(loadedAppointments)) {
        throw new Error(
            "No se pudieron obtener las citas."
        );
    }

    services = loadedServices;
    barbers = loadedBarbers;
    appointmentsCache = loadedAppointments;

    renderAppointments();
}

/* ==========================================
   SELECTORES
========================================== */

function populateServiceSelector() {
    const previousValue = serviceSelect.value;

    const activeServices = services
        .filter(isServiceActive)
        .sort((a, b) =>
            String(a.name).localeCompare(
                String(b.name),
                "es"
            )
        );

    serviceSelect.innerHTML = `
        <option value="">Selecciona un servicio</option>
        ${activeServices.map(service => `
            <option value="${escapeHTML(service.id)}">
                ${escapeHTML(service.name)}
                · $${escapeHTML(service.price)}
                · ${escapeHTML(service.duration)} min
            </option>
        `).join("")}
    `;

    if (
        activeServices.some(
            service => service.id === previousValue
        )
    ) {
        serviceSelect.value = previousValue;
    }
}

function populateBarberSelector() {
    const previousValue = barberSelect.value;
    const serviceId = serviceSelect.value;
    const date = dateInput.value;

    const eligibleBarbers = barbers
        .filter(barber =>
            isBarberWorking(barber, date) &&
            barberOffersService(barber, serviceId)
        )
        .sort((a, b) =>
            String(a.name).localeCompare(
                String(b.name),
                "es"
            )
        );

    barberSelect.innerHTML = `
        <option value="">Selecciona un barbero</option>
        ${eligibleBarbers.map(barber => `
            <option value="${escapeHTML(barber.id)}">
                ${escapeHTML(barber.name)}
            </option>
        `).join("")}
    `;

    if (
        eligibleBarbers.some(
            barber => barber.id === previousValue
        )
    ) {
        barberSelect.value = previousValue;
    }

    if (!eligibleBarbers.length) {
        barberSelect.disabled = true;
    } else {
        barberSelect.disabled = false;
    }

    selectedTime = "";
    renderTimes();
}

/* ==========================================
   DISPONIBILIDAD
========================================== */

function getAvailableTimes(
    date,
    barberId,
    serviceId,
    existingAppointments = appointmentsCache
) {
    const barber = getBarber(barberId);
    const service = getService(serviceId);

    if (
        !date ||
        date < getLocalDate() ||
        !barber ||
        !isBarberWorking(barber, date) ||
        !isServiceActive(service) ||
        !barberOffersService(barber, serviceId)
    ) {
        return [];
    }

    const schedule = getBarberSchedule(
        barber,
        date
    );

    const opening = minutesFromTime(schedule.start);
    const closing = minutesFromTime(schedule.end);
    const duration = Number(service.duration);

    if (
        !Number.isFinite(duration) ||
        duration <= 0
    ) {
        return [];
    }

    const occupied = existingAppointments.filter(
        appointment =>
            appointment.date === date &&
            appointment.barberId === barberId &&
            !["cancelled", "no-show"].includes(
                appointment.status
            )
    );

    return availableTimes.filter(time => {
        const start = minutesFromTime(time);
        const end = start + duration;

        if (
            !Number.isFinite(start) ||
            start < opening ||
            end > closing
        ) {
            return false;
        }

        // No ofrecer horas que ya pasaron hoy.
        if (date === getLocalDate()) {
            const now = new Date();
            const currentMinutes =
                now.getHours() * 60 +
                now.getMinutes();

            if (start <= currentMinutes) {
                return false;
            }
        }

        return !occupied.some(appointment => {
            const otherStart = minutesFromTime(
                appointment.time
            );

            const savedDuration = Number(
                appointment.duration ??
                getService(appointment.serviceId)?.duration ??
                30
            );

            if (
                !Number.isFinite(otherStart) ||
                !Number.isFinite(savedDuration)
            ) {
                return true;
            }

            const otherEnd =
                otherStart + savedDuration;

            return (
                start < otherEnd &&
                end > otherStart
            );
        });
    });
}

function renderTimes() {
    if (loadingModal) {
        renderAvailabilityMessage(
            "Cargando disponibilidad..."
        );
        return;
    }

    const date = dateInput.value;
    const serviceId = serviceSelect.value;
    const barberId = barberSelect.value;

    if (!serviceId) {
        selectedTime = "";
        renderAvailabilityMessage(
            "Primero selecciona un servicio."
        );
        return;
    }

    if (!getService(serviceId)) {
        selectedTime = "";
        renderAvailabilityMessage(
            "El servicio seleccionado ya no existe."
        );
        return;
    }

    if (!barberId) {
        selectedTime = "";

        const day = getDayKey(date);

        const message = day
            ? `No hay un barbero disponible para este servicio el ${DAY_LABELS[day]}.`
            : "Selecciona una fecha válida.";

        renderAvailabilityMessage(message);
        return;
    }

    const barber = getBarber(barberId);

    if (!isBarberWorking(barber, date)) {
        selectedTime = "";
        renderAvailabilityMessage(
            "Este barbero descansa o no trabaja ese día."
        );
        return;
    }

    const times = getAvailableTimes(
        date,
        barberId,
        serviceId
    );

    if (!times.includes(selectedTime)) {
        selectedTime = "";
    }

    if (!times.length) {
        renderAvailabilityMessage(
            "No hay horarios disponibles para este barbero."
        );
        return;
    }

    timeContainer.innerHTML = times.map(time => `
        <button
            type="button"
            class="time-button ${
                selectedTime === time ? "selected" : ""
            }"
            data-time="${escapeHTML(time)}"
        >
            ${formatTime(time)}
        </button>
    `).join("");
}

/* ==========================================
   MODAL
========================================== */

function resetForm() {
    phoneInput.value = "";
    nameInput.value = "";
    notesInput.value = "";

    customerDetection.innerHTML = "";

    originSelect.value = "whatsapp";
    statusSelect.value = "confirmed";

    dateInput.min = getLocalDate();
    dateInput.value = getLocalDate();

    selectedTime = "";

    populateServiceSelector();

    serviceSelect.value = "";
    barberSelect.innerHTML = `
        <option value="">Selecciona un barbero</option>
    `;
    barberSelect.disabled = true;

    renderTimes();
}

async function openModal() {
    const version = ++modalVersion;

    resetForm();

    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    loadingModal = true;
    saveButton.disabled = true;

    renderAvailabilityMessage(
        "Cargando barberos y servicios de Firebase..."
    );

    phoneInput.focus();

    try {
        await loadBookingData();

        if (
            version !== modalVersion ||
            modal.classList.contains("hidden")
        ) {
            return;
        }

        loadingModal = false;

        populateServiceSelector();
        populateBarberSelector();

    } catch (error) {
        console.error(
            "Error cargando datos del formulario:",
            error
        );

        if (version === modalVersion) {
            renderAvailabilityMessage(
                "No se pudieron cargar los datos de Firebase."
            );

            showToast(
                "Error cargando barberos y servicios."
            );
        }
    } finally {
        if (version === modalVersion) {
            loadingModal = false;
            saveButton.disabled = false;
        }
    }
}

function closeModal() {
    modalVersion++;
    phoneSearchVersion++;

    modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
}

/* ==========================================
   CLIENTES
========================================== */

async function detectCustomer() {
    const version = ++phoneSearchVersion;
    const phone = phoneInput.value.trim();

    if (normalizePhone(phone).length < 7) {
        customerDetection.innerHTML = "";
        return;
    }

    customerDetection.textContent =
        "Buscando cliente...";

    try {
        const customer =
            await findCustomerByPhone(phone);

        if (version !== phoneSearchVersion) {
            return;
        }

        if (customer) {
            nameInput.value = customer.name;

            const visits = Number(
                customer.visits || 0
            );

            customerDetection.innerHTML = `
                <div class="customer-found">
                    ✓ Cliente encontrado:
                    <strong>
                        ${escapeHTML(customer.name)}
                    </strong>
                    · ${visits}
                    ${visits === 1 ? "visita" : "visitas"}
                </div>
            `;
        } else {
            customerDetection.innerHTML = `
                <div class="customer-new">
                    Cliente nuevo. Se registrará al guardar la cita.
                </div>
            `;
        }
    } catch (error) {
        if (version !== phoneSearchVersion) {
            return;
        }

        console.error(
            "Error buscando cliente:",
            error
        );

        customerDetection.textContent =
            "No se pudo verificar el cliente.";
    }
}

/* ==========================================
   GUARDAR CITA
========================================== */

async function saveNewAppointment() {
    if (saving || loadingModal) {
        return;
    }

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const date = dateInput.value;
    const serviceId = serviceSelect.value;
    const barberId = barberSelect.value;
    const time = selectedTime;

    if (!name) {
        showToast("Ingresa el nombre del cliente.");
        nameInput.focus();
        return;
    }

    if (normalizePhone(phone).length < 7) {
        showToast("Ingresa un teléfono válido.");
        phoneInput.focus();
        return;
    }

    if (!getDayKey(date) || date < getLocalDate()) {
        showToast("Selecciona una fecha válida.");
        return;
    }

    if (!serviceId || !barberId) {
        showToast(
            "Selecciona un servicio y un barbero disponible."
        );
        return;
    }

    if (!time) {
        showToast("Selecciona un horario.");
        return;
    }

    saving = true;
    saveButton.disabled = true;

    try {
        // Leer de nuevo la configuración actual
        // antes de permitir el registro.
        await loadBookingData();

        const service = getService(serviceId);
        const barber = getBarber(barberId);

        if (!isServiceActive(service)) {
            throw new Error(
                "El servicio ya no está disponible."
            );
        }

        if (!isBarberWorking(barber, date)) {
            throw new Error(
                "El barbero no trabaja ese día."
            );
        }

        if (!barberOffersService(barber, serviceId)) {
            throw new Error(
                "El barbero no realiza ese servicio."
            );
        }

        const available = getAvailableTimes(
            date,
            barberId,
            serviceId
        );

        if (!available.includes(time)) {
            throw new Error(
                "El horario ya no está disponible."
            );
        }

        const customer = await getOrCreateCustomer(
            name,
            phone
        );

        const appointment = {
            id: generateId("appointment"),
            customerId: customer.id,
            date,
            time,
            clientName: name,
            phone,
            serviceId,
            barberId,
            origin: originSelect.value,
            status: statusSelect.value,
            notes: notesInput.value.trim(),
            price: Number(service.price),
            duration: Number(service.duration),
            loyaltyApplied: false,
            createdAt: new Date().toISOString()
        };

        await saveAppointment(appointment);

        await refreshAppointments();

        closeModal();

        showToast(
            `Cita de ${name} registrada correctamente.`
        );

    } catch (error) {
        console.error(
            "Error guardando cita:",
            error
        );

        showToast(
            error.message ||
            "No se pudo guardar la cita."
        );

        if (!modal.classList.contains("hidden")) {
            populateServiceSelector();
            populateBarberSelector();
        }

    } finally {
        saving = false;
        saveButton.disabled = false;
    }
}

/* ==========================================
   TABLA DE CITAS
========================================== */

async function refreshAppointments() {
    const result = await getAppointments();

    if (!Array.isArray(result)) {
        throw new Error(
            "No se pudieron consultar las citas."
        );
    }

    appointmentsCache = result;
    renderAppointments();
}

function renderAppointments() {
    let items = [...appointmentsCache];

    if (currentFilter === "today") {
        items = items.filter(
            item => item.date === getLocalDate()
        );
    } else if (currentFilter !== "all") {
        items = items.filter(
            item => item.status === currentFilter
        );
    }

    items.sort((a, b) =>
        `${a.date} ${a.time}`.localeCompare(
            `${b.date} ${b.time}`
        )
    );

    if (!items.length) {
        appointmentsTable.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty">
                        No hay citas para mostrar.
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    appointmentsTable.innerHTML = items.map(
        appointment => {
            const service = getService(
                appointment.serviceId
            );

            const barber = getBarber(
                appointment.barberId
            );

            const serviceName =
                service?.name ||
                appointment.serviceName ||
                "Servicio no disponible";

            const barberName =
                barber?.name ||
                appointment.barberName ||
                "Barbero no disponible";

            const price = Number(
                appointment.price ??
                service?.price ??
                0
            );

            const duration = Number(
                appointment.duration ??
                service?.duration ??
                30
            );

            return `
                <tr>
                    <td>
                        ${formatDate(appointment.date)}
                    </td>

                    <td>
                        <strong>
                            ${formatTime(appointment.time)}
                        </strong>
                    </td>

                    <td>
                        <strong>
                            ${escapeHTML(appointment.clientName)}
                        </strong>

                        <span class="client-phone">
                            ${escapeHTML(appointment.phone)}
                        </span>

                        ${appointment.notes ? `
                            <span class="appointment-note">
                                Nota:
                                ${escapeHTML(appointment.notes)}
                            </span>
                        ` : ""}
                    </td>

                    <td>
                        ${escapeHTML(serviceName)}

                        <span class="client-phone">
                            ${duration} min · $${price}
                        </span>
                    </td>

                    <td>
                        ${escapeHTML(barberName)}
                    </td>

                    <td>
                        <span class="origin">
                            ${escapeHTML(
                                origins[appointment.origin] ||
                                "Otro"
                            )}
                        </span>
                    </td>

                    <td>
                        ${renderStatus(appointment.status)}
                    </td>

                    <td>
                        <div class="table-actions">
                            ${renderActions(appointment)}
                        </div>
                    </td>
                </tr>
            `;
        }
    ).join("");
}

/* ==========================================
   BOTONES DE ACCIONES
========================================== */

function actionButton(
    appointment,
    action,
    label,
    css = ""
) {
    return `
        <button
            type="button"
            class="mini-button ${css}"
            data-action="${action}"
            data-id="${escapeHTML(appointment.id)}"
        >
            ${label}
        </button>
    `;
}

function renderActions(appointment) {
    switch (appointment.status) {
        case "pending":
            return (
                actionButton(
                    appointment,
                    "confirmed",
                    "Confirmar"
                ) +
                actionButton(
                    appointment,
                    "cancelled",
                    "Cancelar",
                    "danger"
                )
            );

        case "confirmed":
            return (
                actionButton(
                    appointment,
                    "completed",
                    "Completar",
                    "success"
                ) +
                actionButton(
                    appointment,
                    "no-show",
                    "No asistió"
                ) +
                actionButton(
                    appointment,
                    "cancelled",
                    "Cancelar",
                    "danger"
                )
            );

        case "cancelled":
        case "no-show":
            return actionButton(
                appointment,
                "pending",
                "Restaurar"
            );

        case "completed":
            return `
                <span class="client-phone">
                    Finalizada
                </span>
            `;

        default:
            return "";
    }
}

/* ==========================================
   ACTUALIZAR ESTADO Y FIDELIDAD
========================================== */

async function updateStatus(
    appointmentId,
    newStatus
) {
    const allowedStatuses = [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "no-show"
    ];

    if (
        !allowedStatuses.includes(newStatus) ||
        updating
    ) {
        return;
    }

    updating = true;

    try {
        const appointmentRef = doc(
            db,
            "appointments",
            appointmentId
        );

        const cached = appointmentsCache.find(
            item => item.id === appointmentId
        );

        if (!cached) {
            throw new Error(
                "No se encontró la cita."
            );
        }

        let customerId = cached.customerId || "";

        if (
            newStatus === "completed" &&
            !customerId
        ) {
            const customer =
                await findCustomerByPhone(cached.phone);

            customerId = customer?.id || "";
        }

        const result = await runTransaction(
            db,
            async transaction => {
                const snapshot =
                    await transaction.get(appointmentRef);

                if (!snapshot.exists()) {
                    throw new Error(
                        "La cita ya no existe."
                    );
                }

                const appointment = snapshot.data();

                if (
                    appointment.status === "completed"
                ) {
                    throw new Error(
                        "La cita ya está completada."
                    );
                }

                if (
                    newStatus === "completed" &&
                    appointment.status !== "confirmed"
                ) {
                    throw new Error(
                        "Primero debes confirmar la cita."
                    );
                }

                if (
                    newStatus === "confirmed" &&
                    appointment.status !== "pending"
                ) {
                    throw new Error(
                        "Solo puedes confirmar citas pendientes."
                    );
                }

                if (
                    newStatus === "pending" &&
                    !["cancelled", "no-show"].includes(
                        appointment.status
                    )
                ) {
                    throw new Error(
                        "Esta cita no necesita restaurarse."
                    );
                }

                if (
                    ["cancelled", "no-show"].includes(newStatus) &&
                    !["pending", "confirmed"].includes(
                        appointment.status
                    )
                ) {
                    throw new Error(
                        "No puedes cambiar esta cita a ese estado."
                    );
                }

                const shouldApplyLoyalty =
                    newStatus === "completed" &&
                    !appointment.loyaltyApplied;

                let customerRef = null;

                if (shouldApplyLoyalty) {
                    const resolvedId =
                        appointment.customerId ||
                        customerId;

                    if (!resolvedId) {
                        throw new Error(
                            "No se encontró el cliente para acreditar la visita."
                        );
                    }

                    customerRef = doc(
                        db,
                        "customers",
                        resolvedId
                    );

                    const customerSnapshot =
                        await transaction.get(customerRef);

                    if (!customerSnapshot.exists()) {
                        throw new Error(
                            "El cliente no existe en Firestore."
                        );
                    }
                }

                const changes = {
                    status: newStatus,
                    updatedAt: serverTimestamp()
                };

                if (shouldApplyLoyalty) {
                    changes.loyaltyApplied = true;
                    changes.customerId =
                        appointment.customerId ||
                        customerId;
                }

                transaction.update(
                    appointmentRef,
                    changes
                );

                if (shouldApplyLoyalty) {
                    transaction.update(customerRef, {
                        visits: increment(1),
                        updatedAt: serverTimestamp()
                    });
                }

                return {
                    loyaltyAdded: shouldApplyLoyalty
                };
            }
        );

        await refreshAppointments();

        if (result.loyaltyAdded) {
            showToast(
                "Cita completada. +1 visita registrada."
            );
        } else {
            const messages = {
                confirmed: "Cita confirmada.",
                cancelled: "Cita cancelada.",
                pending: "Cita restaurada.",
                "no-show": "Cita marcada como no asistió.",
                completed: "Cita completada."
            };

            showToast(
                messages[newStatus] ||
                "Estado actualizado."
            );
        }

    } catch (error) {
        console.error(
            "Error actualizando cita:",
            error
        );

        showToast(
            error.message ||
            "No se pudo actualizar la cita."
        );

    } finally {
        updating = false;
    }
}

/* ==========================================
   CLIENTE DESDE OTRA PÁGINA
========================================== */

async function handleIncomingCustomerBooking() {
    const params = new URLSearchParams(
        window.location.search
    );

    if (params.get("new") !== "1") {
        return;
    }

    await openModal();

    const stored = sessionStorage.getItem(
        "barbershop_booking_customer"
    );

    if (stored) {
        try {
            const customer = JSON.parse(stored);

            phoneInput.value = customer.phone || "";
            nameInput.value = customer.name || "";

            await detectCustomer();

            showToast(
                `Agendando cita para ${
                    customer.name || "el cliente"
                }.`
            );

        } catch (error) {
            console.error(
                "Error cargando cliente:",
                error
            );

            showToast(
                "No se pudieron cargar los datos del cliente."
            );
        }
    }

    sessionStorage.removeItem(
        "barbershop_booking_customer"
    );

    window.history.replaceState(
        {},
        document.title,
        window.location.pathname
    );
}

/* ==========================================
   EVENTOS
========================================== */

function configureEvents() {
    document.getElementById("newAppointmentButton")
        ?.addEventListener("click", openModal);

    document.getElementById("closeModalButton")
        ?.addEventListener("click", closeModal);

    document.getElementById("cancelModalButton")
        ?.addEventListener("click", closeModal);

    saveButton.addEventListener(
        "click",
        saveNewAppointment
    );

    phoneInput.addEventListener(
        "input",
        detectCustomer
    );

    serviceSelect.addEventListener(
        "change",
        populateBarberSelector
    );

    dateInput.addEventListener(
        "change",
        populateBarberSelector
    );

    barberSelect.addEventListener("change", () => {
        selectedTime = "";
        renderTimes();
    });

    timeContainer.addEventListener(
        "click",
        event => {
            const button = event.target.closest(
                "[data-time]"
            );

            if (!button) {
                return;
            }

            selectedTime = button.dataset.time;

            renderTimes();
        }
    );

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeModal();
        }
    });

    document.querySelectorAll(".filter")
        .forEach(button => {
            button.addEventListener("click", () => {
                document.querySelectorAll(".filter")
                    .forEach(item => {
                        item.classList.remove("active");
                    });

                button.classList.add("active");

                currentFilter =
                    button.dataset.filter || "all";

                renderAppointments();
            });
        });

    appointmentsTable.addEventListener(
        "click",
        async event => {
            const button = event.target.closest(
                "[data-action]"
            );

            if (!button || updating) {
                return;
            }

            await updateStatus(
                button.dataset.id,
                button.dataset.action
            );
        }
    );

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Escape" &&
                !modal.classList.contains("hidden")
            ) {
                closeModal();
            }
        }
    );
}

/* ==========================================
   INICIALIZACIÓN
========================================== */

async function initialize() {
    const required = [
        appointmentsTable,
        modal,
        phoneInput,
        nameInput,
        serviceSelect,
        barberSelect,
        dateInput,
        originSelect,
        statusSelect,
        notesInput,
        timeContainer,
        customerDetection,
        saveButton
    ];

    if (required.some(element => !element)) {
        console.error(
            "Faltan elementos HTML en citas.html."
        );
        return;
    }

    configureEvents();

    appointmentsTable.innerHTML = `
        <tr>
            <td colspan="8">
                <div class="empty">
                    Cargando citas desde Firebase...
                </div>
            </td>
        </tr>
    `;

    try {
        await loadBookingData();
        await handleIncomingCustomerBooking();

    } catch (error) {
        console.error(
            "Error inicializando Citas:",
            error
        );

        appointmentsTable.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty">
                        No se pudieron cargar las citas de Firebase.
                    </div>
                </td>
            </tr>
        `;

        showToast(
            "Error cargando citas, servicios o barberos."
        );
    }
}

initialize();
