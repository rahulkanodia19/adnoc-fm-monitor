#!/usr/bin/env node
// ============================================================
// scripts/fetch-spr-sources.js -- Pre-fetches SPR reference pages
//
// Bypasses Claude's WebFetch tool (which runs an internal LLM pass per
// fetch, consuming turn budget and wall clock). Node curl returns raw
// HTML fast; tag-stripping leaves text for Claude to interpret via a
// single Read turn on soh-data/.spr-sources.json.
//
// Mirrors:
//   - scripts/scrape-murban-investing.js (curl + real browser headers)
//   - scripts/fetch-premium-sources.js (write JSON, non-fatal errors)
//
// URLs (probed 2026-04-05):
//   - iea.org/news                        -- IEA article list with dates
//   - energy.gov/newsroom                 -- DOE press releases
//   - energy.gov/hgeo/opr/strategic-petroleum-reserve -- DOE SPR landing
//   - eia.gov/petroleum/supply/weekly/    -- EIA release schedule + tables
//
// Output: soh-data/.spr-sources.json
// Usage: node scripts/fetch-spr-sources.js
// ============================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT_FILE = path.join(__dirname, '..', 'soh-data', '.spr-sources.json');

// Per-source skip offsets — each site has different nav chrome length.
// Tuned 2026-04-05 by inspecting tag-stripped output of each page:
//   - IEA news: article list begins ~char 5000 (heavy filter/nav chrome)
//   - DOE newsroom: content starts ~char 2500
//   - DOE SPR: "About the SPR" starts ~char 1500
//   - EIA weekly: "Data for week ending..." at ~char 5000
const SOURCES = [
  {
    key: 'iea_news',
    url: 'https://www.iea.org/news',
    skipMarker: 'Filter News',  // jump to after filter UI, article list follows
    skipNav: 7000,              // fallback if marker not found
    note: 'IEA news feed — recent article titles + dates (incl. oil-stocks collective action updates)'
  },
  {
    key: 'doe_newsroom',
    url: 'https://www.energy.gov/newsroom',
    skipMarker: 'Latest Press Releases',
    skipNav: 2500,
    note: 'DOE newsroom — SPR release announcements, exchange RFPs'
  },
  {
    key: 'doe_spr',
    url: 'https://www.energy.gov/hgeo/opr/strategic-petroleum-reserve',
    skipMarker: 'About the SPR',
    skipNav: 2500,
    note: 'DOE SPR landing page (canonical, post-redirect from /ceser/)'
  },
  {
    key: 'eia_weekly',
    url: 'https://www.eia.gov/petroleum/supply/weekly/',
    skipMarker: 'Weekly Petroleum Status Report Data for week ending',
    skipNav: 5000,
    note: 'EIA Weekly Petroleum Status Report index — release dates, table links'
  }
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const MAX_TIME_SEC = 30;
const KEEP_BODY_CHARS = 10000; // content window after per-source nav skip

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function fetchOne(source) {
  try {
    const html = execFileSync('curl', [
      '-sSL',
      '--max-time', String(MAX_TIME_SEC),
      '-H', `User-Agent: ${UA}`,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      source.url
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

    const text = stripHtml(html);
    // Prefer content marker (robust to page layout drift); fall back to fixed offset
    let skip = source.skipNav || 0;
    if (source.skipMarker) {
      const idx = text.indexOf(source.skipMarker);
      if (idx >= 0) skip = idx;
    }
    const body = text.slice(skip, skip + KEEP_BODY_CHARS);

    return {
      url: source.url,
      status: 'ok',
      note: source.note,
      totalTextLen: text.length,
      text: body
    };
  } catch (e) {
    return {
      url: source.url,
      status: 'error',
      note: source.note,
      error: (e.message || String(e)).slice(0, 200)
    };
  }
}

function main() {
  console.log('[spr-sources] Fetching ' + SOURCES.length + ' SPR reference pages...');
  const out = {
    fetchedAt: new Date().toISOString(),
    sources: {}
  };

  for (const src of SOURCES) {
    process.stdout.write('  ' + src.key + ' (' + src.url + ') ... ');
    const result = fetchOne(src);
    out.sources[src.key] = result;
    if (result.status === 'ok') {
      console.log('ok (' + result.text.length + ' chars of body, ' + result.totalTextLen + ' total)');
    } else {
      console.log('error: ' + result.error);
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

  const okCount = Object.values(out.sources).filter(s => s.status === 'ok').length;
  console.log('[spr-sources] Wrote ' + OUT_FILE + ' (' + okCount + '/' + SOURCES.length + ' ok)');

  // Exit non-zero only if ALL sources failed (partial success is acceptable)
  if (okCount === 0) {
    console.error('[spr-sources] ALL sources failed');
    process.exit(1);
  }
}

main();
