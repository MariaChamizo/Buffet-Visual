import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const compatibility = process.argv.includes('--root');
const allowAutoplay = process.argv.includes('--allow-autoplay');
const pageFolder = compatibility ? 'extension/' : '';
const out = join(root, '.preview');
await mkdir(join(out, 'downloads'), { recursive: true });
const profile = join(out, 'extension-profile-' + Date.now());
await mkdir(join(profile, 'Default'), { recursive: true });
await writeFile(join(profile, 'Default', 'Preferences'), JSON.stringify({
  download: {
    default_directory: join(out, 'downloads'),
    prompt_for_download: false,
    directory_upgrade: true
  }
}));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// Chrome headless a veces demora «complete» aun después de escribir todos los bytes.
// También abrimos y validamos el archivo real, no solo el estado de la API.
const readyDownloads = `chrome.downloads.search({}).then(items => items.filter(item =>
  item.state === 'complete' ||
  (item.exists && item.totalBytes > 0 && item.bytesReceived === item.totalBytes)))`;
const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
  '--user-data-dir=' + profile,
  ...(allowAutoplay ? ['--autoplay-policy=no-user-gesture-required'] : [])
], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const pending = new Map();
let sequence = 0;
let buffer = '';
const decoder = new StringDecoder('utf8');
child.stdio[4].on('data', chunk => {
  buffer += decoder.write(chunk);
  let boundary;
  while ((boundary = buffer.indexOf('\0')) >= 0) {
    const text = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 1);
    if (!text) continue;
    const message = JSON.parse(text);
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
child.on('exit', () => {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error('Chrome se cerró.'));
  }
  pending.clear();
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Tiempo agotado: ' + method));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
}
async function evaluate(session, expression) {
  const response = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true
  }, session);
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function poll(callback, description, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await callback();
    if (result) return result;
    await wait(200);
  }
  throw new Error('No se completó: ' + description);
}
async function readDownload(filename) {
  return poll(async () => {
    try {
      const content = await readFile(filename, 'utf8');
      if (filename.endsWith('.html') && !content.trimEnd().endsWith('</html>')) return null;
      return content || null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }, 'escribir el archivo descargado', 300);
}
async function screenshot(session, name) {
  const response = await send('Page.captureScreenshot', { format: 'png' }, session);
  await writeFile(join(out, name + '.png'), Buffer.from(response.data, 'base64'));
}

async function ensureReportAudio(session) {
  const initial = await poll(() => evaluate(session, `(() => {
    const videos = [...document.querySelectorAll('video')];
    const button = document.getElementById('pausar-sonido');
    if (!button || !videos.length || videos.some(video => video.readyState < 2 || video.paused)) {
      return null;
    }
    const bounds = button.getBoundingClientRect();
    return {
      muted: videos.every(video => video.muted),
      audible: videos.every(video => !video.muted),
      label: button.textContent.trim(),
      visible: !button.hidden && bounds.width > 0 && bounds.height > 0,
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
  })()`), 'preparar los vídeos y su control de sonido');

  if (!initial.visible || (!initial.muted && !initial.audible)) {
    throw new Error('El estado inicial del sonido es incoherente: ' + JSON.stringify(initial));
  }
  if (initial.muted) {
    if (initial.label !== 'ACTIVAR SONIDO') {
      throw new Error('Chrome ha bloqueado el audio, pero el botón no ofrece activarlo.');
    }
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: initial.x, y: initial.y
    }, session);
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: initial.x, y: initial.y,
      button: 'left', buttons: 1, clickCount: 1
    }, session);
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: initial.x, y: initial.y,
      button: 'left', buttons: 0, clickCount: 1
    }, session);
    await poll(() => evaluate(session,
      "document.getElementById('pausar-sonido').textContent.trim() === 'DESACTIVAR SONIDO' && " +
      "[...document.querySelectorAll('video')].every(video=>!video.muted && !video.paused)"),
      'activar el sonido con un solo clic real');
    console.log('Audio del informe: Chrome pidió un clic; el botón lo activa con un único clic real.');
  } else {
    if (initial.label !== 'DESACTIVAR SONIDO') {
      throw new Error('El audio está activo, pero el botón no ofrece desactivarlo.');
    }
    console.log('Audio del informe: inició con sonido, sin necesitar un clic.');
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -10, y: -10 }, session);
  // Deja que el parallax se estabilice antes de medir el movimiento del carrusel.
  await wait(650);
}

function checkHashtags(payload, catalogue) {
  for (const item of payload.media) {
    const expected = catalogue.hashtags[item.taste]?.join(' ');
    if (!expected || item.description !== expected) {
      throw new Error('El HTML no contiene los hashtags exactos del sabor ' + item.taste);
    }
  }
}

async function checkBackgroundEdges(session) {
  await poll(() => evaluate(session, `(() => {
    const images = [...document.querySelectorAll('.fondo-ascii')];
    return images.length >= 5 && images.every(image => image.complete && image.naturalWidth > 0);
  })()`), 'cargar todos los fondos ASCII');
  const edges = await evaluate(session, `(() => {
    const boxes = [...document.querySelectorAll('.fondo-ascii')]
      .map(image => image.getBoundingClientRect());
    const visible = box => box.right > 0 && box.left < innerWidth &&
      box.bottom > 0 && box.top < innerHeight;
    return {
      visible: boxes.every(visible),
      left: boxes.some(box => visible(box) && box.left < 0 && box.right > 0),
      right: boxes.some(box => visible(box) && box.left < innerWidth && box.right > innerWidth),
      top: boxes.some(box => visible(box) && box.top < 0 && box.bottom > 0),
      bottom: boxes.some(box => visible(box) && box.top < innerHeight && box.bottom > innerHeight)
    };
  })()`);
  if (!Object.values(edges).every(Boolean)) {
    throw new Error('Los fondos ASCII no cubren los cuatro bordes: ' + JSON.stringify(edges));
  }
}

try {
  console.log(allowAutoplay ?
    'Chrome: autoplay permitido explícitamente para este escenario de prueba.' :
    'Chrome: política de audio normal, sin flags de autoplay.');
  const catalogue = JSON.parse(await readFile(join(root, 'extension/assets/catalogo.json'), 'utf8'));
  for (const taste of ['salado', 'dulce', 'amargo', 'acido', 'umami']) {
    const tags = catalogue.hashtags?.[taste];
    if (!Array.isArray(tags) || !tags.length || tags.some(tag => !/^#[^\s#]+$/.test(tag))) {
      throw new Error('El catálogo no define correctamente los hashtags de ' + taste);
    }
  }
  const { id } = await send('Extensions.loadUnpacked', {
    path: compatibility ? root : join(root, 'extension')
  });
  console.log('Extensión cargada: ' + id);
  const popup = await send('Target.createTarget', {
    url: 'chrome-extension://' + id + '/' + pageFolder + 'popup.html'
  });
  const { sessionId } = await send('Target.attachToTarget', { targetId: popup.targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 252, height: 160, deviceScaleFactor: 1, mobile: false
  }, sessionId);
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  }, sessionId);
  await evaluate(sessionId, "chrome.storage.local.remove('buffetPopupStory')");
  await send('Page.reload', {}, sessionId);
  await wait(300);
  const typedFirst = await evaluate(sessionId, "document.getElementById('story').textContent.length");
  await wait(300);
  const typedNext = await evaluate(sessionId, "document.getElementById('story').textContent.length");
  if (!(typedFirst > 0 && typedNext > typedFirst && typedNext < 110)) {
    throw new Error('La bienvenida no se escribe letra por letra con movimiento reducido.');
  }
  console.log('Máquina de escribir: el texto crece letra por letra con movimiento reducido.');
  await wait(1600);
  await screenshot(sessionId, 'popup-escribiendo');
  await evaluate(sessionId, "if (!document.getElementById('story').textContent.endsWith(" +
    "'mientras comes...')) document.getElementById('continue').click()");
  await poll(() => evaluate(sessionId,
    "document.getElementById('story').textContent.includes('mientras comes...')"),
    'completar primera tarjeta sin avanzar');
  const firstCard = await evaluate(sessionId, "document.getElementById('story').textContent");
  await wait(1600);
  if (await evaluate(sessionId, "document.getElementById('story').textContent") !== firstCard) {
    throw new Error('La primera tarjeta avanzó sin un clic.');
  }
  await evaluate(sessionId, "document.getElementById('continue').click()");
  await poll(() => evaluate(sessionId,
    "document.getElementById('story').textContent.startsWith('...')"), 'segunda tarjeta');
  await evaluate(sessionId, "if (!document.getElementById('story').textContent.endsWith(" +
    "'solamente tiene que decirlo.')) document.getElementById('continue').click()");
  await poll(() => evaluate(sessionId,
    "document.getElementById('story').textContent.includes('solamente tiene que decirlo.')"),
    'completar segunda tarjeta');
  const secondCard = await evaluate(sessionId, "document.getElementById('story').textContent");
  await wait(1600);
  if (await evaluate(sessionId, "document.getElementById('story').textContent") !== secondCard) {
    throw new Error('La segunda tarjeta avanzó sin un clic.');
  }
  await send('Page.reload', {}, sessionId);
  await poll(() => evaluate(sessionId,
    "document.getElementById('story')?.textContent.includes('solamente tiene que decirlo.')"),
    'recuperar la tarjeta al reabrir');
  await evaluate(sessionId, "document.getElementById('continue').click()");
  await poll(() => evaluate(sessionId,
    "!document.getElementById('start').hidden && !document.getElementById('start').disabled"),
    'introducción y botón empezar');
  console.log('Tarjetas verificadas: esperan clic, completan escritura y conservan la página al reabrir.');
  await screenshot(sessionId, 'popup-empezar');
  await evaluate(sessionId, "document.getElementById('start').click()");
  await poll(() => evaluate(sessionId,
    "chrome.storage.local.get('tracker').then(data => Boolean(data.tracker?.active))"),
    'iniciar sesión real');
  await poll(() => evaluate(sessionId, "!document.getElementById('finish').hidden"), 'pregunta');
  await send('Page.reload', {}, sessionId);
  await wait(180);
  const questionLength = await evaluate(sessionId, "document.getElementById('story').textContent.length");
  if (!(questionLength > 0 && questionLength < '¿ha terminado ya?'.length)) {
    throw new Error('La pregunta no vuelve a escribirse al abrir la tarjeta.');
  }
  await poll(() => evaluate(sessionId, "!document.getElementById('finish').hidden"), 'pregunta reabierta');
  await screenshot(sessionId, 'popup-pregunta');
  const web = await send('Target.createTarget', { url: 'https://www.youtube.com/' });
  await send('Target.activateTarget', { targetId: web.targetId });
  await wait(3200);
  await send('Target.activateTarget', { targetId: popup.targetId });
  const state = await evaluate(sessionId,
    "chrome.storage.local.get('tracker').then(data => data.tracker)");
  console.log('Tiempo real por dominio, sin reproducir: ' + JSON.stringify(state.active.totals));
  if (!(state.active.totals.YouTube > 0)) throw new Error('YouTube no contó tiempo real sin vídeo.');
  await evaluate(sessionId, "document.getElementById('yes').click()");
  await poll(() => evaluate(sessionId,
    readyDownloads + '.then(items => items[0])'),
    'descarga HTML real');
  const result = await evaluate(sessionId,
    'Promise.all([' + readyDownloads + ",chrome.storage.local.get('tracker')])" +
    ".then(([downloads,data]) => ({downloads:downloads.map(d=>({filename:d.filename,state:d.state})),active:data.tracker.active,sessions:data.tracker.sessions.length}))");
  console.log('Resultado real: ' + JSON.stringify(result));
  await screenshot(sessionId, 'popup-servido');
  const report = result.downloads[0]?.filename;
  if (!report) throw new Error('No existe el informe descargado.');
  if (!/Plato Digital \d{2}-\d{2}-\d{4}_\d{2}-\d{2}-\d{2}(?: \(\d+\))?\.html$/.test(report)) {
    throw new Error('El nombre del plato no incluye la fecha y hora pedidas.');
  }
  const html = await readDownload(report);
  if (!html.includes('data:video/mp4;base64,') || !html.includes('PIDE LA CUENTA')) {
    throw new Error('El informe no incorporó los vídeos o la cuenta.');
  }
  console.log('HTML real autónomo verificado: ' + html.length + ' caracteres.');
  const payload = JSON.parse(html.match(
    /<script id="menu-datos" type="application\/json">([\s\S]*?)<\/script>/
  )[1]);
  checkHashtags(payload, catalogue);
  if (payload.model.menuTastes.length !== 1 || payload.model.menuTastes[0].id !== 'salado' ||
      !payload.media.length || payload.media.some(item => item.taste !== 'salado') ||
      !payload.backgrounds.length || payload.backgrounds.some(item => item.taste !== 'salado')) {
    throw new Error('El sabor del archivo real no corresponde a YouTube.');
  }
  const reportPage = await send('Target.createTarget', { url: 'about:blank' });
  const reportSession = (await send('Target.attachToTarget', {
    targetId: reportPage.targetId, flatten: true
  })).sessionId;
  await send('Page.enable', {}, reportSession);
  await send('Runtime.enable', {}, reportSession);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 832, deviceScaleFactor: 1, mobile: false
  }, reportSession);
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  }, reportSession);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -10, y: -10 }, reportSession);
  await send('Page.navigate', { url: pathToFileURL(report).href }, reportSession);
  await wait(2500);
  await ensureReportAudio(reportSession);
  await checkBackgroundEdges(reportSession);
  const visible = await evaluate(reportSession, `(() => {
    const pieces = [...document.querySelectorAll('.bocado')];
    const item = pieces.find(piece => {
      const rect = piece.getBoundingClientRect();
      return rect.x > 20 && rect.x < 1000;
    });
    item?.setAttribute('data-moving-test', 'true');
    const button = document.getElementById('pedir-cuenta');
    const soundButton = document.getElementById('pausar-sonido');
    return {
      styled: getComputedStyle(button).position === 'fixed' &&
        getComputedStyle(document.body).fontFamily.includes('Kode Mono'),
      font: document.fonts.check('12px "Kode Mono"'),
      pieces: pieces.length,
      videos: [...document.querySelectorAll('video')].filter(video => video.readyState >= 2).length,
      audio: [...document.querySelectorAll('video')].every(video =>
        !video.muted && !video.paused && Math.abs(video.volume - 0.14) < 0.001),
      soundControl: soundButton && !soundButton.hidden &&
        soundButton.getBoundingClientRect().width > 0 &&
        soundButton.textContent.trim() === 'DESACTIVAR SONIDO' &&
        !document.getElementById('activar-sonido'),
      backgrounds: [...document.querySelectorAll('.fondo-ascii')].filter(image =>
        image.complete && image.naturalWidth > 0).length,
      button: button.getBoundingClientRect().width > 100,
      x: item?.getBoundingClientRect().x
    };
  })()`);
  if (!visible.styled || !visible.font || !visible.pieces || !visible.videos ||
      !visible.backgrounds || !visible.button || !visible.audio || !visible.soundControl ||
      visible.x == null) {
    throw new Error('El archivo real no se está mostrando bien: ' + JSON.stringify(visible));
  }
  await wait(700);
  const moved = await evaluate(reportSession,
    "document.querySelector('[data-moving-test]').getBoundingClientRect().x");
  if (moved <= visible.x + 0.5) throw new Error('Las miniaturas no se desplazan.');
  await screenshot(reportSession, 'downloaded-menu');
  await evaluate(reportSession, "document.getElementById('pedir-cuenta').click()");
  if (!await evaluate(reportSession, "document.getElementById('cuenta').open")) {
    throw new Error('El botón de la cuenta no abre el ticket.');
  }
  await screenshot(reportSession, 'downloaded-ticket');
  console.log('HTML descargado abierto: CSS, Kode Mono, ' + visible.videos +
    ' vídeos, ' + visible.backgrounds + ' fondos ASCII, desplazamiento y ticket correctos.');
  const testPage = await send('Target.createTarget', {
    url: 'chrome-extension://' + id + '/' + pageFolder + 'pruebas/tests.html'
  });
  const testSession = await send('Target.attachToTarget', {
    targetId: testPage.targetId, flatten: true
  });
  const testResult = await poll(() => evaluate(testSession.sessionId,
    "document.getElementById('results')?.textContent.includes('Todas las pruebas han pasado') ?" +
    " document.getElementById('results').textContent : null"), 'pruebas de lógica en Chrome');
  console.log('Pruebas de lógica en Chrome: ' + (testResult.split('✓').length - 1) + ' correctas.');
  // Solo el perfil temporal recibe estos tiempos ficticios para probar una comida mixta.
  await evaluate(sessionId, `chrome.storage.local.get('tracker').then(async ({tracker}) => {
    const last = tracker.sessions.at(-1);
    last.startedAt = last.endedAt - 29 * 60000;
    last.totals = {
      YouTube: 8 * 60000, 'YouTube Shorts': 2 * 60000, Instagram: 5 * 60000,
      LinkedIn: 3 * 60000, 'Twitter (X)': 2 * 60000, Netflix: 5 * 60000,
      Google: 3 * 60000, 'example.org': 60000
    };
    await chrome.storage.local.set({tracker});
  })`);
  const optionsPage = await send('Target.createTarget', {
    url: 'chrome-extension://' + id + '/' + pageFolder + 'gestion.html'
  });
  const optionsSession = (await send('Target.attachToTarget', {
    targetId: optionsPage.targetId, flatten: true
  })).sessionId;
  await send('Page.enable', {}, optionsSession);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false
  }, optionsSession);
  await poll(() => evaluate(optionsSession,
    "document.getElementById('last') && !document.getElementById('last').disabled"),
    'activar servir última sesión');
  await screenshot(optionsSession, 'opciones');
  await evaluate(optionsSession, "document.getElementById('acciones').scrollIntoView()");
  await screenshot(optionsSession, 'opciones-acciones');
  await evaluate(optionsSession, "document.getElementById('last').click()");
  try {
    await poll(() => evaluate(optionsSession,
      readyDownloads + '.then(items => items.length > 1)'),
      'volver a servir última sesión');
  } catch (error) {
    console.log(await evaluate(optionsSession,
      "chrome.downloads.search({}).then(downloads=>({downloads,message:document.getElementById('message').textContent}))"));
    throw error;
  }
  console.log('Opciones: Servir última sesión vuelve a descargar el menú sin repetir la comida.');
  const mixedFile = await evaluate(optionsSession,
    readyDownloads + '.then(items => items.sort((a,b)=>b.startTime.localeCompare(a.startTime))[0].filename)');
  const mixedHTML = await readDownload(mixedFile);
  const mixedPayload = JSON.parse(mixedHTML.match(
    /<script id="menu-datos" type="application\/json">([\s\S]*?)<\/script>/
  )[1]);
  checkHashtags(mixedPayload, catalogue);
  await send('Target.activateTarget', { targetId: reportPage.targetId });
  await send('Page.navigate', { url: pathToFileURL(mixedFile).href }, reportSession);
  await wait(2500);
  await ensureReportAudio(reportSession);
  await checkBackgroundEdges(reportSession);
  const mixture = await evaluate(reportSession, `(() => {
    const payload = JSON.parse(document.getElementById('menu-datos').textContent);
    const sections = {media: '.bocado', descriptions: '.frase', backgrounds: '.fondo-ascii'};
    const counts = {};
    for (const [key, selector] of Object.entries(sections)) {
      counts[key] = {};
      for (const element of document.querySelectorAll(selector)) {
        counts[key][element.dataset.taste] = (counts[key][element.dataset.taste] || 0) + 1;
      }
      for (const slot of payload.model.composition[key]) {
        if (counts[key][slot.id] !== slot.count) throw new Error('Cuota incorrecta: ' + key + slot.id);
      }
    }
    const tagsByTaste = new Map(payload.media.map(item =>
      [item.taste, new Set(item.description.split(' ').filter(Boolean))]));
    for (const phrase of document.querySelectorAll('.frase')) {
      const tag = phrase.textContent.trim();
      if (!/^#[^\\s#]+$/.test(tag) || !tagsByTaste.get(phrase.dataset.taste)?.has(tag) ||
          phrase.scrollWidth > phrase.clientWidth + 1 ||
          phrase.scrollHeight > phrase.clientHeight + 1) {
        throw new Error('El carrusel debe mostrar hashtags sueltos y propios de cada sabor.');
      }
    }
    const rows = document.querySelector('.ticket-lineas tbody').textContent;
    if (rows.includes('Google') || rows.includes('example.org')) throw new Error('Ticket sin filtrar');
    if (payload.model.receiptTimeMs !== 25 * 60000) throw new Error('Total de ticket incorrecto');
    return counts;
  })()`);
  console.log('Mezcla proporcional real descargada: ' + JSON.stringify(mixture));
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:1265,y:815}, reportSession);
  await wait(700);
  const parallax = await evaluate(reportSession, `(() => {
    const x = id => parseFloat(document.getElementById(id).style.getPropertyValue('--parallax-x'));
    return {background:x('fondos'),media:x('bocados'),text:x('frases')};
  })()`);
  if (!(parallax.background > 1 && parallax.media > parallax.background &&
      parallax.text > parallax.media)) {
    throw new Error('El parallax no separa los tres planos: ' + JSON.stringify(parallax));
  }
  await screenshot(reportSession, 'mixed-menu');
  const hover = await evaluate(reportSession, `(async () => {
    const piece = [...document.querySelectorAll('.bocado[data-kind="video"]')].find(element => {
      const r = element.getBoundingClientRect();
      return r.x > 40 && r.x < 700 && r.y > 30 && r.y < 550;
    });
    piece.focus();
    piece.setAttribute('data-hover-test','true');
    await piece.getAnimations()[0].ready;
    return {expanded:piece.classList.contains('is-expanded'),
      taste:piece.dataset.taste,
      caption:piece.querySelector('.bocado-caption').textContent,
      description:piece.querySelector('.bocado-descripcion').textContent,
      hashtags:[...piece.querySelectorAll('.bocado-descripcion .hashtag')]
        .map(label => label.textContent),
      titleOrDuration:!!piece.querySelector('.bocado-titulo,.bocado-duracion'),
      paused:piece.getAnimations()[0].playState === 'paused',
      time:piece.getAnimations()[0].currentTime};
  })()`);
  if (!hover.expanded || hover.titleOrDuration || !hover.paused ||
      hover.caption !== hover.description ||
      JSON.stringify(hover.hashtags) !== JSON.stringify(catalogue.hashtags[hover.taste])) {
    throw new Error('El hover debe detener el vídeo y mostrar los hashtags separados de su sabor.');
  }
  await wait(500);
  const captionFits = await evaluate(reportSession, `(() => {
    const piece = document.querySelector('[data-hover-test]');
    const card = piece.querySelector('.bocado-card');
    const caption = piece.querySelector('.bocado-caption');
    const box = card.getBoundingClientRect();
    const captionBox = caption.getBoundingClientRect();
    return box.left >= -0.5 && box.right <= innerWidth + 0.5 &&
      box.top >= -0.5 && box.bottom <= innerHeight + 0.5 &&
      captionBox.top >= box.top && captionBox.bottom <= box.bottom + 0.5 &&
      card.scrollHeight <= card.clientHeight + 1;
  })()`);
  if (!captionFits) throw new Error('El detalle no deja ver todos los hashtags dentro de la pantalla.');
  const mix = await evaluate(reportSession, `(() => {
    const videos = [...document.querySelectorAll('video')];
    const detail = videos.find(video => video.classList.contains('bocado-detalle'));
    const ambient = videos.filter(video => video !== detail);
    return {featured:detail?.volume,muted:detail?.muted,
      background:ambient.map(video=>video.volume)};
  })()`);
  if (Math.abs(mix.featured - 0.85) > 0.001 || mix.muted ||
      mix.background.filter(volume => volume === 0).length !== 1 ||
      !mix.background.every(volume => volume === 0 || Math.abs(volume - 0.03) < 0.001)) {
    throw new Error('El hover no destaca su audio y atenúa los vídeos de fondo.');
  }
  if (await evaluate(reportSession,
    "document.querySelector('[data-hover-test]').getAnimations()[0].currentTime") !== hover.time) {
    throw new Error('El vídeo se mueve mientras está ampliado.');
  }
  await screenshot(reportSession, 'mixed-hover');

  // Pausar el sonido conserva el movimiento y no se deshace al explorar el plato.
  const soundState = () => evaluate(reportSession, `(() => {
    const videos = [...document.querySelectorAll('video')];
    const detail = videos.find(video => video.classList.contains('bocado-detalle'));
    return {
      label: document.getElementById('pausar-sonido').textContent.trim(),
      silent: videos.length > 0 && videos.every(video => video.muted),
      audible: videos.length > 0 && videos.every(video => !video.muted),
      playing: videos.length > 0 && videos.every(video => !video.paused),
      featured: detail?.volume,
      background: videos.filter(video => video !== detail).map(video => video.volume)
    };
  })()`);
  await evaluate(reportSession, `(() => {
    const moving = [...document.querySelectorAll('.bocado')]
      .find(piece => !piece.classList.contains('is-expanded'));
    moving.setAttribute('data-audio-motion-test', 'true');
    document.getElementById('pausar-sonido').click();
  })()`);
  const audioMotionTime = await evaluate(reportSession,
    "document.querySelector('[data-audio-motion-test]').getAnimations()[0].currentTime");
  await poll(async () => {
    const state = await soundState();
    return state.label === 'ACTIVAR SONIDO' && state.silent && state.playing;
  }, 'pausar solo el sonido');
  await wait(200);
  if (await evaluate(reportSession,
    "document.querySelector('[data-audio-motion-test]').getAnimations()[0].currentTime") <= audioMotionTime) {
    throw new Error('Pausar el sonido también detiene el carrusel.');
  }
  await evaluate(reportSession, `(() => {
    const piece = document.querySelector('[data-hover-test]');
    piece.blur();
    piece.focus();
  })()`);
  await poll(async () => {
    const state = await soundState();
    return state.featured != null && state.silent && state.playing;
  }, 'ampliar un vídeo mientras el sonido está pausado');
  await evaluate(reportSession, "document.getElementById('pedir-cuenta').click()");
  if (!await evaluate(reportSession,
    "document.getElementById('cuenta').open && [...document.querySelectorAll('video')].every(video=>video.muted)")) {
    throw new Error('El ticket no respeta el sonido pausado.');
  }
  await evaluate(reportSession, "document.getElementById('cerrar-cuenta').click()");
  await poll(async () => {
    const state = await soundState();
    return state.label === 'ACTIVAR SONIDO' && state.silent && state.playing;
  }, 'conservar la pausa de sonido al cerrar la cuenta');
  await evaluate(reportSession, `(() => {
    document.querySelector('[data-hover-test]').focus();
    document.getElementById('pausar-sonido').click();
  })()`);
  await poll(async () => {
    const state = await soundState();
    return state.label === 'DESACTIVAR SONIDO' && state.audible && state.playing &&
      Math.abs(state.featured - 0.85) < 0.001 &&
      state.background.filter(volume => volume === 0).length === 1 &&
      state.background.every(volume => volume === 0 || Math.abs(volume - 0.03) < 0.001);
  }, 'reanudar la mezcla del vídeo ampliado');

  await evaluate(reportSession, `(() => {
    const piece = document.querySelector('[data-hover-test]');
    piece.blur();
    const animation = piece.getAnimations()[0];
    animation.currentTime = animation.effect.getTiming().duration - 30;
    animation.play();
  })()`);
  await wait(280);
  const restoredAudio = await evaluate(reportSession,
    "[...document.querySelectorAll('video')].every(video=>!video.muted && Math.abs(video.volume-0.14)<0.001)");
  if (!restoredAudio) throw new Error('El audio ambiente no se recupera al retirar el hover.');
  const looped = await evaluate(reportSession, `(() => {
    const piece = document.querySelector('[data-hover-test]');
    return piece.getAnimations()[0].currentTime > piece.getAnimations()[0].effect.getTiming().duration &&
      piece.getBoundingClientRect().x < 0;
  })()`);
  if (!looped) throw new Error('El carrusel no vuelve por la izquierda tras el recorrido.');
  await evaluate(reportSession, "document.getElementById('pausar-sonido').click()");
  await poll(async () => {
    const state = await soundState();
    return state.label === 'ACTIVAR SONIDO' && state.silent && state.playing;
  }, 'pausar el audio ambiente');
  await evaluate(reportSession, "document.getElementById('pausar-sonido').click()");
  await poll(() => evaluate(reportSession,
    "document.getElementById('pausar-sonido').textContent.trim() === 'DESACTIVAR SONIDO' && " +
    "[...document.querySelectorAll('video')].every(video=>!video.muted && !video.paused && Math.abs(video.volume-0.14)<0.001)"),
    'reanudar el audio ambiente');
  console.log('Sonido verificado: estado inicial coherente, activación con un clic cuando es necesario y silencio independiente del carrusel, hover y ticket.');
  await evaluate(reportSession, "document.getElementById('pedir-cuenta').click()");
  await screenshot(reportSession, 'mixed-ticket');
  console.log('Verificados: cinco sabores, hashtags individuales, etiquetas del hover, ASCII en los cuatro bordes, cuotas, ticket, sonido, bucle y parallax.');
  await send('Target.activateTarget', { targetId: optionsPage.targetId });
  await evaluate(optionsSession, "document.getElementById('html').click()");
  await poll(() => evaluate(optionsSession,
    readyDownloads + ".then(items=>items.some(d=>d.filename.includes('historial')))"),
    'descargar historial separado');
  await poll(() => evaluate(optionsSession, "!document.getElementById('json').disabled"), 'activar copia JSON');
  await evaluate(optionsSession, "document.getElementById('json').click()");
  const jsonDownload = await poll(() => evaluate(optionsSession,
    readyDownloads + ".then(items=>items.find(d=>d.filename.endsWith('.json')))"),
    'descargar JSON separado');
  const jsonText = await readDownload(jsonDownload.filename);
  if (!jsonDownload.filename.includes('datos') || jsonText.includes('\n') ||
      JSON.parse(jsonText).sessions.length !== 1) throw new Error('El JSON separado no conserva la sesión.');
  await poll(() => evaluate(optionsSession, "!document.getElementById('clear').disabled"), 'activar limpieza');
  await evaluate(optionsSession, "window.confirm=()=>true; document.getElementById('clear').click()");
  await poll(() => evaluate(optionsSession,
    "chrome.storage.local.get('tracker').then(({tracker})=>tracker.sessions.length===0)"), 'limpiar historial de prueba');
  console.log('Opciones verificadas: exportar historial separado, copiar JSON compacto y limpiar sin borrar descargas.');
} finally {
  await send('Browser.close').catch(() => {});
  child.kill();
}
