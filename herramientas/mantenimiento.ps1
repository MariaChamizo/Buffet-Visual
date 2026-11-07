param(
    [switch]$Informes,
    [string]$Origen = (Join-Path $env:USERPROFILE 'Downloads\Tracker')
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$extensionRoot = Join-Path $projectRoot 'extension'

function Update-LandingStyles {
    $source = Join-Path $projectRoot 'landing\main.scss'
    $destination = Join-Path $projectRoot 'landing\styles.css'
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    $buildRoot = [IO.Path]::GetFullPath((Join-Path $tempBase (
        'BuffetVisual-Sass-' + [guid]::NewGuid().ToString('N')
    )))
    if (-not $buildRoot.StartsWith($tempBase + '\BuffetVisual-Sass-',
        [StringComparison]::OrdinalIgnoreCase)) {
        throw 'La carpeta temporal de Sass no es válida.'
    }

    try {
        New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
        $compiled = Join-Path $buildRoot 'styles.css'
        $sassCommand = Get-Command sass -ErrorAction SilentlyContinue
        if ($sassCommand) {
            & $sassCommand.Source --no-source-map --style=expanded `
                --silence-deprecation=import $source $compiled
        } else {
            # El compilador portátil evita instalar Node o modificar el sistema.
            $sassVersion = '1.108.1'
            $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
            $archiveName = 'dart-sass-' + $sassVersion + '-windows-' + $architecture + '.zip'
            $downloadURL = 'https://github.com/sass/dart-sass/releases/download/' +
                $sassVersion + '/' + $archiveName
            $archivePath = Join-Path $buildRoot $archiveName
            Invoke-WebRequest -Uri $downloadURL -OutFile $archivePath -UseBasicParsing
            Expand-Archive -LiteralPath $archivePath -DestinationPath $buildRoot
            $dart = Join-Path $buildRoot 'dart-sass\src\dart.exe'
            $snapshot = Join-Path $buildRoot 'dart-sass\src\sass.snapshot'
            & $dart $snapshot --no-source-map --style=expanded `
                --silence-deprecation=import $source $compiled
        }
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $compiled -PathType Leaf)) {
            throw 'No se ha podido compilar landing/main.scss.'
        }
        # Solo sustituye el CSS cuando Sass ha terminado sin errores.
        Copy-Item -LiteralPath $compiled -Destination $destination
    } finally {
        $cleanupRoot = [IO.Path]::GetFullPath($buildRoot)
        if (-not $cleanupRoot.StartsWith($tempBase + '\BuffetVisual-Sass-',
            [StringComparison]::OrdinalIgnoreCase)) {
            throw 'La carpeta temporal de limpieza no es válida.'
        }
        if (Test-Path -LiteralPath $cleanupRoot) {
            Remove-Item -LiteralPath $cleanupRoot -Recurse -Force
        }
    }
}

if (-not $Informes) {
    # Los estilos de la extensión siguen siendo compatibles con CSS.
    foreach ($name in @('popup', 'report', 'gestion')) {
        $source = Join-Path $extensionRoot ($name + '.scss')
        $destination = Join-Path $extensionRoot ($name + '.css')
        Copy-Item -LiteralPath $source -Destination $destination
    }
    Update-LandingStyles
    Write-Output 'Estilos actualizados.'
    return
}

if (-not (Test-Path -LiteralPath $Origen -PathType Container)) {
    Write-Output ('No hay descargas en ' + $Origen)
    Write-Output 'Usa -Origen si tu navegador guarda los archivos en otra carpeta.'
    return
}

# Incluye las descargas anteriores, que estaban directamente en Tracker.
$sourceFolders = @(
    @{ Path = $Origen; Destination = '' },
    @{ Path = (Join-Path $Origen 'informes'); Destination = 'informes' },
    @{ Path = (Join-Path $Origen 'historial'); Destination = 'historial' },
    @{ Path = (Join-Path $Origen 'datos'); Destination = 'datos' }
)
$copied = 0
foreach ($folder in $sourceFolders) {
    if (-not (Test-Path -LiteralPath $folder.Path -PathType Container)) {
        continue
    }
    foreach ($file in Get-ChildItem -LiteralPath $folder.Path -File) {
        if ($file.Extension -notin @('.html', '.json') -or
            $file.Name -notmatch '^(Plato Digital |Historial |sesion-|historial-)') {
            continue
        }
        $directory = if ($file.Extension -eq '.json') { 'datos' }
            elseif ($folder.Destination) { $folder.Destination }
            elseif ($file.Name -like 'historial-*') { 'historial' }
            else { 'informes' }
        $destinationRoot = Join-Path $projectRoot $directory
        New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null
        $destination = Join-Path $destinationRoot $file.Name
        if (Test-Path -LiteralPath $destination) {
            continue
        }
        Copy-Item -LiteralPath $file.FullName -Destination $destination
        $copied++
    }
}

Write-Output ('Archivos copiados al proyecto: ' + $copied)
Write-Output 'Las descargas originales y los archivos ya existentes se conservan.'
