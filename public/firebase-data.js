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
                var munisSnapshot = await window.firebaseFirestore.collection('municipios').get();
                var list = [];
                munisSnapshot.forEach(function(doc) {
                    var d = doc.data();
                    if (!d['numero de municipio']) d['numero de municipio'] = Number(doc.id);
                    list.push(d);
                });
                return list;
            })();

            var timeoutPromise = new Promise(function(_, reject) {
                setTimeout(function() { reject(new Error('TIMEOUT_FIRESTORE')); }, 2500);
            });

            munisData = await Promise.race([firestorePromise, timeoutPromise]);
            console.log('â Municipios cargados desde Firestore (' + munisData.length + ')');
        } catch (err) {
            console.warn('â© No se pudo obtener municipios de Firestore (' + (err.message || err) + '). Activando respaldo local...');
            munisData = [];
        }
    }

    if (!munisData || !munisData.length) {
        origen = 'municipios.json (local)';
        try {
            var res = await fetch('data/municipios.json', { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            munisData = await res.json();
            console.log('ð Municipios cargados desde respaldo local (' + munisData.length + ')');
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