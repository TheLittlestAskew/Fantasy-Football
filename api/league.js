export default async function handler(req, res) {
  // Same CORS-workaround pattern as api/adp.js: ESPN's fantasy API doesn't
  // send Access-Control-Allow-Origin, so a direct browser fetch is blocked.
  // This proxies server-to-server and re-adds the header.
  //
  // Public-league only for now: no espn_s2/SWID cookie auth. If the league
  // is ever switched to private, those cookies must be added as Vercel
  // environment variables (Settings -> Environment Variables), NEVER hardcoded
  // here or passed through the client. This function would then read
  // process.env.ESPN_S2 / process.env.ESPN_SWID and forward them as a
  // Cookie header on the upstream fetch below.
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
    `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}` +
    '?' + views.map(v => `view=${v}`).join('&');

  try {
    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) {
      const bodyText = await upstream.text().catch(() => '');
      res.status(upstream.status).json({
        error: `ESPN responded HTTP ${upstream.status}`,
        hint: upstream.status === 401 || upstream.status === 403
          ? 'League may be private. Public-league mode only is supported right now — see comment at top of this file.'
          : undefined,
        body: bodyText.slice(0, 500) || undefined,
      });
      return;
    }
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err && err.message ? err.message : 'Proxy fetch to ESPN failed' });
  }
}
