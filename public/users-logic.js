/* ==========================================================================
   users-logic.js — Usuarios, roles, permisos y alcance de coordinador.
   Capa de lógica de usuarios del Panel FORTA.
   Prepara el esqueleto para el futuro sistema de comentarios.
   ========================================================================== */
'use strict';

// ===== ALCANCE DE COORDINADOR =====
var fortaScope = null;
var fortaSoloBusquedaGeneral = false;

var coordinatorScopeMap = {};
var coordinatorNames = [];

function buildCoordinatorScopeMap(data) {
    coordinatorScopeMap = {};
    coordinatorNames = [];
    ((data && data.usuarios) || []).forEach(function(u) {
        if (u.rol !== 'coordinador' && u.rol !== 'coordinador_g20') return;
        var name = nameCase(u.nombre || u.usuario);
        var zona = new Set();
        var extra = new Set();
        (u.municipios || []).forEach(function(n) { zona.add(n); });
        (u.municipios_adicionales || []).forEach(function(n) { extra.add(n); });
        var todos = new Set(zona);
        extra.forEach(function(n) { todos.add(n); });
        coordinatorScopeMap[name] = { zona: zona, extra: extra, todos: todos };
        coordinatorNames.push(name);
    });
}

function municipioEnCoordinadoresSeleccionados(m, seleccionados) {
    var num = m['numero de municipio'];
    var zona = nameCase(m.coordinador_zona);
    var coincide = false;
    seleccionados.forEach(function(cn) {
        if (coincide) return;
        if (zona && zona === cn) { coincide = true; return; }
        var sc = coordinatorScopeMap[cn];
        if (sc && sc.todos.has(num)) coincide = true;
    });
    return coincide;
}

function coordinadoresFiltrables() {
    var visibles = {};
    var data = window.__fortaAllData || [];
    data.forEach(function(m) {
        var num = m['numero de municipio'];
        var zona = nameCase(m.coordinador_zona);
        if (zona) visibles[zona] = true;
        coordinatorNames.forEach(function(cn) {
            var sc = coordinatorScopeMap[cn];
            if (sc && sc.todos.has(num)) visibles[cn] = true;
        });
    });
    return Object.keys(visibles).sort();
}

function setAllData(data) {
    window.__fortaAllData = data;
}

// ===== PERMISOS Y ROLES =====
var FORTA_COMMENT_RULES = {
    puede_comentar_sin_revision: ['admin', 'presidenta', 'presidente'],
    puede_comentar_con_revision: ['coordinador'],
    no_puede_comentar: ['consulta'],
    puede_moderar: ['admin'],
    puede_aprobar: ['admin']
};

function getPermisosComentario(rol) {
    var reglas = {
        admin: { puede_comentar: true, comentar_sin_revision: true, puede_moderar: true, puede_aprobar: true },
        presidenta: { puede_comentar: true, comentar_sin_revision: true, puede_moderar: false, puede_aprobar: false },
        presidente: { puede_comentar: true, comentar_sin_revision: true, puede_moderar: false, puede_aprobar: false },
        coordinador: { puede_comentar: true, comentar_sin_revision: false, puede_moderar: false, puede_aprobar: false },
        consulta: { puede_comentar: false, comentar_sin_revision: false, puede_moderar: false, puede_aprobar: false }
    };
    return reglas[rol] || reglas.consulta;
}

function puedeComentar(rol, municipioNumero) {
    var p = getPermisosComentario(rol);
    if (!p.puede_comentar) return false;
    if (p.comentar_sin_revision) return true;
    if (rol === 'coordinador') {
        if (!Array.isArray(fortaScope) || fortaScope.length === 0) return true;
        return fortaScope.includes(municipioNumero) || fortaScope.includes(String(municipioNumero));
    }
    return true;
}

function puedeModerarComentarios(rol) {
    return FORTA_COMMENT_RULES.puede_moderar.indexOf(rol) >= 0;
}

function puedeAprobarComentarios(rol) {
    return FORTA_COMMENT_RULES.puede_aprobar.indexOf(rol) >= 0;
}

function puedeVerComentariosPendientes(rol) {
    var p = getPermisosComentario(rol);
    return p.ver_comentarios_pendientes === true;
}

function puedeVerComentariosAprobados(rol) {
    var p = getPermisosComentario(rol);
    return p.ver_comentarios_aprobados === true;
}

window.fortaUsers = {
    getScope: function() { return fortaScope; },
    setScope: function(s) { fortaScope = s; },
    isSoloBusquedaGeneral: function() { return fortaSoloBusquedaGeneral; },
    setSoloBusquedaGeneral: function(v) { fortaSoloBusquedaGeneral = v; },
    buildCoordinatorScopeMap: buildCoordinatorScopeMap,
    municipioEnCoordinadoresSeleccionados: municipioEnCoordinadoresSeleccionados,
    coordinadoresFiltrables: coordinadoresFiltrables,
    setAllData: setAllData,
    getPermisosComentario: getPermisosComentario,
    puedeComentar: puedeComentar,
    puedeModerarComentarios: puedeModerarComentarios,
    puedeAprobarComentarios: puedeAprobarComentarios,
    puedeVerComentariosPendientes: puedeVerComentariosPendientes,
    puedeVerComentariosAprobados: puedeVerComentariosAprobados,
    FORTA_COMMENT_RULES: FORTA_COMMENT_RULES
};