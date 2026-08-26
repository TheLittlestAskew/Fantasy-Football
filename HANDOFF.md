# HANDOFF — fantasy-football

## ▶ DO NEXT

**🔐 First, before anything else: rotate the ESPN cookie.** Tayls' `espn_s2`
was pasted in plain text into a Claude Code transcript and is still a valid
session credential for her ESPN account. Fix: log out of ESPN, log back in
(this invalidates the old cookie and issues a new one), then update `ESPN_S2`
in Vercel → fantasy-football → Settings → Environment Variables. Flagged
2026-08-25, **not yet confirmed done.**

**Draft is Saturday, August 30, 2026.** On draft day: open the War Room and
click **ESPN Sync: Off** to turn it on — polls every 5s and auto-marks picks
taken/mine.

**ESPN auth is working.** `ESPN_S2` / `ESPN_SWID` are set in Vercel and live —
`/api/draft` returns `200 {"drafted":false,"teams":20,"totalPicks":280}`. This
unblocks the League dashboard's Rosters tab, Sports Desk's My Players tab, and
the `fantasy-check` skill, none of which had been runnable before.

Untested, because it can't be until after the draft:
- League dashboard **Rosters** tab against real (not placeholder) lineups
- Sports Desk **My Players** tab — needs a real roster to match news against
- `fantasy-check` **Step 3** — the analysis half has never executed; every run
  so far has correctly stopped at the pre-draft gate

Reference facts, verified against the live authenticated API on 2026-08-25:
- Tayls' ESPN team ID is **16** ("Hits Different", abbrev TNT); she picks
  **9th overall**. Team **17** is "Goldfish Bowl", a different owner. A prior
  session had this wrong; see log.
- League `1573934181`, "INSPIRED FANTASY FOOTBALL", 20 teams, snake, PPR,
  H2H points, **private** (`isPublic: false`).
- **IDP league** — 2 DP lineup slots alongside offense/K/DST, 7 bench, 2 IR,
  2 FLEX. Position logic must handle DL/LB/DB.
- Two divisions: "Chaos Division" and "Order Divison" (ESPN's typo), 10 each.
  8 playoff teams, seeded by `TOTAL_POINTS_SCORED`.
- **ESPN pre-populates a placeholder roster before the draft** — Tayls' team
  shows 12 names with `drafted: false` and all projections null. Never treat a
  non-empty roster as proof the draft happened.

Possible future work, nothing blocking: per-week matchup navigation on the
league dashboard (shows current week only); a draft-recap view once
`draftDetail.picks` populates; GHSA standings view (`api/ghsa.js?view=standings`
exists and is unused by any UI).

---

## Log
<!-- newest first. one entry per logical task/session. -->

### 2026-08-25 · Claude chat (sixth session — sports desk, advice API, skill)
- **Changed:** Three things, plus a bug fix on the third.
  1. **`sports.html` — a general Sports Desk.** Four tabs: **Scores** across 14
     leagues (NFL, NCAA FB, MLB, NBA, NHL, NCAA MB, WNBA, ATP/WTA tennis, World
     Cup, Champions League, EPL, MLS, Olympics); **My Players**, which scans
     ESPN's NFL news feed against Tayls' fantasy roster and tags any article
     mentioning her players; **News** per league; and **Rome / Floyd HS**.
     Backed by two new proxies: `api/scores.js` (ESPN's public site API,
     whitelisted league keys so a typo can't hit arbitrary paths) and
     `api/ghsa.js`.
  2. **`api/ghsa.js` — a GHSA.net scraper.** There is no public API for Georgia
     high school football. MaxPreps was deliberately **not** used (their terms
     prohibit it and they actively block bots); GHSA.net publishes the same
     results itself as plain Drupal HTML tables, which is both the authoritative
     source and legitimately scrapeable. Parses weekly score pages
     (`/{year}-ghsa-football-scores-{MMDDYYYY}`, walking back up to 6 Fridays to
     find the latest published week) and standings. Tracks Rome, Model,
     Pepperell, Armuchee, Coosa, Darlington. GSD and Unity Christian are
     link-only cards with an explanation — GSD plays a deaf-schools circuit
     (NC/Arkansas/SC schools for the deaf), not GHSA football, and Unity is in a
     private association.
  3. **`api/advice.js` + `skills/fantasy-check/SKILL.md`** — the headless
     fantasy path. One endpoint returns roster with weekly projections,
     starters/bench split, and top free agents with projections and % owned; the
     skill turns that into a start/sit and waiver read, runnable as
     `claude -p "/fantasy-check"`. Deliberately **read-only** — it advises, it
     never sets a lineup or files a claim.
  - Chose a Claude Code skill over an MCP server: it matches Tayls' existing
    headless pattern (`mirror-freshness`, `septentrion-sync`) and adds no server
    to maintain. An MCP wrapper remains an option if other surfaces need access.
- **Commit:** `404d118` (api/scores.js), `4146869` (api/ghsa.js), `c59123b`
  (sports.html), `71c73ef` (GHSA class/region labelling), `9f3781e`
  (api/advice.js), `59721e9` (SKILL.md), `4d421c3` (SKILL.md guard fix)
- **Next:** See DO NEXT — cookie rotation first, then post-draft verification.
- **Watch out:**
  - **GHSA notation is a genuine trap and it caught both of us.** GHSA writes
    `{region}-{class}`, so **`7-A Division I` means Region 7, Class A Div I —
    the *smallest* schools — not "Class 7A."** Class is the letter count
    (`AAAAA` = 5A); the leading number is the region. Rome is the big school
    (~1,986 students, 5A in 2025, 6A under the new 2026-28 alignment) while its
    Floyd County neighbours are Class A. `sports.html` now renders
    "Class A Div I · Region 7" via `formatRegion()` rather than the raw string,
    with self-tests covering it.
  - **A guard bug shipped and was caught by a live run, not by review.** The
    skill's pre-draft gate keyed on `rosterCount === 0`, which never fires
    because ESPN pre-populates a 12-player placeholder roster. The run stopped
    only on its own judgment. Fixed in `4d421c3`: the gate now keys on
    `drafted === false`, on all-null projections, and on an unclaimed-free-agent
    sanity check, with an explicit "null is not zero" rule in the comparison
    step. **Generalisable lesson: don't infer state from a count when the API
    exposes the state directly.**
  - **Claude Code skill discovery is path-strict**: only
    `~/.claude/skills/<name>/SKILL.md` is found. A file at
    `~/.claude/skills/fantasy check.md` is silently invisible — `/fantasy-check`
    just won't exist, with no error. Documented in the skill's own Notes.
  - `api/scores.js` and `api/ghsa.js` were written **without any live testing** —
    the sandbox's network allowlist blocked `site.api.espn.com` and `ghsa.net`
    for the whole session. They're written defensively and surface real error
    messages, but treat their first real run as the actual test.

### 2026-08-25 · Claude chat (fifth session — league dashboard)
- **Changed:** Built `league.html`, the season-long league dashboard, consuming
  `api/league.js`. Three tabs: **Standings** (per-division Chaos/Order tables
  plus league-wide, with owner real names, W-L-T, PF/PA, Tayls' row highlighted,
  sorted by wins then points-for to match the `TOTAL_POINTS_SCORED` seeding
  rule); **Matchups** (current week as cards, Tayls' game outlined, scores shown
  only once a game has started so a 0.0–0.0 preseason week doesn't read as a
  tie); **Rosters** (picker for all 20 teams, starters above bench/IR, injury
  flags). Header meta strip shows league name, size, scoring, current week and a
  live draft countdown that flips to past tense once `drafted` goes true.
  Cross-linked with the War Room.
- **Commit:** `9eeb95a` (league.html), `391f721` (index.html nav link)
- **Next:** See DO NEXT above.
- **Watch out:** Two ESPN data-shape quirks: (1) **rosters are not on
  `teams[]`** — ESPN embeds them only inside
  `schedule[].home/away.rosterForCurrentScoringPeriod.entries` for the current
  period, so `rostersByTeam()` walks the whole schedule; (2) **`teams[].owners`
  holds GUIDs, not names** — real names live in the top-level `members[]` array
  and must be joined on that GUID.

### 2026-08-25 · Claude chat (fourth session — correction + league data proxy)
- **Changed:** (1) **Corrected a factual error from the prior session's HANDOFF
  entry**, which claimed Tayls' team ID is 17 picking 3rd overall. Pulled the
  live authenticated league JSON and cross-checked `members[]` → `teams[]` →
  `draftSettings.pickOrder`: **team 16 ("Hits Different") is Taylor Ritchie,
  picking 9th; team 17 ("Goldfish Bowl") is Brandon Sandler.** Left uncorrected,
  ESPN Sync would have marked another owner's picks as hers. Fixed the default
  in `index.html` and added an inline comment on how it was verified.
  (2) **Added `api/league.js`** — full league data from `mTeam`/`mRoster`/
  `mMatchup`/`mStandings`/`mSettings`. Confirmed the real draft date.
- **Commit:** `19cd3ab`, `ccd79d0`, `2165e67`, `d269eab` (api/league.js, built
  iteratively while debugging the ESPN host/auth issues), `8515d9f` (teamId fix)
- **Next:** See DO NEXT above.
- **Watch out:** Two ESPN gotchas: (1) `fantasy.espn.com` for the v3 API
  silently returns the generic marketing homepage (HTTP 200, not JSON) instead
  of an error — the real host is `lm-api-reads.fantasy.espn.com`. (2) An
  unauthenticated fetch returns a clean `401 AUTH_LEAGUE_NOT_VISIBLE` from ESPN
  itself — a trustworthy signal, not a proxy bug.

### 2026-08-25 · Claude chat (third session — ESPN live draft sync)
- **Changed:** Built Phase 2 — live ESPN draft sync. Confirmed the league is
  private (401 unauthenticated). Added `api/draft.js`: reads `ESPN_S2`/
  `ESPN_SWID` from env vars (never exposed to the browser), fetches
  `mDraftDetail` + `mSettings`, and resolves player names for picks via a
  **targeted** `x-fantasy-filter` lookup (only drafted IDs, not the full pool)
  so each poll stays fast. Wired the frontend: "ESPN Sync" toggle, League/Team
  ID fields, 5-second poll. Picks match the FFC/CSV pool by normalized
  name+position and apply via a non-toggling setter so a pick never un-applies.
  **This session's claim that team 17 = Tayls' team was incorrect** — corrected
  in the following session; `api/draft.js` itself was unaffected.
- **Commit:** `0368378` (api/draft.js), `a777886` (index.html sync UI + polling)
- **Next:** See DO NEXT above.
- **Watch out:** If the env vars are unset, `api/draft.js` returns a clear 500
  rather than failing silently. ESPN cookies rotate/expire — a 401 means
  re-grab both values from a fresh logged-in browser session.

### 2026-08-25 · Claude chat (second session — CORS fix + Phase 1 verification)
- **Changed:** Confirmed GitHub Pages live; all 9 console self-tests passed.
  **Found the FFC ADP fetch was permanently CORS-blocked** — Fantasy Football
  Calculator sends no `Access-Control-Allow-Origin`, so no browser fetch will
  ever succeed from any origin. **Fixed properly** with `api/adp.js`, a Vercel
  function fetching FFC server-to-server and re-adding the CORS header; linked
  the repo to Vercel (required installing the Vercel GitHub App). Verified:
  **270 players loaded, FFC ADP, 8/25/2026**, board fully populated.
- **Commit:** `829d984` (api/adp.js), `ddf17e8` (ADP_URL repointed)
- **Next:** See DO NEXT above.
- **Watch out:** The Vercel project auto-deploys on every push to `main` — any
  edit to `api/*.js` goes live automatically, no separate deploy step. This is
  also how env vars set in the dashboard become active: any push triggers the
  redeploy that picks them up.

### 2026-07-12 · Claude chat (Cowork)
- **Changed:** Phase 1 built: single-file War Room draft board (index.html) for
  a 20-team PPR snake draft. FFC ADP fetch + FantasyPros CSV import fallback,
  snake pick tracker with slot math, custom rank reordering, notes, My Team
  panel, localStorage persistence, dark theme. README added.
- **Commit:** manual web upload (connector 403 blocked API writes)
- **Next:** verify live app; then set league settings once the ESPN league fills.
- **Watch out:** FFC API returned empty bodies to server-side fetches; browser
  CORS behavior unverified. Phase 2 is ESPN integration via espn_s2 + SWID.
