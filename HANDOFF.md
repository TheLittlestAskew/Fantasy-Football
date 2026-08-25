<![CDATA[# HANDOFF — fantasy-football

## ▶ DO NEXT
Phase 2 (ESPN live draft sync) is built and code-complete. **One manual step blocks it going live:**
- Add two env vars in Vercel dashboard → fantasy-football project → Settings → Environment Variables:
  - `ESPN_S2` = the espn_s2 cookie value (long string, no braces)
  - `ESPN_SWID` = the SWID cookie value, **including the curly braces** `{...}`
  - Then redeploy (or push any trivial commit) so the function picks them up.
- Once set, click **ESPN Sync: Off** in the app header to turn it on — it polls every 5s during the live draft and auto-marks picks taken/mine.
- League ID (`1573934181`) and Tayls' ESPN team ID (`17`) are pre-filled defaults in Settings; only need changing if she joins a different league next season.
- **Note on draft slot conflict:** the old Phase 1 entry said seat 9/20 — that was wrong/stale. ESPN's actual ownedpick order for this league has team 17 picking **3rd overall** (confirmed via `mSettings.draftSettings.pickOrder`). The FFC-only "Your slot" setting under Settings is a separate manual field from ESPN sync; if she's using ESPN sync, that field doesn't matter — ESPN pick data drives taken/mine directly, keyed by teamId, not by slot number.

---

## Log
<!-- newest first. one entry per logical task/session. -->

### 2026-08-25 · Claude chat (later session)
- **Changed:** Built Phase 2 — live ESPN draft sync.
  - Confirmed the league (`1573934181`) is **private**; a direct unauthenticated fetch to ESPN's `mSettings` endpoint returned 401.
  - Got `espn_s2` and `SWID` cookies from Tayls (pulled from a logged-in browser session per ESPN's documented DevTools method) and verified them live against ESPN's `mDraftDetail` and `players` endpoints — both returned 200.
  - Confirmed league settings via API: **20 teams, snake draft**, Tayls' ESPN team ID is **17**, and ESPN's own pick order has team 17 picking **3rd overall** (not 9th, contradicting the earlier FFC-board note — see DO NEXT).
  - Added `api/draft.js`: a Vercel serverless function that reads `ESPN_S2`/`ESPN_SWID` from env vars (never exposed to the browser), fetches ESPN's `mDraftDetail` + `mSettings`, and for any picks made resolves player names via a **targeted** `x-fantasy-filter` lookup (only the drafted player IDs, not the full multi-thousand-player pool) so each poll stays fast.
  - Wired the frontend: new "ESPN Sync" toggle button in the header, League ID / Team ID fields in Settings (pre-filled with this league's values), and a 5-second poll loop while sync is on. New picks are matched to the existing FFC/CSV player pool by normalized name+position and applied via a non-toggling setter (`applyEspnPick`) — ESPN is treated as the source of truth once sync is on, so a pick never un-applies itself on the next poll.
- **Commit:** `0368378` (api/draft.js added), `a777886` (index.html: ESPN sync UI + polling logic)
- **Next:** See DO NEXT above — set the two Vercel env vars, then test live once the ESPN draft starts (or ESPN's mock-draft/pre-draft state, if that's queryable — untested).
- **Watch out:** The env vars are the only missing piece; the code path is otherwise fully wired and pushed. If `ESPN_S2`/`ESPN_SWID` are unset, `api/draft.js` returns a clear 500 with that exact message rather than failing silently. ESPN's cookies are known to occasionally expire/rotate — if sync starts returning 401, the fix is re-grabbing both values from a fresh logged-in browser session (see `api/draft.js` error message, which says this explicitly).

### 2026-08-25 · Claude chat
- **Changed:** Closed out Phase 1 verification end to end, ahead of the season's draft.
  - Confirmed GitHub Pages was enabled and live at `https://thelittlestaskew.github.io/Fantasy-Football/`.
  - Opened the live app in-browser: all 9 self-tests passed in console (normalizePos, snake math, roundpick, CSV parse/dedupe, etc.).
  - **Found the FFC ADP fetch was permanently CORS-blocked**, not intermittently — Fantasy Football Calculator's API sends no `Access-Control-Allow-Origin` header, so no browser fetch to it will ever succeed from any origin. This wasn't a bug, it was the documented fallback (CSV import) working exactly as designed in the 2026-07-12 entry.
  - **Fixed it properly instead of relying on the CSV fallback**: added `api/adp.js`, a small Vercel serverless function that fetches FFC server-to-server (no CORS restriction between servers) and re-adds the CORS header for the browser. Linked this repo to Vercel (`taylor-ritchie's-projects` team, required installing the Vercel GitHub App first — one-time manual step). Updated `index.html`'s `ADP_URL` to point at the deployed proxy (`https://fantasy-football-taylor-ritchie-s-projects.vercel.app/api/adp`) instead of FFC directly.
  - Verified live in-browser after the fix: **270 players loaded, FFC ADP, dated 8/25/2026**, board fully populated top to bottom (Gibbs/Robinson/Nacua/Chase at the top, matching the proxy's raw JSON). No more CSV fallback panel on load.
  - Got the real 20-team draft order from Tayls and confirmed her seat: 9th (team "Hits Different"). Matches the app's existing 20-team/16-round defaults, so no settings changes needed there — just Your Slot = 9.
- **Commit:** `829d984` (api/adp.js added), `ddf17e8` (index.html ADP_URL repointed to proxy)
- **Next:** See DO NEXT above. Nothing blocking for draft day — Tayls just needs to set her slot to 9 in the app's Settings panel when ready.
- **Watch out:** The Vercel project (`fantasy-football`, under Tayls' `taylor-ritchie-s-projects` team) auto-deploys on every push to `main` in this repo — any future edits to `api/adp.js` go live automatically, no separate deploy step needed. The "Refresh ADP" button still exists in the UI and now correctly calls the proxy; it was never broken, only the underlying URL was pointed at the wrong (CORS-blocked) endpoint.

### 2026-07-12 · Claude chat (Cowork)
- **Changed:** Phase 1 built: single-file War Room draft board (index.html) for a 20-team PPR snake draft. FFC ADP fetch + FantasyPros CSV import fallback, snake pick tracker with slot math, custom rank reordering, notes, My Team panel, localStorage persistence, dark theme. README added.
- **Commit:** manual web upload (connector 403 blocked API writes)
- **Next:** verify live app: console self-tests + whether FFC API allows browser fetch; then set league settings (teams/slot/rounds) once ESPN league fills.
- **Watch out:** FFC API returned empty bodies to server-side fetches; browser CORS behavior unverified. If it fails, the app opens the CSV import panel automatically. Phase 2 is ESPN integration via espn_s2 + SWID cookies.
]]>