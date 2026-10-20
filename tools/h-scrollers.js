// tools/h-scrollers.js - lista TODOS los contenedores con scroll horizontal
// real (overflow-x auto/scroll y scrollWidth > clientWidth), con la ficha
// municipal abierta, que es donde el usuario percibe el "scrol hacia los lados".
// Uso: node tools/h-scrollers.js [url]
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
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    const s = getComputedStyle(el);
    if (s.overflowX !== 'auto' && s.overflowX !== 'scroll') return;
    if (el.scrollWidth <= el.clientWidth + 1) return;
    const b = el.getBoundingClientRect();
    out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 34),
               scrollW: el.scrollWidth, clientW: el.clientWidth,
               ov: el.scrollWidth - el.clientWidth,
               w: Math.round(b.width), left: Math.round(b.left) });
  });
  const main = document.querySelector('.main-content');
  const bar = document.querySelector('.top-bar');
  return {
    scrollers: out,
    main: { scrollW: main.scrollWidth, clientW: main.clientWidth, ox: getComputedStyle(main).overflowX },
    bar: { scrollW: bar.scrollWidth, clientW: bar.clientWidth, ox: getComputedStyle(bar).overflowX }
  };
})()`;

async function probe(wsUrl, width, height, openDetail) {
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
  if (openDetail) {
    await send('Runtime.evaluate', {
      expression: `(() => { const c = document.querySelector('.muni-card'); if (c) c.click(); return !!c; })()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 2000));
  }
  const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  ws.close();
  return res.result.value;
}

(async () => {
  const targets = await get('/json/list');
  let page = targets.find(t => t.type === 'page');
  if (!page) page = await get('/json/new?about:blank');
  for (const openDetail of [false, true]) {
    for (const w of [320, 360, 414, 640, 768, 1280]) {
      const r = await probe(page.webSocketDebuggerUrl, w, 900, openDetail);
      console.log('detalle=' + openDetail + ' vw=' + w +
        ' | main ox=' + r.main.ox + ' ' + r.main.scrollW + '/' + r.main.clientW +
        ' | bar ox=' + r.bar.ox + ' ' + r.bar.scrollW + '/' + r.bar.clientW);
      for (const s of r.scrollers) {
        console.log('   SCROLL-X ' + s.tag + '.' + s.cls + ' ov=' + s.ov + ' (' + s.scrollW + '/' + s.clientW + ')');
      }
    }
  }
})();