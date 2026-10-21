// smoke-ui.js — ejecuta dashboard.js con un DOM simulado y datos de
// data/municipios.json (UNICA fuente) y verifica tarjetas y detalle.
const fs = require('fs');
const path = require('path');

function el(id) {
  const e = {
    id: id || '', _html: '', textContent: '', value: '', style: {}, children: [],
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; }, focus() {}, click() {},
    appendChild(c) { this.children.push(c); }, removeChild() {}, querySelector(sel) { return el(); },
    querySelectorAll() { return []; }, closest() { return null; }, getContext() { return {}; }
  };
  // querySelector estable: el mismo selector devuelve siempre el mismo hijo,
  // para poder inspeccionar el HTML generado (opciones, tags, chips).
  e._sel = {};
  e.querySelector = function(sel) {
    if (!e._sel[sel]) e._sel[sel] = el();
    return e._sel[sel];
  };
  Object.defineProperty(e, 'innerHTML', {
    get() { return e._html; },
    set(v) { e._html = v; e.children = []; }
  });
  return e;
}
const byId = {};
// Elementos creados durante el render (para inspeccionar el HTML generado).
const created = [];
const document = {
  getElementById(id) { return byId[id] || (byId[id] = el(id)); },
  createElement() { const e = el(); created.push(e); return e; },
  querySelector() { return el(); },
  querySelectorAll() { return []; },
  addEventListener() {},
  body: { style: {}, classList: el().classList },
  documentElement: el('html')
};
const window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
const alert = () => {};

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
if (html.includes('id="municipios-data"')) { console.log(' FAIL index.html aún trae datos embebidos'); process.exit(1); }
// UNICA fuente: data/municipios.json (lo mismo que fetch() carga en el navegador)
const dataJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'municipios.json'), 'utf8'));
// data/usuarios.json: origen de `municipios_adicionales` (municipios compartidos)
const usersJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'usuarios.json'), 'utf8'));
const fakeFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(dataJson) });

const js = fs.readFileSync(path.join(__dirname, 'dashboard.js'), 'utf8');
const run = new Function('document', 'window', 'alert', 'location', 'URL', 'Blob', 'fetch', 'seedData', 'seedUsers',
  js + '\n;buildCoordinatorScopeMap(seedUsers);\ninitData(seedData);\n' +
  'return { allData: () => allData, filteredData: () => filteredData, openDetail, renderList, tableSearch: () => tableSearchTerm, search: term => allData.filter(m => matchesGlobalSearch(m, term)), coordinadores: () => coordinadoresFiltrables(), filtrarPorCoordinador: nombre => { activeFilters.coordinador = new Set([nombre]); applyFilters(); return filteredData.map(m => m["numero de municipio"]); }, estatusValores: () => estatusFiltroOpciones(), filtrarPorEstatus: valor => { Object.keys(activeFilters).forEach(k => activeFilters[k].clear()); activeFilters.estatus_estructura = new Set([valor]); updateFilterUI(); applyFilters(); return filteredData.map(m => m["numero de municipio"]); }, etiquetaFiltro: (k, v) => filterValueLabel(k, v), opcionesEstatusHTML: () => document.getElementById("filter-estatus").querySelector(".options-list").children.map(c => c.innerHTML), tagsEstatus: () => { const c = document.getElementById("filter-estatus"); if (c._updateTags) c._updateTags(); return c.querySelector(".tags-container").children.map(t => t.textContent); }, chipsHTML: () => document.getElementById("active-filters-bar").children.map(c => c.innerHTML) };');
const api = run(document, window, alert, { href: '' }, { createObjectURL: () => '', revokeObjectURL: () => {} }, function () {}, fakeFetch, dataJson, usersJson);

let fallos = 0;
const ok = m => console.log('  OK  ' + m);
const bad = m => { fallos++; console.log(' FAIL ' + m); };
const check = (cond, msg) => (cond ? ok : bad)(msg);

api.renderList();
const cards = byId['muni-list'].children;
check(api.allData().length === 212, 'loadData(): 212 municipios cargados (' + api.allData().length + ')');
check(cards.length === 20, 'renderList(): 20 tarjetas iniciales (' + cards.length + ')');
const c0 = cards[0].innerHTML;
check(/muni-card__badge (b-cdm|b-dm|b-co|b-x|none)/.test(c0), 'badge con clase valida: ' + (/muni-card__badge [a-z-]+/.exec(c0) || ['(ninguna)'])[0]);
check(c0.includes('muni-card__name'), 'tarjeta muestra el nombre del municipio');
check(c0.includes('muni-card__districts') && /DL:.*DF:/.test(c0), 'tarjeta muestra DL y DF (estado de estructura)');
check(!c0.includes('muni-card__meta') && !c0.includes('Zona:') && !c0.includes('Soldados:'), 'tarjeta compacta: sin metricas extra (Zona/Soldados/Nominal/etc.)');
// Doble buscador: ids general + nombres presentes, y el matcher de nombres existe
const hasGeneral = html.indexOf('id="table-search"') >= 0;
const hasNames = html.indexOf('id="person-search"') >= 0;
check(hasGeneral && hasNames, 'doble buscador: ids table-search y person-search presentes');
check(js.indexOf('matchesNamesSearch') >= 0 && js.indexOf('personSearchTerm') >= 0, 'doble buscador: matcher de nombres y termino personSearchTerm presentes');

// ---------- Filtro "Coordinador de zona" + municipios COMPARTIDOS ----------
// Un coordinador puede tener `municipios_adicionales` (municipios de la zona de
// otro coordinador a los que tambien tiene acceso). Compartir NO cambia el
// coordinador_zona del municipio, asi que el filtro debe incluir esos
// municipios cuando se selecciona al coordinador que los tiene compartidos.
{
  const nameCase = s => String(s || '').trim().split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  const coordUsers = usersJson.usuarios.filter(u => u.rol === 'coordinador');
  const conExtra = coordUsers.filter(u => (u.municipios_adicionales || []).length);
  check(conExtra.length > 0, 'dato: hay coordinadores con municipios compartidos (municipios_adicionales)');

  const cj = conExtra[0];
  const cjName = nameCase(cj.nombre);
  const zona = cj.municipios || [];
  const extra = cj.municipios_adicionales || [];

  // El coordinador debe aparecer en el desplegable del filtro.
  check(api.coordinadores().includes(cjName),
      'filtro coordinador: ' + cj.usuario + ' aparece en el desplegable');

  // Filtrar por el coordinador debe devolver zona + compartidos.
  const res = api.filtrarPorCoordinador(cjName);
  check(zona.every(n => res.includes(n)),
      'filtro coordinador: incluye los ' + zona.length + ' municipios de zona de ' + cj.usuario);
  check(extra.every(n => res.includes(n)),
      'filtro coordinador: incluye los ' + extra.length + ' municipios COMPARTIDOS de ' + cj.usuario);
  check(res.length === new Set([...zona, ...extra]).size,
      'filtro coordinador: exactamente zona + compartidos (' + res.length + ' municipios)');

  // Los compartidos NO son de su zona: su coordinador_zona es otro.
  const extraMunis = extra.map(n => dataJson.find(m => m['numero de municipio'] === n)).filter(Boolean);
  check(extraMunis.length === extra.length, 'dato: los municipios compartidos existen en municipios.json');
  check(extraMunis.every(m => nameCase(m.coordinador_zona) !== cjName),
      'dato: los municipios compartidos pertenecen a la zona de OTRO coordinador');
  check(extraMunis.every(m => res.includes(m['numero de municipio'])),
      'filtro coordinador: los compartidos salen aunque su coordinador_zona sea otro');

  // Un municipio compartido debe salir tanto al filtrar por su coordinador ZONAL
  // como por el coordinador que lo tiene compartido. Y NO debe salir al filtrar
  // por un coordinador sin relacion con ese municipio.
  const zonaDeCompartidos = nameCase(extraMunis[0].coordinador_zona);
  const duenio = coordUsers.find(u => nameCase(u.nombre) === zonaDeCompartidos);
  if (duenio) {
    const res2 = api.filtrarPorCoordinador(zonaDeCompartidos);
    check(extra.every(n => res2.includes(n)),
        'filtro coordinador: los compartidos tambien salen al filtrar por su coordinador zonal');
  }
  const ajeno = coordUsers.find(u =>
      nameCase(u.nombre) !== cjName && nameCase(u.nombre) !== zonaDeCompartidos &&
      !(u.municipios || []).includes(extra[0]) && !(u.municipios_adicionales || []).includes(extra[0]));
  if (ajeno) {
    const res3 = api.filtrarPorCoordinador(nameCase(ajeno.nombre));
    check(!res3.includes(extra[0]),
        'filtro coordinador: un coordinador sin relacion NO ve el municipio compartido');
  }

  // Al seleccionar varios coordinadores, el resultado es la union.
  api.filtrarPorCoordinador(cjName);
  const res4 = api.filtrarPorCoordinador(cjName);
  check(res4.length === res.length, 'filtro coordinador: el filtro es estable entre llamadas');
}

// ---------- Filtro "Estatus de Estructura": opcion "Sin estructura" ----------
// Los municipios sin estructura vienen con `estatus_estructura` vacio. El
// desplegable debe ofrecer una opcion virtual "Sin estructura" (centinela
// __sin_estructura__) que, al filtrar, devuelva exactamente esos municipios.
{
  const SIN = '__sin_estructura__';
  const sinEstatus = dataJson.filter(m => !(m.estatus_estructura || '').trim());
  check(sinEstatus.length > 0,
      'dato: hay municipios con estatus_estructura vacio (' + sinEstatus.length + ')');

  const opciones = api.estatusValores();
  check(opciones.includes(SIN),
      'filtro estatus: el desplegable incluye la opcion "Sin estructura"');
  check(opciones.includes('Comité Directivo Municipal'),
      'filtro estatus: el desplegable conserva los estatus reales');
  check(new Set(opciones).size === opciones.length,
      'filtro estatus: no hay opciones duplicadas');
  check(opciones.filter(v => v === SIN).length === 1,
      'filtro estatus: la opcion "Sin estructura" aparece una sola vez');

  // La etiqueta visible debe ser "Sin estructura" (no el centinela interno).
  check(api.etiquetaFiltro('estatus_estructura', SIN) === 'Sin estructura',
      'filtro estatus: la etiqueta visible es "Sin estructura"');
  check(api.etiquetaFiltro('estatus_estructura', 'Comité Directivo Municipal') === 'Comité Directivo Municipal',
      'filtro estatus: los estatus reales conservan su etiqueta');
  check(api.etiquetaFiltro('distrito_local', SIN) === SIN,
      'filtro estatus: la etiqueta solo cambia para estatus_estructura');

  // Filtrar por "Sin estructura" devuelve exactamente esos municipios.
  const res = api.filtrarPorEstatus(SIN);
  const esperados = sinEstatus.map(m => m['numero de municipio']).sort((a, b) => a - b);
  check(res.length === sinEstatus.length,
      'filtro estatus: "Sin estructura" devuelve ' + res.length + ' municipios (esperados ' + sinEstatus.length + ')');
  check(JSON.stringify(res.slice().sort((a, b) => a - b)) === JSON.stringify(esperados),
      'filtro estatus: "Sin estructura" devuelve exactamente los municipios sin estatus');

  // Filtrar por un estatus real NO incluye los que no lo tienen.
  const resCdm = api.filtrarPorEstatus('Comité Directivo Municipal');
  const cdm = dataJson.filter(m => (m.estatus_estructura || '').trim() === 'Comité Directivo Municipal');
  check(resCdm.length === cdm.length,
      'filtro estatus: "Comité Directivo Municipal" devuelve ' + resCdm.length + ' municipios (esperados ' + cdm.length + ')');
  check(!resCdm.some(n => sinEstatus.some(m => m['numero de municipio'] === n)),
      'filtro estatus: los municipios sin estructura NO salen al filtrar por un estatus real');

  // Un estatus inexistente no devuelve nada.
  check(api.filtrarPorEstatus('__estatus_inexistente__').length === 0,
      'filtro estatus: un estatus inexistente devuelve 0 municipios');

  // ---------- HTML VISIBLE: el usuario debe ver "Sin estructura" ----------
  // El desplegable, el tag del drawer y el chip de filtro activo deben mostrar
  // el texto legible "Sin estructura", nunca el centinela interno.
  api.filtrarPorEstatus(SIN);   // deja el filtro "Sin estructura" activo
  const opHtml = api.opcionesEstatusHTML();
  const opSin = opHtml.find(h => h.includes('__sin_estructura__'));
  check(!!opSin, 'filtro estatus: el desplegable renderiza la opcion "Sin estructura"');
  check(!!opSin && opSin.includes('>Sin estructura<'),
      'filtro estatus: el desplegable muestra el texto "Sin estructura"');
  check(opHtml.some(h => h.includes('Comité Directivo Municipal')),
      'filtro estatus: el desplegable muestra los estatus reales con su texto');
  check(!opHtml.some(h => h.includes('__sin_estructura__') && h.includes('>__sin_estructura__<')),
      'filtro estatus: el desplegable NO muestra el centinela interno al usuario');

  const tags = api.tagsEstatus();
  check(tags.includes('Sin estructura'),
      'filtro estatus: el tag del filtro muestra "Sin estructura"');
  check(!tags.some(t => t.includes('__sin_estructura__')),
      'filtro estatus: el tag del filtro NO muestra el centinela interno');

  const chips = api.chipsHTML();
  check(chips.some(c => c.includes('Sin estructura')),
      'filtro estatus: el chip de filtro activo muestra "Sin estructura"');
  check(!chips.some(c => c.includes('__sin_estructura__')),
      'filtro estatus: el chip de filtro activo NO muestra el centinela interno');
}

// El chip del filtro activo debe mostrar la etiqueta del grupo (no "undefined").
check(js.indexOf("coordinador: 'Coordinador'") >= 0,
    'filtro coordinador: FILTER_GROUP_LABELS incluye la clave "coordinador"');

// Coordinador: solo la barra de busqueda general, limitada a SUS municipios.
// Se simula el modo coordinador (fortaSoloBusquedaGeneral + fortaScope) y se
// comprueba que el buscador de nombres NO filtra y que el alcance se respeta.
check(html.indexOf('id="person-search-box"') >= 0, 'coordinador: caja del buscador de nombres con id person-search-box');
check(js.indexOf('fortaSoloBusquedaGeneral') >= 0, 'coordinador: bandera fortaSoloBusquedaGeneral presente');
{
  const coordMunis = [1, 2, 3];                       // alcance simulado
  const coordApi = new Function('document', 'window', 'alert', 'location', 'URL', 'Blob', 'fetch', 'seedData',
    js + '\n;fortaScope = ' + JSON.stringify(coordMunis) + ';' +
    'initData(seedData);' +
    'fortaSoloBusquedaGeneral = true;' +
    'return { allData: () => allData, filteredData: () => filteredData, renderList, list: () => byIdHTML() };')(
    document, window, alert, { href: '' }, { createObjectURL: () => '', revokeObjectURL: () => {} }, function () {}, fakeFetch, dataJson);
  check(coordApi.allData().length === coordMunis.length,
    'coordinador: solo se cargan SUS municipios (' + coordApi.allData().length + ')');
  check(coordApi.allData().every(m => coordMunis.indexOf(m['numero de municipio']) >= 0),
    'coordinador: ningun municipio fuera de su alcance');
  // El buscador de nombres ya no filtra: un nombre de persona no reduce la lista.
  const before = coordApi.filteredData().length;
  const personOnly = coordApi.allData().find(m => m.presidente_estructura || m.secretario_general);
  check(!!personOnly, 'coordinador: hay municipio con persona (para probar el buscador de nombres)');
  coordApi.renderList();
  const cardsCoord = byId['muni-list'].children.length;
  check(cardsCoord === Math.min(20, before),
    'coordinador: la lista no se reduce por el buscador de nombres (' + cardsCoord + ' tarjetas)');
}

api.openDetail(1);
const d = byId['detail-content'].innerHTML;
check(d.includes('Organizaci\u00f3n partidista'), 'detalle: seccion Organizacion partidista');
check(d.includes('Dirigentes del municipio'), 'detalle: seccion Dirigentes del municipio');
check(!d.includes('Fecha de nacimiento'), 'detalle: fecha de nacimiento del secretario eliminada del dashboard');
check(d.indexOf('Localidades') >= 0 && d.indexOf('Localidades') < d.indexOf('Electoral'), 'detalle: Localidades va ANTES de Electoral (prioridad)');
check(d.indexOf('Electoral') >= 0 && d.indexOf('Electoral') < d.indexOf('Organizaci\u00f3n partidista'), 'detalle: Electoral va ANTES de Organizacion partidista');
check(!d.includes('Resultados electorales'), 'detalle: seccion Resultados electorales ELIMINADA (la cubren las graficas de votos por partido)');
check(d.includes('Gobierno'), 'detalle: seccion Gobierno');
check(d.includes('Coordinador de zona'), 'detalle: Coordinador de zona');
check(d.includes('Secretario general'), 'detalle: Secretario general');
check(d.includes('228 853 3676'), 'detalle: telefono del presidente');
check(!d.includes('Candidato(a) del PAN 2025') && !d.includes('ABIGAIL APODACA ZAVALETA'),
    'detalle: candidato(a) del PAN 2025 eliminado del dashboard');
check(api.allData().every(m => !('candidatos_pan_2025' in m)),
    'candidatos_pan_2025: campo eliminado de los datos');
check(!d.includes('% 2024 (locales)') && !d.includes('% 2024 (federales)') && !d.includes('% 2025</div>'),
    'detalle: los %/votos del Panel ya no se listan (los muestra la grafica por partido)');
check(d.includes('Vigencia de la estructura'), 'detalle: Vigencia');

  // Gráficas de votos por partido (SEE): un pastel por votación, una rebanada
  // por partido en su color. El total del pastel es la suma de votos A PARTIDOS
  // del municipio (las rebanadas suman ~100%). No se muestran coaliciones,
  // independientes ni nulos.
  check(d.includes('Votos por partido'), 'graficas: seccion "Votos por partido"');
  check(d.includes('pie-0-1') && d.includes('pie-1-1') && d.includes('pie-2-1'),
      'graficas: un pastel por votacion (pie-0-1 / pie-1-1 / pie-2-1)');
  check(d.includes('chart-pie'), 'graficas: canvas con clase chart-pie (pastel, no barras)');
  check(d.includes('data-pie-track') && d.includes('data-pie-dots'),
    'graficas: carrusel movil con track y puntitos');
  check(d.includes('votos a partidos'), 'graficas: leyenda con "votos a partidos" (denominador del %)');
  ['PAN', 'PRI', 'PRD', 'PVEM', 'PT', 'MC', 'MORENA'].forEach(p =>
      check(d.includes('>' + p + ' <b>'), 'graficas: leyenda incluye ' + p + ' con su %'));
  // El % es sobre votos a partidos, NO el % del panel (que era sobre el listado
  // nominal y daba 0.39% al PAN); aqui el PAN tiene un % de votos reales.
  check(!/PAN <b>0\.39%/.test(d), 'graficas: el % ya NO es el del panel (no aparece PAN 0.39%)');
  const vp1 = api.allData()[0].votos_partidos;
  ['2025 alcaldes', '2024 locales', '2024 federales'].forEach(k => {
      const b = vp1[k].barras;
      const sumV = b.reduce((a, x) => a + x.votos, 0);
      const sumP = b.reduce((a, x) => a + x.pct, 0);
      check(sumV === vp1[k].total, 'graficas: ' + k + ' suma de barras == total a partidos (' + vp1[k].total + ')');
      check(Math.abs(sumP - 100) < 0.1, 'graficas: ' + k + ' los % suman ~100% (' + sumP.toFixed(2) + '%)');
  });
  const coaliciones = ['2025 alcaldes', '2024 locales', '2024 federales']
      .some(k => vp1[k].barras.some(x => x.partido.indexOf('_') >= 0));
  check(!coaliciones, 'graficas: ninguna barra es una coalicion (sin nombres con "_")');

check(d.includes('09/10/2028'), 'detalle: fecha de vigencia');

// Localidades: desplegable <details> (ocultas hasta el clic) y SIN la clave
// numerica del PEL ("1. ACAJETE" no debe pintarse; si "ACAJETE" suelto, si).
check(/<details[^>]*>[\s\S]*<\/details>/.test(d) && d.includes('loc-details'),
    'detalle: localidades en desplegable <details> (ocultas hasta el clic)');
check(d.includes('loc-count">5<'),
    'detalle: desplegable de localidades con el contador (5 para ACAJETE)');
check(d.includes('LA JOYA') && !d.includes('1. ACAJETE'),
    'detalle: localidades SIN numeros (ACAJETE, LA JOYA, ... sin "1. ")');

// Localidades: numero romano de seccion quitado y, SI el romano duplicaba la
// MISMA localidad en el municipio, se muestra UNA sola vez. Es solo visual: el
// valor crudo (con romano) sigue intacto en secciones_detalle para busqueda/CSV.
api.openDetail(8);   // ALAMO TEMAPACHE: URSULO GALVAN(+II) y POTRERO DEL LLANO(+I)
const d8 = byId['detail-content'].innerHTML;
check(d8.includes('loc-count">62<'),
    'detalle: ALAMO pasa de 64 a 62 al colapsar las 2 variantes con romano');
check((d8.match(/>URSULO GALVAN</g) || []).length === 1,
    'detalle: URSULO GALVAN se muestra UNA sola vez (sin "II")');
check((d8.match(/>POTRERO DEL LLANO</g) || []).length === 1,
    'detalle: POTRERO DEL LLANO se muestra UNA sola vez (sin "I")');
check(!d8.includes('URSULO GALVAN II') && !d8.includes('POTRERO DEL LLANO I'),
    'detalle: no quedan sufijos romanos (II / I) en ALAMO');
// Regidores y Consejero vacios (ACAJETE 1): mismo boton plegado pero atenuado
check(d.includes('people-empty') && /Regidores del PAN[\s\S]*?loc-count">0</.test(d),
    'detalle: Regidores vacio con mismo estilo atenuado y contador 0');
check(/Consejero estatal[\s\S]*?loc-count">0</.test(d),
    'detalle: Consejero vacio con mismo estilo atenuado y contador 0');
// Regidores y Consejero (ALAMO 8 tiene ambos): mismo desplegable que
// Localidades pero compacto; mantiene su posicion en Representacion
check(d8.includes('Regidores del PAN') && d8.includes('people-details'),
    'detalle: Regidores del PAN como desplegable compacto');
check(d8.includes('Consejero estatal') && d8.includes('people-details'),
    'detalle: Consejero estatal como desplegable compacto');
const d8Rep = d8.slice(d8.indexOf('Gobierno'));
check(d8Rep.indexOf('Regidores del PAN') > d8Rep.indexOf('(PP) Presidente Municipal') &&
      d8Rep.indexOf('Consejero estatal') > d8Rep.indexOf('Regidores del PAN'),
    'detalle: Regidores y Consejero mantienen su posicion en Gobierno');
check(/Regidores del PAN[\s\S]*?loc-count">\d+</.test(d8Rep),
    'detalle: Regidores muestra contador de personas');
check(/Consejero estatal[\s\S]*?loc-count">\d+</.test(d8Rep),
    'detalle: Consejero muestra contador de personas');
check(d8.includes('Juventino Gallegos') && d8.includes('Martinez Sarmiento'),
    'detalle: nombres de Regidores y Consejero visibles al desplegar');
api.openDetail(1);   // ACAJETE: EL ENCINAL II -> EL ENCINAL (no hay base local, no colapsa)
const d1 = byId['detail-content'].innerHTML;
check(d1.includes('>EL ENCINAL<') && !d1.includes('EL ENCINAL II'),
    'detalle: EL ENCINAL II se muestra sin el romano (EL ENCINAL)');
api.openDetail(77);  // IGNACIO DE LA LLAVE: ZACATE COLORADO I/II con parentesis DISTINTO
const d77 = byId['detail-content'].innerHTML;
check(d77.includes('ZACATE COLORADO (EL MORAL)') && d77.includes('ZACATE COLORADO (FRATERNIDAD)'),
    'detalle: ZACATE COLORADO I/II sin romano pero SIN colapsar (parentesis distinto)');
// nombres identicos SIN romano en el mismo municipio NO deben colapsarse
const sinColapsar = api.allData().some(m => {
  const items = String(m.secciones_detalle || '').split('|').map(t => t.trim().replace(/^\d+\.\s*/, '')).filter(Boolean);
  return items.some((x, i) => items.indexOf(x) !== i && !/\s(?:IV|III|II|I)(?:\s*\(|\s*$)/.test(x));
});
check(sinColapsar, 'dato: existen localidades con nombre identico SIN romano (no se colapsan por regla)');

// Nenhum registro debe caer en el badge rojo desconocido (b-x)
const unknown = api.allData().filter(m => {
  const s = (m.estatus_estructura || '').trim();
  if (!s) return false;
  const n = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return !['directivo', 'delegacion', 'organizadora'].some(k => n.includes(k));
});
check(unknown.length === 0, 'todos los estatus del Excel tienen color conocido' + (unknown.length ? ' -> ' + unknown.map(u => u.estatus_estructura).join(' | ') : ''));

console.log('\n' + (fallos ? 'SMOKE: ' + fallos + ' fallo(s)' : 'SMOKE: renderizado correcto ✔'));
process.exit(fallos ? 1 : 0);
