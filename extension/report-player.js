(() => {
  'use strict';

  // Una plantilla anterior puede seguir cargada al actualizar los recursos del informe.
  document.querySelectorAll('.contenido-registrado').forEach(section => section.remove());

  const dataElement = document.getElementById('menu-datos');
  if (!dataElement) return;

  function showNotice(message) {
    const notice = document.getElementById('avisos');
    notice.className = 'aviso-informe';
    notice.textContent = message;
  }

  let data;
  try {
    data = JSON.parse(dataElement.textContent);
  } catch {
    showNotice('No se han podido leer los datos de este plato. Vuelve a servir la sesión desde Opciones.');
    return;
  }

  const stage = document.getElementById('bocados');
  const phrasesLayer = document.getElementById('frases');
  const backgroundLayer = document.getElementById('fondos');
  const receipt = document.getElementById('cuenta');
  const receiptButton = document.getElementById('pedir-cuenta');
  let soundButton = document.getElementById('pausar-sonido') ||
    document.getElementById('activar-sonido');
  if (!soundButton) {
    soundButton = document.createElement('button');
    document.body.append(soundButton);
  }
  soundButton.id = 'pausar-sonido';
  soundButton.classList.add('control-sonido');
  soundButton.type = 'button';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const model = data.model || {};
  const media = data.media || [];
  const hashtagPools = new Map();
  const hashtagQueues = new Map();
  for (const item of media) {
    const pool = hashtagPools.get(item.taste) || new Set();
    for (const tag of String(item.description || '').match(/#[^\s#]+/g) || []) pool.add(tag);
    hashtagPools.set(item.taste, pool);
  }
  const movingPieces = [];
  const thumbnails = [];
  const backgroundPieces = [];
  const sources = new Map();
  const audioLevels = { ambient: 0.14, background: 0.03, foreground: 0.85 };
  const volumeFrames = new WeakMap();
  let audioEnabled = true;
  let autoplayBlocked = false;
  let audioAttempt = 0;
  let expandedPiece = null;
  let parallaxFrame = 0;
  const pointer = { x: 0, y: 0, currentX: 0, currentY: 0 };

  // La distribución cambia en cada apertura; las tarifas y tiempos no cambian.
  const random = (minimum, maximum) =>
    minimum + Math.random() * (maximum - minimum);
  const clamp = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, value));
  const pick = values => values[Math.floor(Math.random() * values.length)];

  // Cada sabor recorre sus etiquetas antes de volver a repetirlas.
  function nextHashtag(taste) {
    let queue = hashtagQueues.get(taste);
    if (!queue?.length) {
      queue = [...(hashtagPools.get(taste) || [])];
      for (let index = queue.length - 1; index > 0; index--) {
        const next = Math.floor(Math.random() * (index + 1));
        [queue[index], queue[next]] = [queue[next], queue[index]];
      }
      hashtagQueues.set(taste, queue);
    }
    return queue.pop() || '';
  }

  const elapsedMinutes = Number(model.durationMs || 0) / 60000;
  const progress = clamp(Number.isNaN(elapsedMinutes) ? 0 : elapsedMinutes / 45, 0, 1);
  const currentScale = model.density?.scaleMinutes === 45;
  const density = currentScale ? model.density : {
    progress,
    mediaCount: Math.round(120 - 102 * progress),
    textCount: Math.round(72 - 60 * progress)
  };

  // Los motores anteriores no incluían cuotas. Sus recursos siguen siendo utilizables.
  function legacyComposition(section, pool) {
    const available = new Set(pool.map(item => item.taste));
    const tastes = (model.tastes || model.menuTastes || [])
      .filter(taste => available.has(taste.id));
    if (!tastes.length) {
      for (const id of available) tastes.push({ id, weight: 1 });
    }
    if (!tastes.length) return [];
    const total = section === 'backgrounds' ? Math.max(5, tastes.length * 2) :
      section === 'media' ? density.mediaCount : density.textCount;
    const weight = tastes.reduce((sum, taste) => sum + (taste.weight || 1), 0);
    const slots = tastes.map(taste => {
      const quota = total * (taste.weight || 1) / weight;
      return { id: taste.id, count: Math.floor(quota), remainder: quota % 1 };
    });
    const ranked = [...slots].sort((a, b) => b.remainder - a.remainder);
    const rest = total - slots.reduce((sum, slot) => sum + slot.count, 0);
    for (let index = 0; index < rest; index++) ranked[index % ranked.length].count++;
    for (const slot of slots.filter(entry => entry.count === 0)) {
      const donor = [...slots].filter(entry => entry.count > 1)
        .sort((a, b) => b.count - a.count)[0];
      if (donor) {
        donor.count--;
        slot.count++;
      }
    }
    return slots;
  }

  function compositionItems(section, pool) {
    const items = [];
    const compatible = currentScale || section === 'backgrounds';
    const slots = (compatible && model.composition?.[section]) || legacyComposition(section, pool);
    for (const slot of slots) {
      const candidates = pool.filter(item => item.taste === slot.id);
      if (!candidates.length) continue;
      for (let index = 0; index < slot.count; index++) items.push(pick(candidates));
    }
    // Las cuotas son exactas; solo se baraja el orden y la posición de cada pieza.
    for (let index = items.length - 1; index > 0; index--) {
      const next = Math.floor(Math.random() * (index + 1));
      [items[index], items[next]] = [items[next], items[index]];
    }
    return items;
  }

  // Tres planos a distinta profundidad, sin intervenir en la animación del carrusel.
  function paintParallax() {
    parallaxFrame = 0;
    const disabled = reducedMotion.matches || receipt.open || document.hidden;
    if (expandedPiece && !disabled) return;
    const targetX = disabled ? 0 : pointer.x;
    const targetY = disabled ? 0 : pointer.y;
    pointer.currentX += (targetX - pointer.currentX) * 0.12;
    pointer.currentY += (targetY - pointer.currentY) * 0.12;
    for (const [layer, depth] of [
      [backgroundLayer, 8], [stage, 22], [phrasesLayer, 35]
    ]) {
      layer.style.setProperty('--parallax-x', (pointer.currentX * depth).toFixed(2) + 'px');
      layer.style.setProperty('--parallax-y', (pointer.currentY * depth).toFixed(2) + 'px');
    }
    if (Math.abs(targetX - pointer.currentX) + Math.abs(targetY - pointer.currentY) > 0.002) {
      parallaxFrame = requestAnimationFrame(paintParallax);
    }
  }

  function requestParallax() {
    if (!parallaxFrame) parallaxFrame = requestAnimationFrame(paintParallax);
  }

  // Los originales se decodifican una vez. Sus copias pequeñas comparten fuente.
  const sourceBin = document.createElement('div');
  sourceBin.className = 'solo-lectores';
  sourceBin.setAttribute('aria-hidden', 'true');
  document.body.append(sourceBin);

  function fadeVolume(video, target) {
    cancelAnimationFrame(volumeFrames.get(video));
    const initial = video.volume;
    if (Math.abs(initial - target) < 0.001) return;
    const started = performance.now();
    const step = now => {
      const progress = clamp((now - started) / 180, 0, 1);
      video.volume = clamp(initial + (target - initial) * progress, 0, 1);
      if (progress < 1) volumeFrames.set(video, requestAnimationFrame(step));
      else volumeFrames.delete(video);
    };
    volumeFrames.set(video, requestAnimationFrame(step));
  }

  function mixAudio() {
    const detail = expandedPiece?.detail;
    const featured = detail?.tagName === 'VIDEO' ? expandedPiece.source : null;
    for (const source of sources.values()) {
      if (!source.video) continue;
      source.video.muted = !audioEnabled || autoplayBlocked;
      // La fuente compartida del vídeo ampliado sigue avanzando, pero sin duplicar su voz.
      const level = featured ?
        (source === featured ? 0 : audioLevels.background) : audioLevels.ambient;
      fadeVolume(source.video, level);
    }
    if (featured) {
      detail.muted = !audioEnabled || autoplayBlocked;
      fadeVolume(detail, audioLevels.foreground);
    }
  }

  function playVideo(video) {
    const attempt = audioAttempt;
    video.play().catch(error => {
      if (attempt !== audioAttempt || !video.isConnected) return;
      if (error.name === 'NotAllowedError') {
        // Conserva la intención de escuchar aunque el navegador exija un clic.
        autoplayBlocked = true;
        mixAudio();
        updateSoundButton();
        video.muted = true;
        video.play().catch(() => {});
      }
    });
  }

  function resumeVideos() {
    if (!document.hidden && !receipt.open) {
      for (const source of sources.values()) {
        if (source.video) playVideo(source.video);
      }
      if (expandedPiece?.detail?.tagName === 'VIDEO') playVideo(expandedPiece.detail);
    }
  }

  function updateSoundButton() {
    soundButton.textContent = audioEnabled && !autoplayBlocked ?
      'DESACTIVAR SONIDO' : 'ACTIVAR SONIDO';
    soundButton.hidden = ![...sources.values()].some(source => source.video);
  }

  soundButton.addEventListener('click', event => {
    event.stopPropagation();
    audioEnabled = !audioEnabled || autoplayBlocked;
    audioAttempt++;
    if (audioEnabled) autoplayBlocked = false;
    mixAudio();
    updateSoundButton();
    if (audioEnabled) resumeVideos();
  });

  function retryAudio(event) {
    if (!event.isTrusted || !audioEnabled || !autoplayBlocked ||
        soundButton.contains(event.target) || document.hidden || receipt.open) return;
    autoplayBlocked = false;
    audioAttempt++;
    mixAudio();
    updateSoundButton();
    resumeVideos();
  }

  document.addEventListener('click', retryAudio);
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') retryAudio(event);
  });

  function mediaSource(item) {
    const key = item.id || item.src;
    if (sources.has(key)) return sources.get(key);
    const source = { video: null, image: null };
    if (item.poster || item.kind === 'image') {
      source.image = new Image();
      source.image.src = item.poster || item.src;
    }
    if (item.kind === 'video') {
      const video = document.createElement('video');
      video.muted = !audioEnabled || autoplayBlocked;
      video.volume = audioLevels.ambient;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.tabIndex = -1;
      video.src = item.src;
      source.video = video;
      sourceBin.append(video);
      playVideo(video);
    }
    sources.set(key, source);
    return source;
  }

  function drawCover(context, source) {
    const width = source.videoWidth || source.naturalWidth;
    const height = source.videoHeight || source.naturalHeight;
    if (!width || !height) return;
    const ratio = Math.max(context.canvas.width / width, context.canvas.height / height);
    const cropWidth = context.canvas.width / ratio;
    const cropHeight = context.canvas.height / ratio;
    context.drawImage(
      source,
      (width - cropWidth) / 2,
      (height - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      context.canvas.width,
      context.canvas.height
    );
  }

  function paintThumbnails() {
    if (document.hidden || receipt.open) return;
    for (const piece of movingPieces) {
      if (!piece.hashtag) continue;
      const iteration = piece.animation.effect.getComputedTiming().currentIteration;
      if (iteration !== piece.hashtagIteration && piece.element.getBoundingClientRect().right < 0) {
        piece.element.textContent = nextHashtag(piece.element.dataset.taste);
        piece.hashtagIteration = iteration;
      }
    }
    for (const thumb of thumbnails) {
      if (!thumb.visible || thumb.piece.expanded) continue;
      const source = thumb.source;
      const frame = source.video?.readyState >= 2 ? source.video :
        source.image?.complete ? source.image : null;
      if (!frame) continue;
      try {
        drawCover(thumb.context, frame);
      } catch {
        // Un fotograma que aún no está listo se vuelve a intentar en el siguiente pulso.
      }
    }
  }

  const observer = typeof IntersectionObserver === 'function' ?
    new IntersectionObserver(entries => {
      for (const entry of entries) {
        const thumb = thumbnails.find(item => item.piece.element === entry.target);
        if (thumb) thumb.visible = entry.isIntersecting;
      }
    }) : null;

  function animatePiece(element, width) {
    const piece = { element, animation: null, expanded: false, detail: null, width };
    movingPieces.push(piece);
    piece.animation = element.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(' + (innerWidth + width * 2 + 80) + 'px)' }
    ], {
      duration: 150000,
      iterations: Infinity,
      easing: 'linear'
    });
    return piece;
  }

  function arrangePieces(pieces) {
    if (!pieces.length) return;
    const phrases = pieces[0].element.classList.contains('frase');
    const trackWidth = innerWidth + pieces[0].width * 2 + 80;
    const usableHeight = Math.max(80, innerHeight - 64);
    const rows = Math.max(1, Math.min(pieces.length, Math.round(
      Math.sqrt(pieces.length * usableHeight / trackWidth * (phrases ? 2 : 1))
    )));
    const durations = Array.from({ length: rows }, () =>
      random(phrases ? 110000 : 105000, phrases ? 215000 : 190000));
    const lanes = Array.from({ length: rows }, () => []);
    const horizontalJitter = 0.38 - density.progress * 0.28;
    const verticalJitter = 0.26 - density.progress * 0.18;

    // Filas escalonadas y algo de azar: más espacio al alargarse la sesión.
    // Cada fila comparte velocidad para conservar sus huecos durante todo el bucle.
    pieces.forEach((piece, index) => {
      const row = index % rows;
      const columns = Math.ceil((pieces.length - row) / rows);
      const column = Math.floor(index / rows);
      const phase = (column + 0.5 + (row % 2) * 0.35 +
        random(-horizontalJitter, horizontalJitter)) / columns % 1;
      const height = piece.element.offsetHeight;
      const top = 12 + (row + 0.5 + random(-verticalJitter, verticalJitter)) *
        usableHeight / rows - height / 2;
      piece.element.style.top = clamp(top, 4, Math.max(4, innerHeight - height - 52)) + 'px';
      piece.animation.effect.setKeyframes([
        { transform: 'translateX(0)' },
        { transform: 'translateX(' + trackWidth + 'px)' }
      ]);
      piece.animation.effect.updateTiming({ duration: durations[row] });
      piece.slotTime = phase * durations[row];
      piece.lane = lanes[row];
      piece.lane.push(piece);
      piece.animation.currentTime = piece.slotTime;
      if (piece.hashtag) {
        piece.hashtagIteration = piece.animation.effect.getComputedTiming().currentIteration;
      }
    });
  }

  function positionDetail(piece) {
    const rect = piece.element.getBoundingClientRect();
    const width = Math.min(480, innerWidth - 36);
    piece.element.style.setProperty('--detail-width', width + 'px');
    const captionHeight = piece.element.querySelector('.bocado-caption').offsetHeight;
    const mediaHeight = Math.min(innerHeight * 0.62, 460, width / (piece.aspect || 1.5),
      Math.max(24, innerHeight - captionHeight - 38));
    piece.element.style.setProperty('--detail-media-height', mediaHeight + 'px');
    const height = piece.element.querySelector('.bocado-card').offsetHeight;
    const left = clamp(rect.left, 18, Math.max(18, innerWidth - width - 18));
    const top = clamp(rect.top, 18, Math.max(18, innerHeight - height - 18));
    piece.element.style.setProperty('--detail-x', left - rect.left + 'px');
    piece.element.style.setProperty('--detail-y', top - rect.top + 'px');
  }

  function closeDetail(piece) {
    if (!piece?.expanded) return;
    piece.expanded = false;
    piece.element.classList.remove('is-expanded');
    piece.element.setAttribute('aria-expanded', 'false');
    if (piece.detail) {
      if (piece.detail.tagName === 'VIDEO') {
        cancelAnimationFrame(volumeFrames.get(piece.detail));
        volumeFrames.delete(piece.detail);
        piece.detail.pause();
        piece.detail.removeAttribute('src');
        piece.detail.load();
      }
      piece.detail.remove();
      piece.detail = null;
    }
    // Tras el hover vuelve a su hueco en la fila, aunque las otras piezas hayan avanzado.
    const peer = piece.lane?.find(other => other !== piece);
    if (peer?.animation?.currentTime != null) {
      piece.animation.currentTime = Math.max(0,
        peer.animation.currentTime + piece.slotTime - peer.slotTime);
    }
    if (!document.hidden && !receipt.open) piece.animation?.play();
    if (expandedPiece === piece) expandedPiece = null;
    mixAudio();
    document.body.classList.remove('explorando');
    requestParallax();
  }

  function openDetail(piece, item, source, card) {
    if (piece.expanded || receipt.open) return;
    closeDetail(expandedPiece);
    piece.animation?.pause();
    piece.expanded = true;
    piece.source = source;
    expandedPiece = piece;
    const detail = document.createElement(item.kind === 'video' ? 'video' : 'img');
    detail.className = 'bocado-detalle';
    detail.src = item.src;
    const sourceWidth = source.video?.videoWidth || source.image?.naturalWidth || 480;
    const sourceHeight = source.video?.videoHeight || source.image?.naturalHeight || 320;
    piece.aspect = sourceWidth / sourceHeight;
    if (item.kind === 'video') {
      detail.muted = !audioEnabled || autoplayBlocked;
      detail.volume = audioLevels.foreground;
      detail.loop = true;
      detail.playsInline = true;
      if (item.poster) detail.poster = item.poster;
      detail.addEventListener('loadedmetadata', () => {
        if (detail.videoWidth && detail.videoHeight) {
          piece.aspect = detail.videoWidth / detail.videoHeight;
        }
        if (source.video && Number.isFinite(source.video.currentTime)) {
          detail.currentTime = source.video.currentTime;
        }
        if (piece.expanded) positionDetail(piece);
      }, { once: true });
    } else {
      detail.alt = item.description;
      detail.addEventListener('load', () => {
        piece.aspect = detail.naturalWidth / detail.naturalHeight;
        if (piece.expanded) positionDetail(piece);
      }, { once: true });
    }
    card.prepend(detail);
    piece.detail = detail;
    mixAudio();
    if (item.kind === 'video') playVideo(detail);
    piece.element.classList.add('is-expanded');
    piece.element.setAttribute('aria-expanded', 'true');
    positionDetail(piece);
    document.body.classList.add('explorando');
    requestParallax();
  }

  function addBite(item) {
    const width = Math.round(random(53, 118));
    const height = Math.round(width * random(0.58, 0.85));
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'bocado';
    element.style.setProperty('--thumb-width', width + 'px');
    element.style.setProperty('--thumb-height', height + 'px');
    element.dataset.taste = item.taste;
    element.dataset.kind = item.kind;
    element.setAttribute('aria-label', item.description);
    element.setAttribute('aria-expanded', 'false');

    const card = document.createElement('span');
    card.className = 'bocado-card';
    const canvas = document.createElement('canvas');
    canvas.className = 'bocado-canvas';
    canvas.width = 32;
    canvas.height = Math.max(16, Math.round(32 * height / width));
    canvas.setAttribute('aria-hidden', 'true');
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    card.append(canvas);

    const caption = document.createElement('span');
    caption.className = 'bocado-caption';
    const description = document.createElement('span');
    description.className = 'bocado-descripcion';
    for (const tag of hashtagPools.get(item.taste) || []) {
      const label = document.createElement('span');
      label.className = 'hashtag';
      label.textContent = tag;
      if (description.childNodes.length) description.append(document.createTextNode(' '));
      description.append(label);
    }
    caption.append(description);
    card.append(caption);
    element.append(card);
    stage.append(element);

    const source = mediaSource(item);
    const piece = animatePiece(element, 180);
    const thumb = { piece, source, context, visible: true };
    thumbnails.push(thumb);
    observer?.observe(element);

    const open = () => openDetail(piece, item, source, card);
    element.addEventListener('pointerenter', open);
    element.addEventListener('focus', open);
    element.addEventListener('pointerleave', () => {
      if (!element.matches(':focus-visible')) closeDetail(piece);
    });
    element.addEventListener('blur', () => {
      if (!element.matches(':hover')) closeDetail(piece);
    });
    element.addEventListener('click', open);
    return piece;
  }

  function addPhrase(item) {
    const line = document.createElement('p');
    line.className = 'frase';
    line.dataset.taste = item.taste;
    line.textContent = nextHashtag(item.taste);
    phrasesLayer.append(line);
    const piece = animatePiece(line, 390);
    piece.hashtag = true;
    piece.hashtagIteration = 0;
  }

  function positionBackground(piece) {
    const { image } = piece;
    const aspect = image.naturalWidth && image.naturalHeight ?
      image.naturalWidth / image.naturalHeight : 1;
    let width = clamp(innerWidth / Math.sqrt(backgroundPieces.length) * 0.75, 190, 560) *
      piece.scale;
    let height = width / aspect;
    if (height > innerHeight * 0.6) {
      height = innerHeight * 0.6;
      width = height * aspect;
    }
    image.style.width = width + 'px';
    image.style.height = height + 'px';
    image.style.left = piece.x * innerWidth + 'px';
    image.style.top = piece.y * innerHeight + 'px';
    image.style.transform = 'translate(-50%, -50%) rotate(' + piece.angle + 'deg)';
  }

  function arrangeBackgrounds() {
    for (const piece of backgroundPieces) positionBackground(piece);
  }

  function addBackgrounds() {
    const backgrounds = compositionItems('backgrounds', data.backgrounds || []);
    if (!backgrounds.length) return;
    // Cuatro centros en los bordes: se ve media figura y el resto sale de la pantalla.
    const edges = [
      { x: 0, y: random(0.12, 0.35) },
      { x: random(0.6, 0.85), y: 0 },
      { x: 1, y: random(0.6, 0.85) },
      { x: random(0.15, 0.4), y: 1 }
    ];
    const interiorCount = Math.max(1, backgrounds.length - edges.length);
    const columns = Math.ceil(Math.sqrt(interiorCount * innerWidth / innerHeight));
    const rows = Math.ceil(interiorCount / columns);
    for (const [index, background] of backgrounds.entries()) {
      const image = new Image();
      image.className = 'fondo-ascii';
      image.dataset.taste = background.taste;
      image.alt = '';
      const interiorIndex = index - edges.length;
      const position = edges[index] || {
        x: (interiorIndex % columns + 0.5 + random(-0.22, 0.22)) / columns,
        y: (Math.floor(interiorIndex / columns) + 0.5 + random(-0.22, 0.22)) / rows
      };
      const piece = {
        image, ...position, scale: random(0.85, 1.15), angle: random(-12, 12)
      };
      backgroundPieces.push(piece);
      image.addEventListener('load', () => positionBackground(piece), { once: true });
      image.src = background.src;
      backgroundLayer.append(image);
    }
    arrangeBackgrounds();
  }

  function syncMotion() {
    requestParallax();
    mixAudio();
    // El carrusel es continuo, también con la preferencia de movimiento reducido.
    const paused = document.hidden || receipt.open;
    for (const piece of movingPieces) {
      if (paused || piece.expanded) piece.animation?.pause();
      else piece.animation?.play();
    }
    for (const source of sources.values()) {
      if (!source.video) continue;
      if (document.hidden || receipt.open) source.video.pause();
      else playVideo(source.video);
    }
    if (expandedPiece?.detail?.tagName === 'VIDEO') {
      if (paused) expandedPiece.detail.pause();
      else playVideo(expandedPiece.detail);
    }
  }

  // El diálogo nativo conserva el foco y se puede cerrar con Escape.
  receiptButton.addEventListener('click', () => {
    closeDetail(expandedPiece);
    receipt.showModal();
    receipt.querySelector('.ticket').focus();
    syncMotion();
  });
  document.getElementById('cerrar-cuenta').addEventListener('click', () => receipt.close());
  receipt.addEventListener('click', event => {
    const bounds = receipt.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (event.target === receipt && outside) receipt.close();
  });
  receipt.addEventListener('close', () => {
    syncMotion();
    receiptButton.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expandedPiece) closeDetail(expandedPiece);
  });
  document.addEventListener('visibilitychange', syncMotion);
  reducedMotion.addEventListener('change', syncMotion);
  document.addEventListener('pointermove', event => {
    pointer.x = (event.clientX / innerWidth - 0.5) * 2;
    pointer.y = (event.clientY / innerHeight - 0.5) * 2;
    requestParallax();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.x = 0;
    pointer.y = 0;
    requestParallax();
  });
  window.addEventListener('resize', () => {
    arrangeBackgrounds();
    arrangePieces(thumbnails.map(thumb => thumb.piece));
    arrangePieces(movingPieces.filter(piece => piece.element.classList.contains('frase')));
    if (expandedPiece) positionDetail(expandedPiece);
  });

  addBackgrounds();
  if (!media.length) {
    document.getElementById('plato-vacio').hidden = false;
  } else {
    for (const item of compositionItems('media', media)) addBite(item);
    for (const item of compositionItems('descriptions', media)) addPhrase(item);
    arrangePieces(thumbnails.map(thumb => thumb.piece));
    arrangePieces(movingPieces.filter(piece => piece.element.classList.contains('frase')));
    paintThumbnails();
    setInterval(paintThumbnails, 160);
  }
  if (!model.composition) {
    showNotice('Este archivo se generó con un motor anterior. Recarga la extensión y usa Opciones → Servir última sesión para recuperar la mezcla completa.');
  }
  if (media.length && !stage.children.length) {
    showNotice('No se ha podido componer el plato. Los datos siguen en el ticket; vuelve a servir la sesión desde Opciones.');
  }
  updateSoundButton();
  syncMotion();
})();
