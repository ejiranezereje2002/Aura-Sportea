const express = require('express');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');

const app = express();

const manifest = {
  id: 'org.aurasports.sportea',
  version: '1.0.3',
  name: 'Aura Sportea Live',
  description: 'Live sports streams and schedules from Sportea API',
  resources: ['catalog', 'meta', 'stream'],
  types: ['tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'sportea_catalog',
      name: 'Sportea Live'
    }
  ],
  idPrefixes: ['sportea:']
};

const builder = new addonBuilder(manifest);

async function fetchSporteaRaw() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://aurasports.xyz/',
    'Origin': 'https://aurasports.xyz'
  };

  const res = await fetch('https://aurasports.xyz/api/sportea', { headers });
  if (!res.ok) {
    throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
  }
  return await res.json();
}

async function getAllMatches() {
  try {
    const data = await fetchSporteaRaw();
    let matches = [];

    const parseItem = (item, parentName = '') => {
      if (!item || typeof item !== 'object') return;

      const subList = item.league_schedule || item.schedule || item.matches || item.games || item.events;
      if (Array.isArray(subList)) {
        subList.forEach(sub => parseItem(sub, item.name || item.title || parentName));
        return;
      }

      const title = item.title || item.name || item.match || item.event || (parentName ? `${parentName} - Stream` : null);
      const streamUrl = item.stream_url || item.url || item.stream || item.link;
      const iframeUrl = item.sch_iframe || item.iframe || item.embed || item.embedUrl;
      const tvGuide = item.tv_guide || item.guide;

      if (title || streamUrl || iframeUrl) {
        matches.push({
          id: String(matches.length + 1),
          title: title || `Match ${matches.length + 1}`,
          poster: item.poster || item.image || item.icon || 'https://via.placeholder.com/300x450?text=Sportea',
          time: item.time || item.date || item.status || 'Live Now',
          stream_url: streamUrl,
          sch_iframe: iframeUrl,
          tv_guide: tvGuide
        });
      }
    };

    if (Array.isArray(data)) {
      data.forEach(group => parseItem(group));
    } else if (data && typeof data === 'object') {
      Object.values(data).forEach(val => parseItem(val));
    }

    if (matches.length === 0) {
      matches.push({
        id: 'fallback-1',
        title: 'Sportea Connected (No live streams available right now)',
        poster: 'https://via.placeholder.com/300x450?text=No+Streams',
        time: 'Now',
        sch_iframe: 'https://aurasports.xyz/'
      });
    }

    return matches;
  } catch (err) {
    console.error('Sportea Fetch Error Details:', err.message);
    return [{
      id: 'error-1',
      title: `Error: ${err.message}`,
      poster: 'https://via.placeholder.com/300x450?text=Error',
      time: 'Now',
      sch_iframe: 'https://aurasports.xyz/'
    }];
  }
}

builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== 'tv' || id !== 'sportea_catalog') {
    return { metas: [] };
  }

  const matches = await getAllMatches();
  const metas = matches.map((match) => ({
    id: `sportea:${match.id}`,
    type: 'tv',
    name: match.title,
    poster: match.poster,
    description: `Time: ${match.time}`
  }));

  return { metas };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('sportea:')) {
    return { meta: null };
  }

  const matchId = id.replace('sportea:', '');
  const matches = await getAllMatches();
  const match = matches.find((m) => m.id === matchId);

  if (!match) {
    return { meta: null };
  }

  return {
    meta: {
      id,
      type: 'tv',
      name: match.title,
      poster: match.poster,
      description: `Time: ${match.time}`
    }
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('sportea:')) {
    return { streams: [] };
  }

  const matchId = id.replace('sportea:', '');
  const matches = await getAllMatches();
  const match = matches.find((m) => m.id === matchId);

  if (!match) {
    return { streams: [] };
  }

  const streams = [];

  if (match.stream_url) {
    streams.push({
      title: `${match.title} - Direct Stream`,
      url: match.stream_url
    });
  }

  if (match.sch_iframe) {
    streams.push({
      title: `${match.title} - Web Iframe Player`,
      externalUrl: match.sch_iframe
    });
  }

  if (match.tv_guide) {
    streams.push({
      title: `${match.title} - TV Guide`,
      externalUrl: match.tv_guide
    });
  }

  return { streams };
});

const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

app.use('/', addonRouter);

app.get('/', (req, res) => {
  res.redirect('/manifest.json');
});

module.exports = app;
