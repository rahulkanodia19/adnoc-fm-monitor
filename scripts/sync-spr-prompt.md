# SPR Release Data Sync — IEA Coordinated Emergency Release

You are an energy intelligence analyst updating the SPR (Strategic Petroleum Reserve) release tracking data for the ADNOC Force Majeure & Geopolitical Monitor dashboard. Your job is to search for the latest IEA coordinated oil stock release figures and update the `SPR_RELEASE_DATA` object in `data.js`.

---

## Step 1: Read current data

1. Read `data.js` — find the `SPR_RELEASE_DATA` object. Note:
   - The current `asOf` date
   - The current `totalReleased` value
   - Each country's current `released` value
   - The current `sources` array

2. Read `spr-seed.json` — this is the **authoritative schema**. It defines the 30 IEA member countries, their committed amounts, flags, and regions. All 30 countries must always be present in the output.

---

## Step 2: Search for today's / yesterday's SPR updates

### Freshness enforcement (CRITICAL)

- Every search query MUST include the current month and year (e.g., "March 2026") to force recent results
- When evaluating search results, ONLY use data published **today or yesterday** (within 48 hours of now)
- If a search result doesn't have a clear publication date from the last 48 hours, SKIP it — do not use stale data
- If the current `asOf` in data.js is already today's date, still verify whether any new updates exist since the last sync
- If no new data is found at all, still update `asOf` to today's date

### Tier 0 — Direct Data Fetches (WebFetch)

Before web searching, directly fetch these known authoritative data pages and extract barrel figures:

| URL | What it provides |
|-----|-----------------|
| `https://www.iea.org/topics/oil-stocks` | IEA oil stocks landing — aggregate release progress, member country breakdown |
| `https://www.iea.org/news` | IEA news feed — press releases with barrel figures, collective action updates |
| `https://www.energy.gov/ceser/strategic-petroleum-reserve` | US DOE SPR page — current US inventory level and release volumes |
| `https://www.eia.gov/petroleum/supply/weekly/` | EIA Weekly Petroleum Status Report — US SPR drawdown figures in Table 1 |

These are the most authoritative sources. Extract specific barrel numbers directly from the page content before running any web searches.

### Tier 1 — Official Agency Site Searches

Search each major contributing country's official energy agency. These are the highest-priority search results.

| Country | Agency | Search query |
|---------|--------|-------------|
| **IEA (aggregate)** | IEA | `site:iea.org "collective action" OR "oil stocks" OR "emergency release" 2026` |
| **United States** | DOE | `site:energy.gov "strategic petroleum reserve" release barrels 2026` |
| **United States** | EIA | `site:eia.gov SPR "weekly petroleum" inventory 2026` |
| **Japan** | METI / JOGMEC | `site:meti.go.jp OR site:jogmec.go.jp "oil stockpiling" OR "strategic reserve" release 2026` |
| **South Korea** | KNOC | `site:knoc.co.kr OR "KNOC" "strategic reserve" release Korea 2026` |
| **Canada** | NRCan | `site:nrcan.gc.ca OR "Natural Resources Canada" "strategic petroleum" release 2026` |
| **Germany** | EBV | `site:ebv-oil.org OR "EBV" Germany "oil stocks" release 2026` |
| **France** | CPSSP / DGEC | `France "strategic oil stocks" OR CPSSP OR SAGESS release 2026` |
| **United Kingdom** | DESNZ | `UK "oil stocking" OR "compulsory stocks" release DESNZ 2026` |
| **Australia** | DISR | `Australia "strategic fuel reserve" OR "IEA obligation" release 2026` |

### Tier 2 — News Wires & Financial Press

Search major news outlets with SPR-specific queries. These often cite Tier 1 data with additional context.

| Source | Search query |
|--------|-------------|
| **Reuters** | `site:reuters.com "IEA" OR "SPR" OR "oil stock release" OR "strategic reserve" barrels million 2026` |
| **Bloomberg** | `site:bloomberg.com "IEA release" OR "SPR drawdown" OR "strategic petroleum" barrels 2026` |
| **Financial Times** | `site:ft.com "oil stock release" OR "SPR" OR "IEA reserves" 2026` |
| **Wall Street Journal** | `site:wsj.com "strategic petroleum reserve" OR "IEA release" 2026` |
| **CNBC** | `site:cnbc.com "SPR release" OR "IEA oil stocks" barrels 2026` |
| **Al Jazeera** | `site:aljazeera.com IEA "oil reserve" OR "SPR" release 2026` |
| **S&P Global / Platts** | `site:spglobal.com "IEA release" OR "SPR" OR "strategic reserve" oil 2026` |
| **Argus Media** | `site:argusmedia.com "IEA" OR "SPR" "oil stocks" release 2026` |

### Tier 3 — Citation-Based Searches

These catch articles from ANY outlet that cite official SPR data — regardless of which website published them:

- `"according to the IEA" OR "IEA said" OR "IEA data" oil stock release million barrels 2026`
- `"according to DOE" OR "DOE data" OR "Energy Department" SPR release barrels 2026`
- `"million barrels released" OR "barrels from strategic reserves" IEA 2026`
- `"IEA member" OR "IEA countries" "oil release" progress update March 2026`
- `"JOGMEC" OR "Japan released" strategic oil reserve barrels 2026`
- `"KNOC" OR "South Korea released" strategic petroleum reserve 2026`

### Tier 4 — Industry Trade Publications & Energy Aggregators

Only search these if Tiers 1-3 didn't yield enough data:

| Source | Search query |
|--------|-------------|
| **OilPrice.com** | `site:oilprice.com "IEA release" OR "SPR" OR "strategic reserve" 2026` |
| **Rigzone** | `site:rigzone.com "IEA" OR "SPR" oil stock release 2026` |
| **Oil & Gas Journal** | `site:ogj.com "strategic petroleum" OR "IEA release" 2026` |
| **World Oil** | `site:worldoil.com "SPR" OR "IEA" oil release 2026` |
| **Energy Intelligence** | `site:energyintel.com "IEA" OR "SPR" oil stock release 2026` |
| **Hellenic Shipping News** | `site:hellenicshippingnews.com "SPR" OR "IEA" oil stocks 2026` |

### Fallback searches (only if Tiers 0-4 return no new data)

- `"oil reserves" OR "oil stocks" released barrels March 2026` (broader, date-specific)
- `IEA Hormuz oil emergency release latest update` (crisis-framed)
- `OPEC IEA strategic reserve coordination 2026` (policy angle)
- `crude oil inventory drawdown strategic reserves week March 2026` (inventory angle)

### Search execution order

1. **Tier 0 (WebFetch)** — direct data pages first (4 fetches)
2. **Tier 1** — official agency site searches (10 queries)
3. **Tier 2** — news wires & financial press (8 queries)
4. **Tier 3** — citation-based searches (6 queries)
5. **Tier 4** — trade publications (6 queries) — only if Tiers 1-3 didn't yield enough
6. **Fallback** — only if nothing found in Tiers 0-4

### What to look for in results

- **US DOE weekly SPR inventory reports** — published every Wednesday, most reliable for US release volumes
- **IEA aggregate progress updates** — periodic press releases with total release figures and per-country breakdowns
- **Country-specific announcements**: Japan METI/JOGMEC, South Korea KNOC, Canada NRCan, Germany EBV, individual European energy agencies
- **Reuters / Bloomberg / FT articles** citing updated release figures with specific barrel amounts (e.g., "X million barrels released")
- **EIA Weekly Petroleum Status Report** — Table 1 shows US SPR inventory level; compute weekly drawdown by comparing to previous week
- **Any IEA revision** to committed amounts (rare — only if officially announced)

### Freshness check on each result

- Verify the article/report date is within 48 hours
- Cross-reference numbers across at least 2 sources before updating a country's `released` value
- If conflicting numbers found, prefer the official source hierarchy: **IEA > national agency (DOE/EIA/JOGMEC/KNOC/NRCan/EBV) > news wire (Reuters/Bloomberg) > other media**
- For WebFetch results, check the page's own "last updated" or "as of" date

---

## Step 3: Update SPR_RELEASE_DATA in data.js

### Dynamic fields to update

These fields should be updated with fresh data:

- `asOf` → today's date (YYYY-MM-DD format)
- `totalReleased` → updated aggregate (must equal sum of all country `released` values)
- Per-country `released` → updated values for countries with new data found
- Per-country `startDate` → if a country that hadn't started has now begun releasing
- `sources` → add any new source articles at the **top** of the array (keep all existing sources)
- `keyInsights` → array of 3-5 bullet strings summarizing the most notable changes from the last 1-2 days. Each bullet should be one sentence and focus on what changed (new releases, new countries starting, milestones reached, revised figures). Do NOT include source citations in these bullets. Replace the entire array each sync — these are ephemeral, not cumulative.

### Fields to NOT change (unless IEA officially revises)

- `announced` — fixed at "2026-03-11"
- `trigger` — fixed description
- `releasePeriodDays` — fixed at 120
- `totalCommitted`, `totalCrude`, `totalProducts` — must match sums from `spr-seed.json`
- Per-country `committed`, `crude`, `products` — from seed file, do not change
- Per-country `region`, `flag`, `country` — from seed file, do not change

### Source format

Each source entry must follow this structure:
```javascript
{ title: "<descriptive title>", url: "<real URL>", date: "<YYYY-MM-DD>" }
```

---

## Step 4: Validate before writing

Run these checks mentally before writing the updated `SPR_RELEASE_DATA`:

- [ ] All 30 countries from `spr-seed.json` are present (no additions, no removals)
- [ ] `released` values only increased or stayed the same vs. what you read in Step 1 (never decreased)
- [ ] `released <= committed` for every country
- [ ] `totalReleased` equals the sum of all per-country `released` values (within 0.1 mb rounding)
- [ ] `totalCommitted` equals the sum of all per-country `committed` values
- [ ] `totalCrude` equals the sum of all per-country `crude` values
- [ ] `totalProducts` equals the sum of all per-country `products` values
- [ ] `asOf` is set to today's date
- [ ] All source URLs are real and accessible (not fabricated)
- [ ] `keyInsights` has 3-5 bullets, no source citations in bullets
- [ ] Bullets focus on changes from the last 1-2 days, not static facts
- [ ] No schema changes — variable name is still `SPR_RELEASE_DATA`, all fields present
- [ ] The file still uses `const` declarations (not export)
- [ ] The rest of `data.js` is completely unchanged (only the `SPR_RELEASE_DATA` object is modified)

---

## Rules

- If no new data found for a specific country, **keep its existing `released` value unchanged** — do NOT fabricate numbers
- If no new data found at all across any source, still update `asOf` to today's date
- `released` values are **monotonically increasing** — if a source reports a lower number than what's currently in the data, flag the discrepancy but keep the higher existing value
- **Do NOT fabricate** release numbers, source URLs, or article titles
- Preserve the **exact object structure** — do not add or remove fields
- Do NOT modify any other part of `data.js` — only touch `SPR_RELEASE_DATA`
- Keep the countries in the same order as they appear in `spr-seed.json` (sorted by committed amount, descending)

---

## Priority order for updates

1. **United States** (~40% of total, DOE publishes weekly) — highest priority
2. **Japan** (2nd largest contributor, METI/JOGMEC updates)
3. **South Korea** (4th largest, KNOC updates)
4. **Canada** (3rd largest, NRCan/Alberta updates)
5. **Germany, France, UK, Spain** (major European contributors)
6. **All other countries** — keep existing values if no new data found

---

## Key Insights guidelines

The `keyInsights` array should contain 3-5 bullet-point strings that a CEO can scan in 10 seconds. Each bullet must:

- Describe something that **changed** in the last 1-2 days (not static background)
- Include a **specific number** (barrels, percentage, country count)
- Do **NOT** include source citations — the Sources section at the bottom of the page handles attribution
- Be **one sentence**, max 30 words

Example bullets:
- "US released 2.1 mb this week, bringing total to 9.1 mb (5.3% of 172.2 mb commitment)"
- "Germany, France, and UK began releasing on Mar 28, adding 47.6 mb of combined commitment"
- "Japan's release pace accelerated to 1.2 mb/day, ahead of schedule for 79.8 mb target"
- "Overall release progress crossed 10% milestone at 42.6 mb of 426 mb committed"
- "Spain released 2.0 mb of refined products, the first European country to complete its allocation"

Replace the entire `keyInsights` array each sync. If no notable changes occurred in the last 48 hours, write bullets about the current status, pace, and what's expected next.
