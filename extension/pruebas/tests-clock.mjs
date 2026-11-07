import { readFileSync } from 'node:fs';

// Ejecuta los módulos reales con las APIs del navegador simuladas.
// El seguimiento se prueba sin mensajes de páginas ni reproducción.
export async function runClockTests(sources, folder = '') {
  const strip = source => source
    .replace(/^import[\s\S]*?;\s*/gm, '')
    .replace(/^export /gm, '');
  const code = [
    'shared.js', 'report.js', 'export.js', 'background.js'
  ].map(name => strip(sources[name])).join('\n');

  const results = [];
  function check(condition, label) {
    if (!condition) throw new Error(label);
    results.push(label);
  }

  let state;
  let localStorage = {};
  let sessionStorage = {};
  let now = 1000;
  let focused = true;
  let offscreen = false;
  let creates = 0;
  let missingCSS = false;
  let failedDownload = false;
  let nextBlob = 0;
  let nextSession = 0;
  let tab = { id: 1, windowId: 1, active: true, url: 'https://mail.google.com/mail/u/0' };
  let openWindows = [{ id: 1, type: 'normal' }];
  const downloads = [];
  const blobs = new Map();
  const listeners = {};
  const event = name => ({
    addListener: listener => { listeners[name] = listener; }
  });
  const runtimeURL = name => 'chrome-extension://test/' + name;
  const extensionURL = name => runtimeURL(folder + name);

  function storedValues(storage, keys) {
    if (keys == null) return structuredClone(storage);
    const names = typeof keys === 'string' ? [keys] :
      Array.isArray(keys) ? keys : Object.keys(keys);
    return Object.fromEntries(names.map(name => [
      name,
      Object.hasOwn(storage, name) ? structuredClone(storage[name]) :
        typeof keys === 'object' && !Array.isArray(keys) ? keys[name] : undefined
    ]));
  }

  // Los binarios son pequeños datos de prueba; no pretenden ser medios reproducibles.
  const bytes = new Uint8Array([0, 1, 2, 3]).buffer;
  const catalogue = { hashtags: {}, media: [], backgrounds: [] };
  for (const taste of ['salado', 'dulce', 'amargo', 'acido', 'umami']) {
    catalogue.hashtags[taste] = ['#' + taste, '#bocado'];
    for (let index = 1; index <= 2; index++) {
      catalogue.media.push({
        id: taste + index,
        taste,
        kind: 'video',
        src: 'assets/media/' + taste + index + '.mp4',
        poster: 'assets/media/' + taste + index + '.jpg',
        title: 'Bocado ' + taste
      });
    }
    catalogue.media.push({
      id: taste + '-foto', taste, kind: 'image',
      src: 'assets/media/' + taste + '.jpg',
      title: 'Foto ' + taste
    });
    catalogue.backgrounds.push({
      taste, src: 'assets/backgrounds/' + taste + '.png'
    });
  }

  const chrome = {
    runtime: {
      id: 'test',
      getURL: runtimeURL,
      getManifest: () => ({ background: { service_worker: folder + 'background.js' } }),
      getContexts: async () => offscreen ? [{ documentUrl: extensionURL('offscreen.html') }] : [],
      sendMessage: async message => {
        if (message.type === 'CREATE_REPORT_BLOB') {
          check(offscreen, 'El documento del reloj sigue disponible al preparar el HTML');
          const url = 'blob:report-' + ++nextBlob;
          blobs.set(url, message.html);
          return { url };
        }
        if (message.type === 'RELEASE_REPORT_BLOB') {
          blobs.delete(message.url);
          return { ok: true };
        }
        if (message.type === 'REPORT_EXPORT_STATUS') return { busy: blobs.size > 0 };
        return {};
      },
      onInstalled: event('installed'),
      onStartup: event('startup'),
      onMessage: event('message')
    },
    storage: {
      local: {
        get: async keys => storedValues(localStorage, keys),
        set: async data => {
          Object.assign(localStorage, structuredClone(data));
          state = localStorage.tracker;
        },
        remove: async keys => {
          for (const key of typeof keys === 'string' ? [keys] : keys) delete localStorage[key];
          state = localStorage.tracker;
        }
      },
      session: {
        get: async keys => storedValues(sessionStorage, keys),
        set: async data => { Object.assign(sessionStorage, structuredClone(data)); },
        remove: async keys => {
          for (const key of typeof keys === 'string' ? [keys] : keys) delete sessionStorage[key];
        }
      }
    },
    tabs: {
      query: async () => [tab],
      get: async () => tab,
      onActivated: event('activated'),
      onRemoved: event('removed'),
      onUpdated: event('updated')
    },
    windows: {
      get: async () => ({ focused, state: 'normal' }),
      getAll: async options => structuredClone(openWindows.filter(
        window => !options?.windowTypes || options.windowTypes.includes(window.type)
      )),
      onFocusChanged: event('focus'),
      onRemoved: event('windowRemoved')
    },
    offscreen: {
      createDocument: async config => {
        check(config.reasons.includes('WORKERS'), 'El reloj utiliza un worker local');
        check(config.url === extensionURL('offscreen.html'), 'El reloj resuelve la carpeta de instalación');
        offscreen = true;
        creates++;
      },
      closeDocument: async () => { offscreen = false; }
    },
    downloads: {
      download: async data => {
        if (failedDownload) throw new Error('Descarga de prueba rechazada.');
        const id = downloads.length + 1;
        downloads.push({ ...data, id, html: blobs.get(data.url) });
        return id;
      },
      onChanged: event('downloadChanged'),
      onErased: event('downloadErased')
    }
  };

  const ClockDate = class extends Date {
    static now() { return now; }
  };
  const fetchResource = async url => {
    const path = String(url).startsWith(extensionURL('')) ?
      String(url).slice(extensionURL('').length) : '';
    return {
      ok: Boolean(path) && !(missingCSS && path === 'report.css'),
      text: async () => sources[path] || '',
      json: async () => structuredClone(catalogue),
      arrayBuffer: async () => bytes.slice(0)
    };
  };
  function createBackend(overrides = '') {
    return new Function('chrome', 'Date', 'crypto', 'URL', 'structuredClone', 'fetch',
      code + '\n' + overrides + '\nreturn {handle, updateScreen, flush: () => queue};'
    )(
      chrome, ClockDate, { randomUUID: () => 'test-session-' + ++nextSession },
      URL, structuredClone, fetchResource
    );
  }
  let backend = createBackend();
  await backend.flush();

  const popup = { id: 'test' };
  const optionsPage = { id: 'test', tab: { id: 9 }, url: extensionURL('gestion.html') };
  check((await backend.handle({ type: 'GET' }, optionsPage)).sessions.length === 0,
    'La página propia de gestión puede abrirse en una pestaña');
  let forbidden = false;
  try {
    await backend.handle({ type: 'START' }, {
      id: 'test', tab: { id: 9 }, url: 'https://example.org/'
    });
  } catch {
    forbidden = true;
  }
  check(forbidden, 'Una página web no puede iniciar sesiones mediante controles internos');
  const clock = { id: 'test', url: extensionURL('offscreen.html') };
  async function tick(at) {
    now = at;
    await backend.handle({ type: 'CLOCK_TICK' }, clock);
  }
  async function navigate(address, at) {
    now = at;
    tab = { ...tab, url: address };
    backend.updateScreen();
    await backend.flush();
  }
  async function complete(download) {
    listeners.downloadChanged({ id: download.id, state: { current: 'complete' } });
    await backend.flush();
  }

  await backend.handle({ type: 'START' }, popup);
  await tick(2000);
  await tick(3000);
  check(state.active.totals.Gmail === 2000, 'Gmail suma sin vídeo, popup ni scripts de página');
  check(creates === 1, 'Solo se crea un reloj por sesión');

  await navigate('https://docs.google.com/document/d/example', 3500);
  await tick(4500);
  check(state.active.totals['Google Docs'] === 1000, 'Documentos suma desde la entrada');
  await navigate('https://drive.google.com/drive', 5000);
  await tick(6000);
  check(state.active.totals['Google Drive'] === 1000, 'Drive suma sin reproductor');
  await navigate('https://www.linkedin.com/jobs', 6500);
  await tick(7500);
  check(state.active.totals.LinkedIn === 1000, 'LinkedIn suma sin detector de contenido');
  await navigate('https://www.pinterest.es/', 8000);
  await tick(9000);
  check(state.active.totals.Pinterest === 1000, 'Pinterest suma y se clasifica por nombre');

  now = 9500;
  tab.pendingUrl = 'https://www.netflix.com/browse';
  backend.updateScreen();
  await backend.flush();
  await tick(10500);
  check(state.active.totals.Netflix === 1000, 'Netflix suma antes de cargar o reproducir');
  tab.url = tab.pendingUrl;
  delete tab.pendingUrl;

  now = 11000;
  focused = false;
  backend.updateScreen();
  await backend.flush();
  await tick(12000);
  check(state.active.totals.Netflix === 1500, 'Perder el foco detiene el contador');
  now = 13000;
  focused = true;
  backend.updateScreen();
  await backend.flush();
  await tick(30000);
  check(state.active.totals.Netflix === 1500, 'Una suspensión no añade el hueco');

  offscreen = false;
  now = 31000;
  const snapshot = await backend.handle({ type: 'GET' }, popup);
  check(snapshot.active.totals.Netflix === 2500 && offscreen,
    'El panel muestra tiempo actualizado y recupera el reloj');
  now = 32000;
  await backend.handle({ type: 'STOP' }, popup);
  check(offscreen && !state.active && state.sessions.length === 1,
    'Detener guarda la sesión y conserva el documento mientras se descarga');
  check(downloads.length === 1 && downloads[0].url.startsWith('blob:'),
    'El menú se descarga mediante Blob en lugar de una URL de datos enorme');
  check(downloads[0].filename.startsWith('Tracker/informes/'),
    'Los informes se guardan separados del código');
  check(/^Tracker\/informes\/Plato Digital \d{2}-\d{2}-\d{4}_\d{2}-\d{2}-\d{2}\.html$/
    .test(downloads[0].filename),
    'El plato incluye fecha y hora con segundos en un nombre válido para Windows');
  const html = downloads[0].html;
  check(html.includes(sources['report.css']) && html.includes(sources['report-player.js']),
    'CSS y reproductor se incorporan al HTML');
  check(html.includes('data:font/ttf;base64,') && html.includes('data:video/mp4;base64,'),
    'La fuente y los vídeos seleccionados también quedan incrustados');
  const payloadMatch = html.match(
    /<script id="menu-datos" type="application\/json">([\s\S]*?)<\/script>/
  );
  const payload = JSON.parse(payloadMatch[1]);
  check(payload.media.every(item => item.description === catalogue.hashtags[item.taste].join(' ')),
    'El HTML exportado usa los hashtags del sabor en cada recurso');
  check(payload.model.menuTastes.every(taste =>
    payload.media.some(item => item.taste === taste.id) &&
    payload.backgrounds.some(item => item.taste === taste.id)),
    'Vídeos y ASCII incluyen todos los sabores registrados durante la sesión');
  check(html.includes('<meta name="buffet-format" content="menu-v5">') &&
    html.includes('id="pedir-cuenta"'),
    'El archivo usa la plantilla del collage y conserva el botón de cuenta');
  const previous = state.sessions[0].totals.Netflix;
  await tick(33000);
  check(offscreen && state.sessions[0].totals.Netflix === previous,
    'Un pulso no cierra un Blob pendiente ni suma después de detener');
  await complete(downloads[0]);
  check(!offscreen && blobs.size === 0 &&
    Object.keys(sessionStorage.reportDownloads).length === 0,
    'Al terminar la descarga se libera el Blob y se cierra el reloj');

  await backend.handle({ type: 'EXPORT_HTML' }, popup);
  check(downloads.length === 2, 'El historial se vuelve a exportar con sus recursos');
  check(downloads.at(-1).filename.startsWith('Tracker/historial/Plato Digital '),
    'El historial HTML se exporta fuera de la carpeta de platos');
  await backend.handle({ type: 'EXPORT_LAST_HTML' }, popup);
  check(downloads.at(-1).filename === downloads[0].filename,
    'Volver a servir una sesión conserva la fecha y hora de esa comida');
  await backend.handle({ type: 'EXPORT_JSON' }, popup);
  check(downloads.at(-1).filename.startsWith('Tracker/datos/'),
    'Las copias JSON tienen su propia carpeta');
  const exportedJSON = decodeURIComponent(downloads.at(-1).url.split(',').slice(1).join(','));
  check(!exportedJSON.includes('\n') && JSON.parse(exportedJSON).sessions.length === 1,
    'La copia del historial es compacta y conserva las sesiones');
  await complete(downloads[1]);
  await complete(downloads[2]);

  now = 34000;
  await backend.handle({ type: 'START' }, popup);
  missingCSS = true;
  now = 35000;
  const stopped = await backend.handle({ type: 'STOP' }, popup);
  check(Boolean(stopped.warning) && state.sessions.length === 2 && downloads.length === 4,
    'Si falta un recurso se guarda la sesión y se avisa sin exportar HTML incompleto');
  check(!offscreen && blobs.size === 0, 'Un error de recursos no deja el reloj abierto');
  missingCSS = false;

  await backend.handle({ type: 'EXPORT_HTML' }, popup);
  const erased = downloads.at(-1);
  listeners.downloadErased(erased.id);
  await backend.flush();
  check(!offscreen && blobs.size === 0, 'Borrar una descarga también libera sus recursos');

  await backend.handle({ type: 'EXPORT_HTML' }, popup);
  listeners.downloadChanged({
    id: downloads.at(-1).id, state: { current: 'interrupted' }
  });
  await backend.flush();
  check(!offscreen && blobs.size === 0, 'Una descarga interrumpida no deja Blobs pendientes');

  now = 36000;
  await backend.handle({ type: 'START' }, popup);
  failedDownload = true;
  now = 37000;
  const rejected = await backend.handle({ type: 'STOP' }, popup);
  check(Boolean(rejected.warning) && state.sessions.length === 3 && blobs.size === 0,
    'Si el navegador rechaza descargar, se conserva la sesión y se libera el Blob');

  // La sesión de comida termina con el navegador, no con la vida del service worker.
  failedDownload = false;
  now = 40000;
  await backend.handle({ type: 'START' }, popup);
  const continuingSessionId = state.active.id;
  await chrome.storage.local.set({
    buffetPopupStory: { sessionId: continuingSessionId, complete: true, phase: 'question' }
  });
  await tick(41000);
  now = 42000;
  const reopenedPopup = await backend.handle({ type: 'GET' }, popup);
  check(reopenedPopup.active.id === continuingSessionId &&
    localStorage.buffetPopupStory.phase === 'question',
    'Reabrir solo el popup conserva la sesión y su pregunta');

  const storyBeforeRestart = structuredClone(localStorage.buffetPopupStory);
  const historyBeforeRestart = state.sessions.length;
  backend = createBackend();
  await backend.flush();
  check(state.active.id === continuingSessionId &&
    state.sessions.length === historyBeforeRestart &&
    JSON.stringify(localStorage.buffetPopupStory) === JSON.stringify(storyBeforeRestart),
    'Rearrancar el service worker en el mismo navegador no reinicia la sesión');
  check(sessionStorage.buffetBrowserReady === true,
    'La marca de navegador abierto se guarda en storage.session');

  // Una actualización del nombre no debe confundirse con el cierre del navegador.
  const activeBeforeMigration = structuredClone(state.active);
  await chrome.storage.local.remove('buffetPopupStory');
  await chrome.storage.local.set({ convitePopupStory: storyBeforeRestart });
  await chrome.storage.session.remove('buffetBrowserReady');
  await chrome.storage.session.set({ conviteBrowserReady: true });
  backend = createBackend();
  await backend.flush();
  check(JSON.stringify(state.active) === JSON.stringify(activeBeforeMigration) &&
    state.sessions.length === historyBeforeRestart &&
    JSON.stringify(localStorage.buffetPopupStory) === JSON.stringify(storyBeforeRestart) &&
    sessionStorage.buffetBrowserReady === true &&
    !Object.hasOwn(localStorage, 'convitePopupStory') &&
    !Object.hasOwn(sessionStorage, 'conviteBrowserReady'),
    'La migración de claves conserva la comida y la tarjeta sin archivarlas');

  await chrome.storage.local.set({ convitePopupStory: { complete: false } });
  await chrome.storage.session.set({ conviteBrowserReady: false });
  backend = createBackend();
  await backend.flush();
  check(JSON.stringify(localStorage.buffetPopupStory) === JSON.stringify(storyBeforeRestart) &&
    sessionStorage.buffetBrowserReady === true && state.active.id === continuingSessionId,
    'Las claves nuevas tienen prioridad sobre copias antiguas durante la migración');

  // La apertura real arranca con storage.session vacío y almacenamiento local intacto.
  const lastRecordedAt = state.active.last.at;
  const previousTotals = structuredClone(state.active.totals);
  const downloadsBeforeRestart = downloads.length;
  now += 24 * 60 * 60 * 1000;
  sessionStorage = {};
  offscreen = false;
  backend = createBackend();
  listeners.startup();
  await backend.flush();
  const interrupted = state.sessions.find(session => session.id === continuingSessionId);
  check(!state.active && state.detector === null &&
    state.sessions.length === historyBeforeRestart + 1,
    'Una nueva apertura archiva la sesión anterior y deja el popup listo para empezar');
  check(interrupted.endedAt === lastRecordedAt && interrupted.finishReason === 'browser_closed' &&
    JSON.stringify(interrupted.totals) === JSON.stringify(previousTotals),
    'La sesión interrumpida termina en su última muestra sin sumar la noche');
  check(!Object.hasOwn(localStorage, 'buffetPopupStory') &&
    sessionStorage.buffetBrowserReady === true,
    'La nueva apertura elimina la introducción anterior y marca el navegador actual');
  check(downloads.length === downloadsBeforeRestart && !offscreen,
    'Reabrir el navegador no descarga otro informe ni deja el reloj activo');
  listeners.startup();
  await backend.flush();
  check(state.sessions.length === historyBeforeRestart + 1,
    'La inicialización y onStartup son idempotentes y no duplican el historial');
  check(!(await backend.handle({ type: 'GET' }, popup)).active,
    'El primer GET tras reabrir no recupera la pregunta de una comida anterior');

  now += 1000;
  await backend.handle({ type: 'START' }, popup);
  const windowSessionId = state.active.id;
  await chrome.storage.local.set({
    buffetPopupStory: { sessionId: windowSessionId, complete: true, phase: 'question' }
  });
  await tick(now + 1000);
  const lastWindowSample = state.active.last.at;
  openWindows = [{ id: 1, type: 'normal' }];
  listeners.windowRemoved(2);
  await backend.flush();
  check(state.active.id === windowSessionId && localStorage.buffetPopupStory.complete,
    'Cerrar una ventana mantiene la sesión si otra ventana del navegador sigue abierta');

  const historyBeforeWindowClose = state.sessions.length;
  openWindows = [];
  now += 1000;
  listeners.windowRemoved(1);
  await backend.flush();
  const windowSession = state.sessions.find(session => session.id === windowSessionId);
  check(!state.active && !offscreen && state.sessions.length === historyBeforeWindowClose + 1 &&
    windowSession.finishReason === 'browser_closed' && windowSession.endedAt === lastWindowSample,
    'Cerrar la última ventana archiva la sesión y detiene el reloj');
  check(!Object.hasOwn(localStorage, 'buffetPopupStory') &&
    downloads.length === downloadsBeforeRestart,
    'Cerrar la última ventana limpia la tarjeta sin borrar historial ni descargar archivos');

  openWindows = [{ id: 3, type: 'normal' }];
  now += 1000;
  await backend.handle({ type: 'START' }, popup);
  check(state.active.id !== windowSessionId && state.active.startedAt === now,
    'La siguiente comida empieza en una sesión nueva');

  // Una escritura antigua incompleta tampoco debe duplicar una sesión archivada.
  const existing = structuredClone(windowSession);
  existing.endedAt = null;
  await chrome.storage.local.set({
    tracker: { ...state, active: existing }
  });
  const historyBeforeDuplicate = state.sessions.length;
  sessionStorage = {};
  offscreen = false;
  backend = createBackend();
  await backend.flush();
  check(!state.active && state.sessions.length === historyBeforeDuplicate,
    'La recuperación no vuelve a añadir un identificador que ya estaba archivado');

  for (const [name, lastAt, expectedEnd] of [
    ['sin-ultima-muestra', undefined, 4000],
    ['muestra-anterior-al-inicio', 2000, 4000],
    ['muestra-futura', 12000, 8000]
  ]) {
    now = 8000;
    const active = {
      id: name, metric: 'screen', startedAt: 4000, endedAt: null,
      totals: {}, videos: [], streams: [],
      last: lastAt === undefined ? null : { at: lastAt, active: true, platform: 'Gmail' }
    };
    await chrome.storage.local.set({ tracker: { ...state, active } });
    sessionStorage = {};
    offscreen = false;
    backend = createBackend();
    await backend.flush();
    check(state.sessions.find(session => session.id === name).endedAt === expectedEnd,
      'La recuperación acota el fin de sesión: ' + name);
  }

  // El archivo del reloj se prueba en el contexto worker y en el documento.
  const ticks = [];
  let interval;
  new Function('postMessage', 'setInterval', sources['offscreen.js'])(
    value => ticks.push(value),
    (callback, delay) => { interval = { callback, delay }; }
  );
  interval.callback();
  check(interval.delay === 1000 && ticks.length === 2,
    'El worker emite un pulso al iniciar y otro cada segundo');

  let worker;
  let offscreenListener;
  let nextDocumentBlob = 0;
  const documentBlobs = new Set();
  const messages = [];
  const WorkerMock = function (url) {
    worker = this;
    check(url === 'offscreen.js', 'El documento y el worker usan el mismo archivo');
  };
  const objectURLs = {
    createObjectURL: () => {
      const url = 'blob:document-' + ++nextDocumentBlob;
      documentBlobs.add(url);
      return url;
    },
    revokeObjectURL: url => documentBlobs.delete(url)
  };
  new Function('document', 'Worker', 'chrome', 'URL', 'Blob', sources['offscreen.js'])(
    {}, WorkerMock, {
      runtime: {
        id: 'test',
        onMessage: { addListener: listener => { offscreenListener = listener; } },
        sendMessage: async message => messages.push(message)
      }
    }, objectURLs, Blob
  );
  await Promise.all([worker.onmessage(), worker.onmessage()]);
  check(messages.length === 1 && messages[0].type === 'CLOCK_TICK',
    'El documento no envía pulsos simultáneos');
  function askDocument(message) {
    let response;
    offscreenListener(message, { id: 'test' }, reply => { response = reply; });
    return response;
  }
  const prepared = askDocument({ type: 'CREATE_REPORT_BLOB', html: '<html>Plato</html>' });
  check(prepared.url.startsWith('blob:') && askDocument({ type: 'REPORT_EXPORT_STATUS' }).busy,
    'El documento mantiene el Blob hasta que se confirma la descarga');
  askDocument({ type: 'RELEASE_REPORT_BLOB', url: prepared.url });
  check(!askDocument({ type: 'REPORT_EXPORT_STATUS' }).busy && documentBlobs.size === 0,
    'La liberación revoca la URL y actualiza el estado del documento');
  let foreignReply = false;
  offscreenListener({ type: 'REPORT_EXPORT_STATUS' }, { id: 'otra-extension' }, () => {
    foreignReply = true;
  });
  check(!foreignReply, 'El documento ignora mensajes de otra extensión');
  // Reproduce un motor anterior con recursos nuevos: no tiene cuotas para el collage.
  const beforeStaleEngine = downloads.length;
  failedDownload = false;
  backend = createBackend(`
    const currentBuild = TrackerCore.buildMenuModel;
    TrackerCore.buildMenuModel = (...args) => {
      const model = currentBuild(...args);
      delete model.composition;
      return model;
    };
  `);
  await backend.flush();
  await backend.handle({ type: 'START' }, popup);
  now += 1000;
  const staleEngine = await backend.handle({ type: 'STOP' }, popup);
  check(staleEngine.warning?.includes('motor del menú está desactualizado') &&
    downloads.length === beforeStaleEngine && !state.active,
    'Un modelo sin composición se detecta antes de descargar y conserva la sesión');

  // Reproduce el fallo real: un módulo viejo devuelve tablas con el CSS del collage.
  const previousDownloadCount = downloads.length;
  const previousSessionCount = state.sessions.length;
  failedDownload = false;
  backend = createBackend("reportHTML = () => '<html><body>Informe antiguo</body></html>';");
  await backend.flush();
  await backend.handle({ type: 'START' }, popup);
  now += 1000;
  const outdated = await backend.handle({ type: 'STOP' }, popup);
  check(outdated.warning?.includes('desactualizada') &&
    downloads.length === previousDownloadCount && state.sessions.length === previousSessionCount + 1,
    'Una plantilla antigua no se descarga y la sesión queda guardada para volver a servirla');
  return results;
}

// Node solo es necesario para ejecutar estas pruebas de desarrollo.
const sourceNames = [
  'shared.js', 'report.js', 'export.js', 'report.css',
  'report-player.js', 'background.js', 'offscreen.js'
];
const sources = Object.fromEntries(sourceNames.map(name => [
  name, readFileSync(new URL('../' + name, import.meta.url), 'utf8')
]));
for (const folder of ['', 'extension/']) {
  const results = await runClockTests(sources, folder);
  for (const result of results) console.log('✓ ' + (folder || 'extension') + ': ' + result);
}
console.log('Todas las pruebas del reloj y de la exportación han pasado.');
