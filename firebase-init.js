/**
 * firebase-init.js — Inicialización de Firebase con tolerancia a bloqueos
 * Inicializa Firebase si está disponible; si está bloqueado por el navegador/red,
 * permite que el sistema continúe con el almacenamiento local.
 */
'use strict';

async function initFirebase() {
    if (typeof window === 'undefined' || typeof window.FORTA_FIREBASE_CONFIG === 'undefined') {
        return false;
    }

    const config = window.FORTA_FIREBASE_CONFIG;

    if (typeof firebase === 'undefined') {
        console.warn('⚠️ SDK de Firebase no disponible o bloqueado por el navegador/red. Se usará el almacenamiento local de respaldo.');
        return false;
    }

    try {
        if (!firebase.apps || !firebase.apps.length) {
            firebase.initializeApp(config);
        }
        window.firebaseApp = firebase.app();
        window.firebaseFirestore = firebase.firestore();
        console.log('✅ Firebase Firestore inicializado');
        return true;
    } catch (error) {
        console.warn('⚠️ No se pudo inicializar Firebase (' + error.message + '). Se usará el almacenamiento local.');
        return false;
    }
}

window.initFirebasePromise = initFirebase();
window.mainInit = initFirebase;
