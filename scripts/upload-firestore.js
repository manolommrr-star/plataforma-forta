/* ==========================================================================
   upload-firestore.js — Subir 3 colecciones a Firestore
   Lee public/data/municipios_*.json y las sube a:
     - municipios_info
     - municipios_contactos
     - municipios_votaciones
   Usa 'numero de municipio' como ID de documento para poder hacer join.
   Requisitos: serviceAccountKey.json en la raíz del proyecto.
   Uso: node scripts/upload-firestore.js
   ========================================================================== */

'use strict';

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'serviceAccountKey.json');
const DATA_DIR = path.join(ROOT, 'public', 'data');

const COLLECTIONS = {
    info:   { file: 'municipios_info.json',    collection: 'municipios_info' },
    contactos: { file: 'municipios_contactos.json', collection: 'municipios_contactos' },
    votos:  { file: 'municipios_votaciones.json', collection: 'municipios_votaciones' },
};

function initFirebase() {
    if (admin.getApps && admin.getApps().length > 0) {
        return admin.app();
    }
    let cred;
    if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        cred = admin.cert(SERVICE_ACCOUNT_PATH);
        console.log('🔑 Usando credenciales desde serviceAccountKey.json');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        cred = admin.applicationDefault();
        console.log('🔑 Usando GOOGLE_APPLICATION_CREDENTIALS del entorno');
    } else {
        throw new Error('No se encontraron credenciales de Firebase.');
    }
    return admin.initializeApp({ credential: cred });
}

function toDocId(num) {
    // ID de documento como string del número de municipio
    return String(num);
}

async function uploadCollection(db, collectionName, items) {
    const collection = db.collection(collectionName);
    let batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 400;
    let subidos = 0;
    let errores = 0;

    for (const item of items) {
        const num = item['numero de municipio'];
        if (num == null) {
            console.warn(`⚠️  Item sin numero de municipio, saltando:`, item.municipio || item);
            errores++;
            continue;
        }
        const docRef = collection.doc(toDocId(num));
        batch.set(docRef, item, { merge: true });
        batchCount++;
        subidos++;

        if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`   ✅ ${collectionName}: lote de ${BATCH_SIZE} enviado (${subidos}/${items.length})`);
            batchCount = 0;
            batch = db.batch();
        }
    }

    if (batchCount > 0) {
        await batch.commit();
        console.log(`   ✅ ${collectionName}: lote final de ${batchCount} enviado.`);
    }

    return { subidos, errores };
}

async function main() {
    console.log('🚀 Iniciando subida de colecciones a Firestore...');
    const app = initFirebase();
    const db = getFirestore(app);

    const results = {};

    for (const [key, cfg] of Object.entries(COLLECTIONS)) {
        const filePath = path.join(DATA_DIR, cfg.file);
        if (!fs.existsSync(filePath)) {
            console.error(`❌ No se encuentra ${filePath}`);
            results[key] = { subidos: 0, errores: 1 };
            continue;
        }

        console.log(`\n📦 Procesando ${cfg.collection} desde ${cfg.file}...`);
        const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`   Ítems encontrados: ${items.length}`);

        try {
            const res = await uploadCollection(db, cfg.collection, items);
            results[key] = res;
            console.log(`   ✅ ${cfg.collection} completado: ${res.subidos} subidos, ${res.errores} errores`);
        } catch (err) {
            console.error(`   ❌ Error subiendo ${cfg.collection}:`, err.message);
            results[key] = { subidos: 0, errores: items.length };
        }
    }

    console.log('\n========================================');
    console.log('✅ Subida completada');
    for (const [key, res] of Object.entries(results)) {
        console.log(`   ${COLLECTIONS[key].collection}: ${res.subidos} subidos, ${res.errores} errores`);
    }
    console.log('========================================');
}

main().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});