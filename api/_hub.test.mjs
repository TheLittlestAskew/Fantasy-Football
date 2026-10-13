// node --test api/_hub.test.mjs  (zero deps; underscore keeps it off Vercel's routes)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentWeek, weekPoints, shapePlayer, shapeLineup, shapeMatchup, shapeStandings,
  shapeFreeAgents, transactionPlayerIds, shapeTransactions, teamNames, shapeForm, shapeLeaders,
} from './_hub-shape.js';

const stat = (source, week, total) => ({ statSourceId: source, statSplitTypeId: 1, scoringPeriodId: week, appliedTotal: total });
const player = (id, over = {}) => ({
  id, fullName: `P${id}`, defaultPositionId: 1, proTeamId: 4, injuryStatus: 'ACTIVE',
  stats: [stat(0, 5, 36.04), stat(1, 5, 36.94), stat(1, 4, 99)], ...over,
});
const entry = (slot, p) => ({ lineupSlotId: slot, playerPoolEntry: { player: p } });

function league() {
  return {
    status: { currentMatchupPeriod: 5 },
    settings: { name: 'L', scheduleSettings: { divisions: [{ id: 0, name: 'Chaos Division ' }] } },
    teams: [
      { id: 16, name: 'Hits Different ', divisionId: 0, playoffSeed: 3,
        record: { overall: { wins: 4, losses: 0, ties: 0, pointsFor: 542.5, pointsAgainst: 462.40000000000003, streakType: 'WIN', streakLength: 4 } },
        roster: { entries: [entry(20, player(3)), entry(0, player(1)), entry(17, player(2, { defaultPositionId: 5 }))] } },
      { id: 20, location: 'Halfling', nickname: 'Hail', divisionId: 0, playoffSeed: 1,
        record: { overall: { wins: 3, losses: 1, ties: 0, pointsFor: 600, pointsAgainst: 500, streakType: 'LOSS', streakLength: 1 } },
        roster: { entries: [] } },
    ],
    schedule: [
      { matchupPeriodId: 4, home: { teamId: 16 }, away: { teamId: 20 } },
      { matchupPeriodId: 5, winner: 'UNDECIDED',
        home: { teamId: 20, totalPoints: 0, pointsByScoringPeriod: { 5: 101.26 }, totalProjectedPointsLive: 120 },
        away: { teamId: 16, totalPoints: 0, pointsByScoringPeriod: { 5: 130.1 }, totalProjectedPointsLive: 139.53199 } },
    ],
  };
}

test('currentWeek reads the matchup period and refuses a missing one', () => {
  assert.equal(currentWeek(league()), 5);
  assert.throws(() => currentWeek({}), /currentMatchupPeriod/);
  assert.throws(() => currentWeek({ status: { currentMatchupPeriod: 0 } }), /currentMatchupPeriod/);
});

test('weekPoints separates actual from projected and ignores other weeks', () => {
  const p = player(1);
  assert.equal(weekPoints(p, 5, 0), 36);
  assert.equal(weekPoints(p, 5, 1), 36.9);
  assert.equal(weekPoints(p, 6, 1), null);
  assert.equal(weekPoints({}, 5, 0), null);
  assert.equal(weekPoints(null, 5, 0), null);
});

test('shapePlayer maps position/team, hides ACTIVE, and throws on no player', () => {
  const s = shapePlayer(player(9, { defaultPositionId: 11, proTeamId: 30, injuryStatus: 'QUESTIONABLE', ownership: { percentOwned: 62.123 } }), 5);
  assert.equal(s.pos, 'LB'); // 11 is LB, the bug advice.js has
  assert.equal(s.proTeam, 'JAX');
  assert.equal(s.injuryStatus, 'QUESTIONABLE');
  assert.equal(s.percentOwned, 62.1);
  assert.equal(shapePlayer(player(1), 5).injuryStatus, null);
  assert.throws(() => shapePlayer(null, 5), /missing/);
});

test('shapeLineup orders starters before bench and skips empty entries', () => {
  const l = shapeLineup([entry(20, player(3)), { lineupSlotId: 2 }, entry(17, player(2)), entry(0, player(1))], 5);
  assert.deepEqual(l.map((p) => p.slot), ['QB', 'K', 'BE']);
  assert.deepEqual(l.map((p) => p.starting), [true, true, false]);
  assert.deepEqual(shapeLineup(undefined, 5), []);
});

test('shapeMatchup puts me first, uses the live period score, and handles a bye', () => {
  const m = shapeMatchup(league(), 16, 5);
  assert.equal(m.me.teamId, 16);
  assert.equal(m.me.score, 130.1); // totalPoints is 0 until the week finalizes
  assert.equal(m.me.projected, 139.5);
  assert.equal(m.opponent.name, 'Halfling Hail');
  assert.equal(m.opponent.score, 101.3);
  assert.equal(m.me.lineup[0].slot, 'QB');
  assert.equal(shapeMatchup(league(), 99, 5), null);
});

test('shapeStandings sorts by seed, trims division names, formats streaks', () => {
  const s = shapeStandings(league());
  assert.deepEqual(s.map((t) => t.teamId), [20, 16]);
  assert.equal(s[1].division, 'Chaos Division');
  assert.equal(s[1].pointsAgainst, 462.4);
  assert.equal(s[1].streak, 'W4');
  assert.equal(s[0].streak, 'L1');
  const noSeeds = league();
  for (const t of noSeeds.teams) delete t.playoffSeed;
  assert.deepEqual(shapeStandings(noSeeds).map((t) => t.teamId), [16, 20]); // wins break it
});

test('shapeFreeAgents drops OUT/IR, sorts by projection, respects the limit', () => {
  const fa = [
    { player: player(1, { stats: [stat(1, 5, 4)] }) },
    { player: player(2, { injuryStatus: 'OUT', stats: [stat(1, 5, 20)] }) },
    { player: player(3, { stats: [stat(1, 5, 10)] }) },
    { player: player(4, { injuryStatus: 'INJURY_RESERVE' }) },
    null,
  ];
  assert.deepEqual(shapeFreeAgents(fa, 5).map((p) => p.id), [3, 1]);
  assert.deepEqual(shapeFreeAgents(fa, 5, 1).map((p) => p.id), [3]);
  assert.deepEqual(shapeFreeAgents(undefined, 5), []);
});

test('transactions: executed moves only, named, newest first', () => {
  const names = teamNames(league());
  const tx = [
    { id: 'a', type: 'FREEAGENT', status: 'EXECUTED', teamId: 16, processDate: 100,
      items: [{ type: 'ADD', playerId: 1, toTeamId: 16 }, { type: 'DROP', playerId: 7, fromTeamId: 16 }] },
    { id: 'b', type: 'WAIVER', status: 'FAILED_INVALIDPLAYERSOURCE', teamId: 20, items: [{ type: 'ADD', playerId: 2 }] },
    { id: 'c', type: 'ROSTER', status: 'EXECUTED', teamId: 16, items: [{ type: 'LINEUP', playerId: 1 }] },
    { id: 'd', type: 'TRADE_ACCEPT', status: 'EXECUTED', teamId: 20, processDate: 200,
      items: [{ type: 'TRADE', playerId: 3, fromTeamId: 20, toTeamId: 16 }] },
  ];
  assert.deepEqual(transactionPlayerIds(tx), [1, 7, 2, 3]);
  const s = shapeTransactions(tx, { 1: 'Joe', 3: 'Ja' }, names);
  assert.deepEqual(s.map((t) => t.id), ['d', 'a']);
  assert.deepEqual(s[1].adds, [{ player: 'Joe', team: 'Hits Different' }]);
  assert.deepEqual(s[1].drops, [{ player: 'Player 7', team: 'Hits Different' }]); // unnamed id stays visible
  assert.deepEqual(s[0].trades, [{ player: 'Ja', from: 'Halfling Hail', to: 'Hits Different' }]);
  assert.deepEqual(shapeTransactions(undefined, {}, names), []);
});

test('shapeForm keeps the last N decided results per team, oldest first', () => {
  const g = (week, winner, home = 16, away = 20) => ({ matchupPeriodId: week, winner, home: { teamId: home }, away: { teamId: away } });
  const l = { schedule: [g(3, 'AWAY'), g(1, 'HOME'), g(2, 'TIE'), g(4, 'UNDECIDED'), { matchupPeriodId: 2, winner: 'HOME', home: { teamId: 7 } }] };
  assert.deepEqual(shapeForm(l), { 16: ['W', 'T', 'L'], 20: ['L', 'T', 'W'] });
  assert.deepEqual(shapeForm(l, 2)[16], ['T', 'L']);
  assert.deepEqual(shapeForm({}), {});
  assert.deepEqual(shapeForm(null), {});
});

test('shapeStandings attaches form, empty when a team has no decided games', () => {
  const l = league();
  l.schedule[0].winner = 'HOME';
  const rows = shapeStandings(l);
  assert.deepEqual(rows.find((t) => t.teamId === 16).form, ['W']);
  assert.deepEqual(rows.find((t) => t.teamId === 20).form, ['L']);
  assert.deepEqual(shapeStandings(league())[0].form, []);
});

test('shapeLeaders ranks starters who have played, skipping bench and unplayed', () => {
  const l = league();
  l.teams[1].roster.entries = [
    entry(0, player(7, { stats: [stat(0, 5, 41.2)] })),
    entry(17, player(8, { stats: [stat(1, 5, 9)] })), // projected only: hasn't played
  ];
  const top = shapeLeaders(l, 5);
  assert.deepEqual(top.map((p) => p.id), [7, 1, 2]); // bench player 3 is out
  assert.equal(top[0].team, 'Halfling Hail');
  assert.equal(top[0].points, 41.2);
  assert.equal(shapeLeaders(l, 5, 1).length, 1);
  assert.deepEqual(shapeLeaders({}, 5), []);
});
