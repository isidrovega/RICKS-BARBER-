
import {
    services,
    barbers,
    origins,
    availableTimes,
    getLocalDate
} from "./data.js";

import {
    getAppointments,
    getCustomers,
    findCustomerByPhone,
    getOrCreateCustomer,
    saveAppointment,
    generateId,
    normalizePhone
} from "./storage.js";

let appointmentsCache = [];
let customersCache = [];
let selectedTime = "";
let saving = false;
let toastTimer;
let phoneSearchVersion = 0;

const modal = document.getElementById("appointmentModal");
const phoneInput = document.getElementById("appointmentPhone");
const nameInput = document.getElementById("appointmentName");
const serviceSelect = document.getElementById("appointmentService");
const barberSelect = document.getElementById("appointmentBarber");
const dateInput = document.getElementById("appointmentDate");
const originSelect = document.getElementById("appointmentOrigin");
const statusSelect = document.getElementById("appointmentStatus");
const notesInput = document.getElementById("appointmentNotes");
const timeContainer = document.getElementById("appointmentTimes");
const customerDetection = document.getElementById("customerDetection");
const saveButton = document.getElementById("saveAppointmentButton");

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function getService(id) {
    return services.find(item => item.id === id) || {
        name: "Servicio no disponible",
        price: 0,
        duration: 30
    };
}

function getBarber(id) {
    return barbers.find(item => item.id === id) || {
        name: "Barbero no disponible"
    };
}

function formatTime(time) {
    if (!time) return "—";

    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const hour = hours % 12 || 12;

    return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(`${value}T12:00:00`);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "short"
    }).format(date);
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

function statCard(label, value) {
    return `
        <article class="stat-card">
            <span>${escapeHTML(label)}</span>
            <strong>${escapeHTML(value)}</strong>
        </article>
    `;
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

function populateSelectors() {
    serviceSelect.innerHTML = services.map(service => `
        <option value="${escapeHTML(service.id)}">
            ${escapeHTML(service.name)} · $${escapeHTML(service.price)}
        </option>
    `).join("");

    barberSelect.innerHTML = barbers.map(barber => `
        <option value="${escapeHTML(barber.id)}">
            ${escapeHTML(barber.name)}
        </option>
    `).join("");
}

function configureEvents() {
    document.getElementById("newAppointmentButton")
        ?.addEventListener("click", openModal);

    document.getElementById("quickNewAppointment")
        ?.addEventListener("click", openModal);

    document.getElementById("closeModalButton")
        ?.addEventListener("click", closeModal);

    document.getElementById("cancelModalButton")
        ?.addEventListener("click", closeModal);

    saveButton?.addEventListener("click", saveNewAppointment);

    document.getElementById("qrButton")
        ?.addEventListener("click", () => {
            showToast("El escáner QR será el siguiente módulo.");
        });

    phoneInput.addEventListener("input", detectCustomer);

    barberSelect.addEventListener("change", renderTimes);
    serviceSelect.addEventListener("change", renderTimes);
    dateInput.addEventListener("change", renderTimes);

    timeContainer.addEventListener("click", event => {
        const button = event.target.closest("[data-time]");

        if (!button) return;

        selectedTime = button.dataset.time;
        renderTimes();
    });

    modal.addEventListener("click", event => {
        if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", event => {
        if (
            event.key === "Escape" &&
            !modal.classList.contains("hidden")
        ) {
            closeModal();
        }
    });
}

async function refreshData() {
    const [appointments, customers] = await Promise.all([
        getAppointments(),
        getCustomers()
    ]);

    appointmentsCache = appointments;
    customersCache = customers;

    renderDashboard();
}

function renderDashboard() {
    const today = getLocalDate();

    const todayAppointments = appointmentsCache.filter(
        appointment =>
            appointment.date === today &&
            appointment.status !== "cancelled"
    );

    const completed = appointmentsCache.filter(
        appointment => appointment.status === "completed"
    );

    const revenue = completed.reduce((total, appointment) => {
        const service = getService(appointment.serviceId);

        return total + Number(
            appointment.price ?? service.price ?? 0
        );
    }, 0);

    const stats = document.getElementById("dashboardStats");

    if (stats) {
        stats.innerHTML = `
            ${statCard("Citas de hoy", todayAppointments.length)}
            ${statCard("Clientes", customersCache.length)}
            ${statCard("Completadas", completed.length)}
            ${statCard(
                "Ingresos registrados",
                `$${revenue.toLocaleString("es-MX")}`
            )}
        `;
    }

    renderUpcomingAppointments();
}

function renderUpcomingAppointments() {
    const container = document.getElementById(
        "dashboardAppointments"
    );

    if (!container) return;

    const now = new Date();
    const today = getLocalDate();
    const currentTime = [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0")
    ].join(":");

    const upcoming = appointmentsCache
        .filter(appointment => {
            const active = ["pending", "confirmed"].includes(
                appointment.status
            );

            const future =
                appointment.date > today ||
                (
                    appointment.date === today &&
                    appointment.time >= currentTime
                );

            return active && future;
        })
        .sort((a, b) =>
            `${a.date} ${a.time}`.localeCompare(
                `${b.date} ${b.time}`
            )
        )
        .slice(0, 7);

    if (!upcoming.length) {
        container.innerHTML = `
            <div class="empty">No hay próximas citas.</div>
        `;
        return;
    }

    container.innerHTML = upcoming.map(appointment => {
        const service = getService(appointment.serviceId);
        const barber = getBarber(appointment.barberId);

        return `
            <div class="dashboard-appointment">
                <div class="appointment-time">
                    ${formatTime(appointment.time)}
                </div>

                <div class="appointment-client">
                    <strong>
                        ${escapeHTML(appointment.clientName)}
                    </strong>

                    <span>
                        ${escapeHTML(service.name)}
                        · ${formatDate(appointment.date)}
                        · ${escapeHTML(
                            origins[appointment.origin] || "Otro"
                        )}
                    </span>
                </div>

                <div class="appointment-barber">
                    ${escapeHTML(barber.name)}
                </div>

                <div class="appointment-status">
                    ${renderStatus(appointment.status)}
                </div>
            </div>
        `;
    }).join("");
}

async function openModal() {
    resetForm();

    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    setTimeout(() => phoneInput.focus(), 50);

    try {
        appointmentsCache = await getAppointments();
        renderTimes();
    } catch (error) {
        console.error("Error cargando horarios:", error);
        showToast("No se pudieron actualizar los horarios.");
    }
}

function closeModal() {
    modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    phoneSearchVersion++;
}

function resetForm() {
    phoneInput.value = "";
    nameInput.value = "";
    notesInput.value = "";
    customerDetection.innerHTML = "";

    originSelect.value = "whatsapp";
    statusSelect.value = "confirmed";

    dateInput.min = getLocalDate();
    dateInput.value = getLocalDate();

    serviceSelect.value = services[0]?.id || "";
    barberSelect.value = barbers[0]?.id || "";

    selectedTime = "";
    renderTimes();
}

async function detectCustomer() {
    const version = ++phoneSearchVersion;
    const phone = phoneInput.value.trim();

    if (normalizePhone(phone).length < 7) {
        customerDetection.innerHTML = "";
        return;
    }

    customerDetection.textContent = "Buscando cliente...";

    try {
        const customer = await findCustomerByPhone(phone);

        if (version !== phoneSearchVersion) return;

        if (customer) {
            nameInput.value = customer.name;

            customerDetection.innerHTML = `
                <div class="customer-found">
                    ✓ Cliente encontrado:
                    <strong>${escapeHTML(customer.name)}</strong>
                    · ${Number(customer.visits || 0)} visitas
                </div>
            `;
        } else {
            customerDetection.innerHTML = `
                <div class="customer-new">
                    Cliente nuevo. Se registrará al guardar.
                </div>
            `;
        }
    } catch (error) {
        if (version !== phoneSearchVersion) return;

        console.error("Error buscando cliente:", error);
        customerDetection.textContent =
            "No se pudo verificar el teléfono.";
    }
}

function minutesFromTime(time) {
    const [hours, minutes] = String(time).split(":").map(Number);
    return hours * 60 + minutes;
}

function getAvailableTimes(date, barberId) {
    if (!date || !barberId) return [];

    const service = getService(serviceSelect.value);
    const duration = Number(service.duration) || 30;

    const occupied = appointmentsCache.filter(
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

        const overlaps = occupied.some(appointment => {
            const otherStart = minutesFromTime(
                appointment.time
            );

            const otherDuration = Number(
                appointment.duration ??
                getService(appointment.serviceId).duration
            ) || 30;

            const otherEnd = otherStart + otherDuration;

            return start < otherEnd && end > otherStart;
        });

        return !overlaps;
    });
}

function renderTimes() {
    const times = getAvailableTimes(
        dateInput.value,
        barberSelect.value
    );

    if (!times.includes(selectedTime)) {
        selectedTime = times[0] || "";
    }

    if (!times.length) {
        timeContainer.innerHTML = `
            <div class="empty" style="grid-column: 1 / -1;">
                No hay horarios disponibles.
            </div>
        `;
        return;
    }

    timeContainer.innerHTML = times.map(time => `
        <button
            type="button"
            class="time-button ${
                selectedTime === time ? "selected" : ""
            }"
            data-time="${time}"
        >
            ${formatTime(time)}
        </button>
    `).join("");
}

async function saveNewAppointment() {
    if (saving) return;

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const date = dateInput.value;

    if (!name || normalizePhone(phone).length < 7) {
        showToast("Ingresa un nombre y teléfono válido.");
        return;
    }

    if (!date || date < getLocalDate() || !selectedTime) {
        showToast("Selecciona una fecha y horario válidos.");
        return;
    }

    saving = true;
    saveButton.disabled = true;

    try {
        appointmentsCache = await getAppointments();

        const available = getAvailableTimes(
            date,
            barberSelect.value
        );

        if (!available.includes(selectedTime)) {
            renderTimes();
            showToast("Ese horario ya no está disponible.");
            return;
        }

        const customer = await getOrCreateCustomer(
            name,
            phone
        );

        const service = getService(serviceSelect.value);

        const appointment = {
            id: generateId("appointment"),
            customerId: customer.id,
            date,
            time: selectedTime,
            clientName: name,
            phone,
            serviceId: serviceSelect.value,
            barberId: barberSelect.value,
            origin: originSelect.value,
            status: statusSelect.value,
            notes: notesInput.value.trim(),
            price: Number(service.price) || 0,
            duration: Number(service.duration) || 30,
            loyaltyApplied: false,
            createdAt: new Date().toISOString()
        };

        await saveAppointment(appointment);
        await refreshData();

        closeModal();
        showToast(`Cita de ${name} registrada.`);
    } catch (error) {
        console.error("Error guardando cita:", error);
        showToast("No se pudo guardar la cita en Firebase.");
    } finally {
        saving = false;
        saveButton.disabled = false;
    }
}

async function initialize() {
    populateSelectors();
    configureEvents();

    try {
        await refreshData();
    } catch (error) {
        console.error("Error cargando Dashboard:", error);

        const container = document.getElementById(
            "dashboardAppointments"
        );

        if (container) {
            container.innerHTML = `
                <div class="empty">
                    Error al cargar datos de Firebase.
                </div>
            `;
        }

        showToast("No se pudieron cargar los datos.");
    }
}

initialize();
