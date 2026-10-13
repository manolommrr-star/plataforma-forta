#!/usr/bin/env node
/*
 * ============================================================================
 *  build-votos.js — Votos por partido desde los reportes del SEE
 *  ----------------------------------------------------------------------------
 *  Lee los tres listados municipales del SEE (OPLE Veracruz) y calcula, para
 *  cada municipio y cada votacion, los votos de cada PARTIDO (sin coaliciones,
 *  sin candidatos independientes y sin votos nulos). El % de cada barra se
 *  saca sobre el total de votos A PARTIDOS de ese municipio, de modo que las
 *  barras de una votacion suman ~100%:
 *
 *      2025_SEE_AYUN_VER_MUN.xlsx       -> alcaldes 2025
 *      2024_SEE_DIP_LOC_MR_VER_MUN.xlsx -> diputados locales 2024
 *      2024_SEE_DIP_FED_MR_NAL_MUN.xlsx -> diputados federales 2024
 *
 *  La clave de union con la plataforma es ID_MUNICIPIO = "numero de municipio"
 *  (1..212; coincide exacto con el panel).
 *
 *  Salidas:
 *      data/votos.json                     estructura por municipio y votacion
 *      data/municipios.json + index.html   campo nuevo "votos_partidos"
 *
 *  El campo "votos_partidos" es un dato ESTRUCTURADO (objeto), por eso no se
 *  exporta al CSV/Excel y se excluye de la validacion de "35 campos" de
 *  verify.js, igual que metricas/etiquetas/metadata.
 *
 *  Uso:  node build-votos.js [--check]
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('./build-data.js');
const { sheetList, norm } = require('./build-localidades.js');

const BASE = __dirname;
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');

// Partidos que se muestran. Se leen SOLO las columnas cuyo encabezado este en
// esta lista; asi las coaliciones (PAN_PRI_PRD, FXMV, PVEM_MORENA, ...), los
// candidatos independientes (CAND_IND*) y los votos nulos quedan fuera solos.
const PARTIDOS = ['PAN', 'PRI', 'PRD', 'PVEM', 'PT', 'MC', 'MORENA'];

// Un SEE por votacion. filtro: 'VER' = el libro es nacional, nos quedamos solo
// con estado 30; null = el libro ya es solo de Veracruz.
const REPORTES = [
    { clave: 'ayun', votacion: 'alcaldes 2025', etiqueta: '2025 alcaldes',
      patron: /^2025_SEE_AYUN.*\.xlsx$/i, filtro: null,
      respaldo: '2025_SEE_AYUN_VER_MUN.xlsx' },
    { clave: 'loc', votacion: 'diputados locales 2024', etiqueta: '2024 locales',
      patron: /^2024_SEE_DIP_LOC.*\.xlsx$/i, filtro: null,
      respaldo: '2024_SEE_DIP_LOC_MR_VER_MUN.xlsx' },
    { clave: 'fed', votacion: 'diputados federales 2024', etiqueta: '2024 federales',
      patron: /^2024_SEE_DIP_FED.*\.xlsx$/i, filtro: 'VER',
      respaldo: '2024_SEE_DIP_FED_MR_NAL_MUN.xlsx' }
];

// El reporte mas reciente que case con el patron; si no hay, el de respaldo.
function masReciente(patron, respaldo) {
    const archivos = fs.readdirSync(BASE)
        .filter(f => patron.test(f) && !f.startsWith('~$'))
        .map(f => ({ f, t: fs.statSync(path.join(BASE, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    return archivos.length ? archivos[0].f : respaldo;
}

// ------------------------------------------------------- lectura de un SEE
// Detecta las columnas por NOMBRE de encabezado (robusto a reordenamientos).
// Devuelve Map<idMunicipio, {votos:Map<partido,votos>, validos, municipio}>.
function leerSee(nombreArchivo, filtro) {
    const zip = B.readZip(fs.readFileSync(path.join(BASE, nombreArchivo)));
    const sst = B.parseSharedStrings(zip.read('xl/sharedStrings.xml') || '');
    const hoja = sheetList(zip)[0];
    if (!hoja) throw new Error('el libro no tiene ninguna hoja legible: ' + nombreArchivo);
    const rows = B.parseSheet(zip.read(hoja.path), sst);

    const hdr = rows.get(1) || new Map();
    const col = {};                       // nombreCampo -> letra de columna
    for (const [letra, valor] of hdr) {
        const nombre = norm(valor);
        if (nombre) col[nombre] = letra;
    }
    const cell = (nombreCampo, c) => c.get(col[nombreCampo]);

    // Cada reporte trae su propio juego de columnas de partido (p. ej. el de
    // alcaldes 2025 no tiene PRD), asi que solo exigimos las de control y al
    // menos un partido; las columnas de partido presentes se detectan solas.
    const requeridas = ['ID_ESTADO', 'ID_MUNICIPIO', 'NUM_VOTOS_VALIDOS'];
    const faltanReq = requeridas.filter(p => !col[p]);
    if (faltanReq.length) throw new Error('encabezados ausentes en ' + nombreArchivo + ': ' + faltanReq.join(', '));
    const partidos = PARTIDOS.filter(p => col[p]);
    if (!partidos.length) throw new Error('sin columnas de partido en ' + nombreArchivo);

    const mapa = new Map();
    [...rows.keys()].map(Number).sort((a, b) => a - b).forEach(n => {
        if (n < 2) return;                // fila 1 = encabezado
        const c = rows.get(n);
        if (filtro === 'VER' && norm(cell('ID_ESTADO', c) || '') !== '30') return;
        const id = +cell('ID_MUNICIPIO', c);
        if (!isFinite(id) || id < 1) return;             // ignora "VOTO ANTICIPADO" (id 0)
        const votos = new Map();
        partidos.forEach(p => { votos.set(p, +cell(p, c) || 0); });
        mapa.set(id, {
            votos,
            validos: +cell('NUM_VOTOS_VALIDOS', c) || 0,
            municipio: B.cleanText(String(cell('MUNICIPIO', c) || ''))
        });
    });
    return mapa;
}

// ------------------------------------------------ cálculo por municipio
// votosPartidos[numero] = { "<etiqueta>": { total, barras:[{partido,votos,pct}] }, ... }
// El % de cada barra = votos del partido / total de votos A PARTIDOS.
function construirCampo(porReporte) {
    const out = {};
    REPORTES.forEach(rep => {
        const mapa = porReporte.get(rep.clave);
        for (const [id, reg] of mapa) {
            if (!out[id]) out[id] = {};
            let total = 0;
            reg.votos.forEach(v => { total += v; });
            const barras = [];
            reg.votos.forEach((v, partido) => {
                barras.push({ partido: partido, votos: v, pct: total > 0 ? Math.round(v / total * 10000) / 100 : 0 });
            });
            out[id][rep.etiqueta] = { total: total, barras: barras };
        }
    });
    return out;
}

// --------------------------------------------- aplicar a la plataforma
// Inserta el campo "votos_partidos" en data/municipios.json y en el bloque
// JSON embebido de index.html (misma serializacion que build-data.js).
// Comprueba los DOS archivos para no dejar uno sin el campo: antes bastaba
// con que municipios.json ya coincidiera para no tocar index.html, lo que los
// podia desincronizar.
function aplicarAPlataforma(campo) {
    const jsonPath = path.join(BASE, 'data', 'municipios.json');
    if (!fs.existsSync(jsonPath)) { console.log('\n(no existe data/municipios.json: nada que actualizar)'); return; }
    const municipios = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let cambiados = 0;
    const ausentes = [];
    municipios.forEach(m => {
        const c = campo[m['numero de municipio']];
        if (!c) { ausentes.push(m['numero de municipio']); return; }
        if (JSON.stringify(m.votos_partidos || null) !== JSON.stringify(c)) cambiados++;
        m.votos_partidos = c;
    });
    if (ausentes.length) console.log('  AVISO municipios sin datos de votos: ' + ausentes.join(', '));

    const json = JSON.stringify(municipios, null, 2);
    if (json.includes('</')) throw new Error('los datos contienen "</": habria que escapar el JSON embebido');

    // ¿index.html ya lleva exactamente este JSON?
    const htmlPath = path.join(BASE, 'index.html');
    const tag = '<script type="application/json" id="municipios-data">';
    let htmlOk = false;
    if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, 'utf8');
        const i = html.indexOf(tag), j = html.indexOf('</script>', i);
        if (i >= 0 && j >= 0) htmlOk = html.slice(i + tag.length, j).trim() === json;
    }

    if (!cambiados && htmlOk) { console.log('\n✔ data/municipios.json e index.html: votos_partidos ya coincidía'); return; }

    if (cambiados) {
        fs.writeFileSync(jsonPath, json + '\n', 'utf8');
        console.log('\n✔ data/municipios.json: votos_partidos actualizado en ' + cambiados + ' municipios');
    }
    if (!htmlOk) {
        if (!fs.existsSync(htmlPath)) return;
        const html = fs.readFileSync(htmlPath, 'utf8');
        const i = html.indexOf(tag), j = html.indexOf('</script>', i);
        if (i < 0 || j < 0) { console.log('  AVISO no se encontro el bloque JSON embebido en index.html'); return; }
        fs.writeFileSync(htmlPath, html.slice(0, i + tag.length) + '\n' + json + '\n        ' + html.slice(j), 'utf8');
        console.log('✔ index.html: bloque embebido actualizado con votos_partidos');
    }
}

// ------------------------------------------------------------------- MAIN
function main() {
    const porReporte = new Map();
    REPORTES.forEach(r => {
        const archivo = masReciente(r.patron, r.respaldo);
        if (!fs.existsSync(path.join(BASE, archivo))) throw new Error('no existe el Excel: ' + archivo);
        const mapa = leerSee(archivo, r.filtro);
        porReporte.set(r.clave, mapa);
        console.log('✔ ' + r.votacion + ' (' + archivo + '): ' + mapa.size + ' municipios');
    });

    const campo = construirCampo(porReporte);
    console.log('\nMunicipios con votos: ' + Object.keys(campo).length);

    // data/votos.json (lectura humana / respaldo)
    if (!CHECK_ONLY) {
        const out = {
            fuente: REPORTES.map(r => ({ votacion: r.votacion, archivo: masReciente(r.patron, r.respaldo) })),
            nota: '% de cada partido sobre el total de votos A PARTIDOS del municipio (sin coaliciones, ni candidatos independientes, ni votos nulos).',
            partidos: PARTIDOS,
            generado: new Date().toISOString().slice(0, 10),
            municipios: campo
        };
        const outVotos = path.join(BASE, 'data', 'votos.json');
        fs.mkdirSync(path.dirname(outVotos), { recursive: true });
        fs.writeFileSync(outVotos, JSON.stringify(out, null, 2) + '\n', 'utf8');
        console.log('✔ data/votos.json escrito');
    }

    if (CHECK_ONLY) { console.log('\n(--check) No se escribio ningun archivo.'); return; }
    aplicarAPlataforma(campo);
}

if (require.main === module) {
    try { main(); } catch (e) { console.error('\n✘ ' + e.message); process.exit(1); }
}
module.exports = { PARTIDOS, REPORTES, leerSee, construirCampo };
