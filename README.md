# Panel de Fortalecimiento Interno

Dashboard de 212 municipios (Veracruz) con datos del Excel del panel (última
versión: **`Panel FORTA 30-09-2026.xlsx`**, hoja `Hoja 1`). `build-data.js` toma
automáticamente el `Panel*.xlsx` **más reciente** de la carpeta.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `dashboard.html` | Panel autocontenido: CSS + HTML + los 212 registros embebidos como JSON. Se abre con doble clic, sin servidor. |
| `dashboard.js` | Filtros, búsqueda global, tarjetas, vista de detalle y exportación. |
| `data/municipios.json` | Datos (36 campos del Excel + `metricas`/`etiquetas`/`metadata` heredados). |
| `build-data.js` | **Conversor Excel → JSON.** Lee el `.xlsx` sin dependencias (ZIP + `zlib`) y actualiza `data/municipios.json` y el bloque JSON de `dashboard.html`. Por defecto toma el `Panel*.xlsx` **más reciente** de la carpeta. |
| `verify.js` | Verificación de integridad (5 secciones). |
| `smoke-ui.js` | Prueba de renderizado: ejecuta `dashboard.js` con un DOM simulado. |
| `inspect-xlsx.js` | **Radiografía de un Excel nuevo**: hojas que trae, columna por columna (título real, campo del JSON, filas con dato, formato, valor descartado) y diferencias contra `data/municipios.json`. Útil cada vez que llega una versión nueva del panel. |

## Comandos

```bat
node build-data.js            :: regenera datos + HTML embebido desde el Excel
node build-data.js --check    :: solo valida el Excel, no escribe nada
node build-data.js "Otro.xlsx":: usa otra fuente
node inspect-xlsx.js "Nuevo.xlsx" :: radiografía del Excel (columnas nuevas, hojas, cambios vs. el JSON)
node verify.js                :: integrity check (espera 212 municipios, 39 campos)
node smoke-ui.js              :: smoke test de tarjetas y detalle
```

### Cuando llega un Excel nuevo

```bat
node inspect-xlsx.js "Panel FORTA 30-09-2026.xlsx"   :: 1) que trae este archivo
node build-data.js --check                           :: 2) que el mapeo lo entiende
node build-data.js                                   :: 3) regenerar datos + HTML
node verify.js && node smoke-ui.js                   :: 4) no rompimos nada
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
`AO secretario_fecha_nacimiento` · `AP candidatos_pan_2025`

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
- **Candidatos del PAN 2025 (`candidatos_pan_2025`)**: columna `AO`, viene llena en
  los 212 municipios con un solo nombre cada una. En el Excel **37 de ellos llegan
  escritos con `**` delante** (la marca del autor, la misma de los títulos
  `**PRIORIDAD` y `**DELEGADO`); el tipo `name` de `build-data.js` limpia esa marca
  y `node build-data.js` avisa cuántas celdas venían marcadas, así que la
  información no se pierde en silencio. Si el `**` significa algo (candidatura
  confirmada, pendiente, etc.) habría que guardarla en su propio campo.
- **Fechas**: `excelDate()` admite series de Excel de 1932 en adelante y también
  fechas escritas como texto `dd/mm/aaaa`. Aun así, una celda de
  `secretario_fecha_nacimiento` se queda vacía por defecto de origen: en SAN RAFAEL
  dice `27/1171959` (le falta una barra). Son 34 fechas de las 35 celdas rellenas.
- **`prioridad`**: en esta versión el Excel ya no arrastra el nombre del delegado
  pegado al código (`G20 - GALILEO APOLO FLORES CRUZ` volvió a ser `G20`).
