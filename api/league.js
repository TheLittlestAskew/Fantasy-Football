export default async function handler(req, res) {
  // Same CORS-workaround pattern as api/adp.js: ESPN's fantasy API doesn't
  // send Access-Control-Allow-Origin, so a direct browser fetch is blocked.
  // This proxies server-to-server and re-adds the header.
  //
  // The league returned HTTP 401 AUTH_LEAGUE_NOT_VISIBLE without cookies, so
  // despite league settings, ESPN requires authenticated access here. This
  // function now forwards espn_s2/SWID as a Cookie header IF they're present
  // as Vercel environment variables (Settings -> Environment Variables on the
  // fantasy-football project). They are never hardcoded here, never accepted
  // as a query param, and never logged. If they're not set, the proxy still
  // attempts the request unauthenticated (harmless — ESPN just 401s again).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const leagueIdParam = req.query.leagueId;
  const seasonParam = req.query.season;

  const leagueId = /^\d+$/.test(String(leagueIdParam)) ? leagueIdParam : '1573934181';
  const season = Number.isInteger(Number(seasonParam)) && Number(seasonParam) > 2000
    ? Number(seasonParam)
    : 2026;

  // mTeam: team names/records · mRoster: full rosters · mMatchup: weekly matchups
  // mStandings: standings/rank · mSettings: league name, scoring, roster slots
  const views = ['mTeam', 'mRoster', 'mMatchup', 'mStandings', 'mSettings'];
  const upstreamUrl =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}` +
    '?' + views.map(v => `view=${v}`).join('&');

  const fetchHeaders = { 'Accept': 'application/json' };
  const espnS2 = process.env.ESPN_S2;
  const espnSwid = process.env.ESPN_SWID;
  const hasAuth = Boolean(espnS2 && espnSwid);
  if (hasAuth) {
    // SWID must keep its curly braces exactly as ESPN issues it.
    fetchHeaders['Cookie'] = `espn_s2=${espnS2}; SWID=${espnSwid}`;
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(12000),
      headers: fetchHeaders,
    });

    const contentType = upstream.headers.get('content-type') || '';
    const rawText = await upstream.text();

    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: `ESPN responded HTTP ${upstream.status}`,
        authConfigured: hasAuth,
        hint: (upstream.status === 401 || upstream.status === 403)
          ? (hasAuth
              ? 'Cookies are set but ESPN still rejected the request — they may be expired or copied incorrectly. Re-grab espn_s2/SWID from a logged-in browser session.'
              : 'League requires authenticated access. Set ESPN_S2 and ESPN_SWID as environment variables on this Vercel project, then redeploy.')
          : undefined,
        body: rawText.slice(0, 500) || undefined,
      });
      return;
    }

    if (!contentType.includes('application/json')) {
      res.status(502).json({
        error: 'ESPN returned a non-JSON response',
        contentType,
        bodyPreview: rawText.slice(0, 800),
      });
      return;
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      res.status(502).json({
        error: 'ESPN response had a JSON content-type but failed to parse',
        bodyPreview: rawText.slice(0, 800),
      });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err && err.message ? err.message : 'Proxy fetch to ESPN failed' });
  }
}
