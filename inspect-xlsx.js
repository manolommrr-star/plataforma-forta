#!/usr/bin/env node
/*
 * ============================================================================
 *  inspect-xlsx.js — radiografía estructural de un Excel del Panel FORTA
 *  ----------------------------------------------------------------------------
 *  Compara un .xlsx contra el MAPEO de build-data.js y responde de una sola
 *  mirada:
 *    1. que hojas trae el libro y cuantas filas tiene cada una
 *    2. por columna: encabezado real, campo del JSON, filas con dato, formato
 *       de numero (porcentaje o no) y un valor de ejemplo
 *    3. resumen: columnas NUEVAS sin mapear, columnas mapeadas que DESAPARECIERON
 *       o cambiaron de titulo, y en que se parece la hoja al data/municipios.json
 *       que ya tenemos (numeros de municipio y valores que cambiaron)
 *
 *  Uso:  node inspect-xlsx.js [Panel FORTA 30-09-2026.xlsx]
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('./build-data.js');

const FILE = process.argv[2] || 'Panel FORTA 30-09-2026.xlsx';
if (!fs.existsSync(FILE)) { console.error('no existe el archivo: ' + FILE); process.exit(1); }

const zip = B.readZip(fs.readFileSync(FILE));
const stylesXml = zip.read('xl/styles.xml') || '';
const codes = B.styleFormatCodes(stylesXml);          // por indice de estilo
const pctStyles = B.percentStyleIndexes(stylesXml);   // los que son "0.00%" etc.
const sst = B.parseSharedStrings(zip.read('xl/sharedStrings.xml') || '');

// -------------------------------------------------------------- utilerias
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
const cut = (s, n) => { s = String(s === null || s === undefined ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
function letter(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; } return s; }

function sheetList() {
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

// Indice de estilo de cada celda ("O3" -> 12) para poder decir su formato.
function cellStyles(xml) {
    const out = new Map();
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
        const cellRe = /<c\b([^>]*?)\/?>/g;
        let cm;
        while ((cm = cellRe.exec(rm[1]))) {
            const r = (/ r="([A-Z]+\d+)"/.exec(cm[1]) || [])[1];
            const s = (/ s="(\d+)"/.exec(cm[1]) || [])[1];
            if (r && s) out.set(r, +s);
        }
    }
    return out;
}

// ---------------------------------------------------------- 1) las hojas
console.log('\nARCHIVO: ' + FILE);
const sheets = sheetList();
console.log('\nHOJAS DEL LIBRO');
let mejor = null, mejorPuntaje = -1;
sheets.forEach(h => {
    const xml = zip.read(h.path);
    if (!xml) { console.log('  ' + pad(h.name, 16) + '(sin xml)'); return; }
    const rows = B.parseSheet(xml, sst);
    let filaHdr = 0, puntaje = 0;
    [...rows.keys()].sort((a, b) => a - b).slice(0, 8).forEach(rn => {
        const cells = rows.get(rn);
        const p = B.COLUMNS.filter(c => B.normHeader(cells.get(c[0]) || '') === B.normHeader(c[1])).length;
        if (p > puntaje) { puntaje = p; filaHdr = rn; }
    });
    const filasDatos = [...rows.keys()].filter(r => r > (filaHdr || 0)).length;
    console.log('  ' + pad(h.name, 16) + pad(h.path, 28) + pad(rows.size + ' filas', 11) +
        (puntaje ? 'encabezados en fila ' + filaHdr + ': ' + puntaje + '/' + B.COLUMNS.length + ' coinciden'
                 : 'no parece la tabla del panel'));
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = { hoja: h, rows: rows, filaHdr: filaHdr }; }
});

if (!mejor || mejorPuntaje < 3) { console.log('\nNo hay hoja parecida a la tabla del panel.\n'); process.exit(0); }

// ------------------------------------------------------- 2) columna a columna
const rows = mejor.rows, filaHdr = mejor.filaHdr;
const styles = cellStyles(zip.read(mejor.hoja.path) || '');
const filasDatos = [...rows.keys()].filter(r => r > filaHdr).sort((a, b) => a - b);
const filasLlenas = filasDatos.filter(rn => rows.get(rn).size);
const header = rows.get(filaHdr) || new Map();
// formato "0.00%" de cada celda: hace falta para interpretar bien las columnas 'pct'
const pctRefs = B.percentCells(zip.read(mejor.hoja.path) || '', pctStyles);
const cols = new Set();
rows.forEach(cells => cells.forEach((v, ref) => cols.add(B.colToIndex(ref) + 1)));   // colToIndex es 0-based
const mapeada = new Map(B.COLUMNS.map(c => [B.colToIndex(c[0]) + 1, c]));

console.log('\nHOJA PRINCIPAL: "' + mejor.hoja.name + '" (' + mejor.hoja.path + ')  |  ' +
    filasLlenas.length + ' filas de datos (' + (filasLlenas[0] || 0) + '..' + (filasLlenas[filasLlenas.length - 1] || 0) + ')  |  ' +
    cols.size + ' columnas con algo');
console.log('\nCOL   TITULO EN EL EXCEL        ESTADO / CAMPO EN EL JSON        DATOS         FORMATO        EJEMPLO');
console.log('---   ------------------------  -------------------------------  ------------  -------------  ------------------------');
console.log('DATOS = filas con contenido;  "(-N)" = celdas que build-data.js convierte a vacio\n');
const nuevas = [];
[...cols].sort((a, b) => a - b).forEach(n => {
    const L = letter(n);
    const tit = B.cleanText(header.get(L) || '');
    const col = mapeada.get(n);
    let estado = col ? col[2] : (B.IGNORED[L] ? '(ignorada: ' + B.IGNORED[L] + ')' : (tit ? '** NUEVA **' : '(sin titulo)'));
    let llenas = 0, ejemplo = '', fmt = '', descarta = 0;
    filasDatos.forEach(rn => {
        const v = rows.get(rn).get(L);
        if (v !== undefined && String(v).trim() !== '') {
            llenas++;
            // celda con texto que el conversor de build-data.js no alcanza a convertir
            if (col) {
                const cv = col[3] === 'pct' ? B.toPercent(v, pctRefs.has(L + rn)) : B.convert(v, col[3]);
                if (cv === null) descarta++;
            }
            if (!ejemplo) {
                ejemplo = v;
                const s = styles.get(L + rn);
                fmt = s === undefined ? 'General' : (codes[s] === undefined ? '?' + s : codes[s]);
            }
        }
    });
    if (col && B.normHeader(tit) !== B.normHeader(col[1])) estado = '! CAMBIO TITULO ! -> ' + col[2];
    if (!col && tit && !B.IGNORED[L]) nuevas.push({ letra: L, titulo: tit, llenas: llenas });
    console.log(pad(L, 6) + pad(cut(tit || '(vacia)', 24), 26) + pad(estado, 32) +
        pad(llenas + '/' + filasLlenas.length + (descarta ? ' (-' + descarta + ')' : ''), 12) +
        pad(fmt, 14) + cut(ejemplo, 24));
});

// --------------------------------------------- 2.5) las demas hojas, en claro
console.log('\nOTRAS HOJAS (que build-data.js NO lee)');
sheets.filter(h => h.path !== mejor.hoja.path).forEach(h => {
    const rr = B.parseSheet(zip.read(h.path) || '', sst);
    const keys = [...rr.keys()].sort((a, b) => a - b);
    console.log('  "' + h.name + '" (' + h.path + '): ' + keys.filter(k => rr.get(k).size).length + ' filas con dato');
    keys.slice(0, 8).forEach(k => {
        const c = rr.get(k);
        if (!c.size) return;
        console.log('      fila ' + pad(k, 4) + ' ' + [...c].slice(0, 8).map(e => e[0] + '=' + cut(e[1], 26)).join('  |  '));
    });
    const media = keys[Math.floor(keys.length / 2)];
    if (media > 8 && rr.get(media).size) {
        console.log('      fila ' + pad(media, 4) + ' ' + [...rr.get(media)].slice(0, 8).map(e => e[0] + '=' + cut(e[1], 26)).join('  |  ') + '   (ejemplo a la mitad)');
    }
});

// ------------------------------------------------- 3) que hacer con esto
console.log('\nRESUMEN');
if (nuevas.length) {
    console.log('  Columnas NUEVAS sin mapear (' + nuevas.length + '):');
    nuevas.forEach(c => {
        const ej = filasDatos.map(rn => B.cleanText(rows.get(rn).get(c.letra) || '')).filter(Boolean).slice(0, 3);
        console.log('    ' + pad(c.letra, 5) + pad('"' + c.titulo + '"', 32) +
            pad(c.llenas + '/' + filasLlenas.length + ' con dato', 17) + 'ej: ' + ej.map(e => '"' + cut(e, 26) + '"').join(' | '));
    });
} else console.log('  No hay columnas nuevas: las mismas del mapeo actual.');

const rotas = B.COLUMNS.filter(c => c[1] && B.normHeader(B.cleanText(header.get(c[0]) || '')) !== B.normHeader(c[1]));
rotas.forEach(c => console.log('  OJO: la columna ' + c[0] + ' ya no dice "' + c[1] + '" sino "' +
    B.cleanText(header.get(c[0]) || '(vacia)') + '" (campo ' + c[2] + ')'));
if (filasLlenas.length !== B.EXPECTED_ROWS) {
    console.log('  OJO: hay ' + filasLlenas.length + ' filas de datos con contenido y build-data.js espera ' + B.EXPECTED_ROWS);
}

const jsonPath = path.join(__dirname, 'data', 'municipios.json');
if (fs.existsSync(jsonPath) && mejorPuntaje === B.COLUMNS.length) {
    const prev = require(jsonPath);
    const porNum = new Map(prev.map(m => [m['numero de municipio'], m]));
    const nuevos = [];
    const cambian = new Map();
    // Se comparan TODOS los campos mapeados (no solo los numeros): para los de
    // tipo 'pct' se usa pctRefs, que dice si cada celda traia formato "0.00%".
    const NUMERICOS = new Set(['listado_nominal', 'secciones', 'casillas', 'rutas', 'total_ediles',
        'votos_2024_locales', 'votos_2024_federales', 'votos_2025_alcaldes', 'militantes',
        'soldados', 'meta_afiliados', 'zona', 'pct_2024_locales', 'pct_2024_federales', 'pct_2025']);
    const anota = (k, txt) => { if (!cambian.has(k)) cambian.set(k, []); cambian.get(k).push(txt); };
    filasDatos.forEach(rn => {
        const cells = rows.get(rn);
        const n = B.toInt(cells.get('E'));
        if (!n) return;
        const p = porNum.get(n);
        porNum.delete(n);
        if (!p) { nuevos.push(n + ' ' + B.cleanText(cells.get('F') || '')); return; }
        B.COLUMNS.forEach(c => {
            const col = c[0], key = c[2], type = c[3];
            if (!p.hasOwnProperty(key)) return;
            const raw = cells.get(col);
            const nuevo = type === 'pct' ? B.toPercent(raw, pctRefs.has(col + rn)) : B.convert(raw, type);
            const viejo = p[key];
            if (nuevo === viejo) return;
            if (nuevo === null) { anota(key, '(se quedo vacio: era ' + JSON.stringify(viejo) + ')'); return; }
            if (viejo === null || viejo === undefined) { anota(key, 'era vacio -> ' + JSON.stringify(nuevo)); return; }
            anota(key, viejo + ' -> ' + nuevo);
        });
    });
    const desaparecidos = [...porNum.values()].map(m => m['numero de municipio'] + ' ' + m.municipio);
    console.log('  Comparado con data/municipios.json (' + prev.length + ' municipios):');
    console.log('    nuevos: ' + (nuevos.length ? nuevos.join(', ') : 'ninguno') +
        '   |   ya no vienen: ' + (desaparecidos.length ? desaparecidos.join(', ') : 'ninguno'));
    if (!cambian.size) console.log('    ningun campo mapeado cambio de valor');
    [...cambian.entries()].sort((a, b) => b[1].length - a[1].length).forEach(e => {
        const etiqueta = NUMERICOS.has(e[0]) ? 'numero' : 'texto/fecha';
        console.log('    ' + pad(e[0], 26) + pad(e[1].length + ' cambios', 12) + pad('(' + etiqueta + ')', 14) +
            'ej: ' + e[1].slice(0, 3).map(t => cut(t, 46)).join(' | '));
        if (e[1].length > 3) console.log('    ' + pad('', 52) + '... y ' + (e[1].length - 3) + ' mas');
    });
}
console.log('');
