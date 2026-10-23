const { handle } = require('../lib/addons');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { addon, path = '' } = req.query;
  const safe = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  const parts = String(Array.isArray(path) ? path.join('/') : path)
    .replace(/\.json$/, '')
    .split('/')
    .filter(Boolean)
    .map(safe);

  try {
    const out = await handle(addon, parts);
    if (!out) return res.status(404).json({ error: 'Not found' });
    res.status(200).json(out);
  } catch (err) {
    console.error(err);
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: String(err.message || err) });
  }
};
