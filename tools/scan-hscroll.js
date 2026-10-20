// tools/scan-hscroll.js - localiza TODOS los contenedores con scroll
// horizontal real (scrollWidth > clientWidth) y los clasifica por zona
// (barra superior / contenido / ficha municipal), en varios estados:
//   - listado normal
//   - con filtros aplicados
//   - con la ficha municipal abierta
// Uso: node tools/scan-hscroll.js [url]
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
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      out.push({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 34),
        ox: s.overflowX,
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        ov: el.scrollWidth - el.clientWidth,
        top: Math.round(b.top + scrollY),
        inModal: !!el.closest('.modal, .detail-overlay, .detail-modal, [id*=detail]')
      });
    }
  });
  return out;
})()`;

let WSImpl = null;
async function loadWS() {
  if (WSImpl) return WSImpl;
  try { WSImpl = require('ws'); return WSImpl; } catch (e) {}
  WSImpl = globalThis.WebSocket;
  return WSImpl;
}

async function probe(wsUrl, width, state) {
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
  const sess = JSON.stringify({ usuario: 'admin', nombre: 'Secretario de Desarrollo Economico y Fomento Municipal', rol: 'admin', municipios: null, loginAt: Date.now() });
  await send('Runtime.evaluate', {
    expression: 'sessionStorage.setItem("forta_session", JSON.stringify(' + sess + '))'
  });
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 2500));
  if (state === 'filtros' || state === 'detalle') {
    // Activamos el primer filtro del drawer para generar la barra de filtros
    await send('Runtime.evaluate', {
      expression: `(() => {
        const t = document.querySelector('.multi-select__trigger');
        if (t) t.click();
        return true;
      })()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 600));
    await send('Runtime.evaluate', {
      expression: `(() => {
        const o = document.querySelector('.multi-select__option');
        if (o) o.click();
        return true;
      })()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 1200));
  }
  if (state === 'detalle') {
    await send('Runtime.evaluate', {
      expression: `(() => { const c = document.querySelector('.muni-card'); if (c) c.click(); return !!c; })()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 1800));
  }
  const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  ws.close();
  return res.result.value;
}

(async () => {
  const targets = await get('/json/list');
  let page = targets.find(t => t.type === 'page');
  if (!page) page = await get('/json/new?about:blank');
  for (const state of ['listado', 'filtros', 'detalle']) {
    for (const w of [360, 768, 1024]) {
      const rows = await probe(page.webSocketDebuggerUrl, w, state);
      console.log('\n--- estado=' + state + ' vw=' + w + ' (hscroll: ' + rows.length + ') ---');
      rows.forEach(r => {
        console.log('   ' + r.tag + '.' + r.cls.padEnd(30) +
          ' ox=' + r.ox.padEnd(7) +
          ' sw=' + String(r.scrollW).padStart(5) + ' cw=' + String(r.clientW).padStart(5) +
          ' ov=' + String(r.ov).padStart(4) +
          ' top=' + String(r.top).padStart(5) + (r.inModal ? ' [FICHA]' : ''));
      });
    }
  }
})();