const express = require('express');
const fetch = require('node-fetch');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');

const app = express();

const manifest = {
  id: 'org.aurasports.live',
  version: '1.0.0',
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

// Catalog Handler
builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== 'tv' || id !== 'aurasports_catalog') {
    return { metas: [] };
  }

  try {
    const response = await fetch('https://aurasports.xyz/api/schedule');
    const data = await response.json();

    const metas = [];

    if (Array.isArray(data)) {
      data.forEach((category) => {
        const matches = category.matches || category.games || [];
        matches.forEach((match, index) => {
          const matchId = `aura:${match.id || index}`;
          metas.push({
            id: matchId,
            type: 'tv',
            name: match.title || `${match.homeTeam} vs ${match.awayTeam}`,
            poster: match.poster || category.icon || 'https://via.placeholder.com/300x450?text=Sports',
            description: `Scheduled: ${match.time || 'Live Now'}`
          });
        });
      });
    }

    return { metas };
  } catch (error) {
    console.error('Catalog fetch error:', error);
    return { metas: [] };
  }
});

// Meta Handler
builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('aura:')) {
    return { meta: null };
  }

  try {
    const response = await fetch('https://aurasports.xyz/api/schedule');
    const data = await response.json();

    let matchDetail = null;

    if (Array.isArray(data)) {
      for (const category of data) {
        const matches = category.matches || category.games || [];
        const found = matches.find((m, index) => `aura:${m.id || index}` === id);
        if (found) {
          matchDetail = found;
          break;
        }
      }
    }

    if (!matchDetail) {
      return { meta: null };
    }

    return {
      meta: {
        id,
        type: 'tv',
        name: matchDetail.title || `${matchDetail.homeTeam} vs ${matchDetail.awayTeam}`,
        poster: matchDetail.poster || 'https://via.placeholder.com/300x450?text=Sports',
        description: `Scheduled: ${matchDetail.time || 'Live Now'}`
      }
    };
  } catch (error) {
    console.error('Meta fetch error:', error);
    return { meta: null };
  }
});

// Stream Handler
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'tv' || !id.startsWith('aura:')) {
    return { streams: [] };
  }

  try {
    const response = await fetch('https://aurasports.xyz/api/sportea');
    const data = await response.json();

    const streams = [];

    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (item.sch_iframe) {
          streams.push({
            title: item.name || 'Live Stream (Iframe/Web)',
            externalUrl: item.sch_iframe
          });
        }
        if (item.stream_url) {
          streams.push({
            title: item.name || 'Direct Stream',
            url: item.stream_url
          });
        }
      });
    }

    return { streams };
  } catch (error) {
    console.error('Stream fetch error:', error);
    return { streams: [] };
  }
});

const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

app.use('/', addonRouter);

module.exports = app;
