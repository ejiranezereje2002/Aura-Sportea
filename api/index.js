const express = require('express');
const fetch = require('node-fetch');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');

const app = express();

const manifest = {
  id: 'org.aurasports.live',
  version: '1.0.1',
  name: 'Aura Sports Live',
  description: 'Live sports schedules and stream links from AuraSports',
  resources: ['catalog', 'meta', 'stream'],
  types: ['tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'aurasports_catalog',
      name: 'Aura Sports'
    }
  ],
  idPrefixes: ['aura:']
};

const builder = new addonBuilder(manifest);

// Helper to fetch and normalize items from schedule or sportea
async function fetchAllMatches() {
  try {
    const res = await fetch('https://aurasports.xyz/api/schedule');
    const data = await res.json();
    
    let matchesList = [];
    
    // Handle different possible JSON structures
    if (Array.isArray(data)) {
      data.forEach(cat => {
        const items = cat.matches || cat.games || cat.events || cat.league_schedule || (Array.isArray(cat) ? cat : []);
        if (Array.isArray(items) && items.length > 0) {
          matchesList.push(...items);
        } else if (cat.id || cat.title || cat.name || cat.homeTeam) {
          matchesList.push(cat);
        }
      });
    } else if (data && typeof data === 'object') {
      Object.values(data).forEach(val => {
        if (Array.isArray(val)) {
          val.forEach(sub => {
            if (sub && typeof sub === 'object') {
              const subItems = sub.matches || sub.games || sub.events || [sub];
              if (Array.isArray(subItems)) matchesList.push(...subItems);
            }
          });
        }
      });
    }
    
    // If schedule didn't yield matches, fetch sportea endpoint as backup/supplement
    if (matchesList.length === 0) {
      const res2 = await fetch('https://aurasports.xyz/api/sportea');
      const data2 = await res2.json();
      if (Array.isArray(data2)) {
        data2.forEach(item => {
          const scheduleItems = item.league_schedule || item.matches || [item];
          if (Array.isArray(scheduleItems)) {
            matchesList.push(...scheduleItems);
          } else {
            matchesList.push(item);
          }
        });
      }
    }

    return matchesList;
  } catch (err) {
    console.error('Error fetching matches:', err);
    return [];
  }
}

builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== 'tv' || id !== 'aurasports_catalog') {
    return { metas: [] };
  }

  const matches = await fetchAllMatches();
  const metas = matches.map((match, index) => {
    const matchId = `aura:${match.id || index}`;
    const name = match.title || match.name || (match.homeTeam && match.awayTeam ? `${match.homeTeam} vs ${match.awayTeam}` : `Match ${index + 1}`);
    const poster = match.poster || match.icon || match.image || 'https://via.placeholder.com/300x450?text=Sports';
    const description = `Time: ${match.time || match.date || match.scheduledTime || 'Live Now'}`;

    return {
      id: matchId,
      type: 'tv',
      name,
      poster,
      description
    };
  });

  return { metas };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('aura:')) {
    return { meta: null };
  }

  const matches = await fetchAllMatches();
  const match = matches.find((m, index) => `aura:${m.id || index}` === id);

  if (!match) {
    return { meta: null };
  }

  const name = match.title || match.name || (match.homeTeam && match.awayTeam ? `${match.homeTeam} vs ${match.awayTeam}` : 'Sports Match');
  const poster = match.poster || match.icon || match.image || 'https://via.placeholder.com/300x450?text=Sports';
  const description = `Time: ${match.time || match.date || match.scheduledTime || 'Live Now'}`;

  return {
    meta: {
      id,
      type: 'tv',
      name,
      poster,
      description
    }
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('aura:')) {
    return { streams: [] };
  }

  const matches = await fetchAllMatches();
  const match = matches.find((m, index) => `aura:${m.id || index}` === id);

  if (!match) {
    return { streams: [] };
  }

  const streams = [];
  const streamUrl = match.stream_url || match.url || match.watchUrl;
  const iframeUrl = match.sch_iframe || match.iframeUrl || match.embedCode;

  if (streamUrl) {
    streams.push({
      title: match.title || match.name || 'Direct Stream',
      url: streamUrl
    });
  }

  if (iframeUrl) {
    streams.push({
      title: `${match.title || match.name || 'Stream'} (Web/Iframe)`,
      externalUrl: iframeUrl
    });
  }

  if (streams.length === 0) {
    try {
      const res = await fetch('https://aurasports.xyz/api/sportea');
      const data = await res.json();
      if (Array.isArray(data)) {
        data.forEach(item => {
          if (item.stream_url) streams.push({ title: item.name || 'Stream', url: item.stream_url });
          if (item.sch_iframe) streams.push({ title: `${item.name || 'Stream'} (Web)`, externalUrl: item.sch_iframe });
        });
      }
    } catch (e) {
      console.error('Sportea fallback error:', e);
    }
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
