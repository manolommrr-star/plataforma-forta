const XLSX = require('xlsx');
const fs = require('fs');
const wb = XLSX.readFile('Panel FORTA 2 13-11-2026.xlsx');
const raw = XLSX.utils.sheet_to_json(wb.Sheets['Panel'], { header: 1, defval: null, raw: true });
const excelData = [];
for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r[4] && !r[5]) continue;
    excelData.push({ num: r[4], mun: String(r[5]||'').trim(), zona: r[0], coord: r[1], prio: r[2],
        loc: r[6] ? String(r[6]).split(' | ').map(s=>s.trim()).filter(Boolean) : [],
        dl: r[7], df: r[8], ln: r[9], sec: r[10], rut: r[11], cas: r[12], te: r[13],
        pdf: r[20], pdl: r[21], ppm: r[22], sin: r[23], tsin: r[24], reg: r[25], treg: r[26],
        mil: r[27], ce: r[28], est: r[30], sol: r[31], ma: r[32], vig: r[33],
        pe: r[36], ge: r[37], tep: r[38], fep: r[39], sg: r[40], gs: r[41], tsg: r[42], fsg: r[43] });
}
console.log('Municipios en Excel:', excelData.length);
const base = JSON.parse(fs.readFileSync('public/data/municipios.json','utf8'));
const vmap = new Map(); base.forEach(m=>{ if(m['numero de municipio']!=null) vmap.set(m['numero de municipio'],m); });
function n(v){ if(v==null||v==='') return null; const x=Number(v); return isNaN(x)?null:x; }
function s(v){ if(v==null) return null; const x=String(v).trim(); return x===''?null:s; }
function ed(serial){ if(serial==null) return null; const n=Number(serial); if(isNaN(n)) return s(serial); const d=new Date(Date.UTC(1899,11,30)+(n-1)*86400000); return d.toISOString().split('T')[0]; }
function ps(s,t){ if(!s) return []; const nom=String(s).split(' | ').map(x=>x.trim()).filter(Boolean); const tel=t?String(t).split(' | ').map(x=>x.trim()).filter(Boolean):[]; return nom.map((x,i)=>({nombre:x,telefono:tel[i]||null})); }
function pr(s,t){ if(!s) return []; const it=String(s).split(' | ').map(x=>x.trim()).filter(Boolean); const tel=t?String(t).split(' | ').map(x=>x.trim()).filter(Boolean):[]; return it.map(item=>{ const m=item.match(/^(R?\d+)\s+(.+)$/); const tr=tel.find(t=>t.startsWith(m?m[1]:'')); let t2=null; if(tr){ const tm=tr.match(/^R?\d+\s*-\s*(.+)$/); t2=tm?tm[1].trim():tr; } return {identificador:m?m[1]:null,nombre:m?m[2]:item,telefono:t2}; }); }

// ========== 1. municipios_info.json (SIN datos de votación) ==========
const info = excelData.map(m=>{
    return { 'numero de municipio':m.num, municipio:m.mun, zona:m.zona, coordinador_zona:m.coord, prioridad:m.prio, localidades:m.loc,
        distrito_local:s(m.dl), distrito_federal:s(m.df), listado_nominal:n(m.ln), secciones:n(m.sec), rutas:n(m.rut), casillas:n(m.cas),
        total_ediles:n(m.te), estatus_estructura:s(m.est), soldados:n(m.sol), meta_afiliados:n(m.ma), vigencia:ed(m.vig), militantes:n(m.mil),
        pp_diputado_federal:s(m.pdf), pp_diputado_local:s(m.pdl), pp_presidente_municipal:s(m.ppm), consejero_estatal:s(m.ce) };
});
fs.writeFileSync('public/data/municipios_info.json',JSON.stringify(info,null,2));
console.log('✅ municipios_info.json:', info.length,'registros (sin datos de votación)');

// ========== 2. municipios_contactos.json ==========
const contactos = excelData.map(m=>({
    'numero de municipio':m.num, municipio:m.mun,
    presidente_estructura: { nombre:s(m.pe), genero:s(m.ge), telefono:s(m.tep) },
    secretario_general: { nombre:s(m.sg), genero:s(m.gs), telefono:s(m.tsg), fecha_nacimiento:ed(m.fsg) },
    sindicos: ps(m.sin,m.tsin),
    regidores: pr(m.reg,m.treg),
}));
fs.writeFileSync('public/data/municipios_contactos.json',JSON.stringify(contactos,null,2));
console.log('✅ municipios_contactos.json:', contactos.length,'registros');

// ========== 3. municipios_votaciones.json (solo datos para gráficas) ==========
const vot = excelData.map(m=>{
    const v=vmap.get(m.num);
    return { 'numero de municipio':m.num, municipio:m.mun, votos_partidos: v?v.votos_partidos:null };
});
fs.writeFileSync('public/data/municipios_votaciones.json',JSON.stringify(vot,null,2));
console.log('✅ municipios_votaciones.json:', vot.length,'registros (solo votos_partidos para gráficas)');

const ts=contactos.reduce((a,m)=>a+m.sindicos.length,0);
const tr=contactos.reduce((a,m)=>a+m.regidores.length,0);
console.log('\n=== RESUMEN ===');
console.log('Total:',info.length,'| Síndicos:',contactos.filter(m=>m.sindicos.length>0).length,'mun /',ts,'total');
console.log('Regidores:',contactos.filter(m=>m.regidores.length>0).length,'mun /',tr,'total');
console.log('Con localidades:',info.filter(m=>m.localidades.length>0).length);
console.log('\nEjemplo info mun 1:',JSON.stringify(info.find(m=>m['numero de municipio']===1),null,2));
console.log('\nEjemplo contacto mun 8:',JSON.stringify(contactos.find(m=>m['numero de municipio']===8),null,2));
console.log('\nEjemplo votaciones mun 1:',JSON.stringify(vot.find(m=>m['numero de municipio']===1),null,2));