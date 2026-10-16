#!/usr/bin/env node
/*
 * ============================================================================
 *  build-localidades.js — Lista de localidades por municipio desde el PEL
 *  ----------------------------------------------------------------------------
 *  Fuente: "PEL 2024-2025_listadoUbicacionCasillas_JL.xlsx", hoja "Sheet0":
 *  es el Reporte de Listado de Ubicación de Casillas del INE (una fila por
 *  casilla, ~11 mil). De ahí, agrupando por municipio, sale la lista de
 *  localidades de cada uno:
 *
 *      C  Municipio        "1. ACAJETE"
 *      K  Localidad y Mz.  "1) ACAJETE 0006"    (clave) NOMBRE [manzana]
 *      A  Distrito Federal "9. COATEPEC"
 *      B  Distrito Local   "12. COATEPEC"
 *
 *  Salidas:
 *      data/localidades.json         estructura por municipio (clave+nombre)
 *      localidades-por-municipio.csv una fila por localidad, separador ";"
 *
 *  Y APLICA la lista a la plataforma: corrige secciones_detalle en
 *  data/municipios.json (UNICA fuente; index.html ya no lleva datos
 *  embebidos), que el Panel trae corrimido en 199 de 212 municipios
 *  build-data.js, además, re-aplica la lista cada vez que regenera desde un
 *  Excel del Panel.
 *
 *  También cruza el resultado con data/municipios.json y reporta diferencias
 *  (en modo --check, para ver qué cambiaría sin escribir nada).
 *
 *  La manzana final de la columna K (dígitos de 3-4 posiciones al final del
 *  texto) se separa en su propio campo para poder comparar nombres con la
 *  plataforma; el valor original nunca se altera, solo se descompone.
 *
 *  Uso:  node build-localidades.js [--check] [PEL.xlsx]
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('./build-data.js');

const BASE = __dirname;
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const ARG_PEL = args.find(a => !a.startsWith('--'));

// Fuente por defecto: el "PEL*.xlsx" más reciente de la carpeta (los archivos
// temporales de Excel empiezan con "~$" y se ignoran). Se puede forzar otro
// pasándolo como argumento.
function pelPorDefecto() {
    const pels = fs.readdirSync(BASE)
        .filter(f => /^PEL.*\.xlsx$/i.test(f) && !f.startsWith('~$'))
        .map(f => ({ f, t: fs.statSync(path.join(BASE, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    return pels.length ? pels[0].f : 'PEL 2024-2025_listadoUbicacionCasillas_JL.xlsx';
}

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

// "1. ACAJETE" -> { numero: 1, nombre: 'ACAJETE' }  (null si no casa)
function splitNumNombre(s) {
    const m = /^(\d+)\.?\s+(.+)$/.exec(s);
    return m ? { numero: +m[1], nombre: m[2].trim() } : null;
}

// "1) ACAJETE 0006" -> { clave: 1, nombre: 'ACAJETE', manzana: '0006' }
// La manzana son dígitos finales de 3-4 posiciones; no toca cosas como
// "VISTA HERMOSA 2A. MANZANA" (la "2A" no es solo dígitos, se queda).
function parseLocalidad(s) {
    const m = /^(\d+)\)\s*(.+)$/.exec(s);
    if (!m) return null;
    let resto = m[2].trim();
    let manzana = null;
    const mz = /^(.+?)\s+(\d{3,4})$/.exec(resto);
    if (mz) { resto = mz[1].trim(); manzana = mz[2]; }
    return { clave: +m[1], nombre: resto, manzana: manzana };
}

// Clave comparable de nombre: sin acentos, sin dobles espacios, en mayúsculas.
function norm(s) {
    return B.cleanText(String(s === null || s === undefined ? '' : s))
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ').trim().toUpperCase();
}


const HEADER_ROW = 5;
const FIRST_DATA_ROW = 6;

// Lee el reporte crudo y agrupa por municipio (clave = número de municipio).
function parsePel(zip) {
    const sst = B.parseSharedStrings(zip.read('xl/sharedStrings.xml') || '');
    const hojas = sheetList(zip);
    const hoja = hojas.find(h => h.name === 'Sheet0') || hojas[0];
    if (!hoja) throw new Error('el libro no tiene ninguna hoja legible');
    const rows = B.parseSheet(zip.read(hoja.path), sst);

    // valida encabezados mínimos
    const hdr = rows.get(HEADER_ROW) || new Map();
    ['A', 'B', 'C', 'K'].forEach(col => {
        if (!hdr.get(col)) throw new Error('la fila ' + HEADER_ROW + ' no trae encabezado en la columna ' + col);
    });

    const municipios = new Map();   // numero -> registro
    const avisos = [];
    let filas = 0, sinMun = 0, sinLoc = 0, locNoForma = 0, conManzana = 0;

    [...rows.keys()].map(Number).sort((a, b) => a - b).forEach(n => {
        if (n < FIRST_DATA_ROW) return;
        const c = rows.get(n);
        filas++;
        const munRaw = B.cleanText(String(c.get('C') || ''));
        const locRaw = B.cleanText(String(c.get('K') || ''));
        if (!munRaw) { sinMun++; return; }
        const mun = splitNumNombre(munRaw);
        if (!mun) {
            sinMun++;
            if (avisos.length < 10) avisos.push('fila ' + n + ': municipio sin formato "n. NOMBRE": ' + JSON.stringify(munRaw));
            return;
        }

        if (!municipios.has(mun.numero)) {
            municipios.set(mun.numero, {
                numero: mun.numero,
                municipio: mun.nombre,
                distrito_federal: B.cleanText(String(c.get('A') || '')),
                distrito_local: B.cleanText(String(c.get('B') || '')),
                _locs: new Map()      // clave de localidad -> registro
            });
        }
        const reg = municipios.get(mun.numero);
        if (reg.municipio !== mun.nombre && avisos.length < 20) {
            avisos.push('fila ' + n + ': el municipio ' + mun.numero + ' aparece como "' + mun.nombre + '" y antes como "' + reg.municipio + '"');
        }
        if (!locRaw) { sinLoc++; return; }
        const loc = parseLocalidad(locRaw);
        if (!loc) {
            locNoForma++;
            if (avisos.length < 20) avisos.push('fila ' + n + ': localidad sin formato "n) NOMBRE": ' + JSON.stringify(locRaw));
            return;
        }
        if (loc.manzana) conManzana++;
        if (reg._locs.has(loc.clave)) {
            const prev = reg._locs.get(loc.clave);
            if (norm(prev.nombre) !== norm(loc.nombre) && avisos.length < 30) {
                avisos.push('mun ' + mun.numero + ': la clave ' + loc.clave + ' aparece como "' + prev.nombre + '" y como "' + loc.nombre + '"');
            }
            return;                    // repetida: misma casilla, se ignora
        }
        reg._locs.set(loc.clave, { clave: loc.clave, nombre: loc.nombre, manzana: loc.manzana });
    });

    // lista final ordenada por número de municipio y clave de localidad
    const lista = [...municipios.values()]
        .sort((a, b) => a.numero - b.numero)
        .map(m => ({
            numero: m.numero,
            municipio: m.municipio,
            distrito_local: m.distrito_local,
            distrito_federal: m.distrito_federal,
            total_localidades: m._locs.size,
            localidades: [...m._locs.values()].sort((a, b) => a.clave - b.clave)
        }));

    return { hoja: hoja.name, lista, stats: { filas, sinMun, sinLoc, locNoForma, conManzana }, avisos };
}

// ------------------------------------------------------------- comparación
// Convierte "1. ACAJETE | 9. LA JOYA | ..." (secciones_detalle del Panel) en
// Map(clave -> nombre normalizado) para comparar con el PEL.
function parseDetallePlataforma(s) {
    const mapa = new Map();
    String(s || '').split('|').map(p => p.trim()).filter(Boolean).forEach(p => {
        const m = /^(\d+)\.?\s+(.+)$/.exec(p);
        if (m) mapa.set(+m[1], norm(m[2]));
    });
    return mapa;
}

function compararPlataforma(municipiosPlataforma, pelLista) {
    const difs = [];
    const porNum = new Map(pelLista.map(m => [m.numero, m]));
    const soloPel = [...porNum.keys()].filter(n => !municipiosPlataforma.has(n));
    const soloPlat = [...municipiosPlataforma.keys()].filter(n => !porNum.has(n));
    if (soloPel.length) difs.push({ num: 0, municipio: '(en el PEL y no en la plataforma)', detalles: ['municipios: ' + soloPel.join(', ')] });
    if (soloPlat.length) difs.push({ num: 0, municipio: '(en la plataforma y no en el PEL)', detalles: ['municipios: ' + soloPlat.join(', ')] });

    pelLista.forEach(p => {
        const plat = municipiosPlataforma.get(p.numero);
        if (!plat) return;
        const pelMap = new Map(p.localidades.map(l => [l.clave, norm(l.nombre)]));
        const detalles = [];
        pelMap.forEach((nom, clave) => {
            if (!plat.has(clave)) detalles.push('solo en el PEL: ' + clave + '. ' + nom);
            else if (plat.get(clave) !== nom) detalles.push('clave ' + clave + ' nombre distinto: "' + nom + '" vs "' + plat.get(clave) + '"');
        });
        plat.forEach((nom, clave) => {
            if (!pelMap.has(clave)) detalles.push('solo en la plataforma: ' + clave + '. ' + nom);
        });
        if (detalles.length) difs.push({ num: p.numero, municipio: p.municipio, detalles });
    });
    return difs;
}

function imprimirDiferencias(difs, max) {
    difs.slice(0, max).forEach(d => {
        console.log('    mun ' + String(d.num).padStart(3) + ' ' + d.municipio);
        d.detalles.slice(0, 8).forEach(t => console.log('        - ' + t));
        if (d.detalles.length > 8) console.log('        ... y ' + (d.detalles.length - 8) + ' más');
    });
    if (difs.length > max) console.log('    ... y ' + (difs.length - max) + ' municipios más');
}

// ------------------------------------------------- APLICAR A LA PLATAFORMA
// Sustituye secciones_detalle en data/municipios.json (UNICA fuente;
// index.html ya no lleva datos embebidos) por la lista del PEL. Usa el mismo
// formato ("1. ACAJETE | 9. LA JOYA | ..."). Solo escribe si algo cambió.
function aplicarAPlataforma(porNum) {
    const jsonPath = path.join(BASE, 'data', 'municipios.json');
    if (!fs.existsSync(jsonPath)) {
        console.log('\n(no existe data/municipios.json: no hay nada que corregir)');
        return;
    }
    const municipios = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let aplicados = 0, cambiados = 0;
    const ausentes = [];
    municipios.forEach(m => {
        const p = porNum.get(m['numero de municipio']);
        if (!p) { ausentes.push(m['numero de municipio']); return; }
        const lista = p.localidades.map(l => l.clave + '. ' + l.nombre).join(' | ');
        if (m.secciones_detalle !== lista) cambiados++;
        m.secciones_detalle = lista;
        aplicados++;
    });
    if (ausentes.length) console.log('  AVISO municipios sin lista en el PEL: ' + ausentes.join(', '));
    if (!cambiados) { console.log('\n✔ data/municipios.json: secciones_detalle ya coincidía con el PEL'); return; }

    const json = JSON.stringify(municipios, null, 2);
    fs.writeFileSync(jsonPath, json + '\n', 'utf8');
    console.log('\n✔ data/municipios.json: secciones_detalle corregido en ' +
        aplicados + ' municipios (' + cambiados + ' cambiaron respecto al Panel)');
}

// Cruce informativo: PEL vs. lo que la plataforma muestra ahora
// (secciones_detalle de data/municipios.json).
function cruzarConPlataforma(lista) {
    console.log('\nCruce con data/municipios.json (campo secciones_detalle):');
    const jsonPath = path.join(BASE, 'data', 'municipios.json');
    if (!fs.existsSync(jsonPath)) { console.log('  (no existe: se omite el cruce)'); return; }
    const municipios = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const plat = new Map(municipios.map(m => [m['numero de municipio'], parseDetallePlataforma(m.secciones_detalle)]));
    const totalPlat = [...plat.values()].reduce((a, s) => a + s.size, 0);
    console.log('  ' + plat.size + ' municipios, ' + totalPlat + ' localidades en la plataforma');
    const difs = compararPlataforma(plat, lista);
    if (!difs.length) console.log('  OK la lista de localidades es IDÉNTICA en la plataforma y el PEL');
    else {
        console.log('  AVISO ' + difs.length + ' municipios con diferencias (la plataforma usa el dato del Panel, el PEL es el reporte del INE):');
        imprimirDiferencias(difs, 15);
    }
}

// ------------------------------------------------------------------- MAIN
function main() {
    const source = ARG_PEL || pelPorDefecto();
    const srcPath = path.join(BASE, source);
    if (!fs.existsSync(srcPath)) throw new Error('no existe el Excel: ' + source);
    console.log('Fuente: ' + source + (ARG_PEL ? '' : '  (el "PEL*.xlsx" más reciente de la carpeta)'));

    const zip = B.readZip(fs.readFileSync(srcPath));
    const { hoja, lista, stats, avisos } = parsePel(zip);
    const totalLoc = lista.reduce((a, m) => a + m.total_localidades, 0);
    console.log('Hoja: ' + hoja + ' | filas de datos: ' + stats.filas);
    console.log('Municipios: ' + lista.length + ' | localidades únicas: ' + totalLoc +
        ' | casillas con manzana: ' + stats.conManzana);
    if (stats.sinMun) console.log('  AVISO ' + stats.sinMun + ' filas sin municipio o con municipio mal formado');
    if (stats.sinLoc) console.log('  AVISO ' + stats.sinLoc + ' filas sin dato en la columna de localidad');
    if (stats.locNoForma) console.log('  AVISO ' + stats.locNoForma + ' valores de localidad que no casan con "n) NOMBRE"');
    avisos.forEach(a => console.log('  AVISO ' + a));

    if (CHECK_ONLY) {
        // en modo revisión solo se informa lo que cambiaría en la plataforma
        cruzarConPlataforma(lista);
        console.log('\n(--check) No se escribió ningún archivo.');
        return;
    }

    // la fecha de generación del reporte del INE viene en la fila 3, columna G
    const hojaPath = (sheetList(zip).find(h => h.name === hoja) || {}).path;
    const sst = B.parseSharedStrings(zip.read('xl/sharedStrings.xml') || '');
    const fila3 = hojaPath ? B.parseSheet(zip.read(hojaPath), sst).get(3) : null;
    const g3 = fila3 ? B.cleanText(String(fila3.get('G') || '')) : '';
    const fm = /(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/.exec(g3);

    // --- data/localidades.json ---
    const out = {
        fuente: source,
        hoja: hoja,
        fecha_generacion_reporte: fm ? fm[1] : null,
        total_municipios: lista.length,
        total_localidades: totalLoc,
        municipios: lista
    };
    const json = JSON.stringify(out, null, 2);
    const outJson = path.join(BASE, 'data', 'localidades.json');
    fs.mkdirSync(path.dirname(outJson), { recursive: true });
    fs.writeFileSync(outJson, json + '\n', 'utf8');
    console.log('\n✔ data/localidades.json (' + (Buffer.byteLength(json) / 1024).toFixed(1) + ' KB)');

    // --- localidades-por-municipio.csv (una fila por localidad) ---
    const esc = v => {
        const s = String(v === null || v === undefined ? '' : v);
        return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lineas = ['Clave mun.;Municipio;Distrito local;Distrito federal;N.º localidad;Localidad;Manzana'];
    lista.forEach(m => m.localidades.forEach(l => {
        lineas.push([m.numero, m.municipio, m.distrito_local, m.distrito_federal,
            l.clave, l.nombre, l.manzana || ''].map(esc).join(';'));
    }));
    // BOM UTF-8 para que Excel en español abra los acentos sin problema
    const csv = '\uFEFF' + lineas.join('\r\n') + '\r\n';
    const outCsv = path.join(BASE, 'localidades-por-municipio.csv');
    fs.writeFileSync(outCsv, csv, 'utf8');
    console.log('✔ localidades-por-municipio.csv (' + (lineas.length - 1) + ' localidades)');

    // --- aplicar la lista a la plataforma y comprobar que ya coincide ---
    aplicarAPlataforma(new Map(lista.map(m => [m.numero, m])));
    cruzarConPlataforma(lista);
    console.log('\nSiguiente paso: node verify.js && node smoke-ui.js');
}

if (require.main === module) {
    try { main(); } catch (e) { console.error('\n✘ ' + e.message); process.exit(1); }
}

module.exports = { parseLocalidad, splitNumNombre, parseDetallePlataforma, norm, sheetList };


