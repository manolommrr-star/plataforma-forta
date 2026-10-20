// tools/shot-bar.js - captura RECORTADA de la barra superior (clip del
// elemento .top-bar) a escala 2x, para revisar iconos y separaciones.
// Uso: node tools/shot-bar.js [url]
const http = require('http');
const path = require('path');
const fs = require('fs');

const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/index.html';
const CDP = 'http://127.0.0.1:9222';
const NOMBRE = process.argv[3] || 'Administrador';

function get(p) {
  return new Promise((res, rej) => {
    http.get(CDP + p, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

let WSImpl = null;
async function loadWS() {
  if (WSImpl) return WSImpl;
  try { WSImpl = require('ws'); return WSImpl; } catch (e) { /* noop */ }
  WSImpl = globalThis.WebSocket;
  return WSImpl;
}

async function shot(wsUrl, width, height, label) {
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
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 768 });
  await send('Page.enable');
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 1200));
  const sess = JSON.stringify({ usuario: 'admin', nombre: NOMBRE, rol: 'admin', municipios: null, loginAt: Date.now() });
  await send('Runtime.evaluate', { expression: 'sessionStorage.setItem("forta_session", JSON.stringify(' + sess + '))' });
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 3000));
  const box = await send('Runtime.evaluate', {
    expression: `(() => { const b = document.querySelector('.top-bar').getBoundingClientRect();
      return { x: b.left, y: b.top, width: b.width, height: b.height, scale: 1 }; })()`,
    returnByValue: true
  });
  const c = box.result.value;
  const cap = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: c.x, y: c.y, width: c.width, height: c.height, scale: 2 }
  });
  ws.close();
  const file = path.join(__dirname, '..', 'tools', `shot-bar-${label}.png`);
  fs.writeFileSync(file, Buffer.from(cap.data, 'base64'));
  console.log(label + ' -> ' + file + '  (' + Math.round(c.width) + 'x' + Math.round(c.height) + ')');
}

(async () => {
  const targets = await get('/json/list');
  let page = targets.find(t => t.type === 'page');
  if (!page) page = await get('/json/new?about:blank');
  for (const [w, h, label] of [[320, 700, 'movil-320'], [360, 700, 'movil-360'], [768, 700, 'tablet'], [1280, 700, 'escritorio']]) {
    await shot(page.webSocketDebuggerUrl, w, h, label);
  }
})();