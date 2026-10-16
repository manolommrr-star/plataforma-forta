// tools/hash-password.js — genera el hash SHA-256 para data/usuarios.json
// Uso: node tools/hash-password.js "MiClave123"
'use strict';
const crypto = require('crypto');
const clave = process.argv[2];
if (!clave) { console.error('Uso: node tools/hash-password.js "MiClave123"'); process.exit(1); }
console.log(crypto.createHash('sha256').update(clave, 'utf8').digest('hex'));
