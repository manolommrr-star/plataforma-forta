/* ==========================================================================
   login.js — Pantalla de acceso del Panel de Fortalecimiento Interno.
   Valida contra data/usuarios.json (SHA-256) y guarda la sesión en
   sessionStorage (clave forta_session). Sin sesión no se entra al panel.
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

async function handleLogin(ev) {
    ev.preventDefault();
    document.getElementById('login-error').hidden = true;
    const usuario = document.getElementById('login-user').value.trim().toLowerCase();
    const password = document.getElementById('login-pass').value;
    if (!usuario || !password) { showError('Escribe tu usuario y contraseña.'); return; }
    setLoading(true);
    try {
        const res = await fetch('data/usuarios.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const found = (data.usuarios || []).find(u => String(u.usuario).toLowerCase() === usuario);
        if (!found || found.activo === false) { showError('Usuario no encontrado o inactivo.'); return; }
        const hash = await sha256(password);
        if (hash !== found.password_sha256) { showError('Contraseña incorrecta.'); return; }
        const session = {
            usuario: found.usuario,
            nombre: found.nombre || found.usuario,
            rol: found.rol || 'consulta',
            loginAt: Date.now()
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        location.href = 'index.html';
    } catch (err) {
        console.error('Login:', err);
        showError('No se pudo validar el acceso. Sirve la carpeta por http (npx serve .) — file:// bloquea fetch.');
    } finally {
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
        this.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
    try { if (window.lucide) lucide.createIcons(); } catch (e) {}
})();
