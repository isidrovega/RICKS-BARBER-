/* =========================================================
   RICK'S BARBER SHOP
   FIREBASE CONFIG
========================================================= */

import { initializeApp } from
    "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getFirestore
} from
    "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
    getAuth
} from
    "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";


/* =========================================================
   FIREBASE CONFIGURATION
   Reemplaza estos valores con los de tu proyecto Firebase
========================================================= */

const firebaseConfig = {
    apiKey: "AIzaSyAcmEeSJOp4G_Pp5Nkon9vjI90UD6W1nwE",
    authDomain: "ricks-barber-shop.firebaseapp.com",
    projectId: "ricks-barber-shop",
    storageBucket: "ricks-barber-shop.firebasestorage.app",
    messagingSenderId: "483057296007",
    appId: "1:483057296007:web:ebb5f7bf90647896cece22"
};


/* =========================================================
   INITIALIZE FIREBASE
========================================================= */

const app = initializeApp(firebaseConfig);


/* =========================================================
   FIRESTORE DATABASE
========================================================= */

const db = getFirestore(app);


/* =========================================================
   FIREBASE AUTHENTICATION
========================================================= */

const auth = getAuth(app);


/* =========================================================
   EXPORTS
========================================================= */

export {
    app,
    db,
    auth
};