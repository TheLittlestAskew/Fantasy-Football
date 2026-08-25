// Returns everything a start/sit or waiver-wire decision needs, in ONE call:
// your roster with weekly projections, and the top available free agents with
// projections. Built for headless use (Claude Code skill) as well as the web UI.
//
// Auth + host notes are the same as api/draft.js / api/league.js: private league,
// cookies from Vercel env vars only, host is lm-api-reads.fantasy.espn.com.
// See HANDOFF.md.

const POS_MAP = {
  1:'QB', 2:'RB', 3:'WR', 4:'TE', 5:'K', 16:'DST',
  9:'DL', 10:'LB', 11:'DL', 12:'DB', 13:'DB', 14:'DB',
};
const SLOT_MAP = {
  0:'QB',1:'TQB',2:'RB',3:'RB/WR',4:'WR',5:'WR/TE',6:'TE',7:'OP',8:'DT',9:'DE',
  10:'LB',11:'DL',12:'CB',13:'S',14:'DB',15:'DP',16:'D/ST',17:'K',18:'P',19:'HC',
  20:'BE',21:'IR',23:'FLEX',
};
const BENCH = new Set([20, 21]);

// ESPN stat blocks: statSourceId 0 = actual, 1 = projected.
function projectedFor(player, week) {
  const stats = (player && player.stats) || [];
  const hit = stats.find(s =>
    s.statSourceId === 1 && s.scoringPeriodId === week && s.statSplitTypeId === 1);
  if (hit && typeof hit.appliedTotal === 'number') return Math.round(hit.appliedTotal * 10) / 10;
  const any = stats.find(s => s.statSourceId === 1 && s.scoringPeriodId === week);
  return any && typeof any.appliedTotal === 'number' ? Math.round(any.appliedTotal * 10) / 10 : null;
}

function shapePlayer(pl, week, extra) {
  return Object.assign({
    id: pl.id,
    name: pl.fullName,
    pos: POS_MAP[pl.defaultPositionId] || null,
    proTeamId: pl.proTeamId,
    injuryStatus: pl.injuryStatus || null,
    injured: !!pl.injured,
    projected: projectedFor(pl, week),
    percentOwned: pl.ownership && typeof pl.ownership.percentOwned === 'number'
      ? Math.round(pl.ownership.percentOwned * 10) / 10 : null,
  }, extra || {});
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

  const leagueId = /^\d+$/.test(String(req.query.leagueId)) ? req.query.leagueId : '1573934181';
  const teamId = Number.isInteger(Number(req.query.teamId)) ? Number(req.query.teamId) : 16;
  const yearQ = Number(req.query.year);
  const year = Number.isInteger(yearQ) && yearQ > 2000
    ? yearQ
    : (() => { const d = new Date(); return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear(); })();
  const faLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);

  const cookie = `espn_s2=${espnS2}; SWID=${espnSwid}`;
  const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${leagueId}`;

  try {
    // 1. League: roster + settings + current week
    const lr = await fetch(`${base}?view=mRoster&view=mMatchup&view=mTeam&view=mSettings`, {
      headers: { Cookie: cookie, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!lr.ok) {
      res.status(lr.status).json({
        error: lr.status === 401
          ? 'ESPN rejected the cookies (401) — they may have expired. Re-grab espn_s2 and SWID from a logged-in browser.'
          : `ESPN responded HTTP ${lr.status}`,
      });
      return;
    }
    const league = await lr.json();
    const week = (league.status && league.status.currentMatchupPeriod) || league.scoringPeriodId || 1;

    // Rosters are embedded in schedule entries, not teams[] — ESPN quirk.
    let entries = null;
    let opponentId = null;
    for (const m of (league.schedule || [])) {
      if (m.matchupPeriodId !== week) continue;
      for (const side of ['home', 'away']) {
        const s = m[side];
        if (!s || s.teamId !== teamId) continue;
        const other = m[side === 'home' ? 'away' : 'home'];
        if (other && Number.isInteger(other.teamId)) opponentId = other.teamId;
        const e = s.rosterForCurrentScoringPeriod && s.rosterForCurrentScoringPeriod.entries;
        if (e && e.length) entries = e;
      }
    }

    const roster = (entries || []).map(e => {
      const pl = e.playerPoolEntry && e.playerPoolEntry.player;
      if (!pl) return null;
      return shapePlayer(pl, week, {
        slot: SLOT_MAP[e.lineupSlotId] || String(e.lineupSlotId),
        slotId: e.lineupSlotId,
        starting: !BENCH.has(e.lineupSlotId),
        eligibleSlots: (pl.eligibleSlots || []).map(s => SLOT_MAP[s]).filter(Boolean),
      });
    }).filter(Boolean);

    // 2. Free agents, sorted by percent owned, with projections
    const filter = {
      players: {
        filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
        filterSlotIds: { value: [0,2,3,4,5,6,16,17,23,15,10,11,12,13,14] },
        sortPercOwned: { sortPriority: 1, sortAsc: false },
        limit: faLimit,
      },
    };
    let freeAgents = [];
    let faError = null;
    const fr = await fetch(`${base}?view=kona_player_info&scoringPeriodId=${week}`, {
      headers: { Cookie: cookie, Accept: 'application/json', 'x-fantasy-filter': JSON.stringify(filter) },
      signal: AbortSignal.timeout(15000),
    });
    if (fr.ok) {
      const fj = await fr.json();
      freeAgents = ((fj && fj.players) || [])
        .map(p => p.player ? shapePlayer(p.player, week, {}) : null)
        .filter(Boolean)
        .sort((a, b) => (b.projected ?? -1) - (a.projected ?? -1));
    } else {
      faError = `free-agent lookup failed: HTTP ${fr.status}`;
    }

    const teams = (league.teams || []).map(t => ({
      id: t.id, name: t.name, abbrev: t.abbrev,
      record: t.record && t.record.overall ? {
        wins: t.record.overall.wins, losses: t.record.overall.losses,
        ties: t.record.overall.ties, pointsFor: t.record.overall.pointsFor,
      } : null,
    }));

    const starters = roster.filter(p => p.starting);
    const bench = roster.filter(p => !p.starting);
    const projStarters = starters.reduce((n, p) => n + (p.projected || 0), 0);

    res.status(200).json({
      leagueId, year, week, teamId, opponentId,
      leagueName: league.settings && league.settings.name,
      drafted: !!(league.draftDetail && league.draftDetail.drafted),
      rosterCount: roster.length,
      projectedStarterTotal: Math.round(projStarters * 10) / 10,
      starters, bench,
      freeAgents,
      faError: faError || undefined,
      teams,
      note: roster.length ? undefined
        : 'No roster returned. Before the draft this is expected — ESPN publishes lineups afterward.',
    });
  } catch (err) {
    res.status(502).json({ error: err && err.message ? err.message : 'Proxy fetch to ESPN failed' });
  }
}
