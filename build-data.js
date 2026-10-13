// build-data.js — Regenera data/municipios.json y el bloque JSON embebido en
// index.html a partir del Excel del Panel de Fortalecimiento Interno.
//
// SIN DEPENDENCIAS: lee el .xlsx (que es un ZIP) con el zlib de Node y parsea el
// XML de la hoja directamente. Uso:
//     node build-data.js                      // usa el "Panel*.xlsx" mas reciente
//     node build-data.js "Otro archivo.xlsx"  // otra fuente
//     node build-data.js --check              // solo valida, no escribe nada

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE = __dirname;
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');

// Fuente por defecto: el "Panel*.xlsx" mas reciente de la carpeta (los archivos
// que Excel deja temporales empiezan con "~$" y se ignoran). Asi, cuando llega
// una nueva version del panel basta con guardarla aqui; siempre se puede forzar
// una concreta pasandola como argumento.
function fuentePorDefecto() {
    const paneles = fs.readdirSync(BASE)
        .filter(f => /^Panel.*\.xlsx$/i.test(f) && !f.startsWith('~$'))
        .map(f => ({ f, t: fs.statSync(path.join(BASE, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    return paneles.length ? paneles[0].f : 'Panel de Fortalecimiento Interno 2.xlsx';
}

const ARG_FUENTE = args.find(a => !a.startsWith('--'));
const SOURCE = ARG_FUENTE || fuentePorDefecto();
const SHEET = 'xl/worksheets/sheet1.xml';   // "Hoja 1": la tabla principal
const HEADER_ROW = 2;                        // fila 1 = titulo "Tabla 1"
const FIRST_DATA_ROW = 3;
const EXPECTED_ROWS = 212;

// ---------------------------------------------------------------- LECTOR ZIP
function readZip(buf) {
    const SIG_EOCD = 0x06054b50, SIG_CD = 0x02014b50, SIG_LOCAL = 0x04034b50;
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
        if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('No es un .xlsx valido (no hay central directory)');
    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    const entries = {};
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(off) !== SIG_CD) throw new Error('central directory corrompido');
        entries[buf.toString('utf8', off + 46, off + 46 + buf.readUInt16LE(off + 28))] = {
            method: buf.readUInt16LE(off + 10),
            compSize: buf.readUInt32LE(off + 20),
            localOff: buf.readUInt32LE(off + 42)
        };
        off += 46 + buf.readUInt16LE(off + 28) + buf.readUInt16LE(off + 30) + buf.readUInt16LE(off + 32);
    }
    function read(name) {
        const e = entries[name];
        if (!e) return null;
        const lo = e.localOff;
        if (buf.readUInt32LE(lo) !== SIG_LOCAL) throw new Error('encabezado local corrompido: ' + name);
        const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
        const raw = buf.slice(start, start + e.compSize);
        return e.method === 0 ? raw.toString('utf8') : zlib.inflateRawSync(raw).toString('utf8');
    }
    return { read, has: n => !!entries[n] };
}

// --------------------------------------------------------------- UTILIDADES
function decodeXml(s) {
    return s
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&amp;/g, '&');
}
function stripTags(s) { return s.replace(/<[^>]*>/g, ''); }
// Texto limpio: sin etiquetas ricas, entidades, espacios DoBLE o invisibles
function cleanText(s) {
    return decodeXml(stripTags(s))
        .replace(/[\u00A0\u200B\u200E\u200F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
// Clave comparable de encabezado: sin acentos, espacios, guiones, ni prefijos
function normHeader(s) {
    return cleanText(s)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\(pp\)/g, '').replace(/\*/g, '')
        .replace(/[^a-z0-9]/g, '');
}
function colToIndex(col) {
    let n = 0;
    for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}
// Numero de serie de Excel (sistema 1900) -> "dd/mm/aaaa"
// Rango admitido: 12000 (1932) a 60000 (2064). El piso existe para que un numero
// suelto escrito por error en la columna (un "19") no se cuele como fecha, pero no
// puede quedar tan alto: con el anterior (20000 = octubre de 1954) se perdia, por
// ejemplo, el nacimiento de 1953 del secretario de JALTIPAN.
// Si la celda ya viene escrita como texto "dd/mm/aaaa" se respeta, previa comprobacion.
function excelDate(v) {
    const t = String(v).trim();
    const f = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (f) {
        const dd = +f[1], mm = +f[2], aa = +f[3];
        if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || aa < 1900 || aa > 2064) return null;
        const p = n => String(n).padStart(2, '0');
        return p(dd) + '/' + p(mm) + '/' + aa;
    }
    const ser = typeof v === 'number' ? v : parseFloat(t.replace(',', '.'));
    if (!isFinite(ser) || ser < 12000 || ser > 60000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(ser) * 86400000);
    const p = n => String(n).padStart(2, '0');
    return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
}
function toInt(v) {
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? Math.round(n) : null;
}
function toNum(v, dp) {
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(n)) return null;
    const f = Math.pow(10, dp === undefined ? 6 : dp);
    return Math.round(n * f) / f;
}
function toPhone(v) {
    const digits = String(v).replace(/\D/g, '');
    if (digits.length === 10) return digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6);
    if (digits.length === 11 && digits[0] === '1') return toPhone(digits.slice(1));
    return cleanText(String(v));
}

// ------------------------------------------------------ MAPEO DE COLUMNAS
// [columna, encabezado esperado (normalizado), clave en el JSON, tipo, opcional]
// El 5.º elemento ("opcional", true) marca una columna que puede FALTAR en el
// Excel porque apareció en una version posterior: si falta, el campo sale null
// y el build no se queja; si viene, el titulo debe coincidir igualmente.
// La columna G NO tiene titulo en el Excel: es el DISTRITO LOCAL (valores tipo
// "12 COATEPEC", coincide con la columna LOCAL de la hoja "Hoja 1-1").
//
// UNIDAD DE LOS PORCENTAJES (tipo 'pct'): NO se adivina por el tamano del numero.
// Se lee el formato de cada celda en xl/styles.xml:
//   - celda con formato "0.00%"  -> el Excel guarda la FRACCION (0.1713) y en
//     pantalla se lee 17.13%  -> aqui se multiplica por 100.
//   - celda sin formato de %     -> el numero escrito ES el porcentaje: ahi
//     0.3927 = 0.39% (no 39%) -> se deja tal cual.
// En este archivo: O y Q estan al 100% con formato "0.00%" (212 celdas cada una)
// y S esta al 100% sin formato de porcentaje ("General"), aunque 56 de sus
// valores son menores que 1. Multiplicar esos 56 por 100 inflaria a esos
// municipios a 40-98% cuando en realidad sacaron menos del 1% de la votacion.
const COLUMNS = [
    ['A',  'zona',                  'zona',                        'int'],
    ['B',  'coordinadordezona',     'coordinador_zona',            'text'],
    ['C',  'prioridad',             'prioridad',                   'text'],
    ['E',  'numerodemunicipio',     'numero de municipio',         'int'],
    ['F',  'municipio',             'municipio',                   'text'],
    // G viene vacia de titulo en el Excel 08-10-2026: trae el desglose de
    // secciones ("1. ACAJETE | 9. LA JOYA | ..."). Campo NUEVO, no rompe
    // distrito_local (que sigue siendo H = "12 COATEPEC").
    ['G',  '',                      'secciones_detalle',           'text'],
    ['H',  'distritolocalelectoral','distrito_local',              'text'],
    ['I',  'distritofederal',       'distrito_federal',            'text'],
    ['J',  'listadonominal',        'listado_nominal',             'int'],
    ['K',  'secciones',             'secciones',                   'int'],
    ['L',  'rutas',                 'rutas',                       'int'],
    ['M',  'casillas',              'casillas',                    'int'],
    ['N',  'totaldeediles',         'total_ediles',                'int'],
    ['O',  'votos2024locales',      'votos_2024_locales',          'int'],
    ['P',  '%2024',                 'pct_2024_locales',            'pct'],
    ['Q',  'votos2024federales',    'votos_2024_federales',        'int'],
    ['R',  '%2024',                 'pct_2024_federales',          'pct'],
    ['S',  'votos2025alcaldes',     'votos_2025_alcaldes',         'int'],
    ['T',  '%2025',                 'pct_2025',                    'pct'],       // celdas "General": ya viene en %
    ['U',  'diputadofederal',       'pp_diputado_federal',         'text'],
    ['V',  'diputadolocal',         'pp_diputado_local',           'text'],
    ['W',  'presidentemunicipal',   'pp_presidente_municipal',     'text'],
    ['X',  'regidoresdelpan',       'regidores_pan',               'text'],
    ['Y',  'militantes',            'militantes',                  'int'],
    ['Z',  'consejeroestatal',      'consejero_estatal',           'text'],
    ['AB', 'estatusdeestructura',   'estatus_estructura',          'text'],
    ['AC', 'soldados',              'soldados',                    'int'],
    ['AD', 'metaafiliados',         'meta_afiliados',              'int'],
    ['AE', 'vigencia',              'vigencia',                    'date'],
    ['AH', 'presidentedeestructura','presidente_estructura',       'text'],
    ['AI', 'genero',                'presidente_genero',           'gender'],
    ['AJ', 'telefono',              'presidente_telefono',         'phone'],
    ['AL', 'secretariogeneral',     'secretario_general',          'text'],
    ['AM', 'genero',                'secretario_genero',           'gender'],
    ['AN', 'telefono',              'secretario_telefono',         'phone'],
    ['AO', 'fechanacimiento',       'secretario_fecha_nacimiento', 'date'],
    // AP "CANDIDATOS PAN 2025": un nombre por municipio. Celdas marcadas con
    // "**" (marca del autor, igual que "**PRIORIDAD"/"**DELEGADO"); el tipo
    // 'name' limpia esa marca. Va como OPCIONAL para que el panel anterior
    // siga construyendo sin errores.
    ['AP', 'candidatospan2025',     'candidatos_pan_2025',         'name', true]
];

// Columnas con titulo en el Excel que se ignoran a proposito (0-2 datos)
const IGNORED = {
    D: '**DELEGADO (vacio)',
    AA: 'CONSEJERO NACIONAL (vacio)',
    AF: 'FINANCIAMIENTO (vacio)',
    AG: 'EJERCICIO (vacio)',
    AK: 'FECHA NACIMIENTO del presidente (solo 2 valores)'
};

// ------------------------------------------------------- LECTURA DE LA HOJA
function parseSharedStrings(xml) {
    if (!xml) return [];
    const out = [];
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml))) out.push(cleanText(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '')));
    return out;
}

// ------------------------------------------- FORMATO DE NUMERO DE CADA CELDA
// En un .xlsx el formato no esta en la celda sino en xl/styles.xml: la celda
// lleva s="12" y ese indice apunta a <cellXfs><xf numFmtId="10"/></xf></cellXfs>.
// styleFormatCodes() devuelve, por indice de estilo, el codigo de formato
// ("General", "0.00%", "@", ...). Los ids 0-44 son formats internos de OOXML.
function styleFormatCodes(stylesXml) {
    const custom = new Map();
    const re = /<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
    let m;
    while ((m = re.exec(stylesXml || ''))) custom.set(m[1], decodeXml(m[2]));
    const builtin = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 14: 'mm/dd/yyyy', 22: 'm/d/yy h:mm', 44: '"$ "#,##0.00' };
    const codes = [];
    const blk = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml || '');
    if (blk) {
        const xre = /<xf\b([^>]*?)\/?>/g;
        let x;
        while ((x = xre.exec(blk[1]))) {
            const nf = /numFmtId="(\d+)"/.exec(x[1]);
            const id = nf ? nf[1] : '0';
            codes.push(builtin[id] || (custom.has(id) ? custom.get(id) : '#' + id));
        }
    }
    return codes;
}

// Indices de estilo (xfId) cuyo formato es de porcentaje: numFmtId 9 ("0%"), 10
// ("0.00%"), o un formatCode propio que contenga "%". En esos casos Excel muestra
// el valor multiplicado por 100, o sea que el numero guardado es la FRACCION.
function percentStyleIndexes(stylesXml) {
    const indexes = new Set();
    styleFormatCodes(stylesXml).forEach((code, i) => {
        if (String(code).indexOf('%') >= 0) indexes.add(i);
    });
    return indexes;
}
// Referencias ("O3", "O4", ...) de todas las celdas con formato de porcentaje.
function percentCells(sheetXml, pctStyles) {
    const refs = new Set();
    if (!pctStyles || !pctStyles.size) return refs;
    const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rm;
    while ((rm = rowRe.exec(sheetXml))) {
        if (!rm[2]) continue;
        const cellRe = /<c\b([^>]*?)\/?>/g;
        let cm;
        while ((cm = cellRe.exec(rm[2]))) {
            const refM = /r="([A-Z]+)(\d+)"/.exec(cm[1] || '');
            const sM = /s="(\d+)"/.exec(cm[1] || '');
            if (refM && sM && pctStyles.has(+sM[1])) refs.add(refM[1] + refM[2]);
        }
    }
    return refs;
}
// 'pct' -> valor en porcentaje (0-100). La celda con formato "0.00%" guarda la
// fraccion (0.1713 = 17.13%); la celda sin ese formato guarda el numero tal cual
// (0.3927 = 0.39%). Jamas se decide por el tamano del valor: 0.39 bien puede ser
// un 0.39% real, y multiplicarlo por 100 inflaria el dato a 39%.
function toPercent(raw, celdaConFormatoPorciento) {
    const n = toNum(raw, 8);
    if (n === null) return null;
    return celdaConFormatoPorciento ? Math.round(n * 100 * 1e6) / 1e6 : n;
}

function parseSheet(xml, sst) {
    const rows = new Map();
    const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
        const cells = new Map();
        if (rm[2]) {
            const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
            let cm;
            while ((cm = cellRe.exec(rm[2]))) {
                const refM = /r="([A-Z]+)\d+"/.exec(cm[1] || '');
                if (!refM) continue;
                const inner = cm[2] || '';
                const tM = /t="([^"]+)"/.exec(cm[1] || '');
                const t = tM ? tM[1] : '';
                const vM = /<v>([\s\S]*?)<\/v>/.exec(inner);
                const isM = /<is>([\s\S]*?)<\/is>/.exec(inner);
                let raw = vM ? vM[1] : (isM ? isM[1] : '');
                let value;
                if (t === 's') value = sst[parseInt(raw, 10)] ?? '';
                else if (t === 'inlineStr' || t === 'str') value = cleanText(raw);
                else value = decodeXml(raw).trim();
                if (value !== '' && value !== undefined) cells.set(refM[1], value);
            }
        }
        rows.set(+rm[1], cells);
    }
    return rows;
}

// Verifica que el Excel siga teniendo las columnas esperadas (evita leer
// datos torcidos si manana cambian el orden o agregan columnas).
function validateHeaders(rows) {
    const header = rows.get(HEADER_ROW) || new Map();
    const problems = [];
    COLUMNS.forEach(([col, expected, , , opcional]) => {
        const actual = normHeader(header.get(col) || '');
        if (opcional && actual === '') return;      // version del Excel sin esta columna
        if (actual !== normHeader(expected)) {
            problems.push('columna ' + col + ': se esperaba "' + (expected || '(sin titulo)') +
                '" y viene "' + (cleanText(header.get(col) || '(vacia)')) + '"');
        }
    });
    const mapped = new Set(COLUMNS.map(c => c[0]));
    const unknown = [];
    for (const [col, txt] of header) {
        if (!mapped.has(col) && !IGNORED[col] && cleanText(txt)) unknown.push(col + '="' + cleanText(txt) + '"');
    }
    if (unknown.length) problems.push('columnas no reconocidas: ' + unknown.join(', '));
    if (problems.length) throw new Error('la estructura del Excel cambio:\n    ' + problems.join('\n    '));
    const presentes = COLUMNS.filter(c => c[1] === '' || header.has(c[0]));
    return { presentes: presentes.length, ausentes: COLUMNS.filter(c => c[4] && !header.has(c[0])).map(c => c[2]) };
}

// --------------------------------------------------- CONVERSION DE VALORES
// 'name' es como 'text' pero sin las marcas del autor: en el panel 30-09-2026
// 37 candidatos llegan escritos "**NOMBRE" (los mismos "**" que tambien salen en
// los titulos "**PRIORIDAD" y "**DELEGADO"). Se quitan solo los asteriscos que
// rodean el texto; un asterisco dentro del nombre se conservaria.
function toName(raw) {
    return cleanText(String(raw).replace(/^[*\s]+/, '').replace(/[*\s]+$/, '')) || null;
}

function convert(raw, type) {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    switch (type) {
        case 'int':   return toInt(raw);
        case 'pct':   return toNum(raw, 6);   // los 'pct' se resuelven en buildRecords()
        case 'date':  return excelDate(raw);
        case 'phone': return toPhone(raw);
        case 'name':  return toName(raw);
        case 'gender': {
            const g = cleanText(String(raw)).charAt(0).toUpperCase();
            return (g === 'F' || g === 'M') ? g : cleanText(String(raw));
        }
        default:      return cleanText(String(raw)) || null;
    }
}

function buildRecords(rows, pctRefs) {
    const records = [], skipped = [], pctCeldas = {}, marcas = {};
    [...rows.keys()].filter(r => r >= FIRST_DATA_ROW).sort((a, b) => a - b).forEach(r => {
        const cells = rows.get(r);
        const num = convert(cells.get('E'), 'int');
        const nombre = convert(cells.get('F'), 'text');
        if (num === null && !nombre) return;
        if (num === null || !nombre) { skipped.push('fila ' + r); return; }
        const rec = {};
        for (const [col, , key, type] of COLUMNS) {
            if (type !== 'pct') {
                rec[key] = convert(cells.get(col), type);
                // se cuenta la marca "**" que el autor pone en el Excel antes de limpiarla
                if (type === 'name' && /^\*/.test(String(cells.get(col) ?? '').trim())) {
                    marcas[key] = (marcas[key] || 0) + 1;
                }
                continue;
            }
            const conFormato = pctRefs.has(col + r);      // celda "0.00%" en el Excel
            const c = pctCeldas[key] || (pctCeldas[key] = { conFormato: 0, valores: 0 });
            if (cells.get(col) !== undefined && cells.get(col) !== null && cells.get(col) !== '') c.valores++;
            if (conFormato) c.conFormato++;
            rec[key] = toPercent(cells.get(col), conFormato);
        }
        rec.metricas = {};      // campos heredados que el dashboard recorre
        rec.etiquetas = [];
        rec.metadata = {};
        records.push(rec);
    });
    return { records, skipped, pctCeldas, marcas };
}

function check(records) {
    const problems = [], seen = new Map();
    records.forEach((m, i) => {
        const n = m['numero de municipio'];
        const ref = m.municipio || 'registro ' + i;
        if (seen.has(n)) problems.push('numero ' + n + ' duplicado (' + seen.get(n) + ' y ' + m.municipio + ')');
        seen.set(n, m.municipio);
        ['municipio', 'distrito_local', 'distrito_federal'].forEach(k => {
            if (typeof m[k] !== 'string' || !m[k]) problems.push(ref + ': "' + k + '" vacio');
        });
        ['listado_nominal', 'secciones', 'casillas'].forEach(k => {
            if (typeof m[k] !== 'number') problems.push(ref + ': "' + k + '" no es numero');
        });
        if (typeof m.listado_nominal === 'number' && m.listado_nominal < 0) problems.push(ref + ': listado_nominal negativo');
    });
    // --- rango de los porcentajes --------------------------------------------
    // El numero de la celda ES el porcentaje: buildRecords() solo multiplica x100
    // las celdas que en el Excel estan escritas como fraccion porque llevan
    // formato "0.00%". No se deduce nada comparando con otras columnas; lo unico
    // imposible es un porcentaje fuera de 0-100.
    ['pct_2024_locales', 'pct_2024_federales', 'pct_2025'].forEach(pk => {
        records.forEach(m => {
            const p = m[pk];
            if (typeof p === 'number' && (p < 0 || p > 100)) {
                problems.push((m.municipio || 'registro') + ': ' + pk + ' = ' + p + '% fuera de 0-100');
            }
        });
    });
    if (records.length !== EXPECTED_ROWS) problems.push('se esperaban ' + EXPECTED_ROWS + ' municipios, hay ' + records.length);
    const missing = [];
    for (let n = 1; n <= EXPECTED_ROWS; n++) if (!seen.has(n)) missing.push(n);
    if (missing.length) problems.push('numeros sin registro: ' + missing.join(', '));
    return problems;
}

// ------------------------------------------------------------------ REPORTE
function report(records) {
    const problems = check(records);
    problems.forEach(p => console.log('  ✘ ' + p));
    console.log('  ' + (problems.length ? problems.length + ' problema(s)' : '212 municipios, numeros 1-212 sin duplicados') +
        ' · campos por registro: ' + Object.keys(records[0]).length);
    console.log('\nOcupación por campo:');
    const keys = Object.keys(records[0]);
    keys.forEach(k => {
        const filled = records.filter(m => m[k] !== null && m[k] !== undefined).length;
        const bar = '█'.repeat(Math.round(filled / records.length * 20)).padEnd(20, '·');
        console.log('  ' + k.padEnd(Math.max(...keys.map(x => x.length))) +
            ' ' + String(filled).padStart(3) + '/' + records.length + '  ' + bar +
            (filled ? '  ej. ' + JSON.stringify(records.find(m => m[k] !== null)[k]) : ''));
    });
    return problems;
}

// ------------------------------------------- LOCALIDADES DESDE EL PEL
// La columna G del Panel trae en secciones_detalle una lista de localidades
// CORRIMIDA: en 199 de 212 municipios el municipio N lista las localidades de
// otro (p. ej. el mun 7 lista las de BENITO JUAREZ), aunque el total global
// coincide (3078 = 3078). La fuente limpia es el reporte del INE
// (PEL 2024-2025_listadoUbicacionCasillas_JL.xlsx), que build-localidades.js
// deja en data/localidades.json. Si ese archivo existe, aqui se sustituye el
// valor de secciones_detalle por la lista del PEL conservando el mismo formato
// ("1. ACAJETE | 9. LA JOYA | ...") para no tocar nada de la UI; si no
// existe, se conserva el del Panel y se avisa, de modo que build-data.js
// sigue funcionando solo con el Excel del Panel.
function aplicarLocalidadesPel(records) {
    const res = { aplicados: 0, cambiados: 0, ausentes: [] };
    const jsonPath = path.join(BASE, 'data', 'localidades.json');
    if (!fs.existsSync(jsonPath)) {
        console.log('  AVISO no existe data/localidades.json: secciones_detalle queda con el valor del Panel');
        console.log('        (para corregirlo: node build-localidades.js && node build-data.js)');
        return res;
    }
    const pel = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    // aviso si el PEL es mas reciente que la lista ya generada (datos viejos)
    const pels = fs.readdirSync(BASE)
        .filter(f => /^PEL.*\.xlsx$/i.test(f) && !f.startsWith('~$'))
        .map(f => ({ f, t: fs.statSync(path.join(BASE, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    if (pels.length && pels[0].t > fs.statSync(jsonPath).mtimeMs) {
        console.log('  AVISO ' + pels[0].f + ' es mas reciente que data/localidades.json:');
        console.log('        corre node build-localidades.js antes que build-data.js');
    }
    const porNum = new Map((pel.municipios || []).map(m => [m.numero, m]));
    records.forEach(rec => {
        const m = porNum.get(rec['numero de municipio']);
        if (!m || !Array.isArray(m.localidades) || !m.localidades.length) {
            res.ausentes.push(rec['numero de municipio']);
            return;
        }
        const lista = m.localidades.map(l => l.clave + '. ' + l.nombre).join(' | ');
        if (rec.secciones_detalle !== lista) res.cambiados++;
        rec.secciones_detalle = lista;
        res.aplicados++;
    });
    return res;
}

// Re-aplica el campo votos_partidos (barras de votos por partido, calculadas
// desde los SEE) tras regenerar los registros del Panel. Asi, si build-data.js
// se ejecuta solo, el campo no se pierde: se toma de data/votos.json con la
// misma clave (numero de municipio). Si el archivo no existe, se avisa y se
// deja el registro sin el campo, de modo que build-data.js nunca falla por esto.
function aplicarVotosSee(records) {
    const res = { aplicados: 0, ausentes: [] };
    const jsonPath = path.join(BASE, 'data', 'votos.json');
    if (!fs.existsSync(jsonPath)) {
        console.log('  AVISO no existe data/votos.json: votos_partidos quedara sin datos');
        console.log('        (para generarlo: node build-votos.js && node build-data.js)');
        return res;
    }
    const votos = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const porNum = new Map(Object.entries(votos.municipios || {}).map(([k, v]) => [+k, v]));
    records.forEach(rec => {
        const v = porNum.get(rec['numero de municipio']);
        if (!v) { res.ausentes.push(rec['numero de municipio']); return; }
        rec.votos_partidos = v;
        res.aplicados++;
    });
    return res;
}

// --------------------------------------------------------------------- MAIN
function main() {
    const srcPath = path.join(BASE, SOURCE);
    if (!fs.existsSync(srcPath)) throw new Error('no existe el Excel: ' + SOURCE);
    console.log('Fuente: ' + SOURCE + (ARG_FUENTE ? '' : '  (el "Panel*.xlsx" mas reciente de la carpeta)'));

    const zip = readZip(fs.readFileSync(srcPath));
    if (!zip.has(SHEET)) throw new Error('no se encontró la hoja ' + SHEET);
    const sst = parseSharedStrings(zip.read('xl/sharedStrings.xml'));
    const sheetXml = zip.read(SHEET);
    const rows = parseSheet(sheetXml, sst);
    const { presentes, ausentes } = validateHeaders(rows);
    console.log('Encabezados de la fila ' + HEADER_ROW + ': ' + presentes + '/' + COLUMNS.length +
        ' columnas mapeadas OK' +
        (ausentes.length ? ' | columnas opcionales que no vienen: ' + ausentes.join(', ') : ''));

    const pctRefs = percentCells(sheetXml, percentStyleIndexes(zip.read('xl/styles.xml')));
    const { records, skipped, pctCeldas, marcas } = buildRecords(rows, pctRefs);
    console.log('Registros leidos: ' + records.length + (skipped.length ? ' | descartados: ' + skipped.join(', ') : ''));
    Object.keys(marcas).forEach(k => console.log('  ' + k + ': ' + marcas[k] +
        ' celdas llegaban marcadas con "**" en el Excel (se guarda el nombre limpio)'));
    Object.keys(pctCeldas).forEach(k => {
        const c = pctCeldas[k];
        console.log('  ' + k + ': ' + c.conFormato + '/' + c.valores + ' celdas con formato 0.00% (' +
            (c.conFormato === c.valores ? 'todas: se multiplican x100'
                : (c.conFormato ? 'MIXTO: cada celda segun su formato' : 'ninguna: ya vienen en porcentaje')) + ')');
    });

    // secciones_detalle se corrige con la lista del PEL antes de validar y
    // escribir, para que la correccion quede tanto en data/municipios.json
    // como en el bloque JSON embebido en index.html.
    const locPel = aplicarLocalidadesPel(records);
    if (locPel.aplicados) {
        console.log('Localidades: secciones_detalle tomado de data/localidades.json (reporte del INE):');
        console.log('  ' + locPel.aplicados + '/' + records.length + ' municipios con lista del PEL' +
            (locPel.cambiados ? ' · ' + locPel.cambiados + ' cambiaron respecto al Panel' : ' · ninguno cambió respecto al Panel') +
            (locPel.ausentes.length ? ' · SIN lista en el PEL: ' + locPel.ausentes.join(', ') : ''));
    }

    const problems = report(records);
    if (problems.length) process.exit(1);

    if (CHECK_ONLY) { console.log('\n(--check) No se escribio ningun archivo.'); return; }

    const json = JSON.stringify(records, null, 2);
    if (json.includes('</')) throw new Error('los datos contienen "</": habria que escapar el JSON embebido');

    const outJson = path.join(BASE, 'data', 'municipios.json');
    fs.mkdirSync(path.dirname(outJson), { recursive: true });
    fs.writeFileSync(outJson, json + '\n', 'utf8');
    console.log('\n✔ data/municipios.json (' + (Buffer.byteLength(json) / 1024).toFixed(1) + ' KB)');

    const htmlPath = path.join(BASE, 'index.html');
    const tag = '<script type="application/json" id="municipios-data">';
    const html = fs.readFileSync(htmlPath, 'utf8');
    const i = html.indexOf(tag), j = html.indexOf('</script>', i);
    if (i < 0 || j < 0) throw new Error('no se encontró el bloque JSON embebido en index.html');
    fs.writeFileSync(htmlPath, html.slice(0, i + tag.length) + '\n' + json + '\n        ' + html.slice(j), 'utf8');
    console.log('✔ index.html: bloque embebido reemplazado');
    console.log('\nSiguiente paso: node verify.js');
}

// Solo se ejecuta al lanzarlo como script; como modulo expone el lector para
// las herramientas de inspeccion (inspect-xlsx.js).
if (require.main === module) {
    try { main(); } catch (e) { console.error('\n✘ ' + e.message); process.exit(1); }
}

module.exports = {
    readZip, parseSharedStrings, parseSheet, styleFormatCodes, percentStyleIndexes,
    percentCells, toPercent, convert, cleanText, normHeader, colToIndex, excelDate,
    toInt, toNum, toPhone, toName,
    COLUMNS, IGNORED, SHEET, HEADER_ROW, FIRST_DATA_ROW, EXPECTED_ROWS
};



