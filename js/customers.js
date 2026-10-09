
import { services, barbers } from "./data.js";

import {
    getCustomers,
    getAppointments,
    saveCustomer,
    findCustomerByPhone,
    addCustomerVisit,
    normalizePhone,
    generateId
} from "./storage.js";

/* =====================================================
   STATE
===================================================== */

let customersCache = [];
let appointmentsCache = [];
let selectedCustomerId = null;
let searchTerm = "";
let toastTimer = null;
let loading = false;
let savingCustomer = false;
let addingVisit = false;

/* =====================================================
   ELEMENTS
===================================================== */

const customersGrid = document.getElementById("customersGrid");
const customerSearch = document.getElementById("customerSearch");
const customerResultCount = document.getElementById("customerResultCount");
const customerModal = document.getElementById("customerModal");
const newCustomerModal = document.getElementById("newCustomerModal");

const closeCustomerModalButton =
    document.getElementById("closeCustomerModal");

const closeNewCustomerModalButton =
    document.getElementById("closeNewCustomerModal");

const newCustomerButton =
    document.getElementById("newCustomerButton");

const cancelNewCustomerButton =
    document.getElementById("cancelNewCustomer");

const saveNewCustomerButton =
    document.getElementById("saveNewCustomer");

const addVisitButton =
    document.getElementById("addVisitButton");

const bookCustomerButton =
    document.getElementById("bookCustomerButton");

/* =====================================================
   INITIALIZE
===================================================== */

async function initialize() {
    configureEvents();
    await refreshData();
}

async function refreshData() {
    if (loading) return;

    loading = true;

    try {
        customersGrid.innerHTML = `
            <div class="panel" style="grid-column: 1 / -1;">
                <div class="empty">Cargando clientes...</div>
            </div>
        `;

        const [customers, appointments] = await Promise.all([
            getCustomers(),
            getAppointments()
        ]);

        customersCache = customers;
        appointmentsCache = appointments;

        renderStats();
        renderCustomers();
    } catch (error) {
        console.error("Error cargando clientes:", error);

        customersGrid.innerHTML = `
            <div class="panel" style="grid-column: 1 / -1;">
                <div class="empty">
                    No fue posible cargar los clientes.
                    Revisa la conexión y los permisos de Firebase.
                </div>
            </div>
        `;

        customerResultCount.textContent = "Error de conexión";
        showToast("No se pudieron cargar los datos de Firebase.");
    } finally {
        loading = false;
    }
}

/* =====================================================
   EVENTS
===================================================== */

function configureEvents() {
    customerSearch.addEventListener("input", event => {
        searchTerm = event.target.value.trim().toLowerCase();
        renderCustomers();
    });

    newCustomerButton.addEventListener(
        "click",
        openNewCustomerModal
    );

    closeCustomerModalButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        closeCustomerModal();
    });

    closeNewCustomerModalButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        closeNewCustomerModal();
    });

    cancelNewCustomerButton.addEventListener("click", event => {
        event.preventDefault();
        closeNewCustomerModal();
    });

    saveNewCustomerButton.addEventListener(
        "click",
        saveNewCustomer
    );

    addVisitButton.addEventListener(
        "click",
        addVisitToSelectedCustomer
    );

    bookCustomerButton.addEventListener(
        "click",
        bookSelectedCustomer
    );

    customersGrid.addEventListener(
        "click",
        handleCustomerGridClick
    );

    customerModal.addEventListener("click", event => {
        if (event.target === customerModal) {
            closeCustomerModal();
        }
    });

    newCustomerModal.addEventListener("click", event => {
        if (event.target === newCustomerModal) {
            closeNewCustomerModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        if (!customerModal.classList.contains("hidden")) {
            closeCustomerModal();
            return;
        }

        if (!newCustomerModal.classList.contains("hidden")) {
            closeNewCustomerModal();
        }
    });
}

/* =====================================================
   MODAL CONTROL
===================================================== */

function openCustomerModalElement() {
    customerModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
}

function closeCustomerModal() {
    customerModal.classList.add("hidden");
    selectedCustomerId = null;
    unlockBodyIfNecessary();
}

function openNewCustomerModal() {
    document.getElementById("newCustomerName").value = "";
    document.getElementById("newCustomerPhone").value = "";

    newCustomerModal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    setTimeout(() => {
        document.getElementById("newCustomerName").focus();
    }, 50);
}

function closeNewCustomerModal() {
    newCustomerModal.classList.add("hidden");
    unlockBodyIfNecessary();
}

function unlockBodyIfNecessary() {
    const customerClosed =
        customerModal.classList.contains("hidden");

    const newCustomerClosed =
        newCustomerModal.classList.contains("hidden");

    if (customerClosed && newCustomerClosed) {
        document.body.classList.remove("modal-open");
    }
}

/* =====================================================
   LOYALTY
===================================================== */

function getLoyaltyData(customer) {
    const visits = Math.max(0, Number(customer.visits || 0));

    const redeemed = Math.max(
        0,
        Number(customer.rewardsRedeemed || 0)
    );

    const earned = Math.floor(visits / 5);
    const availableRewards = Math.max(0, earned - redeemed);

    let progress = visits % 5;

    if (availableRewards > 0 && progress === 0) {
        progress = 5;
    }

    return {
        visits,
        availableRewards,
        progress,
        remaining: progress === 5 ? 0 : 5 - progress
    };
}

function renderSmallStamps(progress) {
    return Array.from({ length: 5 }, (_, index) => `
        <div class="loyalty-stamp-small ${
            index < progress ? "active" : ""
        }">
            ${index < progress ? "✂" : index + 1}
        </div>
    `).join("");
}

/* =====================================================
   STATS
===================================================== */

function renderStats() {
    const completed = appointmentsCache.filter(
        appointment => appointment.status === "completed"
    );

    const frequentCustomers = customersCache.filter(
        customer => Number(customer.visits || 0) >= 3
    );

    const rewards = customersCache.filter(
        customer => getLoyaltyData(customer).availableRewards > 0
    );

    document.getElementById("customerStats").innerHTML = `
        ${statCard("Total clientes", customersCache.length)}
        ${statCard("Clientes frecuentes", frequentCustomers.length)}
        ${statCard("Visitas completadas", completed.length)}
        ${statCard("Recompensas disponibles", rewards.length)}
    `;
}

/* =====================================================
   CUSTOMER LIST
===================================================== */

function renderCustomers() {
    const filtered = customersCache.filter(customer => {
        if (!searchTerm) return true;

        const name = String(customer.name || "").toLowerCase();
        const phone = normalizePhone(customer.phone);
        const normalizedSearch = normalizePhone(searchTerm);

        return (
            name.includes(searchTerm) ||
            (
                normalizedSearch.length > 0 &&
                phone.includes(normalizedSearch)
            )
        );
    });

    customerResultCount.textContent =
        `${filtered.length} ${
            filtered.length === 1 ? "cliente" : "clientes"
        }`;

    if (!filtered.length) {
        customersGrid.innerHTML = `
            <div class="panel" style="grid-column: 1 / -1;">
                <div class="empty">
                    No se encontraron clientes.
                </div>
            </div>
        `;
        return;
    }

    customersGrid.innerHTML = filtered.map(customer => {
        const customerAppointments = getCustomerAppointments(
            customer,
            appointmentsCache
        );

        const lastAppointment = getLastAppointment(
            customerAppointments
        );

        const loyalty = getLoyaltyData(customer);

        return `
            <article class="customer-card">
                <div class="customer-card-top">
                    <div class="customer-avatar">
                        ${getInitials(customer.name)}
                    </div>

                    <div class="customer-card-name">
                        <h3>${escapeHTML(customer.name)}</h3>
                        <p>${escapeHTML(customer.phone)}</p>
                    </div>
                </div>

                <div class="customer-card-info">
                    <div class="customer-info-box">
                        <span>Visitas</span>
                        <strong>${loyalty.visits}</strong>
                    </div>

                    <div class="customer-info-box">
                        <span>Última cita</span>
                        <strong>
                            ${
                                lastAppointment
                                    ? formatDate(lastAppointment.date)
                                    : "—"
                            }
                        </strong>
                    </div>
                </div>

                <div class="customer-loyalty-label">
                    <strong>Fidelidad</strong>
                    <span>${loyalty.progress}/5</span>
                </div>

                <div class="loyalty-stamps-small">
                    ${renderSmallStamps(loyalty.progress)}
                </div>

                <div class="customer-card-actions">
                    <button
                        type="button"
                        class="btn btn-outline"
                        data-action="view"
                        data-customer-id="${escapeHTML(customer.id)}"
                    >
                        Ver cliente
                    </button>

                    <button
                        type="button"
                        class="btn btn-dark"
                        data-action="book"
                        data-customer-id="${escapeHTML(customer.id)}"
                    >
                        Agendar
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

/* =====================================================
   CUSTOMER GRID ACTIONS
===================================================== */

function handleCustomerGridClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const customerId = button.dataset.customerId;
    const action = button.dataset.action;

    if (action === "view") {
        openCustomerModal(customerId);
        return;
    }

    if (action === "book") {
        selectedCustomerId = customerId;
        bookSelectedCustomer();
    }
}

/* =====================================================
   OPEN CUSTOMER
===================================================== */

function openCustomerModal(customerId) {
    const customer = customersCache.find(
        item => item.id === customerId
    );

    if (!customer) {
        showToast("No se encontró el cliente.");
        return;
    }

    selectedCustomerId = customer.id;

    const appointments = getCustomerAppointments(
        customer,
        appointmentsCache
    );

    const completed = appointments.filter(
        appointment => appointment.status === "completed"
    ).length;

    const cancelled = appointments.filter(
        appointment => appointment.status === "cancelled"
    ).length;

    document.getElementById("customerModalName").textContent =
        customer.name;

    document.getElementById("customerModalPhone").textContent =
        customer.phone;

    document.getElementById("modalVisits").textContent =
        Number(customer.visits || 0);

    document.getElementById("modalAppointments").textContent =
        appointments.length;

    document.getElementById("modalCompleted").textContent =
        completed;

    document.getElementById("modalCancelled").textContent =
        cancelled;

    renderCustomerLoyalty(customer);
    renderCustomerHistory(appointments);
    openCustomerModalElement();
}

/* =====================================================
   CUSTOMER LOYALTY
===================================================== */

function renderCustomerLoyalty(customer) {
    const loyalty = getLoyaltyData(customer);

    const stamps = document.getElementById(
        "modalLoyaltyStamps"
    );

    stamps.innerHTML = Array.from(
        { length: 5 },
        (_, index) => {
            const active = index < loyalty.progress;

            return `
                <div class="loyalty-stamp ${
                    active ? "active" : ""
                }">
                    ${active ? "✂" : index + 1}
                </div>
            `;
        }
    ).join("");

    document.getElementById("modalLoyaltyProgress").style.width =
        `${(loyalty.progress / 5) * 100}%`;

    const description = document.getElementById(
        "loyaltyDescription"
    );

    if (loyalty.availableRewards > 0) {
        description.textContent =
            `${loyalty.availableRewards} recompensa(s) disponible(s).`;
    } else {
        description.textContent =
            `${loyalty.progress}/5 visitas · Faltan ${
                loyalty.remaining
            } para la recompensa.`;
    }
}

/* =====================================================
   HISTORY
===================================================== */

function renderCustomerHistory(appointments) {
    const container = document.getElementById("customerHistory");

    if (!appointments.length) {
        container.innerHTML = `
            <div class="empty">
                Este cliente todavía no tiene citas registradas.
            </div>
        `;
        return;
    }

    const sorted = [...appointments].sort(
        (a, b) =>
            `${b.date} ${b.time}`.localeCompare(
                `${a.date} ${a.time}`
            )
    );

    container.innerHTML = sorted.map(appointment => {
        const service = getService(appointment.serviceId);
        const barber = getBarber(appointment.barberId);

        return `
            <div class="history-row">
                <div class="history-date">
                    <strong>${formatDate(appointment.date)}</strong>
                    <span>${formatTime(appointment.time)}</span>
                </div>

                <div class="history-service">
                    <strong>${escapeHTML(service.name)}</strong>
                    <span>
                        $${escapeHTML(service.price)}
                        ·
                        ${escapeHTML(service.duration)} min
                    </span>
                </div>

                <div class="history-barber">
                    ${escapeHTML(barber.name)}
                </div>

                <div class="history-status">
                    ${renderStatus(appointment.status)}
                </div>
            </div>
        `;
    }).join("");
}

/* =====================================================
   ADD VISIT
===================================================== */

async function addVisitToSelectedCustomer() {
    if (!selectedCustomerId || addingVisit) return;

    const customer = customersCache.find(
        item => item.id === selectedCustomerId
    );

    if (!customer) {
        showToast("No se encontró el cliente.");
        return;
    }

    const confirmed = window.confirm(
        `¿Registrar una visita adicional para ${customer.name}?\n\n` +
        "Esta acción sumará un punto de fidelidad. " +
        "No la uses si la cita completada ya otorgó ese punto."
    );

    if (!confirmed) return;

    addingVisit = true;
    addVisitButton.disabled = true;

    try {
        const success = await addCustomerVisit(customer.phone);

        if (!success) {
            showToast("No se pudo registrar la visita.");
            return;
        }

        const customerId = customer.id;

        await refreshData();
        openCustomerModal(customerId);

        showToast(`${customer.name}: +1 visita registrada.`);
    } catch (error) {
        console.error("Error registrando visita:", error);
        showToast("Error al registrar la visita en Firebase.");
    } finally {
        addingVisit = false;
        addVisitButton.disabled = false;
    }
}

/* =====================================================
   BOOK CUSTOMER
===================================================== */

function bookSelectedCustomer() {
    if (!selectedCustomerId) return;

    const customer = customersCache.find(
        item => item.id === selectedCustomerId
    );

    if (!customer) {
        showToast("No se encontró el cliente.");
        return;
    }

    sessionStorage.setItem(
        "barbershop_booking_customer",
        JSON.stringify({
            id: customer.id,
            name: customer.name,
            phone: customer.phone
        })
    );

    window.location.href = "citas.html?new=1";
}

/* =====================================================
   NEW CUSTOMER
===================================================== */

async function saveNewCustomer() {
    if (savingCustomer) return;

    const name = document
        .getElementById("newCustomerName")
        .value.trim();

    const phone = document
        .getElementById("newCustomerPhone")
        .value.trim();

    if (!name) {
        showToast("Ingresa el nombre del cliente.");
        return;
    }

    if (normalizePhone(phone).length < 7) {
        showToast("Ingresa un teléfono válido.");
        return;
    }

    savingCustomer = true;
    saveNewCustomerButton.disabled = true;

    try {
        const existingCustomer = await findCustomerByPhone(phone);

        if (existingCustomer) {
            showToast("Ya existe un cliente con ese teléfono.");
            return;
        }

        const customer = {
            id: generateId("customer"),
            name,
            phone,
            normalizedPhone: normalizePhone(phone),
            visits: 0,
            rewardsRedeemed: 0,
            createdAt: new Date().toISOString()
        };

        await saveCustomer(customer);

        closeNewCustomerModal();
        await refreshData();

        showToast(`${name} fue registrado correctamente.`);
    } catch (error) {
        console.error("Error creando cliente:", error);
        showToast("No se pudo guardar el cliente en Firebase.");
    } finally {
        savingCustomer = false;
        saveNewCustomerButton.disabled = false;
    }
}

/* =====================================================
   CUSTOMER APPOINTMENTS
===================================================== */

function getCustomerAppointments(customer, appointments) {
    const customerPhone = normalizePhone(customer.phone);

    return appointments.filter(appointment => {
        if (
            appointment.customerId &&
            appointment.customerId === customer.id
        ) {
            return true;
        }

        return (
            !appointment.customerId &&
            customerPhone.length > 0 &&
            normalizePhone(appointment.phone) === customerPhone
        );
    });
}

/* =====================================================
   LAST APPOINTMENT
===================================================== */

function getLastAppointment(appointments) {
    if (!appointments.length) return null;

    const now = new Date();
    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");

    const pastAppointments = appointments.filter(
        appointment => appointment.date <= today
    );

    if (!pastAppointments.length) return null;

    return [...pastAppointments].sort(
        (a, b) =>
            `${b.date} ${b.time}`.localeCompare(
                `${a.date} ${a.time}`
            )
    )[0];
}

/* =====================================================
   INITIALS
===================================================== */

function getInitials(name) {
    return String(name || "")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join("");
}

/* =====================================================
   SERVICE
===================================================== */

function getService(id) {
    return (
        services.find(service => service.id === id) || {
            name: "Servicio no disponible",
            price: "—",
            duration: "—"
        }
    );
}

/* =====================================================
   BARBER
===================================================== */

function getBarber(id) {
    return (
        barbers.find(barber => barber.id === id) || {
            name: "Barbero no disponible"
        }
    );
}

/* =====================================================
   FORMAT DATE
===================================================== */

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

/* =====================================================
   FORMAT TIME
===================================================== */

function formatTime(time) {
    if (!time || !String(time).includes(":")) return "—";

    const [hours, minutes] = String(time)
        .split(":")
        .map(Number);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return "—";
    }

    const period = hours >= 12 ? "PM" : "AM";
    const hour = hours % 12 || 12;

    return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

/* =====================================================
   STATUS
===================================================== */

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

/* =====================================================
   STAT CARD
===================================================== */

function statCard(label, value) {
    return `
        <article class="stat-card">
            <span>${escapeHTML(label)}</span>
            <strong>${escapeHTML(value)}</strong>
        </article>
    `;
}

/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

/* =====================================================
   TOAST
===================================================== */

function showToast(message) {
    const toast = document.getElementById("toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

/* =====================================================
   START
===================================================== */

initialize();
