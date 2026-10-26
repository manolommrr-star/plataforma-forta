/* ============================================================================
   login.js — Pantalla de acceso del Panel de Fortalecimiento Interno
   Valida contra Firestore (colección "usuarios") usando comparación de texto.
   Sin sesión no se entra al panel.
   ========================================================================== */

'use strict';

const SESSION_KEY = 'forta_session';
const SESSION_MAX_MIN = 8 * 60; // 8 horas

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

async function fetchUsuariosDesdeFirestore() {
    try {
        const usuarios = [];
        const snapshot = await window.firebaseFirestore.collection('usuarios').get();
        snapshot.forEach(doc => {
            const data = doc.data();
            usuarios.push({
                usuario: data.usuario,
                password: data.password_sha256 || data.password,
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
    if (!usuario || !password) { showError('Escribe tu usuario y contraseña.'); return; }
    setLoading(true);
    try {
        if (!window.firebaseFirestore) {
            showError('Firebase no configurado. Recarga la página.');
            setLoading(false);
            return;
        }
        const usuarios = await fetchUsuariosDesdeFirestore();
        const found = usuarios.find(u => String(u.usuario).toLowerCase() === usuario);
        if (!found || found.activo === false) { showError('Usuario no encontrado o inactivo.'); return; }
        if (found.password !== password) { showError('Contraseña incorrecta.'); return; }
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
        showError('No se pudo validar el acceso. Asegúrate de que Firebase esté configurado correctamente.');
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
    if (getSession()) { location.href = 'index.html'; return; }
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('login-toggle').addEventListener('click', function() {
        const input = document.getElementById('login-pass');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        this.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
})();