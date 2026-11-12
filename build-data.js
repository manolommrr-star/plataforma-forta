/* ==========================================================================
   build-data.js — Sincronizar Excel "Panel FORTA 2 03-11-2026.xlsx" → Firestore
   
   Lee el archivo Excel, normaliza los 212 municipios y los sube a la colección
   `municipios` de Firestore.
   
   Requisitos:
     - node_modules/firebase-admin
     - Credenciales: serviceAccountKey.json en la raíz o GOOGLE_APPLICATION_CREDENTIALS
   
   Uso:
     node build-data.js
   ========================================================================== */

'use strict';

const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, 'Panel FORTA 2 03-11-2026.xlsx');
const SHEET_NAME = 'Panel';
const FIRESTORE_COLLECTION = 'municipios';
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');
const MUNICIPIOS_JSON_PATH = path.join(__dirname, 'data', 'municipios.json');

function initFirebase() {
    try {
        if (admin.getApps && admin.getApps().length > 0) {
            return admin.app();
        }
    } catch (e) {
        // continuar con inicialización
    }
    let cred;
    if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        cred = admin.cert(SERVICE_ACCOUNT_PATH);
        console.log('🔑 Usando credenciales desde serviceAccountKey.json');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        cred = admin.applicationDefault();
        console.log('🔑 Usando GOOGLE_APPLICATION_CREDENTIALS del entorno');
    } else {
        throw new Error(
            'No se encontraron credenciales de Firebase. Crea serviceAccountKey.json ' +
            'en la raíz del proyecto o define GOOGLE_APPLICATION_CREDENTIALS.'
        );
    }
    const app = admin.initializeApp({ credential: cred });
    return app;
}

function trimStr(v) {
    if (v == null) return '';
    return String(v).trim();
}

function toNum(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

function toDateISO(v) {
    if (v == null) return null;
    if (v instanceof Date) {
        return v.toISOString().split('T')[0];
    }
    const num = (typeof v === 'number') ? v : (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : null);
    if (num !== null && !isNaN(num) && num > 1000 && num < 100000) {
        if (typeof XLSX !== 'undefined' && XLSX.SSF && XLSX.SSF.parse_date_code) {
            const p = XLSX.SSF.parse_date_code(num);
            if (p) {
                const y = String(p.y).padStart(4, '0');
                const m = String(p.m).padStart(2, '0');
                const d = String(p.d).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
        }
        const ms = Math.round((num - 25569) * 86400 * 1000);
        return new Date(ms).toISOString().split('T')[0];
    }
    const s = String(v).trim();
    if (!s) return null;
    return s;
}

function buildMunicipioDoc(row, jsonMatch) {
    const m = {};

    // Mantener estructura base de datos (votaciones por partido, localidades con clave de sección, etc.)
    if (jsonMatch) {
        if (jsonMatch.secciones_detalle) m.secciones_detalle = jsonMatch.secciones_detalle;
        if (jsonMatch.votos_partidos) m.votos_partidos = jsonMatch.votos_partidos;
        if (jsonMatch.pct_2025 != null) m.pct_2025 = jsonMatch.pct_2025;
        m.metricas = jsonMatch.metricas || {};
        m.etiquetas = jsonMatch.etiquetas || [];
        m.metadata = jsonMatch.metadata || {};
    } else {
        m.metricas = {};
        m.etiquetas = [];
        m.metadata = {};
    }

    m.zona = trimStr(row[0]);
    m.coordinador_zona = trimStr(row[1]);
    m.prioridad = trimStr(row[2]);
    m.delegado = trimStr(row[3]);
    m['numero de municipio'] = toNum(row[4]);
    m.municipio = trimStr(row[5]);
    m.localidades = trimStr(row[6]);
    m.distrito_local = trimStr(row[7]);
    m.distrito_federal = trimStr(row[8]);
    m.listado_nominal = toNum(row[9]);
    m.secciones = toNum(row[10]);
    m.rutas = toNum(row[11]);
    m.casillas = toNum(row[12]);
    m.total_ediles = toNum(row[13]);
    m.votos_2024_locales = toNum(row[14]);
    m.pct_2024_locales = toNum(row[15]);
    m.votos_2024_federales = toNum(row[16]);
    m.pct_2024_federales = toNum(row[17]);
    m.votos_2025_alcaldes = toNum(row[18]);
    m.pct_2025_alcaldes = toNum(row[19]);
    m.pp_diputado_federal = trimStr(row[20]);
    m.pp_diputado_local = trimStr(row[21]);
    m.pp_presidente_municipal = trimStr(row[22]);
    m.regidores_pan = trimStr(row[23]);
    m.militantes = toNum(row[24]);
    m.consejero_estatal = trimStr(row[25]);
    m.consejero_nacional = trimStr(row[26]);
    m.estatus_estructura = trimStr(row[27]);
    m.soldados = toNum(row[28]);
    m.meta_afiliados = toNum(row[29]);
    m.vigencia = toDateISO(row[30]);
    m.financiamento = trimStr(row[31]);
    m.ejercicio = trimStr(row[32]);
    m.presidente_estructura = trimStr(row[33]);
    m.presidente_genero = trimStr(row[34]);
    m.presidente_telefono = trimStr(row[35]);
    m.presidente_fecha_nacimiento = toDateISO(row[36]);
    m.secretario_general = trimStr(row[37]);
    m.secretario_genero = trimStr(row[38]);
    m.secretario_telefono = trimStr(row[39]);
    m.secretario_fecha_nacimiento = toDateISO(row[40]);
    m.candidatos_pan_2025 = trimStr(row[41]);
    m._synced_at = FieldValue.serverTimestamp();
    return m;
}

async function main() {
    console.log('🚀 Iniciando sincronización Excel → Firestore');
    console.log('📁 Archivo:', EXCEL_PATH);

    if (!fs.existsSync(EXCEL_PATH)) {
        console.error('❌ No se encontró el archivo Excel:', EXCEL_PATH);
        process.exit(1);
    }

    const app = initFirebase();
    const db = getFirestore(app);

    const workbook = XLSX.readFile(EXCEL_PATH);
    if (!workbook.SheetNames.includes(SHEET_NAME)) {
        console.error(`❌ La hoja "${SHEET_NAME}" no existe en el Excel. Hojas: ${workbook.SheetNames.join(', ')}`);
        process.exit(1);
    }

    const ws = workbook.Sheets[SHEET_NAME];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    const dataRows = rows.slice(2);
    console.log('📊 Filas de datos encontradas:', dataRows.length);

    // Cargar estructura base (votaciones por partido, localidades con clave de sección, etc.)
    const baseByNum = new Map();
    const baseByName = new Map();
    if (fs.existsSync(MUNICIPIOS_JSON_PATH)) {
        try {
            const baseJson = JSON.parse(fs.readFileSync(MUNICIPIOS_JSON_PATH, 'utf8'));
            baseJson.forEach(item => {
                if (item['numero de municipio'] != null) baseByNum.set(item['numero de municipio'], item);
                if (item.municipio) baseByName.set(String(item.municipio).trim().toUpperCase(), item);
            });
            console.log(`📦 Datos base cargados de municipios.json (${baseJson.length} municipios)`);
        } catch (e) {
            console.warn('⚠️  No se pudo leer municipios.json:', e.message);
        }
    }

    let subidos = 0;
    let errores = 0;
    const fallos = [];
    let batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 400;

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];

        const numMuni = toNum(row[4]);
        const nombreMuni = trimStr(row[5]);
        if (!numMuni && !nombreMuni) continue;

        if (!nombreMuni) {
            console.warn(`⚠️  Fila ${i + 3}: sin nombre de municipio, saltando.`);
            errores++;
            fallos.push(`Fila ${i + 3}: sin nombre`);
            continue;
        }

        try {
            const jsonMatch = (numMuni != null ? baseByNum.get(numMuni) : null) || baseByName.get(nombreMuni.toUpperCase());
            const docData = buildMunicipioDoc(row, jsonMatch);
            const docId = nombreMuni;
            const docRef = db.collection(FIRESTORE_COLLECTION).doc(docId);

            batch.set(docRef, docData, { merge: true });
            batchCount++;

            if (batchCount >= BATCH_SIZE) {
                await batch.commit();
                console.log(`   ✅ Lote de ${BATCH_SIZE} enviado...`);
                subidos += batchCount;
                batchCount = 0;
                batch = db.batch();
            }
        } catch (err) {
            console.error(`❌ Error en fila ${i + 3} (${nombreMuni}):`, err.message);
            errores++;
            fallos.push(`${nombreMuni}: ${err.message}`);
        }
    }

    if (batchCount > 0) {
        await batch.commit();
        subidos += batchCount;
        console.log(`   ✅ Lote final de ${batchCount} enviado.`);
    }

    console.log('\n========================================');
    console.log('✅ Sincronización completada');
    console.log(`   Total subidos: ${subidos}`);
    console.log(`   Errores: ${errores}`);
    if (fallos.length > 0) {
        console.log('   Municipios con error:');
        fallos.forEach(f => console.log('     -', f));
    }
    console.log('========================================');
}

main().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});

