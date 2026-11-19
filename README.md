# Plataforma Forta

Panel de Fortalecimiento Interno para seguimiento de municipios de Veracruz.

## Estructura del proyecto

```
plataforma-forta-main/
├── public/                   ← Sitio web (GitHub Pages sirve solo esta carpeta)
│   ├── index.html            — Dashboard principal
│   ├── login.html            — Pantalla de acceso
│   ├── styles.css            — Estilos globales
│   ├── dashboard.js          — Lógica del panel
│   ├── login.js              — Autenticación
│   ├── auth.js               — Guardián de sesión
│   ├── firebase-init.js      — Inicialización de Firebase
│   ├── firebase-config.js    — ⚠️ IGNORADO en git; generado por CI o localmente
│   ├── CNAME                 — Dominio personalizado (fortaveracruz.app)
│   └── data/                 — ⚠️ IGNORADO en git; datos JSON locales / de respaldo
│       ├── municipios.json
│       └── usuarios.json
│
├── scripts/                  ← Herramientas de administración (Node.js / PowerShell)
│   ├── build-data.js         — Sincroniza Excel → Firestore + actualiza public/data/
│   ├── generar_mapa.js       — Genera mapa de números de municipio
│   ├── generar_mapa.ps1      — Versión PowerShell del generador de mapa
│   ├── hash-password.js      — Genera hash SHA-256 para contraseñas de usuarios
│   └── raw/                  — ⚠️ IGNORADO en git; archivos Excel fuente
│       └── Panel FORTA *.xlsx
│
├── .github/
│   └── workflows/
│       └── deploy.yml        — CI/CD: genera firebase-config.js e inyecta Secrets
│
├── .gitignore
├── package.json
└── README.md
```

## Configuración inicial

### 1. Instalar dependencias
```bash
npm install
```

### 2. Credenciales Firebase (solo local)
Coloca `serviceAccountKey.json` en la **raíz** del proyecto (está en `.gitignore`).

### 3. Configuración del cliente Firebase (solo local)
Crea `public/firebase-config.js` con el siguiente contenido (está en `.gitignore`):
```js
const FORTA_FIREBASE_CONFIG = {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
};
if (typeof window !== 'undefined') window.FORTA_FIREBASE_CONFIG = FORTA_FIREBASE_CONFIG;
if (typeof module !== 'undefined' && module.exports) module.exports = FORTA_FIREBASE_CONFIG;
```

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `npm run sync` | Sincroniza el Excel más reciente de `scripts/raw/` con Firestore |
| `npm run sync scripts/raw/Panel.xlsx` | Sincroniza un Excel específico |
| `npm run mapa` | Genera el mapa de números de municipio |
| `npm run serve` | Sirve `public/` localmente en http://localhost:3000 |
| `npm run hash-password` | Genera hash SHA-256 para una contraseña de usuario |

## Flujo de actualización de datos

```
Panel FORTA *.xlsx  →  scripts/raw/
        ↓
  npm run sync
        ↓
  Firestore (fuente principal del dashboard)
        ↓
  public/data/municipios.json  (respaldo local automático)
```

## Despliegue

El despliegue es **automático** al hacer push a `main`. GitHub Actions:

1. Genera `public/firebase-config.js` desde los **Secrets del repositorio**.
2. Publica **únicamente** la carpeta `public/` en GitHub Pages.
3. Los scripts de `scripts/` y los archivos de raíz **nunca se despliegan**.

### Secrets de GitHub requeridos

| Secret | Descripción |
|---|---|
| `FIREBASE_API_KEY` | API Key de Firebase |
| `FIREBASE_AUTH_DOMAIN` | Auth Domain |
| `FIREBASE_PROJECT_ID` | Project ID |
| `FIREBASE_STORAGE_BUCKET` | Storage Bucket |
| `FIREBASE_MESSAGING_SENDER_ID` | Messaging Sender ID |
| `FIREBASE_APP_ID` | App ID |

## Roles de usuario

| Rol | Acceso |
|---|---|
| `admin` | Todo el panel, todos los municipios |
| `coordinador` | Solo municipios de su zona |
| `consulta` | Vista de solo lectura de sus municipios |

Para crear un nuevo usuario, agrega su documento en la colección `usuarios` de Firestore y genera su contraseña con:
```bash
npm run hash-password
```
