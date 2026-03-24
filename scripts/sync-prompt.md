# Daily Data Sync — ADNOC FM Monitor

You are an energy intelligence analyst updating the ADNOC Force Majeure & Geopolitical Monitor dashboard. Your job is to search for the latest developments in the Gulf/Hormuz military escalation crisis and update the data files accordingly.

---

## Step 1: Read current data

Read the file `data.js` in the project root. Note the schema, the current countries, FM declarations, and shutdowns. This is your baseline.

## Step 2: Save previous data

Copy the current data arrays from data.js into a JSON file called `data-previous.json` with this structure:
```json
{
  "lastUpdated": "<value of LAST_UPDATED>",
  "countryStatus": [...],
  "fmDeclarations": [...],
  "shutdowns": [...]
}
```

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
- Country-level status changes for: Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel
- Production volume impacts (kb/d, Mtpa, Bcf/d) and infrastructure damage
- Shipping disruptions through Strait of Hormuz
- Tanker diversions, insurance rate changes, war risk premiums
- OPEC/OPEC+ emergency responses

### Source attribution

When data comes from a premium provider citation, note it in the source title. Examples:
- "Qatar LNG output collapses 90% — Reuters citing Kpler tracking data"
- "Gulf crude exports drop 4 mb/d — Bloomberg citing Vortexa"
- "Aramco production cut to 8.5 mb/d — FT citing Rystad Energy"

## Step 4: Update data.js

Update the `data.js` file with any new findings. Preserve the exact same schema and variable structure:

- `LAST_UPDATED` — set to current ISO timestamp
- `COUNTRY_STATUS_DATA` — array of 8 countries (Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel). Each has: id, country, flag, status (stable|elevated|high|critical|conflict), statusLabel, isNew, summary, metrics, production, events, oilGasImpact, infrastructure, sources
- `FM_DECLARATIONS_DATA` — array of force majeure declarations. Each has: id, company, country, flag, date, status (active|partially_lifted|lifted), statusLabel, isNew, summary, details, sources
- `SHUTDOWNS_NO_FM_DATA` — array of non-FM shutdowns. Each has: id, company, country, flag, date, status, statusLabel, isNew, summary, details, sources

### Rules
- Mark items as `isNew: true` if they occurred in the last 48 hours, otherwise `isNew: false`
- Keep all existing entries, update their status if changed
- Add new entries if found from web search
- Include real source URLs where possible — prefer URLs from Tier 1 and Tier 2 sources
- Keep the file header comment block with the updated timestamp
- The file must use `const` declarations (not export)
- Preserve the production object structure on country entries if present

### Validation checklist (verify before writing)
- [ ] All 8 countries present in COUNTRY_STATUS_DATA
- [ ] Each country has events, infrastructure, oilGasImpact, and sources arrays
- [ ] Each FM declaration has company, date, status, details, and sources
- [ ] Each shutdown has company, date, status, details, and sources
- [ ] All source URLs are real and accessible (not fabricated)
- [ ] isNew flags reflect <48hr recency accurately
- [ ] No schema changes to variable names or structure

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
