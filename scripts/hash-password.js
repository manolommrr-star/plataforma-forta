#!/usr/bin/env node
/* ==========================================================================
   hash-password.js — Generar hash SHA-256 de una contraseña
   
   Genera el hash SHA-256 que necesita el campo `password_sha256` de un
   usuario en Firestore. La contraseña en texto plano NUNCA se almacena.
   
   Uso:
     npm run hash-password
     — o bien —
     node scripts/hash-password.js [contraseña]
   ========================================================================== */

'use strict';

const crypto = require('crypto');
const readline = require('readline');

function sha256(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function run(password) {
    if (!password || !password.trim()) {
        console.error('❌ La contraseña no puede estar vacía.');
        process.exit(1);
    }
    const hash = sha256(password.trim());
    console.log('\n✅ Hash generado:');
    console.log('   password_sha256:', hash);
    console.log('\n📋 Copia ese valor en el campo password_sha256 del documento');
    console.log('   del usuario en Firestore (colección "usuarios").\n');
}

const arg = process.argv[2];
if (arg) {
    run(arg);
} else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('🔑 Ingresa la contraseña a hashear: ', (answer) => {
        rl.close();
        run(answer);
    });
}
