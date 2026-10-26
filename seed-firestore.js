/**
 * seed-firestore.js — Carga usuarios y municipios a Firestore
 *
 * Uso:
 *   node seed-firestore.js
 *
 * Requiere:
 *   - firebase-config.js en la misma carpeta
 *   - firebase-init.js en la misma carpeta (para inicializar Firebase)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Cargar configuración de Firebase
const firebaseConfig = require('./firebase-config.js');

// Cargar datos
const municipiosData = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'data', 'municipios.json'),
    'utf8'
));

const usuariosData = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'data', 'usuarios.json'),
    'utf8'
));

async function uploadData() {
    console.log('🚀 Iniciando carga a Firestore...\n');

    // Usar el SDK de Firebase v9 modular
    const { initializeApp } = require('firebase/app');
    const { getFirestore, collection, setDoc, doc, getDocs } = require('firebase/firestore');

    if (!firebaseConfig || typeof firebaseConfig !== 'object') {
        console.error('❌ firebase-config.js no válido. Verifica que los credenciales estén correctos.');
        process.exit(1);
    }

    try {
        // Inicializar Firebase
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        console.log('📦 Cargando municipios...');
        const municipiosCollection = collection(db, 'municipios');

        // Preparar documentos para bulk write
        const muniDocs = municipiosData.map(m => {
            const docId = String(m['numero de municipio']);
            const data = { ...m };
            delete data['numero de municipio']; // Usar numero como ID
            return { id: docId, data };
        });

        const muniWrites = muniDocs.map(({ id, data }) =>
            setDoc(doc(db, 'municipios', id), data)
        );

        // Ejecutar escritura por lotes (Firestore limita a 500 ops por lote)
        const batchSize = 500;
        for (let i = 0; i < muniWrites.length; i += batchSize) {
            const batch = muniWrites.slice(i, i + batchSize);
            await Promise.all(batch);
        }
        console.log(`✅ ${municipiosData.length} municipios subidos a Firestore`);

        console.log('📦 Cargando usuarios...');
        const usuariosCollection = collection(db, 'usuarios');

        const userDocs = usuariosData.usuarios.map(u => {
            const docId = u.usuario;
            const data = { ...u };
            delete data.usuario; // Usar usuario como ID
            return { id: docId, data };
        });

        const userWrites = userDocs.map(({ id, data }) =>
            setDoc(doc(db, 'usuarios', id), data)
        );

        await Promise.all(userWrites);
        console.log(`✅ ${usuariosData.usuarios.length} usuarios subidos a Firestore`);

        console.log('\n🎉 ¡Datos cargados correctamente!');
        console.log('🌐 Probar: npm run serve (servidor HTTP) y abrir el dashboard');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error al cargar datos:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

uploadData();
