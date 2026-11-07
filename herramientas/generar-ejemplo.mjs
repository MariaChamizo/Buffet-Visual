import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'extension', 'export.js'), 'utf8');
const shared = await readFile(join(root, 'extension', 'shared.js'), 'utf8');
const report = await readFile(join(root, 'extension', 'report.js'), 'utf8');
const strip = text => text.replace(/^import[\s\S]*?;\s*/gm, '').replace(/^export /gm, '');
const fetchLocal = async path => {
  const data = await readFile(join(root, 'extension', path));
  return {
    ok: true,
    text: async () => data.toString('utf8'),
    json: async () => JSON.parse(data.toString('utf8')),
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  };
};
const makeExport = new Function('fetch', shared + '\n' + strip(report) + '\n' +
  strip(source) + '\nreturn createMenuExport;')(fetchLocal);
const endedAt = Date.now();
let session = {
  id: 'ejemplo-sin-datos-personales',
  metric: 'screen',
  startedAt: endedAt - 25 * 60000,
  endedAt,
  totals: {
    YouTube: 8 * 60000,
    'YouTube Shorts': 2 * 60000,
    Instagram: 5 * 60000,
    LinkedIn: 3 * 60000,
    'Twitter (X)': 2 * 60000,
    Netflix: 5 * 60000
  },
  videos: [],
  streams: []
};
let outputName = 'ejemplo-buffet.html';
const repairIndex = process.argv.indexOf('--reparar');
if (repairIndex >= 0) {
  const input = process.argv[repairIndex + 1];
  if (!input) throw new Error('Indica la ruta del HTML después de --reparar.');
  const original = await readFile(input, 'utf8');
  const match = original.match(
    /<script id="menu-datos" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) throw new Error('El archivo no contiene datos de Buffet Visual.');
  const { model } = JSON.parse(match[1]);
  if (model.sessionsCount !== 1) {
    throw new Error('Para un historial de varias sesiones, vuelve a exportar desde la extensión.');
  }
  session = {
    id: basename(input, '.html'),
    metric: 'screen',
    startedAt: model.startedAt,
    endedAt: model.endedAt,
    totals: Object.fromEntries(model.items.map(item => [item.platform, item.timeMs])),
    videos: (model.content || []).filter(item => item.platform === 'YouTube'),
    streams: (model.content || []).filter(item => item.platform === 'Twitch')
  };
  outputName = basename(input, '.html') + '-reparada.html';
}
const outputIndex = process.argv.indexOf('--salida');
if (outputIndex >= 0) {
  const name = process.argv[outputIndex + 1];
  if (!name || basename(name) !== name || !name.endsWith('.html')) {
    throw new Error('Indica un nombre HTML dentro de informes/ después de --salida.');
  }
  outputName = name;
}
await mkdir(join(root, 'informes'), { recursive: true });
const html = await makeExport([session], name => name);
await writeFile(join(root, 'informes', outputName), html);
console.log('Informe generado: informes/' + outputName +
  ' (' + (Buffer.byteLength(html) / 1048576).toFixed(2) + ' MB).');
