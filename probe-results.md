# Market Prices — Phase 0 Discovery Results

**Probe date**: 2026-04-05
**Scope**: IFAD Murban source + Platts candidates for LPG/Urea/Sulphur + free fallbacks

---

## 1. IFAD Murban — ICE Direct Endpoint [CONFIRMED WORKING]

**Source**: `theice.com` (public delayed market data, 15-min delay)
**Auth**: None required — just `User-Agent` + `Referer` headers.

### Endpoints

| Purpose | Endpoint |
|---|---|
| Forward curve + current front-month marketId | `GET https://www.ice.com/marketdata/api/productguide/charting/contract-data?productId=25864&hubId=27650` |
| Historical settlements (max 2 years) | `GET https://www.ice.com/marketdata/api/productguide/charting/data/historical?marketId=<ID>&historicalSpan=3` |
| Intraday bars (current day) | `GET https://www.ice.com/marketdata/api/productguide/charting/data/current-day?marketId=<ID>` |

### Key parameters

- **productId**: `25864` (Murban Crude Oil Futures)
- **hubId**: `27650` (ICE Futures Abu Dhabi)
- **historicalSpan**: `1`=3mo, `2`=1yr, `3`=2yr (max; 514 entries as of today)
- **marketId**: rotates over time — currently `7023336` (JUN26 front-month). MUST fetch contract-data first, pick entry with nearest non-expired `endDate` (or `isFrontMonth: true` equivalent).

### Response format

```json
// Forward curve
[
  {"marketStrip":"Jun26","marketId":7023336,"lastPrice":null,"change":0.0,"volume":0,"endDate":1782792000000},
  {"marketStrip":"Jul26","marketId":7049941,...},
  ... (13 monthly contracts)
]

// Historical
{
  "marketId": 7023336,
  "bars": [
    ["Mon Apr 08 00:00:00 2024", 75.54],
    ...
    ["Thu Apr 02 00:00:00 2026", 114.84]
  ]
}
```

Date format: `"Mon Apr 08 00:00:00 2024"` — parseable via `new Date(s)`.

### Sanity-checked data points (matches market narrative)

| Date | Price | Context |
|---|---|---|
| 2024-04-08 | $75.54 | 2yr start |
| 2025-04-07 | $62.93 | Normal levels |
| 2026-02-27 | $73.31 | Pre-conflict baseline |
| 2026-03-20 | $115.03 | Peak (ship attack wave) |
| 2026-04-02 | $114.84 | Current |

---

## 2. Platts Symbol Probe Results

**Subscription confirmed access via Okta PKCE** (`plattsconnect` scope). Probed 18 direct symbols + 10 keyword searches.

### SUBSCRIBED (usable for daily fetch)

| Symbol | Description | Unit | Frequency | Latest |
|---|---|---|---|---|
| `PMUDM00` | Propane FOB AG 20-40 days cargo | $/MT | Daily (weekdays) | $894.5 (2026-04-02) |
| `PMUDR00` | Butane FOB AG 20-40 days cargo | $/MT | Daily (weekdays) | $923.5 (2026-04-02) |
| `AMMOI00` | Ammonia FOB Middle East | $/MT | Daily (weekdays) | $650 (2026-04-02) |
| `PMABF00` | Propane FOB AG vs Saudi CP M1 (spread) | $/MT | Daily | $210 |
| `PTAAM10` | Propane FOB Saudi Arabia CP (monthly) | $/MT | Monthly contract | $750 |
| `PTAAF10` | Butane FOB Saudi Arabia CP (monthly) | $/MT | Monthly contract | $800 |
| `PMUDQ00` | Butane FOB AG 20-40 days MTD avg | $/MT | Daily | $919 |

**Recommended daily feeds to add to `fetch-platts-prices.js SYMBOLS`:**
- `PMUDM00` → key: `lpg_propane`
- `PMUDR00` → key: `lpg_butane`
- `AMMOI00` → key: `ammonia` (proxy for Urea since Urea is unsubscribed)

### NOT SUBSCRIBED (confirmed via multiple probes)

| Commodity | Queries tried | Result |
|---|---|---|
| **Urea** (granular / prilled) | "Urea", "Urea Middle East", "Urea Arab Gulf", "Urea FOB", direct symbols FUGAC00/FUGAD00/PUAAZ00/FUPAA00/FUPAB00 | 0 hits on any query — **not in this subscription** |
| **Sulphur** (any grade / region) | "Sulphur Granular", "Sulphur Qatar", direct symbols PSUAA00/FESMS00/AAPNS00/PSUAC00/FESMB00 | 0 real hits (only diesel-description matches for "Sulphur FOB") — **not in this subscription** |

---

## 3. Free Fallback Sources for Urea + Sulphur

### Urea — World Bank Pink Sheet [CONFIRMED WORKING]

**Endpoint**: `https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx`

- **Format**: Excel (.xlsx), ~780 KB, parseable via `xlsx` npm package (already installed)
- **Sheet**: `Monthly Prices`
- **Urea column**: `BI` (index 60), unit `$/mt`, monthly frequency
- **Date format**: `1960M01`, `1960M02`, ..., `2026M03`
- **Frequency**: Monthly (updated first week of each month)
- **License**: CC BY 4.0 (free for commercial use)
- **Auth**: None (just `User-Agent` header)

Verified data (last 6 months):

| Month | Urea $/mt |
|---|---|
| 2025-09 | 461.13 |
| 2025-10 | 394.40 |
| 2025-11 | 409.25 |
| 2025-12 | 392.50 |
| 2026-01 | 415.40 |
| 2026-02 | 472.00 |
| **2026-03** | **725.63** (massive spike — conflict-driven) |

Note: World Bank's series is a blended global index; for ADNOC-specific (Middle East FOB) it's directionally accurate but not the exact FOB ME assessment. This is a known limitation of free data.

### Sulphur — NO reliable free source found

**Attempted sources** (all failed or paid-only):
- IndexMundi: No sulphur category
- World Bank Pink Sheet: No sulphur column (only Phosphate rock, DAP, TSP, Urea, Potassium chloride)
- CME: Has Urea futures (UMEJ6) BUT automated scraping explicitly prohibited by ToS
- Argus Media, Intratec, IMARC, ChemAnalyst, BaseKim: all paid subscriptions
- TradingEconomics, Investing.com: Cloudflare-gated, against ToS

**Options for Sulphur** (user decides):

- **Option A — Claude weekly news scraper**: Pattern already proven by existing `sync-prices-awrp-prompt.md` for war risk premium %. Claude searches news articles (Argus free news, Splash247, HormuzTracker) for latest Sulphur FOB ME quotes, writes to `sulphur-history.json` weekly. Not daily, but authentic cited data.
- **Option B — Skip Sulphur in Phase 1**: Defer to Phase 2. Revisit if user obtains ICIS/Argus subscription.
- **Option C — Use Phosphate Rock or DAP as downstream proxy**: Both in World Bank Pink Sheet, both correlated with sulphur (sulphur is main feedstock for phosphoric acid → DAP). Not the same commodity but moves similarly.

**My recommendation**: **Option B (skip for now)**. Sulphur has no daily feed available free; mixing weekly news-scraped data with daily commodities on the same chart creates noise. Revisit when paid ICIS access becomes available.

---

## 4. Final Phase 1 Build Scope (adjusted from discovery)

| Commodity | Source | Frequency | Status |
|---|---|---|---|
| IFAD Murban (daily) | ICE direct API | Daily weekdays | ✓ ready to build |
| LPG Propane FOB AG | Platts PMUDM00 | Daily weekdays | ✓ add to existing Platts fetcher |
| LPG Butane FOB AG | Platts PMUDR00 | Daily weekdays | ✓ add to existing Platts fetcher |
| Ammonia FOB ME | Platts AMMOI00 | Daily weekdays | ✓ add to existing Platts fetcher |
| Urea global | World Bank Pink Sheet | Monthly | ✓ new Excel-based fetcher |
| **Sulphur** | — | — | ❌ **deferred** (no free source, see Option B) |

### Files to create in Phase 1

- `scripts/scrape-murban-ice.js` — fetches ICE contract-data + historical, writes `murban-history.json`
- `scripts/scrape-world-bank.js` — downloads Pink Sheet Excel, extracts Urea (+ potentially DAP, Phosphate Rock), writes `worldbank-commodities.json`
- Modifications to `scripts/fetch-platts-prices.js` — add PMUDM00, PMUDR00, AMMOI00 symbols; remove AAKNL00
- Frontend: LPG + Ammonia + Urea (monthly bars) sections in `market-prices.js`

### Files to create in Phase 0 (already done)

- `scripts/probe-platts-symbols.js` — direct symbol probe tool (kept for future use)
- `scripts/probe-platts-by-keyword.js` — keyword-based discovery tool (kept for future use)
- `platts-probe-report.json` — detailed probe results (18 symbols)
- `platts-keyword-probe.json` — keyword search results (10 queries, 167 hits)

---

## Open questions for user

1. **Sulphur**: Confirm Option B (skip) vs Option A (weekly Claude news scraper).
2. **Urea frequency**: Monthly bars acceptable on the chart alongside daily commodities? (Frontend can render them as distinct series with `spanGaps: true`.)
3. **Ammonia**: Show as independent commodity (has its own $/MT market) or label as "Urea Proxy"?
