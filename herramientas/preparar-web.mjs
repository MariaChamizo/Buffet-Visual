import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extensionFiles, verifyProject, verifyWeb } from './verificar-proyecto.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.preview', 'site');
const archiveName = 'buffet-visual-extension.zip';

await verifyProject();

// Publicamos una copia cerrada de la web, nunca la carpeta del proyecto completa.
if (resolve(output) !== resolve(root, '.preview', 'site')) {
  throw new Error('La salida debe estar dentro de .preview/site.');
}
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'descargas'), { recursive: true });
for (const name of ['index.html', 'camarero.html', 'styles.css', 'main.js', 'assets']) {
  await cp(join(root, 'landing', name), join(output, name), { recursive: true });
}

const archivePath = join(output, 'descargas', archiveName);
if (process.platform === 'win32') {
  execFileSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    join(root, 'herramientas', 'empaquetar.ps1'), '-Destino', archivePath
  ], { stdio: 'inherit', windowsHide: true });
} else {
  // GitHub Actions incluye zip; Node no añade dependencias al proyecto.
  const temporary = await mkdtemp(join(tmpdir(), 'buffet-visual-web-'));
  try {
    for (const name of await extensionFiles()) {
      const destination = join(temporary, 'extension', name);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(root, 'extension', name), destination);
    }
    await writeFile(join(temporary, 'LEEME.txt'), [
      'BUFFET VISUAL',
      '1. Descomprime este ZIP y conserva la carpeta extension.',
      '2. Abre chrome://extensions, edge://extensions o brave://extensions.',
      '3. Activa Modo de desarrollador y pulsa Cargar descomprimida.',
      '4. Selecciona la carpeta extension y fija su icono en el navegador.',
      '5. Recarga las pestañas de YouTube y Twitch que ya estuvieran abiertas.',
      '6. Avanza por la bienvenida con clics y pulsa PULSA AQUÍ PARA EMPEZAR.',
      '7. Cuando termines, responde sí para descargar tu plato digital HTML.',
      '',
      'Clic derecho en el icono > Opciones: exportar historial, JSON o limpiar datos.',
      'Los datos se guardan en tu navegador. El HTML funciona sin conexión.',
      'Los importes del ticket son estimaciones, no pagos ni ingresos reales.',
      ''
    ].join('\n'));
    execFileSync('zip', ['-q', '-r', archivePath, 'extension', 'LEEME.txt'], {
      cwd: temporary, stdio: 'inherit'
    });
  } finally {
    if (dirname(temporary) !== resolve(tmpdir()) ||
        !basename(temporary).startsWith('buffet-visual-web-')) {
      throw new Error('La carpeta temporal del ZIP no es válida.');
    }
    await rm(temporary, { recursive: true, force: true });
  }
}

await verifyWeb(output);
const size = (await readFile(archivePath)).byteLength / 1048576;
console.log('Web preparada en .preview/site. Extensión: ' + size.toFixed(2) + ' MB.');
