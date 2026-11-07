param(
    [string]$Destino = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$extensionRoot = Join-Path $projectRoot 'extension'
if (-not $Destino) {
    $Destino = Join-Path $projectRoot 'landing\descargas\buffet-visual-extension.zip'
}
$Destino = [System.IO.Path]::GetFullPath($Destino)
$destinationFolder = Split-Path -Parent $Destino
$temporaryArchive = Join-Path $destinationFolder (
    '.buffet-visual-' + [guid]::NewGuid().ToString('N') + '.zip'
)
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
$stagingRoot = Join-Path $tempRoot ('BuffetVisual-' + [guid]::NewGuid().ToString('N'))
$stagingExtension = Join-Path $stagingRoot 'extension'
if (-not $stagingRoot.StartsWith($tempRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'La carpeta de empaquetado debe permanecer dentro del directorio temporal.'
}

try {
    New-Item -ItemType Directory -Path $stagingExtension -Force | Out-Null
    New-Item -ItemType Directory -Path $destinationFolder -Force | Out-Null
    foreach ($file in Get-ChildItem -LiteralPath $extensionRoot -File) {
        if ($file.Extension -in @('.js', '.html', '.css', '.json')) {
            Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $stagingExtension $file.Name)
        }
    }
    Copy-Item -LiteralPath (Join-Path $extensionRoot 'assets') -Destination (
        Join-Path $stagingExtension 'assets'
    ) -Recurse
    $instructions = @'
BUFFET VISUAL
1. Descomprime este ZIP en una carpeta que vayas a conservar.
2. Abre chrome://extensions, edge://extensions o brave://extensions.
3. Activa Modo de desarrollador y pulsa Cargar descomprimida.
4. Selecciona la carpeta extension que acompaña a este texto.
5. Fija Buffet Visual en la barra del navegador y recarga YouTube y Twitch.
6. Haz clic en la tarjeta para avanzar por la presentación. Después pulsa PULSA AQUÍ PARA EMPEZAR.
7. Cuando termines de comer, responde sí: se descargará tu plato digital HTML.

No necesitas Python, PHP, servidor ni conexión para consultar el HTML descargado.
Clic derecho en la extensión > Opciones: exportar historial, JSON y limpiar datos.
Los importes del ticket son estimaciones del proyecto, no pagos ni ingresos reales.
'@
    [System.IO.File]::WriteAllText(
        (Join-Path $stagingRoot 'LEEME.txt'),
        $instructions,
        [System.Text.UTF8Encoding]::new($false)
    )
    # Separadores ZIP estándar para que se descomprima también en macOS y Linux.
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stream = [System.IO.File]::Open($temporaryArchive, [System.IO.FileMode]::CreateNew)
    $archive = [System.IO.Compression.ZipArchive]::new(
        $stream, [System.IO.Compression.ZipArchiveMode]::Create, $false
    )
    try {
        foreach ($file in Get-ChildItem -LiteralPath $stagingRoot -Recurse -File) {
            $entryName = $file.FullName.Substring($stagingRoot.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive,
                $file.FullName,
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    } finally {
        $archive.Dispose()
        $stream.Dispose()
    }
    # Sustituye la descarga solo después de cerrar el ZIP completo.
    if (Test-Path -LiteralPath $Destino -PathType Leaf) {
        [System.IO.File]::Replace($temporaryArchive, $Destino, [NullString]::Value)
    } else {
        [System.IO.File]::Move($temporaryArchive, $Destino)
    }
    Write-Output ('Paquete preparado: ' + $Destino)
} finally {
    if (Test-Path -LiteralPath $temporaryArchive) {
        $archiveFolder = [System.IO.Path]::GetDirectoryName(
            [System.IO.Path]::GetFullPath($temporaryArchive)
        )
        if ($archiveFolder -ne $destinationFolder -or
            [System.IO.Path]::GetFileName($temporaryArchive) -notlike '.buffet-visual-*.zip') {
            throw 'Ruta temporal de archivo no válida.'
        }
        Remove-Item -LiteralPath $temporaryArchive -Force
    }
    if (Test-Path -LiteralPath $stagingRoot) {
        $resolvedStaging = [System.IO.Path]::GetFullPath($stagingRoot)
        if (-not $resolvedStaging.StartsWith($tempRoot + '\BuffetVisual-', [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'Ruta temporal de limpieza no válida.'
        }
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force
    }
}
