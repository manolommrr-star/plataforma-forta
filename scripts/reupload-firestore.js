/* ==========================================================================
   reupload-firestore.js — Borrar y volver a subir 3 colecciones a Firestore
   Usa el NOMBRE del municipio como ID de documento (no el número).
   Colecciones: municipios_info, municipios_contactos, municipios_votaciones
   ========================================================================== */

'use strict';

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'serviceAccountKey.json');
const DATA_DIR = path.join(ROOT, 'public', 'data');

const COLLECTIONS = [
    { file: 'municipios_info.json',    collection: 'municipios_info' },
    { file: 'municipios_contactos.json', collection: 'municipios_contactos' },
    { file: 'municipios_votaciones.json', collection: 'municipios_votaciones' },
];

function initFirebase() {
    if (admin.getApps && admin.getApps().length > 0) {
        return admin.app();
    }
    let cred;
    if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        cred = admin.cert(SERVICE_ACCOUNT_PATH);
        console.log('🔑 Usando credenciales desde serviceAccountKey.json');
    } else {
        throw new Error('No se encontró serviceAccountKey.json');
    }
    return admin.initializeApp({ credential: cred });
}

async function deleteCollection(db, collectionName) {
    const collection = db.collection(collectionName);
    const snapshot = await collection.get();
    if (snapshot.empty) {
        console.log(`   📭 ${collectionName}: ya está vacía`);
        return 0;
    }
    console.log(`   🗑️  ${collectionName}: eliminando ${snapshot.size} documentos...`);
    let batch = db.batch();
    let count = 0;
    snapshot.forEach(doc => {
        batch.delete(doc.ref);
        count++;
    });
    await batch.commit();
    console.log(`   ✅ ${collectionName}: ${count} documentos eliminados`);
    return count;
}

async function uploadCollection(db, collectionName, items) {
    const collection = db.collection(collectionName);
    let batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 400;
    let subidos = 0;
    let errores = 0;

    for (const item of items) {
        const docId = item.municipio; // NOMBRE del municipio como ID
        if (!docId) {
            console.warn(`⚠️  Item sin nombre de municipio, saltando:`, JSON.stringify(item));
            errores++;
            continue;
        }
        const docRef = collection.doc(String(docId));
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
    console.log('🚀 Iniciando borrado y re-subida de colecciones a Firestore...');
    console.log('   Usando NOMBRE del municipio como ID de documento\n');
    const app = initFirebase();
    const db = getFirestore(app);

    // Paso 1: Borrar colecciones existentes
    console.log('═══ PASO 1: BORRANDO COLECCIONES ═══');
    for (const cfg of COLLECTIONS) {
        await deleteCollection(db, cfg.collection);
    }

    // Paso 2: Subir nuevamente con nombre como ID
    console.log('\n═══ PASO 2: SUBINDO CON NOMBRE COMO ID ═══');
    const results = {};
    for (const cfg of COLLECTIONS) {
        const filePath = path.join(DATA_DIR, cfg.file);
        if (!fs.existsSync(filePath)) {
            console.error(`❌ No se encuentra ${filePath}`);
            results[cfg.collection] = { subidos: 0, errores: 1 };
            continue;
        }
        console.log(`\n📦 Procesando ${cfg.collection} desde ${cfg.file}...`);
        const items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`   Ítems encontrados: ${items.length}`);
        try {
            const res = await uploadCollection(db, cfg.collection, items);
            results[cfg.collection] = res;
            console.log(`   ✅ ${cfg.collection} completado: ${res.subidos} subidos, ${res.errores} errores`);
        } catch (err) {
            console.error(`   ❌ Error subiendo ${cfg.collection}:`, err.message);
            results[cfg.collection] = { subidos: 0, errores: items.length };
        }
    }

    console.log('\n========================================');
    console.log('✅ Proceso completado');
    for (const cfg of COLLECTIONS) {
        const res = results[cfg.collection];
        console.log(`   ${cfg.collection}: ${res.subidos} subidos, ${res.errores} errores`);
    }
    console.log('========================================');
}

main().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});