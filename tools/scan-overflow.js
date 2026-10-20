// tools/scan-overflow.js — barre un rango de anchos y detecta desbordamiento
// horizontal del documento y de la barra superior.
// Uso: node tools/scan-overflow.js [url]
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

const PROBE = `(() => {
  const doc = document.documentElement;
  const bar = document.querySelector('.top-bar');
  const r = bar ? bar.getBoundingClientRect() : null;
  // Elementos que sobresalen del viewport por la derecha
  const overflowing = [...document.querySelectorAll('body *')].filter(el => {
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) return false;
    if (getComputedStyle(el).position === 'fixed') return false;
    return b.right > doc.clientWidth + 1;
  }).slice(0, 8).map(el => {
    const b = el.getBoundingClientRect();
    return { tag: el.tagName, cls: (el.className && el.className.toString().slice(0,40)) || '',
             right: Math.round(b.right), w: Math.round(b.width) };
  });
  return {
    vw: innerWidth,
    docScrollW: doc.scrollWidth,
    clientW: doc.clientWidth,
    docOverflow: doc.scrollWidth - doc.clientWidth,
    barScrollW: bar ? bar.scrollWidth : null,
    barClientW: bar ? bar.clientWidth : null,
    barOverflow: bar ? bar.scrollWidth - bar.clientWidth : null,
    overflowing
  };
})()`;

let WSImpl = null;
async function loadWS() {
  if (WSImpl) return WSImpl;
  try { WSImpl = require('ws'); return WSImpl; } catch (e) {}
  WSImpl = globalThis.WebSocket;
  return WSImpl;
}

async function probe(wsUrl, width) {
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
    expression: `sessionStorage.setItem('forta_session', JSON.stringify({usuario:'admin',nombre:'Administrador',rol:'admin',municipios:null,loginAt:Date.now()}))`
  });
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 2500));
  const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  ws.close();
  return res.result.value;
}

(async () => {
  const targets = await get('/json/list');
  let page = targets.find(t => t.type === 'page');
  if (!page) page = await get('/json/new?about:blank');
  const widths = [];
  for (let w = 320; w <= 1440; w += 20) widths.push(w);
  const bad = [];
  for (const w of widths) {
    const r = await probe(page.webSocketDebuggerUrl, w);
    const overflow = r.docOverflow > 0 || r.barOverflow > 0;
    if (overflow) bad.push({ w, ...r });
    process.stdout.write(overflow ? 'X' : '.');
  }
  console.log('\n--- ANCHOS CON DESBORDAMIENTO ---');
  if (!bad.length) console.log('ninguno');
  for (const b of bad) {
    console.log(`vw=${b.vw} docOverflow=${b.docOverflow} barOverflow=${b.barOverflow} doc=${b.docScrollW}/${b.clientW} bar=${b.barScrollW}/${b.barClientW}`);
    for (const o of b.overflowing) console.log(`    ${o.tag}.${o.cls} right=${o.right} w=${o.w}`);
  }
})();
