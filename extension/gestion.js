const $ = id => document.getElementById(id);
const controls = ['html', 'last', 'json', 'clear'];
let busy = false;
let compatible = false;
let state = { active: null, sessions: [] };

async function send(type) {
  const result = await chrome.runtime.sendMessage({ type });
  if (result?.error) throw new Error(result.error);
  return result;
}

function duration(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return hours + 'h ' + minutes + 'm ' + seconds % 60 + 's';
}

function updateControls() {
  const blocked = busy || !compatible;
  $('html').disabled = blocked || (!state.active && !state.sessions.length);
  $('last').disabled = blocked || Boolean(state.active) || !state.sessions.length;
  $('json').disabled = blocked || (!state.active && !state.sessions.length);
  $('clear').disabled = blocked || Boolean(state.active) || !state.sessions.length;
}

async function refresh() {
  state = await send('GET');
  compatible = state.exportFormat === 'menu-v5';
  if (!compatible) {
    updateControls();
    throw new Error('Recarga Buffet Visual desde la página de extensiones para actualizar el menú.');
  }
  const count = state.sessions.length;
  $('history').textContent = count === 1 ?
    'Tienes una sesión guardada.' : 'Tienes ' + count + ' sesiones guardadas.';

  if (state.active) {
    const elapsed = duration(Date.now() - state.active.startedAt);
    $('active').textContent = 'Hay una sesión en curso (' + elapsed +
      '). Termina la sesión desde la tarjeta antes de limpiar el historial.';
  } else {
    $('active').textContent = 'No hay ninguna sesión en curso.';
  }

  const latest = state.sessions.at(-1);
  $('latest').textContent = latest ?
    'Última sesión: ' + new Date(latest.endedAt || latest.startedAt).toLocaleString('es-ES') : '';
  updateControls();
}

async function perform(type) {
  if (busy) return;
  if (type === 'CLEAR' &&
      !confirm('¿Quieres borrar todas las sesiones? Los archivos descargados se conservarán.')) {
    return;
  }

  busy = true;
  updateControls();
  $('message').textContent = ['EXPORT_HTML', 'EXPORT_LAST_HTML'].includes(type) ?
    'Preparando su plato digital...' : 'Un momento...';
  try {
    const result = await send(type);
    const messages = {
      EXPORT_HTML: 'El historial se ha enviado a Descargas/Tracker/historial.',
      EXPORT_LAST_HTML: 'La última sesión se ha enviado a Descargas/Tracker/informes.',
      EXPORT_JSON: 'La copia JSON se ha enviado a Descargas/Tracker/datos.',
      CLEAR: 'El historial se ha limpiado.'
    };
    $('message').textContent = result.warning || messages[type];
  } catch (error) {
    $('message').textContent = error.message || 'No hemos podido completar la petición.';
  } finally {
    busy = false;
    try {
      await refresh();
    } catch (error) {
      updateControls();
      $('message').textContent = error.message;
    }
  }
}

for (const [id, type] of Object.entries({
  html: 'EXPORT_HTML',
  last: 'EXPORT_LAST_HTML',
  json: 'EXPORT_JSON',
  clear: 'CLEAR'
})) {
  $(id).addEventListener('click', () => perform(type));
}

refresh().catch(error => {
  $('message').textContent = error.message;
  for (const id of controls) $(id).disabled = true;
});

setInterval(() => {
  if (!busy && document.visibilityState === 'visible') {
    refresh().catch(error => { $('message').textContent = error.message; });
  }
}, 5000);
