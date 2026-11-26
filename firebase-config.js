/**
 * firebase-config.js — Configuración de Firebase
 * Generado automáticamente por GitHub Actions desde Secrets.
 * NO se sube al repositorio; se inyecta en cada despliegue.
 */

// Valores de Firebase (inyectados desde GitHub Secrets)
const FORTA_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAIk9eiZ8iMHxtd834hI-xv_i2OjoWb2ts",
    authDomain: "plataforma-forta.firebaseapp.com",
    projectId: "plataforma-forta",
    storageBucket: "plataforma-forta.firebasestorage.app",
    messagingSenderId: "904780737662",
    appId: "1:904780737662:web:c788edb7639ae4cc52fc2f"
};

// Exponer en navegador
if (typeof window !== 'undefined') {
    window.FORTA_FIREBASE_CONFIG = FORTA_FIREBASE_CONFIG;
}

// Exportar para Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FORTA_FIREBASE_CONFIG;
}
