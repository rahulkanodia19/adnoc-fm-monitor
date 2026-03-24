#!/usr/bin/env node
// ============================================================
// scripts/sync-data.js -- Daily data sync for ADNOC FM Monitor
// Called by GitHub Actions cron (midnight UTC / 4 AM UAE).
// Reads current data.js, calls Claude API, validates response,
// writes updated data.js + data-previous.json + sync-log.json.
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Anthropic = require('@anthropic-ai/sdk');

const ROOT = path.resolve(__dirname, '..');
const DATA_JS_PATH = path.join(ROOT, 'data.js');
const PREVIOUS_JSON_PATH = path.join(ROOT, 'data-previous.json');
const SYNC_LOG_PATH = path.join(ROOT, 'sync-log.json');

// ---------- System prompt (from api/sync.js) ----------

const SYSTEM_PROMPT = `You are an intelligence analyst monitoring the Strait of Hormuz / Gulf military escalation crisis (Feb-Mar 2026). Your task is to search for and compile the latest force majeure declarations, oil & gas shutdowns, and geopolitical events affecting energy infrastructure in the Middle East region.

Focus on:
- New force majeure declarations by energy/shipping companies
- Oil & gas facility shutdowns, attacks, or disruptions
- Country-level status changes (Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel)
- Production volume impacts and infrastructure damage
- Shipping disruptions through Strait of Hormuz

Return your findings as JSON matching this exact schema:
{
  "countryStatus": [
    {
      "id": "string",
      "country": "string",
      "flag": "emoji",
      "status": "stable|elevated|high|critical|conflict",
      "statusLabel": "string",
      "isNew": boolean,
      "summary": "string",
      "metrics": { "headline": "string", "productionOffline": "string", "keyFigure": "string" },
      "events": [{ "date": "YYYY-MM-DD", "title": "string", "description": "string", "isNew": boolean }],
      "oilGasImpact": { "severity": "none|low|moderate|severe|critical", "summary": "string", "details": "string" },
      "infrastructure": [{ "name": "string", "type": "string", "capacity": "string", "status": "operational|partial|shutdown" }],
      "sources": [{ "id": number, "title": "string", "url": "string", "date": "YYYY-MM-DD" }]
    }
  ],
  "fmDeclarations": [
    {
      "id": "string",
      "company": "string",
      "country": "string",
      "flag": "emoji",
      "date": "YYYY-MM-DD",
      "status": "active|partially_lifted|lifted",
      "statusLabel": "string",
      "isNew": boolean,
      "summary": "string",
      "details": { "volumeAffected": "string", "commodity": "string", "duration": "string", "reason": "string", "financialImpact": "string" },
      "sources": [{ "id": number, "title": "string", "url": "string", "date": "YYYY-MM-DD" }]
    }
  ],
  "shutdowns": [
    {
      "id": "string",
      "company": "string",
      "country": "string",
      "flag": "emoji",
      "date": "YYYY-MM-DD",
      "status": "shutdown|struck|ongoing|halted|suspended|resumed",
      "statusLabel": "string",
      "isNew": boolean,
      "summary": "string",
      "details": { "volumeAffected": "string", "commodity": "string", "duration": "string", "reason": "string", "financialImpact": "string" },
      "sources": [{ "id": number, "title": "string", "url": "string", "date": "YYYY-MM-DD" }]
    }
  ]
}

Mark items as isNew: true if they occurred in the last 48 hours.
Include verified sources with real URLs where possible.
Return ONLY valid JSON, no additional text.`;

// ---------- Parse current data.js ----------

function parseCurrentData() {
  const raw = fs.readFileSync(DATA_JS_PATH, 'utf-8');

  // data.js uses global `const` declarations. We use vm to extract them safely.
  const evalCode = raw
    .replace(/^const LAST_UPDATED/m, 'this.LAST_UPDATED')
    .replace(/^const COUNTRY_STATUS_DATA/m, 'this.COUNTRY_STATUS_DATA')
    .replace(/^const FM_DECLARATIONS_DATA/m, 'this.FM_DECLARATIONS_DATA')
    .replace(/^const SHUTDOWNS_NO_FM_DATA/m, 'this.SHUTDOWNS_NO_FM_DATA');

  const sandbox = {};
  vm.runInNewContext(evalCode, sandbox);

  return {
    lastUpdated: sandbox.LAST_UPDATED,
    countryStatus: sandbox.COUNTRY_STATUS_DATA,
    fmDeclarations: sandbox.FM_DECLARATIONS_DATA,
    shutdowns: sandbox.SHUTDOWNS_NO_FM_DATA,
  };
}

// ---------- Save previous data ----------

function savePreviousData(data) {
  fs.writeFileSync(PREVIOUS_JSON_PATH, JSON.stringify(data, null, 2));
}

// ---------- Call Claude API ----------

async function fetchNewData() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const client = new Anthropic({ apiKey });
  const today = new Date().toISOString().split('T')[0];

  // Use streaming for large responses (required for >10 min operations)
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Search for the latest updates on the Gulf/Hormuz crisis as of ${today}. Look for any new force majeure declarations, facility attacks, production shutdowns, or status changes since the last update. Compile comprehensive data for all 8 monitored countries (Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel). Return the data as JSON.`,
      },
    ],
  });

  // Accumulate the streamed text
  let responseText = '';
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      responseText += event.delta.text;
    }
  }

  // Check for truncation via final message
  const finalMessage = await stream.finalMessage();
  if (finalMessage.stop_reason === 'max_tokens') {
    throw new Error('Claude response was truncated (hit max_tokens). The output JSON is incomplete.');
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    // Fallback: extract JSON from markdown code block
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      data = JSON.parse(jsonMatch[1].trim());
    } else {
      throw new Error('Could not parse JSON from Claude response');
    }
  }
  return data;
}

// ---------- Validate response ----------

function validateData(data) {
  const errors = [];

  if (!data.countryStatus || !Array.isArray(data.countryStatus)) {
    errors.push('Missing or invalid countryStatus array');
  } else if (data.countryStatus.length < 4) {
    errors.push(
      `Only ${data.countryStatus.length} countries returned (expected ~8)`
    );
  }

  if (!data.fmDeclarations || !Array.isArray(data.fmDeclarations)) {
    errors.push('Missing or invalid fmDeclarations array');
  }

  if (!data.shutdowns || !Array.isArray(data.shutdowns)) {
    errors.push('Missing or invalid shutdowns array');
  }

  // Validate required fields on each country
  if (data.countryStatus) {
    for (const c of data.countryStatus) {
      if (!c.id || !c.country || !c.status) {
        errors.push(`Country entry missing id/country/status: ${JSON.stringify(c).slice(0, 80)}`);
      }
      if (!c.events || !Array.isArray(c.events)) {
        errors.push(`Country "${c.country || c.id}" missing events array`);
      }
      if (!c.infrastructure || !Array.isArray(c.infrastructure)) {
        errors.push(`Country "${c.country || c.id}" missing infrastructure array`);
      }
      if (!c.oilGasImpact) {
        errors.push(`Country "${c.country || c.id}" missing oilGasImpact`);
      }
    }
  }

  // Validate required fields on each FM declaration
  if (data.fmDeclarations) {
    for (const fm of data.fmDeclarations) {
      if (!fm.id || !fm.company || !fm.date || !fm.status) {
        errors.push(`FM entry missing required fields: ${JSON.stringify(fm).slice(0, 80)}`);
      }
      if (!fm.details) {
        errors.push(`FM "${fm.company || fm.id}" missing details object`);
      }
    }
  }

  // Validate required fields on each shutdown
  if (data.shutdowns) {
    for (const sd of data.shutdowns) {
      if (!sd.id || !sd.company || !sd.date || !sd.status) {
        errors.push(`Shutdown entry missing required fields: ${JSON.stringify(sd).slice(0, 80)}`);
      }
      if (!sd.details) {
        errors.push(`Shutdown "${sd.company || sd.id}" missing details object`);
      }
    }
  }

  return errors;
}

// ---------- Generate data.js content ----------

function generateDataJS(data) {
  const now = new Date().toISOString();

  return `// ============================================================
// data.js -- ADNOC Force Majeure & Geopolitical Monitor
// Pre-populated monitoring data from verified intelligence
// Last updated: ${now}
// Context: Strait of Hormuz / Gulf military escalation
// Auto-generated by daily sync (GitHub Actions)
// ============================================================

const LAST_UPDATED = "${now}";

// ---------- TABLE 1: Country Status Matrix ----------
const COUNTRY_STATUS_DATA = ${JSON.stringify(data.countryStatus, null, 2)};

// ---------- TABLE 2: Force Majeure Declarations ----------
const FM_DECLARATIONS_DATA = ${JSON.stringify(data.fmDeclarations, null, 2)};

// ---------- TABLE 3: Shutdowns Without Formal FM ----------
const SHUTDOWNS_NO_FM_DATA = ${JSON.stringify(data.shutdowns, null, 2)};
`;
}

// ---------- Compute diff summary ----------

function computeDiffSummary(previousData, newData) {
  const prevCountryIds = new Set(
    (previousData.countryStatus || []).map((c) => c.id)
  );
  const newCountryIds = new Set(
    (newData.countryStatus || []).map((c) => c.id)
  );

  const prevFMIds = new Set(
    (previousData.fmDeclarations || []).map((f) => f.id)
  );
  const newFMIds = new Set(
    (newData.fmDeclarations || []).map((f) => f.id)
  );

  const prevSDIds = new Set(
    (previousData.shutdowns || []).map((s) => s.id)
  );
  const newSDIds = new Set(
    (newData.shutdowns || []).map((s) => s.id)
  );

  // Detect country status changes
  const statusChanges = [];
  const prevMap = new Map(
    (previousData.countryStatus || []).map((c) => [c.id, c])
  );
  for (const country of newData.countryStatus || []) {
    const old = prevMap.get(country.id);
    if (old && old.status !== country.status) {
      statusChanges.push({
        country: country.country,
        from: old.status,
        to: country.status,
      });
    }
  }

  return {
    countries: {
      previous: prevCountryIds.size,
      current: newCountryIds.size,
      added: [...newCountryIds].filter((id) => !prevCountryIds.has(id)),
      removed: [...prevCountryIds].filter((id) => !newCountryIds.has(id)),
    },
    fmDeclarations: {
      previous: prevFMIds.size,
      current: newFMIds.size,
      added: [...newFMIds].filter((id) => !prevFMIds.has(id)),
      removed: [...prevFMIds].filter((id) => !newFMIds.has(id)),
    },
    shutdowns: {
      previous: prevSDIds.size,
      current: newSDIds.size,
      added: [...newSDIds].filter((id) => !prevSDIds.has(id)),
      removed: [...prevSDIds].filter((id) => !newSDIds.has(id)),
    },
    statusChanges,
  };
}

// ---------- Write sync log ----------

function writeSyncLog(diffSummary, validationErrors, durationMs) {
  const log = {
    timestamp: new Date().toISOString(),
    success: validationErrors.length === 0,
    durationMs,
    validationErrors,
    diff: diffSummary,
  };
  fs.writeFileSync(SYNC_LOG_PATH, JSON.stringify(log, null, 2));
  return log;
}

// ---------- Main ----------

async function main() {
  const startTime = Date.now();
  console.log(`[sync] Starting data sync at ${new Date().toISOString()}`);

  // 1. Parse current data.js
  let previousData;
  try {
    previousData = parseCurrentData();
    console.log(
      `[sync] Current data: ${previousData.countryStatus.length} countries, ` +
        `${previousData.fmDeclarations.length} FMs, ` +
        `${previousData.shutdowns.length} shutdowns`
    );
  } catch (err) {
    console.error('[sync] Failed to parse current data.js:', err.message);
    process.exit(1);
  }

  // 2. Save previous data
  savePreviousData(previousData);
  console.log('[sync] Saved previous data to data-previous.json');

  // 3. Fetch new data from Claude API
  let newData;
  try {
    newData = await fetchNewData();
    console.log(
      `[sync] Claude returned: ${newData.countryStatus?.length || 0} countries, ` +
        `${newData.fmDeclarations?.length || 0} FMs, ` +
        `${newData.shutdowns?.length || 0} shutdowns`
    );
  } catch (err) {
    console.error('[sync] Claude API call failed:', err.message);
    writeSyncLog(
      { error: err.message },
      ['API call failed: ' + err.message],
      Date.now() - startTime
    );
    process.exit(1);
  }

  // 4. Validate response
  const validationErrors = validateData(newData);
  if (validationErrors.length > 0) {
    console.error('[sync] Validation errors:');
    validationErrors.forEach((e) => console.error(`  - ${e}`));
    writeSyncLog(
      computeDiffSummary(previousData, newData),
      validationErrors,
      Date.now() - startTime
    );
    console.error('[sync] Data.js NOT updated due to validation errors.');
    process.exit(1);
  }

  // 5. Write updated data.js
  const dataJSContent = generateDataJS(newData);
  fs.writeFileSync(DATA_JS_PATH, dataJSContent);
  console.log('[sync] Wrote updated data.js');

  // 6. Compute diff and write sync log
  const diffSummary = computeDiffSummary(previousData, newData);
  const log = writeSyncLog(diffSummary, [], Date.now() - startTime);

  console.log('[sync] Diff summary:');
  console.log(
    `  Countries: ${diffSummary.countries.previous} -> ${diffSummary.countries.current}` +
      (diffSummary.countries.added.length
        ? ` (+${diffSummary.countries.added.join(', ')})`
        : '') +
      (diffSummary.countries.removed.length
        ? ` (-${diffSummary.countries.removed.join(', ')})`
        : '')
  );
  console.log(
    `  FM Declarations: ${diffSummary.fmDeclarations.previous} -> ${diffSummary.fmDeclarations.current}` +
      (diffSummary.fmDeclarations.added.length
        ? ` (+${diffSummary.fmDeclarations.added.join(', ')})`
        : '') +
      (diffSummary.fmDeclarations.removed.length
        ? ` (-${diffSummary.fmDeclarations.removed.join(', ')})`
        : '')
  );
  console.log(
    `  Shutdowns: ${diffSummary.shutdowns.previous} -> ${diffSummary.shutdowns.current}` +
      (diffSummary.shutdowns.added.length
        ? ` (+${diffSummary.shutdowns.added.join(', ')})`
        : '') +
      (diffSummary.shutdowns.removed.length
        ? ` (-${diffSummary.shutdowns.removed.join(', ')})`
        : '')
  );
  if (diffSummary.statusChanges.length > 0) {
    console.log('  Status changes:');
    diffSummary.statusChanges.forEach((ch) =>
      console.log(`    ${ch.country}: ${ch.from} -> ${ch.to}`)
    );
  }

  console.log(`[sync] Completed successfully in ${log.durationMs}ms`);
}

main().catch((err) => {
  console.error('[sync] Unhandled error:', err);
  process.exit(1);
});
