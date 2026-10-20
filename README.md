# Panel de Fortalecimiento Interno

Dashboard de 212 municipios (Veracruz) con datos del Excel del panel (última
versión: **`Panel FORTA 30-09-2026.xlsx`**, hoja `Hoja 1`). `build-data.js` toma
automáticamente el `Panel*.xlsx` **más reciente** de la carpeta.

> **Arquitectura separada:** `login.html` (acceso) → `index.html`
> (estructura) + `styles.css` (estilos) + `dashboard.js` (lógica) +
> `data/municipios.json` (datos via `fetch`). Para desarrollo local usa un
> servidor http (`npx serve .` o `python -m http.server`); abrir con `file://`
> bloquea `fetch` y el CSS relativo por CORS. En GitHub Pages funciona directo.

## Acceso (login)

Pantalla `login.html` con usuarios y roles en `data/usuarios.json`
(contraseñas en SHA-256). `auth.js` redirige a `login.html` si no hay sesión
válida (`sessionStorage`, 8 h). Roles:

| Rol | Permisos |
|---|---|
| `admin` | Todo: ver, exportar, gestionar usuarios |
| `capturista` | Ver municipios y exportar |
| `consulta` | Solo lectura (botón exportar oculto) |
| `coordinador` | Solo SUS municipios + botón Filtros convertido en **Exportar Excel directo** (sin drawer de filtros) |

Coordinadores de zona (14): user `primer_nombre.primer_apellido`,
password `primer_apellido.segundo_apellido` (minúsculas, sin acentos).
Cada uno solo ve los municipios de su `coordinador_zona`.
Regenerar tras cambios en el Panel: `node tools/gen-coordinadores.js`.

Usuarios iniciales: `admin` / `admin123` y `consulta` / `consulta123`
(cambiar tras el primer acceso). Nueva contraseña:

```bat
node tools/hash-password.js "MiClave123"   :: imprime el SHA-256 para pegar en data/usuarios.json
```

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `login.html` | Pantalla de acceso (usuario + contraseña). Redirige a `index.html` si ya hay sesión. |
| `login.js` | Valida contra `data/usuarios.json` (SHA-256 en el navegador) y guarda la sesión. |
| `auth.js` | Guardia de sesión para `index.html` + permisos por rol (`fortaCanExport`, `fortaCanManageUsers`). |
| `data/usuarios.json` | Usuarios, roles y hashes SHA-256. |
| `tools/hash-password.js` | Genera el hash SHA-256 de una contraseña para `data/usuarios.json`. |
| `tools/gen-coordinadores.js` | Genera los 14 usuarios coordinador desde `coordinador_zona` en `data/municipios.json` (user/pass + alcance por zona). |
| `index.html` | Solo estructura HTML. Enlaza `styles.css` y carga `auth.js` + `dashboard.js`, que trae los 212 registros via `fetch` desde `data/municipios.json`. Requiere http(s) — no abrir con doble clic. |
| `styles.css` | Todos los estilos del panel (extraído de `index.html`). |
| `dashboard.js` | Filtros, búsqueda global, tarjetas, vista de detalle y exportación. Carga `data/municipios.json` via `fetch` (única fuente). |
| `data/municipios.json` | Datos (36 campos del Excel + `metricas`/`etiquetas`/`metadata` heredados + `votos_partidos`, dato estructurado que no se exporta). |
| `data/localidades.json` | Lista de localidades por municipio extraída del PEL de casillas (`build-localidades.js`): 212 municipios, 3078 localidades con clave, nombre y manzana. |
| `data/votos.json` | Votos por partido y municipio calculados desde los 3 reportes del SEE (`build-votos.js`): por votación, una barra por partido con su `%` sobre el total de votos **a partidos**. |
| `localidades-por-municipio.csv` | La misma lista, una fila por localidad, separador `;` y BOM UTF-8 para Excel en español. |
| `build-data.js` | **Conversor Excel → JSON.** Lee el `.xlsx` sin dependencias (ZIP + `zlib`) y actualiza `data/municipios.json` (UNICA fuente). Por defecto toma el `Panel*.xlsx` **más reciente** de la carpeta. |
| `build-localidades.js` | **Conversor PEL → lista de localidades.** Lee el `PEL*.xlsx` más reciente, agrupa la columna K (`clave) NOMBRE [manzana]`) por municipio, genera `data/localidades.json` (+ CSV derivado) y **corrige `secciones_detalle`** en `data/municipios.json` (ver sección *Localidades por municipio*). |
| `build-votos.js` | **Votos por partido desde el SEE.** Lee los 3 listados del SEE (`2025_SEE_AYUN_VER_MUN`, `2024_SEE_DIP_LOC_MR_VER_MUN`, `2024_SEE_DIP_FED_MR_NAL_MUN`), calcula por municipio y votación una barra por partido con su `%` sobre el total de votos **a partidos** (sin coaliciones, ni candidatos independientes, ni nulos) y guarda el campo `votos_partidos` en `data/municipios.json` y `data/votos.json`. Ver sección *Votos por partido*. |
| `verify.js` | Verificación de integridad (5 secciones; comprueba que `index.html` NO lleve datos embebidos). |
| `smoke-ui.js` | Prueba de renderizado: ejecuta `dashboard.js` con un DOM simulado + `data/municipios.json`. |
| `inspect-xlsx.js` | **Radiografía de un Excel nuevo**: hojas que trae, columna por columna (título real, campo del JSON, filas con dato, formato, valor descartado) y diferencias contra `data/municipios.json`. Útil cada vez que llega una versión nueva del panel. |

## Comandos

```bat
node build-data.js            :: regenera data/municipios.json desde el Excel
node build-data.js --check    :: solo valida el Excel, no escribe nada
node build-data.js "Otro.xlsx":: usa otra fuente
node build-localidades.js      :: lista de localidades desde el PEL + corrige secciones_detalle
node build-localidades.js --check :: solo informa qué cambiaría, no escribe nada
node build-votos.js            :: votos por partido desde los SEE + guarda votos_partidos
node build-votos.js --check    :: solo calcula y muestra, no escribe nada
node inspect-xlsx.js "Nuevo.xlsx" :: radiografía del Excel (columnas nuevas, hojas, cambios vs. el JSON)
node verify.js                :: integrity check (espera 212 municipios, 39 campos)
node smoke-ui.js              :: smoke test de tarjetas y detalle
```

### Cuando llega un Excel nuevo

```bat
node inspect-xlsx.js "Panel FORTA 30-09-2026.xlsx"   :: 1) que trae este archivo
node build-localidades.js                            :: 2) lista del PEL vigente + corrige la plataforma
node build-data.js --check                           :: 3) que el mapeo lo entiende
node build-data.js                                   :: 4) regenerar datos + HTML
node verify.js && node smoke-ui.js                   :: 5) no rompimos nada
```

`build-data.js` **no** lee las hojas auxiliares del libro (`Hoja1` es un resumen
de presidentes/secretarios y `Hoja 1-1` la tabla de coordinador/municipio/local/
distrito); solo trabaja sobre `Hoja 1`. Si algún día se quisieran, habría que
mapearlas aparte.

## Mapeo de columnas (Excel → JSON)

Versión actual: **`Panel FORTA 08-10-2026.xlsx`**, hoja `Panel`.

`A zona` · `B coordinador_zona` · `C prioridad` · `E numero de municipio` ·
`F municipio` · `G secciones_detalle` (sin título en el Excel: desglose tipo
`1. ACAJETE | 9. LA JOYA | ...`) · `H distrito_local` (`DISTRITO LOCAL
ELECTORAL`) · `I distrito_federal` · `J listado_nominal` · `K secciones` ·
`L rutas` · `M casillas` · `N total_ediles` · `O votos_2024_locales` ·
`P pct_2024_locales` · `Q votos_2024_federales` · `R pct_2024_federales` ·
`S votos_2025_alcaldes` · `T pct_2025` · `U pp_diputado_federal` ·
`V pp_diputado_local` · `W pp_presidente_municipal` · `X regidores_pan` ·
`Y militantes` · `Z consejero_estatal` · `AB estatus_estructura` ·
`AC soldados` · `AD meta_afiliados` · `AE vigencia` ·
`AH presidente_estructura` · `AI presidente_genero` · `AJ presidente_telefono` ·
`AL secretario_general` · `AM secretario_genero` · `AN secretario_telefono` ·
`AO secretario_fecha_nacimiento`

`AO` está marcada como **opcional** (es la columna que se agregó el 30-09-2026):
si un Excel no la trae, el campo sale `null` y el build sigue funcionando; si
viene, su título tiene que coincidir como el de las demás.

En la versión 08-10-2026 todo se recorre una letra (`AO`→`AP`, etc.) porque la
columna `G` ahora trae el desglose de secciones (`secciones_detalle`) y `H` ya
dice `DISTRITO LOCAL ELECTORAL`. Además `Z` ahora es `CONSEJERO ESTATAL` (antes
se ignoraba por vacía) y hay 7 estatus más con estructura que en la versión
anterior (CO 26→32, DM 14→15, sin estatus 68→61).

Se ignoran por vacías o casi vacías: `D **DELEGADO`, `Z CONSEJERO NACIONAL`,
`AE FINANCIAMIENTO`, `AF EJERCICIO`, `AJ FECHA NACIMIENTO` (presidente, 2 datos).
Si cambian el orden o el nombre de los encabezados, `build-data.js` falla y avisa
en vez de leer datos torcidos.

## Localidades por municipio

`build-localidades.js` extrae del PEL de casillas (una fila por casilla) la
lista de localidades de cada municipio: **212 municipios, 3078 localidades**.
La localidad viene en la columna K (`"1) ACAJETE 0006"` = `clave) NOMBRE
[manzana]`); la manzana se separa a un campo propio y el nombre se queda tal
cual lo trae el INE (sin acentos). Salida: `data/localidades.json` (por
municipio, con clave+nombre+manzana y distritos) y
`localidades-por-municipio.csv` (una fila por localidad).

**En la interfaz:** en la vista de detalle del municipio las localidades se
muestran como un desplegable (`Localidades (n)`) que **solo se despliega al
hacer clic** y **sin la numeración** ("1. ACAJETE | 9. LA JOYA" se pinta como
ACAJETE, LA JOYA). Se implementa con `<details>`/`<summary>` nativo, sin JS.
La clave numérica no se borra de los datos: sigue en `data/localidades.json`,
en el campo `secciones_detalle` (búsqueda global y exportación) y en el CSV.

**Corrección aplicada a la plataforma:** el campo `secciones_detalle` del
Panel traía la lista **corrimida** en 199 de 212 municipios (el municipio N
lista las localidades de otro, p. ej. el mun 7 listaba las de BENITO JUAREZ),
aunque los totales globales coincidían (3078 = 3078): era un corrimiento del
dato del Panel, no localidades de más o de menos. `build-localidades.js`
sustituye ese valor por la lista del PEL en `data/municipios.json`
(13-10-2026: 199 municipios corregidos, el cruce contra el PEL queda
cruce contra el PEL queda IDÉNTICO) y `build-data.js` vuelve a aplicar la
misma corrección cada vez que regenera desde un Excel del Panel, así que no
se pierde en el siguiente build. Orden:

```bat
node build-localidades.js   :: 1) lista desde el PEL + corrige la plataforma
node build-data.js          :: 2) regenera desde el Panel (re-aplica la lista)
node verify.js && node smoke-ui.js
```

Si `data/localidades.json` no existe, `build-data.js` avisa y deja el valor
del Panel sin tocar (nunca se rompe el build por esto). Nota: `inspect-xlsx.js`
compara el Panel contra `data/municipios.json`, así que al inspeccionar un
Excel nuevo mostrará diferencias en `secciones_detalle` — es esperado: la
plataforma ya lleva la lista del PEL.

## Votos por partido

`build-votos.js` lee los tres listados municipales del SEE (OPLE Veracruz) y
calcula, por municipio y por votación, los **votos de cada partido**:

| Reporte SEE | Votación |
|---|---|
| `2025_SEE_AYUN_VER_MUN.xlsx` | alcaldes 2025 |
| `2024_SEE_DIP_LOC_MR_VER_MUN.xlsx` | diputados locales 2024 |
| `2024_SEE_DIP_FED_MR_NAL_MUN.xlsx` | diputados federales 2024 |

La unión con la plataforma es `ID_MUNICIPIO` = *numero de municipio* (1..212,
coincide exacto con el panel). Solo se leen las columnas de partido (`PAN`,
`PRI`, `PRD`, `PVEM`, `PT`, `MC`, `MORENA`); las columnas de **coalición**
(`PAN_PRI_PRD`, `FXMV`, `PVEM_MORENA`, …), los **candidatos independientes**
(`CAND_IND*`) y los **votos nulos** quedan fuera por definición. El `%` de cada
barra se saca sobre el **total de votos a partidos** del municipio (las barras
de una votación suman ~100%).

**En la interfaz:** la vista de detalle del municipio ya **no** muestra los tres
pasteles de "votos del PAN vs resto del listado nominal". En su lugar, la
sección *Votaciones · Votos por partido* dibuja **tres gráficas de barras
horizontales** (una por votación), cada una ordenada de mayor a menor, con el
color de cada partido y una leyenda con su `%`. Los viejos `%` de la tarjeta
(`pct_2024_locales`, `pct_2024_federales`, `pct_2025`) siguen igual: son los del
Panel y no se tocan.

`votos_partidos` es un dato **estructurado** (objeto), por eso **no** se exporta
al CSV/Excel y se excluye de la validación de "35 campos" de `verify.js`, igual
que `metricas`/`etiquetas`/`metadata`. `build-data.js` lo re-aplica desde
`data/votos.json` en cada regeneración (si ese archivo no existe, avisa y sigue).
Orden completo al actualizar todo:

```bat
node build-localidades.js   :: lista de localidades desde el PEL
node build-votos.js         :: votos por partido desde los SEE
node build-data.js          :: regenera desde el Panel (re-aplica ambos campos)
node verify.js && node smoke-ui.js
```

## Detalles a tener en cuenta

- **Estatus**: ahora el Excel trae el nombre completo (`Comité Directivo Municipal`,
  `Delegación Municipal`, `Comisión Organizadora`). `estatusClass()`/`estatusShort()`
  los convierten a los badges `b-cdm` (CDM), `b-dm` (DM) y `b-co` (CO).
- **Porcentajes (`% 2024` / `% 2025`)**: en `data/municipios.json` y en la interfaz
  todos son **porcentaje real (0-100)**. La unidad no se adivina por el tamaño del
  número: `build-data.js` lee el **formato de cada celda** en `xl/styles.xml`. Una
  celda con formato `0.00%` guarda la fracción (`0.1713` → se multiplica ×100 y se
  lee 17.13%); una celda sin formato de porcentaje (`General`) guarda el número que
  ya es porcentaje. En este Excel: `O` y `Q` tienen formato `0.00%` las 212 celdas,
  `S` no tiene ninguna, así que allí `0.3927` es **0.39%**, no 39%. Por eso
  `pctValue()` de `dashboard.js` ya no escala nada (devuelve el valor tal cual).
  `node build-data.js` imprime cuántas celdas de cada columna venían con `0.00%`.
- **Regla de oro**: el numero de la celda **es** el porcentaje. No se infiere nada
  comparando con el listado nominal ni con los votos; solo se respeta lo que el
  Excel muestra en pantalla.
- **Guardia contra errores de unidad**: `node build-data.js --check` rechaza
  cualquier porcentaje fuera de 0-100. `verify.js` y `smoke-ui.js` comprueban que un
  `0.3927` del Excel se muestre como `0.39%` y nunca como `39.27%`.
- **Teléfonos**: se normalizan a `AAA BBB CCCC`. En el panel 30-09-2026 quedaron
  corregidos los tres largos que venía arrastrando la versión anterior (BOCA DEL
  RÍO, SAN RAFAEL y TOMATLÁN ahora tienen 10 dígitos) y `verify.js` solo avisa de
  uno: IXHUATLÁN DEL CAFÉ, cuyo teléfono de secretario tiene 9 dígitos
  (`27 122 6347`). Se deja tal cual, no se inventan dígitos.
- **Candidatos del PAN 2025**: columna `AP` eliminada a petición: ya no se lee del
  Excel, no se guarda en los datos ni se muestra en el panel o la exportación.
- **Fechas**: `excelDate()` admite series de Excel de 1932 en adelante y también
  fechas escritas como texto `dd/mm/aaaa`. Aun así, una celda de
  `secretario_fecha_nacimiento` se queda vacía por defecto de origen: en SAN RAFAEL
  dice `27/1171959` (le falta una barra). Son 34 fechas de las 35 celdas rellenas.
- **Fecha de nacimiento del secretario (`secretario_fecha_nacimiento`)**: ya **no se
  muestra en el dashboard** (dato personal): se quitó de la vista de detalle del
  municipio. El valor sigue intacto en `data/municipios.json` y en la exportación
  Excel/CSV por si en algún momento se necesita.
- **`prioridad`**: en esta versión el Excel ya no arrastra el nombre del delegado
  pegado al código (`G20 - GALILEO APOLO FLORES CRUZ` volvió a ser `G20`).
