import {
    services,
    barbers
} from "./data.js";

import {
    getCustomers,
    saveCustomers,
    getAppointments,
    normalizePhone,
    generateId
} from "./storage.js";


/* =====================================================
   STATE
===================================================== */

let selectedCustomerId = null;
let searchTerm = "";
let toastTimer = null;


/* =====================================================
   ELEMENTS
===================================================== */

const customersGrid =
    document.getElementById("customersGrid");

const customerSearch =
    document.getElementById("customerSearch");

const customerResultCount =
    document.getElementById("customerResultCount");

const customerModal =
    document.getElementById("customerModal");

const newCustomerModal =
    document.getElementById("newCustomerModal");

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

function initialize() {
    configureEvents();
    renderCustomers();
    renderStats();
}


/* =====================================================
   EVENTS
===================================================== */

function configureEvents() {

    customerSearch.addEventListener(
        "input",
        event => {
            searchTerm =
                event.target.value
                    .trim()
                    .toLowerCase();

            renderCustomers();
        }
    );


    newCustomerButton.addEventListener(
        "click",
        openNewCustomerModal
    );


    /*
     * Cerrar detalle del cliente con X
     */
    closeCustomerModalButton.addEventListener(
        "click",
        event => {
            event.preventDefault();
            event.stopPropagation();

            closeCustomerModal();
        }
    );


    /*
     * Cerrar modal nuevo cliente con X
     */
    closeNewCustomerModalButton.addEventListener(
        "click",
        event => {
            event.preventDefault();
            event.stopPropagation();

            closeNewCustomerModal();
        }
    );


    cancelNewCustomerButton.addEventListener(
        "click",
        event => {
            event.preventDefault();

            closeNewCustomerModal();
        }
    );


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


    /*
     * Cerrar detalle haciendo clic
     * directamente sobre el fondo oscuro.
     */
    customerModal.addEventListener(
        "click",
        event => {
            if (event.target === customerModal) {
                closeCustomerModal();
            }
        }
    );


    /*
     * Cerrar nuevo cliente haciendo clic
     * directamente sobre el fondo oscuro.
     */
    newCustomerModal.addEventListener(
        "click",
        event => {
            if (event.target === newCustomerModal) {
                closeNewCustomerModal();
            }
        }
    );


    /*
     * ESC cierra cualquier modal abierto.
     */
    document.addEventListener(
        "keydown",
        event => {

            if (event.key !== "Escape") {
                return;
            }

            if (
                !customerModal.classList.contains(
                    "hidden"
                )
            ) {
                closeCustomerModal();
                return;
            }

            if (
                !newCustomerModal.classList.contains(
                    "hidden"
                )
            ) {
                closeNewCustomerModal();
            }
        }
    );

}


/* =====================================================
   MODAL CONTROL
===================================================== */

function openCustomerModalElement() {

    customerModal.classList.remove(
        "hidden"
    );

    document.body.classList.add(
        "modal-open"
    );

}


function closeCustomerModal() {

    customerModal.classList.add(
        "hidden"
    );

    selectedCustomerId = null;

    unlockBodyIfNecessary();

}


function openNewCustomerModal() {

    document.getElementById(
        "newCustomerName"
    ).value = "";

    document.getElementById(
        "newCustomerPhone"
    ).value = "";

    newCustomerModal.classList.remove(
        "hidden"
    );

    document.body.classList.add(
        "modal-open"
    );

    setTimeout(
        () => {
            document
                .getElementById(
                    "newCustomerName"
                )
                .focus();
        },
        50
    );

}


function closeNewCustomerModal() {

    newCustomerModal.classList.add(
        "hidden"
    );

    unlockBodyIfNecessary();

}


function unlockBodyIfNecessary() {

    const customerClosed =
        customerModal.classList.contains(
            "hidden"
        );

    const newCustomerClosed =
        newCustomerModal.classList.contains(
            "hidden"
        );

    if (
        customerClosed &&
        newCustomerClosed
    ) {
        document.body.classList.remove(
            "modal-open"
        );
    }

}


/* =====================================================
   STATS
===================================================== */

function renderStats() {

    const customers =
        getCustomers();

    const appointments =
        getAppointments();

    const completed =
        appointments.filter(
            appointment =>
                appointment.status ===
                "completed"
        );

    const frequentCustomers =
        customers.filter(
            customer =>
                customer.visits >= 3
        );

    const rewards =
        customers.filter(
            customer =>
                getLoyaltyProgress(
                    customer.visits
                ) === 5
        );


    document.getElementById(
        "customerStats"
    ).innerHTML = `
        ${statCard(
            "Total clientes",
            customers.length
        )}

        ${statCard(
            "Clientes frecuentes",
            frequentCustomers.length
        )}

        ${statCard(
            "Visitas completadas",
            completed.length
        )}

        ${statCard(
            "Recompensas disponibles",
            rewards.length
        )}
    `;

}


/* =====================================================
   CUSTOMER LIST
===================================================== */

function renderCustomers() {

    const customers =
        getCustomers();

    const appointments =
        getAppointments();


    const filtered =
        customers.filter(
            customer => {

                if (!searchTerm) {
                    return true;
                }

                const name =
                    customer.name
                        .toLowerCase();

                const phone =
                    normalizePhone(
                        customer.phone
                    );

                const normalizedSearch =
                    normalizePhone(
                        searchTerm
                    );

                const nameMatches =
                    name.includes(
                        searchTerm
                    );

                const phoneMatches =
                    normalizedSearch.length > 0 &&
                    phone.includes(
                        normalizedSearch
                    );

                return (
                    nameMatches ||
                    phoneMatches
                );
            }
        );


    customerResultCount.textContent =
        `${filtered.length} ${
            filtered.length === 1
                ? "cliente"
                : "clientes"
        }`;


    if (!filtered.length) {

        customersGrid.innerHTML = `
            <div
                class="panel"
                style="grid-column: 1 / -1;"
            >
                <div class="empty">
                    No se encontraron clientes.
                </div>
            </div>
        `;

        return;
    }


    customersGrid.innerHTML =
        filtered
            .map(
                customer => {

                    const customerAppointments =
                        getCustomerAppointments(
                            customer,
                            appointments
                        );

                    const lastAppointment =
                        getLastAppointment(
                            customerAppointments
                        );

                    const loyalty =
                        getLoyaltyProgress(
                            customer.visits
                        );


                    return `
                        <article class="customer-card">

                            <div class="customer-card-top">

                                <div class="customer-avatar">
                                    ${getInitials(
                                        customer.name
                                    )}
                                </div>

                                <div class="customer-card-name">

                                    <h3>
                                        ${escapeHTML(
                                            customer.name
                                        )}
                                    </h3>

                                    <p>
                                        ${escapeHTML(
                                            customer.phone
                                        )}
                                    </p>

                                </div>

                            </div>


                            <div class="customer-card-info">

                                <div class="customer-info-box">

                                    <span>
                                        Visitas
                                    </span>

                                    <strong>
                                        ${customer.visits}
                                    </strong>

                                </div>


                                <div class="customer-info-box">

                                    <span>
                                        Última cita
                                    </span>

                                    <strong>
                                        ${
                                            lastAppointment
                                                ? formatDate(
                                                    lastAppointment.date
                                                )
                                                : "—"
                                        }
                                    </strong>

                                </div>

                            </div>


                            <div class="customer-loyalty-label">

                                <strong>
                                    Fidelidad
                                </strong>

                                <span>
                                    ${loyalty}/5
                                </span>

                            </div>


                            <div class="loyalty-stamps-small">
                                ${renderSmallStamps(
                                    loyalty
                                )}
                            </div>


                            <div class="customer-card-actions">

                                <button
                                    type="button"
                                    class="btn btn-outline"
                                    data-action="view"
                                    data-customer-id="${customer.id}"
                                >
                                    Ver cliente
                                </button>

                                <button
                                    type="button"
                                    class="btn btn-dark"
                                    data-action="book"
                                    data-customer-id="${customer.id}"
                                >
                                    Agendar
                                </button>

                            </div>

                        </article>
                    `;
                }
            )
            .join("");

}


/* =====================================================
   CUSTOMER GRID ACTIONS
===================================================== */

function handleCustomerGridClick(event) {

    const button =
        event.target.closest(
            "[data-action]"
        );

    if (!button) {
        return;
    }

    const customerId =
        button.dataset.customerId;

    const action =
        button.dataset.action;


    if (action === "view") {

        openCustomerModal(
            customerId
        );

        return;
    }


    if (action === "book") {

        selectedCustomerId =
            customerId;

        bookSelectedCustomer();
    }

}


/* =====================================================
   OPEN CUSTOMER
===================================================== */

function openCustomerModal(customerId) {

    const customers =
        getCustomers();

    const customer =
        customers.find(
            item =>
                item.id ===
                customerId
        );

    if (!customer) {

        showToast(
            "No se encontró el cliente."
        );

        return;
    }


    selectedCustomerId =
        customer.id;


    const appointments =
        getCustomerAppointments(
            customer,
            getAppointments()
        );


    const completed =
        appointments.filter(
            appointment =>
                appointment.status ===
                "completed"
        ).length;


    const cancelled =
        appointments.filter(
            appointment =>
                appointment.status ===
                "cancelled"
        ).length;


    document.getElementById(
        "customerModalName"
    ).textContent =
        customer.name;


    document.getElementById(
        "customerModalPhone"
    ).textContent =
        customer.phone;


    document.getElementById(
        "modalVisits"
    ).textContent =
        customer.visits;


    document.getElementById(
        "modalAppointments"
    ).textContent =
        appointments.length;


    document.getElementById(
        "modalCompleted"
    ).textContent =
        completed;


    document.getElementById(
        "modalCancelled"
    ).textContent =
        cancelled;


    renderCustomerLoyalty(
        customer
    );


    renderCustomerHistory(
        appointments
    );


    openCustomerModalElement();

}


/* =====================================================
   LOYALTY
===================================================== */

function renderCustomerLoyalty(
    customer
) {

    const progress =
        getLoyaltyProgress(
            customer.visits
        );


    const stamps =
        document.getElementById(
            "modalLoyaltyStamps"
        );


    stamps.innerHTML =
        Array.from(
            {
                length: 5
            },
            (_, index) => {

                const active =
                    index < progress;

                return `
                    <div
                        class="
                            loyalty-stamp
                            ${
                                active
                                    ? "active"
                                    : ""
                            }
                        "
                    >
                        ${
                            active
                                ? "✂"
                                : index + 1
                        }
                    </div>
                `;
            }
        ).join("");


    document.getElementById(
        "modalLoyaltyProgress"
    ).style.width =
        `${(
            progress / 5
        ) * 100}%`;


    const description =
        document.getElementById(
            "loyaltyDescription"
        );


    if (progress === 5) {

        description.textContent =
            "Recompensa disponible.";

    } else {

        description.textContent =
            `${progress}/5 visitas · Faltan ${
                5 - progress
            } para la recompensa.`;
    }

}


/* =====================================================
   HISTORY
===================================================== */

function renderCustomerHistory(
    appointments
) {

    const container =
        document.getElementById(
            "customerHistory"
        );


    if (!appointments.length) {

        container.innerHTML = `
            <div class="empty">
                Este cliente todavía no tiene citas registradas.
            </div>
        `;

        return;
    }


    const sorted =
        [...appointments]
            .sort(
                (a, b) =>
                    `${b.date} ${b.time}`
                        .localeCompare(
                            `${a.date} ${a.time}`
                        )
            );


    container.innerHTML =
        sorted
            .map(
                appointment => {

                    const service =
                        getService(
                            appointment.serviceId
                        );

                    const barber =
                        getBarber(
                            appointment.barberId
                        );


                    return `
                        <div class="history-row">

                            <div class="history-date">

                                <strong>
                                    ${formatDate(
                                        appointment.date
                                    )}
                                </strong>

                                <span>
                                    ${formatTime(
                                        appointment.time
                                    )}
                                </span>

                            </div>


                            <div class="history-service">

                                <strong>
                                    ${service.name}
                                </strong>

                                <span>
                                    $${service.price}
                                    ·
                                    ${service.duration} min
                                </span>

                            </div>


                            <div class="history-barber">
                                ${barber.name}
                            </div>


                            <div class="history-status">
                                ${renderStatus(
                                    appointment.status
                                )}
                            </div>

                        </div>
                    `;
                }
            )
            .join("");

}


/* =====================================================
   ADD VISIT
===================================================== */

function addVisitToSelectedCustomer() {

    if (!selectedCustomerId) {
        return;
    }


    const customers =
        getCustomers();


    const customer =
        customers.find(
            item =>
                item.id ===
                selectedCustomerId
        );


    if (!customer) {

        showToast(
            "No se encontró el cliente."
        );

        return;
    }


    customer.visits += 1;


    saveCustomers(
        customers
    );


    renderStats();
    renderCustomers();


    /*
     * Actualizamos el contenido del modal
     * sin cerrarlo.
     */
    openCustomerModal(
        customer.id
    );


    showToast(
        `${customer.name}: +1 visita registrada.`
    );

}


/* =====================================================
   BOOK CUSTOMER
===================================================== */

function bookSelectedCustomer() {

    if (!selectedCustomerId) {
        return;
    }


    const customers =
        getCustomers();


    const customer =
        customers.find(
            item =>
                item.id ===
                selectedCustomerId
        );


    if (!customer) {

        showToast(
            "No se encontró el cliente."
        );

        return;
    }


    sessionStorage.setItem(
        "barbershop_booking_customer",
        JSON.stringify({
            id:
                customer.id,

            name:
                customer.name,

            phone:
                customer.phone
        })
    );


    window.location.href =
        "citas.html?new=1";

}


/* =====================================================
   NEW CUSTOMER
===================================================== */

function saveNewCustomer() {

    const name =
        document
            .getElementById(
                "newCustomerName"
            )
            .value
            .trim();


    const phone =
        document
            .getElementById(
                "newCustomerPhone"
            )
            .value
            .trim();


    if (!name) {

        showToast(
            "Ingresa el nombre del cliente."
        );

        return;
    }


    if (
        normalizePhone(
            phone
        ).length < 7
    ) {

        showToast(
            "Ingresa un teléfono válido."
        );

        return;
    }


    const customers =
        getCustomers();


    const exists =
        customers.some(
            customer =>
                normalizePhone(
                    customer.phone
                ) ===
                normalizePhone(
                    phone
                )
        );


    if (exists) {

        showToast(
            "Ya existe un cliente con ese teléfono."
        );

        return;
    }


    customers.push({
        id:
            generateId(
                "customer"
            ),

        name,

        phone,

        visits:
            0
    });


    saveCustomers(
        customers
    );


    closeNewCustomerModal();

    renderStats();
    renderCustomers();


    showToast(
        `${name} fue registrado correctamente.`
    );

}


/* =====================================================
   CUSTOMER APPOINTMENTS
===================================================== */

function getCustomerAppointments(
    customer,
    appointments
) {

    return appointments.filter(
        appointment =>
            normalizePhone(
                appointment.phone
            ) ===
            normalizePhone(
                customer.phone
            )
    );

}


/* =====================================================
   LAST APPOINTMENT
===================================================== */

function getLastAppointment(
    appointments
) {

    if (!appointments.length) {
        return null;
    }


    return [...appointments]
        .sort(
            (a, b) =>
                `${b.date} ${b.time}`
                    .localeCompare(
                        `${a.date} ${a.time}`
                    )
        )[0];

}


/* =====================================================
   LOYALTY PROGRESS
===================================================== */

function getLoyaltyProgress(visits) {

    if (
        visits > 0 &&
        visits % 5 === 0
    ) {
        return 5;
    }


    return visits % 5;

}


/* =====================================================
   SMALL STAMPS
===================================================== */

function renderSmallStamps(
    progress
) {

    return Array.from(
        {
            length: 5
        },
        (_, index) => `
            <div
                class="
                    loyalty-stamp-small
                    ${
                        index < progress
                            ? "active"
                            : ""
                    }
                "
            >
                ${
                    index < progress
                        ? "✂"
                        : index + 1
                }
            </div>
        `
    ).join("");

}


/* =====================================================
   INITIALS
===================================================== */

function getInitials(name) {

    return String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(
            part =>
                part
                    .charAt(0)
                    .toUpperCase()
        )
        .join("");

}


/* =====================================================
   SERVICE
===================================================== */

function getService(id) {

    return (
        services.find(
            service =>
                service.id === id
        ) ||
        services[0]
    );

}


/* =====================================================
   BARBER
===================================================== */

function getBarber(id) {

    return (
        barbers.find(
            barber =>
                barber.id === id
        ) ||
        barbers[0]
    );

}


/* =====================================================
   FORMAT DATE
===================================================== */

function formatDate(
    dateString
) {

    const date =
        new Date(
            `${dateString}T12:00:00`
        );


    return new Intl.DateTimeFormat(
        "es-MX",
        {
            day:
                "2-digit",

            month:
                "short",

            year:
                "numeric"
        }
    ).format(date);

}


/* =====================================================
   FORMAT TIME
===================================================== */

function formatTime(time) {

    const [
        hours,
        minutes
    ] =
        time
            .split(":")
            .map(Number);


    const period =
        hours >= 12
            ? "PM"
            : "AM";


    const hour =
        hours % 12 || 12;


    return `${hour}:${String(
        minutes
    ).padStart(
        2,
        "0"
    )} ${period}`;

}


/* =====================================================
   STATUS
===================================================== */

function renderStatus(status) {

    const labels = {
        pending:
            "Pendiente",

        confirmed:
            "Confirmada",

        completed:
            "Completada",

        cancelled:
            "Cancelada",

        "no-show":
            "No asistió"
    };


    return `
        <span
            class="
                status
                ${status}
            "
        >
            ${labels[status] || status}
        </span>
    `;

}


/* =====================================================
   STAT CARD
===================================================== */

function statCard(
    label,
    value
) {

    return `
        <article class="stat-card">

            <span>
                ${label}
            </span>

            <strong>
                ${value}
            </strong>

        </article>
    `;

}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHTML(value) {

    const element =
        document.createElement(
            "div"
        );


    element.textContent =
        String(
            value || ""
        );


    return element.innerHTML;

}


/* =====================================================
   TOAST
===================================================== */

function showToast(message) {

    const toast =
        document.getElementById(
            "toast"
        );


    if (!toast) {
        return;
    }


    toast.textContent =
        message;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


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


/* =====================================================
   START
===================================================== */

initialize();