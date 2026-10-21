// tools/make-usarios-xlsx.js — Genera usuarios.xlsx con la lista de todos los
// usuarios (administradores + coordinadores) y sus contraseñas en claro,
// sin dependencias externas.
// Uso: node tools/make-usarios-xlsx.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const BASE = path.join(__dirname, '..');
const XLSX = path.join(BASE, 'usuarios.xlsx');

// Leer usuarios (admins + coordinadores).
const users = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'usuarios.json'), 'utf8')).usuarios;

// Leer contraseñas en claro (si existen).
const pwPath = path.join(BASE, 'tools', '_coord-pw.json');
let pwdClaro = {};
try { pwdClaro = JSON.parse(fs.readFileSync(pwPath, 'utf8')); } catch { }

const rows = [
    ['Usuario', 'Nombre completo', 'Rol', 'Estado', 'Email (sugerido)', 'Contraseña']
];
users.forEach(u => {
    const email = String(u.usuario || '').toLowerCase().replace(/[^a-z0-9.]/g, '') + '@platadeforta.mx';
    rows.push([
        u.usuario,
        u.nombre || u.usuario,
        u.rol || 'admin',
        u.activo === false ? 'Inactivo' : 'Activo',
        email,
        pwdClaro[u.usuario] || ''
    ]);
});

// --- Construir XLSX (ZIP/Deflate sin dependencias externas) ---
const parts = {};
parts['_rels/.rels'] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>'
].join('\n');

parts['xl/workbook.xml'] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets><sheet name="Usuarios" sheetId="1" r:id="rId1"/></sheets>',
    '<calcPr calcId="124519"/>',
    '</workbook>'
].join('\n');

parts['xl/workbook.xml.rels'] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="sheet1.xml"/>',
    '</Relationships>'
].join('\n');

parts['xl/worksheets/sheet1.xml'] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
    rows.map((r, i) => {
        const cols = [0, 1, 2, 3, 4, 5];
        return '<row r="' + (i + 1) + '">' + cols.map(c => {
            const val = r[c] == null ? '' : String(r[c]);
            const esc = val.replace(/&(?![a-zA-Z]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            return '<c r="' + ['A','B','C','D','E','F'][c] + (i + 1) + '" t="inlineStr"><is><t>' + esc + '</t></is></c>';
        }).join('') + '</row>';
    }).join(''),
    '</sheetData>',
    '</worksheet>'
].join('\n');

parts['xl/sharedStrings.xml'] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + rows.length + '" uniqueCount="' + rows.length + '">',
    rows.map(r => '<si><t>' + r.map(v => String(v).replace(/&(?![a-zA-Z]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')) + '</t></si>').join(''),
    '</sst>'
].join('\n');

parts['[Content_Types].xml'] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    '</Types>'
].join('\n');

const zip = zlib.deflateSync(Buffer.from(Object.keys(parts).map(k => parts[k].replace(/\r\n/g, '\n').replace(/\r/g, '\n')).join('\n'), 'utf8'), { level: 9 });
fs.writeFileSync(XLSX, zip);
console.log('usuarios.xlsx generado: ' + XLSX + ' (' + fs.statSync(XLSX).size + ' bytes)');
console.log('filas incluidas: ' + rows.length);
