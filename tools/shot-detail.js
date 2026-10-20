// tools/shot-detail.js - captura la ficha municipal (detalle) en movil y
// escritorio para revisar el carrusel y la barra superior.
// Uso: node tools/shot-detail.js [url]
const http = require('http');
const path = require('path');
const fs = require('fs');

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

let WSImpl = null;
async function loadWS() {
  if (WSImpl) return WSImpl;
  try { WSImpl = require('ws'); return WSImpl; } catch (e) {}
  WSImpl = globalThis.WebSocket;
  return WSImpl;
}

async function shotDetail(wsUrl, width, height, label, userName) {
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
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await send('Page.enable');
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 1200));
  const sess = JSON.stringify({ usuario: 'admin', nombre: userName, rol: 'admin', municipios: null, loginAt: Date.now() });
  await send('Runtime.evaluate', {
    expression: 'sessionStorage.setItem("forta_session", JSON.stringify(' + sess + '))'
  });
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 3000));
  // Abrimos la primera tarjeta de municipio
  await send('Runtime.evaluate', {
    expression: `(() => { const c = document.querySelector('.muni-card'); if (c) c.click(); return !!c; })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 2000));
  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const pie = document.querySelector('.pie-hero');
      const bar = document.querySelector('.top-bar');
      const chip = document.querySelector('.top-bar__user');
      const h2 = document.querySelector('.top-bar h2');
      return {
        pie: pie ? { scrollW: pie.scrollWidth, clientW: pie.clientWidth, ov: pie.scrollWidth - pie.clientWidth } : null,
        bar: bar ? { scrollW: bar.scrollWidth, clientW: bar.clientWidth, ov: bar.scrollWidth - bar.clientWidth } : null,
        chipW: chip ? Math.round(chip.getBoundingClientRect().width) : null,
        h2W: h2 ? Math.round(h2.getBoundingClientRect().width) : null,
        h2Text: h2 ? h2.textContent : null
      };
    })()`,
    returnByValue: true
  });
  const cap = await send('Page.captureScreenshot', { format: 'png' });
  ws.close();
  const file = path.join(__dirname, '..', 'tools', `shot-detail-${label}.png`);
  fs.writeFileSync(file, Buffer.from(cap.data, 'base64'));
  return { file, info: info.result.value };
}

(async () => {
  const targets = await get('/json/list');
  let page = targets.find(t => t.type === 'page');
  if (!page) page = await get('/json/new?about:blank');
  for (const [w, h, label] of [[360, 780, 'movil-360'], [320, 640, 'movil-320'], [1280, 900, 'desktop']]) {
    const r = await shotDetail(page.webSocketDebuggerUrl, w, h, label, 'Administrador');
    console.log(label + ' -> ' + r.file);
    console.log('   ' + JSON.stringify(r.info));
  }
})();