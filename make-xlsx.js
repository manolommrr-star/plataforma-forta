'use strict';
/**
 * make-xlsx.js — Generador de usuarios.xlsx para la Plataforma Forta.
 * Invoca el motor de generación en Python (openpyxl) para producir un archivo
 * Excel nativo, estilizado y 100% compatible con Microsoft Excel.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'tools', 'generate_excel.py');
const args = [scriptPath, ...process.argv.slice(2)];

const res = spawnSync('python', args, { stdio: 'inherit' });
if (res.error) {
    console.error('Error al ejecutar el generador de Excel:', res.error);
    process.exit(1);
}
process.exit(res.status ?? 0);
