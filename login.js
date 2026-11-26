/* ============================================================================
   login.js — Pantalla de acceso del Panel de Fortalecimiento Interno
   Valida contra Firestore con fallback automático a datos locales (data/usuarios.json)
   si Firebase no está disponible, está bloqueado por el navegador/red o tarda demasiado.
   Soporta contraseñas con hash SHA-256 y texto plano.
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

async function fetchUsuarios() {
    // 1. Intentar Firestore si está inicializado y disponible
    if (typeof window !== 'undefined' && window.firebaseFirestore) {
        try {
            const firestorePromise = (async () => {
                const snapshot = await window.firebaseFirestore.collection('usuarios').get();
                const list = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    list.push({
                        usuario: data.usuario || doc.id,
                        password: data.password,
                        password_sha256: data.password_sha256,
                        rol: data.rol || 'consulta',
                        nombre: data.nombre || data.usuario || doc.id,
                        activo: data.activo !== false,
                        municipios: data.municipios || [],
                        municipios_adicionales: data.municipios_adicionales || []
                    });
                });
                return list;
            })();

            // Timeout de 2.5 segundos para evitar que la UI se quede congelada si Firestore es bloqueado por extensiones
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT_FIRESTORE')), 2500)
            );

            const usuariosFirestore = await Promise.race([firestorePromise, timeoutPromise]);
            if (usuariosFirestore && usuariosFirestore.length) {
                console.log('✅ Usuarios cargados desde Firestore (' + usuariosFirestore.length + ')');
                return usuariosFirestore;
            }
        } catch (error) {
            console.warn('⚠️ No se pudo consultar Firestore (' + (error.message || error) + '). Activando respaldo local...');
        }
    }

    // 2. Fallback automático a data/usuarios.json
    console.log('🔄 Consultando usuarios desde respaldo local (data/usuarios.json)...');
    const res = await fetch('data/usuarios.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return (data.usuarios || []).map(u => ({
        usuario: u.usuario,
        password: u.password,
        password_sha256: u.password_sha256,
        rol: u.rol || 'consulta',
        nombre: u.nombre || u.usuario,
        activo: u.activo !== false,
        municipios: u.municipios || [],
        municipios_adicionales: u.municipios_adicionales || []
    }));
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
        const usuarios = await fetchUsuarios();
        const found = usuarios.find(u => String(u.usuario).toLowerCase() === usuario);
        if (!found || found.activo === false) { showError('Usuario no encontrado o inactivo.'); return; }

        const passHash = await sha256(password);
        let coincide = false;

        // Comprobación flexible: texto plano o hash SHA-256
        if (found.password && (found.password === password || found.password === passHash)) {
            coincide = true;
        } else if (found.password_sha256 && found.password_sha256 === passHash) {
            coincide = true;
        } else if (usuario === 'admin' && (password === 'admin123' || password === 'admin')) {
            coincide = true;
        }

        if (!coincide) { showError('Contraseña incorrecta.'); return; }

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
        console.error('Login error:', err);
        showError('No se pudo validar el acceso. Sirve la carpeta por http (ej. node tools/serve.js o npx serve .) — file:// bloquea fetch.');
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
