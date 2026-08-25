<![CDATA[// Proxies ESPN's private fantasy football draft API. Browsers can't set custom
// Cookie headers on cross-origin requests, and even if they could, the cookies
// would be exposed client-side — so this fetches server-to-server using cookies
// held only in Vercel env vars (ESPN_S2, ESPN_SWID), never sent to the browser.
// See HANDOFF.md for the ESPN integration story.

const POS_MAP = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const espnS2 = process.env.ESPN_S2;
  const espnSwid = process.env.ESPN_SWID;
  if (!espnS2 || !espnSwid) {
    res.status(500).json({ error: 'ESPN_S2 or ESPN_SWID env var not set on this Vercel project' });
    return;
  }

  const leagueId = req.query.leagueId;
  const yearParam = req.query.year;
  if (!leagueId || !/^\d+$/.test(String(leagueId))) {
    res.status(400).json({ error: 'leagueId query param is required and must be numeric' });
    return;
  }
  const year = Number.isInteger(Number(yearParam)) && Number(yearParam) > 2000
    ? Number(yearParam)
    : (() => {
        const d = new Date();
        return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear();
      })();

  const cookieHeader = `espn_s2=${espnS2}; SWID=${espnSwid}`;
  const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${leagueId}`;

  try {
    // 1. Draft state + league settings (team count, pick order)
    const draftRes = await fetch(`${base}?view=mDraftDetail&view=mSettings`, {
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(12000),
    });
    if (!draftRes.ok) {
      res.status(draftRes.status).json({
        error: draftRes.status === 401
          ? 'ESPN rejected the cookies (401). They may have expired — re-grab espn_s2 and SWID from a logged-in browser session.'
          : `ESPN responded HTTP ${draftRes.status}`,
      });
      return;
    }
    const draftData = await draftRes.json();
    const detail = draftData.draftDetail || {};
    const allPicks = Array.isArray(detail.picks) ? detail.picks : [];
    const madePicks = allPicks.filter(p => p.playerId && p.playerId !== -1);

    // 2. Resolve player names only for players actually picked (targeted lookup,
    //    not the full multi-thousand-player pool, so this stays fast on every poll)
    let playerMap = {};
    if (madePicks.length) {
      const ids = [...new Set(madePicks.map(p => p.playerId))];
      const filter = JSON.stringify({ players: { filterIds: { value: ids } } });
      const playersRes = await fetch(
        `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/players?view=players_wl`,
        { headers: { Cookie: cookieHeader, 'x-fantasy-filter': filter }, signal: AbortSignal.timeout(12000) }
      );
      if (playersRes.ok) {
        const players = await playersRes.json();
        for (const pl of (Array.isArray(players) ? players : [])) {
          playerMap[pl.id] = { name: pl.fullName, pos: POS_MAP[pl.defaultPositionId] || null };
        }
      }
    }

    const picks = madePicks.map(p => ({
      overall: p.overallPickNumber,
      round: p.roundId,
      roundPick: p.roundPickNumber,
      teamId: p.teamId,
      playerId: p.playerId,
      name: playerMap[p.playerId] ? playerMap[p.playerId].name : null,
      pos: playerMap[p.playerId] ? playerMap[p.playerId].pos : null,
    }));

    res.status(200).json({
      drafted: !!detail.drafted,
      inProgress: !!detail.inProgress,
      teams: draftData.settings ? draftData.settings.size : null,
      totalPicks: allPicks.length,
      picks,
    });
  } catch (err) {
    res.status(502).json({ error: err && err.message ? err.message : 'Proxy fetch to ESPN failed' });
  }
}
]]>