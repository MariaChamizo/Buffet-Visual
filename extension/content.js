(() => {
  // El backend cuenta pantalla; aquí solo se detecta el contenido visto.
  let previousVideo = null;
  let previousTime = null;
  let lastAdvance = 0;
  let roots = [document];
  let scannedAt = -Infinity;

  function findVideos(now) {
    if (now - scannedAt > 5000) {
      roots = [document];
      for (let index = 0; index < roots.length; index++) {
        for (const element of roots[index].querySelectorAll('*')) {
          if (element.shadowRoot) roots.push(element.shadowRoot);
        }
      }
      scannedAt = now;
    }
    return roots.flatMap(root => [...root.querySelectorAll('video')]);
  }

  function contentInfo(platform) {
    let url = '';
    let channel = '';
    let title = document.title.replace(/\s*[-–]\s*(YouTube|Twitch)\s*$/, '').trim();

    if (platform === 'YouTube' || platform === 'YouTube Shorts') {
      const shorts = location.pathname.match(/^\/shorts\/([^/]+)/);
      const id = new URL(location.href).searchParams.get('v') || shorts?.[1];
      if (id) url = 'https://www.youtube.com/watch?v=' + encodeURIComponent(id);
      const heading = document.querySelector('ytd-watch-metadata h1');
      if (!shorts && heading?.textContent.trim()) title = heading.textContent.trim();
    }

    if (platform === 'Twitch') {
      const vod = location.pathname.match(/^\/videos\/(\d+)/);
      const name = location.pathname.match(/^\/([\w-]+)\/?$/)?.[1];
      const reserved = ['directory', 'downloads', 'settings', 'subscriptions', 'inventory'];
      if (vod) url = 'https://www.twitch.tv/videos/' + vod[1];
      else if (name && !reserved.includes(name)) {
        channel = name;
        url = 'https://www.twitch.tv/' + name.toLowerCase();
      }
      const heading = document.querySelector('[data-a-target="stream-title"]');
      if (heading?.textContent.trim()) title = heading.textContent.trim();
    }
    return { url, channel, title };
  }

  function sample() {
    const address = location.hostname ? location.href : location.ancestorOrigins?.[0];
    const platform = TrackerPlatforms.identify(address);
    const now = performance.now();
    let playing = false;
    let info = { url: '', channel: '', title: '' };

    if (['YouTube', 'YouTube Shorts', 'Twitch'].includes(platform)) {
      const video = TrackerMedia.select(findVideos(now), element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 40 && rect.height > 40 && rect.bottom > 0 &&
          rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth &&
          getComputedStyle(element).visibility !== 'hidden';
      });
      if (video !== previousVideo) {
        previousVideo = video;
        previousTime = video?.currentTime;
        lastAdvance = 0;
      }
      if (video && previousTime !== null && video.currentTime !== previousTime) {
        lastAdvance = now;
      }
      previousTime = video?.currentTime ?? null;
      const ad = platform.startsWith('YouTube') &&
        Boolean(document.querySelector('.html5-video-player.ad-showing'));
      playing = TrackerMedia.advancing(video, lastAdvance, now) && !ad;
      info = contentInfo(platform);
    }

    chrome.runtime.sendMessage({
      type: 'SAMPLE',
      sample: {
        platform,
        visible: document.visibilityState === 'visible',
        playing,
        ...info
      }
    }).catch(() => {});
  }

  setInterval(sample, 1000);
  document.addEventListener('visibilitychange', sample);
  for (const event of ['pause', 'ended', 'waiting', 'playing']) {
    document.addEventListener(event, sample, true);
  }
  sample();
})();
