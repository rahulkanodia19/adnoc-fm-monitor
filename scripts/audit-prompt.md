# Gulf Energy News Coverage Audit

You are auditing the ADNOC FM Monitor dashboard for **missed news coverage**.
Your job is to identify major stories published in the **last 48 hours** that are
NOT yet reflected in `data.js`, and propose specific fixes.

**Do NOT modify data.js.** Only write `coverage-gaps.json`.
**Do NOT commit or push anything.**

## Step 1: Read current state

Read `data.js` and note:
- Most recent event date per country (`COUNTRY_STATUS_DATA[i].events[0].date`)
- Most recent FM declaration date
- Most recent shutdown date
- Current `LAST_UPDATED` timestamp

## Step 2: Search the web (last 48 hours only)

Run WebSearch for recent Gulf energy / Middle East conflict headlines. Focus on:

1. **Oil/gas/LNG/petchem/refining disruptions** in the 9 tracked countries:
   Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel, Iran.
2. **Infrastructure attacks**: refineries, terminals, pipelines, nuclear plants,
   data centres, power/desal plants, aluminium smelters.
3. **Force majeure declarations** from energy/shipping/petrochemical companies.
4. **Hormuz shipping incidents**: tanker strikes, vessel diversions, transit tolls.
5. **Policy/market moves**: OPEC+ decisions, war risk premium changes, SPR releases,
   price actions >5% daily moves.

Source tiers to check:
- Tier 1: Bloomberg, Reuters, FT, WSJ, Al Jazeera, Kpler, S&P Platts, Rystad, Argus, ICIS.
- Tier 2: CNBC, The National, Arab News, Gulf News, gCaptain, OilPrice.com.
- Tier 3: Company press releases (ADNOC, Aramco, QatarEnergy, KPC, Bapco, NIOC).

Use queries like:
- `Gulf oil news [today's date]`
- `Hormuz tanker strike last 48 hours`
- `OPEC+ meeting [current month] 2026`
- `[country] refinery attack [current month] 2026`
- `petrochemical force majeure Gulf 2026`

## Step 3: Compare and identify gaps

For each major story found in Step 2:
- Check if it's already in `data.js` (by company name, date, facility name, or event title).
- If NOT present, record as a gap.

## Step 4: Write coverage-gaps.json

Structure:

```json
{
  "auditTimestamp": "<ISO timestamp of when this audit ran>",
  "dataJsLastUpdated": "<LAST_UPDATED value from data.js>",
  "gaps": [
    {
      "gap": "<one-line description of what's missing>",
      "severity": "high|medium|low",
      "fix": {
        "country": "<country id, e.g. uae>",
        "action": "add_event|add_fm|add_shutdown|update_infra_status|update_notes",
        "data": {
          "date": "<YYYY-MM-DD>",
          "title": "<proposed event title>",
          "description": "<proposed event description>",
          "assetImpact": ["<asset name matching infrastructure[].name>"]
        }
      },
      "source": {
        "url": "<source URL>",
        "title": "<source title>",
        "publishedAt": "<YYYY-MM-DD>"
      }
    }
  ],
  "summary": {
    "gapsFound": <number>,
    "queriesRun": <number>,
    "sourcesChecked": ["<list of sources surveyed>"],
    "timeWindow": "last 48 hours"
  }
}
```

Severity guide:
- `high`: major disruption (FM declaration, refinery/LNG shutdown, tanker strike, >100k bpd impact)
- `medium`: status update (partial resumption, volume revision, pipeline status)
- `low`: context/background (policy statement, analyst commentary, minor price move)

## Step 5: Print summary to console

After writing the file, print:
```
[audit] Found N gaps (X high, Y medium, Z low) — see coverage-gaps.json
[audit] Top 3 high-severity gaps:
  1. <gap summary>
  2. <gap summary>
  3. <gap summary>
```

## Important constraints

- If you find NO gaps, still write `coverage-gaps.json` with `"gaps": []`.
- Every gap MUST have a source URL you can verify (no fabrication).
- Every `assetImpact` name in a proposed fix MUST match an existing `infrastructure[].name`
  in that country's entry (or explicitly suggest adding the asset first).
- Do NOT propose fixes for events already in data.js. Re-read the country's events
  array before flagging a gap.
- Do NOT write to data.js. Do NOT commit or push.
- Finish in under 30 turns.
