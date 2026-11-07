import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extension = join(root, 'extension');
const tastes = ['salado', 'dulce', 'amargo', 'acido', 'umami'];
const runtime = /\.(?:js|css|html|json)$/;
const asset = /\.(?:json|png|jpe?g|webp|gif|mp4|webm|ttf|woff2?|txt)$/i;

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'No se publican enlaces simbólicos: ' + entry.name);
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await filesIn(join(directory, entry.name), name + '/'));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

export async function extensionFiles() {
  const files = [];
  for (const entry of await readdir(extension, { withFileTypes: true })) {
    if (entry.isFile() && runtime.test(entry.name)) files.push(entry.name);
  }
  for (const name of await filesIn(join(extension, 'assets'))) {
    assert(asset.test(name), 'Recurso no previsto en el ZIP: assets/' + name);
    files.push('assets/' + name);
  }
  return files.sort();
}

async function existingFile(base, path) {
  assert(typeof path === 'string' && path && !path.includes('\\'), 'Ruta no válida: ' + path);
  const clean = path.split(/[?#]/, 1)[0];
  const absolute = resolve(base, clean);
  assert(absolute.startsWith(resolve(base) + sep), 'Ruta fuera de su carpeta: ' + path);
  assert((await lstat(absolute)).isFile(), 'Falta un archivo: ' + path);
  return absolute;
}

export async function verifyProject() {
  const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
  const compatibility = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, compatibility.version, 'Los manifiestos deben compartir versión');
  assert.equal(manifest.manifest_version, 3);
  const references = [
    manifest.background.service_worker, manifest.options_page,
    manifest.action.default_popup, ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap(script => script.js)
  ];
  for (const path of references) await existingFile(extension, path);

  const catalogue = JSON.parse(await readFile(join(extension, 'assets/catalogo.json'), 'utf8'));
  assert.equal(catalogue.version, 2);
  assert.deepEqual(catalogue.backgrounds.map(item => item.taste).sort(), [...tastes].sort());
  const ids = new Set();
  for (const taste of tastes) {
    assert(catalogue.hashtags[taste]?.length, 'Faltan las etiquetas de ' + taste);
    assert(catalogue.hashtags[taste].every(tag => /^#[^\s#]+$/.test(tag)), 'Etiqueta no válida: ' + taste);
  }
  for (const item of [...catalogue.media, ...catalogue.backgrounds]) {
    assert(tastes.includes(item.taste), 'Sabor desconocido');
    assert(/^assets\/(?:media|backgrounds)\/[a-z0-9.-]+$/.test(item.src), 'Ruta no válida en catálogo');
    await existingFile(extension, item.src);
    if (item.poster) await existingFile(extension, item.poster);
    if (item.id) {
      assert(!ids.has(item.id), 'Identificador repetido: ' + item.id);
      ids.add(item.id);
      assert(['image', 'video'].includes(item.kind), 'Tipo de medio no válido');
    }
  }
  for (const name of ['popup', 'gestion', 'report']) {
    const scss = await readFile(join(extension, name + '.scss'), 'utf8');
    const css = await readFile(join(extension, name + '.css'), 'utf8');
    assert.equal(css, scss, 'Regenera los estilos de extensión: ' + name);
  }
  await extensionFiles();
  console.log('Proyecto: manifiestos, catálogo, recursos y estilos verificados.');
}

// Leemos el directorio ZIP para contrastar cada archivo con su fuente.
function zipEntries(bytes) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 &&
        offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
      end = offset;
      break;
    }
  }
  assert(end >= 0, 'El ZIP está incompleto');
  const entries = new Map();
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, 'Directorio ZIP no válido');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const packedSize = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;
    assert(!name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'),
      'Ruta no válida en ZIP: ' + name);
    assert(!entries.has(name), 'Entrada repetida en ZIP: ' + name);
    if (name.endsWith('/')) continue;
    assert(!(flags & 1), 'No se admiten archivos cifrados');
    assert.equal(bytes.readUInt32LE(localOffset), 0x04034b50);
    const dataOffset = localOffset + 30 + bytes.readUInt16LE(localOffset + 26) +
      bytes.readUInt16LE(localOffset + 28);
    const packed = bytes.subarray(dataOffset, dataOffset + packedSize);
    assert(method === 0 || method === 8, 'Compresión ZIP no compatible');
    const content = method === 8 ? inflateRawSync(packed) : packed;
    assert.equal(content.length, size, 'Archivo truncado en ZIP: ' + name);
    entries.set(name, content);
  }
  return entries;
}

async function verifyZip(path) {
  const entries = zipEntries(await readFile(path));
  const expected = (await extensionFiles()).map(name => 'extension/' + name);
  assert.deepEqual([...entries.keys()].sort(), [...expected, 'LEEME.txt'].sort(),
    'El ZIP debe contener solo la extensión y sus instrucciones');
  for (const name of expected) {
    assert.deepEqual(entries.get(name), await readFile(join(root, name)), 'ZIP desactualizado: ' + name);
  }
  assert(entries.get('LEEME.txt').toString('utf8').includes('BUFFET VISUAL'));
  return entries.size;
}

export async function verifyWeb(directory = join(root, '.preview/site')) {
  const base = resolve(directory);
  const files = await filesIn(base);
  const permitted = name => ['index.html', 'camarero.html', 'styles.css', 'main.js'].includes(name) ||
    name === 'descargas/buffet-visual-extension.zip' || (name.startsWith('assets/') && asset.test(name)) ||
    name === 'assets/gsap.min.js';
  assert(files.every(permitted), 'La web contiene archivos ajenos a la publicación');
  for (const name of ['index.html', 'camarero.html', 'styles.css', 'main.js']) {
    await existingFile(base, name);
  }

  const origin = new URL('https://example.invalid/buffet-visual/');
  let links = 0;
  for (const name of ['index.html', 'camarero.html', 'styles.css']) {
    const source = await readFile(join(base, name), 'utf8');
    const references = name.endsWith('.css')
      ? [...source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)].map(match => match[1])
      : [...source.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(match => match[1]);
    for (const reference of references) {
      if (/^(?:https?:|mailto:|tel:|data:)/i.test(reference)) continue;
      const url = new URL(reference, new URL(name, origin));
      assert(url.origin === origin.origin && url.pathname.startsWith(origin.pathname),
        'Un enlace falla al alojar en una subcarpeta: ' + reference);
      const target = decodeURIComponent(url.pathname.slice(origin.pathname.length)) || 'index.html';
      await existingFile(base, target);
      if (url.hash && target.endsWith('.html')) {
        const html = await readFile(join(base, target), 'utf8');
        assert(html.includes('id="' + decodeURIComponent(url.hash.slice(1)) + '"'),
          'Ancla inexistente: ' + reference);
      }
      links++;
    }
  }
  const entries = await verifyZip(join(base, 'descargas/buffet-visual-extension.zip'));
  console.log('Web: ' + links + ' rutas bajo /buffet-visual/ y ' + entries +
    ' archivos ZIP verificados. No incluye historial ni datos personales.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyProject();
  if (process.argv.includes('--web')) await verifyWeb();
}
