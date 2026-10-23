// Two Stremio addons backed by the aurasports.xyz APIs.
// Add a new addon by adding another entry to SOURCES.

const getJSON = async (url) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://aurasports.xyz/',
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
};

const arr = (v) => (Array.isArray(v) ? v : []);

const SOURCES = {
  // ---------- Addon 1: /api/sportea ----------
  sportea: {
    prefix: 'sportea',
    manifestId: 'xyz.aurasports.sportea',
    name: 'Aura Sportea',
    description: 'Live and upcoming sports events from Aura Sports (Sportea feed).',
    catalogId: 'sportea-events',
    genres: ['MOTORSPORTS', 'EPL', 'SERIE-A', 'LALIGA', 'NBA', 'NHL', 'CFB', 'MLB', 'BUNDESLIGA'],
    async load() {
      const data = await getJSON('https://aurasports.xyz/api/sportea');
      const out = [];
      for (const day of arr(data))
        for (const sp of arr(day.schedule))
          for (const e of arr(sp.league_schedule)) {
            const links = arr(e.streams)
              .filter((s) => s && s.stream_link)
              .map((s) => ({ url: s.stream_link, lang: s.stream_lang || '' }));
            if (!links.length && e.sch_iframe) links.push({ url: e.sch_iframe, lang: '' });
            out.push({
              id: `sportea:${e.sch_id}`,
              name: e.teams,
              sport: sp.sport,
              league: e.league,
              when: `${e.event_date} · ${e.event_time}`,
              live: e.live_status === 1 || String(e.event_status).toUpperCase() === 'LIVE',
              poster: e.strThumb || e.sch_home_logo || undefined,
              links,
            });
          }
      return out;
    },
  },

  // ---------- Addon 2: /api/schedule ----------
  schedule: {
    prefix: 'aurasched',
    manifestId: 'xyz.aurasports.schedule',
    name: 'Aura Schedule',
    description: 'Sports schedule from Aura Sports (Schedule feed).',
    catalogId: 'aurasched-events',
    genres: ['LALIGA', 'NBA', 'NHL', 'CFB', 'MLS', 'WNBA'],
    async load() {
      const data = await getJSON('https://aurasports.xyz/api/schedule');
      const out = [];
      for (const cat of arr(data))
        for (const e of arr(cat.schedule)) {
          const url = e.watchUrl || e.iframeUrl;
          const status = String(e.status || '').toLowerCase();
          out.push({
            id: `aurasched:${e.id}`,
            name: e.title,
            sport: String(e.category || cat.category_name || '').toUpperCase(),
            league: e.league_name,
            when: e.date_iso ? new Date(e.date_iso).toUTCString().replace('GMT', 'UTC') : '',
            released: e.date_iso,
            live: status === 'live' || status === 'in_progress',
            poster: e.thumbnail || (e.teams && e.teams.home && e.teams.home.badge) || undefined,
            links: url ? [{ url, lang: '' }] : [],
            sortTime: e.date || 0,
          });
        }
      return out.sort((a, b) => a.sortTime - b.sortTime);
    },
  },
};

// ---------- helpers ----------
const toMeta = (ev) => ({
  id: ev.id,
  type: 'tv',
  name: (ev.live ? '🔴 ' : '') + ev.name,
  poster: ev.poster,
  background: ev.poster,
  posterShape: 'landscape',
  genres: [ev.sport],
  releaseInfo: ev.league,
  released: ev.released,
  description: `${ev.league} · ${ev.sport}\n${ev.live ? 'LIVE NOW' : 'Scheduled'}: ${ev.when}`,
});

const manifest = (src) => ({
  id: src.manifestId,
  version: '1.0.0',
  name: src.name,
  description: src.description,
  resources: ['catalog', 'meta', 'stream'],
  types: ['tv'],
  idPrefixes: [`${src.prefix}:`],
  catalogs: [
    {
      type: 'tv',
      id: src.catalogId,
      name: src.name,
      extra: [
        { name: 'genre', options: src.genres, isRequired: false },
        { name: 'search', isRequired: false },
      ],
    },
  ],
});

// parts example: ['catalog','tv','sportea-events','genre=NBA']
async function handle(key, parts) {
  const src = SOURCES[key];
  if (!src) return null;
  const [resource, , id, extraStr] = parts;

  if (resource === 'manifest') return manifest(src);

  if (resource === 'catalog') {
    const extra = new URLSearchParams(extraStr || '');
    const genre = (extra.get('genre') || '').toLowerCase();
    const search = (extra.get('search') || '').toLowerCase();
    let events = await src.load();
    if (genre) events = events.filter((e) => String(e.sport).toLowerCase() === genre);
    if (search) events = events.filter((e) => e.name.toLowerCase().includes(search));
    events = [...events.filter((e) => e.live), ...events.filter((e) => !e.live)];
    return { metas: events.map(toMeta) };
  }

  if (resource === 'meta') {
    const ev = (await src.load()).find((e) => e.id === id);
    return ev ? { meta: toMeta(ev) } : { meta: null };
  }

  if (resource === 'stream') {
    const ev = (await src.load()).find((e) => e.id === id);
    if (!ev) return { streams: [] };
    return {
      streams: ev.links.map((l, i) => ({
        name: src.name,
        title: `Open in browser${l.lang ? ' (' + l.lang + ')' : ''}${ev.links.length > 1 ? ' #' + (i + 1) : ''}`,
        externalUrl: l.url,
      })),
    };
  }

  return null;
}

module.exports = { handle, SOURCES };
