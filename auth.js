/* ==========================================================================
   auth.js — Guardia de sesión + permisos por rol para el panel.
   Debe cargarse ANTES que dashboard.js en index.html (sin defer).
   Roles:
     admin        todo (ver + exportar + gestionar)
     capturista   ver + exportar
     consulta     solo ver (sin exportar)
     coordinador  solo SUS municipios + exportar directo a Excel
                  (su boton de filtros se convierte en exportar)
   ========================================================================== */
'use strict';

const FORTA_SESSION_KEY = 'forta_session';
const FORTA_SESSION_MAX_MIN = 8 * 60;

function fortaGetSession() {
    try {
        const s = JSON.parse(sessionStorage.getItem(FORTA_SESSION_KEY) || 'null');
        if (!s || !s.usuario) return null;
        if (Date.now() - s.loginAt > FORTA_SESSION_MAX_MIN * 60 * 1000) {
            sessionStorage.removeItem(FORTA_SESSION_KEY);
            return null;
        }
        return s;
    } catch { return null; }
}

function fortaLogout() {
    sessionStorage.removeItem(FORTA_SESSION_KEY);
    location.href = 'login.html';
}

function fortaIsCoordinador(session) {
    return !!session && session.rol === 'coordinador';
}

function fortaCanExport(rol) {
    // consulta = solo lectura; todos los demas exportan
    return rol === 'admin' || rol === 'capturista' || rol === 'coordinador';
}

function fortaCanManageUsers(rol) {
    return rol === 'admin';
}

// Guardia: sin sesión válida, fuera al login. Se ejecuta de inmediato.
(function fortaGuard() {
    if (!fortaGetSession()) {
        location.replace('login.html');
    }
})();
