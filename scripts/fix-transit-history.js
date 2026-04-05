#!/usr/bin/env node
/**
 * One-time fix for daily-transit-history.json
 *
 * Fixes:
 * 1. Relabels entries where date != comparedTo (off-by-one bug)
 * 2. Removes bogus gapDays=0 self-comparison entries
 * 3. Recovers missing dates by computing diffs from stored snapshots
 */

const fs = require('fs');
const path = require('path');

const SOH_DIR = path.join(__dirname, '..', 'soh-data');
const snapshotDir = path.join(SOH_DIR, '.daily-vessel-snapshots');
const histPath = path.join(SOH_DIR, 'daily-transit-history.json');

function classifyTransits(vessels) {
  let tanker = 0, bulk = 0, container = 0, other = 0;
  for (const v of vessels) {
    const t = (v.type || '').toLowerCase();
    if (t.includes('tanker')) tanker++;
    else if (t.includes('bulk')) bulk++;
    else if (t.includes('container')) container++;
    else other++;
  }
  return { tanker, bulk, container, other };
}

function vesselFromSnapshot(imo, snap) {
  return {
    name: snap.name || '', imo, type: snap.type || 'Unknown',
    commodity: snap.commodity || 'other', flag: snap.flag || '',
    destination: '', deadWeight: 0, speed: 0, state: '', controller: '',
  };
}

// --- Main ---
let history = [];
try { history = JSON.parse(fs.readFileSync(histPath, 'utf-8')); } catch {}

// Backup
fs.writeFileSync(histPath.replace('.json', '.backup.json'), JSON.stringify(history, null, 2));
console.log(`Backed up ${history.length} entries to daily-transit-history.backup.json`);

// Step 1: Relabel entries where date != comparedTo
for (const entry of history) {
  if (entry.date !== entry.comparedTo && entry.gapDays > 0) {
    console.log(`Relabel: ${entry.date} → ${entry.comparedTo} (${entry.exited} exits, ${entry.entered} entries)`);
    entry.date = entry.comparedTo;
  }
}

// Step 2: Remove bogus gapDays=0 entries
const beforeCount = history.length;
history = history.filter(h => h.gapDays !== 0);
if (history.length < beforeCount) {
  console.log(`Removed ${beforeCount - history.length} bogus gapDays=0 entries`);
}

// Step 3: Find missing dates from snapshots
const snapshotFiles = fs.readdirSync(snapshotDir).filter(f => f.endsWith('.json')).sort();
const dateGroups = {};
for (const f of snapshotFiles) {
  const date = f.substring(0, 10);
  dateGroups[date] = f; // last (latest) file per date wins
}
const dates = Object.keys(dateGroups).sort();
const existingDates = new Set(history.map(h => h.date));

let added = 0;
for (let i = 0; i < dates.length - 1; i++) {
  const dateA = dates[i]; // activity date
  const dateB = dates[i + 1];

  if (existingDates.has(dateA)) continue; // already have it

  console.log(`Recovering missing date: ${dateA} (from ${dateGroups[dateA]} vs ${dateGroups[dateB]})`);

  const snapA = JSON.parse(fs.readFileSync(path.join(snapshotDir, dateGroups[dateA]), 'utf-8'));
  const snapB = JSON.parse(fs.readFileSync(path.join(snapshotDir, dateGroups[dateB]), 'utf-8'));

  // Hormuz crossings
  const exitedVessels = [], enteredVessels = [];
  for (const [imo, curr] of Object.entries(snapB)) {
    const prev = snapA[imo];
    if (!prev) continue;
    if (prev.inside && !curr.inside) exitedVessels.push(vesselFromSnapshot(imo, curr));
    if (!prev.inside && curr.inside) enteredVessels.push(vesselFromSnapshot(imo, curr));
  }

  // Oman zone (outside = Gulf of Oman)
  const omanEntered = [];
  for (const [imo, curr] of Object.entries(snapB)) {
    if (curr.inside) continue;
    const prev = snapA[imo];
    if (!prev || prev.inside) omanEntered.push(vesselFromSnapshot(imo, curr));
  }
  const omanLeft = [];
  for (const [imo, prev] of Object.entries(snapA)) {
    if (prev.inside) continue;
    const curr = snapB[imo];
    if (!curr || curr.inside) omanLeft.push(vesselFromSnapshot(imo, prev));
  }

  const exitCounts = classifyTransits(exitedVessels);
  const enterCounts = classifyTransits(enteredVessels);
  const gapDays = Math.round((new Date(dateB) - new Date(dateA)) / 86400000);

  history.push({
    date: dateA, comparedTo: dateA, gapDays,
    exited: exitedVessels.length, entered: enteredVessels.length,
    tanker_exit: exitCounts.tanker, bulk_exit: exitCounts.bulk,
    container_exit: exitCounts.container, other_exit: exitCounts.other,
    tanker_enter: enterCounts.tanker, bulk_enter: enterCounts.bulk,
    container_enter: enterCounts.container, other_enter: enterCounts.other,
    exitedVessels, enteredVessels,
    omanEntered, omanLeft,
  });
  added++;
}

// Sort by date
history.sort((a, b) => a.date.localeCompare(b.date));

// Save
fs.writeFileSync(histPath, JSON.stringify(history, null, 2));

console.log(`\nResult: ${history.length} entries (${added} recovered)`);
for (const h of history) {
  console.log(`  ${h.date}: ${h.exited} exits, ${h.entered} entries, oman +${(h.omanEntered || []).length}/-${(h.omanLeft || []).length}`);
}
