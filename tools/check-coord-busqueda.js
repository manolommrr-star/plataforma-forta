// tools/check-coord-busqueda.js — prueba en vivo (CDP) del modo coordinador:
// solo debe verse la barra de busqueda general, acotada a SUS municipios.
// Uso: node tools/check-coord-busqueda.js [http://127.0.0.1:8099/index.html]
const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE = path.join(__dirname, '..');
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/index.html';
const CDP_URL = 'http://127.0.0.1:9222';

let fallos = 0;
const ok = m => console.log('  OK  ' + m);
const bad = m => { fallos++; console.log(' FAIL ' + m); };
const check = (c, m) => (c ? ok : bad)(m);

function get(pathname) {
  return new Promise((res, rej) => {
    http.get(CDP_URL + pathname, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

// Cliente CDP mínimo sobre el WebSocket global de Node 22.
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { res, rej } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('timeout ' + method)); } }, 20000);
    });
  }
  async evaluate(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'error en evaluate');
    return r.result.value;
  }
}

// Nombre de un municipio por su numero (para la prueba de acceso compartido).
const MUNICIPIOS = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'municipios.json'), 'utf8'));
function nombreDe(num) {
  const m = MUNICIPIOS.find(x => x['numero de municipio'] === num);
  return m ? String(m.municipio) : String(num);
}
function esperadoIncluye(lista, esperados) {
  if (!Array.isArray(lista)) return false;
  return esperados.every(n => lista.includes(n));
}

// Usuario coordinador real de data/usuarios.json + su contraseña en claro
// (regla del proyecto: primer_apellido.segundo_apellido, minusculas, sin acentos).
const sinAcentos = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const low = s => sinAcentos(s).toLowerCase().trim();
function credencialesCoordinador() {
  const users = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'usuarios.json'), 'utf8')).usuarios;
  const datos = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'municipios.json'), 'utf8'));
  const porCoord = new Map();
  datos.forEach(m => {
    const c = String(m.coordinador_zona || '').trim();
    if (!c) return;
    if (!porCoord.has(c)) porCoord.set(c, []);
    porCoord.get(c).push(m['numero de municipio']);
  });
  const u = users.find(u => u.rol === 'coordinador' && porCoord.has(u.nombre));
  if (!u) throw new Error('no hay coordinador con datos');
  const t = u.nombre.trim().split(/\s+/);
  return {
    usuario: u.usuario,
    password: low(t[t.length - 2]) + '.' + low(t[t.length - 1]),
    municipios: u.municipios
  };
}


(async () => {
  console.log('\n[1] Login real como coordinador');
  const cred = credencialesCoordinador();
  console.log('  usuario=' + cred.usuario + ' municipios=' + cred.municipios.length);

  const targets = await get('/json/list');
  const page = targets.find(t => t.type === 'page');
  const cdp = await CDP.attach(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const base = URL_BASE.replace(/\/[^/]*$/, '');
  await cdp.send('Page.navigate', { url: base + '/login.html' });
  await new Promise(r => setTimeout(r, 2500));

  const logged = await cdp.evaluate(`(async () => {
    const res = await fetch('data/usuarios.json', { cache: 'no-store' });
    const data = await res.json();
    const found = (data.usuarios || []).find(u => u.usuario === ${JSON.stringify(cred.usuario)});
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(${JSON.stringify(cred.password)}));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (!found || found.password_sha256 !== hash) return { ok: false, motivo: 'credenciales no validan' };
    sessionStorage.setItem('forta_session', JSON.stringify({
      usuario: found.usuario, nombre: found.nombre, rol: found.rol,
      municipios: found.municipios, loginAt: Date.now()
    }));
    return { ok: true, rol: found.rol, n: (found.municipios || []).length };
  })()`);
  check(logged.ok, 'sesion de coordinador iniciada (' + (logged.motivo || cred.usuario + ', rol ' + logged.rol + ')'));
  if (!logged.ok) { console.log('\nCOORD: ' + fallos + ' fallo(s)'); process.exit(1); }

  console.log('\n[2] Panel como coordinador');
  await cdp.send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 3500));

  const ui = await cdp.evaluate(`(() => {
    const q = s => document.querySelector(s);
    const vis = el => { if (!el) return false; const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const box = q('#person-search-box');
    const input = q('#person-search');
    const general = q('#table-search');
    const cards = document.querySelectorAll('#muni-list .muni-card').length;
    const names = [...document.querySelectorAll('#muni-list .muni-card__name')].map(e => e.textContent.trim());
    const subs = q('#subtitle');
    return {
      boxExists: !!box, boxVisible: vis(box),
      inputExists: !!input, inputVisible: vis(input), inputDisabled: input ? input.disabled : null,
      generalExists: !!general, generalVisible: vis(general),
      generalPlaceholder: general ? general.placeholder : null,
      cards, names, subtitle: subs ? subs.textContent : null,
      rolChip: q('#user-chip-rol') ? q('#user-chip-rol').textContent.trim() : null
    };
  })()`);

  check(ui.boxExists, 'existe la caja #person-search-box en el DOM');
  check(!ui.boxVisible, 'coordinador: la caja del buscador de nombres está OCULTA');
  check(!ui.inputVisible, 'coordinador: el input "Municipios o personas" NO es visible');
  check(ui.inputDisabled === true, 'coordinador: el input de nombres queda deshabilitado');
  check(ui.generalVisible, 'coordinador: la barra de BÚSQUEDA GENERAL SÍ es visible');
  check(/mis municipios/i.test(ui.generalPlaceholder || ''),
    'coordinador: placeholder indica el alcance ("' + ui.generalPlaceholder + '")');
  check(ui.rolChip === 'coordinador', 'el chip de rol dice "coordinador" (' + ui.rolChip + ')');


  console.log('\n[3] Alcance: solo SUS municipios');
  const esperados = await cdp.evaluate(`(async () => {
    const s = JSON.parse(sessionStorage.getItem('forta_session') || 'null');
    const res = await fetch('data/municipios.json', { cache: 'no-store' });
    const all = await res.json();
    const perm = {}; (s.municipios || []).forEach(n => perm[n] = true);
    return {
      n: (s.municipios || []).length,
      permitidos: all.filter(m => perm[m['numero de municipio']]).map(m => m.municipio).sort()
    };
  })()`);
  check(esperados.n === cred.municipios.length,
    'el alcance tiene ' + esperados.n + ' municipios (coincide con usuarios.json)');
  check(ui.cards === Math.min(20, esperados.n),
    'se pintan ' + ui.cards + ' tarjetas (esperado ' + Math.min(20, esperados.n) + ')');
  const fuera = ui.names.filter(n => n && !esperados.permitidos.includes(n.toUpperCase()));
  check(fuera.length === 0, 'ninguna tarjeta fuera de su zona' + (fuera.length ? ': ' + fuera.join(', ') : ''));

  console.log('\n[4] La búsqueda general busca dentro de sus municipios');
  const prueba = await cdp.evaluate(`(() => {
    const input = document.querySelector('#table-search');
    input.value = 'gobierno';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const nombres = [...document.querySelectorAll('#muni-list .muni-card__name')].map(e => e.textContent.trim());
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const tras = document.querySelectorAll('#muni-list .muni-card').length;
    return { nombres, tras };
  })()`);
  const fueraBusq = prueba.nombres.filter(n => n && !esperados.permitidos.includes(n.toUpperCase()));
  check(fueraBusq.length === 0, 'la búsqueda general NO devuelve municipios de otras zonas' +
    (fueraBusq.length ? ': ' + fueraBusq.join(', ') : ''));
  check(prueba.tras === Math.min(20, esperados.n), 'al limpiar la búsqueda vuelve la lista completa (' + prueba.tras + ')');

  console.log('\n[5] Control: un admin sigue viendo LAS DOS barras');
  const admin = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'usuarios.json'), 'utf8'))
    .usuarios.find(u => u.rol === 'admin');
  await cdp.send('Page.navigate', { url: base + '/login.html' });
  await new Promise(r => setTimeout(r, 2000));
  const adminLog = await cdp.evaluate(`(() => {
    sessionStorage.setItem('forta_session', JSON.stringify({
      usuario: ${JSON.stringify(admin.usuario)}, nombre: ${JSON.stringify(admin.nombre || admin.usuario)},
      rol: 'admin', municipios: null, loginAt: Date.now()
    }));
    return true;
  })()`);
  await cdp.send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 3500));
  const adminUi = await cdp.evaluate(`(() => {
    const q = s => document.querySelector(s);
    const vis = el => { if (!el) return false; const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    return {
      boxVisible: vis(q('#person-search-box')),
      generalVisible: vis(q('#table-search')),
      cards: document.querySelectorAll('#muni-list .muni-card').length
    };
  })()`);
  check(adminUi.boxVisible, 'admin: el buscador de nombres SIGUE visible');
  check(adminUi.generalVisible, 'admin: la busqueda general sigue visible');
  check(adminUi.cards === 20, 'admin: ve los 212 municipios (20 tarjetas iniciales, ' + adminUi.cards + ')');

  console.log('\n[6] Acceso compartido: login REAL por formulario (ejercita alcanceMunicipios)');
  const usuarios = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'usuarios.json'), 'utf8')).usuarios;
  const compartido = usuarios.find(u => Array.isArray(u.municipios_adicionales) && u.municipios_adicionales.length);
  if (!compartido) {
    console.log('  (sin usuarios con municipios_adicionales; se omite)');
  } else {
    const t = compartido.nombre.trim().split(/\s+/);
    const pass = low(t[t.length - 2]) + '.' + low(t[t.length - 1]);
    await cdp.send('Page.navigate', { url: base + '/login.html' });
    await new Promise(r => setTimeout(r, 2000));
    // Sesion previa -> login.html redirige al panel; se limpia para ver el form.
    await cdp.evaluate('(() => { sessionStorage.clear(); return true; })()');
    await cdp.send('Page.navigate', { url: base + '/login.html' });
    await new Promise(r => setTimeout(r, 2000));
    await cdp.evaluate(`(() => {
      const u = document.getElementById('login-user');
      const p = document.getElementById('login-pass');
      u.value = ${JSON.stringify(compartido.usuario)};
      p.value = ${JSON.stringify(pass)};
      document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      return true;
    })()`);
    await new Promise(r => setTimeout(r, 4000));

    const sesion = await cdp.evaluate(`(() => {
      const s = JSON.parse(sessionStorage.getItem('forta_session') || 'null');
      return s ? { usuario: s.usuario, rol: s.rol, n: (s.municipios || []).length, munis: s.municipios || [] } : null;
    })()`);
    check(sesion && sesion.usuario === compartido.usuario, 'login por formulario OK como ' + compartido.usuario);
    const esperadosAlcance = Array.from(new Set(
      (compartido.municipios || []).concat(compartido.municipios_adicionales)
    )).sort((a, b) => a - b);
    check(sesion && sesion.n === esperadosAlcance.length,
      'la sesion incluye zona + compartidos (' + (sesion ? sesion.n : 0) + ' = ' +
      (compartido.municipios || []).length + ' zona + ' + compartido.municipios_adicionales.length + ' compartidos)');
    check(sesion && esperadoIncluye(sesion.munis, compartido.municipios_adicionales),
      'la sesion contiene los municipios compartidos: ' + compartido.municipios_adicionales.join(', '));

    await cdp.send('Page.navigate', { url: URL_BASE });
    await new Promise(r => setTimeout(r, 3500));
    const vista = await cdp.evaluate(`(() => {
      const q = s => document.querySelector(s);
      const vis = el => { if (!el) return false; const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      const input = q('#table-search');
      const buscar = txt => {
        input.value = txt;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return [...document.querySelectorAll('#muni-list .muni-card__name')].map(e => e.textContent.trim());
      };
      const total = document.querySelectorAll('#muni-list .muni-card').length;
      const res = {};
      ${compartido.municipios_adicionales.map(n => `res[${JSON.stringify(n)}] = buscar(${JSON.stringify(nombreDe(n))});`).join('\n      ')}
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        total, res,
        boxVisible: vis(q('#person-search-box')),
        generalVisible: vis(q('#table-search'))
      };
    })()`);
    check(vista.boxVisible === false, 'compartido: sigue oculto el buscador de nombres');
    check(vista.generalVisible === true, 'compartido: la busqueda general sigue visible');
    // Cada municipio compartido debe poder buscarse y aparecer.
    let todosVisibles = true, faltan = [];
    for (const n of compartido.municipios_adicionales) {
      const nombres = vista.res[String(n)] || [];
      const esperado = nombreDe(n);
      if (!nombres.some(x => x.toUpperCase() === esperado.toUpperCase())) { todosVisibles = false; faltan.push(esperado); }
    }
    check(todosVisibles, 'Carlos Mejia ve sus 5 municipios compartidos en la busqueda' +
      (faltan.length ? ' FALTAN: ' + faltan.join(', ') : ''));
  }

  console.log('\n' + (fallos ? 'COORD: ' + fallos + ' fallo(s) ✘' : 'COORD: modo coordinador correcto ✔'));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
