// tools/measure-bar.js - mide la altura real de la barra y de sus hijos
// para saber que elemento la está estirando.
// Uso: node tools/measure-bar.js [url]
const http = require('http');
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/index.html';
const CDP = 'http://127.0.0.1:9222';

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

const PROBE = `(() => {
  const bar = document.querySelector('.top-bar');
  const cs = getComputedStyle(bar);
  const rows = [...bar.children].map(el => {
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { cls: (el.className || '').toString().slice(0, 28),
             h: Math.round(b.height), w: Math.round(b.width),
             minH: s.minHeight, pad: s.padding, disp: s.display,
             kids: [...el.children].map(k => {
               const kb = k.getBoundingClientRect();
               const ks = getComputedStyle(k);
               return (k.className || k.tagName).toString().slice(0, 20) +
                      ' h=' + Math.round(kb.height) + ' minH=' + ks.minHeight +
                      ' pad=' + ks.padding + ' bd=' + ks.borderWidth;
             }) };
  });
  return { barH: Math.round(bar.getBoundingClientRect().height),
           pad: cs.padding, minH: cs.minHeight, rows };
})()`;

async function probe(wsUrl, width, height) {
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
  const sess = JSON.stringify({ usuario: 'admin', nombre: 'Administrador', rol: 'admin', municipios: null, loginAt: Date.now() });
  await send('Runtime.evaluate', { expression: 'sessionStorage.setItem("forta_session", JSON.stringify(' + sess + '))' });
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 3000));
  const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  ws.close();
  return res.result.value;
}

(async () => {
  const targets = await get('/json/list');
  let page = targets.find(t => t.type === 'page');
  if (!page) page = await get('/json/new?about:blank');
  for (const w of [320, 360, 414, 768, 1280]) {
    const r = await probe(page.webSocketDebuggerUrl, w, 900);
    console.log('vw=' + w + ' barH=' + r.barH + ' pad=' + r.pad + ' minH=' + r.minH);
    for (const x of r.rows) {
      console.log('   ' + x.cls.padEnd(30) + ' h=' + String(x.h).padStart(3) + ' w=' + String(x.w).padStart(4) + ' minH=' + x.minH + ' disp=' + x.disp);
      for (const k of x.kids) console.log('        - ' + k);
    }
  }
})();