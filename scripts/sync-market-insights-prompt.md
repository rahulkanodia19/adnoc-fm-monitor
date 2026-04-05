# Market Insights Generator

You are a commodity market analyst producing structured insights for an Oil & Gas intelligence dashboard tracking the Middle East conflict crisis. Each insight should tie a price move to a real market event whenever possible.

---

## Step 1: Read input files

1. **`market-prices-seed.json`** — 13+ commodities with `current`, `previousClose`, `history: [{date, price}]`
2. **`murban-history.json`** — Murban front-month series (Investing.com IFAD continuation) — **authoritative source for Murban**, overrides seed's murban entry
3. **`data.js`** — extract and inspect the following context data structures:
   - `WAR_RISK_PREMIUM_DATA.history` — daily AWRP % hull value rates with `event` field per entry
   - `FM_DECLARATIONS_DATA` — recent force majeure declarations with `date`, `company`, `field`, `summary`, `sources`
   - `SHUTDOWNS_NO_FM_DATA` — precautionary facility shutdowns with same shape
   - `SPR_RELEASE_DATA` — strategic petroleum reserve activity (IEA coordinated action)
   - `COUNTRY_STATUS_DATA` — production status changes per country (status escalations)

Filter all event data to the **last 14 days** relative to the latest price date.

---

## Step 2: Compute metrics per commodity

For each commodity (brent, wti, gasoline, jetfuel, gasoil, lng, lng_nwe, ttf, henry_hub, awrp, lpg_propane, lpg_butane, ammonia) plus Murban from murban-history.json:

- **1-day change** (absolute + %): `current - history[-2].price` (vs previous trading day)
- **5-day change** (%): `(current / history[-6].price - 1) * 100`
- **20-day mean** and **stdev** of daily returns
- **Z-score** of today's return: `(today_return - mean_20d) / stdev_20d`
- **52W high/low breach**: `current >= high52w` or `current <= low52w`
- **Distance from 52W high**: `(current / high52w - 1) * 100`

Spreads to compute:
- **Product cracks vs Murban** (today + 5-day Δ): gasoline-murban, jetfuel-murban, gasoil-murban
- **Brent-Murban** spread
- **JKM-NWE** LNG spread
- **Propane-Butane** spread

---

## Step 3: Associate price moves with events (from data.js)

For each candidate insight, attempt to find a **triggering event within ±2 days** of the price move date. Matching logic:

- Large move in **Brent/WTI/Murban/Gasoline/Jet/Gasoil** → look for recent FM_DECLARATIONS_DATA, SHUTDOWNS_NO_FM_DATA entries affecting UAE/Saudi/Iraq/Iran/Kuwait
- **AWRP change** → look for matching `event` field in WAR_RISK_PREMIUM_DATA.history
- **Refinery-product cracks widening** → look for refinery/terminal shutdowns
- **LNG moves** → look for LNG Plant status changes in COUNTRY_STATUS_DATA
- **Ammonia/LPG moves** → look for petchem/gas plant shutdowns

If no data.js event matches, **optionally do ≤2 WebSearch calls** for breaking news context (e.g., "OPEC+ decision April 2026", "Murban OSP announcement"). Each insight can have AT MOST one related_event.

---

## Step 4: Rank & select 3–5 insights

Prefer in order:
1. **High-severity events**: |z-score| > 2, 52W high/low breaches, single-day moves > 5%
2. **Conflict-relevant signals**: AWRP changes, Gulf-origin commodity moves, crack blowouts
3. **Structural shifts**: spread regime changes, correlation breaks

Avoid redundancy: group correlated crude moves ("crude complex") as one insight.

---

## Step 5: Write `market-insights.json`

Strict schema:

```json
{
  "generated_at": "<ISO-8601 UTC timestamp>",
  "model": "claude-opus-4.6",
  "asOfDate": "<YYYY-MM-DD>",
  "insights": [
    {
      "type": "top_mover | spread | cross | anomaly | trend | correlation_break",
      "severity": "info | bullish | bearish | warning",
      "title": "<=100 char headline>",
      "detail": "<=180 char context sentence>",
      "metrics": [
        {"label": "<=20 chars", "value": "<=30 chars, formatted with unit>"}
      ],
      "related_event": {
        "type": "fm | shutdown | awrp | spr | news",
        "date": "<YYYY-MM-DD>",
        "summary": "<=100 char event summary>",
        "source_url": "<optional URL>"
      }
    }
  ]
}
```

### Field rules
- `type`: one of 6 enum values
- `severity`: one of 4 enum values (`info`, `bullish`, `bearish`, `warning`)
- `title`: ≤100 chars
- `detail`: ≤180 chars
- `metrics`: 1–4 items, label ≤20 chars, value ≤30 chars, values formatted with units (`$114.84/bbl`, `+3.2%`)
- `related_event`: **optional** (omit field entirely if no event found). If present:
  - `type` one of `fm`, `shutdown`, `awrp`, `spr`, `news`
  - `date` in `YYYY-MM-DD`
  - `summary` ≤100 chars
  - `source_url` optional
- `asOfDate`: most recent date across all input sources

### Severity semantics
- `info` — neutral observation
- `bullish` — price rising, supply-tight, demand-strong
- `bearish` — price falling, supply-loose, demand-weak
- `warning` — abnormal/anomalous (spread blowout, AWRP spike, correlation break)

---

## Step 6: Self-validate before writing

- [ ] JSON parses via `JSON.parse()`
- [ ] 3–5 insights present
- [ ] All `type` + `severity` values in allowed enums
- [ ] `title` ≤100 chars, `detail` ≤180 chars, `metrics.value` formatted with units
- [ ] Each commodity referenced exists in inputs
- [ ] `related_event` fields (where present) cite real events from data.js or verified news

Write to `C:/Users/rahul/Documents/adnoc-fm-monitor/market-insights.json`. After writing, read it back to confirm valid JSON.

---

## Example (illustrative only)

```json
{
  "generated_at": "2026-04-05T12:00:00Z",
  "model": "claude-opus-4.6",
  "asOfDate": "2026-04-02",
  "insights": [
    {
      "type": "top_mover",
      "severity": "bullish",
      "title": "Murban +$11.92 (+11.6%) extends crisis rally",
      "detail": "Front-month settles at $114.84/bbl, recovering from $102.92 after 3-week slide; still 22% below $146.40 Mar-20 peak.",
      "metrics": [
        {"label": "Murban", "value": "$114.84/bbl"},
        {"label": "1-day", "value": "+11.6%"},
        {"label": "vs peak", "value": "-21.5%"}
      ],
      "related_event": {
        "type": "awrp",
        "date": "2026-04-02",
        "summary": "AWRP steady 5%; Lloyd's reports double-digit million-$/trip; Apr 6 deadline uncertainty",
        "source_url": "https://www.insurancejournal.com"
      }
    },
    {
      "type": "spread",
      "severity": "warning",
      "title": "Gasoil-Murban crack stays at $170/bbl on refining squeeze",
      "detail": "Middle distillate premium over crude persists 3+ weeks post-conflict; reflects regional refinery outages and rerouting.",
      "metrics": [
        {"label": "Gasoil", "value": "$284.97/bbl"},
        {"label": "Crack", "value": "+$170.13/bbl"}
      ],
      "related_event": {
        "type": "shutdown",
        "date": "2026-03-28",
        "summary": "Fujairah terminal partial closure; loading suspended after drone attack",
        "source_url": ""
      }
    }
  ]
}
```
