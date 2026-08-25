# HANDOFF — fantasy-football

## ▶ DO NEXT
**Draft is Saturday, August 30, 2026** (confirmed via league settings `draftSettings.date`). Everything below needs to be done before then.

Phase 2 (ESPN live draft sync) is code-complete except one manual step:
- Add two env vars in Vercel dashboard → fantasy-football project → Settings → Environment Variables:
  - `ESPN_S2` = the espn_s2 cookie value (long string, no braces)
  - `ESPN_SWID` = the SWID cookie value, **including the curly braces** `{...}`
  - Then redeploy (or push any trivial commit) so the function picks them up.
- Once set, click **ESPN Sync: Off** in the app header to turn it on during the live draft — it polls every 5s and auto-marks picks taken/mine.
- **Corrected team ID / pick order** (a prior same-day session got this wrong — see log below for the full correction): Tayls' ESPN team ID is **16** ("Hits Different"), and she picks **9th overall**, matching the original Discord-sourced draft order. `index.html`'s default is now fixed to `16`. If ESPN Sync is on, the pick-order/slot setting doesn't matter for taken/mine — ESPN's `teamId` on each pick drives that directly.
- League: 20 teams, snake, PPR, private (`isPublic: false`, confirmed via live API 401 without cookies).

Season dashboard (standings/rosters/matchups) is not built yet — `api/league.js` proxy exists and is verified working, but there's no UI consuming it. Lower priority than the draft-day items above; revisit after the draft if still wanted.

---

## Log
<!-- newest first. one entry per logical task/session. -->

### 2026-08-25 · Claude chat (third session — correction + league data proxy)
- **Changed:** Two things, in order:
  1. **Corrected a factual error from the immediately prior session's HANDOFF entry.** That entry claimed Tayls' ESPN team ID is 17 and that team 17 picks 3rd overall. Pulled the live, cookie-authenticated league JSON directly (via a new `api/league.js` proxy — see below) and cross-checked `members[]` → `teams[]` → `draftSettings.pickOrder`: **team 16 ("Hits Different") is owned by Taylor Ritchie and picks 9th overall; team 17 ("Goldfish Bowl") is owned by a different league member, Brandon Sandler.** The earlier session's claim was wrong — likely a mixed-up team ID somewhere upstream. Fixed the hardcoded default in `index.html` from `teamId: 17` to `teamId: 16` and added an inline code comment documenting the correction and how it was verified, so it doesn't get silently reverted.
  2. **Added `api/league.js`**, a Vercel proxy (same CORS-workaround + cookie-auth pattern as `api/adp.js` and `api/draft.js`) that fetches full league data — teams, settings, schedule, and (for the current week only) full rosters — from ESPN's `mTeam`/`mRoster`/`mMatchup`/`mStandings`/`mSettings` views. Verified working end-to-end with real cookies: confirmed league name ("INSPIRED FANTASY FOOTBALL"), 20 teams, snake/PPR settings, and — critically — the real draft date: **`draftSettings.date` = Saturday, August 30, 2026**, with `draftDetail.drafted: false` confirming it hasn't happened yet.
  - No frontend was built to consume `api/league.js` yet (a season-long standings/roster/matchup dashboard) — the draft is 5 days out, so draft-day readiness took priority. The proxy is verified and ready whenever that's picked up.
- **Commit:** `19cd3ab`, `ccd79d0`, `2165e67`, `d269eab` (api/league.js, built iteratively while debugging the ESPN host/auth issues below), `8515d9f` (index.html teamId correction)
- **Next:** See DO NEXT above. Get the Vercel env vars set before draft day, then test ESPN Sync once the draft is live (or if ESPN exposes a queryable mock-draft/pre-draft state — untested).
- **Watch out:** While building `api/league.js`, found and fixed two things worth knowing for any future ESPN work: (1) `fantasy.espn.com` for the v3 API silently returns the generic marketing homepage (HTTP 200, not JSON) instead of an error — the real host is `lm-api-reads.fantasy.espn.com`, confirmed via web research and cross-checked against `api/draft.js`'s working implementation. (2) A public/unauthenticated fetch to this league returns a clean `401 AUTH_LEAGUE_NOT_VISIBLE` from ESPN itself — a real, trustworthy signal, not a proxy bug — confirming cookie auth is mandatory regardless of any league "visibility" setting in the UI.

### 2026-08-25 · Claude chat (second session — ESPN live draft sync)
- **Changed:** Built Phase 2 — live ESPN draft sync.
  - Confirmed the league (`1573934181`) is **private**; a direct unauthenticated fetch to ESPN's `mSettings` endpoint returned 401.
  - Got `espn_s2` and `SWID` cookies from Tayls (pulled from a logged-in browser session per ESPN's documented DevTools method) and verified them live against ESPN's `mDraftDetail` and `players` endpoints — both returned 200.
  - Added `api/draft.js`: a Vercel serverless function that reads `ESPN_S2`/`ESPN_SWID` from env vars (never exposed to the browser), fetches ESPN's `mDraftDetail` + `mSettings`, and for any picks made resolves player names via a **targeted** `x-fantasy-filter` lookup (only the drafted player IDs, not the full multi-thousand-player pool) so each poll stays fast.
  - Wired the frontend: new "ESPN Sync" toggle button in the header, League ID / Team ID fields in Settings (pre-filled), and a 5-second poll loop while sync is on. New picks are matched to the existing FFC/CSV player pool by normalized name+position and applied via a non-toggling setter (`applyEspnPick`) — ESPN is treated as the source of truth once sync is on, so a pick never un-applies itself on the next poll.
  - **This session's claim that team 17 = Tayls' team, picking 3rd overall, was incorrect** — corrected in the following session (see above). The `api/draft.js` code itself is unaffected by this error; only the `teamId` default used to interpret its output was wrong.
- **Commit:** `0368378` (api/draft.js added), `a777886` (index.html: ESPN sync UI + polling logic)
- **Next:** See DO NEXT above — set the two Vercel env vars, then test live once the draft starts.
- **Watch out:** The env vars are the only missing piece; the code path is otherwise fully wired and pushed. If `ESPN_S2`/`ESPN_SWID` are unset, `api/draft.js` returns a clear 500 with that exact message rather than failing silently. ESPN's cookies are known to occasionally expire/rotate — if sync starts returning 401, the fix is re-grabbing both values from a fresh logged-in browser session.

### 2026-08-25 · Claude chat (first session — CORS fix + Phase 1 verification)
- **Changed:** Closed out Phase 1 verification end to end, ahead of the season's draft.
  - Confirmed GitHub Pages was enabled and live at `https://thelittlestaskew.github.io/Fantasy-Football/`.
  - Opened the live app in-browser: all 9 self-tests passed in console (normalizePos, snake math, roundpick, CSV parse/dedupe, etc.).
  - **Found the FFC ADP fetch was permanently CORS-blocked**, not intermittently — Fantasy Football Calculator's API sends no `Access-Control-Allow-Origin` header, so no browser fetch to it will ever succeed from any origin. This wasn't a bug, it was the documented fallback (CSV import) working exactly as designed in the 2026-07-12 entry.
  - **Fixed it properly instead of relying on the CSV fallback**: added `api/adp.js`, a small Vercel serverless function that fetches FFC server-to-server (no CORS restriction between servers) and re-adds the CORS header for the browser. Linked this repo to Vercel (`taylor-ritchie's-projects` team, required installing the Vercel GitHub App first). Updated `index.html`'s `ADP_URL` to point at the deployed proxy instead of FFC directly.
  - Verified live in-browser after the fix: **270 players loaded, FFC ADP, dated 8/25/2026**, board fully populated top to bottom. No more CSV fallback panel on load.
  - Got the real 20-team draft order from Tayls and confirmed her seat: 9th (team "Hits Different") — later independently re-confirmed against the live ESPN API in the third session above, after a second session briefly introduced an incorrect contradiction.
- **Commit:** `829d984` (api/adp.js added), `ddf17e8` (index.html ADP_URL repointed to proxy)
- **Next:** See DO NEXT above.
- **Watch out:** The Vercel project (`fantasy-football`, under Tayls' `taylor-ritchie-s-projects` team) auto-deploys on every push to `main` — any future edits to `api/*.js` go live automatically, no separate deploy step needed.

### 2026-07-12 · Claude chat (Cowork)
- **Changed:** Phase 1 built: single-file War Room draft board (index.html) for a 20-team PPR snake draft. FFC ADP fetch + FantasyPros CSV import fallback, snake pick tracker with slot math, custom rank reordering, notes, My Team panel, localStorage persistence, dark theme. README added.
- **Commit:** manual web upload (connector 403 blocked API writes)
- **Next:** verify live app: console self-tests + whether FFC API allows browser fetch; then set league settings (teams/slot/rounds) once ESPN league fills.
- **Watch out:** FFC API returned empty bodies to server-side fetches; browser CORS behavior unverified. If it fails, the app opens the CSV import panel automatically. Phase 2 is ESPN integration via espn_s2 + SWID cookies.
