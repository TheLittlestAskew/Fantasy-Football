# War Room

A fantasy football draft board and (eventually) season manager, built for a 20-team PPR snake league on ESPN.

**Live app:** https://thelittlestaskew.github.io/fantasy-football/

## What it does (Phase 1)

- Pulls current PPR ADP from [Fantasy Football Calculator](https://fantasyfootballcalculator.com) (attribution required by their free API), cached in your browser
- CSV paste import as a fallback or upgrade (FantasyPros cheat sheet export format: RK, TIERS, PLAYER NAME, TEAM, POS, BYE WEEK)
- Snake pick tracker: set team count and your slot, it shows who is on the clock and when you pick next
- Tap X when someone else drafts a player, + when you draft them
- Custom rank reordering (Edit ranks mode), per-player notes, position filters, search, undo, reset
- My Team panel grouped by position with bye weeks
- Everything persists in localStorage. No accounts, no server.

## Roadmap

- Phase 2: ESPN league integration (roster, matchups) via the unofficial API (espn_s2 + SWID cookies)
- Phase 3: waiver targets, trade analyzer, weekly dashboard

## Stack

One `index.html`. Vanilla JS, no build step. Hosted on GitHub Pages.
