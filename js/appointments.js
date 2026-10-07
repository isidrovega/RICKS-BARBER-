import {
    services,
    barbers,
    origins,
    availableTimes,
    getLocalDate
} from "./data.js";


import {
    getAppointments,
    saveAppointments,
    findCustomerByPhone,
    getOrCreateCustomer,
    addCustomerVisit,
    generateId
} from "./storage.js";


/* =====================================================
   STATE
===================================================== */

let currentFilter =
    "all";


let selectedTime =
    "";


/* =====================================================
   ELEMENTS
===================================================== */

const appointmentsTable =
    document.getElementById(
        "appointmentsTable"
    );


const modal =
    document.getElementById(
        "appointmentModal"
    );


const phoneInput =
    document.getElementById(
        "appointmentPhone"
    );


const nameInput =
    document.getElementById(
        "appointmentName"
    );


const serviceSelect =
    document.getElementById(
        "appointmentService"
    );


const barberSelect =
    document.getElementById(
        "appointmentBarber"
    );


const dateInput =
    document.getElementById(
        "appointmentDate"
    );


const originSelect =
    document.getElementById(
        "appointmentOrigin"
    );


const statusSelect =
    document.getElementById(
        "appointmentStatus"
    );


const notesInput =
    document.getElementById(
        "appointmentNotes"
    );


const timeContainer =
    document.getElementById(
        "appointmentTimes"
    );


const customerDetection =
    document.getElementById(
        "customerDetection"
    );


/* =====================================================
   INITIALIZATION
===================================================== */

function initialize() {

    populateSelectors();

    configureEvents();

    renderAppointments();

    handleIncomingCustomerBooking();

}


/* =====================================================
   SELECTORS
===================================================== */

function populateSelectors() {

    serviceSelect.innerHTML =
        services
            .map(
                service => `
                    <option
                        value="${service.id}"
                    >
                        ${service.name}
                        ·
                        $${service.price}
                        ·
                        ${service.duration} min
                    </option>
                `
            )
            .join("");


    barberSelect.innerHTML =
        barbers
            .map(
                barber => `
                    <option
                        value="${barber.id}"
                    >
                        ${barber.name}
                    </option>
                `
            )
            .join("");

}


/* =====================================================
   EVENTS
===================================================== */

function configureEvents() {

    document
        .getElementById(
            "newAppointmentButton"
        )
        .addEventListener(
            "click",
            openModal
        );


    document
        .getElementById(
            "closeModalButton"
        )
        .addEventListener(
            "click",
            closeModal
        );


    document
        .getElementById(
            "cancelModalButton"
        )
        .addEventListener(
            "click",
            closeModal
        );


    document
        .getElementById(
            "saveAppointmentButton"
        )
        .addEventListener(
            "click",
            saveAppointment
        );


    phoneInput.addEventListener(
        "input",
        detectCustomer
    );


    barberSelect.addEventListener(
        "change",
        renderTimes
    );


    serviceSelect.addEventListener(
        "change",
        renderTimes
    );


    dateInput.addEventListener(
        "change",
        renderTimes
    );


    modal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                modal
            ) {

                closeModal();

            }

        }
    );


    document
        .querySelectorAll(
            ".filter"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        document
                            .querySelectorAll(
                                ".filter"
                            )
                            .forEach(
                                item => {

                                    item.classList.remove(
                                        "active"
                                    );

                                }
                            );


                        button.classList.add(
                            "active"
                        );


                        currentFilter =
                            button.dataset.filter;


                        renderAppointments();

                    }
                );

            }
        );


    appointmentsTable.addEventListener(
        "click",
        handleTableAction
    );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                    "Escape" &&
                !modal.classList.contains(
                    "hidden"
                )
            ) {

                closeModal();

            }

        }
    );

}


/* =====================================================
   INCOMING CUSTOMER FROM clientes.html
===================================================== */

function handleIncomingCustomerBooking() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    if (
        params.get("new") !==
        "1"
    ) {

        return;

    }


    const storedCustomer =
        sessionStorage.getItem(
            "barbershop_booking_customer"
        );


    /*
        Abrimos el modal incluso si por algún
        motivo no llegaron los datos del cliente.
    */

    openModal();


    if (!storedCustomer) {

        cleanBookingURL();

        return;

    }


    try {

        const customer =
            JSON.parse(
                storedCustomer
            );


        phoneInput.value =
            customer.phone || "";


        nameInput.value =
            customer.name || "";


        detectCustomer();


        sessionStorage.removeItem(
            "barbershop_booking_customer"
        );


        cleanBookingURL();


        showToast(
            `Agendando cita para ${
                customer.name ||
                "el cliente"
            }.`
        );

    } catch (error) {

        console.error(
            "No se pudo cargar el cliente.",
            error
        );


        sessionStorage.removeItem(
            "barbershop_booking_customer"
        );


        cleanBookingURL();


        showToast(
            "No se pudieron cargar los datos del cliente."
        );

    }

}


function cleanBookingURL() {

    const cleanURL =
        `${window.location.pathname}`;


    window.history.replaceState(
        {},
        document.title,
        cleanURL
    );

}


/* =====================================================
   MODAL
===================================================== */

function openModal() {

    resetForm();


    modal.classList.remove(
        "hidden"
    );


    setTimeout(
        () => {

            phoneInput.focus();

        },
        50
    );

}


function closeModal() {

    modal.classList.add(
        "hidden"
    );

}


/* =====================================================
   RESET FORM
===================================================== */

function resetForm() {

    phoneInput.value =
        "";


    nameInput.value =
        "";


    notesInput.value =
        "";


    customerDetection.innerHTML =
        "";


    originSelect.value =
        "whatsapp";


    statusSelect.value =
        "confirmed";


    dateInput.min =
        getLocalDate();


    dateInput.value =
        getLocalDate();


    serviceSelect.value =
        services[0].id;


    barberSelect.value =
        barbers[0].id;


    selectedTime =
        "";


    renderTimes();

}


/* =====================================================
   CUSTOMER DETECTION
===================================================== */

function detectCustomer() {

    const phone =
        phoneInput.value.trim();


    const phoneDigits =
        phone.replace(
            /\D/g,
            ""
        );


    if (
        phoneDigits.length <
        7
    ) {

        customerDetection.innerHTML =
            "";

        return;

    }


    const customer =
        findCustomerByPhone(
            phone
        );


    if (customer) {

        nameInput.value =
            customer.name;


        customerDetection.innerHTML = `
            <div
                class="
                    customer-found
                "
            >

                ✓ Cliente encontrado:

                <strong>
                    ${escapeHTML(
                        customer.name
                    )}
                </strong>

                ·

                ${customer.visits}
                ${
                    customer.visits === 1
                        ? "visita"
                        : "visitas"
                }

            </div>
        `;


        return;

    }


    customerDetection.innerHTML = `
        <div
            class="
                customer-new
            "
        >

            Cliente nuevo.
            Se registrará automáticamente
            al guardar la cita.

        </div>
    `;

}


/* =====================================================
   AVAILABILITY
===================================================== */

function getAvailableTimes(
    date,
    barberId
) {

    if (
        !date ||
        !barberId
    ) {

        return [];

    }


    const appointments =
        getAppointments();


    const occupied =
        appointments
            .filter(
                appointment =>
                    appointment.date ===
                        date &&

                    appointment.barberId ===
                        barberId &&

                    appointment.status !==
                        "cancelled" &&

                    appointment.status !==
                        "no-show"
            )
            .map(
                appointment =>
                    appointment.time
            );


    return availableTimes.filter(
        time =>
            !occupied.includes(
                time
            )
    );

}


/* =====================================================
   RENDER TIMES
===================================================== */

function renderTimes() {

    const date =
        dateInput.value;


    const barberId =
        barberSelect.value;


    const times =
        getAvailableTimes(
            date,
            barberId
        );


    if (
        !times.includes(
            selectedTime
        )
    ) {

        selectedTime =
            times[0] || "";

    }


    if (!times.length) {

        timeContainer.innerHTML = `
            <div
                class="empty"
                style="
                    grid-column:
                    1 / -1;
                "
            >

                No hay horarios disponibles.

            </div>
        `;

        return;

    }


    timeContainer.innerHTML =
        times
            .map(
                time => `
                    <button
                        type="button"

                        class="
                            time-button
                            ${
                                selectedTime ===
                                time
                                    ? "selected"
                                    : ""
                            }
                        "

                        data-time="${time}"
                    >
                        ${formatTime(
                            time
                        )}
                    </button>
                `
            )
            .join("");


    timeContainer
        .querySelectorAll(
            ".time-button"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        selectedTime =
                            button.dataset.time;


                        renderTimes();

                    }
                );

            }
        );

}


/* =====================================================
   CREATE APPOINTMENT
===================================================== */

function saveAppointment() {

    const name =
        nameInput.value.trim();


    const phone =
        phoneInput.value.trim();


    const date =
        dateInput.value;


    const phoneDigits =
        phone.replace(
            /\D/g,
            ""
        );


    if (!name) {

        showToast(
            "Ingresa el nombre del cliente."
        );

        nameInput.focus();

        return;

    }


    if (
        phoneDigits.length <
        7
    ) {

        showToast(
            "Ingresa un teléfono válido."
        );

        phoneInput.focus();

        return;

    }


    if (!date) {

        showToast(
            "Selecciona una fecha."
        );

        dateInput.focus();

        return;

    }


    if (!selectedTime) {

        showToast(
            "Selecciona un horario."
        );

        return;

    }


    const appointments =
        getAppointments();


    /*
        Por ahora validamos conflicto por
        misma fecha + misma hora + mismo barbero.

        Después lo cambiaremos por validación
        según duración del servicio.
    */

    const occupied =
        appointments.some(
            appointment =>
                appointment.date ===
                    date &&

                appointment.time ===
                    selectedTime &&

                appointment.barberId ===
                    barberSelect.value &&

                appointment.status !==
                    "cancelled" &&

                appointment.status !==
                    "no-show"
        );


    if (occupied) {

        showToast(
            "Ese horario ya está ocupado."
        );


        selectedTime =
            "";


        renderTimes();

        return;

    }


    getOrCreateCustomer(
        name,
        phone
    );


    const appointment = {

        id:
            generateId(
                "appointment"
            ),

        date,

        time:
            selectedTime,

        clientName:
            name,

        phone,

        serviceId:
            serviceSelect.value,

        barberId:
            barberSelect.value,

        origin:
            originSelect.value,

        status:
            statusSelect.value,

        notes:
            notesInput.value.trim(),

        loyaltyApplied:
            false

    };


    appointments.push(
        appointment
    );


    saveAppointments(
        appointments
    );


    closeModal();


    renderAppointments();


    showToast(
        `Cita de ${name} registrada correctamente.`
    );

}


/* =====================================================
   RENDER APPOINTMENTS
===================================================== */

function renderAppointments() {

    let appointments =
        getAppointments();


    if (
        currentFilter ===
        "today"
    ) {

        appointments =
            appointments.filter(
                appointment =>
                    appointment.date ===
                    getLocalDate()
            );

    } else if (
        currentFilter !==
        "all"
    ) {

        appointments =
            appointments.filter(
                appointment =>
                    appointment.status ===
                    currentFilter
            );

    }


    appointments.sort(
        (a, b) =>
            `${a.date} ${a.time}`
                .localeCompare(
                    `${b.date} ${b.time}`
                )
    );


    if (!appointments.length) {

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


    appointmentsTable.innerHTML =
        appointments
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
                        <tr>

                            <td>
                                ${formatDate(
                                    appointment.date
                                )}
                            </td>


                            <td>

                                <strong>
                                    ${formatTime(
                                        appointment.time
                                    )}
                                </strong>

                            </td>


                            <td>

                                <strong>
                                    ${escapeHTML(
                                        appointment.clientName
                                    )}
                                </strong>

                                <span
                                    class="
                                        client-phone
                                    "
                                >
                                    ${escapeHTML(
                                        appointment.phone
                                    )}
                                </span>

                                ${
                                    appointment.notes
                                        ? `
                                            <span
                                                class="
                                                    appointment-note
                                                "
                                            >
                                                Nota:
                                                ${escapeHTML(
                                                    appointment.notes
                                                )}
                                            </span>
                                        `
                                        : ""
                                }

                            </td>


                            <td>

                                ${service.name}

                                <span
                                    class="
                                        client-phone
                                    "
                                >
                                    ${service.duration}
                                    min ·
                                    $${service.price}
                                </span>

                            </td>


                            <td>
                                ${barber.name}
                            </td>


                            <td>

                                <span
                                    class="
                                        origin
                                    "
                                >
                                    ${
                                        origins[
                                            appointment.origin
                                        ] ||
                                        "Otro"
                                    }
                                </span>

                            </td>


                            <td>
                                ${renderStatus(
                                    appointment.status
                                )}
                            </td>


                            <td>

                                <div
                                    class="
                                        table-actions
                                    "
                                >
                                    ${renderActions(
                                        appointment
                                    )}
                                </div>

                            </td>

                        </tr>
                    `;

                }
            )
            .join("");

}


/* =====================================================
   ACTION BUTTONS
===================================================== */

function renderActions(
    appointment
) {

    switch (
        appointment.status
    ) {

        case "pending":

            return `
                <button
                    type="button"

                    class="
                        mini-button
                    "

                    data-action="confirmed"

                    data-id="${appointment.id}"
                >
                    Confirmar
                </button>


                <button
                    type="button"

                    class="
                        mini-button
                        danger
                    "

                    data-action="cancelled"

                    data-id="${appointment.id}"
                >
                    Cancelar
                </button>
            `;


        case "confirmed":

            return `
                <button
                    type="button"

                    class="
                        mini-button
                        success
                    "

                    data-action="completed"

                    data-id="${appointment.id}"
                >
                    Completar
                </button>


                <button
                    type="button"

                    class="
                        mini-button
                    "

                    data-action="no-show"

                    data-id="${appointment.id}"
                >
                    No asistió
                </button>


                <button
                    type="button"

                    class="
                        mini-button
                        danger
                    "

                    data-action="cancelled"

                    data-id="${appointment.id}"
                >
                    Cancelar
                </button>
            `;


        case "cancelled":

        case "no-show":

            return `
                <button
                    type="button"

                    class="
                        mini-button
                    "

                    data-action="pending"

                    data-id="${appointment.id}"
                >
                    Restaurar
                </button>
            `;


        case "completed":

            return `
                <span
                    class="
                        client-phone
                    "
                >
                    Finalizada
                </span>
            `;


        default:

            return "";

    }

}


/* =====================================================
   TABLE ACTION
===================================================== */

function handleTableAction(
    event
) {

    const button =
        event.target.closest(
            "[data-action]"
        );


    if (!button) {
        return;
    }


    const appointmentId =
        button.dataset.id;


    const action =
        button.dataset.action;


    updateStatus(
        appointmentId,
        action
    );

}


/* =====================================================
   UPDATE STATUS
===================================================== */

function updateStatus(
    appointmentId,
    newStatus
) {

    const appointments =
        getAppointments();


    const appointment =
        appointments.find(
            item =>
                item.id ===
                appointmentId
        );


    if (!appointment) {

        showToast(
            "No se encontró la cita."
        );

        return;

    }


    appointment.status =
        newStatus;


    /*
        Cuando una cita se completa,
        agregamos automáticamente una visita.

        loyaltyApplied evita sumar dos veces.
    */

    if (
        newStatus ===
            "completed" &&
        !appointment.loyaltyApplied
    ) {

        addCustomerVisit(
            appointment.phone
        );


        appointment.loyaltyApplied =
            true;


        showToast(
            "Cita completada. +1 visita al cliente."
        );

    } else {

        const messages = {

            confirmed:
                "Cita confirmada.",

            cancelled:
                "Cita cancelada.",

            pending:
                "Cita restaurada como pendiente.",

            "no-show":
                "Cita marcada como no asistió.",

            completed:
                "Cita completada."

        };


        showToast(
            messages[newStatus] ||
            "Estado actualizado."
        );

    }


    saveAppointments(
        appointments
    );


    renderAppointments();

}


/* =====================================================
   GET SERVICE
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
   GET BARBER
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
   FORMAT TIME
===================================================== */

function formatTime(time) {

    if (!time) {
        return "";
    }


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
   FORMAT DATE
===================================================== */

function formatDate(
    dateString
) {

    if (!dateString) {
        return "";
    }


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

let toastTimer;


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