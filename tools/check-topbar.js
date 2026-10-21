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
  const q = s => document.querySelector(s);
  const vis = el => { if(!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const bar = q('.top-bar');
  const icons = [...document.querySelectorAll('svg.lucide')].filter(vis);
  const barIcons = [...(bar ? bar.querySelectorAll('svg.lucide') : [])].filter(vis);
  const r = bar ? bar.getBoundingClientRect() : null;
  const btn = q('#menu-toggle');
  const chip = q('#user-chip');
  const title = q('.top-bar h2');
  const chipName = q('#user-chip-name');
  const exitTxt = q('.user-chip__exit span');
  const desc = el => el ? getComputedStyle(el).display : null;
  // SVG renderizados con tamano 0 (indicaria icono sin dimensionar)
  const zeroIcons = [...document.querySelectorAll('svg.lucide')].map(s => {
    const b = s.getBoundingClientRect();
    if (b.width >= 1 && b.height >= 1) return null;
    // Sin cajas renderizadas: el elemento (o un ancestro) esta oculto -> no es un fallo
    if (s.getClientRects().length === 0) return null;
    return { parent: (s.parentElement && s.parentElement.className) || '?',
             w: Math.round(b.width), h: Math.round(b.height) };
  }).filter(Boolean);
  // Badge del contador de filtros
  const badge = q('#menu-badge');
  const badgeCS = badge ? getComputedStyle(badge) : null;
  // Botones interactivos del top-bar: area tactil
  const tapTargets = (bar ? [...bar.querySelectorAll('button,a')] : [])
    .filter(vis)
    .map(b => { const bb = b.getBoundingClientRect();
      return { cls: b.className, w: Math.round(bb.width), h: Math.round(bb.height) }; });
  // Icono de marca (escudo) dentro de .top-bar__left
  const brand = bar ? bar.querySelector('.top-bar__left') : null;
  const brandIcon = brand ? brand.querySelector('svg.lucide, i') : null;
  const brandInfo = brandIcon ? (() => {
    const b = brandIcon.getBoundingClientRect();
    const cs = getComputedStyle(brandIcon);
    return { tag: brandIcon.tagName, w: Math.round(b.width), h: Math.round(b.height),
             display: cs.display, color: cs.color, visible: b.width > 0 && b.height > 0,
             drawn: brandIcon.children.length > 0 };
  })() : null;
  const lucideInfo = (() => {
    try {
      const icons = (typeof lucide !== 'undefined' && lucide.icons) ? lucide.icons : {};
      // Lucide UMD expone los iconos en PascalCase: probamos ambas variantes.
      const pascal = n => n.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      const names = [...new Set([...document.querySelectorAll('[data-lucide]')].map(e => e.getAttribute('data-lucide')))];
      const missing = names.filter(n => !icons[n] && !icons[pascal(n)]);
      // <i data-lucide> sin sustituir = nombre de icono inexistente en la version de Lucide
      const stillIcons = [...document.querySelectorAll('i[data-lucide]')].map(e => e.getAttribute('data-lucide'));
      return { totalNames: names.length, missing, stillIcons };
    } catch (e) { return { error: String(e) }; }
  })();
  return {
    vw: innerWidth,
    docTitle: document.title,
    iconsTotal: icons.length,
    iconsInBar: barIcons.length,
    zeroIcons,
    brandInfo,
    lucideInfo,
    barOverflow: r ? Math.round(r.width - document.documentElement.clientWidth) : null,
    docScrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    btn: btn ? { w: Math.round(btn.getBoundingClientRect().width), h: Math.round(btn.getBoundingClientRect().height), textDisplay: desc(btn.querySelector('span')), hasIcon: !!btn.querySelector('svg.lucide') } : null,
    title: title ? { display: desc(title), w: Math.round(title.getBoundingClientRect().width) } : null,
    chip: chip ? { w: Math.round(chip.getBoundingClientRect().width), nameDisplay: desc(chipName), exitTextDisplay: desc(exitTxt), hasIcon: !!chip.querySelector('svg.lucide') } : null,
    badge: badge ? { text: badge.textContent, display: badgeCS.display, visible: vis(badge) } : null,
    tapTargets,
    inViewport: [...(bar ? bar.children : [])].filter(vis).every(el => el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1)
  };
})()`;

async function cdp(wsUrl, width, height, pageUrl, loginMode) {
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
    let raw = ev.data;
    if (typeof raw !== 'string') raw = String(raw);
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await send('Page.enable');
  const target = pageUrl || URL_BASE;
  // auth.js exige sesión: primero cargamos el origen, fijamos la sesión
  // y luego vamos al panel (si no, redirige a login.html).
  if (!pageUrl) {
    await send('Page.navigate', { url: URL_BASE });
    await new Promise(r => setTimeout(r, 1500));
    await send('Runtime.evaluate', {
      expression: `sessionStorage.setItem('forta_session', JSON.stringify({usuario:'admin',nombre:'Admin',rol:'admin',municipios:null,loginAt:Date.now()}))`
    });
  } else {
    // login.js salta al panel si ya hay sesion: la limpiamos antes de cargar.
    await send('Page.navigate', { url: URL_BASE });
    await new Promise(r => setTimeout(r, 1200));
    await send('Runtime.evaluate', { expression: `sessionStorage.clear()` });
  }
  await send('Page.navigate', { url: target });
  await new Promise(r => setTimeout(r, 3500));
  if (loginMode) {
    const loginRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const icons = [...document.querySelectorAll('svg.lucide')].map(s => {
          const b = s.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height), zero: b.width < 1 || b.height < 1 };
        });
        const card = document.querySelector('.login-card');
        const inputs = [...document.querySelectorAll('.login-input input')].map(i => Math.round(i.getBoundingClientRect().width));
        return {
          icons, iconCount: icons.length, allSized: icons.every(i => !i.zero),
          url: location.href, title: document.title,
          bodyClass: document.body.className,
          cardW: card ? Math.round(card.getBoundingClientRect().width) : null,
          inputWidths: inputs,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          docScrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth
        };
      })()`,
      returnByValue: true
    });
    ws.close();
    return { login: true, ...(loginRes.result && loginRes.result.value ? loginRes.result.value : { raw: JSON.stringify(loginRes) }) };
  }

  const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  // Interaccion: activamos un filtro para forzar el badge y lo comprobamos.
  await send('Runtime.evaluate', {
    expression: `try{
      if (typeof activeFilters !== 'undefined' && typeof updateFilterUI === 'function') {
        activeFilters['municipio'] = new Set(['demo']);
        updateFilterUI();
      }
    } catch(e){}`
  });
  await new Promise(r => setTimeout(r, 800));
  const badgeRes = await send('Runtime.evaluate', {
    expression: `(() => { const b=document.getElementById('menu-badge'); if(!b) return null;
      const r=b.getBoundingClientRect(); const cs=getComputedStyle(b);
      return { text:b.textContent, display:cs.display, w:Math.round(r.width), h:Math.round(r.height),
               visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
               inViewport: r.right <= document.documentElement.clientWidth + 1 }; })()`,
    returnByValue: true
  });

  // Detalle de municipio: se abren las tarjetas para revisar los iconos dinamicos
  const detailRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = [...document.querySelectorAll('.muni-card')];
      if (cards.length) { cards[0].click(); }
      return cards.length;
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 900));
  const dynIcons = await send('Runtime.evaluate', {
    expression: `(() => {
      const out = [];
      const sel = '.loc-toggle svg, .loc-toggle i, .contact-phone svg, .contact-phone i, .muni-card__meta svg, .muni-card__meta i, .tag svg, .tag i';
      document.querySelectorAll(sel).forEach(el => {
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) return;
        out.push({ cls: (el.parentElement && el.parentElement.className) || '?',
                   w: Math.round(b.width), h: Math.round(b.height) });
      });
      return { count: out.length, sample: out.slice(0, 12),
               docScrollW: document.documentElement.scrollWidth,
               clientW: document.documentElement.clientWidth,
               overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    })()`,
    returnByValue: true
  });

  ws.close();
  return { ...res.result.value, badgeAfterFilter: badgeRes.result.value,
           detailCards: detailRes.result.value, dynIcons: dynIcons.result.value };
}

let WSImpl = null;
async function loadWS() {
  if (WSImpl) return WSImpl;
  try { WSImpl = require('ws'); return WSImpl; }
  catch (e) { /* fallback */ }
  // Node 22 trae WebSocket global; no hace falta el paquete 'ws'.
  WSImpl = globalThis.WebSocket;
  return WSImpl;
}

(async () => {
  const targets = await get('/json/list');
  let page = targets.find(t => t.type === 'page');
  if (!page) {
    page = await get('/json/new?about:blank');
  }
  const results = [];
  for (const [w, h, label] of [[1280, 900, 'ESCRITORIO'], [768, 900, 'TABLET'], [360, 780, 'MOVIL 360'], [320, 640, 'MOVIL 320']]) {
    const r = await cdp(page.webSocketDebuggerUrl, w, h);
    results.push({ label, ...r });
  }
  console.log(JSON.stringify(results, null, 2));

  // --- LOGIN: iconos y ausencia de desbordamiento ---
  const loginResults = [];
  for (const [w, h, label] of [[1280, 900, 'LOGIN ESCRITORIO'], [360, 780, 'LOGIN MOVIL']]) {
    const r = await cdp(page.webSocketDebuggerUrl, w, h, URL_BASE.replace('index.html', 'login.html'), true);
    loginResults.push({ label, ...r });
  }
  console.log('--- LOGIN ---');
  console.log(JSON.stringify(loginResults, null, 2));

  // --- CAPTURAS DE PANTALLA (revision visual) ---
  const shots = [];
  for (const [w, h, label, url] of [
    [1280, 900, 'desktop', URL_BASE],
    [360, 780, 'movil-360', URL_BASE],
    [320, 640, 'movil-320', URL_BASE],
    [1280, 900, 'login-desktop', URL_BASE.replace('index.html', 'login.html')],
    [360, 780, 'login-movil', URL_BASE.replace('index.html', 'login.html')]
  ]) {
    const res = await shot(page.webSocketDebuggerUrl, w, h, url, label);
    shots.push({ label, ...res });
  }
  console.log('--- CAPTURAS ---');
  console.log(JSON.stringify(shots, null, 2));

  // --- RESUMEN DE ASERCIONES ---
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  for (const r of results) {
    const mobile = r.vw <= 480;
    add(`[${r.label}] sin overflow de barra`, r.barOverflow === 0, `barOverflow=${r.barOverflow}`);
    add(`[${r.label}] sin overflow de documento`, r.docScrollW <= r.clientW, `${r.docScrollW}/${r.clientW}`);
    add(`[${r.label}] sin iconos sin dimensionar`, r.zeroIcons.length === 0, JSON.stringify(r.zeroIcons));
    add(`[${r.label}] todos los iconos Lucide resueltos`,
        r.lucideInfo.missing.length === 0 && r.lucideInfo.stillIcons.length === 0,
        `missing=${JSON.stringify(r.lucideInfo.missing)} sinSustituir=${JSON.stringify(r.lucideInfo.stillIcons)}`);
    add(`[${r.label}] icono de marca dibujado`,
        r.brandInfo && r.brandInfo.drawn && r.brandInfo.visible,
        JSON.stringify(r.brandInfo));
    add(`[${r.label}] badge visible tras filtrar`,
        r.badgeAfterFilter.visible && r.badgeAfterFilter.inViewport,
        JSON.stringify(r.badgeAfterFilter));
    if (mobile) {
      add(`[${r.label}] areas tactiles >= 44px`,
          r.tapTargets.every(t => t.w >= 44 && t.h >= 44), JSON.stringify(r.tapTargets));
      add(`[${r.label}] titulo visible en movil`,
          r.title.display !== 'none' && r.title.w >= 40,
          `title=${r.title.display} w=${r.title.w}`);
      add(`[${r.label}] boton de filtros solo con icono`,
          r.btn.textDisplay === 'none',
          `btn=${r.btn.textDisplay}`);
    } else {
      add(`[${r.label}] texto e iconos visibles`,
          r.title.display !== 'none' && r.btn.textDisplay !== 'none',
          `title=${r.title.display} btn=${r.btn.textDisplay}`);
    }
  }
  for (const r of loginResults) {
    add(`[${r.label}] login: iconos dimensionados`, r.allSized, JSON.stringify(r.icons));
    add(`[${r.label}] login: sin overflow`, r.overflow === 0, `overflow=${r.overflow}`);
  }
  console.log('--- RESUMEN ---');
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  ${c.detail}`);
  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} comprobaciones superadas`);
  if (failed.length) { console.log('FALLOS:'); failed.forEach(f => console.log('  - ' + f.name + ' ' + f.detail)); }
})();

async function shot(wsUrl, width, height, url, label) {
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
  const isLogin = /login\.html/.test(url);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await send('Page.enable');
  await send('Page.navigate', { url: URL_BASE });
  await new Promise(r => setTimeout(r, 1200));
  // El login redirige al panel si ya hay sesion: hay que limpiarla.
  if (isLogin) {
    await send('Runtime.evaluate', { expression: `sessionStorage.removeItem('forta_session')` });
  } else {
    await send('Runtime.evaluate', {
      expression: `sessionStorage.setItem('forta_session', JSON.stringify({usuario:'admin',nombre:'Administrador',rol:'admin',municipios:null,loginAt:Date.now()}))`
    });
  }
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 3500));
  const cap = await send('Page.captureScreenshot', { format: 'png' });
  ws.close();
  const file = path.join(__dirname, '..', 'tools', `shot-${label}.png`);
  fs.writeFileSync(file, Buffer.from(cap.data, 'base64'));
  return { file, bytes: fs.statSync(file).size };
}
