# War Risk Premium Data Sync — Strait of Hormuz AWRP (% Hull Value)

You are a marine insurance analyst updating the `WAR_RISK_PREMIUM_DATA` in `data.js` with the latest Strait of Hormuz war-risk insurance premium rates (% of hull value for 7-day policies).

---

## Step 1: Read current data

Read `data.js` — find the `WAR_RISK_PREMIUM_DATA` object near the end of the file (after `SPR_RELEASE_DATA`). Note:
- The current `lastUpdated` date
- The current `current.rate` value
- The last entry in the `history` array
- The `preConflictBaseline` value (should be 0.20)

---

## Step 2: Search for today's war risk premium rates

### Freshness enforcement (CRITICAL)

- Every search query MUST include the current month and year (e.g., "April 2026") to force recent results
- Only use data published within the last 48 hours
- Cross-reference across at least 2 sources before changing the rate
- If a search result doesn't have a clear publication date from the last 48 hours, SKIP it

### Tier 0 — Direct Data Fetches (WebFetch)

Before web searching, directly fetch these known data pages:

| URL | What it provides |
|-----|------------------|
| `https://hormuztracker.com` | War Risk Premiums section — real-time % hull value |
| `https://www.insurancejournal.com/news/international/` | Marine war risk premium updates |

Extract specific percentage numbers directly from page content before running any web searches.

### Tier 1 — Site-Specific Searches

| Source | Search query |
|--------|-------------|
| **Lloyd's List** | `site:lloydslist.com "war risk premium" Hormuz hull 2026` |
| **Insurance Journal** | `site:insurancejournal.com "war risk" Hormuz OR "Strait of Hormuz" premium hull 2026` |
| **Splash247** | `site:splash247.com Hormuz "war risk" premium insurance 2026` |
| **gCaptain** | `site:gcaptain.com "war risk" Hormuz insurance premium 2026` |
| **Hellenic Shipping News** | `site:hellenicshippingnews.com "war risk" Hormuz premium 2026` |
| **TradeWinds** | `site:tradewindsnews.com "war risk" Hormuz premium hull 2026` |

### Tier 2 — News Wires & Financial Press

| Source | Search query |
|--------|-------------|
| **Reuters** | `site:reuters.com "war risk premium" Hormuz hull insurance 2026` |
| **Bloomberg** | `site:bloomberg.com "war risk" Hormuz "hull value" insurance 2026` |
| **S&P Global** | `site:spglobal.com "war risk premium" Hormuz hull 2026` |
| **Financial Times** | `site:ft.com "war risk" Hormuz insurance premium 2026` |

### Tier 3 — Citation-Based Searches

- `"war risk premium" Hormuz "hull value" percent April 2026`
- `JWLA "Joint War" Hormuz premium rate April 2026`
- `P&I club "war risk" Strait Hormuz April 2026`
- `"additional premium" Hormuz transit insurance rate 2026`
- `"Strait of Hormuz" "war risk premium" "hull value" percentage April 2026`

### What to extract

- Current AWRP as % of hull value for a standard 7-day policy
- Distinguish base rate vs transit rate vs elevated nexus rate
- Any range (min/max) if available
- Source name for attribution

### Search execution order

1. **Tier 0** — direct data page fetches (2 URLs)
2. **Tier 1** — site-specific searches (6 queries)
3. **Tier 2** — news wires (4 queries) — only if Tier 1 didn't yield a clear rate
4. **Tier 3** — broad searches — only if Tiers 0-2 returned no new data

---

## Step 3: Update WAR_RISK_PREMIUM_DATA in data.js

### Fields to update

- `lastUpdated` → today's date (YYYY-MM-DD)
- `current.rate` → latest rate (% hull value, 7-day policy)
- `current.min` → lower bound if range found (keep existing if no range)
- `current.max` → upper bound if range found (keep existing if no range)
- `current.source` → attribution string

### Append to history

Add ONE new entry to the `history` array:
```javascript
{ date: "YYYY-MM-DD", rate: <number>, event: "<brief context>", source: "<source name>" }
```

### Rules

- Do NOT modify existing history entries — only append
- Do NOT modify any other part of `data.js` — ONLY touch `WAR_RISK_PREMIUM_DATA`
  - `COUNTRY_STATUS_DATA`, `FM_DECLARATIONS_DATA`, `SHUTDOWNS_NO_FM_DATA`, `SPR_RELEASE_DATA` are OFF LIMITS
- If no new rate found, keep previous rate, set event to "No update found"
- Rates can go up or down based on the insurance market
- The file uses `const` declarations (not exports)
- Preserve exact schema structure — do not add or remove fields

### Validation checklist

Before finishing, verify:
- [ ] `WAR_RISK_PREMIUM_DATA` still has all required fields (metric, unit, preConflictBaseline, current, history)
- [ ] `history` array is sorted by date ascending
- [ ] No duplicate dates in `history`
- [ ] `current.rate` matches the latest history entry's rate
- [ ] `lastUpdated` is today's date
- [ ] Rest of `data.js` is completely unchanged
- [ ] JavaScript syntax is valid (matched brackets/braces)
