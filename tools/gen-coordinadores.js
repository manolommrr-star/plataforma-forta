// tools/gen-coordinadores.js — genera usuarios coordinador en data/usuarios.json
// Regla: user = primer_nombre.primer_apellido (minusculas, sin acentos)
//        password = primer_apellido.segundo_apellido (minusculas, sin acentos)
//        rol = coordinador, municipios = numeros a su cargo (coordinador_zona)
// Uso: node tools/gen-coordinadores.js [--check]
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');

const sinAcentos = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const low = s => sinAcentos(s).toLowerCase().trim();

function parseNombre(full) {
    // "FELIPE ALEJANDRO LÓPEZ GARCÍA" -> nombre:FELIPE, ap1:LÓPEZ, ap2:GARCÍA
    const t = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (t.length < 3) return null; // necesita al menos nombre + 2 apellidos
    return { nombre: t[0], ap1: t[t.length - 2], ap2: t[t.length - 1] };
}

const data = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'municipios.json'), 'utf8'));
const porCoord = new Map();
data.forEach(m => {
    const c = String(m.coordinador_zona || '').trim();
    if (!c) return;
    if (!porCoord.has(c)) porCoord.set(c, []);
    porCoord.get(c).push(m['numero de municipio']);
});

const nuevos = [];
const problemas = [];
for (const [full, nums] of porCoord) {
    const p = parseNombre(full);
    if (!p) { problemas.push(full + ' (no tiene 2 apellidos)'); continue; }
    const usuario = low(p.nombre) + '.' + low(p.ap1);
    const password = low(p.ap1) + '.' + low(p.ap2);
    nuevos.push({
        usuario, nombre: full, rol: 'coordinador',
        password_sha256: crypto.createHash('sha256').update(password, 'utf8').digest('hex'),
        activo: true, municipios: nums.slice().sort((a, b) => a - b),
        _password_claro: password // solo para mostrar; NO se guarda en el JSON
    });
}
// colisiones de usuario?
const seen = new Map();
nuevos.forEach(n => {
    seen.set(n.usuario, (seen.get(n.usuario) || []).concat(n.nombre));
});
[...seen.entries()].filter(([, v]) => v.length > 1).forEach(([u, v]) => problemas.push('usuario duplicado ' + u + ': ' + v.join(' | ')));

console.log('Coordinadores: ' + porCoord.size + ' | usuarios generados: ' + nuevos.length);
nuevos.forEach(n => console.log('  ' + n.usuario + ' / ' + n._password_claro + '  (' + n.municipios.length + ' munis) <- ' + n.nombre));
if (problemas.length) { console.log('\nPROBLEMAS:'); problemas.forEach(p => console.log('  ! ' + p)); }
if (CHECK) { console.log('\n(--check) No se escribió nada.'); process.exit(problemas.length ? 1 : 0); }
if (problemas.length) { console.error('\nHay problemas: corrígelos antes de escribir.'); process.exit(1); }

const ujPath = path.join(BASE, 'data', 'usuarios.json');
const uj = JSON.parse(fs.readFileSync(ujPath, 'utf8'));
// reemplaza coordinadores previos, conserva admin/consulta/gabo/otros
uj.usuarios = uj.usuarios.filter(u => u.rol !== 'coordinador');
nuevos.forEach(n => { const { _password_claro, ...pub } = n; uj.usuarios.push(pub); });
uj.nota = 'Usuarios del Panel FORTA. Contraseñas en SHA-256 (node tools/hash-password.js). Coordinadores: user primer_nombre.primer_apellido, password primer_apellido.segundo_apellido, con acceso solo a sus municipios.';
fs.writeFileSync(ujPath, JSON.stringify(uj, null, 2) + '\n', 'utf8');
console.log('\nOK data/usuarios.json: ' + uj.usuarios.length + ' usuarios totales (' + nuevos.length + ' coordinadores).');
console.log('IMPORTANTE: entrega cada password en persona; este script no las guarda en claro.');
