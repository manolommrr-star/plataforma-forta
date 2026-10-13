/* ==========================================================================
   Dashboard.js — Panel de Fortalecimiento Interno
   Todas las funciones interactivas del dashboard.
   Los datos vienen embebidos en el HTML como <script type="application/json">.
   ========================================================================== */

let allData = [];
let filteredData = [];
let charts = {};
const activeFilters = {
    distrito_local: new Set(),
    distrito_federal: new Set(),
    estatus_estructura: new Set()
};

// Establece texto en el banner de contadores solo si existe (puede no estar en el DOM)
function setSubtitle(text) {
    var el = document.getElementById('subtitle');
    if (el) el.textContent = text;
}

// Cargar datos desde el script JSON embebido en el HTML
function loadData() {
    const dataEl = document.getElementById('municipios-data');
    if (!dataEl) {
        setSubtitle('ERROR: No se encontraron datos.');
        return;
    }
    try {
        allData = JSON.parse(dataEl.textContent);

        // Inicializar secciones extensibles
        allData.forEach(m => {
            if (!m.metricas) m.metricas = {};
            if (!m.etiquetas) m.etiquetas = [];
            if (!m.metadata) m.metadata = {};
        });

        setSubtitle(allData.length + ' municipios cargados · Panel de Fortalecimiento Interno');
        initFilters();
        applyFilters();
    } catch(err) {
        console.error('Error parseando datos:', err);
        setSubtitle('ERROR cargando datos.');
    }
}


// Inicializar filtros (poblar dropdowns)
function initFilters() {
    populateMultiSelect('filter-distrito-local',
        Array.from(new Set(allData.map(m => m.distrito_local))).filter(v => v).sort(),
        'distrito_local');
        populateMultiSelect('filter-distrito-federal',
        Array.from(new Set(allData.map(m => m.distrito_federal))).filter(v => v).sort(),
        'distrito_federal');
        populateMultiSelect('filter-estatus',
        Array.from(new Set(allData.map(m => m.estatus_estructura))).filter(v => v).sort(),
        'estatus_estructura');
}

function populateMultiSelect(containerId, options, filterKey) {
    var container = document.getElementById(containerId);
    var optionsList = container.querySelector('.options-list');
    var tagsContainer = container.querySelector('.tags-container');
    var trigger = container.querySelector('.multi-select__trigger');
    var countSpan = container.querySelector('.selected-count');
    var placeholder = container.querySelector('.placeholder');
    var searchBox = container.querySelector('.option-search');

    optionsList.innerHTML = '';
    options.forEach(function(opt) {
        var div = document.createElement('div');
        div.className = 'multi-select__option';
        div.innerHTML = '<input type="checkbox" value="' + opt + '" data-filter="' + filterKey + '"><span>' + opt + '</span>';
        div.querySelector('input').addEventListener('change', onFilterChange);
        optionsList.appendChild(div);
    });

    container.querySelector('.multi-select__options').addEventListener('click', function(e) {
        e.stopPropagation();
    });

        trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        container.querySelector('.multi-select__options').classList.toggle('show');
    });
    if (searchBox) {
        searchBox.addEventListener('input', function(e) {
            var term = normText(e.target.value);
            container.querySelectorAll('.multi-select__option').forEach(function(opt) {
                opt.style.display = normText(opt.textContent).includes(term) ? '' : 'none';
            });
        });
    }
    document.addEventListener('click', function(e) {
        if (!container.contains(e.target) && !container.querySelector('.multi-select__options').classList.contains('show')) {
            return;
        }
        if (!container.contains(e.target)) {
            container.querySelector('.multi-select__options').classList.remove('show');
        }
    });
    container._filterKey = filterKey;
    container._updateTags = function() {
        var selected = activeFilters[filterKey];
        tagsContainer.innerHTML = '';
        selected.forEach(function(val) {
            var tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = val;
            tag.addEventListener('click', function(e) {
                e.stopPropagation();
                activeFilters[filterKey].delete(val);
                updateFilterUI();
                applyFilters();
            });
            tagsContainer.appendChild(tag);
        });
        var checkboxes = container.querySelectorAll('.options-list input[type="checkbox"]');
        checkboxes.forEach(function(cb) { cb.checked = selected.has(cb.value); });
        countSpan.textContent = selected.size;
        placeholder.textContent = selected.size ? selected.size + ' seleccionados' : 'Seleccionar...';
    };
}


// Actualizar UI de todos los filtros (tags del drawer + chips + badge)
var FILTER_GROUP_LABELS = {
    distrito_local: 'D. Local',
    distrito_federal: 'D. Federal',
    estatus_estructura: 'Estatus'
};

function renderActiveFilterChips() {
    var bar = document.getElementById('active-filters-bar');
    if (!bar) return;
    bar.innerHTML = '';
    var total = 0;
    Object.keys(activeFilters).forEach(function(key) {
        var values = activeFilters[key];
        values.forEach(function(val) {
            total++;
            var chip = document.createElement('span');
            chip.className = 'af-chip';
            chip.innerHTML = '<span class="af-group">' + FILTER_GROUP_LABELS[key] + ':</span>' + escapeHtml(val) + '<span class="af-x">×</span>';
            chip.title = 'Quitar filtro';
            chip.addEventListener('click', function() {
                activeFilters[key].delete(val);
                updateFilterUI();
                applyFilters();
            });
            bar.appendChild(chip);
        });
    });
    var badge = document.getElementById('menu-badge');
    if (badge) {
        badge.textContent = total;
        badge.classList.toggle('show', total > 0);
    }
}

function updateFilterUI() {
    document.querySelectorAll('.multi-select').forEach(function(container) {
        if (container._updateTags) container._updateTags();
    });
    var total = Object.keys(activeFilters).reduce(function(sum, k) { return sum + activeFilters[k].size; }, 0);
    document.getElementById('clear-all-filters').style.display = total > 0 ? 'flex' : 'none';
    renderActiveFilterChips();
}

// Cambio en checkbox de filtro
function onFilterChange(e) {
    var cb = e.target;
    var key = cb.getAttribute('data-filter');
    var val = cb.value;
    if (cb.checked) { activeFilters[key].add(val); }
    else { activeFilters[key].delete(val); }
    updateFilterUI();
    applyFilters();
}

// Limpiar todos los filtros
document.getElementById('clear-all-filters').addEventListener('click', function() {
    Object.keys(activeFilters).forEach(function(k) { activeFilters[k].clear(); });
    document.querySelectorAll('.multi-select__options').forEach(function(o) { o.classList.remove('show'); });
    updateFilterUI();
    applyFilters();
});

// Aplicar filtros a los datos
function applyFilters() {
    filteredData = allData.filter(function(m) {
        if (activeFilters.distrito_local.size > 0 && !activeFilters.distrito_local.has(m.distrito_local)) return false;
        if (activeFilters.distrito_federal.size > 0 && !activeFilters.distrito_federal.has(m.distrito_federal)) return false;
        if (activeFilters.estatus_estructura.size > 0 && !activeFilters.estatus_estructura.has(m.estatus_estructura)) return false;
        return true;
    });
    // Orden alfabetico por nombre de municipio
    filteredData.sort(function(a, b) {
        return (a.municipio || '').localeCompare(b.municipio || '', 'es', { sensitivity: 'base' });
    });
        visibleCount = 20;
    renderList();
}


    // ===== DETAIL VIEW =====
function getTableKeys() {
    if (filteredData.length === 0) return [];
    return Object.keys(filteredData[0]).filter(function(k) {
        return ['metricas', 'etiquetas', 'metadata', 'votos_partidos'].indexOf(k) === -1;
    });
}

var tableSearchTerm = '';
var visibleCount = 20;

// Normaliza texto: minúsculas + sin acentos (búsqueda tolerante)
function normText(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ===== MAPEOS Y FORMATOS =====
// ESTATUS DE ESTRUCTURA: el Excel nuevo trae el nombre completo
// ("Comité Directivo Municipal", "Delegación Municipal", "Comisión Organizadora").
// Se clasifica por palabra clave para no depender del acento ni del orden.
var ESTATUS_COLORES = [
    ['directivo',    'b-cdm'],   // Comité Directivo Municipal  (verde)
    ['delegacion',   'b-dm'],    // Delegación Municipal        (naranja)
    ['organizadora', 'b-co']     // Comisión Organizadora       (azul)
];
function estatusClass(v) {
    var s = normText(v || '');
    if (!s) return 'none';
    for (var i = 0; i < ESTATUS_COLORES.length; i++) {
        if (s.indexOf(ESTATUS_COLORES[i][0]) >= 0) return ESTATUS_COLORES[i][1];
    }
    return 'b-x';
}
// Clave corta para la tarjeta (el nombre completo va en el titulo y el detalle)
var ESTATUS_CORTO = [
    ['directivo',    'CDM'],
    ['delegacion',   'DM'],
    ['organizadora', 'CO']
];
function estatusShort(v) {
    var s = normText(v || '');
    if (!s) return 'Sin estatus';
    for (var i = 0; i < ESTATUS_CORTO.length; i++) {
        if (s.indexOf(ESTATUS_CORTO[i][0]) >= 0) return ESTATUS_CORTO[i][1];
    }
    return String(v).trim();
}

// En data/municipios.json los porcentajes ya vienen SIEMPRE en porcentaje real
// (0-100): build-data.js decide la unidad de cada numero leyendo el formato de la
// celda en el Excel, asi que aqui no hay que escalar nada. Ojo: un 0.39 guardado
// en el JSON es 0.39%, no 39%.
function pctValue(v) {
    var n = Number(v);
    if (v === null || v === undefined || v === '' || !isFinite(n)) return null;
    return n;
}
function formatPct(v) {
    var p = pctValue(v);
    if (p === null) return '\u2014';
    return (Math.round(p * 100) / 100).toLocaleString('es-MX') + '%';
}

// Etiquetas legibles para la exportación y para el bloque "Otros datos"
var FIELD_LABELS = {
    'numero de municipio': 'N.º de municipio',
    'zona': 'Zona',
    'coordinador_zona': 'Coordinador de zona',
    'prioridad': 'Prioridad',
    'municipio': 'Municipio',
    'secciones_detalle': 'Secciones (detalle)',
    'distrito_local': 'Distrito local',
    'distrito_federal': 'Distrito federal',
    'listado_nominal': 'Listado nominal',
    'secciones': 'Secciones',
    'rutas': 'Rutas',
    'casillas': 'Casillas',
    'total_ediles': 'Total de ediles',
    'votos_2024_locales': 'Votos 2024 (locales)',
    'pct_2024_locales': '% 2024 (locales)',
    'votos_2024_federales': 'Votos 2024 (federales)',
    'pct_2024_federales': '% 2024 (federales)',
    'votos_2025_alcaldes': 'Votos 2025 (alcaldes)',
    'pct_2025': '% 2025',
    'pp_diputado_federal': '(PP) Diputado federal',
    'pp_diputado_local': '(PP) Diputado local',
    'pp_presidente_municipal': '(PP) Presidente municipal',
    'regidores_pan': 'Regidores del PAN',
    'militantes': 'Militantes',
    'consejero_estatal': 'Consejero estatal',
    'estatus_estructura': 'Estatus de estructura',
    'soldados': 'Soldados',
    'meta_afiliados': 'Meta afiliados',
    'vigencia': 'Vigencia',
    'presidente_estructura': 'Presidente de estructura',
    'presidente_genero': 'Género presidente',
    'presidente_telefono': 'Teléfono presidente',
    'secretario_general': 'Secretario general',
    'secretario_genero': 'Género secretario',
    'secretario_telefono': 'Teléfono secretario',
    'secretario_fecha_nacimiento': 'Fecha nacimiento secretario',
    'candidatos_pan_2025': 'Candidato(a) del PAN 2025'
};
function fieldLabel(k) { return FIELD_LABELS[k] || k; }


// Busqueda global: revisa TODOS los campos de cada municipio (incluye metricas,
// etiquetas y metadata) sin importar el nivel de anidacion.
// - Tolera acentos y mayúsculas ("panuco" encuentra "PÁNUCO")
// - Varios términos separados por espacio: TODOS deben coincadir
//   en algún campo ("01 panuco" o "vitas tlanepantla")
// - Números en varios formatos: 10728, "10,728", 14.8926 o "14,89"
function matchesGlobalSearch(m, term) {
    if (!term) return true;
    var tokens = normText(term).split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;

    function numberMatches(v, token) {
        var s = String(v);
        if (s.includes(token)) return true;
        if (v.toLocaleString('es-MX').toLowerCase().includes(token)) return true;
        if (token.indexOf(',') >= 0) {
            // formato mexicano: "10,728" (miles) o "14,89" (decimal)
            if (s.includes(token.replace(/,/g, ''))) return true;      // 10728
            if (s.includes(token.replace(',', '.'))) return true;      // 14.8926
        }
        return false;
    }

    function valueMatches(v, token) {
        if (v === null || v === undefined) return false;
        if (typeof v === 'number') return numberMatches(v, token);
        if (typeof v === 'string') return normText(v).includes(token);
        if (Array.isArray(v)) return v.some(function(x) { return valueMatches(x, token); });
        if (typeof v === 'object') return Object.keys(v).some(function(k) {
            return normText(k).includes(token) || valueMatches(v[k], token);
        });
        return false;
    }

    return tokens.every(function(token) { return valueMatches(m, token); });
}

function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatNum(v) {
    return (typeof v === 'number') ? v.toLocaleString('es-MX') : '\u2014';
}

function renderList() {
    var listEl = document.getElementById('muni-list');
    var loadBtn = document.getElementById('load-more-btn');
    listEl.innerHTML = '';
    var data = filteredData.filter(function(m) { return matchesGlobalSearch(m, tableSearchTerm); });

    if (data.length === 0) {
        listEl.innerHTML = '<div class="list-empty">No se encontraron municipios con los criterios seleccionados.</div>';
        loadBtn.style.display = 'none';
    } else {
        data.slice(0, visibleCount).forEach(function(m) {
            var est = (m.estatus_estructura || '').trim();
            var card = document.createElement('div');
            card.className = 'muni-card';
            card.innerHTML =
                '<div class="muni-card__head">' +
                    '<span class="muni-card__name">' + escapeHtml(m.municipio || 'Sin nombre') + '</span>' +
                    '<span class="muni-card__badge ' + estatusClass(est) + '" title="' + escapeHtml(est || 'Sin estatus de estructura') + '">' + escapeHtml(estatusShort(est)) + '</span>' +
                '</div>' +
                '<div class="muni-card__meta">' +
                    '<span><i data-lucide="users"></i> Nominal: <b>' + formatNum(m.listado_nominal) + '</b></span>' +
                    '<span><i data-lucide="layers"></i> Secciones: <b>' + formatNum(m.secciones) + '</b></span>' +
                    '<span><i data-lucide="home"></i> Casillas: <b>' + formatNum(m.casillas) + '</b></span>' +
                    '<span><i data-lucide="route"></i> Rutas: <b>' + (m.rutas != null ? formatNum(m.rutas) : '—') + '</b></span>' +
                '</div>' +
                '<div class="muni-card__meta muni-card__meta--extra">' +
                    '<span><i data-lucide="map"></i> Zona: <b>' + (m.zona != null ? m.zona : '—') + '</b></span>' +
                    '<span><i data-lucide="shield"></i> Soldados: <b>' + formatNum(m.soldados) + '</b></span>' +
                    '<span><i data-lucide="target"></i> Meta afiliados: <b>' + formatNum(m.meta_afiliados) + '</b></span>' +
                    '<span class="muni-person" title="' + escapeHtml(m.presidente_estructura || 'Sin presidente de estructura') + '"><i data-lucide="user-round"></i> ' + escapeHtml(m.presidente_estructura || 'Sin presidente') + '</span>' +
                '</div>' +
                '<div class="muni-card__districts">DL: <em>' + escapeHtml(m.distrito_local || '\u2014') + '</em> &nbsp;·&nbsp; DF: <em>' + escapeHtml(m.distrito_federal || '\u2014') + '</em></div>';
            card.addEventListener('click', function() { openDetail(m['numero de municipio']); });
            listEl.appendChild(card);
        });

        if (data.length > visibleCount) {
            loadBtn.style.display = 'inline-flex';
            loadBtn.innerHTML = '<i data-lucide="chevrons-down" style="width:14px;height:14px;"></i> Mostrar más (' + (data.length - visibleCount) + ' restantes)';
        } else {
            loadBtn.style.display = 'none';
        }
    }
    var countLabel = document.getElementById('subtitle');
    if (countLabel) {
        setSubtitle(data.length + ' municipios' + (tableSearchTerm ? ' (búsqueda: "' + tableSearchTerm + '")' : '') + ' · ' + allData.length + ' totales');
    }
    try { if (lucide && typeof lucide.createIcons === 'function') { lucide.createIcons(); } } catch(e) {}
}


// ===== VISTA DE DETALLE =====
function detailItem(label, value, cls, full) {
    var display = (value === null || value === undefined || value === '') ? '\u2014' : value;
    return '<div class="detail-item' + (full ? ' full' : '') + '">' +
        '<div class="dt-label">' + label + '</div>' +
        '<div class="dt-value ' + (cls || '') + '">' + escapeHtml(display) + '</div>' +
    '</div>';
}

// Lista de localidades del municipio como DESPLEGABLE: queda OCULTA hasta que
// el usuario hace clic (si no, la lista larga alargaba el detalle). Al pintar:
//   - se quita la clave numerica del PEL ("1. ACAJETE" -> "ACAJETE");
//   - se quita el numero romano final de seccion (I, II, III, IV) cuando va
//     suelto ("URSULO GALVAN II" -> "URSULO GALVAN"), respetando el parentesis
//     ("ZACATE COLORADO II (FRATERNIDAD)" -> "ZACATE COLORADO (FRATERNIDAD)");
//   - si el romano hacia que la MISMA localidad apareciera dos veces en el
//     municipio (base + variante), se muestra UNA sola vez (ALAMO TEMAPACHE:
//     URSULO GALVAN / URSULO GALVAN II -> un URSULO GALVAN).
// NO se colapsan nombres identicos SIN romano: son localidades distintas y se
// muestran todas. El valor original (con clave y romano) sigue intacto en
// secciones_detalle para la busqueda/exportacion; aqui solo se pinta distinto.
// Se usa <details>/<summary> nativo: se despliega al dar clic sin JS.
function detailLocalidades(detalle, enHero) {
    var raw = String(detalle || '').trim();
    if (!raw) return detailItem('Localidades', '', 'dim', true);
    var items = raw.split('|').map(function(t) {
        return t.trim().replace(/^\d+\.\s*/, '');   // quita la clave inicial
    }).filter(Boolean);
    // quita UN numero romano final suelto (respeta parentesis y fin de cadena)
    var limpios = items.map(function(n) {
        return n.replace(/\s+(?:IV|III|II|I)(?=\s*(?:\(|$))/, '').trim();
    });
    // un nombre colapsa si alguna de sus entradas perdio el romano (existe la
    // base Y la variante en este municipio); esas se muestran una sola vez.
    var col = {};
    limpios.forEach(function(l, i) { if (items[i] !== l) col[l] = true; });
    var vistos = {};
    var nombres = [];
    limpios.forEach(function(l) {
        if (col[l]) { if (!vistos[l]) { vistos[l] = 1; nombres.push(l); } }
        else { nombres.push(l); }
    });
    var out = '<div class="' + (enHero ? 'loc-hero loc-details' : 'detail-item full loc-details') + '">';
    out += '<details>';
    out += '<summary class="loc-toggle"><i data-lucide="map-pin"></i><span class="loc-toggle__t">Localidades</span> <span class="loc-count">' + nombres.length + '</span></summary>';
    out += '<div class="loc-list">';
    nombres.forEach(function(n, i) { out += '<div class="loc-pill"><span class="loc-num">' + (i + 1) + '</span>' + escapeHtml(n) + '</div>'; });
    out += '</div></details></div>';
    return out;
}

// Normaliza un telefono para enlaces tel: / WhatsApp (solo digitos, +52 si son 10)
function phoneTel(phone) {
    if (!phone) return '';
    var d = String(phone).replace(/\D/g, '');
    if (d.length === 10) return '+52' + d;
    if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
    if (d.length > 0) return '+' + d;
    return '';
}
function phoneWa(phone) { var t = phoneTel(phone).replace(/\+/g, ''); return t; }
// Abre el menu Marcar / WhatsApp para el numero tocado
function openCallSheet(name, phone, tel) {
    var ov = document.getElementById('call-sheet-overlay');
    if (!ov) { if (tel) window.location.href = 'tel:' + tel; return; }
    var nEl = document.getElementById('call-sheet-name');
    var pEl = document.getElementById('call-sheet-num');
    var tEl = document.getElementById('call-sheet-tel');
    var wEl = document.getElementById('call-sheet-wa');
    if (nEl) nEl.textContent = name || 'Contacto';
    if (pEl) pEl.textContent = phone || '';
    if (tEl) tEl.href = tel ? ('tel:' + tel) : '#';
    if (wEl) wEl.href = tel ? ('https://wa.me/' + String(tel).replace(/\+/g, '')) : '#';
    ov.classList.add('open');
    try { if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') { lucide.createIcons(); } } catch(e) {}
}
function closeCallSheet() {
    var ov = document.getElementById('call-sheet-overlay');
    if (ov) ov.classList.remove('open');
}

function openDetail(id) {
    var m = allData.find(function(x) { return x['numero de municipio'] === id; });
    if (!m) return;
    var content = document.getElementById('detail-content');
    var est = (m.estatus_estructura || '').trim();

    var html = '';
    html += '<div class="detail-hero">';
    // Boton de mapa junto al nombre: abre Google Maps con el municipio en Veracruz.
    // Usamos la busqueda de Maps (api=1&query=), que no requiere coordenadas.
    var jsMun = String(m.municipio || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    html += '<div class="detail-hero-main">';
    html += '<div class="detail-hero-txt">';
    html += '<div class="detail-eyebrow">Ficha municipal · FORTA</div>';
    html += '<div class="detail-title-row">';
    html += '<div class="detail-title">' + escapeHtml(m.municipio || 'Sin nombre') + '</div>';
    html += '<button type="button" class="detail-map-btn" title="Ver ubicación en Google Maps" aria-label="Ver ubicación en Google Maps" onclick="verUbicacion(\'' + jsMun + '\')"><svg class="map-pin-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/></svg></button>';
    html += '</div>';
    html += '<div class="detail-sub">' + (est ? escapeHtml(est) : 'Sin estatus de estructura') + '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="detail-hero-chips">';
    if (m.zona != null) html += '<span class="hero-chip">Zona ' + escapeHtml(String(m.zona)) + '</span>';
    if (est) html += '<span class="hero-chip">' + escapeHtml(estatusShort(est)) + '</span>';
    if (m.distrito_local) html += '<span class="hero-chip">DL: ' + escapeHtml(String(m.distrito_local)) + '</span>';
    if (m.distrito_federal) html += '<span class="hero-chip">DF: ' + escapeHtml(String(m.distrito_federal)) + '</span>';
    html += '</div>';
    // Localidades integradas en el hero (arriba de la ficha), como acceso
    // rapido: el desplegable va dentro del encabezado institucional, no como
    // seccion suelta en el cuerpo.
    html += detailLocalidades(m.secciones_detalle, true);
    html += '</div>';

    // 2) GRAFICAS: un pastel por votacion, una rebanada por partido en su color.
    //    Van JUSTO TRAS el hero (nombre + estatus), que es lo mas importante,
    //    a peticion. El % de cada partido es sobre el total de votos A PARTIDOS
    //    del municipio (sin coaliciones, ni candidatos independientes, ni votos
    //    nulos). Fuente: SEE. El total del pastel es data.total, no los votos
    //    oficiales.
    var vp = m.votos_partidos || {};
    html += '<div class="detail-section"><h3>Votaciones · Votos por partido</h3>';
    html += '<div class="chart-hero pie-hero">';
    ORDEN_VOTACIONES.forEach(function(et, i) {
        var v = vp[et];
        var cid = 'pie-' + i + '-' + m['numero de municipio'];
        html += '<div class="chart-pie-card">';
        html += '<div class="chart-pie-label">' + et + '<br>' + formatNum(v ? v.total : 0) + ' votos a partidos</div>';
        html += '<canvas class="chart-pie" id="' + cid + '"></canvas>';
        html += '<div class="chart-pie-legend">';
        if (v && v.barras && v.total) {
            v.barras.slice().sort(function(a, b) { return b.votos - a.votos; }).forEach(function(b) {
                var col = PARTIDO_COLOR[b.partido] || '#7a8aa8';
                html += '<span class="bl-item" style="--c:' + col + '">' + escapeHtml(b.partido) + ' <b>' + b.pct.toFixed(1) + '%</b></span>';
            });
        } else {
            html += '<span class="bl-item">Sin datos</span>';
        }
        html += '</div></div>';
    });
    html += '</div></div>';

    // Genero legible (el Excel trae "F"/"M")
    function generoLabel(g) {
        var s = normText(g);
        return s === 'f' ? 'Femenino' : (s === 'm' ? 'Masculino' : (g || ''));
    }
    // Fila de contacto ligera: nombre con enfasis + numero que abre menu Marcar/WhatsApp
    function contactRow(role, name, gender, phone) {
        var tel = phoneTel(phone || '');
        var safeName = escapeHtml(name || 'Sin asignar');
        var safePhone = escapeHtml(phone || '');
        var jsName = String(name || role).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var jsPhone = String(phone || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var out = '<div class="contact-row">';
        out += '<span class="contact-row__txt"><span class="contact-role">' + escapeHtml(role) + (gender ? ' · ' + escapeHtml(gender) : '') + '</span><br>';
        out += '<span class="contact-name">' + safeName + '</span></span>';
        if (tel) {
            out += '<button type="button" class="contact-phone" onclick="openCallSheet(\'' + jsName + '\',\'' + jsPhone + '\',\'' + escapeHtml(tel) + '\')"><i data-lucide="phone"></i> ' + safePhone + '</button>';
        } else {
            out += '<span class="contact-nophone">Sin número</span>';
        }
        out += '</div>';
        return out;
    }
    var presTel0 = m.presidente_telefono || '';
    var secTel0 = m.secretario_telefono || '';

    // 2) CONTACTOS primero: nombres con enfasis + numero clicable
    html += '<div class="detail-section"><h3>Dirigentes del municipio · Contactos</h3>';
    html += '<div class="contact-list">';
    html += contactRow('Presidente de estructura', m.presidente_estructura || '', generoLabel(m.presidente_genero), presTel0);
    html += contactRow('Secretario general', m.secretario_general || '', generoLabel(m.secretario_genero), secTel0);
    html += '</div></div>';

    // (Las graficas de "Votos por partido" ya se pintan JUSTO TRAS el hero, al
    // principio de la ficha — ver mas arriba. Aqui habia un segundo bloque
    // duplicado que reusaba los mismos IDs de canvas pie-i-N y pisaba los
    // pasteles; se elimino.)

    // Estructura Electoral: listado nominal, secciones, casillas, rutas, ediles
    // y distritos. (Sube aqui a peticion: ahora va ANTES de Organizacion
    // partidista, y Localidades va antes que ella.)
    html += '<div class="detail-section"><h3>Estructura Electoral</h3>';
    html += '<div class="detail-grid">';
    html += detailItem('Listado Nominal', formatNum(m.listado_nominal), 'big');
    html += detailItem('Secciones', formatNum(m.secciones), 'big');
    html += detailItem('Casillas', formatNum(m.casillas), 'big');
    html += detailItem('Rutas', m.rutas != null ? formatNum(m.rutas) : '—', m.rutas != null ? 'big' : 'dim');
    html += detailItem('Total de Ediles', m.total_ediles != null ? formatNum(m.total_ediles) : '—', m.total_ediles != null ? 'big' : 'dim');
    html += detailItem('Militantes', m.militantes != null ? formatNum(m.militantes) : '—', m.militantes != null ? 'big' : 'dim');
    html += detailItem('Distrito Local', m.distrito_local || '', '', true);
    html += detailItem('Distrito Federal', m.distrito_federal || '', '', true);
    html += '</div></div>';

    // La fecha de nacimiento del secretario se quito del dashboard a peticion
    // (dato personal). El valor sigue intacto en secretario_fecha_nacimiento
    // para la exportacion y en data/municipios.json; aqui solo no se pinta.

    // Organización partidista: coordinador, zona, fuerza territorial, estatus y vigencia
    html += '<div class="detail-section"><h3>Organización partidista</h3><div class="detail-grid">';
    html += detailItem('Coordinador de zona', m.coordinador_zona || '', '', true);
    html += detailItem('Zona', m.zona != null ? m.zona : '', 'big');
    html += detailItem('Soldados', formatNum(m.soldados), 'big');
    html += detailItem('Meta de afiliados', formatNum(m.meta_afiliados), 'big');
    html += detailItem('Estatus de estructura', est ? estatusShort(est) + ' · ' + est : '', est ? '' : 'dim', true);
    html += detailItem('Vigencia de la estructura', m.vigencia || '', m.vigencia ? '' : 'dim', true);
    html += '</div></div>';

    // La seccion "Resultados electorales" (votos/% del Excel del Panel) se quito
    // del detalle a peticion: esa informacion ya la muestran las graficas de
    // "Votos por partido" (desde los SEE). Los campos votos_2024_* / pct_* siguen
    // intactos en el JSON y en la exportacion; aqui solo no se pintan.

    // Representación del partido (del Excel)
    var ppFed = m.pp_diputado_federal || '';
    var ppLoc = m.pp_diputado_local || '';
    var ppPre = m.pp_presidente_municipal || '';
    var ediles = m.regidores_pan || '';
    var consejero = m.consejero_estatal || '';
    var candidato = m.candidatos_pan_2025 || '';
    if (ppFed || ppLoc || ppPre || ediles || consejero || candidato) {
        html += '<div class="detail-section"><h3>Representación del partido</h3><div class="detail-grid">';
        html += detailItem('(PP) Diputado Federal', ppFed, ppFed ? '' : 'dim', true);
        html += detailItem('(PP) Diputado Local', ppLoc, ppLoc ? '' : 'dim', true);
        html += detailItem('(PP) Presidente Municipal', ppPre, ppPre ? '' : 'dim', true);
        html += detailItem('Regidores del PAN', ediles, ediles ? '' : 'dim', true);
        html += detailItem('Consejero estatal', consejero, consejero ? '' : 'dim', true);
        html += detailItem('Candidato(a) del PAN 2025', candidato, candidato ? '' : 'dim', true);
        html += '</div></div>';
    }

    var metricas = m.metricas || {};
    var metricKeys = Object.keys(metricas);
    if (metricKeys.length) {
        html += '<div class="detail-section"><h3>Métricas Personalizadas</h3><div class="detail-grid">';
        metricKeys.forEach(function(k) {
            var v = metricas[k];
            var display = (typeof v === 'number') ? formatNum(Math.round(v * 100) / 100) : v;
            html += detailItem(escapeHtml(k), display);
        });
        html += '</div></div>';
    }

    var etiquetas = m.etiquetas || [];
    if (etiquetas.length) {
        html += '<div class="detail-section"><h3>Etiquetas</h3><div class="tags-container">';
        etiquetas.forEach(function(t) {
            html += '<span class="tag" style="cursor:default;">' + escapeHtml(t) + '</span>';
        });
        html += '</div></div>';
    }

    var meta = m.metadata || {};
    var metaKeys = Object.keys(meta);
    if (metaKeys.length) {
        html += '<div class="detail-section"><h3>Metadata</h3><div class="detail-grid">';
        metaKeys.forEach(function(k) {
            html += detailItem(escapeHtml(k), meta[k], '', true);
        });
        html += '</div></div>';
    }

    html += '<div class="detail-footer">' +
        '<span>Panel de Fortalecimiento Interno</span>' +
        '<span class="detail-footer-sep">·</span>' +
        '<span>Municipio ' + m['numero de municipio'] + ' de 212</span>' +
        '</div>';

    content.innerHTML = html;
    document.getElementById('detail-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    try { if (lucide && typeof lucide.createIcons === 'function') { lucide.createIcons(); } } catch(e) {}

    // Dibujar los 3 pasteles por partido (uno por votacion, tras tener el canvas en el DOM)
    var vp = m.votos_partidos || {};
    ORDEN_VOTACIONES.forEach(function(et, i) {
        renderDetailPie('pie-' + i + '-' + m['numero de municipio'], vp[et]);
    });
}


// Orden fijo de las votaciones en el detalle y color de cada partido.
// El pastel usa el color del partido, asi que aqui vive la paleta.
var ORDEN_VOTACIONES = ['2025 alcaldes', '2024 locales', '2024 federales'];
var PARTIDO_COLOR = {
    'PAN': '#003f87',    // azul PAN
    'PRI': '#0e8a4f',    // verde PRI
    'PRD': '#f2c200',    // amarillo PRD
    'PVEM': '#8bc34a',   // verde claro PVEM
    'PT': '#d8362a',     // rojo PT
    'MC': '#f07d13',     // naranja MC
    'MORENA': '#8c1d40'  // guindo MORENA
};

// Pastel de una votacion: una rebanada por partido, en el color del partido.
// El total del pastel es data.total (suma de votos A PARTIDOS del municipio,
// ya sin coaliciones, ni candidatos independientes, ni votos nulos); Chart.js
// calcula cada rebanada como votos/total, o sea el mismo % de la leyenda.
function renderDetailPie(canvasId, data) {
    if (!window.Chart) return;
    var canvas = document.getElementById(canvasId);
    if (!canvas || !data || !data.barras || !data.barras.length) return;
    var barras = data.barras.slice().sort(function(a, b) { return b.votos - a.votos; });
    var ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: barras.map(function(b) { return b.partido; }),
            datasets: [{
                data: barras.map(function(b) { return b.votos; }),
                backgroundColor: barras.map(function(b) { return PARTIDO_COLOR[b.partido] || '#7a8aa8'; }),
                borderColor: '#ffffff',
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { display: false },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function(c) {
                            var b = barras[c.dataIndex];
                            return ' ' + b.partido + ': ' + b.votos.toLocaleString('es-MX') + ' votos · ' + b.pct.toFixed(2) + '%';
                        }
                    }
                }
            }
        }
    });
}


// Boton "Ver ubicacion": abre Google Maps con la busqueda del municipio en
// Veracruz. Usa la API universal de Maps (https://www.google.com/maps/search/?
// api=1&query=...), que no necesita coordenadas: basta con el nombre del lugar.
// En movil abre la app si esta instalada; si no, la version web. Se suma
// ", Veracruz" para desambiguar de municipios homonimos de otros estados.
function verUbicacion(municipio) {
    var nombre = (municipio || '').toString().trim();
    if (!nombre) return;
    var query = nombre + ', Veracruz, Mexico';
    var url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
    window.open(url, '_blank', 'noopener');
}


function closeDetail() {
    document.getElementById('detail-overlay').classList.remove('open');
    document.body.style.overflow = '';
}
document.getElementById('detail-close').addEventListener('click', closeDetail);
document.getElementById('detail-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeDetail();
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeDetail(); closeCallSheet(); closeExportSheet(); }
});
// Menu Marcar / WhatsApp: cerrar al tocar fuera o Cancelar
try {
    var _csOv = document.getElementById('call-sheet-overlay');
    var _csCancel = document.getElementById('call-sheet-cancel');
    if (_csOv) _csOv.addEventListener('click', function(e) { if (e.target === this) closeCallSheet(); });
    if (_csCancel) _csCancel.addEventListener('click', closeCallSheet);
} catch(e) {}
// Menu Exportar: cerrar al tocar fuera o Cancelar
try {
    var _exOv = document.getElementById('export-sheet-overlay');
    var _exCancel = document.getElementById('export-sheet-cancel');
    if (_exOv) _exOv.addEventListener('click', function(e) { if (e.target === this) closeExportSheet(); });
    if (_exCancel) _exCancel.addEventListener('click', closeExportSheet);
} catch(e) {}

// Mostrar mas municipios
document.getElementById('load-more-btn').addEventListener('click', function() {
    visibleCount += 20;
    renderList();
});

// Busqueda global (lista)
document.getElementById('table-search').addEventListener('input', function(e) {
    tableSearchTerm = e.target.value.toLowerCase().trim();
    visibleCount = 20;
    renderList();
});


// ===== EXPORTAR EXCEL (móvil: descargar o compartir por WhatsApp) =====
document.getElementById('export-excel-btn').addEventListener('click', function() {
    if (!filteredData.length) { alert('No hay datos para exportar.'); return; }
    var keys = Object.keys(filteredData[0]).filter(function(k) {
        return ['metricas', 'etiquetas', 'metadata', 'votos_partidos'].indexOf(k) === -1;
    });
    var headers = keys.map(fieldLabel);
    var rows = filteredData.map(function(m) {
        var row = {};
        keys.forEach(function(h, i) {
            var v = m[h];
            if (h === 'pct_2024_locales' || h === 'pct_2024_federales' || h === 'pct_2025') {
                var p = pctValue(v);
                v = (p === null) ? '' : Math.round(p * 100) / 100;   // todo en % reales
            }
            row[headers[i]] = (v === null || v === undefined) ? '' : v;
        });
        return row;
    });

    // CSV: SIEMPRE se genera. text/csv SÍ está en la lista blanca de tipos
    // compartibles de Android/Chromium (el .xlsx NO), así que sirve de respaldo
    // para "Compartir por WhatsApp" en Android. Se abre en Excel/Sheets/Numbers.
    var csvRows = [];
    // Delimitador ';' (punto y coma): Excel de escritorio en configuración regional
    // española/mexicana usa ';' como separador de lista. Con ',' Excel en español NO
    // parte las columnas y junta toda la fila en una sola celda (el "pierde el formato").
    // Google Sheets y Numbers detectan el delimitador automáticamente, así que ';'
    // funciona en los tres. Todo campo de texto va entrecomillado, así que un ';'
    // interno queda protegido.
    csvRows.push(headers.map(function(h) { return '"' + String(h).replace(/"/g, '""') + '"'; }).join(';'));
    rows.forEach(function(row) {
        csvRows.push(headers.map(function(h) {
            var v = row[h];
            if (v === '' || v === null || v === undefined) return '';
            if (typeof v === 'number') return String(v);
            return '"' + String(v).replace(/"/g, '""') + '"';
        }).join(';'));
    });
    // MIME "pelado" text/csv (SIN ;charset): Chromium compara el tipo EXACTO contra su
    // lista blanca de tipos compartibles; con el parámetro charset la comparación falla
    // y Android no deja compartir. El BOM (\uFEFF) hace que Excel muestre bien los acentos
    // y respete el ';' como separador de columnas.
    var csvBlob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv' });

    // Archivo principal en memoria (Blob). Se prefiere .xlsx para descargar (si la
    // librería cargó); si no hay conexión al CDN, el CSV también descarga bien.
    var filename, blob;
    if (typeof XLSX !== 'undefined') {
        var ws = XLSX.utils.json_to_sheet(rows, { header: headers });
        // Ancho de columnas acorde al contenido (legibilidad al abrir en PC).
        var widths = headers.map(function(h) {
            var max = String(h).length;
            for (var r = 0; r < rows.length; r++) {
                var val = rows[r][h];
                if (val === null || val === undefined) continue;
                var len = String(val).length;
                if (len > max) max = len;
            }
            // 'Secciones (detalle)' puede ser larguísimo: se acota para no desbordar.
            return { wch: Math.min(Math.max(max + 2, 10), 60) };
        });
        ws['!cols'] = widths;
        // Congela la fila de encabezados y habilita filtro (metadata pura, sin estilos).
        ws['!freeze'] = { ySplit: '1' };
        ws['!autofilter'] = { ref: ws['!ref'] };
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Municipios');
        var ab = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        filename = 'municipios_filtrados.xlsx';
        blob = new Blob([ab], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } else {
        filename = 'municipios_filtrados.csv';   // sin conexión al CDN de XLSX
        blob = csvBlob;
    }
    openExportSheet(blob, filename, filteredData.length, csvBlob);
});

// Abre el menú Exportar: descargar o compartir por WhatsApp (móvil)
function openExportSheet(blob, filename, count, csvBlob) {
    var ov = document.getElementById('export-sheet-overlay');
    if (!ov) { downloadBlob(blob, filename); return; }   // respaldo si no hay menú
    // Detectamos el sistema para los mensajes (NO para decidir si se puede: eso
    // lo decide navigator.canShare con cada archivo en concreto).
    var ua = navigator.userAgent || '';
    var isAndroid = /Android/i.test(ua);
    var isIOS = /iPhone|iPad|iPod/i.test(ua);

    var xlsxFile = null, csvFile = null;
    try { xlsxFile = new File([blob], filename, { type: blob.type }); } catch (e) { xlsxFile = null; }
    try {
        if (csvBlob) {
            var csvName = filename.replace(/\.xlsx$/i, '') + '.csv';
            // Tipo exacto text/csv para que Chromium lo acepte en su lista blanca.
            csvFile = new File([csvBlob], csvName, { type: 'text/csv' });
        }
    } catch (e) { csvFile = null; }

    function canShare(f) {
        try { return !!(window.navigator.share && f && window.navigator.canShare && window.navigator.canShare({ files: [f] })); }
        catch (e) { return false; }
    }
    var xOk = canShare(xlsxFile);   // iPhone: sí · Android: no (.xlsx fuera de la lista blanca)
    var cOk = canShare(csvFile);    // iPhone y Android: sí (text/csv está permitido)

    var xBtn = document.getElementById('export-share-xlsx-btn');
    var cBtn = document.getElementById('export-share-csv-btn');
    var hint = document.getElementById('export-share-hint');
    var num = document.getElementById('export-sheet-num');
    if (num) num.textContent = count + (count === 1 ? ' municipio listo' : ' municipios listos') + ' · ' + filename;

    // Cada botón de compartir solo aparece si ESE formato concreto se puede enviar.
    if (xBtn) {
        xBtn.style.display = xOk ? '' : 'none';
        xBtn.onclick = function() { shareExport(xlsxFile, csvFile); };
        var xs = document.getElementById('export-xlsx-sub');
        if (xs) xs.textContent = isIOS ? 'Recomendado en iPhone · formato original del panel'
                                       : 'Formato original · en Android puede no estar disponible';
    }
    if (cBtn) {
        cBtn.style.display = cOk ? '' : 'none';
        cBtn.onclick = function() { shareExport(csvFile, null); };
        var cs = document.getElementById('export-csv-sub');
        if (cs) cs.textContent = isAndroid ? 'Recomendado en Android · abre en Excel, Sheets o Numbers'
                                           : 'Compatible con WhatsApp en cualquier teléfono';
    }

    // Aviso según lo que el navegador permita.
    if (hint) {
        if (!xOk && !cOk) {
            hint.style.display = '';
            hint.textContent = 'Tu navegador no permite compartir archivos desde la web. Usa "Descargar" y adjunta el archivo desde WhatsApp.';
        } else if (isAndroid && !xOk) {
            hint.style.display = '';
            hint.textContent = 'En Android, WhatsApp recibe el CSV (se abre igual en Excel). El Excel (.xlsx) solo se puede Descargar.';
        } else {
            hint.style.display = 'none';
        }
    }

    var dl = document.getElementById('export-download-btn');
    if (dl) dl.onclick = function() { closeExportSheet(); downloadBlob(blob, filename); };

    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    try { if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') { lucide.createIcons(); } } catch (e) {}
}
function closeExportSheet() {
    var ov = document.getElementById('export-sheet-overlay');
    if (ov) ov.classList.remove('open');
    document.body.style.overflow = '';
}
// Comparte un archivo por el menú nativo (WhatsApp, etc.). Si el sistema rechaza
// el tipo (Android/Chromium bloquea .xlsx), descarga el archivo como respaldo
// para que el usuario lo adjunte a mano desde WhatsApp.
function shareExport(file, fallbackFile) {
    if (!window.navigator.share) {
        if (file) downloadBlob(file, file.name);
        return;
    }
    function doShare(f, fb) {
        return window.navigator.share({ files: [f], title: 'Panel FORTA', text: 'Municipios del panel' })
            .then(function() { closeExportSheet(); })
            .catch(function(err) {
                if (err && err.name === 'AbortError') return;   // el usuario canceló
                if (fb) { doShare(fb, null); }                  // reintenta con el otro formato
                else {
                    // No se pudo compartir: descargamos y avisamos.
                    closeExportSheet();
                    downloadBlob(file, file.name);
                    alert('No se pudo abrir el menú para compartir en este navegador.\n\nSe descargó el archivo "' + file.name + '".\nÁbrelo y adjúntalo desde WhatsApp.');
                }
            });
    }
    doShare(file, fallbackFile);
}
// Fuerza la descarga del archivo generado
function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

// ===== INICIALIZACION =====
// (el document click handler se registra dentro de cada multi-select para evitar
//  que cierre el menú al interactuar dentro del mismo)
(function() {
    // Drawer de filtros: abre/cierra el cajon lateral
    var sidebar = document.getElementById('filters-sidebar');
    var toggle = document.getElementById('menu-toggle');
    var backdrop = document.getElementById('drawer-backdrop');
    var closeBtn = document.getElementById('drawer-close');

    function openDrawer() {
        sidebar.classList.add('open');
        backdrop.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
    }
    function closeDrawer() {
        sidebar.classList.remove('open');
        backdrop.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    }

    if (sidebar && toggle && backdrop) {
        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            if (sidebar.classList.contains('open')) { closeDrawer(); } else { openDrawer(); }
        });
        closeBtn.addEventListener('click', closeDrawer);
        backdrop.addEventListener('click', closeDrawer);
        // Cerrar al seleccionar filtros (toque outside en movil)
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('open')) closeDrawer();
        });
    }
    try { loadData(); } catch(e) { console.error('loadData error:', e); }
    try { if (lucide && typeof lucide.createIcons === 'function') { lucide.createIcons(); } } catch(e) {}
})();

