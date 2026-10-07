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
    getCustomers,
    findCustomerByPhone,
    getOrCreateCustomer,
    generateId
} from "./storage.js";


let selectedTime =
    "";


/* =====================================================
   ELEMENTS
===================================================== */

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
   INITIALIZE
===================================================== */

function initialize() {

    populateSelectors();

    configureEvents();

    renderDashboard();

}


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
            "quickNewAppointment"
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


    document
        .getElementById(
            "qrButton"
        )
        .addEventListener(
            "click",
            () => {

                showToast(
                    "El escáner QR será el siguiente módulo."
                );

            }
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
                event.target === modal
            ) {
                closeModal();
            }

        }
    );

}


/* =====================================================
   DASHBOARD
===================================================== */

function renderDashboard() {

    const appointments =
        getAppointments();


    const customers =
        getCustomers();


    const today =
        getLocalDate();


    const todayAppointments =
        appointments.filter(
            appointment =>
                appointment.date ===
                    today &&
                appointment.status !==
                    "cancelled"
        );


    const completed =
        appointments.filter(
            appointment =>
                appointment.status ===
                "completed"
        );


    const revenue =
        completed.reduce(
            (
                total,
                appointment
            ) => {

                const service =
                    getService(
                        appointment.serviceId
                    );


                return (
                    total +
                    service.price
                );

            },
            0
        );


    document.getElementById(
        "dashboardStats"
    ).innerHTML = `

        ${statCard(
            "Citas de hoy",
            todayAppointments.length
        )}

        ${statCard(
            "Clientes",
            customers.length
        )}

        ${statCard(
            "Completadas",
            completed.length
        )}

        ${statCard(
            "Ingresos registrados",
            `$${revenue}`
        )}

    `;


    renderUpcomingAppointments(
        appointments
    );

}


function renderUpcomingAppointments(
    appointments
) {

    const upcoming =
        appointments
            .filter(
                appointment =>
                    appointment.status ===
                        "pending" ||
                    appointment.status ===
                        "confirmed"
            )
            .sort(
                (a, b) =>
                    `${a.date} ${a.time}`
                        .localeCompare(
                            `${b.date} ${b.time}`
                        )
            )
            .slice(
                0,
                7
            );


    const container =
        document.getElementById(
            "dashboardAppointments"
        );


    if (!upcoming.length) {

        container.innerHTML = `
            <div class="empty">
                No hay próximas citas.
            </div>
        `;

        return;

    }


    container.innerHTML =
        upcoming
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
                        <div
                            class="
                                dashboard-appointment
                            "
                        >

                            <div
                                class="
                                    appointment-time
                                "
                            >
                                ${formatTime(
                                    appointment.time
                                )}
                            </div>


                            <div
                                class="
                                    appointment-client
                                "
                            >

                                <strong>
                                    ${escapeHTML(
                                        appointment.clientName
                                    )}
                                </strong>

                                <span>
                                    ${service.name}
                                    ·
                                    ${formatDate(
                                        appointment.date
                                    )}
                                    ·
                                    ${
                                        origins[
                                            appointment.origin
                                        ] ||
                                        "Otro"
                                    }
                                </span>

                            </div>


                            <div
                                class="
                                    appointment-barber
                                "
                            >
                                ${barber.name}
                            </div>


                            <div
                                class="
                                    appointment-status
                                "
                            >
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


function resetForm() {

    phoneInput.value = "";

    nameInput.value = "";

    notesInput.value = "";

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


    if (
        phone.replace(
            /\D/g,
            ""
        ).length < 7
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
            <div class="customer-found">

                ✓ Cliente encontrado:

                <strong>
                    ${escapeHTML(
                        customer.name
                    )}
                </strong>

                ·

                ${customer.visits}
                visitas

            </div>
        `;


        return;

    }


    customerDetection.innerHTML = `
        <div class="customer-new">

            Cliente nuevo.
            Se registrará automáticamente
            al guardar.

        </div>
    `;

}


/* =====================================================
   TIMES
===================================================== */

function getAvailableTimes(
    date,
    barberId
) {

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


function renderTimes() {

    const times =
        getAvailableTimes(
            dateInput.value,
            barberSelect.value
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
                                selectedTime === time
                                    ? "selected"
                                    : ""
                            }
                        "

                        data-time="${time}"
                    >
                        ${formatTime(time)}
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
   SAVE APPOINTMENT
===================================================== */

function saveAppointment() {

    const name =
        nameInput.value.trim();


    const phone =
        phoneInput.value.trim();


    const date =
        dateInput.value;


    if (
        !name ||
        !phone
    ) {

        showToast(
            "Ingresa nombre y teléfono."
        );

        return;

    }


    if (
        !date ||
        !selectedTime
    ) {

        showToast(
            "Selecciona fecha y horario."
        );

        return;

    }


    const appointments =
        getAppointments();


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

        renderTimes();

        return;

    }


    getOrCreateCustomer(
        name,
        phone
    );


    appointments.push({

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

    });


    saveAppointments(
        appointments
    );


    closeModal();

    renderDashboard();


    showToast(
        `Cita de ${name} registrada.`
    );

}


/* =====================================================
   HELPERS
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


function getBarber(id) {

    return (
        barbers.find(
            barber =>
                barber.id === id
        ) ||
        barbers[0]
    );

}


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


function formatDate(dateString) {

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
                "short"
        }
    ).format(date);

}


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


let toastTimer;


function showToast(message) {

    const toast =
        document.getElementById(
            "toast"
        );


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


initialize();