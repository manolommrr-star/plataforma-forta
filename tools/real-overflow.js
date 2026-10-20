// tools/real-overflow.js - auditoria del desbordamiento horizontal REAL.
// body tiene overflow-x:hidden, que recorta y OCULTA el desbordamiento real.
// Este script:
//   1. anula esa mascara (body/html overflow-x:visible)
//   2. mide el scrollWidth real del documento
//   3. lista cada elemento que se sale del viewport
//   4. repite la medicion con el detalle de municipio abierto
// Uso: node tools/real-overflow.js [url]
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
  const clientW = doc.clientWidth;
  // Quitamos la mascara de overflow-x para ver el desbordamiento real
  const prevBody = document.body.style.overflowX;
  const prevHtml = doc.style.overflowX;
  document.body.style.overflowX = 'visible';
  doc.style.overflowX = 'visible';
  doc.getBoundingClientRect();
  const realScrollW = doc.scrollWidth;
  const realOverflow = realScrollW - clientW;
  const offenders = [];
  if (realOverflow > 0) {
    [...document.querySelectorAll('body *')].forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      if (b.right > clientW + 1) {
        offenders.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 34),
                         w: Math.round(b.width), right: Math.round(b.right),
                         parent: (el.parentElement && el.parentElement.className || '').toString().slice(0, 26) });
      }
    });
  }
  document.body.style.overflowX = prevBody;
  doc.style.overflowX = prevHtml;
  const bar = document.querySelector('.top-bar');
  const main = document.querySelector('.main-content');
  return {
    vw: innerWidth, clientW, realScrollW, realOverflow,
    offenders: offenders.slice(0, 14),
    barScrollW: bar ? bar.scrollWidth : null,
    barClientW: bar ? bar.clientWidth : null,
    mainScrollW: main ? main.scrollWidth : null,
    mainClientW: main ? main.clientWidth : null
  };
})()`;

let WSImpl = null;
async function loadWS() {
  if (WSImpl) return WSImpl;
  try { WSImpl = require('ws'); return WSImpl; } catch (e) {}
  WSImpl = globalThis.WebSocket;
  return WSImpl;
}

async function probe(wsUrl, width, userName, openDetail) {
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
  await new Promise(r => setTimeout(r, 1200));
  const sess = JSON.stringify({ usuario: 'admin', nombre: userName, rol: 'admin', municipios: null, loginAt: Date.now() });
  await send('Runtime.evaluate', {
    expression: 'sessionStorage.setItem("forta_session", JSON.stringify(' + sess + '))'
  });
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 2500));
  if (openDetail) {
    await send('Runtime.evaluate', {
      expression: `(() => { const c = document.querySelector('.muni-card'); if (c) c.click(); return !!c; })()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 1500));
  }
  const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  ws.close();
  return res.result.value;
}

(async () => {
  const targets = await get('/json/list');
  let page = targets.find(t => t.type === 'page');
  if (!page) page = await get('/json/new?about:blank');
  const names = ['Administrador', 'Coordinador General de Fortalecimiento Interno'];
  for (const openDetail of [false, true]) {
    for (const nm of names) {
      console.log('\n===== detalle=' + openDetail + ' usuario="' + nm + '" =====');
      for (const w of [320, 360, 414, 480, 600, 768, 1024, 1280]) {
        const r = await probe(page.webSocketDebuggerUrl, w, nm, openDetail);
        const flag = r.realOverflow > 0 ? 'OVERFLOW' : 'ok      ';
        console.log(flag + ' vw=' + String(r.vw).padStart(4) +
          ' real=' + String(r.realScrollW).padStart(5) + '/' + r.clientW +
          ' ov=' + String(r.realOverflow).padStart(4) +
          ' | bar=' + r.barScrollW + '/' + r.barClientW +
          ' | main=' + r.mainScrollW + '/' + r.mainClientW);
        for (const o of r.offenders) {
          console.log('      > ' + o.tag + '.' + o.cls + ' w=' + o.w + ' right=' + o.right + ' (padre: ' + o.parent + ')');
        }
      }
    }
  }
})();