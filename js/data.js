export const services = [
    {
        id: "cut",
        name: "Corte clásico",
        price: 250,
        duration: 30
    },

    {
        id: "cut-beard",
        name: "Corte + barba",
        price: 350,
        duration: 45
    },

    {
        id: "beard",
        name: "Barba",
        price: 150,
        duration: 20
    }
];


export const barbers = [
    {
        id: "carlos",
        name: "Carlos"
    },

    {
        id: "miguel",
        name: "Miguel"
    },

    {
        id: "alex",
        name: "Alex"
    }
];


export const origins = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    facebook: "Facebook",
    phone: "Teléfono",
    "walk-in": "En persona"
};


export const availableTimes = [
    "09:00",
    "09:30",
    "10:00",
    "10:30",

    "11:00",
    "11:30",

    "12:00",
    "12:30",

    "13:00",
    "13:30",

    "14:00",
    "14:30",

    "15:00",
    "15:30",

    "16:00",
    "16:30",

    "17:00",
    "17:30",

    "18:00",
    "18:30"
];


export function getLocalDate(offset = 0) {

    const date = new Date();

    date.setDate(
        date.getDate() + offset
    );

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        );

    return `${year}-${month}-${day}`;
}


export const demoCustomers = [
    {
        id: "customer-1",
        name: "Juan Pérez",
        phone: "667 111 2233",
        visits: 3
    },

    {
        id: "customer-2",
        name: "Fernando Ruiz",
        phone: "667 222 3344",
        visits: 4
    },

    {
        id: "customer-3",
        name: "Roberto García",
        phone: "667 333 4455",
        visits: 2
    },

    {
        id: "customer-4",
        name: "Diego López",
        phone: "667 444 5566",
        visits: 1
    }
];


export function createDemoAppointments() {

    return [
        {
            id: "appointment-1",

            date:
                getLocalDate(),

            time:
                "10:00",

            clientName:
                "Juan Pérez",

            phone:
                "667 111 2233",

            serviceId:
                "cut",

            barberId:
                "carlos",

            origin:
                "whatsapp",

            status:
                "confirmed",

            notes:
                "",

            loyaltyApplied:
                false
        },

        {
            id: "appointment-2",

            date:
                getLocalDate(),

            time:
                "11:00",

            clientName:
                "Fernando Ruiz",

            phone:
                "667 222 3344",

            serviceId:
                "cut-beard",

            barberId:
                "miguel",

            origin:
                "instagram",

            status:
                "confirmed",

            notes:
                "Barba corta.",

            loyaltyApplied:
                false
        },

        {
            id: "appointment-3",

            date:
                getLocalDate(),

            time:
                "12:30",

            clientName:
                "Roberto García",

            phone:
                "667 333 4455",

            serviceId:
                "beard",

            barberId:
                "carlos",

            origin:
                "phone",

            status:
                "pending",

            notes:
                "",

            loyaltyApplied:
                false
        },

        {
            id: "appointment-4",

            date:
                getLocalDate(),

            time:
                "14:00",

            clientName:
                "Diego López",

            phone:
                "667 444 5566",

            serviceId:
                "cut",

            barberId:
                "alex",

            origin:
                "facebook",

            status:
                "pending",

            notes:
                "",

            loyaltyApplied:
                false
        }
    ];

}