/* ==========================================================================
   upload-usuarios-roles.js — Subir colección usuarios_roles a Firestore
   Lee public/data/usuarios_roles.json y la sube a la colección usuarios_roles.
   Estructura de documentos:
     - config_roles: definición de roles y reglas de comentarios
     - <nombre_usuario>: datos de cada usuario con permisos de comentario
   ========================================================================== */

'use strict';
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'serviceAccountKey.json');
const DATA_FILE = path.join(ROOT, 'public', 'data', 'usuarios_roles.json');
const COLLECTION = 'usuarios_roles';

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

async function main() {
    console.log('🚀 Subiendo colección usuarios_roles a Firestore...');
    const app = initFirebase();
    const db = getFirestore(app);

    // Borrar colección existente
    await deleteCollection(db, COLLECTION);

    // Leer datos
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const collection = db.collection(COLLECTION);
    let batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 400;
    let subidos = 0;

    // Documento config_roles
    const configRef = collection.doc('config_roles');
    batch.set(configRef, data.config_roles, { merge: true });
    batchCount++;
    subidos++;
    console.log('   📄 Subiendo config_roles...');

    // Documentos de usuarios
    for (const u of data.usuarios) {
        const docRef = collection.doc(u.usuario);
        batch.set(docRef, u, { merge: true });
        batchCount++;
        subidos++;

        if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`   ✅ Lote de ${BATCH_SIZE} enviado (${subidos}/${data.usuarios.length + 1})`);
            batchCount = 0;
            batch = db.batch();
        }
    }

    if (batchCount > 0) {
        await batch.commit();
        console.log(`   ✅ Lote final de ${batchCount} enviado.`);
    }

    console.log('\n========================================');
    console.log('✅ usuarios_roles subida:');
    console.log(`   config_roles: 1 documento`);
    console.log(`   usuarios: ${data.usuarios.length} documentos`);
    console.log(`   Total: ${subidos} documentos, 0 errores`);
    console.log('========================================');
}

main().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});