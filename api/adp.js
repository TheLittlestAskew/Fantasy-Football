export default async function handler(req, res) {
  // Server-to-server fetch has no CORS restriction — only browser-to-server does.
  // This function exists solely to get around Fantasy Football Calculator not
  // sending an Access-Control-Allow-Origin header on their public API.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const teamsParam = req.query.teams;
  const yearParam = req.query.year;

  const teams = Number.isInteger(Number(teamsParam)) && Number(teamsParam) > 0
    ? Number(teamsParam)
    : 14;

  const year = Number.isInteger(Number(yearParam)) && Number(yearParam) > 2000
    ? Number(yearParam)
    : (() => {
        const d = new Date();
        return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear();
      })();

  const upstreamUrl = `https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=${teams}&year=${year}`;

  try {
    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Fantasy Football Calculator responded HTTP ${upstream.status}` });
      return;
    }
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err && err.message ? err.message : 'Proxy fetch to Fantasy Football Calculator failed' });
  }
}
