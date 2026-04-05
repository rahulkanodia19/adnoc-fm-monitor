# ADNOC FM Monitor — Project Instructions

Real-time Oil & Gas intelligence dashboard tracking the Gulf/Hormuz military escalation crisis. Monitors force majeure declarations, production shutdowns, vessel movements, commodity flows, and market prices across 9 countries.

## Tech Stack

- **Frontend**: Vanilla HTML/JS (no framework, no build step). Tailwind CSS via CDN, Chart.js, Leaflet.js
- **Data**: Static JS files with `const` declarations (NOT ES modules). data.js, import-data.js, export-data.js
- **API**: Vercel serverless function (`api/market-prices.js`) with 15-min cache
- **Server**: Express.js for local dev (`npm start`, port 3000)
- **Deploy**: Vercel (auto-deploys from `main` branch on push)

## Data Architecture

### 10 Dashboard Tabs

| Tab | Data File | Source | Sync Script |
|-----|-----------|--------|-------------|
| Production Overview | `data.js` (COUNTRY_STATUS_DATA) | Claude web search + Chrome MCP | `sync-news.sh` |
| Country Status | `data.js` (COUNTRY_STATUS_DATA) | Same | Same |
| FM Declarations | `data.js` (FM_DECLARATIONS_DATA) | Same | Same |
| Shutdowns (No FM) | `data.js` (SHUTDOWNS_NO_FM_DATA) | Same | Same |
| Import Flows | `import-data.js` (IMPORT_FLOW_DATA) | Kpler API (JWT) | `sync-flows.js` |
| Export Flows | `export-data.js` (EXPORT_FLOW_DATA) | Kpler API (JWT) | `sync-flows.js` |
| Market Prices | `market-prices-seed.json` + `murban-history.json` + `market-insights.json` + `data.js` (WAR_RISK_PREMIUM_DATA) | S&P Platts API (Okta) + Investing.com (IFAD front-month) + Claude LLM | `sync-prices.sh` |
| SOH Tracker | `soh-data/*.json` (21 files) | Kpler API (JWT) + S&P MINT | `sync-soh.js` |
| SPR Status | `data.js` (SPR_RELEASE_DATA) | Claude web search | `sync-spr.sh` |
| Flow Insights | `flow-insights.json` | Claude LLM (4 batches) | `sync-flow-insights.sh` |

### 9 Tracked Countries (immutable list)

Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel, Iran

### Key Data Constraints

- `data.js` uses `const` declarations — NOT ES modules, NOT JSON
- Pre-war production baselines are LOCKED — never modify `preWar` values (enforced by `validate-data.js`)
- Flow data files are large: import-data.js ~6.7 MB, export-data.js ~8.4 MB
- SOH bounding box matches S&P MINT: lat 22-32, lng 46-60 (Persian Gulf + Strait of Hormuz + Gulf of Oman)

## Sync Pipeline

### Commands

```
npm run sync:all      # Master orchestrator — runs ALL 7 pipelines
npm run sync:news     # News/FM/Production only (Claude + Chrome MCP)
npm run sync:soh      # SOH Vessels only (Kpler JWT token)
npm run sync:flows    # Import/Export Flows only (Kpler JWT token)
npm run sync:insights # Flow Insights only (4 Claude batches)
npm run sync:spr      # SPR Releases only (Claude web search)
npm run sync:prices   # Market Prices (Platts + War Risk Premium)
npm run fetch:prices  # Platts Prices only (Okta PKCE, no AWRP)
npm run verify        # Check freshness of all data files → sync-status.json
```

`npm run sync`, `sync:local`, `sync:force` are all aliases for `sync:all`.

### Master Sync Phases (master-sync.sh)

1. **Pre-flight**: Start Chrome (3 retries), check Kpler login, extract JWT, check MINT/Platts tokens, backup data to `.sync-backup/`
2. **Phase 1 (parallel)**: News/FM + SOH + Platts + Flows (4 pipelines in background)
3. **Phase 1b (sequential)**: SPR (after News/FM — both write data.js)
4. **Phase 1c (sequential)**: AWRP war risk premium (after SPR — also writes data.js)
5. **Phase 2**: Flow Insights (split-flow-summary.js → 4 Claude batches → merge)
6. **Phase 3**: validate-data.js + verify-sync.js → git commit + push to master + main

### Retry & Recovery

- Each pipeline retries up to 3 times (0s, 10s, 30s backoff)
- Token-dependent pipelines (SOH, Flows) re-extract JWT before retry
- Failed pipelines restore data from `.sync-backup/`
- Windows toast notifications on failures
- Per-pipeline logs in `sync-logs/`

### Running from Claude Code vs Terminal

- `claude -p` subprocesses CANNOT run from within Claude Code (nesting fails)
- Run `npm run sync:all` from a **separate terminal** (Git Bash, PowerShell)
- Node.js pipelines (SOH, Flows, Platts) CAN run from Claude Code via Bash tool
- Windows Task Scheduler triggers `scripts/sync-scheduled.bat` daily at 12:00 AM local machine time. Register/update via `powershell.exe -File scripts/register-task.ps1` (self-elevating).

## Authentication

| Service | Method | Storage |
|---------|--------|---------|
| S&P Platts | Okta PKCE (`SPGCI_USERNAME`/`SPGCI_PASSWORD` in `.env`) | `.platts-token.json` (refresh token) |
| Kpler Terminal | JWT from Chrome localStorage | `soh-data/.token.txt` |
| S&P MINT | Okta OAuth | `soh-data/.mint-token.json` |
| Chrome | Persistent profile | `C:/ChromeProfiles/ClaudeSync` |

## Git & Deployment

- **Branches**: `master` (working) + `main` (Vercel deploys from). Always push to BOTH
- All standalone pipeline scripts push: `git push origin master` then `git push origin master:main`
- `MASTER_SYNC=1` env var set during orchestrated runs — individual scripts skip their own commit/push when this is set

## Validation (validate-data.js)

Run automatically before commit. Checks:
- 9 countries present, no duplicates
- Valid status enums (stable/elevated/high/critical/conflict)
- Pre-war baselines match locked values exactly
- Refining math: capacity - affected = available (within 5%)
- current <= preWar for oil/gas
- FM/shutdown entries have required fields + sources with URLs
- WAR_RISK_PREMIUM_DATA has valid history, current rate, and lastUpdated

## Key Files

| File | Purpose |
|------|---------|
| `app.js` | Main UI — tab routing, rendering, sync-status badges |
| `data.js` | Country status, FM declarations, shutdowns, SPR, war risk premium data |
| `import-flows.js` / `export-flows.js` | Flow dashboard frontends |
| `market-prices.js` | Price charts frontend |
| `soh-tracker.js` | SOH vessel tracking frontend |
| `scripts/master-sync.sh` | Unified sync orchestrator |
| `scripts/verify-sync.js` | Data freshness verifier → `sync-status.json` |
| `scripts/validate-data.js` | Schema validation (pre-commit) |
| `scripts/sync-soh.js` | Kpler vessel + flow API fetch (token-based) |
| `scripts/sync-flows.js` | Kpler import/export flow API fetch |
| `scripts/sync-prices.sh` | Market Prices sync orchestrator (Murban + Platts + AWRP + Insights) |
| `scripts/scrape-murban-investing.js` | Murban front-month fetch from Investing.com (IFAD continuation, via curl) |
| `scripts/fetch-platts-prices.js` | S&P Platts price fetch (13 symbols: crude, products, LNG/gas, LPG, Ammonia, AWRP) |
| `scripts/sync-market-insights-prompt.md` | Claude prompt for LLM-generated market insights (with data.js event context) |
| `scripts/process-soh.js` | Post-process vessels (classify inside/outside Gulf) |
| `scripts/split-flow-summary.js` | Split flow data into 4 batches for insights |

## SOH Geography

The Strait of Hormuz boundary uses a 17-waypoint polygon (`GULF_BOUNDARY` in process-soh.js and sync-soh.js) tracing from Iran's coast through the Strait to UAE. Vessels with `lng < boundaryLng(lat)` are "inside" (Persian Gulf), others are "outside" (Gulf of Oman).

Bounding box filter (matches S&P MINT): lat 22-32, lng 46-60.

<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->
