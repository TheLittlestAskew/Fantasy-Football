# HANDOFF — fantasy-football

## ▶ DO NEXT
**Draft is Saturday, August 30, 2026** (confirmed via league settings `draftSettings.date`).

✓ **The Vercel env vars are DONE.** `ESPN_S2` and `ESPN_SWID` are set on the
fantasy-football project and authenticating. Verified live 2026-08-26:
`GET /api/draft?leagueId=1573934181` → `HTTP 200`
`{"drafted":false,"inProgress":false,"teams":20,"totalPicks":280,"picks":[]}`.
`/api/advice` and `/api/league` authenticate off the same two vars. Nothing is
blocking any more.

**Open item:** merge PR `fix/fantasy-check-predraft-guard` (branch pushed, PR
needs opening by hand — the GitHub connector is read-only, see log).

On draft day: open the War Room and click **ESPN Sync: Off** to turn it on — polls every 5s and auto-marks picks taken/mine.

Reference facts, all verified against the live authenticated API on 2026-08-25:
- Tayls' ESPN team ID is **16** ("Hits Different"); she picks **9th overall**. (A prior session had this wrong as 17 / 3rd — 17 is Brandon Sandler's "Goldfish Bowl." Corrected; see log.)
- League `1573934181`, "INSPIRED FANTASY FOOTBALL", 20 teams, snake, PPR, H2H points, **private** (`isPublic: false`).
- **IDP league** — 2 DP lineup slots alongside the usual offense/K/DST, 7 bench, 2 IR, 2 FLEX. Any player-position logic must handle DL/LB/DB, not just offense.
- Two divisions: "Chaos Division" and "Order Divison" (ESPN's own typo), 10 teams each. 8 playoff teams, seeded by `TOTAL_POINTS_SCORED`.

Possible future work, nothing blocking: post-draft, re-check the league dashboard's Rosters tab once ESPN publishes real lineups; add per-week matchup navigation (currently shows current week only); add a draft-recap view once `draftDetail.picks` is populated.

---

## Log
<!-- newest first. one entry per logical task/session. -->

### 2026-08-26 12:35 ET · Claude Code
- **Changed:** Ran `/fantasy-check` for the first time; fixed two things that stopped it working.
  1. **The skill was undiscoverable.** It lived at `~/.claude/skills/fantasy check.md` — a space in the filename and a bare `.md`. Claude Code only registers `~/.claude/skills/<name>/SKILL.md`, so `/fantasy-check` silently did not exist. Copied the repo's canonical copy to `~/.claude/skills/fantasy-check/SKILL.md` (verified byte-identical apart from CRLF first) and deleted the stray. It registered immediately.
  2. **Fixed a real logic bug in the skill's Step 2 pre-draft guard.** It bailed only when `rosterCount` is 0 **and** `drafted` is false. ESPN reports a non-empty pre-draft roster, so the guard never fired: observed `drafted: false` with `rosterCount: 12`, every rostered `projected` null, `projectedStarterTotal: 0`, and Josh Allen sitting in `freeAgents` at 99.9% owned. Step 3 would then have ranked `null` against `null` and emitted confident start/sit advice built on absent data. Now gates on `drafted` alone, plus a second stop for all-null projections after `drafted` flips true.
  - Also confirmed the ESPN env vars are live and `/api/draft` returns 200 (see DO NEXT), and re-verified team 16 = "Hits Different" against `teams[]` — team 17 is "Goldfish Bowl", so the old ID error has not crept back.
  - `/fantasy-check` result itself: nothing to advise on, draft is 4 days out. Week 1 opponent is team 3, "The Murderhobos".
- **Commit:** `b9d1d49` (skills/fantasy-check/SKILL.md guard fix, on branch `fix/fantasy-check-predraft-guard`)
- **Friction:** gen-fail — first `espn_s2` paste arrived truncated at 277 chars ending in a bare `%`; caught by checking length and tail *before* spending a deploy cycle. Copying from the DevTools **Cookie Value** detail pane (not the grid cell, which truncates) gave 336 chars ending `%3D`, which ESPN accepted with a 200. Always length-check and tail-check a pasted `espn_s2` against ESPN directly before pushing it anywhere.
- **Friction:** gen-fail — the GitHub MCP connector is **read-only**: `403 Resource not accessible by integration` on both `create_branch` and `create_pull_request`. `git push` over HTTPS works fine (Git Credential Manager has a write-scoped token), so the branch is up, but the PR itself has to be opened in the browser. `gh` is not installed on this machine — installing it would fix PR creation from Claude Code.
- **Next:** Open and merge the PR for `fix/fantasy-check-predraft-guard`, then re-run `/fantasy-check` on draft day.
- **Watch out:** This session started from a task doc saying the ESPN env vars still needed setting. They were already set — commit `59721e9` landed mid-session from another surface and `/api/draft` flipped from 500 to 200 underneath us. Roughly half an hour went into staging work that was already done. **Probe the live endpoint before acting on a stale DO NEXT block**, since this repo gets edited from several surfaces on the same day.

### 2026-08-25 · Claude chat (fourth session — league dashboard)
- **Changed:** Built `league.html`, the season-long league dashboard, consuming the `api/league.js` proxy added earlier the same day. Three tabs:
  - **Standings** — per-division tables (Chaos / Order) plus a league-wide table, showing rank, team logo, team name, owner real name, W-L-T, points for, points against. Tayls' row is highlighted. Sorted by wins then points-for, matching this league's `TOTAL_POINTS_SCORED` playoff seeding rule.
  - **Matchups** — the current week's games as cards, two per row on desktop, Tayls' game outlined in the accent color. Scores render only once a game has actually started (otherwise em-dashes, so a 0.0–0.0 preseason week doesn't read as a real tie).
  - **Rosters** — team picker dropdown for all 20 teams (defaulting to Tayls'), starters sorted above bench/IR by ESPN slot order, with slot label, position badge, player name, and injury flags (Q / OUT / IR).
  - Also added a header meta strip showing league name, size, scoring, current week, and a **live draft countdown** ("Draft Sat, Aug 30 8:00 PM (in 5 days)") that automatically flips to a "Drafted <date>" past-tense label once `draftDetail.drafted` goes true.
  - Cross-linked the two pages: "League →" in the War Room header, "← War Room" in the dashboard header. Theme is deliberately duplicated (not shared) between the two files so each stays standalone and buildless — noted in a comment in both.
- **Commit:** `9eeb95a` (league.html), `391f721` (index.html nav link)
- **Next:** See DO NEXT above — the Vercel env vars are the last blocking step before draft day.
- **Watch out:** Three ESPN data-shape quirks this page had to work around, all worth knowing for future work here:
  1. **Rosters are not on `teams[]`.** ESPN only embeds them inside `schedule[].home/away.rosterForCurrentScoringPeriod.entries`, for the current scoring period only. `rostersByTeam()` walks the whole schedule to collect them.
  2. **`teams[].owners` holds GUIDs, not names.** Real names live in a separate top-level `members[]` array and must be joined on that GUID (`ownerName()`).
  3. Rosters legitimately show empty pre-draft; the empty state says so explicitly rather than looking broken. Verify this tab again after the draft, when real lineups exist.

### 2026-08-25 · Claude chat (third session — correction + league data proxy)
- **Changed:** Two things, in order:
  1. **Corrected a factual error from the immediately prior session's HANDOFF entry.** That entry claimed Tayls' ESPN team ID is 17 and that team 17 picks 3rd overall. Pulled the live, cookie-authenticated league JSON directly (via the new `api/league.js` proxy) and cross-checked `members[]` → `teams[]` → `draftSettings.pickOrder`: **team 16 ("Hits Different") is owned by Taylor Ritchie and picks 9th overall; team 17 ("Goldfish Bowl") is owned by a different league member, Brandon Sandler.** Left uncorrected, turning on ESPN Sync would have marked another owner's picks as Tayls' own. Fixed the hardcoded default in `index.html` from `teamId: 17` to `teamId: 16` and added an inline code comment documenting the correction and how it was verified.
  2. **Added `api/league.js`**, a Vercel proxy (same CORS-workaround + cookie-auth pattern as `api/adp.js` and `api/draft.js`) that fetches full league data from ESPN's `mTeam`/`mRoster`/`mMatchup`/`mStandings`/`mSettings` views. Verified end-to-end with real cookies: confirmed league name, 20 teams, snake/PPR settings, and the real draft date (**Saturday, August 30, 2026**, `draftDetail.drafted: false`).
- **Commit:** `19cd3ab`, `ccd79d0`, `2165e67`, `d269eab` (api/league.js, built iteratively while debugging the ESPN host/auth issues below), `8515d9f` (index.html teamId correction)
- **Next:** See DO NEXT above.
- **Watch out:** Two ESPN gotchas found while building this: (1) `fantasy.espn.com` for the v3 API silently returns the generic marketing homepage (HTTP 200, not JSON) instead of an error — the real host is `lm-api-reads.fantasy.espn.com`. (2) An unauthenticated fetch to this league returns a clean `401 AUTH_LEAGUE_NOT_VISIBLE` from ESPN itself — a trustworthy signal, not a proxy bug — confirming cookie auth is mandatory regardless of any league "visibility" setting in the UI.

### 2026-08-25 · Claude chat (second session — ESPN live draft sync)
- **Changed:** Built Phase 2 — live ESPN draft sync.
  - Confirmed the league (`1573934181`) is **private**; a direct unauthenticated fetch to ESPN's `mSettings` endpoint returned 401.
  - Got `espn_s2` and `SWID` cookies from Tayls (pulled from a logged-in browser session per ESPN's documented DevTools method) and verified them live against ESPN's `mDraftDetail` and `players` endpoints — both returned 200.
  - Added `api/draft.js`: a Vercel serverless function that reads `ESPN_S2`/`ESPN_SWID` from env vars (never exposed to the browser), fetches ESPN's `mDraftDetail` + `mSettings`, and for any picks made resolves player names via a **targeted** `x-fantasy-filter` lookup (only the drafted player IDs, not the full multi-thousand-player pool) so each poll stays fast.
  - Wired the frontend: "ESPN Sync" toggle in the header, League ID / Team ID fields in Settings, and a 5-second poll loop while sync is on. New picks are matched to the FFC/CSV player pool by normalized name+position and applied via a non-toggling setter (`applyEspnPick`) — ESPN is the source of truth once sync is on, so a pick never un-applies itself on the next poll.
  - **This session's claim that team 17 = Tayls' team, picking 3rd overall, was incorrect** — corrected in the following session. The `api/draft.js` code itself is unaffected; only the `teamId` default used to interpret its output was wrong.
- **Commit:** `0368378` (api/draft.js added), `a777886` (index.html: ESPN sync UI + polling logic)
- **Next:** See DO NEXT above.
- **Watch out:** If `ESPN_S2`/`ESPN_SWID` are unset, `api/draft.js` returns a clear 500 with that exact message rather than failing silently. ESPN's cookies occasionally expire/rotate — if sync starts returning 401, re-grab both values from a fresh logged-in browser session.

### 2026-08-25 · Claude chat (first session — CORS fix + Phase 1 verification)
- **Changed:** Closed out Phase 1 verification end to end.
  - Confirmed GitHub Pages was enabled and live at `https://thelittlestaskew.github.io/Fantasy-Football/`; all 9 console self-tests passed.
  - **Found the FFC ADP fetch was permanently CORS-blocked**, not intermittently — Fantasy Football Calculator's API sends no `Access-Control-Allow-Origin` header, so no browser fetch to it will ever succeed from any origin. The CSV import fallback was working exactly as designed.
  - **Fixed it properly**: added `api/adp.js`, a Vercel serverless function that fetches FFC server-to-server and re-adds the CORS header. Linked this repo to Vercel (`taylor-ritchie's-projects` team; required installing the Vercel GitHub App first). Repointed `index.html`'s `ADP_URL` at the proxy.
  - Verified live after the fix: **270 players loaded, FFC ADP, dated 8/25/2026**, board fully populated. No more CSV fallback panel on load.
- **Commit:** `829d984` (api/adp.js added), `ddf17e8` (index.html ADP_URL repointed to proxy)
- **Next:** See DO NEXT above.
- **Watch out:** The Vercel project auto-deploys on every push to `main` — any edit to `api/*.js` goes live automatically, no separate deploy step.

### 2026-07-12 · Claude chat (Cowork)
- **Changed:** Phase 1 built: single-file War Room draft board (index.html) for a 20-team PPR snake draft. FFC ADP fetch + FantasyPros CSV import fallback, snake pick tracker with slot math, custom rank reordering, notes, My Team panel, localStorage persistence, dark theme. README added.
- **Commit:** manual web upload (connector 403 blocked API writes)
- **Next:** verify live app: console self-tests + whether FFC API allows browser fetch; then set league settings once ESPN league fills.
- **Watch out:** FFC API returned empty bodies to server-side fetches; browser CORS behavior unverified. If it fails, the app opens the CSV import panel automatically. Phase 2 is ESPN integration via espn_s2 + SWID cookies.
