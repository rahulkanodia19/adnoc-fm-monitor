// ============================================================
// app.js -- ADNOC Force Majeure & Geopolitical Monitor v3
// Light theme, bulleted events, metrics, NEW badges, API sync
// ============================================================

// ---------- Status Color Mapping (light theme) ----------
const STATUS_COLORS = {
  // Country statuses
  stable:    { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', pulse: false },
  elevated:  { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   pulse: false },
  high:      { dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     pulse: false },
  critical:  { dot: 'bg-red-600',     text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     pulse: true  },
  conflict:  { dot: 'bg-violet-500',  text: 'text-violet-700',  bg: 'bg-violet-50',   border: 'border-violet-200',  pulse: true  },
  // FM statuses
  active:           { dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     pulse: true  },
  partially_lifted: { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   pulse: false },
  lifted:           { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', pulse: false },
  extended:         { dot: 'bg-violet-500',  text: 'text-violet-700',  bg: 'bg-violet-50',   border: 'border-violet-200',  pulse: false },
  // Shutdown statuses
  ongoing:    { dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     pulse: true  },
  resumed:    { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', pulse: false },
  partial:    { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   pulse: false },
  planned:    { dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200',    pulse: false },
  shutdown:   { dot: 'bg-red-600',     text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     pulse: true  },
  halted:     { dot: 'bg-orange-500',  text: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-200',  pulse: false },
  struck:     { dot: 'bg-red-600',     text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     pulse: true  },
  suspended:  { dot: 'bg-violet-500',  text: 'text-violet-700',  bg: 'bg-violet-50',   border: 'border-violet-200',  pulse: false },
  operational:{ dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', pulse: false },
  restarted:  { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', pulse: false },
  fm_declared:{ dot: 'bg-red-600',     text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     pulse: true  },
};

const IMPACT_COLORS = {
  none:     { text: 'text-emerald-600', label: 'None' },
  low:      { text: 'text-blue-600',    label: 'Low' },
  moderate: { text: 'text-amber-600',   label: 'Moderate' },
  severe:   { text: 'text-orange-600',  label: 'Severe' },
  critical: { text: 'text-red-600',     label: 'Critical' },
};

// ---------- Helper Functions ----------

function renderStatusBadge(status, label) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.stable;
  const pulseClass = c.pulse ? 'status-pulse' : '';
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text} border ${c.border}">
    <span class="w-2 h-2 rounded-full ${c.dot} ${pulseClass}"></span>
    ${label}
  </span>`;
}

function renderImpactBadge(severity) {
  const c = IMPACT_COLORS[severity] || IMPACT_COLORS.none;
  return `<span class="${c.text} text-sm font-semibold">${c.label}</span>`;
}

function renderSourcesBadge(sources) {
  if (!sources || sources.length === 0) return '<span class="text-navy-400 text-sm">-</span>';
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-navy-100 text-navy-600 text-xs">
    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
    ${sources.length} source${sources.length > 1 ? 's' : ''}
  </span>`;
}

function renderSourcesList(sources) {
  if (!sources || sources.length === 0) return '';
  return sources.map(s => `
    <a href="${s.url}" target="_blank" rel="noopener noreferrer"
       class="source-link flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 py-1.5 px-2 rounded hover:bg-navy-50 -mx-2">
      <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
      <span class="flex-1">${s.title}</span>
      <span class="text-navy-400 text-xs flex-shrink-0">${s.date}</span>
    </a>
  `).join('');
}

function renderNewBadge() {
  return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200 ml-1.5">NEW</span>`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function sortByDateDesc(arr) {
  return [...arr].sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ---------- Expand/Collapse ----------

let expandedRowId = null;

function toggleExpand(id) {
  const detailRow = document.getElementById(`detail-${id}`);
  const chevron = document.getElementById(`chevron-${id}`);
  if (!detailRow) return;

  if (expandedRowId && expandedRowId !== id) {
    const prevDetail = document.getElementById(`detail-${expandedRowId}`);
    const prevChevron = document.getElementById(`chevron-${expandedRowId}`);
    if (prevDetail) {
      prevDetail.classList.add('hidden');
      prevDetail.querySelector('.detail-row')?.classList.replace('expanded', 'collapsed');
    }
    if (prevChevron) prevChevron.classList.remove('rotated');
  }

  const isHidden = detailRow.classList.contains('hidden');
  if (isHidden) {
    detailRow.classList.remove('hidden');
    const inner = detailRow.querySelector('.detail-row');
    if (inner) {
      inner.classList.remove('collapsed');
      inner.classList.add('expanded');
    }
    chevron?.classList.add('rotated');
    expandedRowId = id;
  } else {
    const inner = detailRow.querySelector('.detail-row');
    if (inner) {
      inner.classList.remove('expanded');
      inner.classList.add('collapsed');
    }
    setTimeout(() => detailRow.classList.add('hidden'), 350);
    chevron?.classList.remove('rotated');
    expandedRowId = null;
  }
}

// ---------- Executive Summary ----------

function formatNum(n) {
  if (n === 0) return '0';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(1);
}

function renderProductionTable(title, unit, rows, type) {
  const isCapacity = (type === 'capacity');
  const headers = isCapacity
    ? '<th class="px-2 py-2 sm:px-3 sm:py-2.5 text-right">Capacity</th><th class="px-2 py-2 sm:px-3 sm:py-2.5 text-right">Affected</th><th class="px-2 py-2 sm:px-3 sm:py-2.5 text-right">Available</th>'
    : '<th class="px-2 py-2 sm:px-3 sm:py-2.5 text-right">Pre-War</th><th class="px-2 py-2 sm:px-3 sm:py-2.5 text-right">Now</th><th class="px-2 py-2 sm:px-3 sm:py-2.5 text-right">Change</th>';

  let totalA = 0, totalB = 0, totalC = 0;

  const rowsHtml = rows.map((r, i) => {
    let a, b, c;
    if (isCapacity) {
      a = r.capacity; b = r.affected; c = r.available;
    } else {
      a = r.preWar; b = r.current; c = r.current - r.preWar;
    }
    totalA += a; totalB += b;
    if (isCapacity) totalC += c; else totalC += c;

    const changeClass = (!isCapacity && c < 0) ? 'text-red-600 font-semibold' : (c > 0 ? 'text-emerald-600 font-semibold' : 'text-navy-500');
    const changeStr = isCapacity ? formatNum(c) : (c <= 0 ? formatNum(c) : '+' + formatNum(c));
    const rowBg = i % 2 === 1 ? 'bg-navy-50/50' : '';

    return `<tr class="${rowBg}">
      <td class="px-2 py-1.5 sm:px-3 sm:py-2 text-sm">${r.country}</td>
      <td class="px-2 py-1.5 sm:px-3 sm:py-2 text-sm text-right tabular-nums text-navy-900 font-medium">${formatNum(a)}</td>
      <td class="px-2 py-1.5 sm:px-3 sm:py-2 text-sm text-right tabular-nums ${isCapacity ? 'text-red-600' : ''} font-medium">${formatNum(b)}</td>
      <td class="px-2 py-1.5 sm:px-3 sm:py-2 text-sm text-right tabular-nums ${changeClass}">${changeStr}</td>
      <td class="px-2 py-1.5 sm:px-3 sm:py-2 text-xs text-navy-500 hidden sm:table-cell">${r.notes || ''}</td>
    </tr>`;
  }).join('');

  const totalChangeClass = (!isCapacity && totalC < 0) ? 'text-red-600 font-bold' : 'text-navy-900 font-bold';
  const totalChangeStr = isCapacity ? formatNum(totalC) : (totalC <= 0 ? formatNum(Math.round(totalC * 10) / 10) : '+' + formatNum(totalC));

  return `
    <div class="bg-white rounded-xl border border-navy-200 overflow-hidden">
      <div class="px-4 py-3 border-b border-navy-200 bg-navy-50">
        <h3 class="text-sm font-bold text-navy-900">${title}</h3>
        <span class="text-xs text-navy-500">${unit}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left production-table">
          <thead>
            <tr class="border-b border-navy-200 bg-navy-100/50">
              <th class="px-2 py-2 sm:px-3 sm:py-2.5 text-xs text-navy-600 font-semibold uppercase tracking-wider">Country</th>
              ${headers}
              <th class="px-2 py-2 sm:px-3 sm:py-2.5 text-xs text-navy-600 font-semibold uppercase tracking-wider hidden sm:table-cell">Notes</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr class="border-t-2 border-navy-300 bg-navy-100/70">
              <td class="px-2 py-1.5 sm:px-3 sm:py-2.5 text-sm font-bold text-navy-900">TOTAL</td>
              <td class="px-2 py-1.5 sm:px-3 sm:py-2.5 text-sm text-right tabular-nums font-bold text-navy-900">${formatNum(Math.round(totalA * 10) / 10)}</td>
              <td class="px-2 py-1.5 sm:px-3 sm:py-2.5 text-sm text-right tabular-nums font-bold ${isCapacity ? 'text-red-600' : 'text-navy-900'}">${formatNum(Math.round(totalB * 10) / 10)}</td>
              <td class="px-2 py-1.5 sm:px-3 sm:py-2.5 text-sm text-right tabular-nums ${totalChangeClass}">${totalChangeStr}</td>
              <td class="px-2 py-1.5 sm:px-3 sm:py-2.5 hidden sm:table-cell"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function renderExecSummary() {
  const container = document.getElementById('exec-summary-content');
  if (!container) return;

  // Build production data arrays
  const oilData = [], gasData = [], refiningData = [], lngData = [];
  const prodNotes = {
    'Qatar': 'Ras Laffan offline; all downstream halted',
    'Kuwait': 'KPC FM declared; tankers blocked',
    'Saudi Arabia': 'Offshore fields shut; rerouting to Yanbu',
    'United Arab Emirates': 'Offshore offline; Fujairah suspended; >50% crude shut-in',
    'Iraq': 'Basra 3.3M→900k; FM on foreign fields',
    'Bahrain': 'Abu Safa shut; Sitra FM declared',
    'Oman': 'Outside Hormuz; production intact',
    'Israel': 'Leviathan+Karish shut; Tamar domestic',
    'Iran': 'South Pars struck; fields ~30% shut-in'
  };
  const refNotes = {
    'Saudi Arabia': 'Ras Tanura shut then reopened',
    'Iran': 'Tehran Refinery destroyed; BA curtailed',
    'Kuwait': 'Ahmadi + Abdullah hit by drones',
    'United Arab Emirates': 'Ruwais-2 shut (417 kb/d); 805 kb/d available',
    'Bahrain': 'Sitra FM; fully offline',
    'Iraq': 'Lanaz struck; storage-constrained throughput',
    'Israel': 'Haifa damaged but mostly online',
    'Qatar': 'Laffan 1+2 offline with Ras Laffan',
    'Oman': 'Outside Hormuz; operational'
  };
  const lngNotes = {
    'Qatar': 'Ras Laffan LNG fully offline; 77 Mtpa halted',
    'United Arab Emirates': 'Das Island LNG at minimal capacity; Hormuz blocked',
    'Oman': 'Outside Hormuz; LNG operational',
    'Iran': 'South Pars disrupted; LNG minimal',
  };

  COUNTRY_STATUS_DATA.forEach(c => {
    if (!c.production) return;
    const p = c.production;
    if (p.oil && p.oil.preWar > 0) {
      oilData.push({ country: c.country, flag: c.flag, preWar: p.oil.preWar, current: p.oil.current, notes: prodNotes[c.country] || '' });
    }
    if (p.gas && p.gas.preWar > 0) {
      gasData.push({ country: c.country, flag: c.flag, preWar: p.gas.preWar, current: p.gas.current, notes: prodNotes[c.country] || '' });
    }
    if (p.refining && p.refining.capacity > 0) {
      refiningData.push({ country: c.country, flag: c.flag, capacity: p.refining.capacity, affected: p.refining.affected, available: p.refining.available, notes: refNotes[c.country] || '' });
    }
    if (p.lng && p.lng.preWar > 0) {
      lngData.push({ country: c.country, flag: c.flag, preWar: p.lng.preWar, current: p.lng.current, notes: lngNotes[c.country] || '' });
    }
  });

  oilData.sort((a, b) => b.preWar - a.preWar);
  gasData.sort((a, b) => b.preWar - a.preWar);
  refiningData.sort((a, b) => b.capacity - a.capacity);
  lngData.sort((a, b) => b.preWar - a.preWar);

  container.innerHTML = `
    <div class="mb-5">
      <h2 class="text-lg font-bold text-navy-900">Regional Production Impact Assessment</h2>
      <p class="text-sm text-navy-500">Gulf Escalation: 28 Feb - 23 Mar 2026 | Sources: IEA, OPEC, Bloomberg, Reuters, Argus</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
      ${renderProductionTable('Crude Oil Production', 'kb/d', oilData, 'production')}
      ${renderProductionTable('Refining Capacity', 'kb/d', refiningData, 'capacity')}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      ${renderProductionTable('Gas Production', 'Bcf/d', gasData, 'production')}
      ${renderProductionTable('LNG Production', 'Mtpa', lngData, 'production')}
    </div>
  `;
}

// ---------- Country Matrix Rendering ----------

function renderCountryDetailPanel(country) {
  const timelineHtml = country.events.map(evt => {
    const newBadge = evt.isNew ? renderNewBadge() : '';
    const bgClass = evt.isNew ? 'bg-sky-50 rounded-lg p-2 -m-1' : '';
    return `
    <div class="timeline-line flex gap-3 pb-5">
      <div class="timeline-dot mt-1"></div>
      <div class="flex-1 ${bgClass}">
        <div class="flex items-center gap-2">
          <span class="text-xs text-amber-600 font-semibold">${formatDate(evt.date)}</span>
          ${newBadge}
        </div>
        <div class="text-sm text-navy-900 font-semibold mt-0.5">${evt.title}</div>
        <div class="text-sm text-navy-600 mt-1 leading-relaxed">${evt.description}</div>
      </div>
    </div>
  `;
  }).join('');

  const infraHtml = country.infrastructure.map(inf => {
    const statusColor = inf.status === 'operational' ? 'text-emerald-700 bg-emerald-50' : inf.status === 'partial' ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
    return `
      <tr class="border-b border-navy-100">
        <td class="py-2.5 pr-3 text-sm text-navy-900 font-medium">${inf.name}</td>
        <td class="py-2.5 pr-3 text-sm text-navy-600">${inf.type}</td>
        <td class="py-2.5 pr-3 text-sm text-navy-800 font-medium">${inf.capacity}</td>
        <td class="py-2.5 text-sm">
          <span class="px-2 py-0.5 rounded text-xs font-semibold ${statusColor}">${inf.status.charAt(0).toUpperCase() + inf.status.slice(1)}</span>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="detail-row collapsed">
      <div class="detail-panel bg-navy-50 p-3 sm:p-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          <div>
            <h4 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4 flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Event Timeline
            </h4>
            <div class="ml-1">${timelineHtml}</div>
          </div>
          <div class="space-y-6">
            <div>
              <h4 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                </svg>
                Oil & Gas Impact
              </h4>
              <div class="bg-white rounded-lg p-4 border border-navy-200">
                <div class="flex items-center gap-3 mb-3">
                  <span class="text-xs uppercase tracking-wider text-navy-500 font-medium">Severity:</span>
                  ${renderImpactBadge(country.oilGasImpact.severity)}
                </div>
                ${country.metrics ? `<p class="text-sm font-bold text-navy-900 mb-2">${country.metrics.headline}</p>` : ''}
                <p class="text-sm text-navy-700 leading-relaxed">${country.oilGasImpact.details}</p>
              </div>
            </div>
            ${country.production ? `<div>
              <h4 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                Production Data
              </h4>
              <div class="overflow-x-auto bg-white rounded-lg border border-navy-200">
                <table class="w-full text-left production-table">
                  <thead>
                    <tr class="border-b border-navy-200">
                      <th class="px-3 py-2 text-xs text-navy-500 font-semibold uppercase">Commodity</th>
                      <th class="px-3 py-2 text-xs text-navy-500 font-semibold uppercase text-right">Pre-War</th>
                      <th class="px-3 py-2 text-xs text-navy-500 font-semibold uppercase text-right">Current</th>
                      <th class="px-3 py-2 text-xs text-navy-500 font-semibold uppercase text-right">Change</th>
                      <th class="px-3 py-2 text-xs text-navy-500 font-semibold uppercase text-right">% Disrupted</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${country.production.oil && country.production.oil.preWar > 0 ? `<tr class="border-b border-navy-100">
                      <td class="px-3 py-2 text-sm text-navy-900 font-medium">Crude Oil</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums">${formatNum(country.production.oil.preWar)} ${country.production.oil.unit}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums font-medium">${formatNum(country.production.oil.current)} ${country.production.oil.unit}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums text-red-600 font-semibold">${formatNum(country.production.oil.current - country.production.oil.preWar)}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums text-red-600">${((country.production.oil.preWar - country.production.oil.current) / country.production.oil.preWar * 100).toFixed(1)}%</td>
                    </tr>` : ''}
                    ${country.production.gas && country.production.gas.preWar > 0 ? `<tr class="border-b border-navy-100">
                      <td class="px-3 py-2 text-sm text-navy-900 font-medium">Gas</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums">${formatNum(country.production.gas.preWar)} ${country.production.gas.unit}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums font-medium">${formatNum(country.production.gas.current)} ${country.production.gas.unit}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums text-red-600 font-semibold">${formatNum(country.production.gas.current - country.production.gas.preWar)}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums text-red-600">${((country.production.gas.preWar - country.production.gas.current) / country.production.gas.preWar * 100).toFixed(1)}%</td>
                    </tr>` : ''}
                    ${country.production.refining ? `<tr class="border-b border-navy-100">
                      <td class="px-3 py-2 text-sm text-navy-900 font-medium">Refining</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums">${formatNum(country.production.refining.capacity)} ${country.production.refining.unit}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums font-medium">${formatNum(country.production.refining.available)} ${country.production.refining.unit}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums text-red-600 font-semibold">-${formatNum(country.production.refining.affected)}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums text-red-600">${(country.production.refining.affected / country.production.refining.capacity * 100).toFixed(1)}%</td>
                    </tr>` : ''}
                    ${country.production.lng ? `<tr>
                      <td class="px-3 py-2 text-sm text-navy-900 font-medium">LNG</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums">${formatNum(country.production.lng.preWar)} ${country.production.lng.unit}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums font-medium">${formatNum(country.production.lng.current)} ${country.production.lng.unit}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums text-red-600 font-semibold">${formatNum(country.production.lng.current - country.production.lng.preWar)}</td>
                      <td class="px-3 py-2 text-sm text-right tabular-nums text-red-600">${country.production.lng.preWar > 0 ? ((country.production.lng.preWar - country.production.lng.current) / country.production.lng.preWar * 100).toFixed(1) + '%' : 'N/A'}</td>
                    </tr>` : ''}
                  </tbody>
                </table>
              </div>
            </div>` : ''}
            <div>
              <h4 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                Infrastructure & Facilities
              </h4>
              <div class="overflow-x-auto bg-white rounded-lg border border-navy-200">
                <table class="w-full text-left">
                  <thead>
                    <tr class="border-b border-navy-200">
                      <th class="px-3 py-2.5 text-xs text-navy-500 font-semibold uppercase tracking-wider">Facility</th>
                      <th class="px-3 py-2.5 text-xs text-navy-500 font-semibold uppercase tracking-wider">Type</th>
                      <th class="px-3 py-2.5 text-xs text-navy-500 font-semibold uppercase tracking-wider">Capacity</th>
                      <th class="px-3 py-2.5 text-xs text-navy-500 font-semibold uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-navy-100">${infraHtml}</tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                Sources
              </h4>
              <div class="bg-white rounded-lg p-3 border border-navy-200">
                ${renderSourcesList(country.sources)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCountryMatrix() {
  const container = document.getElementById('country-matrix-body');
  if (!container || typeof COUNTRY_STATUS_DATA === 'undefined') return;

  container.innerHTML = COUNTRY_STATUS_DATA.map(country => {
    const newBadge = country.isNew ? renderNewBadge() : '';
    const newRowClass = country.isNew ? 'new-row border-l-4 border-l-sky-400' : '';

    // Bulleted events list
    const eventsList = country.events.map(evt => {
      const evtNewBadge = evt.isNew ? renderNewBadge() : '';
      const evtBgClass = evt.isNew ? 'bg-sky-50 rounded px-1.5 py-0.5 -mx-1.5' : '';
      return `
        <li class="flex items-start gap-1.5 ${evtBgClass}">
          <span class="w-1.5 h-1.5 rounded-full bg-navy-400 mt-1.5 flex-shrink-0"></span>
          <span>
            <span class="text-navy-500 text-xs">${formatDateShort(evt.date)}</span>
            <span class="text-navy-800 text-sm ml-1">${evt.title}</span>
            ${evtNewBadge}
          </span>
        </li>
      `;
    }).join('');

    return `
    <tr class="data-row cursor-pointer ${newRowClass}" onclick="toggleExpand('${country.id}')">
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5">
        <div class="flex items-center gap-2.5">
          <span class="font-semibold text-navy-900">${country.country}</span>
          ${newBadge}
        </div>
      </td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5">${renderStatusBadge(country.status, country.statusLabel)}</td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 max-w-lg hidden md:table-cell">
        <ul class="space-y-1">
          ${eventsList}
        </ul>
      </td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5">
        <div>
          <div class="flex items-center gap-2 mb-1">
            ${renderImpactBadge(country.oilGasImpact.severity)}
          </div>
          <span class="text-navy-900 text-sm font-semibold">${country.metrics ? (country.metrics.productionOffline || country.metrics.headline) : ''}</span>
          <br>
          <span class="text-navy-500 text-xs">${country.oilGasImpact.summary}</span>
        </div>
      </td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 text-navy-600 text-sm hidden lg:table-cell">
        <span class="font-medium">${country.infrastructure.length}</span> facilities
      </td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 hidden sm:table-cell">${renderSourcesBadge(country.sources)}</td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5">
        <svg id="chevron-${country.id}" class="w-5 h-5 text-navy-400 chevron-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </td>
    </tr>
    <tr id="detail-${country.id}" class="hidden">
      <td colspan="7" class="p-0">${renderCountryDetailPanel(country)}</td>
    </tr>
  `;
  }).join('');
}

// ---------- FM Declarations Rendering ----------

function renderFMDetailPanel(item) {
  return `
    <div class="detail-row collapsed">
      <div class="detail-panel bg-navy-50 p-3 sm:p-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div class="lg:col-span-2">
            <h4 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4 flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              Declaration Details
            </h4>
            <div class="bg-white rounded-lg border border-navy-200 overflow-hidden">
              <div class="grid grid-cols-1 sm:grid-cols-2">
                <div class="p-3 sm:p-4 border-b sm:border-r border-navy-100">
                  <span class="text-xs text-navy-500 uppercase tracking-wider font-medium block mb-1">Volume Affected</span>
                  <p class="text-sm text-navy-900 font-medium leading-relaxed">${item.details.volumeAffected}</p>
                </div>
                <div class="p-3 sm:p-4 border-b border-navy-100">
                  <span class="text-xs text-navy-500 uppercase tracking-wider font-medium block mb-1">Commodity</span>
                  <p class="text-sm text-navy-900 font-medium">${item.details.commodity}</p>
                </div>
                <div class="p-3 sm:p-4 border-b sm:border-b-0 sm:border-r border-navy-100">
                  <span class="text-xs text-navy-500 uppercase tracking-wider font-medium block mb-1">Duration</span>
                  <p class="text-sm text-navy-900 font-medium">${item.details.duration}</p>
                </div>
                <div class="p-3 sm:p-4">
                  <span class="text-xs text-navy-500 uppercase tracking-wider font-medium block mb-1">Financial Impact</span>
                  <p class="text-sm text-navy-900 font-medium">${item.details.financialImpact || 'Not disclosed'}</p>
                </div>
              </div>
              <div class="p-3 sm:p-4 border-t border-navy-100 bg-navy-50">
                <span class="text-xs text-navy-500 uppercase tracking-wider font-medium block mb-1">Reason</span>
                <p class="text-sm text-navy-700 leading-relaxed">${item.details.reason}</p>
              </div>
            </div>
          </div>
          <div>
            <h4 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4 flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              Sources
            </h4>
            <div class="bg-white rounded-lg p-3 border border-navy-200">
              ${renderSourcesList(item.sources)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFMDeclarations() {
  const container = document.getElementById('fm-declarations-body');
  if (!container || typeof FM_DECLARATIONS_DATA === 'undefined') return;

  const sorted = sortByDateDesc(FM_DECLARATIONS_DATA);

  container.innerHTML = sorted.map(item => {
    const newBadge = item.isNew ? renderNewBadge() : '';
    const newRowClass = item.isNew ? 'new-row border-l-4 border-l-sky-400' : '';

    return `
    <tr class="data-row cursor-pointer ${newRowClass}" onclick="toggleExpand('${item.id}')">
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5">
        <span class="font-semibold text-navy-900">${item.company}</span>
        ${newBadge}
      </td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 hidden sm:table-cell">
        <span class="text-navy-600 text-sm">${item.country}</span>
      </td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 text-navy-700 text-sm font-medium">${formatDate(item.date)}</td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5">${renderStatusBadge(item.status, item.statusLabel)}</td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 text-sm max-w-sm hidden md:table-cell">
        ${item.details && item.details.volumeAffected ? `<p class="text-amber-600 font-semibold text-xs mb-0.5">${item.details.volumeAffected}</p>` : ''}
        <span class="text-navy-600 line-clamp-2">${item.summary}</span>
      </td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 hidden sm:table-cell">${renderSourcesBadge(item.sources)}</td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5">
        <svg id="chevron-${item.id}" class="w-5 h-5 text-navy-400 chevron-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </td>
    </tr>
    <tr id="detail-${item.id}" class="hidden">
      <td colspan="7" class="p-0">${renderFMDetailPanel(item)}</td>
    </tr>
  `;
  }).join('');
}

// ---------- Shutdowns Rendering ----------

function renderShutdowns() {
  const container = document.getElementById('shutdowns-body');
  if (!container || typeof SHUTDOWNS_NO_FM_DATA === 'undefined') return;

  const sorted = sortByDateDesc(SHUTDOWNS_NO_FM_DATA);

  container.innerHTML = sorted.map(item => {
    const newBadge = item.isNew ? renderNewBadge() : '';
    const newRowClass = item.isNew ? 'new-row border-l-4 border-l-sky-400' : '';

    return `
    <tr class="data-row cursor-pointer ${newRowClass}" onclick="toggleExpand('${item.id}')">
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5">
        <span class="font-semibold text-navy-900">${item.company}</span>
        ${newBadge}
      </td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 hidden sm:table-cell">
        <span class="text-navy-600 text-sm">${item.country}</span>
      </td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 text-navy-700 text-sm font-medium">${formatDate(item.date)}</td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5">${renderStatusBadge(item.status, item.statusLabel)}</td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 text-sm max-w-sm hidden md:table-cell">
        ${item.details && item.details.volumeAffected ? `<p class="text-amber-600 font-semibold text-xs mb-0.5">${item.details.volumeAffected}</p>` : ''}
        <span class="text-navy-600 line-clamp-2">${item.summary}</span>
      </td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5 hidden sm:table-cell">${renderSourcesBadge(item.sources)}</td>
      <td class="px-3 py-2.5 sm:px-5 sm:py-3.5">
        <svg id="chevron-${item.id}" class="w-5 h-5 text-navy-400 chevron-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </td>
    </tr>
    <tr id="detail-${item.id}" class="hidden">
      <td colspan="7" class="p-0">${renderFMDetailPanel(item)}</td>
    </tr>
  `;
  }).join('');
}

// ---------- Market News / SPR ----------

let sprChart = null;

function renderMarketNews() {
  const container = document.getElementById('market-news-content');
  if (!container || typeof SPR_RELEASE_DATA === 'undefined') return;

  const d = SPR_RELEASE_DATA;
  const pctReleased = ((d.totalReleased / d.totalCommitted) * 100).toFixed(1);
  const daysSinceAnnouncement = Math.floor((new Date(d.asOf) - new Date(d.announced)) / 86400000);

  // Compute released crude vs products from country-level data
  let releasedCrude = 0, releasedProducts = 0;
  d.countries.forEach(c => {
    if (c.released > 0 && c.committed > 0) {
      const crudeRatio = c.crude / c.committed;
      releasedCrude += c.released * crudeRatio;
      releasedProducts += c.released * (1 - crudeRatio);
    }
  });
  releasedCrude = +releasedCrude.toFixed(1);
  releasedProducts = +releasedProducts.toFixed(1);

  // Regional aggregation
  const regions = {};
  d.countries.forEach(c => {
    if (!regions[c.region]) regions[c.region] = { committed: 0, released: 0 };
    regions[c.region].committed += c.committed;
    regions[c.region].released += c.released;
  });

  // Top 10 by commitment
  const top10 = d.countries.slice(0, 10);

  // Sources HTML
  const sourcesHtml = d.sources.map(s =>
    `<a href="${s.url}" target="_blank" class="text-sky-600 hover:underline text-sm">${s.title}</a> <span class="text-navy-400 text-xs">(${new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})</span>`
  ).join(' &middot; ');

  container.innerHTML = `
    <div class="flow-fade-in">
      <div class="mb-5">
        <h2 class="text-lg font-bold text-navy-900 flex items-center gap-2">
          <svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6V7.5z" />
          </svg>
          SPR Status — IEA Emergency Release
        </h2>
        <p class="text-sm text-navy-500 mt-0.5">Coordinated release of strategic petroleum reserves by 30 IEA member countries | Announced ${new Date(d.announced).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-xl p-4 border border-navy-200 shadow-sm">
          <div class="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-1">Total Committed</div>
          <div class="text-3xl font-extrabold text-navy-900">${d.totalCommitted}</div>
          <div class="text-sm text-navy-400">million barrels</div>
          <div class="flex items-center gap-2 mt-2 text-xs">
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">${d.totalCrude} crude</span>
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">${d.totalProducts} refined products</span>
          </div>
        </div>
        <div class="bg-white rounded-xl p-4 border border-navy-200 shadow-sm">
          <div class="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-1">Released So Far</div>
          <div class="text-3xl font-extrabold text-emerald-600">~${d.totalReleased}</div>
          <div class="text-sm text-navy-400">million barrels (${pctReleased}%)</div>
          <div class="flex items-center gap-2 mt-2 text-xs">
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">${releasedCrude} crude</span>
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">${releasedProducts} refined products</span>
          </div>
        </div>
        <div class="bg-white rounded-xl p-4 border border-navy-200 shadow-sm">
          <div class="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-1">Crude / Refined Products</div>
          <div class="text-3xl font-extrabold text-sky-600">${d.totalCrude}<span class="text-base font-bold text-navy-400"> / </span><span class="text-2xl text-indigo-600">${d.totalProducts}</span></div>
          <div class="text-sm text-navy-400">mb crude / mb refined products</div>
          <div class="flex items-center gap-2 mt-2 text-xs">
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">${((d.totalCrude / d.totalCommitted) * 100).toFixed(0)}% crude</span>
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">${((d.totalProducts / d.totalCommitted) * 100).toFixed(0)}% refined products</span>
          </div>
        </div>
        <div class="bg-white rounded-xl p-4 border border-navy-200 shadow-sm">
          <div class="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-1">Release Window</div>
          <div class="text-3xl font-extrabold text-amber-600">${d.releasePeriodDays}</div>
          <div class="text-sm text-navy-400">days (Day ${daysSinceAnnouncement} of ${d.releasePeriodDays})</div>
        </div>
      </div>

      <!-- Overall Progress Bar -->
      <div class="bg-white rounded-xl p-5 border border-navy-200 shadow-sm mb-6">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-semibold text-navy-700">Overall Release Progress</span>
          <span class="text-sm font-bold text-navy-900">${d.totalReleased} / ${d.totalCommitted} mb (${pctReleased}%)</span>
        </div>
        <div class="w-full bg-navy-100 rounded-full h-4 overflow-hidden">
          <div class="bg-gradient-to-r from-sky-500 to-emerald-500 h-4 rounded-full transition-all" style="width: ${pctReleased}%"></div>
        </div>
      </div>

      <!-- Regional Breakdown -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        ${Object.entries(regions).map(([region, data]) => {
          const pct = data.committed > 0 ? ((data.released / data.committed) * 100).toFixed(1) : '0.0';
          return `
          <div class="bg-white rounded-xl p-4 border border-navy-200 shadow-sm">
            <div class="text-sm font-semibold text-navy-700 mb-2">${region}</div>
            <div class="flex items-end justify-between mb-1">
              <span class="text-2xl font-extrabold text-navy-900">${data.committed.toFixed(1)}</span>
              <span class="text-sm text-emerald-600 font-semibold">${data.released.toFixed(1)} mb released</span>
            </div>
            <div class="text-xs text-navy-400 mb-2">million barrels committed</div>
            <div class="w-full bg-navy-100 rounded-full h-2">
              <div class="bg-sky-500 h-2 rounded-full" style="width: ${pct}%"></div>
            </div>
            <div class="text-xs text-navy-400 mt-1">${pct}% released</div>
          </div>`;
        }).join('')}
      </div>

      <!-- Chart: Top 10 Countries -->
      <div class="bg-white rounded-xl border border-navy-200 shadow-sm p-5 mb-6">
        <h3 class="text-lg font-bold text-navy-800 mb-1">Top 10 Countries — Committed vs Released</h3>
        <p class="text-sm text-navy-400 mb-4">Million barrels (mb)</p>
        <div style="height: 400px;">
          <canvas id="spr-chart"></canvas>
        </div>
      </div>

      <!-- Full Country Table -->
      <div class="bg-white rounded-xl border border-navy-200 shadow-sm overflow-hidden mb-6">
        <div class="h-1 bg-gradient-to-r from-sky-400 via-amber-400 to-sky-400"></div>
        <div class="px-5 py-4 border-b border-navy-200">
          <h3 class="text-lg font-bold text-navy-800">All IEA Member Contributions</h3>
          <p class="text-sm text-navy-400 mt-0.5">30 countries | Data as of ${new Date(d.asOf).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-navy-50 text-navy-600 text-xs uppercase tracking-wider">
              <tr>
                <th class="px-4 py-3 font-semibold w-10">#</th>
                <th class="px-4 py-3 font-semibold">Country</th>
                <th class="px-4 py-3 font-semibold text-right">Committed (mb)</th>
                <th class="px-4 py-3 font-semibold text-right">Crude (mb)</th>
                <th class="px-4 py-3 font-semibold text-right hidden sm:table-cell">Refined Products (mb)</th>
                <th class="px-4 py-3 font-semibold text-right">Released (mb)</th>
                <th class="px-4 py-3 font-semibold text-right">Progress</th>
                <th class="px-4 py-3 font-semibold hidden md:table-cell">Release Start</th>
                <th class="px-4 py-3 font-semibold hidden lg:table-cell">Region</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-navy-100">
              ${d.countries.map((c, i) => {
                const pct = c.committed > 0 ? ((c.released / c.committed) * 100).toFixed(1) : '0.0';
                const startLabel = new Date(c.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                const started = new Date(c.startDate) <= new Date(d.asOf);
                const statusColor = started && c.released > 0 ? 'text-emerald-600' : started ? 'text-amber-600' : 'text-navy-400';
                return `
                <tr class="${i % 2 === 1 ? 'bg-navy-50/30' : ''} hover:bg-sky-50/50 transition-colors">
                  <td class="px-4 py-3 text-center">
                    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-navy-100 text-xs font-bold text-navy-600">${i + 1}</span>
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-sm font-medium text-navy-800">${c.country}</span>
                  </td>
                  <td class="px-4 py-3 text-right text-sm font-semibold tabular-nums text-navy-900">${c.committed.toFixed(1)}</td>
                  <td class="px-4 py-3 text-right text-sm tabular-nums text-navy-700">${c.crude > 0 ? c.crude.toFixed(1) : '—'}</td>
                  <td class="px-4 py-3 text-right text-sm tabular-nums text-navy-700 hidden sm:table-cell">${c.products > 0 ? c.products.toFixed(1) : '—'}</td>
                  <td class="px-4 py-3 text-right text-sm font-semibold tabular-nums ${statusColor}">${c.released > 0 ? c.released.toFixed(1) : '—'}</td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-2">
                      <div class="w-16 bg-navy-100 rounded-full h-2">
                        <div class="bg-sky-500 h-2 rounded-full" style="width: ${Math.min(parseFloat(pct), 100)}%"></div>
                      </div>
                      <span class="text-xs font-medium text-navy-600 w-10 text-right">${pct}%</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm text-navy-600 hidden md:table-cell">${startLabel}</td>
                  <td class="px-4 py-3 text-xs text-navy-500 hidden lg:table-cell">${c.region}</td>
                </tr>`;
              }).join('')}
              <tr class="bg-navy-100/70 border-t-2 border-navy-300 font-bold">
                <td class="px-4 py-3"></td>
                <td class="px-4 py-3 text-sm text-navy-900">Total (30 countries)</td>
                <td class="px-4 py-3 text-right text-sm tabular-nums text-navy-900">${d.totalCommitted.toFixed(1)}</td>
                <td class="px-4 py-3 text-right text-sm tabular-nums text-navy-900">${d.totalCrude.toFixed(1)}</td>
                <td class="px-4 py-3 text-right text-sm tabular-nums text-navy-900 hidden sm:table-cell">${d.totalProducts.toFixed(1)}</td>
                <td class="px-4 py-3 text-right text-sm tabular-nums text-emerald-700">${d.totalReleased.toFixed(1)}</td>
                <td class="px-4 py-3 text-right text-sm text-navy-900">${pctReleased}%</td>
                <td class="px-4 py-3 hidden md:table-cell"></td>
                <td class="px-4 py-3 hidden lg:table-cell"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Sources -->
      <div class="text-xs text-navy-400 mb-4">
        <span class="font-semibold">Sources:</span> ${sourcesHtml}
      </div>
    </div>
  `;

  // Draw chart
  const ctx = document.getElementById('spr-chart');
  if (ctx) {
    if (sprChart) { try { sprChart.destroy(); } catch(e) {} }
    sprChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top10.map(c => c.country),
        datasets: [
          {
            label: 'Committed (mb)',
            data: top10.map(c => c.committed),
            backgroundColor: 'rgba(14,165,233,0.3)',
            borderColor: '#0ea5e9',
            borderWidth: 1,
            borderRadius: 6,
          },
          {
            label: 'Released (mb)',
            data: top10.map(c => c.released),
            backgroundColor: '#10b981',
            borderColor: '#059669',
            borderWidth: 1,
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, usePointStyle: true, pointStyle: 'rectRounded' } },
          tooltip: {
            backgroundColor: '#102a43',
            titleFont: { size: 12, weight: '600' },
            bodyFont: { size: 11 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: ctx => ctx.dataset.label + ': ' + ctx.parsed.x.toFixed(1) + ' mb',
            }
          },
          datalabels: { display: false },
        },
        scales: {
          x: {
            grid: { color: 'rgba(16,42,67,0.06)' },
            ticks: { color: '#627d98', font: { size: 12 } },
            title: { display: true, text: 'Million Barrels', color: '#627d98', font: { size: 11 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#334e68', font: { size: 12, weight: '500' } },
          },
        },
      },
    });
  }
}

// ---------- Tab Switching ----------

function initTabs() {
  const tabs = document.querySelectorAll('[data-tab]');
  const panels = document.querySelectorAll('[data-panel]');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      expandedRowId = null;

      tabs.forEach(t => {
        t.classList.remove('active', 'border-amber-500', 'text-navy-900');
        t.classList.add('border-transparent', 'text-navy-500');
      });
      tab.classList.add('active', 'border-amber-500', 'text-navy-900');
      tab.classList.remove('border-transparent', 'text-navy-500');

      const target = tab.dataset.tab;
      panels.forEach(p => {
        p.classList.toggle('hidden', p.dataset.panel !== target);
      });

      updateStats(target);
    });
  });
}

// ---------- Summary Stats ----------

function updateStats(activeTab) {
  const container = document.getElementById('stats-bar');
  let stats = [];

  // Helper: count recently changed items (isNew flag)
  const countNew = (arr, filterFn) =>
    arr.filter(d => d.isNew && (!filterFn || filterFn(d))).length;

  switch (activeTab) {
    case 'exec-summary': {
      let oilOffline = 0, gasOffline = 0, refAffected = 0, impactedCount = 0;
      COUNTRY_STATUS_DATA.forEach(c => {
        if (!c.production) return;
        const p = c.production;
        const oilLoss = p.oil ? p.oil.preWar - p.oil.current : 0;
        const gasLoss = p.gas ? p.gas.preWar - p.gas.current : 0;
        const refLoss = p.refining ? p.refining.affected : 0;
        oilOffline += oilLoss;
        gasOffline += gasLoss;
        refAffected += refLoss;
        if (oilLoss > 0 || gasLoss > 0 || refLoss > 0) impactedCount++;
      });
      stats = [
        { label: 'Oil Offline (kb/d)', value: formatNum(Math.round(oilOffline)), color: 'text-red-600', change: 0 },
        { label: 'Gas Offline (Bcf/d)', value: formatNum(Math.round(gasOffline * 10) / 10), color: 'text-amber-600', change: 0 },
        { label: 'Refining Affected (kb/d)', value: formatNum(Math.round(refAffected)), color: 'text-orange-600', change: 0 },
        { label: 'Countries Impacted', value: impactedCount, color: 'text-blue-600', change: 0 },
      ];
      break;
    }
    case 'country-matrix':
      stats = [
        { label: 'Countries Monitored', value: COUNTRY_STATUS_DATA.length, color: 'text-blue-600', change: 0 },
        { label: 'Critical / Conflict', value: COUNTRY_STATUS_DATA.filter(c => ['critical', 'conflict', 'high'].includes(c.status)).length, color: 'text-red-600', change: countNew(COUNTRY_STATUS_DATA, c => ['critical', 'conflict', 'high'].includes(c.status)) },
        { label: 'Elevated Risk', value: COUNTRY_STATUS_DATA.filter(c => c.status === 'elevated').length, color: 'text-amber-600', change: 0 },
        { label: 'Stable', value: COUNTRY_STATUS_DATA.filter(c => c.status === 'stable').length, color: 'text-emerald-600', change: 0 },
      ];
      break;
    case 'fm-declarations':
      stats = [
        { label: 'Total Declarations', value: FM_DECLARATIONS_DATA.length, color: 'text-blue-600', change: countNew(FM_DECLARATIONS_DATA) },
        { label: 'Active', value: FM_DECLARATIONS_DATA.filter(d => d.status === 'active').length, color: 'text-red-600', change: countNew(FM_DECLARATIONS_DATA, d => d.status === 'active') },
        { label: 'Partially Lifted', value: FM_DECLARATIONS_DATA.filter(d => d.status === 'partially_lifted').length, color: 'text-amber-600', change: countNew(FM_DECLARATIONS_DATA, d => d.status === 'partially_lifted') },
        { label: 'Lifted / Resolved', value: FM_DECLARATIONS_DATA.filter(d => d.status === 'lifted').length, color: 'text-emerald-600', change: countNew(FM_DECLARATIONS_DATA, d => d.status === 'lifted') },
      ];
      break;
    case 'shutdowns':
      stats = [
        { label: 'Total Shutdowns', value: SHUTDOWNS_NO_FM_DATA.length, color: 'text-blue-600', change: countNew(SHUTDOWNS_NO_FM_DATA) },
        { label: 'Shutdown / Struck', value: SHUTDOWNS_NO_FM_DATA.filter(d => ['shutdown', 'struck', 'ongoing'].includes(d.status)).length, color: 'text-red-600', change: countNew(SHUTDOWNS_NO_FM_DATA, d => ['shutdown', 'struck', 'ongoing'].includes(d.status)) },
        { label: 'Halted / Suspended', value: SHUTDOWNS_NO_FM_DATA.filter(d => ['halted', 'suspended'].includes(d.status)).length, color: 'text-amber-600', change: countNew(SHUTDOWNS_NO_FM_DATA, d => ['halted', 'suspended'].includes(d.status)) },
        { label: 'Operational', value: SHUTDOWNS_NO_FM_DATA.filter(d => ['operational', 'resumed'].includes(d.status)).length, color: 'text-emerald-600', change: countNew(SHUTDOWNS_NO_FM_DATA, d => ['operational', 'resumed'].includes(d.status)) },
      ];
      break;
    case 'import-flows':
    case 'export-flows':
    case 'market-prices':
    case 'soh-tracker':
    // case 'shipping': // DISABLED
      // Stats handled by respective JS modules — hide the default stats bar
      container.innerHTML = '';
      return;
  }

  container.innerHTML = stats.map(s => {
    const changeColor = s.change > 0 ? 'text-emerald-600' : 'text-navy-400';
    const changeText = s.change > 0 ? `↑ +${s.change} from yesterday` : '— No change';
    return `
      <div class="stat-card bg-white rounded-xl p-3 sm:p-4 border border-navy-200">
        <div class="text-2xl sm:text-3xl font-extrabold ${s.color}">${s.value}</div>
        <div class="text-sm text-navy-500 mt-1">${s.label}</div>
        <div class="text-xs mt-1.5 ${changeColor}">${changeText}</div>
      </div>
    `;
  }).join('');
}

// ---------- Data Verification ----------

function verifyData() {
  const results = [];
  const pass = (msg) => results.push({ status: 'PASS', msg });
  const fail = (msg) => results.push({ status: 'FAIL', msg });

  // 1. Check all 9 countries exist
  const expectedCountries = ['qatar', 'kuwait', 'saudi_arabia', 'uae', 'iraq', 'bahrain', 'oman', 'israel', 'iran'];
  const countryIds = COUNTRY_STATUS_DATA.map(c => c.id);
  expectedCountries.forEach(id => {
    if (countryIds.includes(id)) pass(`Country "${id}" exists`);
    else fail(`Country "${id}" MISSING`);
  });
  if (COUNTRY_STATUS_DATA.length === 9) pass('9 countries total');
  else fail(`Expected 9 countries, found ${COUNTRY_STATUS_DATA.length}`);

  // 2. Validate production objects
  COUNTRY_STATUS_DATA.forEach(c => {
    if (!c.production) { fail(`${c.country}: missing production object`); return; }
    const p = c.production;
    if (!p.oil) fail(`${c.country}: missing oil production`);
    if (!p.gas) fail(`${c.country}: missing gas production`);
    if (!p.refining) fail(`${c.country}: missing refining data`);
    else {
      const diff = Math.abs(p.refining.capacity - p.refining.affected - p.refining.available);
      if (diff <= p.refining.capacity * 0.05) pass(`${c.country}: refining math OK (cap-aff=avail within 5%)`);
      else fail(`${c.country}: refining math WRONG: ${p.refining.capacity} - ${p.refining.affected} != ${p.refining.available} (diff=${diff})`);
    }
    if (p.oil && p.oil.current > p.oil.preWar) fail(`${c.country}: oil current > preWar`);
    if (p.gas && p.gas.current > p.gas.preWar) fail(`${c.country}: gas current > preWar`);
    pass(`${c.country}: production object valid`);
  });

  // 3. Cross-check key production numbers
  const checks = [
    { id: 'saudi_arabia', field: 'oil', prop: 'preWar', expected: 10400 },
    { id: 'qatar', field: 'lng', prop: 'current', expected: 0 },
    { id: 'iran', field: 'gas', prop: 'preWar', expected: 25.8 },
    { id: 'uae', field: 'oil', prop: 'preWar', expected: 3400 },
    { id: 'iraq', field: 'oil', prop: 'current', expected: 1200 },
  ];
  checks.forEach(({ id, field, prop, expected }) => {
    const c = COUNTRY_STATUS_DATA.find(x => x.id === id);
    if (!c || !c.production || !c.production[field]) { fail(`${id}.${field}: not found`); return; }
    const val = c.production[field][prop];
    const tolerance = Math.abs(expected) * 0.05 + 1;
    if (Math.abs(val - expected) <= tolerance) pass(`${id}.${field}.${prop} = ${val} (expected ~${expected})`);
    else fail(`${id}.${field}.${prop} = ${val}, expected ~${expected}`);
  });

  // 4. Validate infrastructure arrays
  COUNTRY_STATUS_DATA.forEach(c => {
    if (c.infrastructure && c.infrastructure.length > 0) pass(`${c.country}: ${c.infrastructure.length} infrastructure entries`);
    else fail(`${c.country}: empty or missing infrastructure`);
  });

  // Summary
  const passes = results.filter(r => r.status === 'PASS').length;
  const fails = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n===== DATA VERIFICATION =====`);
  console.log(`Total: ${results.length} checks | PASS: ${passes} | FAIL: ${fails}\n`);
  results.forEach(r => console.log(`  [${r.status}] ${r.msg}`));
  if (fails === 0) console.log('\n  ALL CHECKS PASSED');
  else console.log(`\n  ${fails} CHECK(S) FAILED`);
  return { passes, fails, results };
}

// ---------- Initialization ----------

document.addEventListener('DOMContentLoaded', () => {
  const lastUpdatedEl = document.getElementById('last-updated');
  if (lastUpdatedEl && typeof LAST_UPDATED !== 'undefined') {
    lastUpdatedEl.textContent = new Date(LAST_UPDATED).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    });
  }

  // Freshness indicator: warn if data is more than 26 hours old
  if (typeof LAST_UPDATED !== 'undefined') {
    const lastUpdate = new Date(LAST_UPDATED);
    const ageHours = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    const syncStatusEl = document.getElementById('sync-status');
    const syncStatusText = document.getElementById('sync-status-text');
    const syncStatusIcon = document.getElementById('sync-status-icon');
    if (syncStatusEl && ageHours > 26) {
      syncStatusEl.classList.remove('bg-emerald-50', 'text-emerald-700', 'border-emerald-300');
      syncStatusEl.classList.add('bg-amber-50', 'text-amber-700', 'border-amber-300');
      if (syncStatusText) syncStatusText.textContent = 'Data may be stale';
      if (syncStatusIcon) {
        syncStatusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />';
      }
    }
  }

  renderExecSummary();
  renderCountryMatrix();
  renderFMDeclarations();
  renderShutdowns();
  renderMarketNews();

  initTabs();
  updateStats('exec-summary');
});
