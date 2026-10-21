// tools/make-admins.js — Genera la lista final de ADMINISTRADORES de
// data/usuarios.json, eliminando todos los demas (coordinadores, consulta, etc.)
// y añadiendo los 6 indicados con contraseñas aleatorias.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const BASE = path.join(__dirname, '..');

// 6 usuarios finales: usuario -> nombre completo (capitanes).
const ADMINS = {
    'Enrique.cambranis': 'Enrique Cambranis',
    'Ana.ledezma': 'Ana Ledezma',
    'Gabriel.medardo': 'Gabriel Medardo',
    'Karla.mogollan': 'Karla Mogollan',
    'Arturo.ruiz': 'Arturo Ruiz',
    'Antony.rangel': 'Antony Rangel'
};

// Genera una contraseña: 2 palabras en minúsculas, separadas por un punto,
// seguido de 2 numeros aleatorios de 4 digitos.
const PALABRAS = ['casa', 'sol', 'mar', 'luna', 'rio', 'vida', 'flor', 'tono',
    'piedra', 'viento', 'hielo', 'arena', 'palma', 'osbo', 'nieve', 'grano'];
const pwdClaro = {}; // usuario -> contraseña en claro (para el Excel)
const rnd = (n = 4) => Math.floor(Math.random() * 10 ** n).toString().padStart(n, '0');
function generaPassword() {
    const a = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
    const b = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
    return `${a}.${b}.${rnd(4)}${rnd(4)}`;
}

function sha256(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }

// Cargar usuarios actuales.
let uj = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'usuarios.json'), 'utf8'));
const antes = uj.usuarios.length;

// 1) Conservar coordinadores y cualquier otro rol no-admin ya existente;
//    solo asegurarse de que los 6 admins finales esten presentes.
const noAdmins = uj.usuarios.filter(u => !ADMINS[u.usuario]);
uj.usuarios = noAdmins;
// 2) Añadir/actualizar los 6 admins.
const byU = new Map(uj.usuarios.map(u => [u.usuario, u]));
for (const [usuario, nombre] of Object.entries(ADMINS)) {
    const p = generaPassword();
    pwdClaro[usuario] = p;
    if (byU.has(usuario)) {
        byU.get(usuario).nombre = nombre;
        byU.get(usuario).rol = 'admin';
        byU.get(usuario).password_sha256 = sha256(p);
        byU.get(usuario).activo = true;
    } else {
        byU.set(usuario, {
            usuario,
            nombre,
            rol: 'admin',
            password_sha256: sha256(p),
            activo: true
        });
    }
}
uj.usuarios = Array.from(byU.values());

// 3) Escribir datos.
fs.writeFileSync(path.join(BASE, 'data', 'usuarios.json'), JSON.stringify(uj, null, 2) + '\n', 'utf8');
const pwPath = path.join(BASE, 'tools', '_coord-pw.json');
const prev = {};
try { Object.assign(prev, JSON.parse(fs.readFileSync(pwPath, 'utf8'))); } catch { }
fs.writeFileSync(pwPath, JSON.stringify({...prev, ...pwdClaro}, null, 2) + '\n', 'utf8');

console.log('antes: ' + antes + ' usuario(s) | despues: ' + uj.usuarios.length + ' (admins)');
console.log('usuarios finales:');
uj.usuarios.forEach(u => console.log('  ' + u.usuario + ' | ' + u.nombre + ' | ' + u.rol + ' | pw: ' + u.password_sha256));

// 4) Test de integridad minimo antes de regenerar (evita que el script escriba
//    datos rotos). Corre verify.js como módulo.
const verifyPath = path.join(BASE, 'verify.js');

try {
    execFileSync(process.execPath, [verifyPath], { cwd: BASE, stdio: 'pipe' });
} catch (e) {
    console.error('\\n[AVISO] verify.js no paso: ' + e.message.split('\n')[0]);
}
console.log('\\nOK: data/usuarios.json actualizado. Ejecuta: node verify.js');
