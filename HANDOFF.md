# HANDOFF — fantasy-football

## ▶ DO NEXT
Open the live page, check the browser console self-tests pass, and confirm the FFC ADP fetch works in-browser (CSV import is the fallback if it does not).
- Enable GitHub Pages first: Settings > Pages > Deploy from a branch > main / (root)
- Cowork's GitHub connector currently cannot write to this repo (403 on all writes, reads fine); initial files were uploaded via the GitHub web UI. Fix or use Claude Code locally before the next unit of work.

---

## Log
<!-- newest first. one entry per logical task/session. -->

### 2026-07-12 · Claude chat (Cowork)
- **Changed:** Phase 1 built: single-file War Room draft board (index.html) for a 20-team PPR snake draft. FFC ADP fetch + FantasyPros CSV import fallback, snake pick tracker with slot math, custom rank reordering, notes, My Team panel, localStorage persistence, dark theme. README added.
- **Commit:** manual web upload (connector 403 blocked API writes)
- **Next:** verify live app: console self-tests + whether FFC API allows browser fetch; then set league settings (teams/slot/rounds) once ESPN league fills.
- **Watch out:** FFC API returned empty bodies to server-side fetches; browser CORS behavior unverified. If it fails, the app opens the CSV import panel automatically. Phase 2 is ESPN integration via espn_s2 + SWID cookies.
