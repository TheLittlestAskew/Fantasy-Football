// Proxies ESPN's public (undocumented but long-stable) site API for scoreboards
// and news. No auth needed — unlike api/draft.js / api/league.js, which hit the
// private fantasy API. Proxied anyway because ESPN doesn't reliably send CORS
// headers and we want one consistent failure surface. See HANDOFF.md.

// Whitelist: friendly key -> ESPN {sport}/{league} path segment. Anything not
// listed is rejected, so a typo'd league can't be used to hit arbitrary paths.
const LEAGUES = {
  nfl:      'football/nfl',
  ncaaf:    'football/college-football',
  mlb:      'baseball/mlb',
  nba:      'basketball/nba',
  nhl:      'hockey/nhl',
  ncaamb:   'basketball/mens-college-basketball',
  wnba:     'basketball/wnba',
  // International / event sports. Tennis and soccer scoreboards exist but are
  // shaped differently per-league; the frontend renders them defensively.
  tennis:   'tennis/atp',
  tennisw:  'tennis/wta',
  wcup:     'soccer/fifa.world',
  wcupq:    'soccer/fifa.worldq.concacaf',
  ucl:      'soccer/uefa.champions',
  mls:      'soccer/usa.1',
  epl:      'soccer/eng.1',
  olympics: 'olympics/summer',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Scores change fast but not per-second; a short edge cache keeps us well
  // clear of any rate limiting if the page is left open.
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const key = String(req.query.league || '').toLowerCase();
  const kind = String(req.query.kind || 'scoreboard').toLowerCase();
  const dates = req.query.dates; // optional YYYYMMDD, ESPN's own param

  if (!Object.prototype.hasOwnProperty.call(LEAGUES, key)) {
    res.status(400).json({
      error: 'Unknown league key: ' + (key || '(none)'),
      supported: Object.keys(LEAGUES),
    });
    return;
  }
  if (kind !== 'scoreboard' && kind !== 'news') {
    res.status(400).json({ error: "kind must be 'scoreboard' or 'news'" });
    return;
  }

  let url = `https://site.api.espn.com/apis/site/v2/sports/${LEAGUES[key]}/${kind}`;
  if (kind === 'scoreboard' && /^\d{8}$/.test(String(dates || ''))) {
    url += `?dates=${dates}`;
  }

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: `ESPN responded HTTP ${upstream.status} for ${key}/${kind}`,
        bodyPreview: text.slice(0, 300),
      });
      return;
    }
    let json;
    try { json = JSON.parse(text); }
    catch {
      res.status(502).json({
        error: 'ESPN returned non-JSON',
        bodyPreview: text.slice(0, 300),
      });
      return;
    }
    res.status(200).json(json);
  } catch (err) {
    res.status(502).json({ error: err && err.message ? err.message : 'Proxy fetch to ESPN failed' });
  }
}
