# Script PowerShell para generar mapa de municipios y actualizar Firestore
# Ejecutar en PowerShell desde la carpeta del proyecto

$ErrorActionPreference = "Stop"

# Leer archivo de municipios locales
$dataPath = Join-Path $PSScriptRoot "data" "municipios.json"
$data = Get-Content $dataPath -Raw | ConvertFrom-Json

Write-Host "Total municipios en archivo local: $($data.Count)" -ForegroundColor Cyan

# Extraer mapa de nombre -> numero de municipio
$mapaNumeros = @{}
$duplicados = @()

$data | ForEach-Object {
    $nombre = $_.municipio
    $numero = $_.'numero de municipio'
    
    if (-not $nombre) {
        Write-Host "⚠️ Municipio sin nombre" -ForegroundColor Yellow
        return
    }
    
    if ($numero -eq $null -or $numero -eq "") {
        Write-Host "⚠️ Municipio sin número: $nombre" -ForegroundColor Yellow
        return
    }
    
    if ($mapaNumeros.ContainsKey($nombre)) {
        if (-not ($duplicados -contains $nombre)) {
            $duplicados += $nombre
        }
        Write-Host "⚠️ DUPLICADO: $nombre (número anterior: $($mapaNumeros[$nombre]), número nuevo: $numero)" -ForegroundColor Yellow
    } else {
        $mapaNumeros[$nombre] = $numero
    }
}

Write-Host "`n=== RESUMEN ===" -ForegroundColor Cyan
Write-Host "Total municipios únicos: $($mapaNumeros.Count)" -ForegroundColor Green
Write-Host "Nombres duplicados: $($duplicados.Count)" -ForegroundColor Yellow
if ($duplicados.Count -gt 0) {
    Write-Host "Lista de duplicados: $($duplicados -join ', ')" -ForegroundColor Yellow
}

# Generar script JavaScript para consola del navegador
$jsMap = $mapaNumeros | ConvertTo-Json -Depth 10

$script = @"
// Script para agregar campo "numero de municipio" a TODOS los municipios en Firestore
// Ejecutar en la consola del navegador (F12 > Consola) después de hacer login

(async function() {
    const mapaNumeros = $jsMap;

    console.log('🔄 Iniciando actualización de TODOS los municipios en Firestore...');
    
    const snapshot = await window.firebaseFirestore.collection('municipios').get();
    let actualizados = 0;
    let noEncontrados = 0;
    let errores = 0;
    
    for (const doc of snapshot.docs) {
        const d = doc.data();
        if (d.municipio && mapaNumeros[d.municipio] !== undefined) {
            try {
                await doc.ref.update({ 'numero de municipio': mapaNumeros[d.municipio] });
                actualizados++;
            } catch (e) {
                errores++;
                console.error('❌ Error al actualizar', d.municipio, ':', e.message);
            }
        } else {
            noEncontrados++;
            console.log('⚠️ No se encontró número para:', d.municipio);
        }
    }
    
    console.log('\n📊 RESUMEN:');
    console.log('   ✅ Actualizados:', actualizados);
    console.log('   ⚠️ No encontrados en mapa:', noEncontrados);
    console.log('   ❌ Errores:', errores);
    
    if (actualizados > 0) {
        console.log('\n🎉 ¡Municipios actualizados!');
        console.log('   Recarga la página (Ctrl+F5) para ver los cambios.');
    }
})();
"@

$outputPath = Join-Path $PSScriptRoot "fix_firebase_todos_municipios.js"
$script | Out-File -FilePath $outputPath -Encoding utf8
Write-Host "`n✅ Script generado: $outputPath" -ForegroundColor Green
Write-Host "   Ejecuta este archivo en la consola del navegador (F12 > Consola)" -ForegroundColor Green