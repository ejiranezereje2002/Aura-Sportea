const express = require('express');
const fetch = require('node-fetch');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');

const app = express();

const manifest = {
  id: 'org.aurasports.sportea',
  version: '1.0.0',
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

async function fetchSporteaData() {
  try {
    const res = await fetch('https://aurasports.xyz/api/sportea');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Sportea fetch error:', err);
    return [];
  }
}

// Helper to extract all matches/schedules from the sportea feed
async function getAllMatches() {
  const categories = await fetchSporteaData();
  const matches = [];

  categories.forEach((group, groupIdx) => {
    // Check if there is a league_schedule or schedule array inside the group
    const schedules = group.league_schedule || group.schedule || group.matches || [group];
    
    if (Array.isArray(schedules)) {
      schedules.forEach((item, itemIdx) => {
        matches.push({
          id: `${groupIdx}-${itemIdx}`,
          title: item.title || item.name || group.name || `Match ${itemIdx + 1}`,
          poster: item.poster || group.poster || 'https://via.placeholder.com/300x450?text=Sportea',
          time: item.time || item.date || 'Live Now',
          sch_iframe: item.sch_iframe || group.sch_iframe,
          tv_guide: item.tv_guide || group.tv_guide,
          stream_url: item.stream_url || group.stream_url
        });
      });
    }
  });

  return matches;
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
