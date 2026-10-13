#!/usr/bin/env node
/*
 * ============================================================================
 *  verify-localidades.js — ¿la lista de localidades coincide en las 3 fuentes?
 *  ----------------------------------------------------------------------------
 *  Compara, municipio por municipio, el listado de localidades en:
 *
 *    1. la PLATAFORMA -> data/municipios.json, campo `secciones_detalle`
 *                        ("1. ACAJETE | 9. LA JOYA | ...", nota: el nombre del
 *                        campo habla de secciones pero trae LOCALIDADES).
 *    2. el PEL        -> PEL 2024-2025_Listado_Localidades_por_Municipio.xlsx:
 *                        hoja "Resumen por Municipio" (columna L "Lista de
 *                        localidades" y columna G "N.º de localidades") y
 *                        hoja "Detalle por Localidad" (una fila por localidad).
 *    3. el PANEL      -> el Panel*.xlsx más reciente: la columna que trae el
 *                        desglose "n. LOCALIDAD | ...". OJO: en el layout
 *                        30-09-2026 esa columna sin título es el DISTRITO
 *                        LOCAL ("12 COATEPEC") y el libro NO trae localidades;
 *                        en el 08-10-2026 sí (columna G).
 *
 *  Para cada municipio se comparan conjuntos clave-de-localidad -> nombre
 *  (sin acentos ni dobles espacios). También se cruza el PEL contra sí mismo
 *  (lista del resumen vs. hoja de detalle) y, de gratis, los totales de
 *  listado nominal / secciones / casillas de la plataforma contra el PEL.
 *
 *  Uso:  node verify-localidades.js [Panel.xlsx] [PEL.xlsx]
 *  Sale con código 1 si hay diferencias de localidades.
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('./build-data.js');

const BASE = __dirname;
const args = process.argv.slice(2);
const PEL_FILE = args[1] || 'PEL 2024-2025_Listado_Localidades_por_Municipio.xlsx';

let failures = 0, warnings = 0;
const ok = m => console.log('  OK  ' + m);
const warn = m => { warnings++; console.log(' AVISO ' + m); };
const fail = m => { failures++; console.log(' FAIL ' + m); };
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
const corto = (s, n) => { s = String(s === null || s === undefined ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// ------------------------------------------------------------------ lector
function sheetList(zip) {
    const wb = zip.read('xl/workbook.xml') || '', rels = zip.read('xl/_rels/workbook.xml.rels') || '';
    const tgt = {};
    (rels.match(/<Relationship\b[^>]*\/?>/g) || []).forEach(r => {
        const id = (/ Id="([^"]+)"/.exec(r) || [])[1];
        const t = (/ Target="([^"]+)"/.exec(r) || [])[1] || '';
        if (id) tgt[id] = t.replace(/^\/+/, '').replace(/^xl\//, '');
    });
    return (wb.match(/<sheet\b[^>]*\/?>/g) || []).map(t => {
        const name = ((/ name="([^"]*)"/.exec(t) || [])[1] || '?').replace(/&amp;/g, '&');
        const rid = (/ r:id="([^"]+)"/.exec(t) || [])[1];
        return { name: name, path: tgt[rid] ? 'xl/' + tgt[rid] : null };
    }).filter(s => s.path);
}
function celdasDe(zip, sst, hoja) {
    if (!hoja) return null;
    return B.parseSheet(zip.read(hoja.path), sst);
}
// Clave comparable de nombre: sin acentos, sin dobles espacios, en mayúsculas.
function norm(s) {
    return B.cleanText(String(s === null || s === undefined ? '' : s))
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/\s+/g, ' ').trim();
}
// "1. ACAJETE | 9. LA JOYA" -> Map(clave -> nombre). Devuelve también los
// trozos que no tienen pinta de "n. NOMBRE" (por si el formato cambia).
function parseLista(txt) {
    const map = new Map(), malformados = [];
    B.cleanText(String(txt === null || txt === undefined ? '' : txt))
        .split('|').map(s => s.trim()).filter(Boolean).forEach(item => {
            const m = /^(\d+)\.\s*(.*)$/.exec(item);
            if (!m) { malformados.push(item); return; }
            map.set(+m[1], m[2].trim());
        });
    return { map, malformados };
}
function panelPorDefecto() {
    const paneles = fs.readdirSync(BASE)
        .filter(f => /^Panel.*\.xlsx$/i.test(f) && !f.startsWith('~$'))
        .map(f => ({ f, t: fs.statSync(path.join(BASE, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    return paneles.length ? paneles[0].f : null;
}

// Busca en la hoja la columna que trae el desglose "n. LOCALIDAD | ..."
// (en el Panel 30-09-2026 no existe: la columna sin título es el distrito).
function detectarColumnaLocalidades(rows, desdeFila) {
    const cols = new Set();
    rows.forEach(cells => cells.forEach((_, col) => cols.add(col)));
    let mejor = null;
    cols.forEach(col => {
        let conLista = 0, llenas = 0;
        rows.forEach((cells, n) => {
            if (n < desdeFila) return;
            const v = B.cleanText(String(cells.get(col) || ''));
            if (!v) return;
            llenas++;
            if (v.indexOf('|') >= 0 && /^\d+\.\s*\S/.test(v)) conLista++;
        });
        if (conLista >= 10 && conLista >= llenas * 0.8 && (!mejor || conLista > mejor.conLista)) {
            mejor = { col, conLista, llenas };
        }
    });
    return mejor;
}
// Compara dos Map(clave -> nombre): claves solo en cada lado y claves
// presentes en ambos pero con nombre distinto.
function comparar(a, b) {
    const soloA = [], soloB = [], conNombreDistinto = [];
    a.forEach((nombre, clave) => {
        if (!b.has(clave)) { soloA.push([clave, nombre]); return; }
        if (norm(nombre) !== norm(b.get(clave))) conNombreDistinto.push([clave, nombre, b.get(clave)]);
    });
    b.forEach((nombre, clave) => { if (!a.has(clave)) soloB.push([clave, nombre]); });
    return { soloA, soloB, conNombreDistinto };
}
function nombreMun(m) { return m === undefined || m === null ? '(sin nombre)' : m; }
// Imprime el detalle de las diferencias (con tope) y devuelve cuántas salieron.
function imprimirDiferencias(difs, limite) {
    let mostrados = 0;
    difs.forEach(d => {
        if (mostrados >= limite) return;
        mostrados++;
        console.log('    mun ' + pad(d.num, 3) + ' ' + pad(corto(nombreMun(d.municipio), 22), 23) +
            d.detalles.map(t => corto(t, 90)).join(' · '));
    });
    if (difs.length > mostrados) console.log('    ... y ' + (difs.length - mostrados) + ' municipios más');
    return mostrados;
}

// =========================================================== 1. LEER FUENTES
console.log('\n[1] Fuentes');

// --- PEL ---
const pelPath = path.join(BASE, PEL_FILE);
if (!fs.existsSync(pelPath)) { console.error('no existe el archivo: ' + PEL_FILE); process.exit(1); }
const pelZip = B.readZip(fs.readFileSync(pelPath));
const pelSst = B.parseSharedStrings(pelZip.read('xl/sharedStrings.xml') || '');
const pelHojas = sheetList(pelZip);
const resumenHoja = pelHojas.find(h => /resumen/i.test(h.name));
const detalleHoja = pelHojas.find(h => /detalle/i.test(h.name));
if (!resumenHoja || !detalleHoja) {
    console.error('no se encontraron las hojas "Resumen por Municipio" y "Detalle por Localidad" en el PEL');
    process.exit(1);
}

// resumen: A clave mun · B municipio · G N.º de localidades · L lista
//          (H N.º de secciones · I N.º de casillas · K listado nominal)
const pelResumen = new Map();       // num -> { municipio, declaradas, lista: Map }
const resumenRows = celdasDe(pelZip, pelSst, resumenHoja);
resumenRows.forEach((cells, n) => {
    const num = B.toInt(cells.get('A'));
    if (!num || n <= 3) return;
    const lista = parseLista(cells.get('L'));
    pelResumen.set(num, {
        municipio: B.cleanText(cells.get('B') || ''),
        declaradas: B.toInt(cells.get('G')),
        seccionesPel: B.toInt(cells.get('H')),
        casillasPel: B.toInt(cells.get('I')),
        listadoPel: B.toInt(cells.get('K')),
        lista: lista.map,
        malformados: lista.malformados
    });
});

// detalle: A clave mun · G clave loc · H localidad
// OJO: el reporte parte las localidades grandes (cabeceras) en VARIAS filas
// (un tramo de secciones/casillas por fila), así que una clave puede repetirse.
// Lo que NO debe ocurrir es que la misma clave venga con nombres distintos.
const pelDetalle = new Map();       // num -> Map(clave -> nombre)
const pelFilas = new Map();         // num -> filas (para ver claves repetidas)
const pelRepeticiones = new Map();  // num -> Map(clave -> Set(nombre)) en filas repetidas
celdasDe(pelZip, pelSst, detalleHoja).forEach((cells, n) => {
    const num = B.toInt(cells.get('A'));
    const clave = B.toInt(cells.get('G'));
    if (!num || !clave || n <= 3) return;
    if (!pelDetalle.has(num)) { pelDetalle.set(num, new Map()); pelFilas.set(num, 0); pelRepeticiones.set(num, new Map()); }
    pelFilas.set(num, pelFilas.get(num) + 1);
    const nombre = B.cleanText(cells.get('H') || '');
    const visto = pelDetalle.get(num);
    if (visto.has(clave)) {
        const reps = pelRepeticiones.get(num);
        if (!reps.has(clave)) reps.set(clave, new Set([visto.get(clave)]));
        reps.get(clave).add(nombre);
    }
    visto.set(clave, nombre);
});
const pelTotalResumen = [...pelResumen.values()].reduce((s, m) => s + m.lista.size, 0);
const pelTotalDetalle = [...pelFilas.values()].reduce((s, n) => s + n, 0);
ok('PEL "' + PEL_FILE + '" · hoja "' + resumenHoja.name + '": ' + pelResumen.size + ' municipios, ' + pelTotalResumen + ' localidades listadas');
ok('PEL · hoja "' + detalleHoja.name + '": ' + pelTotalDetalle + ' filas de localidad en ' + pelDetalle.size + ' municipios');

// --- Plataforma ---
const jsonPath = path.join(BASE, 'data', 'municipios.json');
const plataforma = new Map();       // num -> { municipio, lista, secciones, casillas, listado }
JSON.parse(fs.readFileSync(jsonPath, 'utf8')).forEach(m => {
    const num = m['numero de municipio'];
    plataforma.set(num, {
        municipio: m.municipio,
        lista: parseLista(m.secciones_detalle).map,
        secciones: m.secciones, casillas: m.casillas, listado: m.listado_nominal
    });
});
const platTotal = [...plataforma.values()].reduce((s, m) => s + m.lista.size, 0);
ok('Plataforma data/municipios.json: ' + plataforma.size + ' municipios, ' + platTotal +
    ' localidades en el campo secciones_detalle');

// --- Panel ---
const PANEL_FILE = args[0] || panelPorDefecto();
const panel = new Map();            // num -> { municipio, lista }
let panelSinLista = false;
if (!PANEL_FILE) {
    warn('no hay ningún Panel*.xlsx en la carpeta: se omite esa comparación');
} else {
    const panelZip = B.readZip(fs.readFileSync(path.join(BASE, PANEL_FILE)));
    const panelSst = B.parseSharedStrings(panelZip.read('xl/sharedStrings.xml') || '');
    const hojas = sheetList(panelZip);
    const hoja = hojas.find(h => h.name === 'Hoja 1') || hojas[0];
    const rows = celdasDe(panelZip, panelSst, hoja);
    const col = detectarColumnaLocalidades(rows, 3);
    if (!col) {
        panelSinLista = true;
        warn('Panel "' + PANEL_FILE + '" (hoja "' + hoja.name + '"): NO trae lista de localidades.');
        warn('  Ahí la columna sin título es el distrito local; el desglose "n. LOCALIDAD | ..." empezó en la versión 08-10-2026.');
    } else {
        rows.forEach((cells, n) => {
            const num = B.toInt(cells.get('E'));
            if (!num || n <= 2) return;
            panel.set(num, { municipio: B.cleanText(cells.get('F') || ''), lista: parseLista(cells.get(col.col)).map });
        });
        ok('Panel "' + PANEL_FILE + '" (hoja "' + hoja.name + '", columna ' + col.col + '): ' + panel.size +
            ' municipios, ' + [...panel.values()].reduce((s, m) => s + m.lista.size, 0) + ' localidades');
    }
}

// ================================================= 2. PEL CONTRA SÍ MISMO
console.log('\n[2] PEL interno: lista del resumen vs. hoja de detalle');
{
    const difs = [];
    const repetidasLocales = [];
    pelResumen.forEach((m, num) => {
        const det = pelDetalle.get(num);
        const detalles = [];
        if (!det) {
            detalles.push('el municipio NO aparece en la hoja de detalle');
        } else {
            const c = comparar(m.lista, det);
            if (c.soloA.length) detalles.push('en la lista sin fila de detalle: ' + c.soloA.map(x => x[0] + '. ' + x[1]).join(', '));
            if (c.soloB.length) detalles.push('filas de detalle que no están en la lista: ' + c.soloB.map(x => x[0] + '. ' + x[1]).join(', '));
            if (c.conNombreDistinto.length) detalles.push('nombre distinto: ' + c.conNombreDistinto.map(x => x[0] + '. "' + x[1] + '" vs "' + x[2] + '"').join(', '));
        }
        if (m.declaradas !== null && m.declaradas !== m.lista.size) {
            detalles.push('la columna "N.º de localidades" dice ' + m.declaradas + ' pero la lista trae ' + m.lista.size);
        }
        if (m.malformados.length) detalles.push('trozos sin formato "n. NOMBRE": ' + m.malformados.join(', '));
        if (detalles.length) difs.push({ num, municipio: m.municipio, detalles });
        // Claves repetidas en el detalle: si el nombre es el mismo en todas las
        // filas es solo el reporte paginando una localidad grande (cabecera) —
        // aviso, no error. Si el nombre cambia entre filas, sí es un problema.
        const reps = pelRepeticiones.get(num);
        if (reps) {
            const conNombresDistintos = [...reps.entries()].filter(e => new Set([...e[1]].map(norm)).size > 1);
            const repetidas = [...reps.entries()].filter(e => new Set([...e[1]].map(norm)).size === 1)
                .map(e => e[0] + '. ' + [...e[1]][0]);
            if (conNombresDistintos.length) {
                difs.push({
                    num, municipio: m.municipio,
                    detalles: ['clave repetida con nombres distintos en el detalle: ' +
                        conNombresDistintos.map(e => e[0] + ' (' + [...e[1]].join(' / ') + ')').join(', ')]
                });
            } else if (repetidas.length) {
                repetidasLocales.push({ num, municipio: m.municipio, claves: repetidas });
            }
        }
    });
    pelDetalle.forEach((_, num) => {
        if (!pelResumen.has(num)) difs.push({ num, municipio: '(?)', detalles: ['está en el detalle pero no en el resumen'] });
    });
    if (!difs.length) ok('las 2 hojas del PEL se cuentan igual: ' + pelTotalResumen + ' localidades, misma clave y mismo nombre');
    else { fail(difs.length + ' municipios con diferencias dentro del propio PEL'); imprimirDiferencias(difs, 15); }
    if (repetidasLocales.length) {
        warn(repetidasLocales.length + ' municipios cuya cabecera aparece en varias filas del detalle ' +
            '(mismo nombre, tramos distintos de secciones): ' +
            repetidasLocales.map(d => d.num + ' ' + d.municipio + ' [' + d.claves.join('; ') + ']').join(' · '));
    }
}

// ============================================ 3. PLATAFORMA vs. PEL (resumen)
console.log('\n[3] Plataforma vs. PEL (hoja "Resumen por Municipio")');
{
    const soloPlat = [...plataforma.keys()].filter(k => !pelResumen.has(k));
    const soloPel = [...pelResumen.keys()].filter(k => !plataforma.has(k));
    if (soloPlat.length) fail('municipios en la plataforma que no están en el PEL: ' + soloPlat.join(', '));
    if (soloPel.length) fail('municipios en el PEL que no están en la plataforma: ' + soloPel.join(', '));
    if (!soloPlat.length && !soloPel.length) ok('los mismos ' + plataforma.size + ' municipios en ambos');

    const difs = [];
    plataforma.forEach((m, num) => {
        const pel = pelResumen.get(num);
        if (!pel) return;
        const c = comparar(m.lista, pel.lista);
        const detalles = [];
        if (c.soloA.length) detalles.push('solo en la plataforma: ' + c.soloA.map(x => x[0] + '. ' + x[1]).join(', '));
        if (c.soloB.length) detalles.push('solo en el PEL: ' + c.soloB.map(x => x[0] + '. ' + x[1]).join(', '));
        if (c.conNombreDistinto.length) detalles.push('nombre distinto: ' + c.conNombreDistinto.map(x => x[0] + '. "' + x[1] + '" vs "' + x[2] + '"').join(', '));
        if (detalles.length) difs.push({ num, municipio: m.municipio, detalles });
    });
    if (!difs.length) ok('lista de localidades IDÉNTICA en los ' + plataforma.size + ' municipios (misma clave, mismo nombre)');
    else { fail(difs.length + ' municipios con diferencias de localidades'); imprimirDiferencias(difs, 15); }

    // De regalo: totales que el PEL trae aparte y la plataforma también.
    const extras = [];
    plataforma.forEach((m, num) => {
        const pel = pelResumen.get(num);
        if (!pel) return;
        const t = [];
        if (m.listado !== pel.listadoPel) t.push('listado nominal ' + m.listado + ' vs ' + pel.listadoPel);
        if (m.secciones !== pel.seccionesPel) t.push('secciones ' + m.secciones + ' vs ' + pel.seccionesPel);
        if (m.casillas !== pel.casillasPel) t.push('casillas ' + m.casillas + ' vs ' + pel.casillasPel);
        if (t.length) extras.push({ num, municipio: m.municipio, detalles: [t.join(', ')] });
    });
    if (!extras.length) ok('listado nominal, secciones y casillas también coinciden con el PEL');
    else { warn(extras.length + ' municipios donde listado nominal / secciones / casillas difieren del PEL'); imprimirDiferencias(extras, 8); }
}

// ================================================ 4. PLATAFORMA vs. PANEL
console.log('\n[4] Plataforma vs. Panel');
if (panelSinLista || !panel.size) {
    warn('sin comparar: el Panel no trae columna de localidades (ver aviso de la sección 1)');
} else {
    const soloPlat = [...plataforma.keys()].filter(k => !panel.has(k));
    const soloPanel = [...panel.keys()].filter(k => !plataforma.has(k));
    if (soloPlat.length) fail('municipios en la plataforma que no están en el Panel: ' + soloPlat.join(', '));
    if (soloPanel.length) fail('municipios en el Panel que no están en la plataforma: ' + soloPanel.join(', '));
    if (!soloPlat.length && !soloPanel.length) ok('los mismos ' + panel.size + ' municipios en ambos');

    const difs = [];
    plataforma.forEach((m, num) => {
        const p = panel.get(num);
        if (!p) return;
        const c = comparar(m.lista, p.lista);
        const detalles = [];
        if (c.soloA.length) detalles.push('solo en la plataforma: ' + c.soloA.map(x => x[0] + '. ' + x[1]).join(', '));
        if (c.soloB.length) detalles.push('solo en el Panel: ' + c.soloB.map(x => x[0] + '. ' + x[1]).join(', '));
        if (c.conNombreDistinto.length) detalles.push('nombre distinto: ' + c.conNombreDistinto.map(x => x[0] + '. "' + x[1] + '" vs "' + x[2] + '"').join(', '));
        if (detalles.length) difs.push({ num, municipio: m.municipio, detalles });
    });
    if (!difs.length) ok('lista de localidades IDÉNTICA entre la plataforma y el Panel');
    else { fail(difs.length + ' municipios con diferencias de localidades'); imprimirDiferencias(difs, 15); }
}

// ------------------------------------------------------------- resumen final
console.log('\n' + '='.repeat(40));
if (failures === 0) {
    console.log('RESULTADO: TODO COINCIDE ✔' +
        (panelSinLista ? ' (plataforma vs. PEL; el Panel no trae lista de localidades)' : '') +
        (warnings ? ' · ' + warnings + ' aviso(s)' : ''));
    process.exit(0);
} else {
    console.log('RESULTADO: ' + failures + ' error(es) ✘' + (warnings ? ' y ' + warnings + ' aviso(s)' : ''));
    process.exit(1);
}


