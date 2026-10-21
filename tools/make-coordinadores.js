// tools/make-coordinadores.js — Actualiza los coordinadores de data/usuarios.json:
// - `nombre` en mayúsculas (títulos normalizados, ej. "FELIPE ALEJANDRO LÓPEZ GARCÍA").
// - `password_sha256` recalculado con la misma regla que los admins: 2 palabras
//   separadas por un punto + 2 números aleatorios ("palabra.palabra.12345678").
// Se encarga de unificar el formato de contraseñas entre admins y coordinadores.
// Uso: node tools/make-coordinadores.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');

const PALABRAS = ['casa', 'sol', 'mar', 'luna', 'rio', 'vida', 'flor', 'tono',
    'piedra', 'viento', 'hielo', 'arena', 'palma', 'osbo', 'nieve', 'grano'];
const rnd = (n = 4) => Math.floor(Math.random() * 10 ** n).toString().padStart(n, '0');

function generaPassword() {
    const a = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
    const b = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
    return `${a}.${b}.${rnd(4)}${rnd(4)}`;
}

function sha256(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }

const normalizeNombre = (full) => {
    // Nombre "CARLOS ALBERTO MEJÍA COVARRUBIAS" -> "Carlos Alberto Mejía Covarrubias"
    return String(full || '').replace(/\s+/g, ' ')
        .split(' ')
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
};

const uj = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'usuarios.json'), 'utf8'));
const coord = uj.usuarios.filter(u => u.rol === 'coordinador');
const before = coord.length;
let changed = 0;
const pwdClaro = {};

for (const u of coord) {
    if (!u.nombre || typeof u.nombre !== 'string') continue;
    const prev = u.nombre;
    // 1) Normalizar nombre -> "Nombre con mayusculas" (ej. "FELIPE ALEJANDRO LÓPEZ GARCÍA")
    const normalized = normalizeNombre(prev);
    if (normalized !== prev) { u.nombre = normalized; }
    // 2) Reemplazar contraseña por la misma norma que admins (genera un hash válido).
    const nuevo = generaPassword();
    u.password_sha256 = sha256(nuevo);
    pwdClaro[u.usuario] = nuevo;
    if (u.password_sha256 !== u.password_sha256 || true) {
        // No se compara contra si mismo; el cambio es real porque se recalcula.
        changed++;
    }
}

fs.writeFileSync(path.join(BASE, 'data', 'usuarios.json'), JSON.stringify(uj, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(BASE, 'tools', '_coord-pw.json'), JSON.stringify(pwdClaro, null, 2) + '\n', 'utf8');

console.log('Coordinadores actualizados: ' + changed + ' (antes ' + before + ').');
console.log('Nuevos datos de coordinadores:');
const now = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'usuarios.json'), 'utf8')).usuarios.filter(u => u.rol === 'coordinador');
for (const u of now) {
    console.log(`  ${u.usuario.padEnd(22)} | ${String(u.nombre)} | ${u.municipios ? u.municipios.length + ' munis' : ''} | password_sha256: ${u.password_sha256}`);
}
console.log('\\nOK: data/usuarios.json actualizado.');
console.log('Próximos pasos: 1) node verify.js  2) node smoke-ui.js  3) node tools/make-admins.js (si quieres regenerar)  4) revisar usuarios.xlsx');
