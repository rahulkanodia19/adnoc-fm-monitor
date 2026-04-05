#!/usr/bin/env node
/**
 * check-premium-sources.js — Interactive pre-flight health check for premium data sources.
 *
 * Verifies that all 4 required premium platform tabs are open, authenticated, and
 * serving content BEFORE news sync runs. On failure, prompts the user to log in
 * and retry; only skips on explicit confirmation.
 *
 * Required targets:
 *   1. https://terminal.kpler.com/insight
 *   2. https://portal.rystadenergy.com/dashboards/detail/1047/0
 *   3. https://connect.spglobal.com/home
 *   4. https://core.spglobal.com/#platts/landingpage
 *
 * Behavior:
 *   - Interactive (TTY attached): loop [Enter]/skip/abort per failed target.
 *   - Non-interactive (no TTY, e.g. Task Scheduler): fail fast, exit non-zero.
 *
 * Output: premium-source-health.json
 * Exit: 0 if all ok (or all failures explicitly skipped); 1 if user aborts or non-interactive failure.
 *
 * Usage: node scripts/check-premium-sources.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEBUG_PORT = 9222;
const OUT_FILE = path.join(__dirname, '..', 'premium-source-health.json');

const TARGETS = [
  { name: 'Kpler Insight', host: 'terminal.kpler.com',      url: 'https://terminal.kpler.com/insight',                                minContent: 500,  navigateMs: 7000 },
  // Rystad's ME Conflict dashboard is a Power BI embed — real content lives in an iframe,
  // outer shell is ~300-400 chars. We check non-auth + check for powerbi.com page in tab list.
  { name: 'Rystad ME',     host: 'portal.rystadenergy.com', url: 'https://portal.rystadenergy.com/dashboards/detail/1047/0',         minContent: 200,  navigateMs: 10000, requireIframe: 'powerbi.com' },
  { name: 'S&P Connect',   host: 'connect.spglobal.com',    url: 'https://connect.spglobal.com/home',                                minContent: 500,  navigateMs: 7000 },
  { name: 'Platts Core',   host: 'core.spglobal.com',       url: 'https://core.spglobal.com/#platts/landingpage',                    minContent: 500,  navigateMs: 7000 },
];

const AUTH_INDICATORS = [
  'signin.spglobal.com', '/authorize', '/login', 'okta.com', 'auth/realms',
  'auth0.com', '/u/login', '/signin', 'login.microsoftonline.com',
];

// ---------- CDP helpers (reused pattern from fetch-premium-sources.js) ----------

function getPages() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${DEBUG_PORT}/json`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse Chrome pages')); }
      });
    }).on('error', () => reject(new Error('Chrome not reachable on port ' + DEBUG_PORT)));
  });
}

function openNewTab(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${DEBUG_PORT}/json/new?${url}`,
      { method: 'PUT' },
      r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } }); }
    );
    req.on('error', reject);
    req.end();
  });
}

function connectPage(page) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', e => reject(e));
    setTimeout(() => reject(new Error('WebSocket connect timeout')), 10000);
  });
}

function evaluate(ws, expression, id = 1) {
  return new Promise((resolve) => {
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    const handler = m => {
      const d = JSON.parse(m);
      if (d.id === id) {
        ws.removeListener('message', handler);
        resolve(d.result?.result?.value ?? null);
      }
    };
    ws.on('message', handler);
    setTimeout(() => { ws.removeListener('message', handler); resolve(null); }, 10000);
  });
}

function navigate(ws, url, waitMs = 7000, id = 99) {
  return new Promise((resolve) => {
    ws.send(JSON.stringify({ id, method: 'Page.navigate', params: { url } }));
    setTimeout(resolve, waitMs);
  });
}

// ---------- Health check per target ----------

async function checkTarget(target) {
  let pages;
  try {
    pages = await getPages();
  } catch (e) {
    return { status: 'error', message: `Chrome not reachable on port ${DEBUG_PORT}. Start Chrome with --remote-debugging-port=${DEBUG_PORT}.`, landedAt: '', contentLength: 0 };
  }

  let page = pages.find(p => (p.url || '').includes(target.host));
  let tabWasOpened = false;

  if (!page) {
    console.log(`[premium-check] ${target.name}: no tab found — opening ${target.url}`);
    await openNewTab(target.url);
    await new Promise(r => setTimeout(r, 3000));
    pages = await getPages();
    page = pages.find(p => (p.url || '').includes(target.host));
    tabWasOpened = true;
    if (!page) {
      return { status: 'no_tab', message: `Could not open tab for ${target.host}.`, landedAt: '', contentLength: 0 };
    }
  }

  let ws;
  try {
    ws = await connectPage(page);
  } catch (e) {
    return { status: 'error', message: `CDP connect failed: ${e.message}`, landedAt: page.url || '', contentLength: 0 };
  }

  // Navigate to required URL if tab is on a different path
  const needsNavigate = tabWasOpened || !(page.url || '').includes(target.url.split('#')[0].split('?')[0]);
  if (needsNavigate) {
    await navigate(ws, target.url, target.navigateMs || 7000);
  }

  const landedAt = await evaluate(ws, 'window.location.href') || '';
  const contentLength = await evaluate(ws, 'document.body?.innerText?.length || 0') || 0;

  ws.close();

  // Auth-redirect detection
  const lc = landedAt.toLowerCase();
  if (AUTH_INDICATORS.some(ind => lc.includes(ind))) {
    return {
      status: 'login_required',
      message: `Landed on auth page: ${landedAt}`,
      landedAt,
      contentLength,
    };
  }

  const minContent = target.minContent || 500;
  if (contentLength < minContent) {
    return {
      status: 'empty',
      message: `Page loaded but content is sparse (${contentLength} chars, need ≥${minContent}). Likely SPA still loading or blocked.`,
      landedAt,
      contentLength,
    };
  }

  // For Rystad (iframe-based Power BI), also verify the embedded iframe target exists
  if (target.requireIframe) {
    const freshPages = await getPages().catch(() => []);
    const iframeFound = freshPages.some(p => (p.url || '').includes(target.requireIframe));
    if (!iframeFound) {
      return {
        status: 'empty',
        message: `Outer page OK but required iframe (${target.requireIframe}) not loaded yet. Wait and retry.`,
        landedAt,
        contentLength,
      };
    }
  }

  return { status: 'ok', message: `OK (${contentLength} chars${target.requireIframe ? ' + iframe' : ''})`, landedAt, contentLength };
}

// ---------- Interactive prompt helper ----------

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim().toLowerCase())));
}

function formatFailBlock(target, result, attempt) {
  const lines = [];
  lines.push('');
  lines.push(`[premium-check] ✗ ${target.name} — status: ${result.status}  (attempt ${attempt})`);
  lines.push(`  URL landed on:  ${result.landedAt || '(none)'}`);
  if (result.status === 'login_required') {
    lines.push(`  Please: open Chrome, log into ${target.host} (complete MFA/SSO), then return here.`);
  } else if (result.status === 'no_tab') {
    lines.push(`  Please: open ${target.url} in Chrome manually, then return here.`);
  } else if (result.status === 'empty') {
    lines.push(`  Please: wait for ${target.host} to finish loading in Chrome, then return here.`);
  } else {
    lines.push(`  ${result.message}`);
  }
  return lines.join('\n');
}

// ---------- Main ----------

async function main() {
  console.log('');
  console.log('[premium-check] ════════════════════════════════════════════');
  console.log('[premium-check] Premium source pre-flight health check');
  console.log('[premium-check] Targets: Kpler Insight, Rystad ME, S&P Connect, Platts Core');
  console.log('[premium-check] ════════════════════════════════════════════');

  const isInteractive = process.stdin.isTTY === true;
  if (!isInteractive) {
    console.log('[premium-check] (non-interactive mode: will fail-fast on any error)');
  }

  const results = [];
  const rl = isInteractive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  let userAborted = false;

  for (const target of TARGETS) {
    let attempt = 1;
    let result = await checkTarget(target);

    while (result.status !== 'ok') {
      if (!isInteractive) {
        console.log(`[premium-check] ✗ ${target.name}: ${result.status} — ${result.message}`);
        break;
      }

      console.log(formatFailBlock(target, result, attempt));
      const answer = await prompt(rl,
        `\n  Press [Enter] to re-check, type 'skip' to proceed without this source, or 'abort' to stop the sync: `);

      if (answer === 'abort') {
        userAborted = true;
        result = { ...result, status: 'aborted_by_user', message: 'User aborted pre-flight.', loginAttempts: attempt };
        break;
      }

      if (answer === 'skip') {
        const confirm = await prompt(rl,
          `  Are you sure? Skipping ${target.name} means the sync will run without this source for this cycle.\n  Type 'yes' to confirm: `);
        if (confirm === 'yes') {
          result = { ...result, status: 'skipped_by_user', message: `User skipped after ${attempt} attempt(s).`, loginAttempts: attempt };
          break;
        }
        console.log('  Skip cancelled — re-checking.');
      }

      attempt += 1;
      result = await checkTarget(target);
    }

    if (result.status === 'ok') {
      console.log(`[premium-check] ✓ ${target.name} — ${result.message}`);
    }

    results.push({
      name: target.name,
      url: target.url,
      status: result.status,
      landedAt: result.landedAt || '',
      contentLength: result.contentLength || 0,
      loginAttempts: result.loginAttempts || (result.status === 'ok' ? 1 : attempt),
      message: result.message || '',
    });

    if (userAborted) break;
  }

  if (rl) rl.close();

  // Write report
  const report = {
    checkedAt: new Date().toISOString(),
    interactive: isInteractive,
    aborted: userAborted,
    results,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

  console.log('');
  console.log('[premium-check] ────────────────────────────────────────────');
  const okCount = results.filter(r => r.status === 'ok').length;
  const skippedCount = results.filter(r => r.status === 'skipped_by_user').length;
  const failCount = results.length - okCount - skippedCount;
  console.log(`[premium-check] Summary: ${okCount} ok / ${skippedCount} skipped / ${failCount} failed`);
  console.log(`[premium-check] Report:  ${path.relative(process.cwd(), OUT_FILE)}`);

  if (userAborted) {
    console.log('[premium-check] User aborted — exiting non-zero.');
    process.exit(1);
  }

  if (!isInteractive && failCount > 0) {
    console.log('[premium-check] Non-interactive run had failures — exiting non-zero.');
    process.exit(1);
  }

  // All sources either ok or user-acknowledged skipped
  process.exit(0);
}

main().catch(e => {
  console.error('[premium-check] Unexpected error:', e.message);
  process.exit(1);
});
