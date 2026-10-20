// tools/sweep-bar.js - barrido fino de la barra superior.
// Mide, para cada ancho, el ancho de cada pieza de la barra y detecta:
//   - titulo aplastado (h2 con width ~0)
//   - barra que se sale del viewport
// Uso: node tools/sweep-bar.js [url]
const http = require('http');

const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/index.html';
const CDP = 'http://127.0.0.1:9222';

function get(pathname) {
  return new Promise((res, rej) => {
    http.get(CDP + pathname, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

const PROBE = `(() => {
  const doc = document.documentElement;
  const bar = document.querySelector('.top-bar');
  const clientW = doc.clientWidth;
  const W = el => el ? Math.round(el.getBoundingClientRect().width) : null;
  const barKids = bar ? [...bar.children].filter(el => el.getBoundingClientRect().width > 0)
    .map(el => ({ cls: (el.className||'').toString().slice(0,18), w: W(el),
                  right: Math.round(el.getBoundingClientRect().right) })) : [];
  const chip = document.querySelector('.top-bar__user');
  const name = document.getElementById('user-chip-name');
  const h2 = document.querySelector('.top-bar h2');
  return {
    vw: innerWidth, clientW,
    barScrollW: bar ? bar.scrollWidth : null,
    barClientW: bar ? bar.clientWidth : null,
    chipW: W(chip),
    nameW: W(name),
    nameText: name ? name.textContent : null,
    nameVisible: name ? getComputedStyle(name).display !== 'none' : null,
    h2W: W(h2),
    barKids
  };
})()`;

let WSImpl = null;
async function loadWS() {
  if (WSImpl) return WSImpl;
  try { WSImpl = require('ws'); return WSImpl; } catch (e) {}
  WSImpl = globalThis.WebSocket;
  return WSImpl;
}

async function probe(wsUrl, width, userName) {
  const WS = await loadWS();
  const ws = new WS(wsUrl);
  let id = 0; const pending = new Map();
  const send = (method, params) => new Promise(res => {
    const i = ++id; pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', ev => {
    let raw = ev.data; if (typeof raw !== 'string') raw = String(raw);
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  });
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
  await send('Page.enable');
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 900));
  const sess = JSON.stringify({ usuario: 'admin', nombre: userName, rol: 'admin', municipios: null, loginAt: Date.now() });
  await send('Runtime.evaluate', {
    expression: 'sessionStorage.setItem("forta_session", JSON.stringify(' + sess + '))'
  });
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 2200));
  const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  ws.close();
  return res.result.value;
}

(async () => {
  const targets = await get('/json/list');
  let page = targets.find(t => t.type === 'page');
  if (!page) page = await get('/json/new?about:blank');
  const NAMES = [
    ['Admin', 'Administrador'],
    ['Coordinador', 'Coordinador General de Fortalecimiento Interno'],
    ['Secretario', 'Secretario de Desarrollo Economico y Fomento Municipal']
  ];
  const widths = [320, 360, 400, 480, 560, 640, 700, 768, 820, 900, 1000, 1100, 1280, 1440];
  for (const [label, nm] of NAMES) {
    console.log('\n##### ' + label + ': "' + nm + '" #####');
    for (const w of widths) {
      const r = await probe(page.webSocketDebuggerUrl, w, nm);
      const over = r.barScrollW > r.barClientW + 1;
      const crushed = r.h2W !== null && r.h2W < 40;
      console.log(
        (over ? 'OVER ' : '     ') + 'vw=' + String(r.vw).padStart(4) +
        ' bar=' + String(r.barScrollW).padStart(4) + '/' + String(r.barClientW).padStart(4) +
        ' chip=' + String(r.chipW).padStart(3) +
        ' name=' + String(r.nameW).padStart(3) + (r.nameVisible ? ' ' : 'X') +
        ' h2=' + String(r.h2W).padStart(3) + (crushed ? ' <APLASTADO>' : '') +
        '  ' + r.barKids.map(k => k.cls + ':' + k.w).join(' ')
      );
    }
  }
})();