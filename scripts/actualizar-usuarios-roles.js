/* ==========================================================================
   actualizar-usuarios-roles.js — Actualiza usuarios_roles.json con contraseñas
   Lee el usuarios.json original y mergea los datos con la nueva estructura
   de roles y permisos de comentarios.
   ========================================================================== */
'use strict';
const fs = require('fs');

const src = JSON.parse(fs.readFileSync('public/data/usuarios.json', 'utf8'));
const dest = JSON.parse(fs.readFileSync('public/data/usuarios_roles.json', 'utf8'));

// Mapeo de roles a permisos de comentario
function getPermisosComentario(rol) {
    const reglas = {
        admin: { puede_comentar: true, comentar_sin_revision: true, puede_moderar: true, puede_aprobar: true },
        presidenta: { pode_comentar: true, comentar_sin_revision: true, pode_moderar: false, pode_aprobar: false },
        presidente: { pode_comentar: true, comentar_sin_revision: true, pode_moderar: false, pode_aprobar: false },
        coordinador: { pode_comentar: true, comentar_sin_revision: false, pode_moderar: false, pode_aprobar: false },
        consulta: { pode_comentar: false, comentar_sin_revision: false, pode_moderar: false, pode_aprobar: false }
    };
    return reglas[rol] || reglas.consulta;
}

// Procesar cada usuario
const usuariosActualizados = src.usuarios.map(u => {
    const permisos = getPermisosComentario(u.rol);
    return {
        usuario: u.usuario,
        nombre: u.nombre,
        rol: u.rol,
        activo: u.activo,
        municipios: u.municipios || [],
        municipios_adicionales: u.municipios_adicionales || [],
        password_sha256: u.password_sha256,  // INCLUIR CONTRASEÑA
        permisos_comentario: permisos,
        fecha_creacion: null,
        ultimo_acceso: null
    };
});

// Crear el archivo actualizado
const salida = {
    config_roles: dest.config_roles,
    usuarios: usuariosActualizados
};

fs.writeFileSync('public/data/usuarios_roles.json', JSON.stringify(salida, null, 2));
console.log('✅ usuarios_roles.json actualizado:', usuariosActualizados.length, 'usuarios con contraseñas');
console.log('   Incluye password_sha256 para cada usuario');