/* =========================================================
   RICK'S BARBER SHOP
   FIRESTORE STORAGE LAYER
========================================================= */

import { db } from "./firebase.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    updateDoc,
    query,
    where,
    increment,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
    demoCustomers,
    createDemoAppointments
} from "./data.js";


/* =========================================================
   FIRESTORE COLLECTIONS
========================================================= */

const CUSTOMERS_COLLECTION = "customers";
const APPOINTMENTS_COLLECTION = "appointments";


/* =========================================================
   HELPERS
========================================================= */

export function normalizePhone(phone) {

    return String(
        phone || ""
    ).replace(
        /\D/g,
        ""
    );

}


export function generateId(prefix) {

    return `${prefix}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;

}


/* =========================================================
   NORMALIZERS
========================================================= */

function normalizeCustomer(customer) {

    return {

        ...customer,

        id:
            customer.id ||
            generateId("customer"),

        name:
            String(
                customer.name || ""
            ).trim(),

        phone:
            String(
                customer.phone || ""
            ).trim(),

        normalizedPhone:
            normalizePhone(
                customer.phone
            ),

        visits:
            Math.max(
                0,
                Number(
                    customer.visits || 0
                )
            ),

        rewardsRedeemed:
            Math.max(
                0,
                Number(
                    customer.rewardsRedeemed || 0
                )
            )

    };

}


function normalizeAppointment(
    appointment
) {

    return {

        ...appointment,

        id:
            appointment.id ||
            generateId(
                "appointment"
            ),

        loyaltyApplied:
            Boolean(
                appointment.loyaltyApplied
            )

    };

}


/* =========================================================
   SEED CUSTOMERS
========================================================= */

async function seedCustomersIfEmpty() {

    const customersRef =
        collection(
            db,
            CUSTOMERS_COLLECTION
        );


    const snapshot =
        await getDocs(
            customersRef
        );


    if (!snapshot.empty) {

        return;

    }


    const customers =
        Array.isArray(
            demoCustomers
        )
            ? demoCustomers
            : [];


    if (!customers.length) {

        return;

    }


    let batch =
        writeBatch(db);

    let operations = 0;


    for (
        const customerData
        of customers
    ) {

        const customer =
            normalizeCustomer(
                customerData
            );


        const customerRef =
            doc(
                db,
                CUSTOMERS_COLLECTION,
                customer.id
            );


        batch.set(
            customerRef,
            customer
        );


        operations += 1;


        if (
            operations >= 400
        ) {

            await batch.commit();

            batch =
                writeBatch(db);

            operations = 0;

        }

    }


    if (
        operations > 0
    ) {

        await batch.commit();

    }

}


/* =========================================================
   SEED APPOINTMENTS
========================================================= */

async function seedAppointmentsIfEmpty() {

    const appointmentsRef =
        collection(
            db,
            APPOINTMENTS_COLLECTION
        );


    const snapshot =
        await getDocs(
            appointmentsRef
        );


    if (!snapshot.empty) {

        return;

    }


    const demoData =
        typeof createDemoAppointments ===
        "function"
            ? createDemoAppointments()
            : [];


    if (
        !Array.isArray(
            demoData
        ) ||
        !demoData.length
    ) {

        return;

    }


    let batch =
        writeBatch(db);

    let operations = 0;


    for (
        const appointmentData
        of demoData
    ) {

        const appointment =
            normalizeAppointment(
                appointmentData
            );


        const appointmentRef =
            doc(
                db,
                APPOINTMENTS_COLLECTION,
                appointment.id
            );


        batch.set(
            appointmentRef,
            appointment
        );


        operations += 1;


        if (
            operations >= 400
        ) {

            await batch.commit();

            batch =
                writeBatch(db);

            operations = 0;

        }

    }


    if (
        operations > 0
    ) {

        await batch.commit();

    }

}


/* =========================================================
   INITIAL DATABASE SEED
========================================================= */

export async function initializeDatabase() {

    try {

        await Promise.all([
            seedCustomersIfEmpty(),
            seedAppointmentsIfEmpty()
        ]);


        return true;

    } catch (error) {

        console.error(
            "Error inicializando Firestore:",
            error
        );


        throw error;

    }

}


/* =========================================================
   GET CUSTOMERS
========================================================= */


export async function getCustomers() {
    try {
        const customersRef = collection(
            db,
            CUSTOMERS_COLLECTION
        );

        const snapshot = await getDocs(customersRef);

        return snapshot.docs.map(customerDoc => {
            return normalizeCustomer({
                ...customerDoc.data(),
                id: customerDoc.id
            });
        });

    } catch (error) {
        console.error(
            "Error cargando clientes desde Firestore:",
            error
        );

        throw error;
    }
}



/* =========================================================
   SAVE CUSTOMERS
========================================================= */

export async function saveCustomers(
    customers
) {

    if (
        !Array.isArray(customers)
    ) {

        throw new TypeError(
            "saveCustomers esperaba un arreglo."
        );

    }


    try {

        const existingSnapshot =
            await getDocs(
                collection(
                    db,
                    CUSTOMERS_COLLECTION
                )
            );


        const incomingCustomers =
            customers.map(
                normalizeCustomer
            );


        const incomingIds =
            new Set(
                incomingCustomers.map(
                    customer =>
                        customer.id
                )
            );


        /*
         * Primero eliminamos documentos que ya no
         * existan en el arreglo recibido.
         */

        let batch =
            writeBatch(db);

        let operations = 0;


        for (
            const existingDoc
            of existingSnapshot.docs
        ) {

            if (
                !incomingIds.has(
                    existingDoc.id
                )
            ) {

                batch.delete(
                    existingDoc.ref
                );


                operations += 1;


                if (
                    operations >= 400
                ) {

                    await batch.commit();

                    batch =
                        writeBatch(db);

                    operations = 0;

                }

            }

        }


        /*
         * Después creamos / actualizamos clientes.
         */

        for (
            const customer
            of incomingCustomers
        ) {

            const customerRef =
                doc(
                    db,
                    CUSTOMERS_COLLECTION,
                    customer.id
                );


            batch.set(
                customerRef,
                customer
            );


            operations += 1;


            if (
                operations >= 400
            ) {

                await batch.commit();

                batch =
                    writeBatch(db);

                operations = 0;

            }

        }


        if (
            operations > 0
        ) {

            await batch.commit();

        }


        return incomingCustomers;

    } catch (error) {

        console.error(
            "Error guardando clientes:",
            error
        );


        throw error;

    }

}


/* =========================================================
   GET APPOINTMENTS
========================================================= */

export async function getAppointments() {
    try {
        const appointmentsRef = collection(
            db,
            APPOINTMENTS_COLLECTION
        );

        const snapshot = await getDocs(appointmentsRef);

        return snapshot.docs.map(appointmentDoc => {
            return normalizeAppointment({
                ...appointmentDoc.data(),
                id: appointmentDoc.id
            });
        });

    } catch (error) {
        console.error(
            "Error cargando citas desde Firestore:",
            error
        );

        throw error;
    }
}



/* =========================================================
   SAVE APPOINTMENTS
========================================================= */

export async function saveAppointments(
    appointments
) {

    if (
        !Array.isArray(
            appointments
        )
    ) {

        throw new TypeError(
            "saveAppointments esperaba un arreglo."
        );

    }


    try {

        const existingSnapshot =
            await getDocs(
                collection(
                    db,
                    APPOINTMENTS_COLLECTION
                )
            );


        const incomingAppointments =
            appointments.map(
                normalizeAppointment
            );


        const incomingIds =
            new Set(
                incomingAppointments.map(
                    appointment =>
                        appointment.id
                )
            );


        let batch =
            writeBatch(db);

        let operations = 0;


        /*
         * Eliminar citas que ya no existan.
         */

        for (
            const existingDoc
            of existingSnapshot.docs
        ) {

            if (
                !incomingIds.has(
                    existingDoc.id
                )
            ) {

                batch.delete(
                    existingDoc.ref
                );


                operations += 1;


                if (
                    operations >= 400
                ) {

                    await batch.commit();

                    batch =
                        writeBatch(db);

                    operations = 0;

                }

            }

        }


        /*
         * Crear / actualizar citas.
         */

        for (
            const appointment
            of incomingAppointments
        ) {

            const appointmentRef =
                doc(
                    db,
                    APPOINTMENTS_COLLECTION,
                    appointment.id
                );


            batch.set(
                appointmentRef,
                appointment
            );


            operations += 1;


            if (
                operations >= 400
            ) {

                await batch.commit();

                batch =
                    writeBatch(db);

                operations = 0;

            }

        }


        if (
            operations > 0
        ) {

            await batch.commit();

        }


        return incomingAppointments;

    } catch (error) {

        console.error(
            "Error guardando citas:",
            error
        );


        throw error;

    }

}


/* =========================================================
   FIND CUSTOMER BY PHONE
========================================================= */

export async function findCustomerByPhone(
    phone
) {

    const normalized =
        normalizePhone(
            phone
        );


    if (!normalized) {

        return undefined;

    }


    try {

        /*
         * Búsqueda rápida para clientes que ya tienen
         * normalizedPhone almacenado.
         */

        const customerQuery =
            query(
                collection(
                    db,
                    CUSTOMERS_COLLECTION
                ),
                where(
                    "normalizedPhone",
                    "==",
                    normalized
                )
            );


        const snapshot =
            await getDocs(
                customerQuery
            );


        if (
            !snapshot.empty
        ) {

            const customerDoc =
                snapshot.docs[0];


            return normalizeCustomer({

                ...customerDoc.data(),

                id:
                    customerDoc.data().id ||
                    customerDoc.id

            });

        }


        /*
         * Compatibilidad:
         * si hay clientes antiguos en Firestore
         * sin normalizedPhone, hacemos búsqueda manual.
         */

        const customers =
            await getCustomers();


        return customers.find(
            customer =>
                normalizePhone(
                    customer.phone
                ) === normalized
        );

    } catch (error) {

        console.error(
            "Error buscando cliente por teléfono:",
            error
        );


        throw error;

    }

}


/* =========================================================
   GET OR CREATE CUSTOMER
========================================================= */

export async function getOrCreateCustomer(
    name,
    phone
) {

    const cleanName =
        String(
            name || ""
        ).trim();


    const cleanPhone =
        String(
            phone || ""
        ).trim();


    const normalized =
        normalizePhone(
            cleanPhone
        );


    if (!cleanName) {

        throw new Error(
            "El nombre del cliente es obligatorio."
        );

    }


    if (!normalized) {

        throw new Error(
            "El teléfono del cliente es obligatorio."
        );

    }


    try {

        const existingCustomer =
            await findCustomerByPhone(
                cleanPhone
            );


        if (
            existingCustomer
        ) {

            const updatedCustomer = {

                ...existingCustomer,

                name:
                    cleanName,

                phone:
                    cleanPhone,

                normalizedPhone:
                    normalized

            };


            await setDoc(
                doc(
                    db,
                    CUSTOMERS_COLLECTION,
                    updatedCustomer.id
                ),
                updatedCustomer,
                {
                    merge: true
                }
            );


            return updatedCustomer;

        }


        const customer = {

            id:
                generateId(
                    "customer"
                ),

            name:
                cleanName,

            phone:
                cleanPhone,

            normalizedPhone:
                normalized,

            visits:
                0,

            rewardsRedeemed:
                0,

            createdAt:
                new Date()
                    .toISOString()

        };


        await setDoc(
            doc(
                db,
                CUSTOMERS_COLLECTION,
                customer.id
            ),
            customer
        );


        return customer;

    } catch (error) {

        console.error(
            "Error creando/actualizando cliente:",
            error
        );


        throw error;

    }

}


/* =========================================================
   ADD CUSTOMER VISIT
========================================================= */

export async function addCustomerVisit(
    phone
) {

    const normalized =
        normalizePhone(
            phone
        );


    if (!normalized) {

        return false;

    }


    try {

        const customer =
            await findCustomerByPhone(
                phone
            );


        if (!customer) {

            return false;

        }


        const customerRef =
            doc(
                db,
                CUSTOMERS_COLLECTION,
                customer.id
            );


        await updateDoc(
            customerRef,
            {
                visits:
                    increment(1),

                updatedAt:
                    new Date()
                        .toISOString()
            }
        );


        return true;

    } catch (error) {

        console.error(
            "Error agregando visita al cliente:",
            error
        );


        throw error;

    }

}


/* =========================================================
   GET CUSTOMER BY ID
========================================================= */

export async function getCustomerById(
    customerId
) {

    if (!customerId) {

        return null;

    }


    try {

        const customerRef =
            doc(
                db,
                CUSTOMERS_COLLECTION,
                customerId
            );


        const snapshot =
            await getDoc(
                customerRef
            );


        if (!snapshot.exists()) {

            return null;

        }


        return normalizeCustomer({

            ...snapshot.data(),

            id:
                snapshot.data().id ||
                snapshot.id

        });

    } catch (error) {

        console.error(
            "Error obteniendo cliente:",
            error
        );


        throw error;

    }

}


/* =========================================================
   SAVE SINGLE CUSTOMER
========================================================= */

export async function saveCustomer(
    customerData
) {

    if (!customerData) {

        throw new Error(
            "No se proporcionó un cliente."
        );

    }


    const customer =
        normalizeCustomer(
            customerData
        );


    try {

        await setDoc(
            doc(
                db,
                CUSTOMERS_COLLECTION,
                customer.id
            ),
            customer,
            {
                merge: true
            }
        );


        return customer;

    } catch (error) {

        console.error(
            "Error guardando cliente:",
            error
        );


        throw error;

    }

}


/* =========================================================
   DELETE CUSTOMER
========================================================= */

export async function deleteCustomer(
    customerId
) {

    if (!customerId) {

        return false;

    }


    try {

        await deleteDoc(
            doc(
                db,
                CUSTOMERS_COLLECTION,
                customerId
            )
        );


        return true;

    } catch (error) {

        console.error(
            "Error eliminando cliente:",
            error
        );


        throw error;

    }

}


/* =========================================================
   SAVE SINGLE APPOINTMENT
========================================================= */

export async function saveAppointment(
    appointmentData
) {

    if (!appointmentData) {

        throw new Error(
            "No se proporcionó una cita."
        );

    }


    const appointment =
        normalizeAppointment(
            appointmentData
        );


    try {

        await setDoc(
            doc(
                db,
                APPOINTMENTS_COLLECTION,
                appointment.id
            ),
            appointment,
            {
                merge: true
            }
        );


        return appointment;

    } catch (error) {

        console.error(
            "Error guardando cita:",
            error
        );


        throw error;

    }

}


/* =========================================================
   DELETE APPOINTMENT
========================================================= */

export async function deleteAppointment(
    appointmentId
) {

    if (!appointmentId) {

        return false;

    }


    try {

        await deleteDoc(
            doc(
                db,
                APPOINTMENTS_COLLECTION,
                appointmentId
            )
        );


        return true;

    } catch (error) {

        console.error(
            "Error eliminando cita:",
            error
        );


        throw error;

    }

}