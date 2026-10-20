// tools/audit-topbar.js - auditoria de desbordamiento horizontal real.
// Mide el scroll horizontal en los tres contenedores que importan:
//   documentElement, .top-bar y .main-content (este ultimo scrollea de verdad,
//   porque overflow-y:auto + overflow-x:visible se computa como overflow-x:auto).
// Uso: node tools/audit-topbar.js [url]
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
  const main = document.querySelector('.main-content');
  const clientW = doc.clientWidth;
  const box = el => el ? {
    scrollW: el.scrollWidth, clientW: el.clientWidth,
    overflow: el.scrollWidth - el.clientWidth,
    ox: getComputedStyle(el).overflowX
  } : null;
  const barKids = bar ? [...bar.children].filter(el => {
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  }).map(el => {
    const b = el.getBoundingClientRect();
    return { cls: (el.className || '').toString().slice(0, 24), w: Math.round(b.width),
             left: Math.round(b.left), right: Math.round(b.right) };
  }) : [];
  // Elementos que desbordan horizontalmente dentro de .main-content
  const mainKids = main ? [...main.children].map(el => {
    const b = el.getBoundingClientRect();
    return { cls: (el.className || '').toString().slice(0, 30), w: Math.round(b.width),
             right: Math.round(b.right), scrollW: el.scrollWidth, clientW: el.clientWidth };
  }) : [];
  // Elementos que se salen del viewport por la derecha (cualquier anidamiento)
  const wide = [...document.querySelectorAll('body *')].filter(el => {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return false;
    if (b.right > clientW + 1) return true;
    // o que tienen contenido mas ancho que su propia caja
    return el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible';
  }).slice(0, 12).map(el => {
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { tag: el.tagName, cls: (el.className || '').toString().slice(0, 30),
             w: Math.round(b.width), right: Math.round(b.right),
             scrollW: el.scrollWidth, clientW: el.clientWidth, ox: s.overflowX };
  });
  return {
    vw: innerWidth, clientW,
    url: location.href,
    hasBar: !!bar, hasMain: !!main,
    mainKids, wide,
    doc: { scrollW: doc.scrollWidth, clientW, overflow: doc.scrollWidth - clientW },
    body: box(document.body),
    bar: box(bar),
    main: box(main),
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
  await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 768 });
  await send('Page.enable');
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 1200));
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
  const names = ['Administrador', 'Coordinador General de Fortalecimiento Interno',
                 'Secretario de Desarrollo Economico y Fomento Municipal'];
  for (const nm of names) {
    console.log('\n===== USUARIO: "' + nm + '" =====');
    for (const w of [320, 360, 414, 768, 1024, 1280]) {
      const r = await probe(page.webSocketDebuggerUrl, w, nm);
      console.log('vw=' + r.vw +
        ' | url=' + (r.url || '').split('/').pop() +
        ' | bar=' + r.hasBar + ' main=' + r.hasMain +
        ' | doc ov=' + r.doc.overflow +
        ' | main ox=' + (r.main ? r.main.ox : '-') + ' ov=' + (r.main ? r.main.overflow : '-') +
        ' | bar ov=' + (r.bar ? r.bar.overflow : '-'));
      for (const k of r.barKids) {
        const over = k.right > r.clientW + 1;
        console.log('    ' + (over ? 'FUERA ' : '      ') + k.cls.padEnd(20) +
          ' w=' + String(k.w).padStart(4) + ' left=' + String(k.left).padStart(5) + ' right=' + String(k.right).padStart(5));
      }
      for (const w of (r.wide || [])) {
        console.log('    WIDE ' + w.tag + '.' + w.cls.padEnd(24) +
          ' w=' + String(w.w).padStart(4) + ' right=' + String(w.right).padStart(5) +
          ' scrollW=' + String(w.scrollW).padStart(4) + ' clientW=' + String(w.clientW).padStart(4) +
          ' ox=' + w.ox);
      }
    }
  }
})();