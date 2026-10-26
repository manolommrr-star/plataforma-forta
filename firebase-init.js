/**
 * firebase-init.js — Inicialización de Firebase
 * 
 * Inicializa Firebase y exporta las referencias a los servicios.
 * Debe cargarse ANTES que otros scripts que usen Firebase.
 */
'use strict';

// Esperar a que firebase-config.js esté disponible
async function initFirebase() {
    if (typeof window.FORTA_FIREBASE_CONFIG === 'undefined') {
        console.error('⚠️ FORTA_FIREBASE_CONFIG no está definido. Asegúrate de que firebase-config.js esté cargado primero.');
        return false;
    }
    
    const config = window.FORTA_FIREBASE_CONFIG;
    
    // Verificar que Firebase SDK esté disponible
    if (typeof firebase === 'undefined') {
        console.error('⚠️ SDK de Firebase no cargado. Agregar <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"></script>');
        return false;
    }
    
    try {
        // Inicializar Firebase
        firebase.initializeApp(config);
        
        // Exportar servicios
        window.firebaseApp = firebase.app();
        window.firebaseAuth = firebase.auth();
        window.firebaseFirestore = firebase.firestore();
        
        console.log('✅ Firebase inicializado correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error al inicializar Firebase:', error);
        return false;
    }
}

// Inicializar Firebase inmediatamente (no depende del DOM)
window.initFirebasePromise = initFirebase();

// También exponer función por si se necesita re-inicializar
window.mainInit = initFirebase;
