---
name: fantasy-check
description: Pull Tayls' live ESPN fantasy football team and give a start/sit plus waiver-wire read. Use when she asks who to start, who to bench, who to pick up, how her team looks this week, or invokes /fantasy-check. Runs headless via `claude -p "/fantasy-check"`. Do NOT use for the draft board or league standings pages — those are the web app (index.html / league.html / sports.html).
---

# fantasy-check

Reads the live ESPN league through this repo's own Vercel proxy and produces an
actionable weekly read: who to start, who to sit, and who's worth claiming.

## League facts (verified 2026-08-25, do not guess these)

- League ID: `1573934181` — "INSPIRED FANTASY FOOTBALL"
- Tayls' team ID: **16** ("Hits Different", abbrev TNT). **Not 17** — that's
  another owner's team ("Goldfish Bowl"). A prior session got this wrong;
  re-verify against the API before ever changing it.
- 20 teams, snake, PPR, H2H points, **private** (cookie auth required).
- **IDP league**: 2 DP slots plus 7 bench, 2 IR, 2 FLEX. Defensive players
  (DL/LB/DB) count — don't treat this as offense-only.
- Draft: Saturday, August 30, 2026.

## Step 1 — fetch

```bash
curl -s "https://fantasy-football-taylor-ritchie-s-projects.vercel.app/api/advice?leagueId=1573934181&teamId=16"
```

Optional params: `year`, `limit` (free agents, default 40, max 100).

The response gives you, in one shot:
- `week`, `opponentId`, `drafted`, `projectedStarterTotal`
- `starters[]` and `bench[]` — each with `name`, `pos`, `slot`, `projected`,
  `injuryStatus`, `eligibleSlots`
- `freeAgents[]` — sorted by projection, with `percentOwned`
- `teams[]` — names and records, for naming the opponent

## Step 2 — gate checks, in order. Do not skip to Step 3.

**`rosterCount` is NOT a valid signal for whether there's anything to advise on.**
ESPN pre-populates a placeholder roster before the draft — Tayls' team showed
12 names with `drafted: false` and every `projected` null. An earlier version of
this skill keyed the pre-draft guard on `rosterCount === 0`, which never fired,
and a careless run would have produced confident advice out of null-vs-null
comparisons. Gate on the following instead:

1. **`error` mentions 401 / cookies** → ESPN cookies expired. Tell Tayls to
   re-grab `espn_s2` and `SWID` from a logged-in browser and update them in
   Vercel → fantasy-football → Settings → Environment Variables. **Stop.**
2. **`error` mentions ESPN_S2 / ESPN_SWID not set** → env vars missing. Same
   fix, same place. **Stop.**
3. **`drafted` is `false`** → the draft hasn't happened. Say so plainly, name
   the draft date, and stop. Any roster present is a placeholder. **Stop.**
   You may list the placeholder names *if* you label them as such, but give no
   start/sit or waiver advice.
4. **Every `projected` in `starters[]` is null** → projections aren't published
   yet (common in preseason, or if ESPN hasn't set the scoring period). Report
   injuries and empty slots only; say projections are unavailable and give no
   ranked advice. **Stop before Step 3's comparisons.**
5. **Sanity check the free-agent pool**: if `freeAgents` contains obvious
   league-winners at very high `percentOwned` (a 99%-owned starting QB sitting
   free), the pool is unclaimed — i.e. pre-draft. Treat as case 3. **Stop.**
6. **`faError` present** → roster analysis is still valid, but say the
   free-agent half is unavailable rather than silently omitting it.

Only if none of the above fire, continue.

## Step 3 — analyse

Start/sit:
1. Flag any **starter** with `injuryStatus` of `OUT` or `INJURY_RESERVE` — these
   are must-fix, lead with them.
2. Flag `QUESTIONABLE` starters as watch items, not emergencies.
3. For each starter, look for a **bench** player who (a) has that starter's slot
   in their `eligibleSlots` and (b) has a meaningfully higher `projected` —
   more than ~2 points. Under that, projections are noise; don't recommend a
   swap on a rounding difference. **Skip any comparison where either side's
   `projected` is null** — a null is not a zero and not a low score.
4. Note empty starting slots (a slot in the lineup with no player).

Waivers:
5. From `freeAgents`, surface anyone whose `projected` beats a current starter
   at the same position. Prefer lower `percentOwned` when projections are close
   — that's the actually-gettable pickup.
6. Cap it at the 5 best suggestions. A list of 40 is not advice.

## Step 4 — report

Lead with the single most important action. Then:

- **Must fix** — injured/empty starters
- **Consider** — bench swaps worth making, with both projections shown
- **Waiver targets** — up to 5, with position, projection and % owned
- **Team outlook** — `projectedStarterTotal` and the opponent's name from `teams[]`

Keep it short. If nothing needs changing, say the lineup looks set and give the
projected total — don't invent problems to fill sections.

Be honest about what projections are: ESPN's numbers, not predictions Claude
endorses. Never present a projection as a certainty, and never tell her a
lineup guarantees a win. Mark inferences (e.g. "this looks like a placeholder
roster") as inference, not as something the API stated.

## Notes

- Read-only. This skill never sets a lineup or makes a claim on ESPN — it tells
  Tayls what to do, she does it. ESPN write operations are deliberately not
  implemented.
- The proxy is `api/advice.js` in `TheLittlestAskew/Fantasy-Football`, deployed
  automatically to Vercel on push to `main`.
- **Install location matters.** Claude Code only discovers
  `~/.claude/skills/<name>/SKILL.md`. A bare `~/.claude/skills/fantasy check.md`
  (space, no folder) is invisible and `/fantasy-check` will silently not exist.
