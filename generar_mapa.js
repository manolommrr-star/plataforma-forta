const fs = require('fs');
const path = require('path');

// Leer el archivo de municipios locales
const dataPath = path.join(__dirname, 'data', 'municipios.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('Total municipios en archivo local:', data.length);

// Extraer mapa de nombre -> numero de municipio
// Si hay nombres duplicados, mantener el primero (o el que tenga numero valido)
const mapaNumeros = {};
const duplicados = [];

data.forEach((m, index) => {
    const nombre = m.municipio;
    const numero = m['numero de municipio'];
    
    if (!nombre) {
        console.log('⚠️ Municipio sin nombre en índice', index);
        return;
    }
    
    if (numero === undefined || numero === null) {
        console.log('⚠️ Municipio sin número:', nombre, 'en índice', index);
        return;
    }
    
    if (mapaNumeros[nombre] !== undefined) {
        // Nombre duplicado
        if (!duplicados.includes(nombre)) {
            duplicados.push(nombre);
        }
        console.log('⚠️ DUPLICADO:', nombre, 'número anterior:', mapaNumeros[nombre], 'número nuevo:', numero);
    } else {
        mapaNumeros[nombre] = numero;
    }
});

console.log('\n=== RESUMEN ===');
console.log('Total municipios únicos:', Object.keys(mapaNumeros).length);
console.log('Nombres duplicados:', duplicados.length);
if (duplicados.length > 0) {
    console.log('Lista de duplicados:', duplicados.join(', '));
}

// Generar script para consola del navegador
let script = `// Script para agregar campo "numero de municipio" a TODOS los municipios en Firestore
// Ejecutar en la consola del navegador (F12 > Consola) después de hacer login

(async function() {
    const mapaNumeros = ${JSON.stringify(mapaNumeros, null, 4)};

    console.log('🔄 Iniciando actualización de TODOS los municipios en Firestore...');
    
    const snapshot = await window.firebaseFirestore.collection('municipios').get();
    let actualizados = 0;
    let noEncontrados = 0;
    let errores = 0;
    
    for (const doc of snapshot.docs) {
        const d = doc.data();
        if (d.municipio && mapaNumeros[d.municipio] !== undefined) {
            try {
                await doc.ref.update({ 'numero de municipio': mapaNumeros[d.municipio] });
                actualizados++;
            } catch (e) {
                errores++;
                console.error('❌ Error al actualizar', d.municipio, ':', e.message);
            }
        } else {
            noEncontrados++;
            console.log('⚠️ No se encontró número para:', d.municipio);
        }
    }
    
    console.log('\n📊 RESUMEN:');
    console.log('   ✅ Actualizados:', actualizados);
    console.log('   ⚠️ No encontrados en mapa:', noEncontrados);
    console.log('   ❌ Errores:', errores);
    
    if (actualizados > 0) {
        console.log('\n🎉 ¡Municipios actualizados!');
        console.log('   Recarga la página (Ctrl+F5) para ver los cambios.');
    }
})();
`;

const outputPath = path.join(__dirname, 'fix_firebase_municipios.js');
fs.writeFileSync(outputPath, script);
console.log('\n✅ Script generado:', outputPath);
console.log('   Ejecuta este archivo en la consola del navegador (F12 > Consola)');