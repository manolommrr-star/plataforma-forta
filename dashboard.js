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
        return ['metricas', 'etiquetas', 'metadata'].indexOf(k) === -1;
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
    html += '<div class="detail-title">' + escapeHtml(m.municipio || 'Sin nombre') + '</div>';
    html += '<div class="detail-sub">Municipio ' + m['numero de municipio'] + (est ? ' · ' + escapeHtml(est) : '') + '</div>';
    html += '<div class="detail-hero-chips">';
    if (m.zona != null) html += '<span class="hero-chip">Zona ' + escapeHtml(String(m.zona)) + '</span>';
    if (est) html += '<span class="hero-chip">' + escapeHtml(estatusShort(est)) + '</span>';
    if (m.distrito_local) html += '<span class="hero-chip">DL: ' + escapeHtml(String(m.distrito_local)) + '</span>';
    if (m.distrito_federal) html += '<span class="hero-chip">DF: ' + escapeHtml(String(m.distrito_federal)) + '</span>';
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

    // 3) GRAFICAS: 3 pasteles, uno por votacion (2024 loc / 2024 fed / 2025)
    html += '<div class="detail-section"><h3>Votaciones · Gráficas</h3>';
    html += '<div class="chart-hero"><div class="chart-donuts-row">';
    html += '<div class="chart-donut-card"><canvas class="chart-mini" id="pie-loc-' + m['numero de municipio'] + '"></canvas><div class="chart-donut-label">2024 locales<br>' + formatNum(m.votos_2024_locales) + ' votos · ' + formatPct(m.pct_2024_locales) + '</div></div>';
    html += '<div class="chart-donut-card"><canvas class="chart-mini" id="pie-fed-' + m['numero de municipio'] + '"></canvas><div class="chart-donut-label">2024 federales<br>' + formatNum(m.votos_2024_federales) + ' votos · ' + formatPct(m.pct_2024_federales) + '</div></div>';
    html += '<div class="chart-donut-card"><canvas class="chart-mini" id="pie-25-' + m['numero de municipio'] + '"></canvas><div class="chart-donut-label">2025 alcaldes<br>' + formatNum(m.votos_2025_alcaldes) + ' votos · ' + formatPct(m.pct_2025) + '</div></div>';
    html += '</div></div></div>';
    // Organización partidista: zona, estatus, vigencia y fuerza territorial
    html += '<div class="detail-section"><h3>Organización partidista</h3><div class="detail-grid">';
    html += detailItem('Zona', m.zona != null ? m.zona : '', 'big');
    html += detailItem('Estatus de estructura', est ? estatusShort(est) + ' · ' + est : '', est ? '' : 'dim');
    html += detailItem('Soldados', formatNum(m.soldados), 'big');
    html += detailItem('Meta de afiliados', formatNum(m.meta_afiliados), 'big');
    html += detailItem('Vigencia de la estructura', m.vigencia || '', m.vigencia ? '' : 'dim');
    html += detailItem('Coordinador de zona', m.coordinador_zona || '', '', true);
    html += '</div></div>';

    // Detalle extra de dirigentes: solo lo que NO salio arriba
    // (nombres, generos y telefonos ya estan en Contactos, no se repiten)
    html += '<div class="detail-section"><h3>Dirigentes del municipio</h3><div class="detail-grid">';
    html += detailItem('Fecha de nacimiento (secretario)', m.secretario_fecha_nacimiento || '', m.secretario_fecha_nacimiento ? '' : 'dim', true);
    html += '</div></div>';

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
    html += detailItem('Secciones (detalle)', m.secciones_detalle || '', m.secciones_detalle ? '' : 'dim', true);
    html += '</div></div>';

    // Resultados electorales (del Excel): 2024 locales/federales y 2025 alcaldes
    html += '<div class="detail-section"><h3>Resultados electorales</h3><div class="detail-grid">';
    html += detailItem('Votos 2024 (locales)', m.votos_2024_locales != null ? formatNum(m.votos_2024_locales) : '—', m.votos_2024_locales != null ? 'big' : 'dim');
    html += detailItem('% 2024 (locales)', formatPct(m.pct_2024_locales), m.pct_2024_locales != null ? 'big' : 'dim');
    html += detailItem('Votos 2024 (federales)', m.votos_2024_federales != null ? formatNum(m.votos_2024_federales) : '—', m.votos_2024_federales != null ? 'big' : 'dim');
    html += detailItem('% 2024 (federales)', formatPct(m.pct_2024_federales), m.pct_2024_federales != null ? 'big' : 'dim');
    html += detailItem('Votos 2025 (alcaldes)', m.votos_2025_alcaldes != null ? formatNum(m.votos_2025_alcaldes) : '—', m.votos_2025_alcaldes != null ? 'big' : 'dim');
    html += detailItem('% 2025', formatPct(m.pct_2025), m.pct_2025 != null ? 'big' : 'dim');
    html += '</div></div>';

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

    content.innerHTML = html;
    document.getElementById('detail-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    try { if (lucide && typeof lucide.createIcons === 'function') { lucide.createIcons(); } } catch(e) {}

    // Dibujar los 3 pasteles (despues de que el canvas este en el DOM)
    // Cada uno: votos de esa eleccion vs resto del listado nominal
    var ln = m.listado_nominal || 0;
    renderDetailPie('pie-loc-' + m['numero de municipio'], m.votos_2024_locales || 0, ln, '#003f87');
    renderDetailPie('pie-fed-' + m['numero de municipio'], m.votos_2024_federales || 0, ln, '#016fb9');
    renderDetailPie('pie-25-' + m['numero de municipio'], m.votos_2025_alcaldes || 0, ln, '#1e7e34');
}

// Pastel de una votacion: votos vs resto del listado nominal
function renderDetailPie(canvasId, votos, listado, color) {
    if (!window.Chart) return;
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var rest = Math.max((listado || 0) - (votos || 0), 0);
    var ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Votos', 'Resto del listado'],
            datasets: [{
                data: [votos || 0, rest],
                backgroundColor: [color, '#e3e8f3'],
                borderColor: ['#ffffff', '#ccd6e6'],
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true },
                datalabels: { display: false }
            }
        }
    });
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
        return ['metricas', 'etiquetas', 'metadata'].indexOf(k) === -1;
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

    // Se construye el archivo en memoria (Blob) para poder descargarlo o
    // compartirlo; en el teléfono se podrá enviar por WhatsApp.
    var filename, blob;
    if (typeof XLSX !== 'undefined') {
        var ws = XLSX.utils.json_to_sheet(rows, { header: headers });
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Municipios');
        var ab = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        filename = 'municipios_filtrados.xlsx';
        blob = new Blob([ab], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } else {
        // Respaldo CSV si la librería Excel no cargó (sin conexión al CDN)
        var csvRows = [];
        csvRows.push(headers.map(function(h) { return '"' + h + '"'; }).join(','));
        rows.forEach(function(row) {
            csvRows.push(headers.map(function(h) {
                var v = row[h];
                if (v === '') return '';
                if (typeof v === 'number') return v.toString();
                return '"' + String(v).replace(/"/g, '""') + '"';
            }).join(','));
        });
        filename = 'municipios_filtrados.csv';
        blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    }
    openExportSheet(blob, filename, filteredData.length);
});

// Abre el menú Exportar: descargar o compartir por WhatsApp (móvil)
function openExportSheet(blob, filename, count) {
    var ov = document.getElementById('export-sheet-overlay');
    if (!ov) { downloadBlob(blob, filename); return; }   // respaldo si no hay menú
    var file = null;
    try { file = new File([blob], filename, { type: blob.type }); } catch (e) { file = null; }

    // Compartir archivos solo está soportado en móviles (Web Share API nivel 2)
    var canShareFiles = !!(window.navigator.canShare && window.navigator.share &&
        file && window.navigator.canShare({ files: [file] }));
    var shareBtn = document.getElementById('export-share-btn');
    var hint = document.getElementById('export-share-hint');
    var num = document.getElementById('export-sheet-num');
    if (num) num.textContent = count + (count === 1 ? ' municipio listo' : ' municipios listos') + ' · ' + filename;
    if (shareBtn) shareBtn.style.display = canShareFiles ? '' : 'none';
    if (hint) hint.style.display = canShareFiles ? 'none' : '';

    var dl = document.getElementById('export-download-btn');
    if (dl) dl.onclick = function() { closeExportSheet(); downloadBlob(blob, filename); };
    if (shareBtn) shareBtn.onclick = function() { shareExport(file); };

    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    try { if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') { lucide.createIcons(); } } catch (e) {}
}
function closeExportSheet() {
    var ov = document.getElementById('export-sheet-overlay');
    if (ov) ov.classList.remove('open');
    document.body.style.overflow = '';
}
// Envía el archivo por el menú nativo de compartir (WhatsApp, etc.)
function shareExport(file) {
    if (window.navigator.share) {
        window.navigator.share({ files: [file], title: 'Panel FORTA', text: 'Municipios del panel' })
            .then(closeExportSheet)
            .catch(function() { /* el usuario canceló: no hacemos nada */ });
    }
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

