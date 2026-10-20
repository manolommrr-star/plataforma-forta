// tools/measure-topbar.js - mide el ancho real de cada elemento de la barra
// superior y su ancho minimo natural, para saber cuanto margen hay antes del
// desbordamiento horizontal.
// Uso: node tools/measure-topbar.js [url]
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
  const bar = document.querySelector('.top-bar');
  if (!bar) return null;
  const cs = getComputedStyle(bar);
  const kids = [...bar.children].filter(el => {
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  }).map(el => {
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    // Ancho minimo natural: lo que ocuparia si no se le permitiera encogerse
    const clone = el.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.width = 'max-content';
    clone.style.minWidth = '0';
    clone.style.flex = 'none';
    clone.style.visibility = 'hidden';
    document.body.appendChild(clone);
    const natural = clone.getBoundingClientRect().width;
    clone.remove();
    return {
      tag: el.tagName, cls: (el.className || '').toString().slice(0, 32),
      w: Math.round(b.width), natural: Math.round(natural),
      shrink: s.flexShrink, minWidth: s.minWidth, overflow: s.overflow
    };
  });
  const gap = parseFloat(cs.gap) || 0;
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const naturalTotal = kids.reduce((a, k) => a + k.natural, 0) + gap * Math.max(0, kids.length - 1) + padX;
  return {
    vw: innerWidth,
    barW: Math.round(bar.getBoundingClientRect().width),
    barScrollW: bar.scrollWidth, barClientW: bar.clientWidth,
    gap, padX,
    kids,
    naturalTotal: Math.round(naturalTotal),
    holgura: Math.round(bar.clientWidth - naturalTotal)
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
  await send('Runtime.evaluate', {
    expression: `sessionStorage.setItem('forta_session', JSON.stringify({usuario:'admin',nombre:${JSON.stringify(userName)},rol:'administrador',municipios:null,loginAt:Date.now()}))`
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
  const names = ['Administrador', 'Coordinador General de Fortalecimiento Interno'];
  for (const nm of names) {
    console.log(`\n===== USUARIO: "${nm}" =====`);
    for (const w of [320, 360, 414, 768, 1024, 1280]) {
      const r = await probe(page.webSocketDebuggerUrl, w, nm);
      console.log(`vw=${r.vw} bar=${r.barW} natural=${r.naturalTotal} holgura=${r.holgura}px`);
      for (const k of r.kids) {
        console.log(`   ${k.cls.padEnd(22)} w=${String(k.w).padStart(4)} natural=${String(k.natural).padStart(4)} shrink=${k.shrink} minW=${k.minWidth}`);
      }
    }
  }
})();