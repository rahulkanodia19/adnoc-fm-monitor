# Daily Data Sync — ADNOC FM Monitor

You are an energy intelligence analyst updating the ADNOC Force Majeure & Geopolitical Monitor dashboard. Your job is to search for the latest developments in the Gulf/Hormuz military escalation crisis and update the data files accordingly.

---

## Step 1: Read current data

Read the file `data.js` in the project root. Note the schema, the current countries, FM declarations, and shutdowns. This is your baseline.

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

## Step 3c: Premium browser-authenticated search (if browser tools available)

If you have access to Chrome DevTools MCP tools (mcp__chrome-devtools__*), use them to check authenticated premium platforms for data that supplements your web searches. Focus on the SAME data as Steps 1-3: country status, FM declarations, shutdowns, and production impacts. Do NOT search for prices, flows, or vessel tracking here.

### What to check on each platform

**terminal.kpler.com**
- Check "Alerts" or "News" section for latest Gulf/Hormuz disruption reports
- Look for production disruption alerts for the 9 tracked countries
- Check for any new FM declarations or facility shutdown reports
- Note any data that contradicts or enhances your web search findings

**portal.rystadenergy.com**
- Check latest supply disruption reports / intelligence alerts
- Look for field-level production analytics for Gulf countries
- Check for infrastructure damage assessments or repair timelines
- Note any production volume updates not found in public sources

**connect.spglobal.com**
- Check latest Platts news/commentary on Gulf disruptions
- Look for new FM declarations or status changes in their coverage
- Check infrastructure damage or restart reports
- Note any country status assessments or production impact analyses

### Rules for browser search
- Only enhance data.js with VERIFIED information from these platforms
- Cite the platform in source entries (e.g., "Rystad supply disruption alert — Mar 28")
- If a platform requires login/MFA and you cannot access it, skip it and note in sync-log.json
- Do NOT use browser for prices, vessel counts, or flow data — those are separate tabs

### Required: Premium Source Access Summary
After completing Step 3c, you MUST output a summary to the console:
```
Premium Source Access:
  - terminal.kpler.com: [accessed / login required / skipped / error]
  - portal.rystadenergy.com: [accessed / login required / skipped / error]
  - connect.spglobal.com: [accessed / login required / skipped / error]
```
This summary is mandatory even if all platforms are skipped (e.g., no Chrome MCP tools available).

---

## Step 4: Update data.js

Update the `data.js` file with any new findings. Preserve the exact same schema and variable structure:

- `LAST_UPDATED` — set to the ACTUAL current ISO timestamp (e.g., `new Date().toISOString()`). This must reflect the real time the sync completed. Do NOT manually set a future time, round to the next hour, or use any time other than the current moment.
- `COUNTRY_STATUS_DATA` — array of 9 countries (Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel, Iran). Each has: id, country, flag, status (stable|elevated|high|critical|conflict), statusLabel, isNew, summary, metrics, production, events, oilGasImpact, infrastructure, sources
- Each country's `production` object must include a `notes` sub-object with keys: oil, gas, refining, lng, ports (only where applicable). These are short operational status notes shown in the Production Overview tables. Update them to reflect the current situation for each commodity.
- Each infrastructure item (especially terminals/ports) should include a `notes` field with a short terminal-specific status note (e.g., "Loading suspended after drone strikes Mar 14-17"). Schema: `{ name, type, capacity, status, notes }`
- `FM_DECLARATIONS_DATA` — array of force majeure declarations. Each has: id, company, country, flag, date, status (active|partially_lifted|lifted), statusLabel, isNew, summary, details, sources
- `SHUTDOWNS_NO_FM_DATA` — array of non-FM shutdowns. Each has: id, company, country, flag, date, status, statusLabel, isNew, summary, details, sources

### Rules
- Pre-war baseline values (`preWar` fields in production objects) must NEVER change — these are fixed reference points
- Production notes (`production.notes`) MUST be updated to reflect current operational status each sync
- production.notes.oil, .gas, .refining, .lng, .ports MUST each describe commodity-specific impacts — do NOT copy the same text across commodities:
  - Oil notes: crude oil field shutdowns, export disruptions, storage constraints
  - Gas notes: gas field/processing disruptions, associated gas impacts, pipeline status
  - Refining notes: refinery-specific damage, throughput, capacity status
  - LNG notes: liquefaction plant status, LNG export disruptions
  - Ports notes: export terminal status, loading operations, pipeline bypass routes, port disruptions
- If no new FM declarations are found in the last 7 days, note this in sync-log.json with a reason
- Mark items as `isNew: true` if they occurred in the last 48 hours, otherwise `isNew: false`
- Keep all existing entries, update their status if changed
- Add new entries if found from web search
- Include real source URLs where possible — prefer URLs from Tier 1 and Tier 2 sources
- Keep the file header comment block with the updated timestamp
- The file must use `const` declarations (not export)
- Preserve the production object structure on country entries if present

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
- [ ] Each FM declaration has company, date, status, details, and sources
- [ ] Each shutdown has company, date, status, details, and sources
- [ ] All source URLs are real and accessible (not fabricated)
- [ ] isNew flags reflect <48hr recency accurately
- [ ] No schema changes to variable names or structure
- [ ] All preWar values match the locked baselines table above exactly
- [ ] All status values use valid enum values from the list above
- [ ] Each country has production.notes with oil, gas, refining, ports keys (and lng where applicable)
- [ ] Refining math: capacity - affected = available (within rounding)

## Step 4b: Self-validate before finishing

After writing data.js, verify:
1. The file has valid JavaScript syntax (all brackets/braces matched, no trailing commas after last array element)
2. All 9 countries are present in COUNTRY_STATUS_DATA
3. All preWar values match the locked baselines table above
4. Every FM/shutdown entry has id, company, date, status, details.volumeAffected, details.commodity, sources
5. Every country has production.notes with at least oil, gas, refining, ports keys
6. Refining math: capacity - affected = available (within rounding)
7. All status values are valid enum values

If any check fails, fix the issue before proceeding to Step 5.

## Step 5: Write sync log

Write a `sync-log.json` file with:
```json
{
  "timestamp": "<ISO timestamp>",
  "success": true,
  "changes": "<brief summary of what changed, or 'No new changes found'>",
  "countriesCount": <number>,
  "fmCount": <number>,
  "shutdownsCount": <number>,
  "sourcesChecked": {
    "tier1": ["<list of Tier 1 sources that returned results>"],
    "tier2": ["<list of Tier 2 sources that returned results>"],
    "tier3": ["<list of Tier 3 sources that returned results>"]
  }
}
```

## Important

- Do NOT change the variable names or schema structure
- Do NOT use ES module exports — the file uses plain `const` declarations
- If no new information is found, still update LAST_UPDATED and write the sync log noting no changes
- Be thorough in web searches — run at least 10-15 different queries across all tiers
- Prioritize accuracy over speed — cross-reference major claims across multiple sources
