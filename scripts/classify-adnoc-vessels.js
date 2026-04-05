#!/usr/bin/env node
/**
 * classify-adnoc-vessels.js — Auto-discovers ADNOC-affiliated vessels from Kpler.
 *
 * Three independent matching rules:
 *   1. Ownership/control — ADNOC (or subsidiary/SPV) appears in vessel's players graph
 *      or as vesselController.default
 *   2. Chartered — ADNOC is the charterer on recent trades
 *   3. Trade counterparty — ADNOC is the buyer or seller on recent trades
 *
 * Uses the same Kpler JWT auth pattern as sync-soh.js / sync-flows.js.
 *
 * Usage:
 *   node scripts/classify-adnoc-vessels.js                          # global vessel scan
 *   node scripts/classify-adnoc-vessels.js --zone=107647            # restrict to a zone
 *   node scripts/classify-adnoc-vessels.js --trades-size=500        # fewer trades per player
 *   KPLER_ACCESS_TOKEN="eyJ..." node scripts/classify-adnoc-vessels.js
 *
 * Output: soh-data/adnoc-affiliated-vessels.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://terminal.kpler.com';
const OUT_DIR = path.join(__dirname, '..', 'soh-data');
const TOKEN_PATH = path.join(OUT_DIR, '.token.txt');
const OUT_FILE = path.join(OUT_DIR, 'adnoc-affiliated-vessels.json');

// ---------- CLI ----------

const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const a = args.find(x => x.startsWith(flag + '='));
  return a ? a.split('=')[1] : fallback;
}
const ZONE = argVal('--zone', null);
const TRADES_SIZE = parseInt(argVal('--trades-size', '1000'), 10);
const VESSELS_SIZE = parseInt(argVal('--vessels-size', '50000'), 10);
const DEEP = args.includes('--deep');

// ---------- ADNOC entity config ----------

// Tier 1: Direct ADNOC entities (parent + subsidiaries + LNG SPVs)
const ADNOC_CORE_PLAYER_IDS = new Set([
  1832,  // ADNOC (parent / Abu Dhabi National Oil Company)
  1824,  // ADCO (Abu Dhabi Company for Onshore Oil Operations)
  1831,  // ADNATCO (= ADNOC L&S tanker arm)
  1833,  // ADNOC Fertilizers (FERTIL)
  1834,  // ADNOC Gas
  4046,  // Takreer (Abu Dhabi Refining Company)
  4338,  // ZADCO (Zakum Development Company)
  9856,  // National Gas Shipping Co. (NGSCO, LNG parent)
  7388,  // GASCO
  15183, // Admic
  // ADNOC LNG SPVs — each holds 1 LNG carrier; parent = NGSCO (9856)
  4576,  // Al Hamra Ltd
  4585,  // Al Khaznah Inc
  7552,  // Ghasha Inc
  8552,  // Ish Inc
  9736,  // Mraweh Ltd
  9747,  // Mubaraz Ltd
  11769, // Shahamah Inc
  13062, // Umm Al Ashtan Ltd
]);

// Tier 2: Pool / JV / time-charter partners (affiliate fleet)
const ADNOC_AFFILIATE_PLAYER_IDS = new Set([
  9905,  // Navig8 (tanker pool partner)
  4271,  // Wanhua Chemical Group (LPG/gas-carrier JV partner)
]);

const ALL_ADNOC_IDS = new Set([...ADNOC_CORE_PLAYER_IDS, ...ADNOC_AFFILIATE_PLAYER_IDS]);

// Trading entities — queried via /api/trades?players=...
const ADNOC_TRADING_PLAYER_IDS = [1832, 1834, 4046, 1833];

// Name regex fallback for entities not in the ID set
const ADNOC_NAME_RE = /\b(adnoc|adnatco|ngsco|takreer|adco|zadco|fertil|al hamra ltd|al khaznah|ghasha inc|ish inc|mraweh|mubaraz|shahamah|umm al ashtan|admic|navig8|wanhua chemical)\b/i;

function classifyPlayerTier(p) {
  if (!p) return null;
  if (ADNOC_CORE_PLAYER_IDS.has(p.id)) return 'core';
  if (ADNOC_AFFILIATE_PLAYER_IDS.has(p.id)) return 'affiliate';
  const name = p.fullname || p.name || '';
  if (!ADNOC_NAME_RE.test(name)) return null;
  // Regex-matched but not in ID set — default to core (safer assumption for ADNOC-named SPVs)
  if (/navig8|wanhua/i.test(name)) return 'affiliate';
  return 'core';
}

// ---------- Token ----------

let TOKEN = process.env.KPLER_ACCESS_TOKEN;
if (!TOKEN && fs.existsSync(TOKEN_PATH)) {
  TOKEN = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
  console.log('[classify-adnoc] Read token from soh-data/.token.txt');
}
if (!TOKEN) {
  console.error('ERROR: Set KPLER_ACCESS_TOKEN env var or save token to soh-data/.token.txt');
  process.exit(1);
}

// ---------- Token refresh via Chrome DevTools Protocol ----------
// (adapted from scripts/sync-flows.js:111-158)

async function refreshToken() {
  try {
    const http = require('http');
    let WebSocket;
    try { WebSocket = require('ws'); } catch { console.log('[classify-adnoc]   ws module not available, cannot refresh token'); return false; }

    const pages = await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:9222/json', res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    const page = pages.find(p => p.url.includes('kpler.com')) || pages[0];
    if (!page) { console.log('[classify-adnoc]   No Kpler page found in Chrome'); return false; }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    const newToken = await new Promise((resolve, reject) => {
      ws.send(JSON.stringify({
        id: 1, method: 'Runtime.evaluate',
        params: {
          expression: 'JSON.parse(localStorage.getItem("@@auth0spajs@@::0LglhXfJvfepANl3HqVT9i1U0OwV0gSP::https://terminal.kpler.com::openid profile email offline_access")).body.access_token',
          returnByValue: true
        }
      }));
      ws.on('message', m => {
        const d = JSON.parse(m);
        if (d.id === 1 && d.result?.result?.value) resolve(d.result.result.value);
      });
      setTimeout(() => reject(new Error('Timeout')), 10000);
    });
    ws.close();

    if (newToken && newToken.length > 100) {
      TOKEN = newToken;
      fs.writeFileSync(TOKEN_PATH, newToken);
      console.log('[classify-adnoc]   Token refreshed successfully');
      return true;
    }
    return false;
  } catch (e) {
    console.log('[classify-adnoc]   Token refresh failed:', e.message);
    return false;
  }
}

// ---------- HTTP ----------

function kplerGetRaw(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'x-access-token': TOKEN,
        'use-access-token': 'true',
        'accept': 'application/json',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode === 401) { reject(new Error('TOKEN_EXPIRED')); return; }
        if (res.statusCode !== 200) {
          reject(new Error(`GET ${urlPath} → ${res.statusCode}: ${body.substring(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`GET ${urlPath} → invalid JSON`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// GET with automatic token-refresh retry on 401 (up to 2 refreshes)
async function kplerGet(urlPath) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await kplerGetRaw(urlPath);
    } catch (e) {
      if (e.message !== 'TOKEN_EXPIRED' || attempt === 2) throw e;
      console.log(`[classify-adnoc]   Token expired (attempt ${attempt + 1}), refreshing...`);
      const oldPrefix = TOKEN.slice(0, 20);
      const ok = await refreshToken();
      if (!ok) throw new Error('Token refresh failed');
      if (TOKEN.slice(0, 20) === oldPrefix) {
        console.log('[classify-adnoc]   Refresh returned same token — waiting 2s for Chrome to rotate...');
        await sleep(2000);
        await refreshToken();
      }
      await sleep(500);
    }
  }
  throw new Error('Exhausted retries');
}

// ---------- Classification helpers ----------

function isADNOCPlayer(p) { return classifyPlayerTier(p) !== null; }

// Roles on a vessel where an ADNOC player could appear
const ROLE_FIELDS = [
  { role: 'controller',         path: ['vesselController', 'default'] },
  { role: 'owner',              path: ['players', 'owners'],              isArray: true },
  { role: 'beneficialOwner',    path: ['players', 'beneficialOwners'],    isArray: true },
  { role: 'manager',            path: ['players', 'managers'],            isArray: true },
  { role: 'operator',           path: ['players', 'operators'],           isArray: true },
  { role: 'commercialManager',  path: ['players', 'commercialManagers'],  isArray: true },
  { role: 'thirdPartyOperator', path: ['players', 'thirdPartyOperators'], isArray: true },
];

function getPath(obj, path) {
  let cur = obj;
  for (const k of path) { if (cur == null) return null; cur = cur[k]; }
  return cur;
}

function classifyVesselByOwnership(v) {
  const matchedPlayers = [];
  const roles = new Set();
  for (const { role, path, isArray } of ROLE_FIELDS) {
    const node = getPath(v, path);
    if (!node) continue;
    const candidates = isArray ? node : [node];
    for (const p of candidates) {
      const tier = classifyPlayerTier(p);
      if (tier) {
        roles.add(role);
        matchedPlayers.push({
          id: p.id, name: p.fullname || p.name, role, tier,
          share: p.share != null ? p.share : null,
        });
      }
    }
  }
  return { roles: [...roles], matchedPlayers };
}

// Scan all players on a vessel for ADNOC-like NAMES that aren't in the known ID set —
// surfaces candidates to add to ADNOC_FLEET_PLAYER_IDS.
function collectADNOClikeUnknownPlayers(v, sink) {
  for (const { path, isArray } of ROLE_FIELDS) {
    const node = getPath(v, path);
    if (!node) continue;
    const candidates = isArray ? node : [node];
    for (const p of candidates) {
      if (!p) continue;
      const name = p.fullname || p.name || '';
      if (ADNOC_NAME_RE.test(name) && !ALL_ADNOC_IDS.has(p.id)) {
        sink.set(p.id, { id: p.id, name });
      }
    }
  }
}

// ---------- Player-side classification (ownedFleet / controlledFleet) ----------
// The /api/vessels LIST endpoint does NOT populate `players.*` (only vesselController
// is available). To map owner/operator roles, we query each ADNOC player entity for
// its owned and controlled fleet.

async function classifyPlayerFleets(playerIds) {
  // vesselId → { ownedBy: Set<pid>, controlledBy: Set<pid>, share, tier }
  const byVessel = new Map();

  for (const pid of playerIds) {
    await sleep(300);
    console.log(`[classify-adnoc] Fetching fleet for player ${pid}...`);
    let player;
    try {
      player = await kplerGet(`/api/players/${pid}`);
    } catch (e) {
      console.error(`[classify-adnoc]   ERROR: ${e.message}`);
      continue;
    }
    const owned = player.ownedFleet?.vessels || [];
    const controlled = player.controlledFleet?.vessels || [];
    console.log(`[classify-adnoc]   ${player.name || pid}: owned=${owned.length}, controlled=${controlled.length}`);

    const tier = ADNOC_CORE_PLAYER_IDS.has(pid) ? 'core' : 'affiliate';
    for (const entry of owned) {
      const v = entry.vessel;
      if (!v?.id) continue;
      if (!byVessel.has(v.id)) byVessel.set(v.id, { ownedBy: new Map(), controlledBy: new Map(), share: entry.share, vesselInfo: v });
      byVessel.get(v.id).ownedBy.set(pid, tier);
    }
    for (const entry of controlled) {
      const v = entry.vessel;
      if (!v?.id) continue;
      if (!byVessel.has(v.id)) byVessel.set(v.id, { ownedBy: new Map(), controlledBy: new Map(), share: entry.share, vesselInfo: v });
      byVessel.get(v.id).controlledBy.set(pid, tier);
    }
  }
  return byVessel;
}

// ---------- Trade-side classification ----------

async function classifyTrades(tradingIds, tradesSize) {
  // vesselId → { charterer: Set<pid>, buyer: Set<pid>, seller: Set<pid>, counts, lastDate }
  const byVessel = new Map();

  for (const pid of tradingIds) {
    await sleep(500);
    console.log(`[classify-adnoc] Fetching trades for player ${pid} (size=${tradesSize})...`);
    let trades;
    try {
      trades = await kplerGet(`/api/trades?players=${pid}&size=${tradesSize}`);
    } catch (e) {
      console.error(`[classify-adnoc]   ERROR: ${e.message}`);
      continue;
    }
    console.log(`[classify-adnoc]   → ${trades.length} trades`);

    for (const t of trades) {
      const info = t.orgSpecificInfo?.default || {};
      const isCharterer = info.charterer?.id === pid;
      const isBuyer = (info.confirmedBuyers || []).some(b => b.id === pid);
      const isSeller = (info.confirmedSellers || []).some(s => s.id === pid);
      if (!isCharterer && !isBuyer && !isSeller) continue;

      const tradeStart = t.start || t.portCallOriginDate || null;

      for (const v of t.vessels || []) {
        if (!v?.id) continue;
        if (!byVessel.has(v.id)) {
          byVessel.set(v.id, {
            charterers: new Set(),
            buyers: new Set(),
            sellers: new Set(),
            tradesAsCharterer: 0,
            tradesAsBuyer: 0,
            tradesAsSeller: 0,
            lastTradeDate: null,
            // Trade responses embed currentOwners[] and currentBeneficialOwners[] on each vessel
            currentOwners: v.currentOwners || [],
            currentBeneficialOwners: v.currentBeneficialOwners || [],
            vesselInfo: { id: v.id, name: v.name, imo: v.imo, deadWeight: v.deadWeight, vesselType: v.vesselType, flagName: v.flagName },
          });
        }
        const rec = byVessel.get(v.id);
        if (isCharterer) { rec.charterers.add(pid); rec.tradesAsCharterer++; }
        if (isBuyer)     { rec.buyers.add(pid);     rec.tradesAsBuyer++; }
        if (isSeller)    { rec.sellers.add(pid);    rec.tradesAsSeller++; }
        if (tradeStart && (!rec.lastTradeDate || tradeStart > rec.lastTradeDate)) {
          rec.lastTradeDate = tradeStart;
        }
      }
    }
  }
  return byVessel;
}

// ---------- Main ----------

async function main() {
  console.log('=== classify-adnoc-vessels: discovering ADNOC-affiliated vessels ===\n');

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Step 1: Fetch vessel universe
  const vesselsPath = ZONE
    ? `/api/vessels?zones=${ZONE}&size=${VESSELS_SIZE}`
    : `/api/vessels?size=${VESSELS_SIZE}`;
  console.log(`[classify-adnoc] Fetching vessels: ${vesselsPath}`);
  let vessels;
  try {
    vessels = await kplerGet(vesselsPath);
  } catch (e) {
    console.error(`[classify-adnoc] ERROR fetching vessels: ${e.message}`);
    process.exit(1);
  }
  console.log(`[classify-adnoc] → ${vessels.length} vessels returned\n`);

  // Step 2: Controller classification from vessel list (vesselController.default only —
  // list endpoint does NOT include full players.* graph; that needs per-vessel detail calls)
  const byVesselId = new Map();
  const unknownADNOClike = new Map();
  for (const v of vessels) {
    collectADNOClikeUnknownPlayers(v, unknownADNOClike);
    const { roles, matchedPlayers } = classifyVesselByOwnership(v);
    if (roles.length === 0) continue;
    byVesselId.set(v.id, {
      id: v.id,
      imo: v.imo,
      name: v.name,
      deadWeight: v.deadWeight,
      vesselTypeClass: v.vesselTypeClass,
      flagName: v.flagName,
      currentController: v.vesselController?.default?.fullname || v.vesselController?.default?.name || null,
      relationships: new Set(roles),
      matchedPlayers,
    });
  }
  console.log(`[classify-adnoc] List-endpoint scan (controller): ${byVesselId.size} vessels matched\n`);

  // Step 3: Owner/operator classification via player fleet endpoint
  console.log('[classify-adnoc] Scanning player ownedFleet + controlledFleet...');
  const fleetMap = await classifyPlayerFleets([...ALL_ADNOC_IDS]);
  console.log(`[classify-adnoc] Player-fleet scan: ${fleetMap.size} vessels\n`);

  // Step 4: Trade classification
  console.log('[classify-adnoc] Scanning trades for charterer/buyer/seller roles...');
  const tradeMap = await classifyTrades(ADNOC_TRADING_PLAYER_IDS, TRADES_SIZE);
  console.log(`[classify-adnoc] Trade scan: ${tradeMap.size} vessels touched\n`);

  // Step 5: Merge player-fleet data into per-vessel records
  const vesselById = new Map(vessels.map(v => [v.id, v]));
  for (const [vid, rec] of fleetMap) {
    let record = byVesselId.get(vid);
    if (!record) {
      const v = vesselById.get(vid) || rec.vesselInfo;
      record = {
        id: v.id,
        imo: v.imo,
        name: v.name,
        deadWeight: v.deadWeight,
        vesselTypeClass: v.vesselTypeClass || v.vesselType || null,
        flagName: v.flagName || null,
        currentController: v.vesselController?.default?.fullname || v.vesselController?.default?.name || null,
        relationships: new Set(),
        matchedPlayers: [],
      };
      byVesselId.set(vid, record);
    }
    if (rec.ownedBy.size > 0) record.relationships.add('owner');
    if (rec.controlledBy.size > 0) record.relationships.add('operator');
    for (const [pid, tier] of rec.ownedBy)       record.matchedPlayers.push({ id: pid, role: 'owner',    tier, share: rec.share });
    for (const [pid, tier] of rec.controlledBy)  record.matchedPlayers.push({ id: pid, role: 'operator', tier, share: rec.share });
  }
  for (const [vid, rec] of tradeMap) {
    let record = byVesselId.get(vid);
    if (!record) {
      // Vessel not ownership-linked but appears on ADNOC trades
      const v = vesselById.get(vid) || rec.vesselInfo;
      record = {
        id: v.id,
        imo: v.imo,
        name: v.name,
        deadWeight: v.deadWeight,
        vesselTypeClass: v.vesselTypeClass || v.vesselType || null,
        flagName: v.flagName || null,
        currentController: v.vesselController?.default?.fullname || v.vesselController?.default?.name || null,
        relationships: new Set(),
        matchedPlayers: [],
      };
      byVesselId.set(vid, record);
    }
    if (rec.charterers.size > 0) record.relationships.add('charterer');
    if (rec.buyers.size > 0)     record.relationships.add('buyer');
    if (rec.sellers.size > 0)    record.relationships.add('seller');
    record.tradesAsCharterer = rec.tradesAsCharterer;
    record.tradesAsBuyer     = rec.tradesAsBuyer;
    record.tradesAsSeller    = rec.tradesAsSeller;
    record.lastTradeDate     = rec.lastTradeDate ? rec.lastTradeDate.slice(0, 10) : null;
    for (const pid of rec.charterers) record.matchedPlayers.push({ id: pid, role: 'charterer' });
    for (const pid of rec.buyers)     record.matchedPlayers.push({ id: pid, role: 'buyer' });
    for (const pid of rec.sellers)    record.matchedPlayers.push({ id: pid, role: 'seller' });

    // Check trade-embedded currentOwners / currentBeneficialOwners against ADNOC ID set
    for (const owner of (rec.currentOwners || [])) {
      const tier = classifyPlayerTier(owner);
      if (tier) {
        record.relationships.add('owner');
        record.matchedPlayers.push({ id: owner.id, name: owner.fullname || owner.name, role: 'owner', tier, share: owner.share });
      }
    }
    for (const owner of (rec.currentBeneficialOwners || [])) {
      const tier = classifyPlayerTier(owner);
      if (tier) {
        record.relationships.add('beneficialOwner');
        record.matchedPlayers.push({ id: owner.id, name: owner.fullname || owner.name, role: 'beneficialOwner', tier, share: owner.share });
      }
    }
  }

  // Step 5b: Optional --deep enrichment — fetch per-vessel detail for trade-linked
  // vessels to catch ADNOC-owned vessels missed by Kpler's capped player-fleet endpoint
  if (DEEP) {
    const candidates = new Set([...tradeMap.keys(), ...fleetMap.keys()]);
    // Also include vessel IDs for IMOs in adnoc-fleet.json (manual config) that match vessel list
    const configPath = path.join(__dirname, '..', 'adnoc-fleet.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')).vessels || [];
      const imoSet = new Set(cfg.map(c => c.imo));
      for (const v of vessels) if (v.imo && imoSet.has(v.imo)) candidates.add(v.id);
    }
    const candidateIds = [...candidates];
    console.log(`[classify-adnoc] --deep enrichment: fetching detail for ${candidateIds.length} candidate vessels (trades + fleet + config)...`);
    let enriched = 0;
    for (let i = 0; i < candidateIds.length; i++) {
      const vid = candidateIds[i];
      if (i > 0 && i % 50 === 0) console.log(`[classify-adnoc]   ${i}/${candidateIds.length} (+${enriched} new matches)...`);
      await sleep(100);
      let detail;
      try {
        detail = await kplerGet(`/api/vessels/${vid}`);
      } catch (e) {
        continue;
      }
      const { roles, matchedPlayers } = classifyVesselByOwnership(detail);
      if (roles.length === 0) continue;
      let record = byVesselId.get(vid);
      if (!record) {
        record = {
          id: detail.id,
          imo: detail.imo,
          name: detail.name,
          deadWeight: detail.deadWeight,
          vesselTypeClass: detail.vesselTypeClass || null,
          flagName: detail.flagName || null,
          currentController: detail.vesselController?.default?.fullname || detail.vesselController?.default?.name || null,
          relationships: new Set(),
          matchedPlayers: [],
        };
        byVesselId.set(vid, record);
        enriched++;
      }
      for (const role of roles) record.relationships.add(role);
      for (const mp of matchedPlayers) record.matchedPlayers.push(mp);
    }
    console.log(`[classify-adnoc] --deep: processed ${candidateIds.length} vessels, added ${enriched} new records\n`);
  }

  // Step 6: Build output — assign primaryRelationship (strongest tie wins)
  const PRIORITY = ['owner', 'beneficialOwner', 'controller', 'operator', 'manager', 'commercialManager', 'thirdPartyOperator', 'charterer', 'buyer', 'seller'];
  const FLEET_ROLES = new Set(['owner', 'beneficialOwner', 'controller', 'operator', 'manager', 'commercialManager', 'thirdPartyOperator', 'charterer']);

  // Build a playerId → name lookup from all observed matches
  const playerNameById = new Map();
  for (const rec of byVesselId.values()) {
    for (const mp of rec.matchedPlayers) {
      if (mp.id && mp.name) playerNameById.set(mp.id, mp.name);
    }
  }

  const vesselRecords = [...byVesselId.values()].map(r => {
    const rels = [...r.relationships].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
    const isFleet = rels.some(role => FLEET_ROLES.has(role));
    // Deduplicate matchedPlayers by (id, role), backfill names/tier from lookup
    const seen = new Set();
    const dedupedPlayers = [];
    let hasCore = false, hasAffiliate = false;
    for (const mp of r.matchedPlayers) {
      const k = `${mp.id}|${mp.role}`;
      // Determine tier (from record, or by classifying the player ID now)
      const tier = mp.tier
        || (ADNOC_CORE_PLAYER_IDS.has(mp.id) ? 'core'
            : ADNOC_AFFILIATE_PLAYER_IDS.has(mp.id) ? 'affiliate'
            : null);
      if (tier === 'core') hasCore = true;
      if (tier === 'affiliate') hasAffiliate = true;
      if (seen.has(k)) continue;
      seen.add(k);
      dedupedPlayers.push({
        id: mp.id,
        name: mp.name || playerNameById.get(mp.id) || null,
        role: mp.role,
        tier,
        share: mp.share != null ? mp.share : null,
      });
    }
    const affiliation = hasCore && hasAffiliate ? 'mixed' : hasCore ? 'core' : hasAffiliate ? 'affiliate' : 'unknown';
    return {
      ...r,
      matchedPlayers: dedupedPlayers,
      relationships: rels,
      primaryRelationship: rels[0],
      affiliation,
      category: isFleet ? 'fleet' : 'tradeCounterpartyOnly',
    };
  }).sort((a, b) => {
    const aP = PRIORITY.indexOf(a.primaryRelationship);
    const bP = PRIORITY.indexOf(b.primaryRelationship);
    if (aP !== bP) return aP - bP;
    return (b.deadWeight || 0) - (a.deadWeight || 0);
  });

  const counts = {
    owned:                  vesselRecords.filter(r => r.relationships.includes('owner')).length,
    beneficialOwned:        vesselRecords.filter(r => r.relationships.includes('beneficialOwner')).length,
    controlled:             vesselRecords.filter(r => r.relationships.includes('controller')).length,
    managed:                vesselRecords.filter(r => r.relationships.includes('manager')).length,
    operated:               vesselRecords.filter(r => r.relationships.includes('operator')).length,
    commercialManaged:      vesselRecords.filter(r => r.relationships.includes('commercialManager')).length,
    charteredOnly:          vesselRecords.filter(r => r.relationships.includes('charterer') && !r.relationships.some(x => ['owner','beneficialOwner','controller','manager','operator','commercialManager','thirdPartyOperator'].includes(x))).length,
    tradeCounterpartyOnly:  vesselRecords.filter(r => (r.relationships.includes('buyer') || r.relationships.includes('seller')) && !r.relationships.includes('charterer') && !r.relationships.some(x => ['owner','beneficialOwner','controller','manager','operator','commercialManager','thirdPartyOperator'].includes(x))).length,
    total:                  vesselRecords.length,
  };

  const fleetVessels = vesselRecords.filter(v => v.category === 'fleet');
  const tradeOnlyVessels = vesselRecords.filter(v => v.category === 'tradeCounterpartyOnly');
  const fleetCore       = fleetVessels.filter(v => v.affiliation === 'core');
  const fleetMixed      = fleetVessels.filter(v => v.affiliation === 'mixed');
  const fleetAffiliate  = fleetVessels.filter(v => v.affiliation === 'affiliate');

  const output = {
    generatedAt: new Date().toISOString(),
    zone: ZONE || 'global',
    deepEnrichment: DEEP,
    playerIdsQueried: ADNOC_TRADING_PLAYER_IDS,
    adnocCorePlayerIds: [...ADNOC_CORE_PLAYER_IDS],
    adnocAffiliatePlayerIds: [...ADNOC_AFFILIATE_PLAYER_IDS],
    counts: {
      ...counts,
      fleet: fleetVessels.length,
      fleetCore: fleetCore.length,
      fleetMixed: fleetMixed.length,
      fleetAffiliate: fleetAffiliate.length,
      tradeCounterpartyOnly: tradeOnlyVessels.length,
    },
    fleet: { core: fleetCore, mixed: fleetMixed, affiliate: fleetAffiliate },
    tradeCounterpartyOnly: tradeOnlyVessels,
    unmatchedADNOClikePlayers: [...unknownADNOClike.values()],
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n[classify-adnoc] Wrote ${OUT_FILE}`);

  // Write Excel workbook with Fleet, Trade Counterparty, Unmatched Config sheets
  await writeExcel(output, fleetVessels, tradeOnlyVessels, vessels);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`  Total vessels classified: ${counts.total}`);
  console.log(`  Fleet: ${fleetVessels.length}`);
  console.log(`    core:       ${fleetCore.length}  (ADNOC-owned/controlled)`);
  console.log(`    mixed:      ${fleetMixed.length}  (ADNOC + affiliate tags)`);
  console.log(`    affiliate:  ${fleetAffiliate.length}  (Navig8/Wanhua only)`);
  console.log(`  Trade counterparty only: ${tradeOnlyVessels.length}`);
  console.log('  Roles:');
  console.log(`    owner:             ${counts.owned}`);
  console.log(`    beneficialOwner:   ${counts.beneficialOwned}`);
  console.log(`    controller:        ${counts.controlled}`);
  console.log(`    operator:          ${counts.operated}`);
  console.log(`    charteredOnly:     ${counts.charteredOnly}`);
  if (unknownADNOClike.size > 0) {
    console.log(`\n  ADNOC-like players NOT in known-ID set (review to extend):`);
    for (const p of unknownADNOClike.values()) console.log(`    - [${p.id}] ${p.name}`);
  }
}

// ---------- Excel output ----------

async function writeExcel(output, fleetVessels, tradeOnlyVessels, allVessels) {
  let XLSX;
  try { XLSX = require('xlsx'); }
  catch (e) {
    console.log('[classify-adnoc] xlsx module not available — skipping Excel output');
    return;
  }

  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryRows = [
    { Metric: 'Generated At',       Value: output.generatedAt },
    { Metric: 'Zone',               Value: output.zone },
    { Metric: 'Deep Enrichment',    Value: output.deepEnrichment ? 'Yes' : 'No' },
    { Metric: '',                   Value: '' },
    { Metric: 'Total Classified',   Value: output.counts.total },
    { Metric: 'Fleet (total)',      Value: output.counts.fleet },
    { Metric: '  Core',             Value: output.counts.fleetCore },
    { Metric: '  Mixed',            Value: output.counts.fleetMixed },
    { Metric: '  Affiliate only',   Value: output.counts.fleetAffiliate },
    { Metric: 'Trade Counterparty', Value: output.counts.tradeCounterpartyOnly },
    { Metric: '',                   Value: '' },
    { Metric: 'Role: owner',            Value: output.counts.owned },
    { Metric: 'Role: beneficialOwner',  Value: output.counts.beneficialOwned },
    { Metric: 'Role: controller',       Value: output.counts.controlled },
    { Metric: 'Role: operator',         Value: output.counts.operated },
    { Metric: 'Role: charterer only',   Value: output.counts.charteredOnly },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

  // Fleet sheet
  const fleetRows = fleetVessels.map(v => {
    const coreMatches = v.matchedPlayers.filter(p => p.tier === 'core');
    const affMatches  = v.matchedPlayers.filter(p => p.tier === 'affiliate');
    return {
      IMO: v.imo,
      Name: v.name,
      Affiliation: v.affiliation,
      'Primary Relationship': v.primaryRelationship,
      'All Relationships': v.relationships.join(', '),
      'Current Controller': v.currentController || '',
      DWT: v.deadWeight || '',
      'Vessel Type': v.vesselTypeClass || '',
      Flag: v.flagName || '',
      'Matched ADNOC Players': [...new Set(coreMatches.map(p => p.name).filter(Boolean))].join('; '),
      'Matched Affiliate Players': [...new Set(affMatches.map(p => p.name).filter(Boolean))].join('; '),
      'Trades as Charterer': v.tradesAsCharterer || 0,
      'Trades as Buyer': v.tradesAsBuyer || 0,
      'Trades as Seller': v.tradesAsSeller || 0,
      'Last Trade Date': v.lastTradeDate || '',
      'Kpler Vessel ID': v.id,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fleetRows), 'Fleet');

  // Trade Counterparty sheet
  const tradeRows = tradeOnlyVessels.map(v => ({
    IMO: v.imo,
    Name: v.name,
    DWT: v.deadWeight || '',
    'Vessel Type': v.vesselTypeClass || '',
    Flag: v.flagName || '',
    'Current Controller': v.currentController || '',
    Relationships: v.relationships.join(', '),
    'Trades as Buyer': v.tradesAsBuyer || 0,
    'Trades as Seller': v.tradesAsSeller || 0,
    'Last Trade Date': v.lastTradeDate || '',
    'Kpler Vessel ID': v.id,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tradeRows), 'Trade Counterparty');

  // Unmatched Config sheet — reconcile with adnoc-fleet.json
  const configPath = path.join(__dirname, '..', 'adnoc-fleet.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')).vessels || [];
    const classifiedIMOs = new Set([...fleetVessels, ...tradeOnlyVessels].map(x => x.imo));
    const vesselsByImo = new Map(allVessels.filter(v => v.imo).map(v => [v.imo, v]));
    const unmatched = config.filter(c => !classifiedIMOs.has(c.imo));
    const unmatchedRows = unmatched.map(c => {
      const kplerV = vesselsByImo.get(c.imo);
      return {
        IMO: c.imo,
        'Config Ownership': c.ownership || '',
        'In Kpler': kplerV ? 'Yes' : 'No',
        'Kpler Name': kplerV?.name || '',
        'Kpler Status': kplerV?.status || '',
        'Kpler Controller': kplerV?.vesselController?.default?.fullname || '',
        DWT: kplerV?.deadWeight || '',
        'Vessel Type': kplerV?.vesselTypeClass || '',
        Flag: kplerV?.flagName || '',
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedRows), 'Unmatched Config');
  }

  const xlsxPath = OUT_FILE.replace(/\.json$/, '.xlsx');
  XLSX.writeFile(wb, xlsxPath);
  console.log(`[classify-adnoc] Wrote ${xlsxPath}`);
}

main().catch(e => {
  console.error('[classify-adnoc] FATAL:', e.message);
  process.exit(1);
});
