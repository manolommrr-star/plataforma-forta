// verify.js — Verificación de integridad de la plataforma (Node.js)
// Uso: node verify.js          (después de node build-data.js)
// Comprueba: JSON embebido + data/municipios.json, esquema de 40 campos,
// tipos, fechas, teléfonos, estatus reconocibles, numeración 1-212,
// etiquetas de exportación, balance de CSS/DIVs y sintaxis del JS.

const fs = require('fs');
const path = require('path');

const BASE = __dirname;
let failures = 0;
let warnings = 0;
const ok = (msg) => console.log('  OK  ' + msg);
const warn = (msg) => { warnings++; console.log(' AVISO ' + msg); };
const fail = (msg) => { failures++; console.log(' FAIL ' + msg); };

// ---------- 1. index.html ----------
console.log('\n[1] index.html');
const html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');

const startTag = '<script type="application/json" id="municipios-data">';
const i = html.indexOf(startTag);
const j = html.indexOf('</script>', i);
let embedded = null;
if (i < 0 || j < 0) {
  fail('bloque JSON embebido no encontrado');
} else {
  try {
    embedded = JSON.parse(html.slice(i + startTag.length, j));
    ok('JSON embebido: sintaxis válida');
  } catch (e) {
    fail('JSON embebido: ' + e.message);
  }
  if (embedded) {
    ok('municipios embebidos: ' + embedded.length);
    if (embedded.length !== 212) fail('se esperaban 212 municipios');
    validate(embedded, 'embebido');
  }
}

const css = (html.split('<style>')[1] || '').split('</style>')[0];
const ob = (css.match(/{/g) || []).length;
const cb = (css.match(/}/g) || []).length;
ob === cb ? ok('CSS llaves balanceadas: ' + ob) : fail('CSS llaves desbalanceadas: ' + ob + '/' + cb);

// Badges de estatus: el Excel nuevo trae "Comité Directivo Municipal",
// "Delegación Municipal" y "Comisión Organizadora" (los tres con estilo propio)
['b-cdm', 'b-dm', 'b-co', 'b-x', 'none'].forEach(cls => {
  css.includes('.muni-card__badge.' + cls)
    ? ok('estilo de badge presente: .' + cls)
    : fail('falta el estilo de badge .' + cls);
});

const body = html.split('<body>')[1] || '';
const dv = (body.match(/<div/g) || []).length;
const dc = (body.match(/<\/div>/g) || []).length;
dv === dc ? ok('DIVs balanceados: ' + dv) : fail('DIVs desbalanceados: ' + dv + '/' + dc);

// ---------- 2. data/municipios.json ----------
console.log('\n[2] data/municipios.json');
let fileData = null;
try {
  fileData = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'municipios.json'), 'utf8'));
  ok('sintaxis válida · municipios: ' + fileData.length);
  if (fileData.length !== 212) fail('se esperaban 212 municipios');
  validate(fileData, 'municipios.json');
} catch (e) {
  fail('lectura/parseo: ' + e.message);
}

// ---------- 3. dashboard.js ----------
console.log('\n[3] dashboard.js');
let jsSource = '';
try {
  const js = fs.readFileSync(path.join(BASE, 'dashboard.js'), 'utf8');
  jsSource = js;
  new Function(js);
  ok('sintaxis JS válida');
  if (/\.id\b|['"]id['"]\s*:/.test(js)) fail('referencia residual a la propiedad "id"');
  else ok('sin referencias residuales a "id"');
  if (!js.includes("numero de municipio")) fail('no usa la propiedad "numero de municipio"');
  else ok('usa "numero de municipio"');
  // Helpers nuevos que la interfaz necesita para los campos del Excel nuevo
  ['estatusClass', 'estatusShort', 'pctValue', 'formatPct', 'fieldLabel'].forEach(fn => {
    new RegExp('function\\s+' + fn + '\\s*\\(').test(js)
      ? ok('helper definido: ' + fn + '()')
      : fail('falta el helper ' + fn + '() en dashboard.js');
  });
} catch (e) {
  fail('dashboard.js: ' + e.message);
}

// ---------- 4. Consistencia HTML vs archivo ----------
if (fileData && embedded) {
  console.log('\n[4] Consistencia');
  if (fileData.length === embedded.length) ok('mismo número de municipios en ambos archivos');
  else fail('diferencia de conteo: ' + fileData.length + ' vs ' + embedded.length);
  if (JSON.stringify(fileData) === JSON.stringify(embedded)) ok('contenido idéntico (mismos valores y orden) en ambos archivos');
  else fail('el JSON embebido y data/municipios.json difieren: ejecuta "node build-data.js"');

  // Cada campo del Excel debe tener etiqueta legible para exportar a Excel/CSV
  const labelsBlock = (jsSource.match(/var FIELD_LABELS = \{[\s\S]*?\};/) || [''])[0];
  if (!labelsBlock) fail('no se encontró FIELD_LABELS en dashboard.js');
  else {
    // "votos_partidos" es un dato ESTRUCTURADO (objeto con las barras por
    // partido de cada votacion) que NO se exporta al CSV/Excel, igual que
    // metricas/etiquetas/metadata: no necesita etiqueta en FIELD_LABELS.
    const noExportables = ['metricas', 'etiquetas', 'metadata', 'votos_partidos'];
    const sinEtiqueta = Object.keys(fileData[0])
      .filter(k => noExportables.indexOf(k) < 0 && labelsBlock.indexOf("'" + k + "'") < 0);
    sinEtiqueta.length
      ? fail('campos sin etiqueta para exportar: ' + sinEtiqueta.join(', '))
      : ok('los ' + (Object.keys(fileData[0]).length - noExportables.length) + ' campos del Excel tienen etiqueta legible para exportar');
  }
}

// ---------- Función de validación de esquema ----------
function validate(data, label) {
  const REQUIRED = [
    ['numero de municipio', 'number'],
    ['municipio', 'nonempty-string'],
    ['secciones_detalle', 'string-or-null'],
    ['distrito_local', 'nonempty-string'],
    ['distrito_federal', 'nonempty-string'],
    ['listado_nominal', 'number'],
    ['secciones', 'number'],
    ['casillas', 'number'],
    ['zona', 'number'],
    ['coordinador_zona', 'string-or-null'],
    ['prioridad', 'string-or-null'],
    ['rutas', 'number-or-null'],
    ['total_ediles', 'number'],
    ['votos_2024_locales', 'number'],
    ['pct_2024_locales', 'number'],
    ['votos_2024_federales', 'number'],
    ['pct_2024_federales', 'number'],
    ['votos_2025_alcaldes', 'number-or-null'],
    ['pct_2025', 'number-or-null'],
    ['pp_diputado_federal', 'nonempty-string'],
    ['pp_diputado_local', 'nonempty-string'],
    ['pp_presidente_municipal', 'nonempty-string'],
    ['regidores_pan', 'string-or-null'],
    ['militantes', 'number'],
    ['consejero_estatal', 'string-or-null'],
    ['estatus_estructura', 'string-or-null'],
    ['soldados', 'number'],
    ['meta_afiliados', 'number'],
    ['vigencia', 'date-or-null'],
    ['presidente_estructura', 'string-or-null'],
    ['presidente_genero', 'gender-or-null'],
    ['presidente_telefono', 'string-or-null'],
    ['secretario_general', 'string-or-null'],
    ['secretario_genero', 'gender-or-null'],
    ['secretario_telefono', 'string-or-null'],
    ['secretario_fecha_nacimiento', 'date-or-null'],
    ['metricas', 'object'],
    ['etiquetas', 'array'],
    ['metadata', 'object'],
    ['votos_partidos', 'object']
  ];
  // El Excel ya no trae codigos cortos (CDM/DM/X): trae el nombre completo.
  // Estos son los unicos valores que el dashboard sabe colorear.
  const ESTATUS_CONOCIDOS = [
    'comite directivo municipal',
    'delegacion municipal',
    'comision organizadora'
  ];
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const FECHA_RE = /^\d{2}\/\d{2}\/\d{4}$/;
  const seen = new Set();
  const problems = [];
  const unknownEstatus = {};
  const estatusCount = {};
  const phoneIrregulars = [];
  // todos los registros deben tener exactamente las mismas claves
  const refKeys = JSON.stringify(Object.keys(data[0] || {}).sort());
  data.forEach((m, idx) => {
    const ref = m.municipio || ('registro ' + idx);
    const keys = JSON.stringify(Object.keys(m).sort());
    if (keys !== refKeys) {
      const missing = Object.keys(data[0]).filter(k => !(k in m));
      const extra = Object.keys(m).filter(k => !(k in data[0]));
      problems.push(ref + ': claves distintas' + (missing.length ? ' (falta: ' + missing.join(', ') + ')' : '') + (extra.length ? ' (extra: ' + extra.join(', ') + ')' : ''));
    }
    for (const [key, type] of REQUIRED) {
      if (!(key in m)) { problems.push(ref + ': falta "' + key + '"'); continue; }
      const v = m[key];
      const actual = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
      const typeOk =
        actual === type ||
        (type === 'object' && actual === 'array') ||
        (type === 'number-or-null' && (actual === 'number' || actual === 'null')) ||
        (type === 'string-or-null' && (actual === 'string' || actual === 'null')) ||
        (type === 'date-or-null' && (actual === 'null' || (actual === 'string' && FECHA_RE.test(v)))) ||
        (type === 'gender-or-null' && (actual === 'null' || (actual === 'string' && /^[FM]$/.test(v)))) ||
        (type === 'nonempty-string' && actual === 'string' && String(v).trim() !== '');
      if (!typeOk) problems.push(ref + ': "' + key + '" es ' + actual + ' (esperado ' + type + ')');
    }
    if (m['id'] !== undefined) problems.push(ref + ': aún contiene la propiedad "id"');
    const num = m['numero de municipio'];
    if (typeof num === 'number') {
      if (seen.has(num)) problems.push(ref + ': número ' + num + ' duplicado');
      seen.add(num);
    }
    if (typeof m.municipio === 'string' && !m.municipio.trim()) problems.push('registro ' + idx + ': nombre vacío');
    if (typeof m.listado_nominal === 'number' && m.listado_nominal < 0) problems.push(ref + ': listado_nominal negativo');
    // Los distritos electorales vienen como "12 COATEPEC" / "09 COATEPEC"
    ['distrito_local', 'distrito_federal'].forEach(k => {
      if (typeof m[k] === 'string' && !/^\d{1,2}\s+\S/.test(m[k].trim())) problems.push(ref + ': "' + k + '" sin número de distrito: ' + m[k]);
    });
    // Telefonos: se esperan 10 digitos agrupados 3-3-4. Si el Excel trae otra
    // longitud (9 u 11 digitos) es error de captura: se avisa, no se inventa.
    ['presidente_telefono', 'secretario_telefono'].forEach(k => {
      if (typeof m[k] === 'string' && !/^\d{3} \d{3} \d{4}$/.test(m[k])) {
        phoneIrregulars.push(ref + ' (' + k + '): "' + m[k] + '" tiene ' + String(m[k]).replace(/\D/g, '').length + ' digitos');
      }
    });
    // Porcentajes: en el JSON todos vienen ya en PORCENTAJE REAL (0-100). La
    // unidad de cada numero la decide build-data.js leyendo el formato de la
    // celda en el Excel (celda "0.00%" = fraccion guardada -> x100; celda
    // "General" = el numero ya es %). Por eso 0.39 en el JSON es 0.39%.
    ['pct_2024_locales', 'pct_2024_federales', 'pct_2025'].forEach(k => {
      if (typeof m[k] === 'number' && (m[k] < 0 || m[k] > 100)) problems.push(ref + ': "' + k + '" fuera de rango: ' + m[k]);
    });
    // Estatus: el dashboard solo sabe colorear los valores conocidos
    const est = (m.estatus_estructura || '').trim();
    const etq = est || '(sin estatus)';
    estatusCount[etq] = (estatusCount[etq] || 0) + 1;
    if (est && !ESTATUS_CONOCIDOS.includes(norm(est))) unknownEstatus[est] = (unknownEstatus[est] || 0) + 1;
  });
  ok('[' + label + '] estatus de estructura -> ' + Object.keys(estatusCount).map(k => k + ': ' + estatusCount[k]).join(' · '));
  if (Object.keys(unknownEstatus).length) fail('[' + label + '] estatus sin color asignado en el dashboard: ' + JSON.stringify(unknownEstatus));
  const pctChicos = data.filter(m => typeof m.pct_2025 === 'number' && m.pct_2025 < 1).length;
  ok('[' + label + '] % 2025 en porcentaje real: ' + pctChicos + ' municipios por debajo de 1% (asi lo trae el Excel, sin inflar x100)');
  const faltantes = [];
  for (let n = 1; n <= data.length; n++) if (!seen.has(n)) faltantes.push(n);
  if (faltantes.length) fail('[' + label + '] números de municipio faltantes: ' + faltantes.join(', '));
  else ok('[' + label + '] numeración completa de municipios 1-' + data.length);
  // Los avisos de teléfonos solo se listan una vez (por el archivo de datos)
  if (label === 'municipios.json') {
    phoneIrregulars.forEach(p => warn('teléfono con longitud inesperada, revisar en el Excel: ' + p));
    if (!phoneIrregulars.length) ok('todos los teléfonos tienen 10 digitos (3-3-4)');
  }
  if (problems.length) {
    problems.slice(0, 10).forEach(p => fail('[' + label + '] ' + p));
    if (problems.length > 10) fail('[' + label + '] ... y ' + (problems.length - 10) + ' problemas más');
  } else {
    ok('esquema completo (' + REQUIRED.length + ' campos) y números únicos en [' + label + ']');
  }
}

// ---------- 5. Lógica de mapeo de la interfaz ----------
console.log('\n[5] Lógica de la interfaz (estatus, porcentajes, campos)');
if (!jsSource) {
  fail('no se pudo leer dashboard.js');
} else {
  try {
    const desde = jsSource.indexOf('// Normaliza texto');
    const hasta = jsSource.indexOf('function matchesGlobalSearch');
    if (desde < 0 || hasta < 0) throw new Error('no se localizó el bloque de helpers');
    const ui = new Function(jsSource.slice(desde, hasta) +
      '\nreturn { estatusClass, estatusShort, pctValue, formatPct, fieldLabel };')();

    [
      ['Comité Directivo Municipal', 'b-cdm', 'CDM'],
      ['Delegación Municipal', 'b-dm', 'DM'],
      ['Comisión Organizadora', 'b-co', 'CO'],
      ['', 'none', 'Sin estatus']
    ].forEach(([valor, clase, corto]) => {
      ui.estatusClass(valor) === clase
        ? ok('estatusClass("' + (valor || '(vacío)') + '") = ' + clase)
        : fail('estatusClass("' + (valor || '(vacío)') + '") devolvió ' + ui.estatusClass(valor) + ', se esperaba ' + clase);
      ui.estatusShort(valor) === corto
        ? ok('estatusShort("' + (valor || '(vacío)') + '") = ' + corto)
        : fail('estatusShort("' + (valor || '(vacío)') + '") devolvió ' + ui.estatusShort(valor) + ', se esperaba ' + corto);
    });

    // El JSON ya trae % reales: pctValue() no debe escalar NUNCA (ahi estaba el
    // error que convertia un 0.39% real en 39%).
    ui.pctValue(0.3927) === 0.3927 ? ok('pctValue(0.3927) = 0.3927% (no se multiplica)') : fail('pctValue(0.3927) = ' + ui.pctValue(0.3927));
    ui.pctValue(41.8631) === 41.8631 ? ok('pctValue(41.8631) = 41.8631%') : fail('pctValue(41.8631) = ' + ui.pctValue(41.8631));
    ui.pctValue(null) === null ? ok('pctValue(null) = null') : fail('pctValue(null) = ' + ui.pctValue(null));
    ui.formatPct(null) === '\u2014' ? ok('formatPct(null) = —') : fail('formatPct(null) = ' + ui.formatPct(null));
    ui.formatPct(0.3927) === '0.39%' ? ok('formatPct(0.3927) = 0.39%') : fail('formatPct(0.3927) = ' + ui.formatPct(0.3927));
    ui.formatPct(17.13) === '17.13%' ? ok('formatPct(17.13) = 17.13%') : fail('formatPct(17.13) = ' + ui.formatPct(17.13));

    if (fileData) {
      // Ningún campo del Excel debe quedar invisible: aparece en la tarjeta,
      // en el detalle, o tiene etiqueta para la exportación.
      const zonaUI = jsSource.slice(jsSource.indexOf('function renderList'), jsSource.indexOf('function renderDetailBars'));
      const invisibles = Object.keys(fileData[0])
        .filter(k => ['metricas', 'etiquetas', 'metadata', 'votos_partidos'].indexOf(k) < 0)
        .filter(k => zonaUI.indexOf(k) < 0 && jsSource.slice(0, jsSource.indexOf('function renderList')).indexOf("'" + k + "'") < 0);
      invisibles.length
        ? fail('campos sin uso en la interfaz: ' + invisibles.join(', '))
        : ok('los 34 campos del Excel se muestran en tarjeta, detalle o exportación');
    }
  } catch (e) {
    fail('lógica de la interfaz: ' + e.message);
  }
}

// ---------- Resumen ----------
console.log('\n' + '='.repeat(40));
if (failures === 0) {
  console.log('RESULTADO: TODO CORRECTO ✔' + (warnings ? ' (' + warnings + ' aviso(s) de datos a revisar en el Excel)' : ''));
  process.exit(0);
} else {
  console.log('RESULTADO: ' + failures + ' error(es) ✘' + (warnings ? ' y ' + warnings + ' aviso(s)' : ''));
  process.exit(1);
}
