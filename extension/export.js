import './shared.js?v=3.9.0';
import { reportHTML } from './report.js?v=3.9.0';

const mimeTypes = {
  mp4: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', png: 'image/png', ttf: 'font/ttf'
};
const byteBudget = 10 * 1024 * 1024;

async function readAsset(resourceURL, path, format = 'text') {
  const response = await fetch(resourceURL(path), { cache: 'no-store' });
  if (!response.ok) throw new Error('Falta un recurso del menú: ' + path);
  return response[format]();
}

function dataURL(buffer, path) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  const extension = path.split('.').at(-1).toLowerCase();
  return 'data:' + (mimeTypes[extension] || 'application/octet-stream') +
    ';base64,' + btoa(binary);
}

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const next = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[next]] = [copy[next], copy[index]];
  }
  return copy;
}

// Compartimos como máximo doce fuentes de vídeo entre todos los sabores del plato.
export function selectMenuMedia(catalogue, tastes) {
  const videoSlots = TrackerCore.allocateTasteCounts(tastes, tastes.length === 1 ? 8 : 12);
  return tastes.flatMap(taste => {
    const hashtags = catalogue.hashtags?.[taste.id];
    if (!Array.isArray(hashtags) || !hashtags.length) {
      throw new Error('Faltan los hashtags de un sabor. Recarga la extensión completa.');
    }
    const items = catalogue.media.filter(item => item.taste === taste.id);
    const count = videoSlots.find(slot => slot.id === taste.id)?.count || 0;
    const videos = shuffled(items.filter(item => item.kind === 'video')).slice(0, count);
    const images = shuffled(items.filter(item => item.kind === 'image')).slice(0, 2);
    return [...videos, ...images].map(item => ({
      ...item,
      description: hashtags.join(' ')
    }));
  });
}

export async function createMenuExport(sessions, resourceURL) {
  const [catalogue, styles, runtime, font] = await Promise.all([
    readAsset(resourceURL, 'assets/catalogo.json', 'json'),
    readAsset(resourceURL, 'report.css'),
    readAsset(resourceURL, 'report-player.js'),
    readAsset(resourceURL, 'assets/kode-mono.ttf', 'arrayBuffer')
  ]);
  const model = TrackerCore.buildMenuModel(sessions);
  if (!model.composition || !Array.isArray(model.receiptItems)) {
    throw new Error('El motor del menú está desactualizado. Recarga la extensión y vuelve a servir la sesión.');
  }
  if (!styles.includes('.bocado') || !styles.includes('.pedir-cuenta') ||
      !runtime.includes('menu-datos')) {
    throw new Error('Los recursos del menú están desactualizados. Recarga la extensión.');
  }
  const media = [];
  const backgrounds = [];
  let embeddedBytes = 0;

  async function embed(path) {
    if (!/^assets\/(?:media|backgrounds)\/[a-z0-9.-]+$/.test(path)) {
      throw new Error('Ruta de recurso no válida en el catálogo.');
    }
    const buffer = await readAsset(resourceURL, path, 'arrayBuffer');
    embeddedBytes += buffer.byteLength;
    if (embeddedBytes > byteBudget) throw new Error('Los recursos del plato superan 10 MB.');
    return dataURL(buffer, path);
  }

  const selected = selectMenuMedia(catalogue, model.menuTastes);
  if (model.menuTastes.some(taste => !selected.some(item => item.taste === taste.id))) {
    throw new Error('Faltan recursos de uno de los sabores. Recarga la extensión completa.');
  }
  for (const item of selected) {
    media.push({
      ...item,
      src: await embed(item.src),
      poster: item.poster ? await embed(item.poster) : ''
    });
  }
  const activeTastes = new Set(model.menuTastes.map(taste => taste.id));
  for (const background of catalogue.backgrounds) {
    if (activeTastes.has(background.taste)) {
      backgrounds.push({ ...background, src: await embed(background.src) });
    }
  }
  if (model.menuTastes.some(taste => !backgrounds.some(item => item.taste === taste.id))) {
    throw new Error('Falta el fondo ASCII de uno de los sabores.');
  }
  return reportHTML(sessions, styles, {
    model,
    assets: { media, backgrounds },
    fontData: dataURL(font, 'font.ttf'),
    runtime
  });
}
