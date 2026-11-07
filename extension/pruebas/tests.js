import '../shared.js';
import { reportHTML } from '../report.js';
import { selectMenuMedia } from '../export.js';

const {
  newSession, record, recordContent, publicSession, identifyPlatform,
  platformProfile, buildMenuModel, menuDensity, allocateTasteCounts
} = TrackerCore;

const results = [];
function assert(condition, label) {
  if (!condition) throw new Error(label);
  results.push('✓ ' + label);
}

function approximately(actual, expected) {
  return Math.abs(actual - expected) < 0.000000000001;
}

try {
  // Cada web se reconoce por su dominio y, en Shorts y Reels, por su ruta.
  const cases = {
    'https://mail.google.com/mail/u/0': 'Gmail',
    'https://docs.google.com/document/d/example': 'Google Docs',
    'https://docs.google.com/spreadsheets/d/example': 'Google Sheets',
    'https://docs.google.com/presentation/d/example': 'Google Slides',
    'https://docs.google.com/forms/d/example': 'Google Forms',
    'https://drive.google.com/drive/u/0': 'Google Drive',
    'https://www.instagram.com/reels/example': 'Instagram Reels',
    'https://www.facebook.com/reel/123': 'Facebook Reels',
    'https://www.linkedin.com/jobs': 'LinkedIn',
    'https://www.pinterest.com/': 'Pinterest',
    'https://www.pinterest.es/pin/123': 'Pinterest',
    'https://uk.pinterest.com/': 'Pinterest',
    'https://pin.it/example': 'Pinterest',
    'https://word.cloud.microsoft/': 'Microsoft Word',
    'https://excel.cloud.microsoft/': 'Microsoft Excel',
    'https://powerpoint.cloud.microsoft/': 'Microsoft PowerPoint',
    'https://outlook.office.com/mail/': 'Outlook',
    'https://www.youtube.com/shorts/example': 'YouTube Shorts',
    'https://www.youtube.com/watch?v=example': 'YouTube',
    'https://x.com/home': 'Twitter (X)',
    'https://twitter.com/home': 'Twitter (X)',
    'https://play.hbomax.com/': 'HBO Max',
    'https://www.max.com/': 'HBO Max',
    'https://tv.apple.com/es': 'Apple TV',
    'https://www.marca.com/': 'Marca',
    'https://example.org/app': 'example.org',
    'https://notyoutube.com/': 'notyoutube.com',
    'chrome://extensions': null
  };
  for (const [address, expected] of Object.entries(cases)) {
    assert(identifyPlatform(address) === expected, 'Clasificación: ' + expected);
  }

  // Pantalla, sin depender de que haya un reproductor activo.
  const session = newSession(0);
  record(session, { platform: 'YouTube', active: true }, 0);
  record(session, { platform: 'YouTube', active: true, playing: false }, 1000);
  assert(session.totals.YouTube === 1000, 'Un vídeo pausado sigue sumando pantalla');
  record(session, { platform: 'Gmail', active: true }, 1500);
  record(session, { platform: 'Gmail', active: true }, 2500);
  assert(session.totals.YouTube === 1500 && session.totals.Gmail === 1000,
    'Cada intervalo se atribuye a la web que estaba en pantalla');
  record(session, { platform: null, active: false }, 3000);
  record(session, { platform: null, active: false }, 4000);
  assert(session.totals.Gmail === 1500, 'Una ventana sin foco no suma');
  record(session, { platform: 'Netflix', active: true }, 5000);
  record(session, { platform: 'Netflix', active: true }, 20000);
  assert(!session.totals.Netflix, 'La suspensión no rellena tiempo');
  record(session, { platform: 'Netflix', active: true }, 21000);
  assert(session.totals.Netflix === 1000, 'El catálogo suma sin reproducción');

  // Reanudar contenido modifica su registro; no crea otra visita.
  const video = {
    platform: 'YouTube',
    playing: true,
    title: '<script>alert(1)</script>',
    url: 'https://www.youtube.com/watch?v=a'
  };
  recordContent(session, video, 1000);
  recordContent(session, { ...video, playing: false }, 2000);
  recordContent(session, { ...video, tabId: 2 }, 5000);
  assert(session.videos.length === 1, 'Pausar o cambiar de pestaña no duplica un vídeo');
  assert(session.videos[0].seenAt === 1000 && session.videos[0].lastSeenAt === 5000,
    'Se conservan la primera y la última reproducción');
  recordContent(session, { ...video, url: 'https://www.youtube.com/watch?v=b' }, 6000);
  recordContent(session, video, 7000);
  assert(session.videos.length === 2, 'Volver a un vídeo anterior no lo duplica');
  const short = {
    ...video, platform: 'YouTube Shorts', url: 'https://www.youtube.com/watch?v=short'
  };
  recordContent(session, short, 8000);
  recordContent(session, short, 9000);
  assert(session.videos.length === 3, 'Los Shorts se registran una vez por URL y sesión');

  const stream = {
    platform: 'Twitch',
    playing: true,
    title: 'Directo de prueba',
    channel: 'canal',
    url: 'https://www.twitch.tv/canal'
  };
  recordContent(session, stream, 10000);
  recordContent(session, { ...stream, title: 'Título actualizado' }, 11000);
  assert(session.streams.length === 1 && session.streams[0].channel === 'canal',
    'Twitch conserva el canal sin duplicados');
  assert(session.streams[0].title === 'Título actualizado', 'El título del directo se actualiza');
  assert(!('last' in publicSession(session)), 'El JSON no exporta el contador interno');

  // Las cantidades proceden de las tarifas editoriales definidas en el proyecto.
  for (const [platform, taste, rate] of [
    ['TikTok', 'salado', 0.0001],
    ['YouTube Shorts', 'salado', 0.0001],
    ['YouTube', 'salado', 0.002],
    ['Twitch', 'salado', 0.002],
    ['Instagram', 'dulce', 0.003],
    ['Pinterest', 'dulce', 0.003],
    ['Twitter (X)', 'acido', 0.003],
    ['Gmail', 'amargo', 0.002],
    ['Microsoft Excel', 'amargo', 0.002],
    ['LinkedIn', 'amargo', 0.01],
    ['Marca', 'amargo', 0.001],
    ['Netflix', 'umami', 0.004],
    ['HBO Max', 'umami', 0.004],
    ['Apple TV', 'umami', 0.004]
  ]) {
    const profile = platformProfile(platform);
    assert(profile.taste === taste && profile.rate === rate, 'Sabor y tarifa: ' + platform);
  }
  assert(platformProfile('example.org').rate === null,
    'Una web sin tarifa permanece sin estimación asignada');
  assert(platformProfile('Google').taste === null && platformProfile('Google').rate === null,
    'El buscador Google queda fuera de los sabores y la cuenta');
  assert(platformProfile('Google Inventado').taste === null,
    'El nombre de una aplicación no basta para incluirla en la cuenta');

  const menuSession = {
    startedAt: 1,
    endedAt: 900001,
    metric: 'screen',
    totals: {
      YouTube: 120000,
      'YouTube Shorts': 60000,
      Instagram: 180000,
      Gmail: 60000,
      LinkedIn: 60000,
      Netflix: 120000,
      'Twitter (X)': 60000,
      'example.org': 60000
    },
    videos: session.videos,
    streams: session.streams
  };
  const model = buildMenuModel([menuSession], 900001);
  assert(model.durationMs === 900000 && model.totalTimeMs === 720000,
    'La duración de sesión y el tiempo de pantalla se conservan por separado');
  assert(approximately(model.totalAmount, 0.0361), 'La cuenta utiliza minutos exactos por tarifa');
  assert(model.tastes.length === 5, 'El resumen conserva los cinco sabores consumidos');
  assert(model.menuTastes.length === 5 && model.menuTastes === model.tastes,
    'El plato mezcla todos los sabores consumidos');
  const applicationWinner = buildMenuModel([{
    startedAt: 0, endedAt: 720000,
    totals: { YouTube: 240000, TikTok: 180000, Instagram: 300000 }
  }]);
  assert(approximately(applicationWinner.menuTastes.find(taste => taste.id === 'salado').weight,
    420000 / 720000), 'Las aplicaciones del mismo sabor suman su tiempo para la mezcla');
  const tied = buildMenuModel([{
    startedAt: 0, endedAt: 120000, totals: { YouTube: 60000, Netflix: 60000 }
  }]);
  assert(tied.menuTastes.every(taste => taste.weight === 0.5),
    'Dos sabores con el mismo tiempo tienen la misma proporción');
  const unknownWinner = buildMenuModel([{
    startedAt: 0, endedAt: 120000, totals: { 'example.org': 70000, YouTube: 50000 }
  }]);
  assert(unknownWinner.menuTastes.length === 1 && unknownWinner.menuTastes[0].id === 'salado',
    'Un dominio desconocido no oculta los sabores de las demás aplicaciones');
  assert(approximately(model.tastes.reduce((sum, taste) => sum + taste.weight, 0), 1),
    'El peso de los sabores se normaliza sobre el tiempo clasificado');
  assert(model.items.find(item => item.platform === 'example.org').rate === null,
    'Los datos conservan las webs sin clasificar');
  assert(!model.receiptItems.some(item => item.platform === 'example.org') &&
    model.receiptTimeMs === 660000, 'El total del ticket suma solo las plataformas incluidas');
  const withGoogle = buildMenuModel([{
    startedAt: 0, endedAt: 900000,
    totals: { Google: 300000, YouTube: 420000, Instagram: 180000 }
  }]);
  assert(withGoogle.receiptItems.length === 2 && withGoogle.receiptTimeMs === 600000 &&
    approximately(withGoogle.menuTastes[0].weight, 0.7),
    'Google no aparece en la cuenta ni altera una mezcla de 70 % y 30 %');
  for (const section of ['media', 'descriptions', 'backgrounds']) {
    const slots = withGoogle.composition[section];
    const total = slots.reduce((sum, slot) => sum + slot.count, 0);
    assert(Math.abs(slots.find(slot => slot.id === 'salado').count / total - 0.7) <= 1 / total,
      'Proporción redondeada por tiempo: ' + section);
  }
  const tinyTaste = allocateTasteCounts([
    { id: 'salado', weight: 0.999 }, { id: 'dulce', weight: 0.001 }
  ], 18);
  assert(tinyTaste[1].count === 1 && tinyTaste.reduce((sum, slot) => sum + slot.count, 0) === 18,
    'Los sabores minoritarios conservan una pieza sin aumentar la densidad');
  assert(allocateTasteCounts([], 18).length === 0,
    'Una composición sin sabores no crea piezas');
  for (const section of ['media', 'descriptions']) {
    const expected = section === 'media' ? model.density.mediaCount : model.density.textCount;
    assert(model.composition[section].reduce((sum, slot) => sum + slot.count, 0) === expected &&
      model.composition[section].every(slot => slot.count >= 1),
      'Cinco sabores conservan la densidad total: ' + section);
  }
  const emptyDensity = menuDensity(0);
  const middleDensity = menuDensity(22.5 * 60000);
  const longDensity = menuDensity(45 * 60000);
  assert(emptyDensity.scaleMinutes === 45 && emptyDensity.mediaCount === 120 && emptyDensity.textCount === 72 &&
    emptyDensity.progress === 0, 'La escala empieza con 120 miniaturas y 72 frases');
  assert(middleDensity.mediaCount === 69 && middleDensity.textCount === 42 &&
    middleDensity.progress === 0.5, 'A los 22,5 minutos se alcanza la mitad de la escala');
  assert(longDensity.mediaCount === 18 && longDensity.textCount === 12 &&
    longDensity.progress === 1, 'A los 45 minutos quedan 18 miniaturas y 12 frases');
  const densitySteps = Array.from({ length: 451 }, (_, index) => menuDensity(index * 6000));
  assert(densitySteps.every((step, index) => !index ||
    step.mediaCount <= densitySteps[index - 1].mediaCount &&
    step.textCount <= densitySteps[index - 1].textCount &&
    step.progress >= densitySteps[index - 1].progress),
    'La cantidad disminuye de forma continua entre cero y 45 minutos');
  assert([60 * 60000, 120 * 60000, Infinity].every(value =>
    JSON.stringify(menuDensity(value)) === JSON.stringify(longDensity)),
    'Las sesiones superiores a 45 minutos conservan la separación máxima');
  assert([-60000, -Infinity, NaN].every(value =>
    JSON.stringify(menuDensity(value)) === JSON.stringify(emptyDensity)),
    'Las duraciones negativas o no válidas se tratan como cero');
  assert(model.density.mediaCount === menuDensity(model.durationMs).mediaCount &&
    model.density.mediaCount !== menuDensity(model.totalTimeMs).mediaCount,
    'La densidad depende de la sesión completa, incluidas sus pausas');

  // La selección comparte pocas fuentes y mantiene todos los sabores presentes.
  const catalogue = { media: [], hashtags: {} };
  for (const taste of ['salado', 'dulce', 'amargo', 'acido', 'umami']) {
    catalogue.hashtags[taste] = ['#' + taste, '#pantalla'];
    for (let index = 0; index < 12; index++) {
      catalogue.media.push({ id: taste + index, taste, kind: 'video' });
    }
    for (let index = 0; index < 3; index++) {
      catalogue.media.push({ id: taste + '-foto' + index, taste, kind: 'image' });
    }
  }
  const selected = selectMenuMedia(catalogue, model.menuTastes);
  assert(selected.filter(item => item.kind === 'video').length === 12 &&
    model.menuTastes.every(taste => selected.some(item => item.taste === taste.id)),
    'Doce fuentes de vídeo se reparten entre todos los sabores');
  assert(selectMenuMedia(catalogue, [{ id: 'dulce', weight: 1 }]).length === 10,
    'Un solo sabor incorpora ocho vídeos y dos fotos');
  assert(new Set(selected.map(item => item.id)).size === selected.length,
    'La selección base no repite archivos');
  assert(selected.every(item => item.description === catalogue.hashtags[item.taste].join(' ')),
    'Cada vídeo y foto usa los hashtags completos de su sabor');
  assert(selectMenuMedia(catalogue, []).length === 0,
    'No se inventan sabores cuando la sesión está vacía');

  // El documento incluye scripts legítimos; los textos nunca se ejecutan como código.
  const malicious = '</script><script>window.hacked = true</script>';
  const report = reportHTML([menuSession], 'body { background: white; }', {
    model,
    assets: {
      media: [{
        id: 'prueba', taste: 'dulce', kind: 'image',
        src: 'data:image/png;base64,AA==', title: malicious, description: malicious
      }],
      backgrounds: [{ taste: 'dulce', src: 'data:image/png;base64,AA==' }]
    },
    fontData: 'data:font/ttf;base64,AA==',
    runtime: 'window.menuReady = true;'
  });
  const payloadMatch = report.match(
    /<script id="menu-datos" type="application\/json">([\s\S]*?)<\/script>/
  );
  assert(Boolean(payloadMatch), 'El menú guarda sus datos en un bloque JSON');
  assert(!payloadMatch[1].includes('<'), 'El JSON no puede cerrar su etiqueta de script');
  const payload = JSON.parse(payloadMatch[1]);
  assert(payload.media[0].title === malicious && !report.includes(malicious),
    'El texto se conserva sin permitir inyección de HTML');
  assert(payload.model.content.some(item => item.title === video.title),
    'Los títulos se conservan como datos dentro del JSON protegido');
  assert(!report.includes('class="contenido-registrado"') &&
    !report.includes('<summary>Contenido registrado</summary>'),
    'El ticket no muestra el apartado de contenido registrado');
  assert(report.includes('PIDE LA CUENTA') && report.includes('Ticket de contenido'),
    'El documento incluye el control y el ticket');
  const googleReport = reportHTML([menuSession], '', { model: withGoogle });
  const ticketRows = googleReport.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  assert(!ticketRows.includes('Google') && ticketRows.includes('YouTube') &&
    ticketRows.includes('Instagram'), 'El HTML del ticket excluye el buscador Google');
  assert(report.includes('No representa pagos ni ingresos reales'),
    'Los importes se identifican como estimaciones');
  assert(payload.media.every(item => item.src.startsWith('data:')) &&
    report.includes('data:font/ttf;base64,AA==') && report.includes('window.menuReady = true;'),
    'Medios, tipografía y reproductor se incorporan sin recursos remotos');
  assert(!reportHTML([], '', {}).includes('undefined'), 'Una sesión vacía también se puede exportar');

  const paused = {
    paused: true, ended: false, readyState: 4, clientWidth: 1920, clientHeight: 1080
  };
  const playing = {
    paused: false, ended: false, readyState: 2, clientWidth: 1280, clientHeight: 720
  };
  assert(TrackerMedia.select([paused, playing], () => true) === playing,
    'El detector prioriza el vídeo activo');
  assert(!TrackerMedia.advancing(playing, 1000, 3000),
    'No se registra contenido sin avance reciente');

  document.getElementById('results').textContent =
    results.join('\n') + '\n\nTodas las pruebas han pasado.';
} catch (error) {
  document.getElementById('results').textContent =
    results.join('\n') + '\n\nERROR: ' + error.message;
  throw error;
}
