// Scrapes GHSA.net's own published football scores and standings.
//
// WHY SCRAPING: there is no public API for Georgia high school football.
// GHSA.net publishes plain HTML tables (Drupal 7), which is the authoritative
// source and is scraped here directly. MaxPreps is deliberately NOT used —
// their terms prohibit it and they actively block automated access.
//
// FRAGILITY: this parses HTML, so a GHSA site redesign breaks it. It fails
// loudly with a clear error rather than returning wrong data. See HANDOFF.md.
//
// URL shapes (confirmed against the live site 2026-08-25):
//   https://www.ghsa.net/{YYYY}-ghsa-football-scores-{MMDDYYYY}   (weekly)
//   https://www.ghsa.net/{YYYY}-ghsa-football-standings           (current)
// Score pages contain one <table> per region: a header row with the region
// label (e.g. "5-AAAAA"), then rows of
//   [home, homeScore, away, awayScore, date]

const UA = 'Mozilla/5.0 (compatible; TaylsSportsBoard/1.0; personal use)';

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull every <table>…</table>, then every <tr>…</tr>, then cell text.
function parseTables(html) {
  const tables = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html)) !== null) {
    const rows = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tm[1])) !== null) {
      const cells = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cm;
      while ((cm = cellRe.exec(rm[1])) !== null) cells.push(stripTags(cm[1]));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

// A region label looks like "5-AAAAA", "6-A Division I", "7-AA".
const REGION_RE = /^\d+\s*-\s*A+(\s+Division\s+(I|II))?$/i;

function parseScorePage(html) {
  const out = [];
  for (const rows of parseTables(html)) {
    let region = null;
    for (const cells of rows) {
      const first = cells[0] || '';
      // Region header rows: single meaningful cell matching the pattern.
      if (REGION_RE.test(first) && cells.filter(Boolean).length <= 2) {
        region = first.replace(/\s*-\s*/, '-').toUpperCase();
        continue;
      }
      if (cells.length < 4) continue;
      const [a, as, b, bs, date] = cells;
      const aScore = parseInt(as, 10);
      const bScore = parseInt(bs, 10);
      if (!a || !b) continue;
      if (!Number.isInteger(aScore) || !Number.isInteger(bScore)) continue;
      out.push({
        region,
        home: a, homeScore: aScore,
        away: b, awayScore: bScore,
        date: date || null,
      });
    }
  }
  return out;
}

function parseStandingsPage(html) {
  const out = [];
  for (const rows of parseTables(html)) {
    let region = null;
    for (const cells of rows) {
      const first = cells[0] || '';
      if (REGION_RE.test(first) && cells.filter(Boolean).length <= 2) {
        region = first.replace(/\s*-\s*/, '-').toUpperCase();
        continue;
      }
      // Standings rows vary in column count between seasons; take the school
      // name plus whatever W-L-ish numbers follow, without over-assuming.
      if (!region || cells.length < 2) continue;
      const name = first;
      if (!name || REGION_RE.test(name)) continue;
      if (/^(school|team|region)$/i.test(name)) continue;
      const nums = cells.slice(1).filter(c => /^\d+$/.test(c)).map(Number);
      if (!nums.length) continue;
      out.push({ region, school: name, values: nums, raw: cells });
    }
  }
  return out;
}

// Most recent Fridays, newest first — GHSA posts one score page per game week.
function recentFridays(count) {
  const days = [];
  const d = new Date();
  // step back to the most recent Friday (5)
  while (d.getDay() !== 5) d.setDate(d.getDate() - 1);
  for (let i = 0; i < count; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() - 7);
  }
  return days;
}

const mmddyyyy = d =>
  String(d.getMonth() + 1).padStart(2, '0') +
  String(d.getDate()).padStart(2, '0') +
  d.getFullYear();

async function getHtml(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return null;
  return await r.text();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // HS scores update once a week; cache hard to be a good citizen to GHSA.
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const view = String(req.query.view || 'scores').toLowerCase();
  const yearParam = parseInt(req.query.year, 10);
  const now = new Date();
  // HS football season straddles Aug–Dec; before August, last season is meant.
  const year = Number.isInteger(yearParam) && yearParam > 2000
    ? yearParam
    : (now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear());

  try {
    if (view === 'standings') {
      const url = `https://www.ghsa.net/${year}-ghsa-football-standings`;
      const html = await getHtml(url);
      if (!html) {
        res.status(404).json({ error: `No GHSA standings page found for ${year}`, url });
        return;
      }
      const rows = parseStandingsPage(html);
      res.status(200).json({
        year, view: 'standings', source: url,
        count: rows.length,
        note: rows.length ? undefined
          : 'Page fetched but no standings rows parsed — GHSA may have changed its markup.',
        standings: rows,
      });
      return;
    }

    // scores: walk back through recent weeks until a page exists
    const tried = [];
    for (const d of recentFridays(6)) {
      const url = `https://www.ghsa.net/${year}-ghsa-football-scores-${mmddyyyy(d)}`;
      tried.push(url);
      const html = await getHtml(url);
      if (!html) continue;
      const games = parseScorePage(html);
      if (!games.length) continue;
      res.status(200).json({
        year, view: 'scores', source: url,
        week: d.toISOString().slice(0, 10),
        count: games.length,
        games,
      });
      return;
    }
    res.status(404).json({
      error: 'No GHSA score page with parsable games found in the last 6 weeks.',
      hint: 'Normal in the offseason. If it is in-season, GHSA may have changed its URL or markup.',
      tried,
    });
  } catch (err) {
    res.status(502).json({ error: err && err.message ? err.message : 'GHSA fetch failed' });
  }
}
