// smoke-ui.js — PRUEBA TEMPORAL: ejecuta dashboard.js con un DOM simulado y
// verifica que tarjetas y detalle se rendericen con los datos nuevos.
const fs = require('fs');
const path = require('path');

function el(id) {
  const e = {
    id: id || '', _html: '', textContent: '', value: '', style: {}, children: [],
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    addEventListener() {}, setAttribute() {}, getAttribute() { return null; }, focus() {}, click() {},
    appendChild(c) { this.children.push(c); }, removeChild() {}, querySelector() { return el(); },
    querySelectorAll() { return []; }, closest() { return null; }, getContext() { return {}; }
  };
  Object.defineProperty(e, 'innerHTML', {
    get() { return e._html; },
    set(v) { e._html = v; e.children = []; }
  });
  return e;
}
const byId = {};
const document = {
  getElementById(id) { return byId[id] || (byId[id] = el(id)); },
  createElement() { return el(); },
  querySelector() { return el(); },
  querySelectorAll() { return []; },
  addEventListener() {},
  body: { style: {}, classList: el().classList },
  documentElement: el('html')
};
const window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
const alert = () => {};

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
byId['municipios-data'] = el('municipios-data');
byId['municipios-data'].textContent = html.split('<script type="application/json" id="municipios-data">')[1].split('</script>')[0];

const js = fs.readFileSync(path.join(__dirname, 'dashboard.js'), 'utf8');
const run = new Function('document', 'window', 'alert', 'location', 'URL', 'Blob',
  js + '\n;return { allData: () => allData, filteredData: () => filteredData, openDetail, renderList, tableSearch: () => tableSearchTerm, search: term => allData.filter(m => matchesGlobalSearch(m, term)) };');
const api = run(document, window, alert, { href: '' }, { createObjectURL: () => '', revokeObjectURL: () => {} }, function () {});

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
check(c0.includes('Zona:'), 'tarjeta muestra Zona');
check(c0.includes('Soldados:'), 'tarjeta muestra Soldados');
check(c0.includes('Meta afiliados:'), 'tarjeta muestra Meta afiliados');
check(c0.includes('muni-person'), 'tarjeta muestra Presidente de estructura');

api.openDetail(1);
const d = byId['detail-content'].innerHTML;
check(d.includes('Organizaci\u00f3n partidista'), 'detalle: seccion Organizacion partidista');
check(d.includes('Dirigentes del municipio'), 'detalle: seccion Dirigentes del municipio');
check(d.includes('Resultados electorales'), 'detalle: seccion Resultados electorales');
check(d.includes('Representaci\u00f3n del partido'), 'detalle: seccion Representacion del partido');
check(d.includes('Coordinador de zona'), 'detalle: Coordinador de zona');
check(d.includes('Secretario general'), 'detalle: Secretario general');
check(d.includes('228 853 3676'), 'detalle: telefono del presidente');
check(d.includes('Candidato(a) del PAN 2025') && d.includes('ABIGAIL APODACA ZAVALETA'),
    'detalle: candidato(a) del PAN 2025 (campo nuevo, columna AO)');

// panel 30-09-2026: la columna AO llega en 37 celdas con la marca "**" del autor
check(api.allData().every(m => m.candidatos_pan_2025 && !/^\*|\*\*$/.test(m.candidatos_pan_2025)),
    'candidatos_pan_2025: los 212 nombres sin la marca "**" del Excel');

// la busqueda global recorre todos los campos: debe encontrar por apellido del candidato
const porCandidato = api.search('apodaca zavaleta');
check(porCandidato.length >= 1 &&
      porCandidato.some(m => (m.candidatos_pan_2025 || '').includes('APODACA ZAVALETA')),
    'busqueda global: encuentra el municipio por el nombre del candidato (' +
    porCandidato.length + ')');
check(/% 2024 \(locales\)[\s\S]{0,120}17\.13%/.test(d), 'detalle: % 2024 locales con % real (17.13%)');
check(/% 2025[\s\S]{0,120}0\.39%/.test(d), 'detalle: % 2025 = 0.39% (el 0.3927 del Excel es 0.39%, no 39%)');
check(!/% 2025[\s\S]{0,120}39\.27%/.test(d), 'detalle: % 2025 NO se infla x100 (no aparece 39.27%)');
check(d.includes('Vigencia de la estructura'), 'detalle: Vigencia');
check(d.includes('09/10/2028'), 'detalle: fecha de vigencia');

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
