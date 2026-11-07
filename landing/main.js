// Las tablets con teclado o ratón también muestran el aviso de dispositivo.
const mobileDevice = Boolean(navigator.userAgentData?.mobile ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
document.documentElement.classList.toggle('is-mobile-device', mobileDevice);

const limitedScreen = window.matchMedia(
  '(max-width: 767px), (any-hover: none) and (any-pointer: coarse)'
);
const desktopAvailable = () => !mobileDevice && !limitedScreen.matches;

// Portada: las letras ocupan la pantalla antes de reunirse en el nombre.
const title = document.querySelector('.welcome-title');

if (title && window.gsap) {
  const letters = [...title.querySelectorAll('.welcome-letter')];
  const positions = [
    [0.00, 0.03], [0.34, 0.13], [0.66, 0.00], [1.00, 0.10],
    [0.03, 0.48], [0.30, 0.63], [0.68, 0.39], [0.97, 0.49],
    [0.09, 0.93], [0.40, 1.00], [0.73, 0.88], [1.00, 0.99]
  ];
  let intro;
  let resizeFrame;
  let finished = false;

  const arrangeIntro = () => {
    if (!desktopAvailable()) {
      intro?.pause();
      return;
    }
    if (finished) return;
    const elapsed = intro?.time() || 0;
    intro?.kill();
    gsap.set(letters, { clearProps: 'transform' });

    const bounds = letters.map(letter => letter.getBoundingClientRect());
    const margin = Math.max(16, Math.min(innerWidth, innerHeight) * 0.035);
    const footer = document.querySelector('.welcome-questions').getBoundingClientRect();
    const button = document.querySelector('.welcome-enter').getBoundingClientRect();
    const scattered = bounds.map((box, index) => {
      const [horizontal, vertical] = positions[index];
      let left = margin + (innerWidth - margin * 2 - box.width) * horizontal;
      const top = margin + (footer.top - margin * 2 - box.height) * vertical;

      // En ventanas estrechas, deja libre el espacio del botón central.
      const touchesButton = left < button.right + margin &&
        left + box.width > button.left - margin &&
        top < button.bottom + margin && top + box.height > button.top - margin;
      if (touchesButton) {
        left = horizontal < 0.5
          ? button.left - margin - box.width
          : button.right + margin;
        left = Math.max(margin, Math.min(left, innerWidth - margin - box.width));
      }

      return { x: left - box.left, y: top - box.top };
    });
    gsap.set(letters, {
      x: index => scattered[index].x,
      y: index => scattered[index].y
    });
    title.style.visibility = 'visible';
    title.dataset.intro = 'playing';

    intro = gsap.timeline({
      onComplete: () => {
        finished = true;
        title.dataset.intro = 'complete';
        gsap.set(letters, { clearProps: 'transform' });
      }
    });
    intro.to(letters, {
      x: 0,
      y: 0,
      duration: 2.4,
      ease: 'power3.inOut',
      stagger: { each: 0.025, from: 'center' }
    }, 1.1);
    intro.time(elapsed);
  };

  title.style.visibility = 'hidden';
  document.fonts.ready.then(() => {
    arrangeIntro();
    const refreshIntro = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(arrangeIntro);
    };
    window.addEventListener('resize', refreshIntro);
    limitedScreen.addEventListener('change', refreshIntro);
  }).catch(() => {
    title.style.visibility = 'visible';
  });
}

// Cada mensaje se escribe una vez al entrar en pantalla.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

for (const welcome of document.querySelectorAll('[data-typewriter]')) {
  if (reduceMotion && welcome.dataset.typewriter !== 'always') continue;

  const copy = welcome.cloneNode(true);
  copy.querySelectorAll('br').forEach(line => line.replaceWith('\n'));
  const message = copy.textContent.replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n').trim();
  const characters = Array.from(message);
  if (!characters.length) continue;

  // La copia completa reserva espacio y sigue disponible para lectores de pantalla.
  const original = document.createElement('span');
  original.className = 'typewriter-original';
  original.textContent = message;
  const written = document.createElement('span');
  written.className = 'typewriter-text';
  written.setAttribute('aria-hidden', 'true');
  welcome.replaceChildren(original, written);
  welcome.classList.add('typewriter-ready');

  const delay = Number(welcome.dataset.typewriterDelay) || 0;
  const duration = Number(welcome.dataset.typewriterDuration) || characters.length * 36;

  const observer = new IntersectionObserver(entries => {
    if (!desktopAvailable() || !entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    let elapsed = 0;
    let previousTime = null;

    const resetClock = () => { previousTime = null; };
    document.addEventListener('visibilitychange', resetClock);
    limitedScreen.addEventListener('change', resetClock);

    const write = now => {
      if (previousTime !== null && desktopAvailable() && !document.hidden) {
        elapsed += now - previousTime;
      }
      previousTime = now;

      const progress = Math.max(0, Math.min(1, (elapsed - delay) / duration));
      const count = Math.ceil(progress * characters.length);
      written.textContent = characters.slice(0, count).join('');
      welcome.classList.toggle('is-writing', elapsed >= delay && progress < 1);

      if (progress === 1) {
        document.removeEventListener('visibilitychange', resetClock);
        limitedScreen.removeEventListener('change', resetClock);
        return;
      }
      requestAnimationFrame(write);
    };
    requestAnimationFrame(write);
  }, { threshold: 0.5 });

  document.fonts.ready.then(() => observer.observe(welcome));
}
