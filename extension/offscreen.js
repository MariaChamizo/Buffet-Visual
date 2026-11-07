// El mismo archivo aloja el reloj y conecta sus pulsos con el backend.
if (typeof document === 'undefined') {
  setInterval(() => postMessage('tick'), 1000);
  postMessage('tick');
} else {
  const clock = new Worker('offscreen.js');
  let sending = false;
  const exports = new Set();

  // Los Blob evitan pasar vídeos incrustados como una URL de datos enorme.
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'CREATE_REPORT_BLOB') {
      const url = URL.createObjectURL(new Blob([message.html], { type: 'text/html;charset=utf-8' }));
      exports.add(url);
      reply({ url });
    } else if (message.type === 'RELEASE_REPORT_BLOB') {
      URL.revokeObjectURL(message.url);
      exports.delete(message.url);
      reply({ ok: true });
    } else if (message.type === 'REPORT_EXPORT_STATUS') {
      reply({ busy: exports.size > 0 });
    }
  });

  clock.onmessage = async () => {
    if (sending) return;
    sending = true;
    try {
      await chrome.runtime.sendMessage({ type: 'CLOCK_TICK' });
    } catch {
      // El navegador puede estar cerrándose o la extensión recargándose.
    } finally {
      sending = false;
    }
  };
}
