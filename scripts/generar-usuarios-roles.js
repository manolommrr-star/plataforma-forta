/* ==========================================================================
   generar-usuarios-roles.js — Generar usuarios_roles.json para Firebase
   Lee public/data/usuarios.json y crea public/data/usuarios_roles.json
   con estructura pensada para el futuro sistema de comentarios.
   ========================================================================== */

'use strict';
const fs = require('fs');

const ROLES_CONFIG = {
    admin: {
        nombre: 'Administrador',
        descripcion: 'Acceso total: ve todo, exporta, gestiona usuarios, moderar comentarios.',
        permisos: {
            ver_todos_municipios: true,
            exportar: true,
            gestionar_usuarios: true,
            comentar: true,
            comentar_sin_revision: true,
            moderar_comentarios: true,
            ver_comentarios_aprobados: true,
            ver_comentarios_pendientes: true,
            aprobar_comentarios: true
        }
    },
    presidenta: {
        nombre: 'Presidenta',
        descripcion: 'Filtros completos, ver municipios, comentar sin revisión previa, ver solo comentarios aprobados.',
        permisos: {
            ver_todos_municipios: true,
            exportar: false,
            gestionar_usuarios: false,
            comentar: true,
            comentar_sin_revision: true,
            moderar_comentarios: false,
            ver_comentarios_aprobados: true,
            ver_comentarios_pendientes: false,
            aprobar_comentarios: false
        }
    },
    presidente: {
        nombre: 'Presidente',
        descripcion: 'Filtros completos, ver municipios, comentar sin revisión previa, ver solo comentarios aprobados.',
        permisos: {
            ver_todos_municipios: true,
            exportar: false,
            gestionar_usuarios: false,
            comentar: true,
            comentar_sin_revision: true,
            moderar_comentarios: false,
            ver_comentarios_aprobados: true,
            ver_comentarios_pendientes: false,
            aprobar_comentarios: false
        }
    },
    coordinador: {
        nombre: 'Coordinador',
        descripcion: 'Solo SUS municipios + exportar + comentar con revisión previa de admin.',
        permisos: {
            ver_todos_municipios: false,
            exportar: true,
            gestionar_usuarios: false,
            comentar: true,
            comentar_sin_revision: false,
            moderar_comentarios: false,
            ver_comentarios_aprobados: true,
            ver_comentarios_pendientes: false,
            aprobar_comentarios: false
        }
    },
    consulta: {
        nombre: 'Consulta',
        descripcion: 'Solo lectura, sin exportar, sin comentar.',
        permisos: {
            ver_todos_municipios: false,
            exportar: false,
            gestionar_usuarios: false,
            comentar: false,
            comentar_sin_revision: false,
            moderar_comentarios: false,
            ver_comentarios_aprobados: false,
            ver_comentarios_pendientes: false,
            aprobar_comentarios: false
        }
    }
};

const REGLAS_COMENTARIOS = {
    puede_comentar_sin_revision: ['admin', 'presidenta', 'presidente'],
    puede_comentar_con_revision: ['coordinador'],
    no_puede_comentar: ['consulta'],
    puede_moderar: ['admin'],
    puede_aprobar: ['admin']
};

function permisosComentario(rol) {
    const r = ROLES_CONFIG[rol];
    if (!r) return { puede_comentar: false, comentar_sin_revision: false, puede_moderar: false, puede_aprobar: false };
    return {
        puede_comentar: r.permisos.comentar,
        comentar_sin_revision: r.permisos.comentar_sin_revision,
        puede_moderar: r.permisos.moderar_comentarios,
        puede_aprobar: r.permisos.aprobar_comentarios
    };
}

const src = JSON.parse(fs.readFileSync('public/data/usuarios.json', 'utf8'));
const usuariosDestino = src.usuarios.map(u => ({
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    municipios: u.municipios || [],
    municipios_adicionales: u.municipios_adicionales || [],
    permisos_comentario: permisosComentario(u.rol),
    fecha_creacion: null,
    ultimo_acceso: null
}));

const salida = {
    config_roles: {
        roles: ROLES_CONFIG,
        reglas_comentarios: REGLAS_COMENTARIOS
    },
    usuarios: usuariosDestino
};

fs.writeFileSync('public/data/usuarios_roles.json', JSON.stringify(salida, null, 2));
console.log('✅ usuarios_roles.json generado:', usuariosDestino.length, 'usuarios');
console.log('   Roles definidos:', Object.keys(ROLES_CONFIG).join(', '));