import {
    services
} from "./data.js";

import {
    getAppointments,
    generateId
} from "./storage.js";


const STORAGE_KEY =
    "barbershop_barbers";


let editingBarberId =
    null;


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
    monday: {
        enabled: true,
        start: "09:00",
        end: "19:00"
    },

    tuesday: {
        enabled: true,
        start: "09:00",
        end: "19:00"
    },

    wednesday: {
        enabled: true,
        start: "09:00",
        end: "19:00"
    },

    thursday: {
        enabled: true,
        start: "09:00",
        end: "19:00"
    },

    friday: {
        enabled: true,
        start: "09:00",
        end: "19:00"
    },

    saturday: {
        enabled: true,
        start: "09:00",
        end: "17:00"
    },

    sunday: {
        enabled: false,
        start: "09:00",
        end: "17:00"
    }
};


/* =====================================================
   ELEMENTS
===================================================== */

const barbersGrid =
    document.getElementById(
        "barbersGrid"
    );


const barberSummary =
    document.getElementById(
        "barberSummary"
    );


const barberModal =
    document.getElementById(
        "barberModal"
    );


const barberName =
    document.getElementById(
        "barberName"
    );


const barberPhone =
    document.getElementById(
        "barberPhone"
    );


const barberActiveSwitch =
    document.getElementById(
        "barberActiveSwitch"
    );


const barberServices =
    document.getElementById(
        "barberServices"
    );


const scheduleEditor =
    document.getElementById(
        "scheduleEditor"
    );


const barberModalAvatar =
    document.getElementById(
        "barberModalAvatar"
    );


/* =====================================================
   START
===================================================== */

function initialize() {

    seedBarbers();

    configureEvents();

    renderSummary();

    renderBarbers();

}


/* =====================================================
   STORAGE
===================================================== */

function getBarbers() {

    try {

        const stored =
            JSON.parse(
                localStorage.getItem(
                    STORAGE_KEY
                )
            );


        return Array.isArray(
            stored
        )
            ? stored
            : [];

    } catch {

        return [];

    }

}


function saveBarbers(barbers) {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
            barbers
        )
    );

}


/* =====================================================
   SEED
===================================================== */

function seedBarbers() {

    if (
        localStorage.getItem(
            STORAGE_KEY
        )
    ) {
        return;
    }


    const barbers = [

        {
            id: "carlos",

            name: "Carlos",

            phone: "667 111 1001",

            status: "active",

            serviceIds: [
                "cut",
                "cut-beard",
                "beard"
            ],

            schedule:
                createSchedule({
                    saturday: {
                        enabled: true,
                        start: "09:00",
                        end: "17:00"
                    },

                    sunday: {
                        enabled: false,
                        start: "09:00",
                        end: "17:00"
                    }
                })
        },

        {
            id: "miguel",

            name: "Miguel",

            phone: "667 111 1002",

            status: "active",

            serviceIds: [
                "cut",
                "cut-beard",
                "beard"
            ],

            schedule:
                createSchedule({
                    monday: {
                        enabled: false,
                        start: "10:00",
                        end: "20:00"
                    },

                    tuesday: {
                        enabled: true,
                        start: "10:00",
                        end: "20:00"
                    },

                    wednesday: {
                        enabled: true,
                        start: "10:00",
                        end: "20:00"
                    },

                    thursday: {
                        enabled: true,
                        start: "10:00",
                        end: "20:00"
                    },

                    friday: {
                        enabled: true,
                        start: "10:00",
                        end: "20:00"
                    },

                    saturday: {
                        enabled: true,
                        start: "10:00",
                        end: "20:00"
                    },

                    sunday: {
                        enabled: true,
                        start: "10:00",
                        end: "18:00"
                    }
                })
        },

        {
            id: "alex",

            name: "Alex",

            phone: "667 111 1003",

            status: "active",

            serviceIds: [
                "cut",
                "cut-beard"
            ],

            schedule:
                createSchedule({
                    monday: {
                        enabled: true,
                        start: "11:00",
                        end: "19:00"
                    },

                    tuesday: {
                        enabled: true,
                        start: "11:00",
                        end: "19:00"
                    },

                    wednesday: {
                        enabled: true,
                        start: "11:00",
                        end: "19:00"
                    },

                    thursday: {
                        enabled: true,
                        start: "11:00",
                        end: "19:00"
                    },

                    friday: {
                        enabled: true,
                        start: "11:00",
                        end: "19:00"
                    },

                    saturday: {
                        enabled: false,
                        start: "11:00",
                        end: "19:00"
                    },

                    sunday: {
                        enabled: false,
                        start: "11:00",
                        end: "19:00"
                    }
                })
        }

    ];


    saveBarbers(
        barbers
    );

}


function createSchedule(
    overrides = {}
) {

    return {
        ...structuredClone(
            defaultSchedule
        ),
        ...structuredClone(
            overrides
        )
    };

}


/* =====================================================
   EVENTS
===================================================== */

function configureEvents() {

    document
        .getElementById(
            "newBarberButton"
        )
        .addEventListener(
            "click",
            openNewBarber
        );


    document
        .getElementById(
            "closeBarberModal"
        )
        .addEventListener(
            "click",
            closeModal
        );


    document
        .getElementById(
            "cancelBarberButton"
        )
        .addEventListener(
            "click",
            closeModal
        );


    document
        .getElementById(
            "saveBarberButton"
        )
        .addEventListener(
            "click",
            saveBarber
        );


    barbersGrid.addEventListener(
        "click",
        handleGridAction
    );


    scheduleEditor.addEventListener(
        "change",
        event => {

            if (
                event.target.matches(
                    ".schedule-enabled"
                )
            ) {

                updateScheduleState(
                    event.target
                );

            }

        }
    );


    barberName.addEventListener(
        "input",
        updateModalAvatar
    );


    barberModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                barberModal
            ) {

                closeModal();

            }

        }
    );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape" &&
                !barberModal
                    .classList
                    .contains(
                        "hidden"
                    )
            ) {

                closeModal();

            }

        }
    );

}


/* =====================================================
   SUMMARY
===================================================== */

function renderSummary() {

    const barbers =
        getBarbers();


    const active =
        barbers.filter(
            barber =>
                barber.status ===
                "active"
        );


    const today =
        active.filter(
            barber =>
                getTodaySchedule(
                    barber
                )?.enabled
        );


    barberSummary.innerHTML = `

        <div
            class="
                barber-summary-item
            "
        >

            <strong>
                ${barbers.length}
            </strong>

            <span>
                Barberos
            </span>

        </div>


        <div
            class="
                barber-summary-divider
            "
        ></div>


        <div
            class="
                barber-summary-item
            "
        >

            <strong>
                ${active.length}
            </strong>

            <span>
                Activos
            </span>

        </div>


        <div
            class="
                barber-summary-divider
            "
        ></div>


        <div
            class="
                barber-summary-item
            "
        >

            <strong>
                ${today.length}
            </strong>

            <span>
                Trabajando hoy
            </span>

        </div>

    `;

}


/* =====================================================
   RENDER BARBERS
===================================================== */

function renderBarbers() {

    const barbers =
        getBarbers();


    const appointments =
        getAppointments();


    if (!barbers.length) {

        barbersGrid.innerHTML = `

            <div
                class="panel"
                style="
                    grid-column:
                    1 / -1;
                "
            >

                <div class="empty">
                    No hay barberos registrados.
                </div>

            </div>

        `;

        return;

    }


    barbersGrid.innerHTML =
        barbers
            .map(
                barber => {

                    const appointmentsToday =
                        getAppointmentsToday(
                            barber.id,
                            appointments
                        );


                    const todaySchedule =
                        getTodaySchedule(
                            barber
                        );


                    const serviceList =
                        barber.serviceIds
                            .map(
                                id =>
                                    services.find(
                                        service =>
                                            service.id ===
                                            id
                                    )
                            )
                            .filter(
                                Boolean
                            );


                    return `

                        <article
                            class="
                                modern-barber-card
                                ${
                                    barber.status ===
                                    "inactive"
                                        ? "is-inactive"
                                        : ""
                                }
                            "
                        >

                            <div
                                class="
                                    modern-barber-top
                                "
                            >

                                <div
                                    class="
                                        modern-barber-person
                                    "
                                >

                                    <div
                                        class="
                                            modern-barber-avatar
                                        "
                                    >
                                        ${getInitials(
                                            barber.name
                                        )}
                                    </div>


                                    <div
                                        class="
                                            modern-barber-name
                                        "
                                    >

                                        <h3>
                                            ${escapeHTML(
                                                barber.name
                                            )}
                                        </h3>

                                        <span>
                                            Barbero
                                        </span>

                                    </div>

                                </div>


                                <div
                                    class="
                                        modern-status
                                        ${
                                            barber.status ===
                                            "active"
                                                ? "active"
                                                : "inactive"
                                        }
                                    "
                                >

                                    <span></span>

                                    ${
                                        barber.status ===
                                        "active"
                                            ? "Activo"
                                            : "Inactivo"
                                    }

                                </div>

                            </div>


                            <div
                                class="
                                    modern-barber-metrics
                                "
                            >

                                <div>

                                    <strong>
                                        ${appointmentsToday}
                                    </strong>

                                    <span>
                                        Citas hoy
                                    </span>

                                </div>


                                <div>

                                    <strong>
                                        ${serviceList.length}
                                    </strong>

                                    <span>
                                        Servicios
                                    </span>

                                </div>

                            </div>


                            <div
                                class="
                                    modern-barber-schedule
                                "
                            >

                                <span>
                                    Horario de hoy
                                </span>

                                <strong>

                                    ${
                                        barber.status ===
                                        "inactive"
                                            ?
                                            "No disponible"
                                            :
                                            formatTodaySchedule(
                                                todaySchedule
                                            )
                                    }

                                </strong>

                            </div>


                            <div
                                class="
                                    modern-barber-services
                                "
                            >

                                ${
                                    serviceList.length
                                        ?
                                        serviceList
                                            .map(
                                                service => `
                                                    <span>
                                                        ${service.name}
                                                    </span>
                                                `
                                            )
                                            .join("")
                                        :
                                        `
                                            <span>
                                                Sin servicios
                                            </span>
                                        `
                                }

                            </div>


                            <div
                                class="
                                    modern-barber-footer
                                "
                            >

                                <span>
                                    ${escapeHTML(
                                        barber.phone ||
                                        "Sin teléfono"
                                    )}
                                </span>


                                <button
                                    type="button"
                                    class="
                                        modern-edit-button
                                    "
                                    data-action="edit"
                                    data-id="${barber.id}"
                                >
                                    Editar
                                    <span>
                                        →
                                    </span>
                                </button>

                            </div>

                        </article>

                    `;

                }
            )
            .join("");

}


/* =====================================================
   APPOINTMENTS TODAY
===================================================== */

function getAppointmentsToday(
    barberId,
    appointments
) {

    const today =
        getLocalDate();


    return appointments.filter(
        appointment =>
            appointment.barberId ===
                barberId &&

            appointment.date ===
                today &&

            appointment.status !==
                "cancelled" &&

            appointment.status !==
                "no-show"
    ).length;

}


/* =====================================================
   GRID ACTION
===================================================== */

function handleGridAction(
    event
) {

    const button =
        event.target.closest(
            "[data-action]"
        );


    if (!button) {
        return;
    }


    if (
        button.dataset.action ===
        "edit"
    ) {

        openEditBarber(
            button.dataset.id
        );

    }

}


/* =====================================================
   NEW BARBER
===================================================== */

function openNewBarber() {

    editingBarberId =
        null;


    document
        .getElementById(
            "barberModalTitle"
        )
        .textContent =
        "Nuevo barbero";


    barberName.value =
        "";


    barberPhone.value =
        "";


    barberActiveSwitch.checked =
        true;


    barberModalAvatar.textContent =
        "NB";


    renderServices(
        services.map(
            service =>
                service.id
        )
    );


    renderSchedule(
        createSchedule()
    );


    openModal();

}


/* =====================================================
   EDIT BARBER
===================================================== */

function openEditBarber(id) {

    const barber =
        getBarbers()
            .find(
                item =>
                    item.id === id
            );


    if (!barber) {
        return;
    }


    editingBarberId =
        barber.id;


    document
        .getElementById(
            "barberModalTitle"
        )
        .textContent =
        barber.name;


    barberName.value =
        barber.name;


    barberPhone.value =
        barber.phone || "";


    barberActiveSwitch.checked =
        barber.status ===
        "active";


    barberModalAvatar.textContent =
        getInitials(
            barber.name
        );


    renderServices(
        barber.serviceIds ||
        []
    );


    renderSchedule(
        barber.schedule ||
        createSchedule()
    );


    openModal();

}


/* =====================================================
   MODAL
===================================================== */

function openModal() {

    barberModal.classList.remove(
        "hidden"
    );


    document.body.classList.add(
        "modal-open"
    );


    setTimeout(
        () => {

            barberName.focus();

        },
        50
    );

}


function closeModal() {

    barberModal.classList.add(
        "hidden"
    );


    document.body.classList.remove(
        "modal-open"
    );


    editingBarberId =
        null;

}


/* =====================================================
   MODAL AVATAR
===================================================== */

function updateModalAvatar() {

    const value =
        barberName.value.trim();


    barberModalAvatar.textContent =
        value
            ? getInitials(
                value
            )
            : "NB";

}


/* =====================================================
   SERVICES
===================================================== */

function renderServices(
    selectedIds
) {

    barberServices.innerHTML =
        services
            .map(
                service => `

                    <label
                        class="
                            modern-service-option
                        "
                    >

                        <input
                            type="checkbox"
                            value="${service.id}"
                            ${
                                selectedIds.includes(
                                    service.id
                                )
                                    ? "checked"
                                    : ""
                            }
                        >


                        <span
                            class="
                                modern-service-check
                            "
                        >
                            ✓
                        </span>


                        <div>

                            <strong>
                                ${service.name}
                            </strong>

                            <small>
                                ${service.duration}
                                min ·
                                $${service.price}
                            </small>

                        </div>

                    </label>

                `
            )
            .join("");

}


/* =====================================================
   SCHEDULE
===================================================== */

function renderSchedule(
    schedule
) {

    scheduleEditor.innerHTML =
        Object
            .entries(
                dayLabels
            )
            .map(
                ([
                    day,
                    label
                ]) => {

                    const config =
                        schedule[day] ||
                        defaultSchedule[day];


                    return `

                        <div
                            class="
                                modern-schedule-row
                                ${
                                    config.enabled
                                        ? ""
                                        : "disabled"
                                }
                            "
                            data-day="${day}"
                        >

                            <div
                                class="
                                    modern-schedule-day
                                "
                            >

                                <label
                                    class="
                                        modern-switch
                                        small
                                    "
                                >

                                    <input
                                        type="checkbox"
                                        class="
                                            schedule-enabled
                                        "
                                        ${
                                            config.enabled
                                                ? "checked"
                                                : ""
                                        }
                                    >

                                    <span
                                        class="
                                            modern-switch-slider
                                        "
                                    ></span>

                                </label>


                                <strong>
                                    ${label}
                                </strong>

                            </div>


                            <div
                                class="
                                    modern-schedule-times
                                "
                            >

                                ${
                                    config.enabled
                                        ?
                                        `
                                            <input
                                                type="time"
                                                class="
                                                    schedule-start
                                                "
                                                value="${config.start}"
                                            >

                                            <span>
                                                →
                                            </span>

                                            <input
                                                type="time"
                                                class="
                                                    schedule-end
                                                "
                                                value="${config.end}"
                                            >
                                        `
                                        :
                                        `
                                            <span
                                                class="
                                                    schedule-rest-label
                                                "
                                            >
                                                Descanso
                                            </span>

                                            <input
                                                type="time"
                                                class="
                                                    schedule-start
                                                "
                                                value="${config.start}"
                                                hidden
                                            >

                                            <input
                                                type="time"
                                                class="
                                                    schedule-end
                                                "
                                                value="${config.end}"
                                                hidden
                                            >
                                        `
                                }

                            </div>

                        </div>

                    `;

                }
            )
            .join("");

}


/* =====================================================
   SCHEDULE SWITCH
===================================================== */

function updateScheduleState(
    checkbox
) {

    const schedule =
        collectSchedule();


    const row =
        checkbox.closest(
            ".modern-schedule-row"
        );


    const day =
        row.dataset.day;


    schedule[day].enabled =
        checkbox.checked;


    renderSchedule(
        schedule
    );

}


/* =====================================================
   COLLECT SCHEDULE
===================================================== */

function collectSchedule() {

    const result = {};


    scheduleEditor
        .querySelectorAll(
            ".modern-schedule-row"
        )
        .forEach(
            row => {

                const day =
                    row.dataset.day;


                const enabled =
                    row.querySelector(
                        ".schedule-enabled"
                    ).checked;


                const startInput =
                    row.querySelector(
                        ".schedule-start"
                    );


                const endInput =
                    row.querySelector(
                        ".schedule-end"
                    );


                result[day] = {
                    enabled,

                    start:
                        startInput?.value ||
                        defaultSchedule[day].start,

                    end:
                        endInput?.value ||
                        defaultSchedule[day].end
                };

            }
        );


    return result;

}


/* =====================================================
   SAVE
===================================================== */

function saveBarber() {

    const name =
        barberName.value.trim();


    const phone =
        barberPhone.value.trim();


    if (!name) {

        showToast(
            "Ingresa el nombre del barbero."
        );

        barberName.focus();

        return;

    }


    const selectedServices =
        Array.from(
            barberServices
                .querySelectorAll(
                    "input[type='checkbox']:checked"
                )
        )
        .map(
            checkbox =>
                checkbox.value
        );


    if (
        !selectedServices.length
    ) {

        showToast(
            "Selecciona al menos un servicio."
        );

        return;

    }


    const schedule =
        collectSchedule();


    if (
        !validateSchedule(
            schedule
        )
    ) {
        return;
    }


    const barbers =
        getBarbers();


    const status =
        barberActiveSwitch.checked
            ? "active"
            : "inactive";


    if (
        editingBarberId
    ) {

        const barber =
            barbers.find(
                item =>
                    item.id ===
                    editingBarberId
            );


        if (!barber) {
            return;
        }


        barber.name =
            name;


        barber.phone =
            phone;


        barber.status =
            status;


        barber.serviceIds =
            selectedServices;


        barber.schedule =
            schedule;


        showToast(
            `${name} actualizado correctamente.`
        );

    } else {

        barbers.push({

            id:
                generateId(
                    "barber"
                ),

            name,

            phone,

            status,

            serviceIds:
                selectedServices,

            schedule

        });


        showToast(
            `${name} fue agregado al equipo.`
        );

    }


    saveBarbers(
        barbers
    );


    closeModal();


    renderSummary();

    renderBarbers();

}


/* =====================================================
   VALIDATE SCHEDULE
===================================================== */

function validateSchedule(
    schedule
) {

    for (
        const [
            day,
            info
        ] of Object.entries(
            schedule
        )
    ) {

        if (!info.enabled) {
            continue;
        }


        if (
            !info.start ||
            !info.end
        ) {

            showToast(
                `Completa el horario de ${
                    dayLabels[day]
                }.`
            );

            return false;

        }


        if (
            info.start >=
            info.end
        ) {

            showToast(
                `Revisa el horario de ${
                    dayLabels[day]
                }.`
            );

            return false;

        }

    }


    return true;

}


/* =====================================================
   TODAY SCHEDULE
===================================================== */

function getTodaySchedule(
    barber
) {

    const days = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday"
    ];


    const today =
        days[
            new Date()
                .getDay()
        ];


    return (
        barber.schedule?.[today] ||
        null
    );

}


/* =====================================================
   FORMAT TODAY
===================================================== */

function formatTodaySchedule(
    schedule
) {

    if (
        !schedule ||
        !schedule.enabled
    ) {

        return "Descanso";

    }


    return `${
        formatTime(
            schedule.start
        )
    } — ${
        formatTime(
            schedule.end
        )
    }`;

}


/* =====================================================
   LOCAL DATE
===================================================== */

function getLocalDate() {

    const now =
        new Date();


    const year =
        now.getFullYear();


    const month =
        String(
            now.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const day =
        String(
            now.getDate()
        ).padStart(
            2,
            "0"
        );


    return `${year}-${month}-${day}`;

}


/* =====================================================
   TIME FORMAT
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


    const formattedHour =
        hours % 12 ||
        12;


    return `${
        formattedHour
    }:${
        String(
            minutes
        ).padStart(
            2,
            "0"
        )
    } ${period}`;

}


/* =====================================================
   INITIALS
===================================================== */

function getInitials(name) {

    return String(
        name
    )
        .trim()
        .split(/\s+/)
        .slice(
            0,
            2
        )
        .map(
            part =>
                part
                    .charAt(0)
                    .toUpperCase()
        )
        .join("");

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
   INIT
===================================================== */

initialize();