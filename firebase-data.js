/* ==========================================================================
   firebase-data.js — Capa de acceso a datos del Panel FORTA.
   Todas las llamadas a Firebase/Firestore y al JSON de respaldo viven aquí.
   El dashboard solo consume window.fortaData.* y no toca Firestore directamente.
   ========================================================================== */
'use strict';

// ===== CARGA DE MUNICIPIOS =====
async function loadMunicipios() {
    var munisData = [];
    var origen = 'Firestore';

    if (typeof window !== 'undefined' && window.firebaseFirestore) {
        try {
            var firestorePromise = (async function() {
                // Cargar las 3 colecciones nuevas en paralelo
                var [infoSnap, votSnap, contSnap] = await Promise.all([
                    window.firebaseFirestore.collection('municipios_info').get(),
                    window.firebaseFirestore.collection('municipios_votaciones').get(),
                    window.firebaseFirestore.collection('municipios_contactos').get()
                ]);
                var infoMap = {};
                infoSnap.forEach(function(doc) { infoMap[doc.id] = doc.data(); });
                var votMap = {};
                votSnap.forEach(function(doc) { votMap[doc.id] = doc.data(); });
                var contMap = {};
                contSnap.forEach(function(doc) { contMap[doc.id] = doc.data(); });

                var list = [];
                Object.keys(infoMap).forEach(function(id) {
                    var m = Object.assign({}, infoMap[id]);
                    if (votMap[id]) Object.assign(m, votMap[id]);
                    if (contMap[id]) Object.assign(m, contMap[id]);
                    if (!m['numero de municipio']) m['numero de municipio'] = Number(id) || null;
                    if (!m.municipio) m.municipio = id;
                    list.push(m);
                });
                return list;
            })();

            var timeoutPromise = new Promise(function(_, reject) {
                setTimeout(function() { reject(new Error('TIMEOUT_FIRESTORE')); }, 5000);
            });

            munisData = await Promise.race([firestorePromise, timeoutPromise]);
            console.log('Municipios cargados desde Firestore (info+votaciones+contactos) (' + munisData.length + ')');
        } catch (err) {
            console.warn('No se pudo obtener municipios de Firestore (' + (err.message || err) + '). Activando respaldo local...');
            munisData = [];
        }
    }

    if (!munisData || !munisData.length) {
        origen = 'JSON local (info+votaciones+contactos)';
        try {
            var [infoRes, votRes, contRes] = await Promise.all([
                fetch('data/municipios_info.json', { cache: 'no-store' }),
                fetch('data/municipios_votaciones.json', { cache: 'no-store' }),
                fetch('data/municipios_contactos.json', { cache: 'no-store' })
            ]);
            if (!infoRes.ok) throw new Error('HTTP ' + infoRes.status);
            var infoData = await infoRes.json();
            var votData = votRes.ok ? await votRes.json() : {};
            var contData = contRes.ok ? await contRes.json() : {};

            var list = [];
            Object.keys(infoData).forEach(function(id) {
                var m = Object.assign({}, infoData[id]);
                if (votData[id]) Object.assign(m, votData[id]);
                if (contData[id]) Object.assign(m, contData[id]);
                if (!m['numero de municipio']) m['numero de municipio'] = Number(id) || null;
                if (!m.municipio) m.municipio = id;
                list.push(m);
            });
            munisData = list;
            console.log('Municipios cargados desde JSON local (' + munisData.length + ')');
        } catch (err) {
            console.error('Error cargando municipios desde respaldo local:', err);
            return null;
        }
    }

    munisData.forEach(function(m, idx) {
        var num = m['numero de municipio'];
        if (num !== undefined && num !== null && num !== '') {
            var n = Number(num);
            if (!isNaN(n)) m['numero de municipio'] = n;
        } else if (m.id && !isNaN(Number(m.id))) {
            m['numero de municipio'] = Number(m.id);
        } else {
            m['numero de municipio'] = idx + 1;
        }
        // Inicializar secciones extensibles
        if (!m.metricas) m.metricas = {};
        if (!m.etiquetas) m.etiquetas = [];
        if (!m.metadata) m.metadata = {};
    });

    return { data: munisData, origen: origen };
}

// ===== CARGA DE USUARIOS =====
async function loadUsuarios() {
    var usersData = { usuarios: [] };

    if (typeof window !== 'undefined' && window.firebaseFirestore) {
        try {
            var usersSnapshot = await window.firebaseFirestore.collection('usuarios').get();
            usersSnapshot.forEach(function(doc) {
                var ud = doc.data();
                if (!ud.usuario) ud.usuario = doc.id;
                usersData.usuarios.push(ud);
            });
            console.log('â Usuarios cargados desde Firestore (' + usersData.usuarios.length + ')');
            return usersData;
        } catch (uerr) {
            console.warn('â© Fallback a usuarios.json para coordinadores...');
        }
    }

    try {
        var ures = await fetch('data/usuarios.json', { cache: 'no-store' });
        if (ures.ok) {
            usersData = await ures.json();
            console.log('ð Usuarios cargados desde respaldo local (' + usersData.usuarios.length + ')');
        }
    } catch (e) {
        console.warn('No se pudo cargar data/usuarios.json:', e);
    }
    return usersData;
}

// ===== COLECCIONES INDIVIDUALES =====
async function getMunicipioVotaciones(numero) {
    if (!window.firebaseFirestore) return null;
    try {
        var doc = await window.firebaseFirestore.collection('municipios_votaciones').doc(String(numero)).get();
        if (!doc.exists) return null;
        return doc.data();
    } catch (e) {
        console.warn('Error leyendo municipios_votaciones/' + numero + ':', e);
        return null;
    }
}

async function getMunicipioInfo(numero) {
    if (!window.firebaseFirestore) return null;
    try {
        var doc = await window.firebaseFirestore.collection('municipios_info').doc(String(numero)).get();
        if (!doc.exists) return null;
        return doc.data();
    } catch (e) {
        console.warn('Error leyendo municipios_info/' + numero + ':', e);
        return null;
    }
}

async function getMunicipioContactos(numero) {
    if (!window.firebaseFirestore) return null;
    try {
        var doc = await window.firebaseFirestore.collection('municipios_contactos').doc(String(numero)).get();
        if (!doc.exists) return null;
        return doc.data();
    } catch (e) {
        console.warn('Error leyendo municipios_contactos/' + numero + ':', e);
        return null;
    }
}

async function getMunicipioCompleto(numero) {
    var arr = await Promise.all([
        getMunicipioInfo(numero),
        getMunicipioContactos(numero),
        getMunicipioVotaciones(numero)
    ]);
    var info = arr[0], contactos = arr[1], votos = arr[2];
    var resultado = {};
    if (info) Object.assign(resultado, info);
    if (contactos) Object.assign(resultado, contactos);
    if (votos) Object.assign(resultado, votos);
    return Object.keys(resultado).length ? resultado : null;
}

// ===== EXPOSICIÓN GLOBAL =====
window.fortaData = {
    loadMunicipios: loadMunicipios,
    loadUsuarios: loadUsuarios,
    getMunicipioVotaciones: getMunicipioVotaciones,
    getMunicipioInfo: getMunicipioInfo,
    getMunicipioContactos: getMunicipioContactos,
    getMunicipioCompleto: getMunicipioCompleto
};