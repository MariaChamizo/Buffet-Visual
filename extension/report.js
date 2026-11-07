import './shared.js?v=3.9.0';

const { escapeHTML: escape } = TrackerCore;

// El catálogo y los vídeos se incorporan al descargar, sin recursos remotos.
function embeddedSource(value, kind) {
  const patterns = {
    image: /^data:image\/(?:png|jpeg|webp|gif);base64,/i,
    video: /^data:video\/(?:mp4|webm|ogg);base64,/i,
    font: /^data:(?:font\/(?:woff2|ttf|truetype)|application\/(?:font-woff2|x-font-ttf|octet-stream));base64,/i
  };
  return typeof value === 'string' && patterns[kind].test(value) ? value : '';
}

function serialise(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function money(value) {
  return Number(value || 0).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }) + ' €';
}

function minutes(value) {
  return (Number(value || 0) / 60000).toLocaleString('es-ES', {
    maximumFractionDigits: 2
  }) + ' min';
}

function dateLabel(timestamp) {
  const date = new Date(timestamp || Date.now());
  const two = value => String(value).padStart(2, '0');
  return [
    two(date.getDate()), two(date.getMonth() + 1), date.getFullYear()
  ].join('.') + '/' + [
    two(date.getHours()), two(date.getMinutes()), two(date.getSeconds())
  ].join(':');
}

function receiptRows(model) {
  return (model.receiptItems || []).map(item => `
    <tr>
      <th scope="row">${escape(item.platform)}</th>
      <td>${escape(minutes(item.timeMs))}</td>
      <td>${item.rate == null ? '—' : escape(money(item.amount))}</td>
    </tr>
  `).join('') || '<tr><td colspan="3">No hay tiempo registrado en las plataformas del menú.</td></tr>';
}

export function reportHTML(sessions, styles = '', options = {}) {
  const model = options.model || TrackerCore.buildMenuModel(sessions);
  const media = (options.assets?.media || []).map(item => ({
    id: String(item.id || ''),
    taste: String(item.taste || ''),
    kind: item.kind === 'video' ? 'video' : 'image',
    src: embeddedSource(item.src, item.kind === 'video' ? 'video' : 'image'),
    poster: embeddedSource(item.poster, 'image'),
    title: String(item.title || 'Un bocado visual'),
    description: String(item.description || '')
  })).filter(item => item.src);
  const backgrounds = (options.assets?.backgrounds || []).map(item => ({
    taste: String(item.taste || ''),
    src: embeddedSource(item.src, 'image')
  })).filter(item => item.src);
  const payload = serialise({
    model,
    media,
    backgrounds
  });
  const fontData = embeddedSource(options.fontData, 'font');
  const font = fontData ? `
    @font-face {
      font-family: 'Kode Mono';
      src: url('${fontData}') format('${/woff2/i.test(fontData.slice(0, 40)) ? 'woff2' : 'truetype'}');
      font-style: normal;
      font-weight: 400 700;
      font-display: swap;
    }
  ` : '';
  const runtime = String(options.runtime || '').replace(/<\/script/gi, '<\\/script');
  const safeStyles = String(styles).replace(/<\/style/gi, '<\\/style');
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="buffet-format" content="menu-v5">
  <meta name="generator" content="Buffet Visual 3.9.0">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Buffet Visual · Tu plato digital</title>
  <style>
${font}
${safeStyles}
  </style>
</head>
<body>
  <main id="plato" aria-label="Tu menú gastronómico de contenido">
    <div id="fondos" class="capa-fondos" aria-hidden="true"></div>
    <div id="bocados" class="capa-bocados" aria-label="Bocados visuales"></div>
    <div id="frases" class="capa-frases" aria-hidden="true"></div>
    <p id="plato-vacio" class="plato-vacio" hidden>
      Una mesa en blanco. Todavía no hay tiempo registrado en las plataformas del menú.
    </p>
  </main>
  <button id="pedir-cuenta" class="pedir-cuenta" type="button" aria-haspopup="dialog">
    PIDE LA CUENTA
  </button>
  <button id="pausar-sonido" class="control-sonido" type="button" hidden>
    DESACTIVAR SONIDO
  </button>

  <dialog id="cuenta" class="cuenta" aria-labelledby="ticket-titulo">
    <article class="ticket" tabindex="-1">
      <button id="cerrar-cuenta" class="cerrar-cuenta" type="button" aria-label="Cerrar la cuenta">×</button>
      <header class="ticket-cabecera">
        <h1 id="ticket-titulo">Buffet Visual</h1>
        <p>Ticket de contenido</p>
      </header>
      <div class="ticket-fecha">
        <span>Ticket</span>
        <time>${escape(dateLabel(model.endedAt || model.createdAt))}</time>
      </div>
      <table class="ticket-lineas" aria-label="Tiempo y valor estimado por plataforma">
        <thead class="solo-lectores">
          <tr><th>Aplicación</th><th>Tiempo</th><th>Valor estimado</th></tr>
        </thead>
        <tbody>${receiptRows(model)}</tbody>
      </table>
      <p class="ticket-texto">
        Durante tu momento de consumo has generado
        ${escape(money(model.totalAmount))} de valor estimado para las plataformas
        de este ticket.
      </p>
      <div class="ticket-total">
        <strong>Total:</strong>
        <span>${escape(minutes(model.receiptTimeMs))}</span>
        <span>${escape(money(model.totalAmount))}</span>
      </div>
      <p class="ticket-nota">
        Estimación según las tarifas del proyecto. No representa pagos ni ingresos reales.
      </p>
    </article>
  </dialog>
  <p id="avisos" class="solo-lectores" role="status"></p>
  <noscript>Activa JavaScript para explorar tu plato digital y abrir la cuenta.</noscript>
  <script id="menu-datos" type="application/json">${payload}</script>
  <script>
${runtime}
  </script>
</body>
</html>`;
}
