// Utilidades compartidas por el detector, el panel y el backend.
(() => {
  // Catálogo compartido de dominios y aplicaciones.
  globalThis.TrackerPlatforms = {
    names: [
      'YouTube', 'YouTube Shorts', 'TikTok', 'Netflix', 'Prime Video', 'Disney+', 'Twitch',
      'HBO Max', 'Apple TV', 'Movistar Plus+', 'Filmin', 'Twitter (X)',
      'Instagram Reels', 'Instagram', 'Facebook Reels', 'Facebook', 'Pinterest',
      'Gmail', 'Google Docs', 'Google Sheets', 'Google Slides', 'Google Drive',
      'Google Calendar', 'Google Meet', 'Google Chat', 'Google Keep',
      'Google Forms', 'Google', 'LinkedIn', 'InfoJobs', 'Indeed',
      'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint',
      'Outlook', 'OneDrive', 'Microsoft Teams', 'Microsoft Office'
    ],

    identify(address) {
      let url;
      try { url = new URL(address); } catch { return null; }
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      const host = url.hostname;
      const path = url.pathname;
      const domain = name => host === name || host.endsWith('.' + name);

      if (domain('youtube.com') && path.startsWith('/shorts/')) return 'YouTube Shorts';
      if (domain('twitter.com') || domain('x.com')) return 'Twitter (X)';
      const media = {
        'youtube.com': 'YouTube',
        'tiktok.com': 'TikTok',
        'netflix.com': 'Netflix',
        'primevideo.com': 'Prime Video',
        'disneyplus.com': 'Disney+',
        'twitch.tv': 'Twitch',
        'hbo.com': 'HBO Max',
        'hbomax.com': 'HBO Max',
        'max.com': 'HBO Max',
        'tv.apple.com': 'Apple TV',
        'movistarplus.es': 'Movistar Plus+',
        'filmin.es': 'Filmin'
      };
      for (const [name, platform] of Object.entries(media)) {
        if (domain(name)) return platform;
      }
      if (domain('amazon.es') || domain('amazon.com')) {
        return /video|watch/.test(path) ? 'Prime Video' : host;
      }
      if (domain('instagram.com')) {
        return /^\/reels?(\/|$)/.test(path) ? 'Instagram Reels' : 'Instagram';
      }
      if (domain('facebook.com')) {
        return /^\/reels?(\/|$)/.test(path) ? 'Facebook Reels' : 'Facebook';
      }
      const pinterestDomains = [
        'pinterest.com', 'pinterest.es', 'pinterest.fr', 'pinterest.de',
        'pinterest.it', 'pinterest.pt', 'pinterest.co.uk', 'pinterest.ca',
        'pinterest.com.au', 'pinterest.jp', 'pinterest.com.mx', 'pin.it'
      ];
      if (pinterestDomains.some(domain)) return 'Pinterest';

      const google = {
        'mail.google.com': 'Gmail',
        'drive.google.com': 'Google Drive',
        'calendar.google.com': 'Google Calendar',
        'meet.google.com': 'Google Meet',
        'chat.google.com': 'Google Chat',
        'keep.google.com': 'Google Keep'
      };
      if (google[host]) return google[host];
      const press = {
        'marca.com': 'Marca',
        'elpais.com': 'El País',
        'okdiario.com': 'OkDiario',
        'elmundo.es': 'El Mundo',
        'lavanguardia.com': 'La Vanguardia',
        'abc.es': 'ABC',
        '20minutos.es': '20 minutos',
        'eldiario.es': 'elDiario.es'
      };
      for (const [name, platform] of Object.entries(press)) {
        if (domain(name)) return platform;
      }
      if (host === 'docs.google.com') {
        if (path.startsWith('/spreadsheets')) return 'Google Sheets';
        if (path.startsWith('/presentation')) return 'Google Slides';
        if (path.startsWith('/forms')) return 'Google Forms';
        return 'Google Docs';
      }
      if (domain('google.com') || domain('google.es')) return 'Google';
      if (domain('linkedin.com')) return 'LinkedIn';
      if (domain('infojobs.net')) return 'InfoJobs';
      if (domain('indeed.com') || domain('indeed.es')) return 'Indeed';
      if (host.startsWith('outlook.') &&
          ['live.com', 'office.com', 'office365.com', 'cloud.microsoft'].some(domain)) {
        return 'Outlook';
      }
      if (domain('outlook.com')) return 'Outlook';
      if (domain('onedrive.com') || host === 'onedrive.live.com') return 'OneDrive';
      if (host.startsWith('teams.') &&
          ['microsoft.com', 'live.com', 'cloud.microsoft'].some(domain)) {
        return 'Microsoft Teams';
      }

      const office = [
        'office.com', 'office365.com', 'microsoft365.com',
        'cloud.microsoft', 'sharepoint.com', 'officeapps.live.com',
        'word.cloud.microsoft', 'excel.cloud.microsoft', 'powerpoint.cloud.microsoft'
      ].some(domain) || ['word.online', 'excel.online', 'powerpoint.online'].includes(host);
      if (office) {
        const route = (host + path).toLowerCase();
        if (/word|\/document/.test(route)) return 'Microsoft Word';
        if (/excel|\/spreadsheet/.test(route)) return 'Microsoft Excel';
        if (/powerpoint|\/presentation/.test(route)) return 'Microsoft PowerPoint';
        return 'Microsoft Office';
      }
      // Otras apps: solo el dominio, sin títulos ni direcciones privadas.
      return host.replace(/^www\./, '');
    }
  };

  // Compartido por el detector y sus pruebas; sin dependencias del navegador.
  globalThis.TrackerMedia = {
    select(videos, visible) {
      return videos.filter(visible).sort((a, b) => {
        const active = v => Number(!v.paused && !v.ended && v.readyState >= 2);
        const area = video => video.clientWidth * video.clientHeight;
        return active(b) - active(a) || area(b) - area(a);
      })[0];
    },
    advancing(video, lastAdvance, now) {
      // HAVE_CURRENT_DATA (2) basta si currentTime está avanzando realmente.
      return Boolean(
        video && !video.paused && !video.ended &&
        video.readyState >= 2 && lastAdvance > 0 && now - lastAdvance < 1600
      );
    }
  };

  const platforms = TrackerPlatforms.names;
  const identifyPlatform = address => TrackerPlatforms.identify(address);
  const freshState = () => ({ version: 2, active: null, sessions: [] });

  function escapeHTML(value) {
    const entities = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    };
    return String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
  }

  function newSession(now) {
    return {
      id: crypto.randomUUID(),
      metric: 'screen',
      startedAt: now,
      endedAt: null,
      totals: {},
      videos: [],
      streams: [],
      last: null
    };
  }

  // Tiempo en pantalla, independiente de pausas y cambios de contenido.
  function record(session, sample, now) {
    const previous = session.last;
    const delta = previous ? now - previous.at : 0;
    if (previous?.active && delta > 0 && delta <= 3500) {
      const platform = previous.platform;
      session.totals[platform] = (session.totals[platform] || 0) + delta;
    }
    session.last = { platform: sample.platform, active: sample.active, at: now };
  }

  // Un vídeo o canal por sesión; reanudarlo actualiza el registro existente.
  function recordContent(session, sample, now) {
    if (!sample.playing || !sample.url) return;
    const collection = ['YouTube', 'YouTube Shorts'].includes(sample.platform) ? session.videos :
      sample.platform === 'Twitch' ? (session.streams ||= []) : null;
    if (!collection) return;
    const existing = collection.find(item => item.url === sample.url);
    if (existing) {
      existing.lastSeenAt = now;
      if (sample.title) existing.title = sample.title;
      if (sample.channel) existing.channel = sample.channel;
      return;
    }
    collection.push({
      title: sample.title,
      channel: sample.channel || '',
      url: sample.url,
      seenAt: now,
      lastSeenAt: now
    });
  }

  function publicSession(session) {
    const { last, ...result } = session;
    return result;
  }

  // Tarifas editoriales del proyecto: son estimaciones, no cobros reales.
  const tasteLabels = {
    salado: 'Salado',
    dulce: 'Dulce',
    amargo: 'Amargo',
    acido: 'Ácido',
    umami: 'Umami'
  };
  const pressNames = [
    'Marca', 'El País', 'OkDiario', 'El Mundo', 'La Vanguardia', 'ABC', '20 minutos', 'elDiario.es'
  ];

  function platformProfile(platform) {
    if (platform === 'TikTok' || platform === 'YouTube Shorts') {
      return { taste: 'salado', rate: 0.0001 };
    }
    if (platform === 'YouTube' || platform === 'Twitch') {
      return { taste: 'salado', rate: 0.002 };
    }
    if (['Instagram', 'Instagram Reels', 'Pinterest', 'Facebook', 'Facebook Reels'].includes(platform)) {
      return { taste: 'dulce', rate: 0.003 };
    }
    if (platform === 'Twitter (X)' || platform === 'Twitter' || platform === 'X') {
      return { taste: 'acido', rate: 0.003 };
    }
    if (['Netflix', 'Prime Video', 'Disney+', 'HBO Max', 'HBO', 'Apple TV',
      'Movistar Plus+', 'Filmin'].includes(platform)) {
      return { taste: 'umami', rate: 0.004 };
    }
    if (platform === 'LinkedIn') return { taste: 'amargo', rate: 0.01 };
    if (pressNames.includes(platform)) return { taste: 'amargo', rate: 0.001 };
    if (platform === 'Gmail' ||
      (platform !== 'Google' && platforms.includes(platform) &&
        /^(Google|Microsoft) /.test(platform)) ||
      ['Outlook', 'OneDrive', 'InfoJobs', 'Indeed'].includes(platform)) {
      return { taste: 'amargo', rate: 0.002 };
    }
    return { taste: null, rate: null };
  }

  function menuDensity(durationMs) {
    const milliseconds = Number(durationMs) || 0;
    const progress = Math.max(0, Math.min(1, milliseconds / (45 * 60000)));
    return {
      scaleMinutes: 45,
      progress,
      mediaCount: Math.round(120 - 102 * progress),
      textCount: Math.round(72 - 60 * progress)
    };
  }

  // Redondeo por restos mayores: las cuotas suman el total y cada sabor tiene presencia.
  function allocateTasteCounts(tastes, total) {
    if (!tastes.length || total <= 0) return [];
    const count = Math.max(tastes.length, Math.round(total));
    const weight = tastes.reduce((sum, taste) => sum + taste.weight, 0);
    const slots = tastes.map(taste => {
      const quota = count * taste.weight / (weight || 1);
      return { id: taste.id, quota, count: Math.floor(quota) };
    });
    const ranked = [...slots].sort((a, b) =>
      (b.quota - b.count) - (a.quota - a.count));
    const remainder = count - slots.reduce((sum, slot) => sum + slot.count, 0);
    for (let index = 0; index < remainder; index++) ranked[index % ranked.length].count++;
    for (const slot of slots.filter(entry => entry.count === 0)) {
      const donor = [...slots].filter(entry => entry.count > 1)
        .sort((a, b) => (b.count - b.quota) - (a.count - a.quota))[0];
      if (donor) {
        donor.count--;
        slot.count++;
      }
    }
    return slots.map(({ id, count: amount }) => ({ id, count: amount }));
  }

  function buildMenuModel(sessions, now = Date.now()) {
    const totals = {};
    let durationMs = 0;
    const starts = [];
    const ends = [];
    const content = [];
    for (const session of sessions) {
      const start = Number(session.startedAt);
      const end = Number(session.endedAt ?? now);
      starts.push(start);
      ends.push(end);
      durationMs += Math.max(0, end - start);
      for (const [platform, milliseconds] of Object.entries(session.totals || {})) {
        const value = Number(milliseconds);
        if (Number.isFinite(value) && value > 0) {
          totals[platform] = (totals[platform] || 0) + value;
        }
      }
      for (const [key, platform] of [['videos', 'YouTube'], ['streams', 'Twitch']]) {
        for (const item of session[key] || []) content.push({ ...item, platform });
      }
    }
    const tasteTotals = {};
    const items = Object.entries(totals).map(([platform, timeMs]) => {
      const { taste, rate } = platformProfile(platform);
      if (taste) tasteTotals[taste] = (tasteTotals[taste] || 0) + timeMs;
      const minutes = timeMs / 60000;
      return { platform, taste, timeMs, minutes, rate, amount: rate === null ? 0 : minutes * rate };
    });
    const classifiedTime = Object.values(tasteTotals).reduce((sum, value) => sum + value, 0);
    const tastes = Object.entries(tasteLabels).filter(([id]) => tasteTotals[id] > 0)
      .map(([id, label]) => ({
        id, label, timeMs: tasteTotals[id], weight: tasteTotals[id] / (classifiedTime || 1)
      }));
    const density = menuDensity(durationMs);
    const receiptItems = items.filter(item => item.taste && item.rate !== null);
    return {
      durationMs,
      startedAt: starts.length ? Math.min(...starts) : now,
      endedAt: ends.length ? Math.max(...ends) : now,
      createdAt: now,
      totalTimeMs: items.reduce((sum, item) => sum + item.timeMs, 0),
      totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
      items,
      receiptItems,
      receiptTimeMs: receiptItems.reduce((sum, item) => sum + item.timeMs, 0),
      tastes,
      menuTastes: tastes,
      composition: {
        media: allocateTasteCounts(tastes, density.mediaCount),
        descriptions: allocateTasteCounts(tastes, density.textCount),
        backgrounds: allocateTasteCounts(tastes, Math.max(5, tastes.length * 2))
      },
      content,
      density,
      sessionsCount: sessions.length,
      estimate: true
    };
  }

  globalThis.TrackerCore = {
    platforms,
    identifyPlatform,
    freshState,
    escapeHTML,
    newSession,
    record,
    recordContent,
    publicSession,
    platformProfile,
    menuDensity,
    allocateTasteCounts,
    buildMenuModel
  };
})();
