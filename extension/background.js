import './shared.js?v=3.9.0';

const {
  freshState, newSession, record, recordContent, publicSession, identifyPlatform
} = TrackerCore;
import { createMenuExport } from './export.js?v=3.9.0';

// Admite la instalación nueva y la que ya estaba cargada desde la raíz.
const workerPath = chrome.runtime.getManifest().background.service_worker;
const assetFolder = workerPath.replace(/[^/]+$/, '');
const resourceURL = name => chrome.runtime.getURL(assetFolder + name);

// Persistencia y cola de operaciones.
let queue = Promise.resolve();
const read = async () =>
  (await chrome.storage.local.get('tracker')).tracker || freshState();
const write = state => chrome.storage.local.set({ tracker: state });

function enqueue(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

function fileTimestamp(timestamp = Date.now()) {
  const date = new Date(timestamp ?? Date.now());
  const two = value => String(value).padStart(2, '0');
  const day = [two(date.getDate()), two(date.getMonth() + 1), date.getFullYear()].join('-');
  const time = [two(date.getHours()), two(date.getMinutes()), two(date.getSeconds())].join('-');
  return day + '_' + time;
}

const plateFilename = timestamp => 'Plato Digital ' + fileTimestamp(timestamp) + '.html';

async function download(text, mime, filename) {
  return chrome.downloads.download({
    url: 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(text),
    filename,
    saveAs: false
  });
}

async function downloadReport(sessions, filename) {
  await ensureClock();
  const html = await createMenuExport(sessions, resourceURL);
  // No mezclar la antigua plantilla de tablas con los estilos del collage.
  if (!html.includes('<meta name="buffet-format" content="menu-v5">') ||
      !html.includes('id="pedir-cuenta"') || !html.includes('id="menu-datos"')) {
    throw new Error('La plantilla del menú está desactualizada. Recarga la extensión.');
  }
  const result = await chrome.runtime.sendMessage({ type: 'CREATE_REPORT_BLOB', html });
  if (!result?.url) throw new Error('No se ha podido preparar el plato digital.');
  try {
    const id = await chrome.downloads.download({ url: result.url, filename, saveAs: false });
    const stored = await chrome.storage.session.get('reportDownloads');
    const pending = stored.reportDownloads || {};
    pending[id] = result.url;
    await chrome.storage.session.set({ reportDownloads: pending });
    return id;
  } catch (error) {
    await chrome.runtime.sendMessage({ type: 'RELEASE_REPORT_BLOB', url: result.url });
    throw error;
  }
}

// Documento invisible con su propio worker, activo solo durante la sesión.
async function ensureClock() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [resourceURL('offscreen.html')]
  });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: resourceURL('offscreen.html'),
    reasons: ['WORKERS'],
    justification: 'Ejecutar un worker local de muestreo durante la sesión de tiempo en pantalla.'
  });
}

async function closeClock() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [resourceURL('offscreen.html')]
  });
  if (!contexts.length) return;
  const status = await chrome.runtime.sendMessage({ type: 'REPORT_EXPORT_STATUS' });
  if (!status?.busy) await chrome.offscreen.closeDocument();
}

// Cuenta desde la apertura del dominio, sin esperar a su reproductor.
async function screenSnapshot(state) {
  if (!state.active) return;
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  const win = tab && await chrome.windows.get(tab.windowId).catch(() => null);
  const address = tab?.pendingUrl || tab?.url;
  const platform = identifyPlatform(address);
  const active = Boolean(platform && win?.focused && win.state !== 'minimized');
  record(state.active, { platform, active }, Date.now());
  state.detector = {
    platform,
    text: !address && tab ? 'No se puede leer la URL. Comprueba el permiso de pestañas.' :
      active ? 'Tiempo en pantalla activo' : 'Sin una web enfocada',
    at: Date.now()
  };
}

// Mensajes del detector.
async function handleSample(state, message, sender) {
  if (!state.active || !sender.tab) return;
  const tab = await chrome.tabs.get(sender.tab.id).catch(() => null);
  const win = tab && await chrome.windows.get(tab.windowId).catch(() => null);
  const focused = Boolean(tab?.active && win?.focused && win.state !== 'minimized');
  // Estos mensajes solo registran contenido, nunca mantienen el reloj.
  if (focused && message.sample?.visible && message.sample.playing) {
    const sample = message.sample;
    const platform = identifyPlatform(tab.url);
    const youtube = ['YouTube', 'YouTube Shorts'].includes(platform) &&
      /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]+$/.test(sample.url);
    const twitch = platform === 'Twitch' &&
      /^https:\/\/www\.twitch\.tv\/(?:[\w-]+|videos\/\d+)$/.test(sample.url);
    if (youtube || twitch) {
      recordContent(state.active, {
        platform,
        playing: true,
        url: sample.url,
        title: String(sample.title || '').slice(0, 1000),
        channel: String(sample.channel || '').slice(0, 100)
      }, Date.now());
    }
  }
  if (focused) await write(state);
}

// Controles del panel.
async function handle(message, sender) {
  const state = await read();
  if (message.type === 'SAMPLE') return handleSample(state, message, sender);
  const ownPage = ['popup.html', 'gestion.html', 'offscreen.html'].some(
    name => sender.url?.split(/[?#]/)[0] === resourceURL(name)
  );
  if (sender.id !== chrome.runtime.id || (sender.tab && !ownPage)) {
    throw new Error('Acción no autorizada');
  }
  if (message.type === 'CLOCK_TICK') {
    if (sender.url !== resourceURL('offscreen.html')) {
      throw new Error('Origen del reloj no autorizado');
    }
    if (!state.active) {
      await closeClock();
      return;
    }
    await screenSnapshot(state);
    await write(state);
    return;
  }
  if (message.type === 'GET') {
    if (state.active) {
      await ensureClock();
      await screenSnapshot(state);
      await write(state);
    }
    return {
      ...state,
      exportFormat: 'menu-v5',
      active: state.active ? publicSession(state.active) : null
    };
  }

  if (message.type === 'START') {
    await ensureClock();
    if (!state.active) {
      state.active = newSession(Date.now());
      await screenSnapshot(state);
      await write(state);
    }
  } else if (message.type === 'STOP') {
    if (!state.active) return { ok: true };
    await screenSnapshot(state);
    state.active.endedAt = Date.now();
    const session = publicSession(state.active);
    state.sessions.push(session);
    state.active = null;
    await write(state);
    try {
      await downloadReport([session], 'Tracker/informes/' + plateFilename(session.endedAt));
    } catch (error) {
      await closeClock();
      return {
        ok: true,
        warning: 'Sesión guardada. ' + error.message + ' Puedes volver a servirla desde Opciones.'
      };
    }
  } else if (message.type === 'CLEAR') {
    if (state.active) throw new Error('Detén la sesión antes de limpiar los datos.');
    await write(freshState());
  } else if (['EXPORT_HTML', 'EXPORT_LAST_HTML', 'EXPORT_JSON'].includes(message.type)) {
    if (state.active) {
      await screenSnapshot(state);
      await write(state);
    }
    let sessions = [
      ...state.sessions,
      ...(state.active ? [publicSession(state.active)] : [])
    ];
    if (message.type === 'EXPORT_LAST_HTML') sessions = sessions.slice(-1);
    if (message.type !== 'EXPORT_JSON') {
      const folder = message.type === 'EXPORT_LAST_HTML' ? 'informes' : 'historial';
      const timestamp = message.type === 'EXPORT_LAST_HTML' ? sessions.at(-1)?.endedAt : Date.now();
      await downloadReport(sessions, 'Tracker/' + folder + '/' + plateFilename(timestamp));
    } else {
      const data = { version: 2, exportedAt: Date.now(), sessions };
      await download(JSON.stringify(data), 'application/json',
        'Tracker/datos/Historial ' + fileTimestamp(data.exportedAt) + '.json');
    }
  } else {
    throw new Error('Acción desconocida');
  }
  return { ok: true };
}

async function releaseReport(downloadId) {
  const stored = await chrome.storage.session.get('reportDownloads');
  const pending = stored.reportDownloads || {};
  const url = pending[downloadId];
  if (!url) return;
  await chrome.runtime.sendMessage({ type: 'RELEASE_REPORT_BLOB', url }).catch(() => {});
  delete pending[downloadId];
  await chrome.storage.session.set({ reportDownloads: pending });
  if (!(await read()).active) await closeClock();
}

chrome.downloads.onChanged.addListener(change => {
  if (['complete', 'interrupted'].includes(change.state?.current)) {
    enqueue(() => releaseReport(change.id)).catch(() => {});
  }
});
chrome.downloads.onErased.addListener(id => {
  enqueue(() => releaseReport(id)).catch(() => {});
});

// Cambios de pestaña, dominio y ventana cierran el intervalo anterior.
function updateScreen() {
  enqueue(async () => {
    const state = await read();
    if (!state.active) return;
    await screenSnapshot(state);
    await write(state);
  }).catch(() => {});
}

chrome.tabs.onActivated.addListener(updateScreen);
chrome.tabs.onRemoved.addListener(updateScreen);
chrome.tabs.onUpdated.addListener((id, changes) => {
  if (changes.url || changes.status === 'complete') updateScreen();
});
chrome.windows.onFocusChanged.addListener(updateScreen);

// Una comida pendiente se conserva como historial, hasta su última muestra.
async function archiveInterruptedSession() {
  const state = await read();
  if (state.active) {
    const session = state.active;
    const startedAt = session.startedAt;
    const lastAt = Number.isFinite(session.last?.at) ? session.last.at : startedAt;
    session.endedAt = Math.max(startedAt, Math.min(lastAt, Date.now()));
    session.finishReason = 'browser_closed';
    if (!state.sessions.some(saved => saved.id === session.id)) {
      state.sessions.push(publicSession(session));
    }
    state.active = null;
  }
  state.detector = null;
  await write(state);
  await chrome.storage.local.remove('buffetPopupStory');
  await closeClock();
}

async function migrateStorageKey(storage, previousKey, currentKey) {
  const saved = await storage.get([previousKey, currentKey]);
  if (saved[currentKey] === undefined && saved[previousKey] !== undefined) {
    await storage.set({ [currentKey]: saved[previousKey] });
  }
  if (saved[previousKey] !== undefined) await storage.remove(previousKey);
}

async function initializeBrowserSession() {
  // Las claves anteriores se trasladan antes de comprobar si el navegador se ha reiniciado.
  await migrateStorageKey(chrome.storage.local, 'convitePopupStory', 'buffetPopupStory');
  await migrateStorageKey(chrome.storage.session, 'conviteBrowserReady', 'buffetBrowserReady');
  const saved = await chrome.storage.session.get('buffetBrowserReady');
  if (!saved.buffetBrowserReady) {
    // storage.session sobrevive al reposo del worker, pero no al cierre del navegador.
    await archiveInterruptedSession();
    await chrome.storage.session.set({ buffetBrowserReady: true, reportDownloads: {} });
    return;
  }
  if ((await read()).active) await ensureClock();
}

chrome.windows.onRemoved.addListener(() => {
  enqueue(async () => {
    const windows = await chrome.windows.getAll({ windowTypes: ['normal', 'popup'] });
    if (!windows.length) await archiveInterruptedSession();
  }).catch(() => {});
});

// Conserva una sesión antigua sin mezclar reproducción y tiempo en pantalla.
chrome.runtime.onInstalled.addListener(() => {
  enqueue(async () => {
    const state = await read();
    if (state.active && state.active.metric !== 'screen') {
      state.active.endedAt = Date.now();
      state.sessions.push(publicSession(state.active));
      state.active = null;
    }
    state.version = 2;
    state.detector = null;
    await write(state);
    if (state.active) await ensureClock();
    else await closeClock();
  }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  enqueue(initializeBrowserSession).catch(() => {});
});

// Distingue una apertura del navegador de un worker que vuelve del reposo.
enqueue(initializeBrowserSession).catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (['CREATE_REPORT_BLOB', 'RELEASE_REPORT_BLOB', 'REPORT_EXPORT_STATUS'].includes(message.type)) {
    return false;
  }
  enqueue(() => handle(message, sender)).then(
    value => reply(value || { ok: true }),
    error => reply({ error: error.message })
  );
  return true;
});
