// Guardamos la página de la historia; al abrirla, su texto vuelve a escribirse.
const STORY_KEY = 'buffetPopupStory';
const INTRO = [
  'Bienvenido a Buffet Visual,\nen esta experiencia observaremos\nqué ves mientras comes...',
  '... cuando quiera que le\nentreguemos su plato digital\nsolamente tiene que decirlo.'
];
const QUESTION = '¿ha terminado ya?';
const $ = id => document.getElementById(id);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const freshStory = () => ({
  index: 0,
  complete: false,
  sessionId: null
});
let story;
let retryExport = false;
let continueIntro = null;
let revealRequested = false;

async function send(type) {
  const result = await chrome.runtime.sendMessage({ type });
  if (result?.error) throw new Error(result.error);
  return result;
}

const saveStory = () => chrome.storage.local.set({ [STORY_KEY]: story });

function hideControls() {
  $('continue').hidden = true;
  $('start').hidden = true;
  $('finish').hidden = true;
  $('announcement').textContent = '';
}

function showText(text) {
  $('story').textContent = text;
  $('announcement').textContent = text.replaceAll('\n', ' ');
}

async function writeText(text, allowReveal = false, target = $('story')) {
  target.textContent = '';
  for (let cursor = 1; cursor <= text.length; cursor++) {
    if (allowReveal && revealRequested) {
      target.textContent = text;
      break;
    }
    target.textContent = text.slice(0, cursor);
    await wait(text[cursor - 1] === '.' ? 85 : 32);
  }
  $('announcement').textContent = text.replaceAll('\n', ' ');
}

async function showStart() {
  hideControls();
  $('story').textContent = '';
  const text = retryExport ? 'VOLVER A SERVIR' : 'PULSA AQUÍ PARA EMPEZAR';
  $('start').textContent = '';
  $('start').disabled = true;
  $('start').hidden = false;
  await writeText(text, false, $('start'));
  $('start').disabled = false;
}

async function playIntro() {
  hideControls();
  $('continue').hidden = false;
  while (story.index < INTRO.length) {
    revealRequested = false;
    $('continue').disabled = false;
    const continued = new Promise(resolve => { continueIntro = resolve; });
    // Conservamos la página, pero cada apertura vuelve a escribirla desde el principio.
    await writeText(INTRO[story.index], true);
    // Cada tarjeta permanece hasta un clic.
    await continued;
    $('continue').disabled = true;
    story.index++;
    await saveStory();
  }
  story.complete = true;
  await saveStory();
  await showStart();
}

function nextIntroPage(event) {
  if (event.detail > 1) return;
  if ($('continue').hidden || $('continue').disabled) return;
  if ($('story').textContent !== INTRO[story.index]) {
    revealRequested = true;
    return;
  }
  if (!continueIntro) return;
  const advance = continueIntro;
  continueIntro = null;
  advance();
}

async function showQuestion() {
  hideControls();
  await writeText(QUESTION);
  $('yes').disabled = false;
  $('no').disabled = false;
  $('finish').hidden = false;
}

async function startSession() {
  $('start').disabled = true;
  try {
    if (retryExport) {
      await send('EXPORT_LAST_HTML');
      hideControls();
      showText('Su plato digital está servido.');
      return;
    }
    await send('START');
    const state = await send('GET');
    story.sessionId = state.active?.id || 'active';
    await saveStory();
    await showQuestion();
  } catch (error) {
    showText(error.message || 'No hemos podido empezar. Inténtelo de nuevo.');
    $('start').disabled = false;
  }
}

async function finishSession() {
  $('yes').disabled = true;
  $('no').disabled = true;
  hideControls();
  showText('Preparando su plato digital...');
  try {
    const result = await send('STOP');
    story = freshStory();
    await saveStory();
    if (result.warning) {
      retryExport = true;
      showText('Su sesión está guardada.\nVamos a servir su plato de nuevo.');
      $('start').textContent = 'VOLVER A SERVIR';
      $('start').disabled = false;
      $('start').hidden = false;
      return;
    }
    showText('Su plato digital está servido.');
  } catch (error) {
    showText(error.message || 'No hemos podido terminar. Inténtelo de nuevo.');
    $('yes').disabled = false;
    $('no').disabled = false;
    $('finish').hidden = false;
  }
}

async function initialize() {
  // El backend descarta primero la presentación de un navegador anterior.
  const state = await send('GET');
  if (state.exportFormat !== 'menu-v5') {
    throw new Error('Recarga Buffet Visual desde la página de extensiones para actualizar el menú.');
  }
  const saved = await chrome.storage.local.get(STORY_KEY);
  story = saved[STORY_KEY] || freshStory();
  if (state.active) {
    story.complete = true;
    story.sessionId = state.active.id;
    await saveStory();
    await showQuestion();
    return;
  }
  if (story.sessionId) {
    story = freshStory();
    await saveStory();
  }
  if (story.complete) await showStart();
  else await playIntro();
}

$('start').addEventListener('click', startSession);
$('continue').addEventListener('click', nextIntroPage);
$('yes').addEventListener('click', finishSession);
$('no').addEventListener('click', () => window.close());

initialize().catch(error => {
  hideControls();
  showText(error.message || 'No hemos podido abrir la tarjeta.');
});
