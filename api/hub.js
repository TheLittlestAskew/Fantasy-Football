// In-season hub for the System Horizon War Room: this week's matchup (both
// lineups, live and projected), standings with recent form, the week's top
// scorers, healthy free agents, and recent
// league transactions, in ONE small response.
//
// Why a new endpoint instead of api/league.js: league.js returns ESPN's raw
// JSON, about 6.7MB for this 20-team league, far too heavy to poll from a
// browser. This does the heavy fetch server-side and returns only what the
// War Room renders. Auth and host are the same as api/draft.js: private
// league, cookies from Vercel env vars only, never sent to the browser.
//
// Each section reports its own error instead of failing the whole response,
// so one broken ESPN view never blanks the other three panels.

import {
  currentWeek, shapeMatchup, shapeStandings, shapeLeaders, shapeFreeAgents,
  shapeTransactions, transactionPlayerIds, teamNames,
} from './_hub-shape.js';

const FA_SLOTS = [0, 2, 3, 4, 5, 6, 16, 17, 23, 15, 10, 11, 12, 13, 14];

async function espnJson(url, cookie, extraHeaders) {
  const response = await fetch(url, {
    headers: { Cookie: cookie, Accept: 'application/json', ...(extraHeaders || {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const err = new Error(response.status === 401
      ? 'ESPN rejected the cookies (401). They may have expired: re-grab espn_s2 and SWID from a logged-in browser.'
      : `ESPN responded HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const espnS2 = process.env.ESPN_S2;
  const espnSwid = process.env.ESPN_SWID;
  if (!espnS2 || !espnSwid) {
    res.status(500).json({ error: 'ESPN_S2 or ESPN_SWID env var not set on this Vercel project' });
    return;
  }

  const leagueId = /^\d+$/.test(String(req.query.leagueId)) ? String(req.query.leagueId) : null;
  const teamId = Number(req.query.teamId);
  if (!leagueId || !Number.isInteger(teamId) || teamId < 1) {
    res.status(400).json({ error: 'leagueId (numeric) and teamId (positive integer) query params are required' });
    return;
  }
  const yearQ = Number(req.query.year);
  const year = Number.isInteger(yearQ) && yearQ > 2000
    ? yearQ
    : (() => { const d = new Date(); return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear(); })();

  const cookie = `espn_s2=${espnS2}; SWID=${espnSwid}`;
  const seasonBase = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}`;
  const base = `${seasonBase}/segments/0/leagues/${leagueId}`;

  // mMatchupScore/mStandings carry the live pointsByScoringPeriod and projected
  // totals; without them a week in progress reads 0 vs 0 (seen 2026-10-11).
  let league;
  try {
    league = await espnJson(`${base}?view=mTeam&view=mRoster&view=mMatchup&view=mMatchupScore&view=mStandings&view=mSettings`, cookie);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || 'Proxy fetch to ESPN failed' });
    return;
  }

  let week;
  try {
    week = currentWeek(league);
  } catch (err) {
    res.status(502).json({ error: err.message });
    return;
  }

  const names = teamNames(league);
  const errors = {};
  const out = {
    leagueId, year, week, teamId,
    leagueName: (league.settings && league.settings.name) || null,
    fetchedAt: new Date().toISOString(),
    matchup: null, standings: [], leaders: [], freeAgents: [], transactions: [],
  };

  try { out.matchup = shapeMatchup(league, teamId, week); } catch (err) { errors.matchup = err.message; }
  try { out.standings = shapeStandings(league); } catch (err) { errors.standings = err.message; }
  try { out.leaders = shapeLeaders(league, week); } catch (err) { errors.leaders = err.message; }

  const faFilter = {
    players: {
      filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
      filterSlotIds: { value: FA_SLOTS },
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      limit: 60,
    },
  };

  // This week and last week, so Monday morning still shows the weekend's moves.
  const txWeeks = [...new Set([week, Math.max(1, week - 1)])];
  const [faResult, ...txResults] = await Promise.allSettled([
    espnJson(`${base}?view=kona_player_info&scoringPeriodId=${week}`, cookie, { 'x-fantasy-filter': JSON.stringify(faFilter) }),
    ...txWeeks.map((w) => espnJson(`${base}?view=mTransactions2&scoringPeriodId=${w}`, cookie)),
  ]);

  if (faResult.status === 'fulfilled') {
    try { out.freeAgents = shapeFreeAgents(faResult.value && faResult.value.players, week); } catch (err) { errors.freeAgents = err.message; }
  } else {
    errors.freeAgents = faResult.reason && faResult.reason.message;
  }

  const txFailures = txResults.filter((r) => r.status === 'rejected');
  if (txFailures.length === txResults.length) {
    errors.transactions = txFailures[0].reason && txFailures[0].reason.message;
  } else {
    const seen = new Set();
    const transactions = txResults
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => (r.value && r.value.transactions) || [])
      .filter((t) => t && !seen.has(t.id) && seen.add(t.id));
    try {
      // Rostered players are already named in the league JSON; only look up the rest.
      const playerNames = {};
      for (const t of league.teams || []) for (const e of (t.roster && t.roster.entries) || []) {
        const p = e.playerPoolEntry && e.playerPoolEntry.player;
        if (p) playerNames[p.id] = p.fullName;
      }
      const missing = transactionPlayerIds(transactions).filter((id) => !playerNames[id]);
      if (missing.length) {
        const filter = JSON.stringify({ players: { filterIds: { value: missing } } });
        const players = await espnJson(`${seasonBase}/players?view=players_wl`, cookie, { 'x-fantasy-filter': filter });
        for (const p of Array.isArray(players) ? players : []) playerNames[p.id] = p.fullName;
      }
      out.transactions = shapeTransactions(transactions, playerNames, names);
      if (txFailures.length) errors.transactions = `partial: ${txFailures[0].reason && txFailures[0].reason.message}`;
    } catch (err) {
      errors.transactions = err.message;
    }
  }

  if (Object.keys(errors).length) out.errors = errors;
  // Vercel's edge holds a copy for 60s, so several open tabs cost ESPN one fetch.
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  res.status(200).json(out);
}
