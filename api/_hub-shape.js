// Pure shaping for api/hub.js: raw ESPN league JSON in, the small in-season
// payload the System Horizon War Room renders out. No network here, so every
// function is covered by api/_hub.test.mjs. The leading underscore keeps
// Vercel from deploying this file as a route.

// ESPN defaultPositionId. 11 is LB (Oluokun, Ernest Jones), not DL.
export const POS_MAP = {
  1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 7: 'P',
  9: 'DT', 10: 'DE', 11: 'LB', 12: 'CB', 13: 'S', 14: 'HC', 16: 'D/ST',
};

export const SLOT_MAP = {
  0: 'QB', 1: 'TQB', 2: 'RB', 3: 'RB/WR', 4: 'WR', 5: 'WR/TE', 6: 'TE', 7: 'OP',
  8: 'DT', 9: 'DE', 10: 'LB', 11: 'DL', 12: 'CB', 13: 'S', 14: 'DB', 15: 'DP',
  16: 'D/ST', 17: 'K', 18: 'P', 19: 'HC', 20: 'BE', 21: 'IR', 23: 'FLEX',
};

// Lineup display order: offense, flex, defense, specialists, then bench and IR.
const SLOT_ORDER = [0, 1, 2, 3, 4, 5, 6, 23, 7, 15, 11, 8, 9, 10, 14, 12, 13, 17, 18, 16, 19, 20, 21];
const BENCH_SLOTS = new Set([20, 21]);

// ESPN proTeamId -> abbreviation.
export const PRO_TEAMS = {
  0: 'FA', 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
  9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
  17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
  25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

const round1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

export function currentWeek(league) {
  const week = league && league.status && league.status.currentMatchupPeriod;
  if (!Number.isInteger(week) || week < 1) throw new Error('ESPN league JSON has no status.currentMatchupPeriod');
  return week;
}

// ESPN stat blocks: statSourceId 0 = actual, 1 = projected; statSplitTypeId 1 = one scoring period.
export function weekPoints(player, week, source) {
  const stats = (player && Array.isArray(player.stats)) ? player.stats : [];
  const hit = stats.find((s) => s.statSourceId === source && s.statSplitTypeId === 1 && s.scoringPeriodId === week);
  return hit ? round1(hit.appliedTotal) : null;
}

export function shapePlayer(player, week) {
  if (!player || typeof player !== 'object') throw new Error('shapePlayer: player is missing');
  return {
    id: player.id,
    name: player.fullName || `Player ${player.id}`,
    pos: POS_MAP[player.defaultPositionId] || null,
    proTeam: PRO_TEAMS[player.proTeamId] || null,
    injuryStatus: player.injuryStatus && player.injuryStatus !== 'ACTIVE' ? player.injuryStatus : null,
    points: weekPoints(player, week, 0),
    projected: weekPoints(player, week, 1),
    percentOwned: player.ownership && typeof player.ownership.percentOwned === 'number'
      ? round1(player.ownership.percentOwned) : null,
  };
}

export function shapeLineup(entries, week) {
  if (!Array.isArray(entries)) return [];
  const rank = (slotId) => { const i = SLOT_ORDER.indexOf(slotId); return i === -1 ? SLOT_ORDER.length : i; };
  return entries
    .filter((e) => e && e.playerPoolEntry && e.playerPoolEntry.player)
    .map((e) => ({
      slot: SLOT_MAP[e.lineupSlotId] || String(e.lineupSlotId),
      slotId: e.lineupSlotId,
      starting: !BENCH_SLOTS.has(e.lineupSlotId),
      ...shapePlayer(e.playerPoolEntry.player, week),
    }))
    .sort((a, b) => rank(a.slotId) - rank(b.slotId));
}

function teamName(team) {
  if (!team) return null;
  // ESPN keeps owners' stray whitespace ("Hits Different ").
  if (team.name && team.name.trim()) return team.name.trim();
  const joined = [team.location, team.nickname].filter(Boolean).join(' ').trim();
  return joined || `Team ${team.id}`;
}

export function teamNames(league) {
  const names = {};
  for (const t of (league && league.teams) || []) names[t.id] = teamName(t);
  return names;
}

function side(league, entry, week) {
  if (!entry || !Number.isInteger(entry.teamId)) return null;
  const team = (league.teams || []).find((t) => t.id === entry.teamId);
  const byPeriod = entry.pointsByScoringPeriod && entry.pointsByScoringPeriod[String(week)];
  const lineup = shapeLineup(team && team.roster && team.roster.entries, week);
  return {
    teamId: entry.teamId,
    name: teamName(team),
    score: round1(typeof byPeriod === 'number' ? byPeriod : entry.totalPoints),
    projected: round1(entry.totalProjectedPointsLive ?? entry.totalProjectedPoints),
    lineup,
  };
}

// The matchup containing teamId for the current week, me first. null on a bye
// or when ESPN has not published the week yet.
export function shapeMatchup(league, teamId, week) {
  const game = (league.schedule || []).find((m) =>
    m.matchupPeriodId === week && ((m.home && m.home.teamId === teamId) || (m.away && m.away.teamId === teamId)));
  if (!game) return null;
  const mine = game.home && game.home.teamId === teamId ? game.home : game.away;
  const theirs = mine === game.home ? game.away : game.home;
  return { week, winner: game.winner || null, me: side(league, mine, week), opponent: side(league, theirs, week) };
}

export function shapeStandings(league) {
  const divisions = {};
  const div = league.settings && league.settings.scheduleSettings && league.settings.scheduleSettings.divisions;
  for (const d of div || []) divisions[d.id] = String(d.name || '').trim() || `Division ${d.id}`;
  return (league.teams || [])
    .map((t) => {
      const o = (t.record && t.record.overall) || {};
      return {
        teamId: t.id,
        name: teamName(t),
        division: divisions[t.divisionId] || null,
        seed: Number.isInteger(t.playoffSeed) && t.playoffSeed > 0 ? t.playoffSeed : null,
        wins: o.wins ?? 0,
        losses: o.losses ?? 0,
        ties: o.ties ?? 0,
        pointsFor: round1(o.pointsFor ?? 0),
        pointsAgainst: round1(o.pointsAgainst ?? 0),
        streak: o.streakType && o.streakType !== 'NONE' && o.streakLength
          ? `${o.streakType === 'WIN' ? 'W' : o.streakType === 'LOSS' ? 'L' : 'T'}${o.streakLength}` : null,
      };
    })
    // Seed when ESPN has assigned one; otherwise wins, then points for.
    .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || b.wins - a.wins || b.pointsFor - a.pointsFor);
}

// Healthy players only (an OUT or IR free agent is not a pickup this week),
// best projection first.
const UNAVAILABLE = new Set(['OUT', 'INJURY_RESERVE', 'SUSPENSION']);
export function shapeFreeAgents(players, week, limit = 20) {
  if (!Array.isArray(players)) return [];
  return players
    .map((p) => (p && p.player ? { ...shapePlayer(p.player, week), status: p.status || null } : null))
    .filter((p) => p && !UNAVAILABLE.has(p.injuryStatus))
    .sort((a, b) => (b.projected ?? -1) - (a.projected ?? -1) || (b.percentOwned ?? -1) - (a.percentOwned ?? -1))
    .slice(0, limit);
}

// Player ids a transaction list mentions, for one batched name lookup.
export function transactionPlayerIds(transactions) {
  const ids = new Set();
  for (const t of transactions || []) for (const i of t.items || []) if (Number.isInteger(i.playerId) && i.playerId > 0) ids.add(i.playerId);
  return [...ids];
}

const TX_LABEL = { FREEAGENT: 'Free agent', WAIVER: 'Waiver', TRADE_ACCEPT: 'Trade', TRADE_UPHOLD: 'Trade' };

// Executed moves only, newest first. Lineup shuffles (ROSTER) are noise here.
export function shapeTransactions(transactions, playerNames, names, limit = 25) {
  if (!Array.isArray(transactions)) return [];
  const label = (id) => playerNames[id] || `Player ${id}`;
  return transactions
    .filter((t) => t && t.status === 'EXECUTED' && TX_LABEL[t.type])
    .map((t) => {
      const items = t.items || [];
      const adds = items.filter((i) => i.type === 'ADD').map((i) => ({ player: label(i.playerId), team: names[i.toTeamId] || null }));
      const drops = items.filter((i) => i.type === 'DROP').map((i) => ({ player: label(i.playerId), team: names[i.fromTeamId] || null }));
      const trades = items.filter((i) => i.type === 'TRADE').map((i) => ({ player: label(i.playerId), from: names[i.fromTeamId] || null, to: names[i.toTeamId] || null }));
      return {
        id: t.id,
        type: TX_LABEL[t.type],
        team: names[t.teamId] || null,
        at: t.processDate || t.proposedDate || null,
        adds, drops, trades,
      };
    })
    .filter((t) => t.adds.length || t.drops.length || t.trades.length)
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(0, limit);
}
