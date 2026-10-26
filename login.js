/* ============================================================================
   login.js — Pantalla de acceso del Panel de Fortalecimiento Interno
   Valida contra Firestore (colección "usuarios") usando SHA-256.
   Sin sesión no se entra al panel.
   ========================================================================== */

'use strict';

const SESSION_KEY = 'forta_session';
const SESSION_MAX_MIN = 8 * 60; // 8 horas

async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.hidden = false;
}

function setLoading(on) {
    const btn = document.getElementById('login-submit');
    btn.disabled = on;
    btn.querySelector('span').textContent = on ? 'Verificando...' : 'Entrar';
}

/**
 * Obtiene usuarios desde Firestore y los normaliza.
 * Busca en colección "usuarios" y devuelve array.
 */
async function fetchUsuariosDesdeFirestore() {
    try {
        const usuarios = [];
        const snapshot = await window.firebaseFirestore.collection('usuarios').get();
        snapshot.forEach(doc => {
            const data = doc.data();
            usuarios.push({
                usuario: data.usuario,
                password_sha256: data.password_sha256,
                rol: data.rol || 'consulta',
                nombre: data.nombre || data.usuario,
                activo: data.activo !== false,
                municipios: data.municipios || [],
                municipios_adicionales: data.municipios_adicionales || []
            });
        });
        return usuarios;
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        throw error;
    }
}

// Alcance de municipios de un usuario:
//   - `municipios`            -> municipios de su zona (coordinador)
//   - `municipios_adicionales`-> municipios compartidos con el (acceso extra)
function alcanceMunicipios(user) {
    const zona = Array.isArray(user && user.municipios) ? user.municipios : null;
    const extra = Array.isArray(user && user.municipios_adicionales) ? user.municipios_adicionales : [];
    if (!zona && !extra.length) return null;
    const set = {};
    (zona || []).forEach(n => { set[n] = true; });
    extra.forEach(n => { set[n] = true; });
    return Object.keys(set).map(Number).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
}

async function handleLogin(ev) {
    ev.preventDefault();
    document.getElementById('login-error').hidden = true;
    const usuario = document.getElementById('login-user').value.trim().toLowerCase();
    const password = document.getElementById('login-pass').value;
    if (!usuario || !password) { showError('Escribe tu usuario y contrase\u00f1a.'); return; }
    setLoading(true);
    try {
        // Verificar que Firebase esté inicializado
        if (!window.firebaseFirestore) {
            showError('Firebase no configurado. Recarga la p\u00e1gina.');
            setLoading(false);
            return;
        }

        // 1. Buscar usuario en Firestore
        const usuarios = await fetchUsuariosDesdeFirestore();
        const found = usuarios.find(u => String(u.usuario).toLowerCase() === usuario);
        if (!found || found.activo === false) { showError('Usuario no encontrado o inactivo.'); return; }
        const hash = await sha256(password);
        if (hash !== found.password_sha256) { showError('Contrase\u00f1a incorrecta.'); return; }
        // Alcance: municipios de su zona + municipios adicionales compartidos
        const alcance = alcanceMunicipios(found);
        const session = {
            usuario: found.usuario,
            nombre: found.nombre || found.usuario,
            rol: found.rol || 'consulta',
            municipios: alcance,
            loginAt: Date.now()
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        location.href = 'index.html';
    } catch (err) {
        console.error('Login:', err);
        showError('No se pudo validar el acceso. Aseg\u00farate de que Firebase est\u00e9 configurado correctamente.');
        setLoading(false);
    }
}

function getSession() {
    try {
        const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
        if (!s || !s.usuario) return null;
        if (Date.now() - s.loginAt > SESSION_MAX_MIN * 60 * 1000) {
            sessionStorage.removeItem(SESSION_KEY);
            return null;
        }
        return s;
    } catch { return null; }
}

function logout(dest) {
    sessionStorage.removeItem(SESSION_KEY);
    location.href = dest || 'login.html';
}

(function initLogin() {
    // Si ya hay sesión válida, salta directo al panel.
    if (getSession()) { location.href = 'index.html'; return; }
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('login-toggle').addEventListener('click', function() {
        const input = document.getElementById('login-pass');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        this.setAttribute('aria-label', show ? 'Ocultar contrase\u00f1a' : 'Mostrar contrase\u00f1a');
    });
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
})();
