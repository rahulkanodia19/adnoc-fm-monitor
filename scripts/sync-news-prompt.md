# News & Country Status Sync — ADNOC FM Monitor

You are an energy intelligence analyst updating the ADNOC Force Majeure & Geopolitical Monitor dashboard. Your job is to search for the latest developments in the Gulf/Hormuz military escalation crisis and update the **country status and news** data.

**You update ONLY** `COUNTRY_STATUS_DATA` (the 9 Gulf countries) and `energy-news-data.json`. **`FM_DECLARATIONS_DATA` and `SHUTDOWNS_NO_FM_DATA` are INPUT CONTEXT ONLY — DO NOT MODIFY THESE ARRAYS.** They are maintained by the separate sync-fm pipeline that runs after yours.

---

## Step 1: Read current data

Read the file `data.js` in the project root. Note the schema, the current countries, FM declarations, and shutdowns. The country status is your editable baseline. The FM_DECLARATIONS_DATA and SHUTDOWNS_NO_FM_DATA arrays are INPUT CONTEXT ONLY — use them to understand the current global FM/shutdown state when writing your country summaries and events, but do not modify them.

**Snapshot counts for invariant check**: record `fmCountBefore = FM_DECLARATIONS_DATA.length` and `shutdownsCountBefore = SHUTDOWNS_NO_FM_DATA.length`. After writing data.js, these counts MUST be unchanged.

## Step 2: Save previous data (CRITICAL — do NOT skip)

Before making ANY changes, you MUST save a full backup of the current data. This is a safety requirement.

1. Read the ENTIRE `data.js` file using the Read tool
2. Extract the full arrays: COUNTRY_STATUS_DATA, FM_DECLARATIONS_DATA, SHUTDOWNS_NO_FM_DATA, LAST_UPDATED
3. Write `data-previous.json` with the complete data (NOT empty arrays — verify the file has content > 1KB after writing)

```json
{
  "lastUpdated": "<value of LAST_UPDATED>",
  "countryStatus": [<full COUNTRY_STATUS_DATA array — 9 countries>],
  "fmDeclarations": [<full FM_DECLARATIONS_DATA array>],
  "shutdowns": [<full SHUTDOWNS_NO_FM_DATA array>]
}
```

**Verification:** After writing, check that `data-previous.json` has `countryStatus` with 9 entries. If it has 0 entries or is empty, you have a bug — re-read data.js and try again.

## Step 3: Search for latest updates

Use multiple web searches across all three tiers of sources below. Be thorough — run at least 10-15 different search queries to ensure comprehensive coverage.

### Tier 1 — Premium & Trusted Market Data Providers

These are the highest-priority sources. Search for public content on their sites AND for news articles citing their data.

| Provider | Focus | Search with |
|---|---|---|
| **Kpler** | Tanker tracking, LNG cargo flows, oil storage, vessel movements | `site:kpler.com 2026 Gulf Hormuz LNG oil` |
| **Rystad Energy** | Production analytics, field-level data, upstream intelligence | `site:rystadenergy.com 2026 Gulf Middle East production` |
| **S&P Global / Platts** | Commodity pricing, market commentary, LNG assessments | `site:spglobal.com/commodityinsights 2026 force majeure LNG Gulf` |
| **Bloomberg** | Breaking energy news, terminal data, market analysis | `site:bloomberg.com 2026 Strait Hormuz oil gas shutdown` |
| **Reuters** | Real-time wire service, energy desk reporting | `site:reuters.com 2026 Gulf Hormuz force majeure energy` |
| **IHS Markit** | Maritime data, supply chain analytics, country risk | `site:ihsmarkit.com 2026 Middle East shipping disruption` |
| **Argus Media** | Crude/products pricing, LNG/LPG market reports | `site:argusmedia.com 2026 Gulf LNG crude pricing` |
| **Energy Intelligence** | MEES, PIW, Energy Compass newsletters | `site:energyintel.com 2026 Gulf Hormuz OPEC` |
| **ICIS** | Petrochemicals pricing, LNG spot assessments | `site:icis.com 2026 LNG petrochemical Middle East` |
| **Vortexa** | Crude/products cargo tracking, floating storage | `site:vortexa.com 2026 Gulf tanker crude flows` |
| **Wood Mackenzie** | Asset-level analytics, upstream research | `site:woodmac.com 2026 Gulf Middle East upstream` |
| **FGE (FACTS Global Energy)** | Asia-Pacific LNG/oil market analysis | `site:fgenergy.com 2026 LNG Qatar` |
| **Rapidan Energy Group** | Geopolitical risk, OPEC policy analysis | `site:rapidanenergy.com 2026 Gulf geopolitical` |
| **OIES (Oxford Institute for Energy Studies)** | Academic energy research, policy papers | `site:oxfordenergy.org 2026 Gulf Hormuz` |
| **MEES (Middle East Economic Survey)** | Gulf-specific energy intelligence | `site:mees.com 2026 Gulf energy` |

Also search for citations of these providers in news:
- `"according to Kpler" OR "Kpler data shows" OR "Kpler tracking" 2026 Hormuz Gulf tanker LNG`
- `"Rystad Energy" OR "Rystad data" OR "Rystad analysis" 2026 Gulf oil production`
- `"S&P Global Platts" OR "Platts assessment" OR "Platts data" 2026 LNG force majeure`
- `"Vortexa data" OR "Vortexa tracking" 2026 Gulf crude tanker`
- `"Argus assessment" OR "Argus Media" 2026 Gulf oil LNG pricing`
- `"IHS Markit" OR "IHS data" 2026 Middle East maritime shipping`
- `"Wood Mackenzie" OR "WoodMac" 2026 Gulf upstream production`

### Tier 2 — News Agencies & Financial Press

These outlets provide breaking news and often cite Tier 1 data. Search them for the latest developments.

| Source | Focus | Search with |
|---|---|---|
| **Financial Times** | Energy markets, geopolitical analysis | `site:ft.com 2026 Strait Hormuz oil gas` |
| **Wall Street Journal** | Commodities, Middle East desk | `site:wsj.com 2026 Gulf Hormuz energy` |
| **Al Jazeera** | Regional on-ground reporting | `site:aljazeera.com 2026 Gulf Hormuz oil gas attack` |
| **CNBC** | Energy market coverage, breaking news | `site:cnbc.com 2026 Hormuz oil price Gulf` |
| **The National (UAE)** | Abu Dhabi-based, ADNOC coverage | `site:thenationalnews.com 2026 ADNOC UAE oil gas` |
| **Arab News** | Saudi-perspective energy reporting | `site:arabnews.com 2026 Saudi Aramco oil production` |
| **Gulf News** | UAE-focused regional news | `site:gulfnews.com 2026 UAE oil gas force majeure` |
| **Middle East Eye** | Independent regional analysis | `site:middleeasteye.net 2026 Gulf oil infrastructure` |
| **Trade Arabia** | Gulf business/energy reporting | `site:tradearabia.com 2026 Gulf oil gas shutdown` |
| **Hellenic Shipping News** | Maritime/tanker market intelligence | `site:hellenicshippingnews.com 2026 Hormuz tanker shipping` |

### Tier 3 — Industry Trade Publications & Aggregators

| Source | Focus | Search with |
|---|---|---|
| **OilPrice.com** | Oil market analysis & commentary | `site:oilprice.com 2026 Gulf Hormuz force majeure` |
| **World Oil** | Upstream operations & technology | `site:worldoil.com 2026 Gulf shutdown force majeure` |
| **Upstream Online** | E&P industry news | `site:upstreamonline.com 2026 Gulf oil gas` |
| **Offshore Technology** | Offshore infrastructure & projects | `site:offshore-technology.com 2026 Gulf infrastructure` |
| **LNG Industry** | LNG-specific operations & markets | `site:lngindustry.com 2026 Qatar LNG` |
| **Natural Gas World** | Gas market intelligence | `site:naturalgasworld.com 2026 Gulf LNG gas` |
| **Oil & Gas Journal** | Industry news & data | `site:ogj.com 2026 Gulf force majeure shutdown` |
| **Rigzone** | Drilling, offshore, market data | `site:rigzone.com 2026 Gulf Middle East` |
| **Pipeline & Gas Journal** | Midstream infrastructure | `site:pgjonline.com 2026 Gulf pipeline infrastructure` |
| **Splash 247** | Maritime/shipping news | `site:splash247.com 2026 Hormuz tanker shipping` |
| **Lloyd's List** | Shipping intelligence | `site:lloydslist.com 2026 Hormuz strait shipping` |
| **TradeWinds** | Shipping market reporting | `site:tradewindsnews.com 2026 Gulf tanker` |
| **Seatrade Maritime** | Maritime industry analysis | `site:seatrade-maritime.com 2026 Hormuz` |
| **gCaptain** | Maritime/offshore news | `site:gcaptain.com 2026 Hormuz Gulf tanker` |
| **Tank Storage Magazine** | Storage & terminals | `site:tankstoragemag.com 2026 Gulf oil storage` |

### What to look for

Focus on events from the last 48 hours. Search for:
- New force majeure declarations by energy/shipping/petrochemical companies
- Oil & gas facility shutdowns, attacks, or disruptions
- Country-level status changes for: Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel, Iran
- Production volume impacts (kb/d, Mtpa, Bcf/d) and infrastructure damage
- Shipping disruptions through Strait of Hormuz
- Tanker diversions, insurance rate changes, war risk premiums
- OPEC/OPEC+ emergency responses
- Attacks on non-energy infrastructure: data centers (Batelco/AWS Bahrain), power plants,
  desalination facilities, aluminium smelters (EGA, Alba), airports, bridges, telecom/submarine cables
- Expanding Iranian target lists (bridge lists, tech company lists, infrastructure lists)
- Civilian infrastructure damage and cascading effects (water, electricity, internet)
- Downstream force majeure declarations by refineries, petrochemical plants, and industrial consumers
  in importing countries that depend on Gulf feedstock (naphtha, crude, LNG, LPG). Key regions:
  Asia-Pacific (China, India, Japan, South Korea, Taiwan, Thailand, Vietnam, Philippines, Sri Lanka,
  Indonesia, Singapore, Malaysia), Americas (USA, Brazil, Mexico), Europe (EU-27, UK, Turkey).
  Check company investor relations pages, stock exchange filings, and industry publications
  (ICIS Asia, Chemical Week, C&EN) for downstream FM declarations triggered by Gulf supply disruptions.

### Source attribution

When data comes from a premium provider citation, note it in the source title. Examples:
- "Qatar LNG output collapses 90% — Reuters citing Kpler tracking data"
- "Gulf crude exports drop 4 mb/d — Bloomberg citing Vortexa"
- "Aramco production cut to 8.5 mb/d — FT citing Rystad Energy"

## Step 3b: Update energy news context for Import/Export Flow insights

Search for the latest market-moving developments affecting energy commodity flows for each country tracked in the dashboard. Write results to `energy-news-data.json`.

### Countries to cover

**Exporters (priority):** Saudi Arabia, UAE, Iraq, Qatar, Russia, United States, Kuwait, Iran, Oman, Bahrain
**Importers (priority):** China, India, Japan, South Korea, Taiwan, Thailand, Vietnam, Philippines, Sri Lanka, Indonesia, Singapore, Malaysia, USA, EU-27, UK, Turkey, Brazil, Mexico

### What to search for (per country)

Run 8-10 web searches covering:
- OPEC+ production quota decisions and compliance
- Sanctions, tariffs, or trade restrictions affecting flows
- Refinery outages, maintenance shutdowns, or capacity changes
- Shipping/logistics disruptions (Hormuz, Suez, weather events)
- Demand shifts (economic indicators, seasonal patterns, policy changes)
- Supply developments (new fields online, pipeline changes, production ramp-ups)
- LNG contract awards, spot market dynamics, regasification utilisation
- LPG feedstock switching, petrochemical demand shifts

### Search queries to run

At minimum:
- `"Saudi Arabia" OR "Saudi Aramco" crude oil exports 2026`
- `UAE OR ADNOC crude LNG exports 2026`
- `Iraq oil exports Basra pipeline Ceyhan 2026`
- `Qatar LNG exports Ras Laffan 2026`
- `Russia crude oil exports sanctions Asia 2026`
- `US crude LNG exports Gulf Coast 2026`
- `China crude oil imports refinery demand 2026`
- `India crude LNG imports 2026`
- `Japan South Korea crude LNG imports 2026`
- `OPEC+ production cuts exports crude 2026`
- `Taiwan OR "Formosa Plastics" OR FPCC petrochemical force majeure 2026`
- `Asia downstream petrochemical cracker ethylene force majeure 2026`
- `India refinery petrochemical force majeure Gulf supply 2026`
- `China SINOPEC PetroChina refinery force majeure Hormuz 2026`
- `Japan South Korea petrochemical naphtha force majeure 2026`
- `Philippines Sri Lanka refinery force majeure crude supply 2026`
- `Europe refinery petrochemical force majeure Gulf crude 2026`
- `USA refinery force majeure crude LNG supply disruption 2026`
- `Southeast Asia Vietnam Thailand Indonesia petrochemical force majeure 2026`

### Output format

Write `energy-news-data.json` with this structure:
```json
{
  "lastUpdated": "<ISO timestamp>",
  "saudi_arabia_crude": "<one-line CEO-level headline citing source>",
  "saudi_arabia_lng": "<one-line headline>",
  "saudi_arabia_lpg": "<one-line headline>",
  "china_crude": "<one-line headline>",
  ...
}
```

### Rules for headlines
- Each headline should be **one sentence**, factual, and cite the source (e.g., "Reuters", "Kpler", "Platts")
- Focus on the **most market-moving development** for that country+commodity in the last 7 days
- If no recent news exists for a specific country+commodity, keep the existing entry unchanged
- Do NOT fabricate news — if nothing found, preserve the current text
- Use CEO-appropriate language: concise, no jargon, focused on impact
- All 48 keys must be present (16 countries x 3 commodities)

### Priority order
1. Saudi Arabia, UAE, Iraq, Qatar (crude) — highest priority
2. Russia, US (crude, LNG) — high priority
3. China, India, Japan, South Korea (crude, LNG) — high priority
4. All countries (LPG) — medium priority
5. Thailand, Vietnam, Bahrain, Oman, Kuwait, Iran — lower priority (keep existing if nothing new)

---

## Step 3c: Premium source data

Premium source content is pre-fetched from authenticated platforms before this agent runs. **First, check if pre-fetched data exists:**

1. Read the file `soh-data/.premium-sources.json` — it contains extracted text/data from:
   - **Kpler** (`terminal.kpler.com/intelligence`) — intelligence articles and market reports
   - **Rystad** (`portal.rystadenergy.com/dashboards/detail/1047/0`) — Middle East Conflict Oil & Gas Infrastructure dashboard (may include screenshot at `soh-data/.rystad-dashboard.png`)
   - **S&P Connect** (`connect.spglobal.com/home`) — news feed with full article bodies (5 Gulf-relevant strategic reports + market commentary, ~30-40K chars of content)
   - **Platts Core** (`core.spglobal.com/#platts/allInsights`) — unified News & Insights feed: article headlines grouped by type (Top News, News, Spotlight, Market Commentary, Rationale). Gulf-relevant items are prefixed with `[GULF]` in the `content` field.

2. If the file exists with content, analyze EACH platform's data and extract findings for data.js
3. If the file doesn't exist or is empty, AND you have Chrome DevTools MCP tools, use browser fallback below

### Analyzing pre-fetched content
For each platform in `.premium-sources.json`:
- Read the `content` field for text data
- If a `screenshot` field exists, read that image file for visual data (charts, maps, tables)
- Extract any data points relevant to: country status, FM declarations, shutdowns, production impacts
- Cross-reference with your web search findings — premium data takes precedence

### Browser fallback (only if pre-fetched data unavailable)
If `soh-data/.premium-sources.json` doesn't exist or all platforms show "chrome unavailable", AND you have access to Chrome DevTools MCP tools (mcp__chrome-devtools__*), use them to check authenticated premium platforms directly.

**IMPORTANT: Premium source searches are the HIGHEST PRIORITY part of this sync.** Web search (Steps 3-3b) provides public data. Premium platforms provide EXCLUSIVE data — field-level production analytics, infrastructure damage assessments, and intelligence reports that cannot be found elsewhere. You MUST navigate to each platform and perform thorough searches. Skipping is only acceptable if login/MFA blocks access.

Focus areas across all platforms:
- Latest Gulf/Hormuz military developments and their impact on oil & gas
- New force majeure declarations or lifted FMs
- Country-level production/export changes for all 9 tracked countries
- Infrastructure damage assessments and repair timelines
- Downstream impacts on importing countries (Asia, Europe, Americas)
- OPEC+ emergency responses
- Shipping/tanker disruptions and war risk premium changes

### Platform 1: terminal.kpler.com (minimum 5 actions)

1. Navigate to `terminal.kpler.com/intelligence` → read latest intelligence articles on Gulf crisis
2. Navigate to `terminal.kpler.com/cargo/flows` → check Gulf crude/LNG/LPG flow disruptions, compare with pre-crisis baselines
3. Navigate to `terminal.kpler.com/map` → check vessel congestion at Strait of Hormuz, any blockages or diversions
4. Search within Kpler for "force majeure" — check for alerts or new FM reports
5. Search within Kpler for "Hormuz" OR "Gulf disruption" — check latest analytical reports
6. Note any production/flow data with specific numbers that contradicts or enhances your web search findings

### Platform 2: portal.rystadenergy.com (minimum 5 actions)

1. Navigate to `portal.rystadenergy.com/home` → check dashboard alerts and notifications
2. Navigate to `portal.rystadenergy.com/dashboards/detail/1047/0` → **Middle East Conflict – Oil & Gas Infrastructure Impact Analysis** — this is the PRIMARY dashboard. Read ALL sections thoroughly:
   - Country-by-country production impact data
   - Infrastructure damage assessments (which facilities are destroyed/damaged/operational)
   - Field-level production estimates (kb/d, Bcf/d, Mtpa)
   - Repair timelines and restart forecasts
   - Economic impact estimates
3. Search within Rystad for "Gulf" or "Hormuz" — check supply disruption intelligence reports
4. Search within Rystad for "force majeure" — check recent FM alerts
5. Check any country-level production analytics dashboards for the 9 tracked countries
6. Note any field-level data, repair timelines, or damage assessments not available from public sources

### Platform 3: connect.spglobal.com (minimum 5 actions)

1. Navigate to `connect.spglobal.com/home` → read the latest news feed headlines, focus on Gulf/Middle East items
2. Search for "force majeure" in the platform — check recent FM declarations
3. Search for "Hormuz" OR "Gulf" — check market commentary and disruption analysis
4. Search for "LNG" + "Gulf" — check LNG market disruption coverage and price impact
5. Check commodity insights section for crude/gas/products pricing impact analysis
6. Note any country status assessments, new FM declarations, or production impact data

### Rules for browser search
- Only enhance data.js with VERIFIED information from these platforms
- Cite the platform in source entries (e.g., "Rystad Middle East Conflict dashboard — Apr 3")
- If a platform requires login/MFA and you cannot access it, skip it and note in sync-log.json
- Do NOT use browser for prices, vessel counts, or flow data — those are separate pipelines
- Do NOT skip a platform because it takes time — premium data is highest priority

### Required: Premium Source Findings Report

After completing Step 3c, you MUST output a DETAILED findings report. This is mandatory.

```
Premium Source Findings:

=== terminal.kpler.com ===
Status: [accessed / login required / skipped / error]
Pages visited: [list URLs navigated]
Findings:
  - [List EACH data point found. Be specific with numbers, dates, countries]
  - Example: "Qatar LNG: 0 cargoes loaded past 7 days (confirms total shutdown)"
  - Example: "3 VLCCs loaded at Das Island in last 48hrs — UAE crude exports resuming"
  - If no new data: "Accessed — no new findings beyond web search results"

=== portal.rystadenergy.com ===
Status: [accessed / login required / skipped / error]
Pages visited: [list URLs, especially /dashboards/detail/1047/0]
Findings:
  - [List EACH data point from the Middle East Conflict dashboard]
  - Example: "Iraq Basra output revised to 2.8 mb/d (Rystad field-level estimate)"
  - Example: "Qatar infrastructure damage: 12.8 Mtpa capacity out for 3-5 yrs (Rystad)"
  - If no new data: "Accessed — dashboard data consistent with existing data.js"

=== connect.spglobal.com ===
Status: [accessed / login required / skipped / error]
Pages visited: [list URLs navigated]
Findings:
  - [List EACH data point found]
  - Example: "Platts: New FM declared by XYZ for crude loading at Port ABC"
  - If no new data: "Accessed — no new FM declarations or status changes found"
```

If a platform was skipped, state the reason. This report is MANDATORY even if all platforms are skipped.

---

## Step 3d: Infrastructure Attack Monitoring (MANDATORY — run ALL queries)

The conflict is expanding targets beyond oil & gas to include data centers, power plants, aluminium smelters, airports, bridges, desalination, and telecom infrastructure. You MUST run EVERY search query below and check for events in the last 48 hours. If ANY query returns a new attack, disruption, shutdown, or status change not already in data.js, add it immediately.

**This step exists because the pipeline previously missed a major Habshan gas complex shutdown (Bloomberg Apr 3) — a headline event that was not captured because general search queries were too broad.**

### UAE / ADNOC (highest priority — this is an ADNOC dashboard)
1. `"Habshan" attack OR fire OR shut OR shutdown 2026 April`
2. `"Ruwais" attack OR fire OR shutdown 2026 April`
3. `"Das Island" attack OR disruption 2026 April`
4. `"Fujairah" terminal OR port attack 2026 April`
5. `"ADCOP" OR "Habshan-Fujairah pipeline" disruption 2026 April`
6. `"ADNOC" attack OR strike OR shutdown April 2026`
7. `"Abu Dhabi" missile OR drone infrastructure April 2026`
8. `"Jebel Ali" port OR smelter attack 2026 April`
9. `"EGA" OR "Al Taweelah" OR "Jebel Ali smelter" 2026 April`
10. `"Borouge" OR "ADNOC petrochemical" 2026 April`
11. `"Dubai airport" OR "DXB" attack 2026 April`
12. `"UAE data center" OR "UAE power plant" attack 2026 April`
13. `"Sheikh Zayed bridge" OR "Abu Dhabi bridge" attack 2026 April`

### Saudi Arabia
14. `"Ras Tanura" OR "Abqaiq" attack 2026 April`
15. `"Yanbu" OR "East-West pipeline" disruption 2026 April`
16. `"Ghawar" OR "Safaniya" OR "SABIC" attack 2026 April`
17. `"Saudi Arabia" infrastructure attack April 2026`

### Qatar
18. `"Ras Laffan" OR "North Field" attack 2026 April`
19. `"Qatar" infrastructure attack April 2026`

### Kuwait
20. `"Mina Al-Ahmadi" OR "Al-Zour" OR "Kuwait" attack April 2026`

### Iraq
21. `"Basra oil terminal" OR "Rumaila" OR "Iraq" pipeline attack 2026 April`

### Bahrain
22. `"Sitra" OR "Alba" OR "Bahrain" data center attack 2026 April`

### Iran (target of strikes)
23. `"Kharg Island" OR "South Pars" OR "Iran refinery" strike 2026 April`
24. `"Iran bridge" OR "Iran infrastructure" strike April 2026`

### Israel
25. `"Leviathan" OR "Tamar" OR "Karish" gas field 2026 April`

### Oman
26. `"Sohar" OR "Duqm" OR "Oman LNG" 2026 April`

### Cross-cutting (non-energy expanding targets)
27. `"data center" attack Gulf Middle East 2026 April`
28. `"power plant" OR "desalination" attack Gulf 2026 April`
29. `"aluminium smelter" attack Gulf 2026 April`
30. `"submarine cable" OR "internet" disruption Gulf 2026 April`

### Petrochemicals & New Critical Assets (baselines + status)
31. `"Borouge" OR "SABIC" OR "Petro Rabigh" OR "EQUATE" OR "Q-Chem" cracker capacity 2026`
32. `"Mahshahr" OR "Bandar Imam" OR "Bushehr Petrochemical" Iran petchem strike April 2026`
33. `"Barakah Nuclear" OR "ENEC" OR "Nawah Energy" 2026 April status`
34. `"Khazna" OR "G42" OR "Equinix Dubai" OR "Etisalat Smart Hub" data center 2026`
35. `"AWS Bahrain" OR "Batelco" data center strike April 2026`
36. `"Oracle Jeddah" OR "Google Dammam" OR "STC data center" 2026`

### Output requirement
After running all 36 queries, output:
```
Infrastructure Monitoring Results:
  Queries with new findings: [list query numbers and what was found]
  Queries with no new results: [count]/36
  New events to add to data.js: [list each with country, asset name, event description, source URL]
```

---

## Step 4: Update data.js

Update the `data.js` file with any new findings. Preserve the exact same schema and variable structure:

- `LAST_UPDATED` — set to the ACTUAL current ISO timestamp (e.g., `new Date().toISOString()`). This must reflect the real time the sync completed. Do NOT manually set a future time, round to the next hour, or use any time other than the current moment.
- `COUNTRY_STATUS_DATA` — array of 9 countries (Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel, Iran). Each has: id, country, flag, status (stable|elevated|high|critical|conflict), statusLabel, isNew, summary, metrics, production, events, oilGasImpact, infrastructure, sources
- Each country's `production` object must include a `notes` sub-object with keys: oil, gas, refining, lng, petrochemicals, ports (only where applicable). These are short operational status notes shown in the Production Overview tables. Update them to reflect the current situation for each commodity.
- Each country's `production` object must also include a `petrochemicals` block:
  - `petrochemicals: { capacity: <kt/y>, affected: <kt/y>, available: <kt/y>, unit: "kt/y" }` — ethylene-equivalent nameplate capacity across all crackers/downstream. Seeded as a pre-war baseline (do NOT modify `capacity`). Update `affected` (offline kt/y) and `available` (capacity − affected) from news. Math: `capacity - affected = available` (±5% tolerance).
- Each infrastructure item (especially terminals/ports) should include a `notes` field with a short terminal-specific status note (e.g., "Loading suspended after drone strikes Mar 14-17"). Schema: `{ name, type, capacity, status, notes }`
- **assetImpact[] on events**: when an event describes damage/shutdown at a specific named facility, add an `assetImpact` array to the event with the matching infrastructure names. Format: `{ date, title, description, isNew, assetImpact: ["Habshan Gas Complex", "Habshan-5 LNG Train"] }`. Every string MUST exactly match a `name` in that country's `infrastructure[]`. If the facility isn't in infrastructure[], ADD it there first, then reference it. Validator will reject typos.

**NOTE**: `FM_DECLARATIONS_DATA` and `SHUTDOWNS_NO_FM_DATA` are managed by the sync-fm pipeline (runs after you). **You MUST NOT modify these arrays.** Treat them as read-only context.

### CRITICAL: Additive-only updates (DO NOT DELETE DATA)

**This is the #1 cause of data loss in the news pipeline.** You MUST follow these rules:

1. **NEVER delete text from country summaries** — only APPEND new information. If a summary says "WH: Hormuz not core objective" and you find new data, ADD your findings to the end, do NOT remove the WH statement.
2. **NEVER shorten a summary** — every summary must be equal or longer after your edit. If you find yourself rewriting a summary to be shorter, STOP and append instead.
3. **NEVER remove source citations** — existing source IDs and URLs must all be preserved. Only add new ones.
4. **NEVER delete events from the events array** — only add new events or update existing event status.
5. **NEVER modify `FM_DECLARATIONS_DATA` or `SHUTDOWNS_NO_FM_DATA`** — these are owned by sync-fm pipeline. Their array lengths and contents MUST be identical before and after your edit.
6. **Before editing any country entry**, read `data-previous.json` and compare. After editing, verify the entry didn't lose any data from the previous version.

### Rules
- Pre-war baseline values (`preWar` fields in production objects) must NEVER change — these are fixed reference points
- Production notes (`production.notes`) MUST be updated to reflect current operational status each sync
- production.notes.oil, .gas, .refining, .lng, .petrochemicals, .ports MUST each describe commodity-specific impacts — do NOT copy the same text across commodities:
  - Oil notes: crude oil field shutdowns, export disruptions, storage constraints
  - Gas notes: gas field/processing disruptions, associated gas impacts, pipeline status
  - Refining notes: refinery-specific damage, throughput, capacity status
  - LNG notes: liquefaction plant status, LNG export disruptions
  - Petrochemicals notes: cracker/downstream status (ethylene, propylene, methanol, polymers); feedstock curtailment; FM status of chemical exports
  - Ports notes: export terminal status, loading operations, pipeline bypass routes, port disruptions

### Notes Quality Checklist (apply to every note before writing)

For each of the 6 note fields per country (oil, gas, refining, lng, petrochemicals, ports):

1. **Commodity-specific**: re-read the note. Does it only describe the commodity named in the key? If oil note mentions LNG, fix it.
2. **Inline source citations**: every quantitative claim (kb/d, Bcf/d, kt/y, etc.) must cite a source ID like `[src:12]` where 12 is an ID in that country's `sources[]` array.
3. **Numeric precision with units**: oil/refining in `kb/d`, gas in `Bcf/d`, petchem in `kt/y`, LNG in `Mtpa`. Always include the unit.
4. **Recency**: the note must reference an event/source dated within the last 14 days, OR be prefixed with "Baseline:" if describing pre-crisis structural state.
5. **No cross-contamination**: after writing, re-scan all 6 notes for the country. Flag any text that overlaps commodities across unrelated fields.
- Mark items as `isNew: true` if they occurred in the last 48 hours, otherwise `isNew: false`
- Keep all existing country entries; update their status/summary/events if changed
- If you discover a new FM declaration or plant shutdown during your web search, **do NOT add it to FM_DECLARATIONS_DATA / SHUTDOWNS_NO_FM_DATA** (owned by sync-fm pipeline). Instead, log the finding under `fmCandidatesForFmPipeline[]` in sync-log.json (schema below). The sync-fm pipeline will verify and add the entry with proper global enrichment.
- Include real source URLs where possible — prefer URLs from Tier 1 and Tier 2 sources
- Keep the file header comment block with the updated timestamp
- The file must use `const` declarations (not export)
- Preserve the production object structure on country entries if present
- After updating, verify each infrastructure item's `status` and `notes` fields are current:
  - If an item was "operational" but a new attack/shutdown occurred → update status + notes
  - If an item was "shutdown" but has resumed → update to "operational" + notes with date
  - Infrastructure `notes` must reflect the LATEST known status, not stale information

### WAR_RISK_PREMIUM_DATA — DO NOT UPDATE

`WAR_RISK_PREMIUM_DATA` is updated by the sync-prices pipeline (`sync-prices.sh`).
Do NOT modify it during the news sync. Leave it untouched.

### Pre-war baselines (LOCKED — never modify these values)

| Country | Oil (kb/d) | Gas (Bcf/d) | Refining Cap (kb/d) | LNG (Mtpa) |
|---------|-----------|-------------|---------------------|------------|
| Qatar | 1220 | 18.5 | 443 | 77.0 |
| Kuwait | 2600 | 1.7 | 1400 | — |
| Saudi Arabia | 10400 | 11.3 | 3291 | — |
| UAE | 3400 | 6.5 | 1222 | 6.0 |
| Iraq | 4300 | 3.0 | 1300 | — |
| Bahrain | 196 | 1.6 | 405 | — |
| Oman | 1024 | 4.2 | 222 | 10.4 |
| Israel | 0 | 3.0 | 197 | — |
| Iran | 3176 | 25.8 | 2600 | — |

### Infrastructure baselines (LOCKED — never remove these items)

Each country's `infrastructure[]` array MUST always include at least these critical items. You may update their `status` and `notes` based on current events, but never remove an item from this list. You may ADD new items beyond these if found in sources.

| Country | Required infrastructure items |
|---------|------------------------------|
| Qatar | North Field, Qatargas 1-4, RasGas 1-3, Pearl GTL, Al Shaheen Field, Dukhan Field, Laffan Refinery 1 & 2, Mesaieed Refinery, Mesaieed Industrial City, Qatalum Smelter, QAFCO Fertilizer Complex, Umm Al Houl Power, Hamad Port |
| Kuwait | Greater Burgan, Mina Al-Ahmadi Refinery, Mina Abdullah Refinery, Al-Zour Refinery, Mina Al-Ahmadi Terminal, Al-Zour LNG Import Terminal, Kafco Fuel Storage, Subiya Power Plant, EQUATE Petrochemical Complex, Az-Zour South Power & Desalination |
| Saudi Arabia | Ghawar Field, Safaniya Field, Abqaiq Processing, Ras Tanura Refinery, Ras Tanura Terminal, Yanbu Refinery Complex, YASREF, East-West Pipeline, SABIC Yanbu Complex, SABIC Jubail Petrochemical Complex, Ma'aden Aluminium Complex, Ras Al-Khair IWPP, Jubail Industrial Port |
| UAE | Upper Zakum Field, Bu Hasa Field, Murban Field, Habshan Gas Processing, Shah Gas Field (ADNOC/Oxy), Ruwais Refinery Complex, Fujairah Oil Terminal, Das Island LNG/LPG (ADGAS), Habshan-Fujairah Pipeline, EGA Al Taweelah Smelter, EGA Jebel Ali Smelter, Borouge Petrochemical Complex, Jebel Ali Power & Desalination Complex, Taweelah Power & Desalination Complex, Jebel Ali Port, Khalifa Port |
| Iraq | Rumaila Field, West Qurna 1 & 2, Basra Oil Terminal, Khor Al-Amaya Terminal, Baiji Refinery, Basra Refinery, Umm Qasr Port, Besmaya Power Plant |
| Bahrain | Bahrain Field (Awali), BAPCO Sitra Refinery, Alba Aluminium Smelter, Sitra Marine Terminal, Al Dur IWPP |
| Oman | PDO Fields (Block 6), Khazzan Gas Field (BP), Oman LNG (Qalhat), Sohar Refinery, Duqm Refinery, Sohar Aluminium, Barka IWPP, Mina Al-Fahal Terminal |
| Israel | Leviathan Gas Field, Tamar Gas Field, Karish Gas Field, Ashdod Refinery (Bazan) |
| Iran | South Pars Phases 2-3/4-5/6-8, Ahwaz Asmari/Bangestan, Persian Gulf Star Refinery, Abadan Refinery, Tehran Refinery, Bandar Imam Petrochemical Complex, Isfahan Thermal Power Plant, Kharg Island Terminal, Jask Oil Terminal, Goreh-Jask Pipeline |

### Valid status values

- Country status: `stable`, `elevated`, `high`, `critical`, `conflict`
- FM status: `active`, `partially_lifted`, `lifted`, `extended`
- Shutdown status: `ongoing`, `resumed`, `partial`, `planned`, `shutdown`, `halted`, `struck`, `suspended`, `operational`, `restarted`, `fm_declared`, `contained`, `partially_resumed`
- Impact severity: `none`, `low`, `moderate`, `severe`, `critical`

### Validation checklist (verify before writing)
- [ ] All 9 countries present in COUNTRY_STATUS_DATA
- [ ] Each country has events, infrastructure, oilGasImpact, and sources arrays
- [ ] All source URLs are real and accessible (not fabricated)
- [ ] isNew flags reflect <48hr recency accurately
- [ ] No schema changes to variable names or structure
- [ ] All preWar values match the locked baselines table above exactly
- [ ] All status values use valid enum values from the list above
- [ ] Each country has production.notes with oil, gas, refining, petrochemicals, ports keys (and lng where applicable)
- [ ] Refining math: capacity - affected = available (within rounding)
- [ ] Petrochemicals math (where capacity > 0): capacity - affected = available
- [ ] assetImpact[] entries on events match country.infrastructure[].name exactly (no typos)
- [ ] **FM_DECLARATIONS_DATA.length is UNCHANGED from your Step 1 baseline snapshot**
- [ ] **SHUTDOWNS_NO_FM_DATA.length is UNCHANGED from your Step 1 baseline snapshot**
- [ ] Contents of both FM arrays are byte-for-byte identical to Step 1 (you did not touch them)

## Step 4b: Data loss verification (CRITICAL)

After writing data.js, read `data-previous.json` and verify NO DATA WAS LOST:

1. For each of the 9 countries, compare the `summary` field length:
   - If the new summary is SHORTER than the previous one, you LOST data. Fix it by appending the missing content back.
2. Count the sources array for each country — the new count must be >= the previous count.
3. Check that no event entries were deleted from any country's events array.
4. Verify FM_DECLARATIONS_DATA.length === fmCountBefore (you did NOT touch this array).
5. Verify SHUTDOWNS_NO_FM_DATA.length === shutdownsCountBefore (you did NOT touch this array).

**If any country data was lost, READ data-previous.json and RESTORE the missing content before proceeding. If FM/shutdown counts changed, you have bugged the file — re-read data.js, restore the original FM arrays from data-previous.json, and re-write.**

## Step 4d: HARD GUARDRAILS (verify after writing data.js)

These arrays are managed by the **sync-fm pipeline**, NOT by you:
- `FM_DECLARATIONS_DATA`
- `SHUTDOWNS_NO_FM_DATA`

After you write data.js, verify:
- `FM_DECLARATIONS_DATA.length` is UNCHANGED from the pre-edit count (`fmCountBefore`).
- `SHUTDOWNS_NO_FM_DATA.length` is UNCHANGED from the pre-edit count (`shutdownsCountBefore`).
- The contents of both arrays are IDENTICAL to what you read in Step 1 (no added, removed, or modified entries).

If during your search you discovered a new FM/shutdown that should be tracked, **do NOT add it to the arrays directly**. Instead, log it in `sync-log.json` under a new `fmCandidatesForFmPipeline[]` array (schema in Step 5). The sync-fm pipeline runs after you and will verify and add the entry with proper regional search enrichment.

## Step 4c: Self-validate before finishing

After writing data.js, verify:
1. The file has valid JavaScript syntax (all brackets/braces matched, no trailing commas after last array element)
2. All 9 countries are present in COUNTRY_STATUS_DATA
3. All preWar values match the locked baselines table above
4. Every country has production.notes with at least oil, gas, refining, petrochemicals, ports keys
5. Refining/petrochemicals math: capacity - affected = available (within rounding)
6. All country status values are valid enum values
7. Every event.assetImpact[] string matches an existing infrastructure[].name in the same country
8. FM_DECLARATIONS_DATA and SHUTDOWNS_NO_FM_DATA arrays are UNCHANGED (length + contents)

If any check fails, fix the issue before proceeding to Step 5.

## Step 5: Write sync log

Write a `sync-log.json` file with:
```json
{
  "timestamp": "<ISO timestamp>",
  "success": true,
  "changes": "<brief summary of what changed, or 'No new changes found'>",
  "countriesCount": <number>,
  "fmCountSnapshot": <FM_DECLARATIONS_DATA.length — unchanged from pre-edit>,
  "shutdownsCountSnapshot": <SHUTDOWNS_NO_FM_DATA.length — unchanged from pre-edit>,
  "fmCandidatesForFmPipeline": [
    {
      "type": "fm" | "shutdown",
      "company": "<company name>",
      "country": "<country string>",
      "date": "YYYY-MM-DD",
      "summary": "<one-line summary of the discovered event>",
      "sourceUrl": "https://..."
    }
  ],
  "sourcesChecked": {
    "tier1": ["<list of Tier 1 sources that returned results>"],
    "tier2": ["<list of Tier 2 sources that returned results>"],
    "tier3": ["<list of Tier 3 sources that returned results>"]
  }
}
```

**`fmCandidatesForFmPipeline[]`** is a handoff array: if you discovered a new FM/shutdown during your search that isn't yet in FM_DECLARATIONS_DATA or SHUTDOWNS_NO_FM_DATA, list it here as a hint for the sync-fm pipeline that runs after you. Do NOT add the entry to the arrays yourself. Leave this as an empty array if no candidates were found.

## Important

- Do NOT change the variable names or schema structure
- Do NOT use ES module exports — the file uses plain `const` declarations
- If no new information is found, still update LAST_UPDATED and write the sync log noting no changes
- Be thorough in web searches — run at least 10-15 different queries across all tiers
- Prioritize accuracy over speed — cross-reference major claims across multiple sources
