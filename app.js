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

// ---------- Sync Button ----------

let syncInProgress = false;
let lastSyncTime = 0;

async function syncData() {
  const btn = document.getElementById('sync-btn');
  const icon = document.getElementById('sync-icon');
  if (!btn || !icon || syncInProgress) return;

  // Rate limit: 60s between syncs
  const now = Date.now();
  if (now - lastSyncTime < 60000 && lastSyncTime > 0) {
    const remaining = Math.ceil((60000 - (now - lastSyncTime)) / 1000);
    btn.title = `Please wait ${remaining}s before syncing again`;
    return;
  }

  syncInProgress = true;
  icon.classList.add('sync-spinning');
  btn.classList.add('opacity-70');
  btn.disabled = true;

  try {
    const resp = await fetch('/api/sync', { method: 'POST' });
    if (!resp.ok) throw new Error(`Sync failed: ${resp.status}`);
    const data = await resp.json();

    // Merge updated data if available
    if (data.countryStatus && Array.isArray(data.countryStatus)) {
      COUNTRY_STATUS_DATA.length = 0;
      data.countryStatus.forEach(c => COUNTRY_STATUS_DATA.push(c));
    }
    if (data.fmDeclarations && Array.isArray(data.fmDeclarations)) {
      FM_DECLARATIONS_DATA.length = 0;
      data.fmDeclarations.forEach(d => FM_DECLARATIONS_DATA.push(d));
    }
    if (data.shutdowns && Array.isArray(data.shutdowns)) {
      SHUTDOWNS_NO_FM_DATA.length = 0;
      data.shutdowns.forEach(s => SHUTDOWNS_NO_FM_DATA.push(s));
    }

    lastSyncTime = Date.now();

    // Flash green on success
    btn.classList.add('border-emerald-400', 'text-emerald-600');
    setTimeout(() => {
      btn.classList.remove('border-emerald-400', 'text-emerald-600');
    }, 2000);
  } catch (err) {
    console.error('Sync error:', err);
    // Flash red on failure
    btn.classList.add('border-red-400', 'text-red-600');
    setTimeout(() => {
      btn.classList.remove('border-red-400', 'text-red-600');
    }, 2000);
  }

  // Update timestamp
  const lastUpdatedEl = document.getElementById('last-updated');
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    });
  }

  // Re-render everything
  renderExecSummary();
  renderCountryMatrix();
  renderFMDeclarations();
  renderShutdowns();

  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab) updateStats(activeTab.dataset.tab);

  // Stop animation
  icon.classList.remove('sync-spinning');
  btn.classList.remove('opacity-70');
  btn.disabled = false;
  syncInProgress = false;
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

function renderExecSummary() {
  const container = document.getElementById('exec-summary-content');
  if (!container) return;

  const totalCountries = COUNTRY_STATUS_DATA.length;
  const criticalCountries = COUNTRY_STATUS_DATA.filter(c => ['critical', 'conflict'].includes(c.status)).length;
  const totalFM = FM_DECLARATIONS_DATA.length;
  const activeFM = FM_DECLARATIONS_DATA.filter(d => d.status === 'active').length;
  const totalShutdowns = SHUTDOWNS_NO_FM_DATA.length;

  let infraShutdown = 0;
  let infraPartial = 0;
  let infraOperational = 0;
  COUNTRY_STATUS_DATA.forEach(c => {
    c.infrastructure.forEach(inf => {
      if (inf.status === 'shutdown') infraShutdown++;
      else if (inf.status === 'partial') infraPartial++;
      else infraOperational++;
    });
  });

  // Latest events
  const allEvents = [];
  COUNTRY_STATUS_DATA.forEach(c => {
    c.events.forEach(e => allEvents.push({ ...e, country: c.country, flag: c.flag }));
  });
  allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
  const latestEvents = allEvents.slice(0, 4);

  // Country cards with metrics
  const countryCards = COUNTRY_STATUS_DATA.map(c => {
    const shutCount = c.infrastructure.filter(i => i.status === 'shutdown').length;
    const partialCount = c.infrastructure.filter(i => i.status === 'partial').length;
    const totalInfra = c.infrastructure.length;
    const newBadge = c.isNew ? renderNewBadge() : '';
    const headline = c.metrics ? c.metrics.headline : c.oilGasImpact.summary;
    return `
      <div class="bg-white rounded-lg p-4 border border-navy-200 exec-card ${c.isNew ? 'border-l-4 border-l-sky-400' : ''}">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-navy-900 text-sm">${c.country}</span>
            ${newBadge}
          </div>
          ${renderStatusBadge(c.status, c.statusLabel)}
        </div>
        <p class="text-sm font-bold text-navy-800 mb-1">${headline}</p>
        <p class="text-xs text-navy-500 mb-3">${c.oilGasImpact.summary}</p>
        <div class="flex items-center gap-1 text-xs">
          <span class="text-navy-500">Infrastructure:</span>
          ${shutCount > 0 ? `<span class="text-red-600 font-medium">${shutCount} down</span>` : ''}
          ${shutCount > 0 && partialCount > 0 ? '<span class="text-navy-300">/</span>' : ''}
          ${partialCount > 0 ? `<span class="text-amber-600 font-medium">${partialCount} partial</span>` : ''}
          ${shutCount === 0 && partialCount === 0 ? `<span class="text-emerald-600 font-medium">${totalInfra} operational</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Latest FM declarations (last 5)
  const latestFMs = sortByDateDesc(FM_DECLARATIONS_DATA).slice(0, 3);
  const fmListHtml = latestFMs.map(fm => `
    <div class="flex items-start gap-3 py-3 border-b border-navy-100 last:border-0">
      <div class="w-8 h-8 rounded-full bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold text-navy-900">${fm.company}</span>
          <span class="text-xs text-navy-500">${fm.country}</span>
          <span class="text-xs text-navy-400">${formatDate(fm.date)}</span>
        </div>
        ${fm.details && fm.details.volumeAffected ? `<p class="text-xs font-semibold text-amber-600 mt-0.5">${fm.details.volumeAffected}</p>` : ''}
        <p class="text-xs text-navy-600 mt-0.5 line-clamp-1">${fm.summary}</p>
      </div>
    </div>
  `).join('');

  // Timeline
  const renderTimelineEvent = (evt) => {
    const newBadge = evt.isNew ? renderNewBadge() : '';
    const bgClass = evt.isNew ? 'bg-sky-50 rounded-lg px-2 py-1 -mx-2' : '';
    return `
      <div class="timeline-line flex gap-3 pb-4">
        <div class="timeline-dot mt-1"></div>
        <div class="flex-1 min-w-0 ${bgClass}">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-medium text-amber-600">${formatDate(evt.date)}</span>
            <span class="text-xs text-navy-400">${evt.country}</span>
            ${newBadge}
          </div>
          <div class="text-sm text-navy-900 font-medium mt-0.5">${evt.title}</div>
          <div class="text-xs text-navy-600 mt-0.5">${evt.description}</div>
        </div>
      </div>
    `;
  };

  container.innerHTML = `
    <!-- Key Metrics Row -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div class="stat-card bg-white rounded-xl p-4 border border-navy-200">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-red-600">${criticalCountries}</div>
        <div class="text-xs text-navy-500 mt-0.5">Critical Countries</div>
      </div>
      <div class="stat-card bg-white rounded-xl p-4 border border-navy-200">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-amber-600">${totalFM}</div>
        <div class="text-xs text-navy-500 mt-0.5">FM Declarations</div>
      </div>
      <div class="stat-card bg-white rounded-xl p-4 border border-navy-200">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
            <svg class="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-orange-600">${totalShutdowns}</div>
        <div class="text-xs text-navy-500 mt-0.5">Shutdowns (No FM)</div>
      </div>
      <div class="stat-card bg-white rounded-xl p-4 border border-navy-200">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
          </div>
        </div>
        <div class="text-3xl font-extrabold text-red-600">${infraShutdown}</div>
        <div class="text-xs text-navy-500 mt-0.5">Facilities Offline</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <!-- Situation Overview -->
      <div class="lg:col-span-2 bg-white rounded-xl border border-navy-200 p-5">
        <h3 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
          Regional Status Overview
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${countryCards}
        </div>
      </div>

      <!-- Latest FM Declarations -->
      <div class="bg-white rounded-xl border border-navy-200 p-5">
        <h3 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          Latest FM Declarations
        </h3>
        <div>${fmListHtml}</div>
      </div>
    </div>

    <!-- Event Timeline -->
    <div class="bg-white rounded-xl border border-navy-200 p-5">
      <h3 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Event Timeline (Latest)
      </h3>
      <div>${latestEvents.map(renderTimelineEvent).join('')}</div>
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
      <div class="detail-panel bg-navy-50 p-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
      <td class="px-5 py-3.5">
        <div class="flex items-center gap-2.5">
          <span class="font-semibold text-navy-900">${country.country}</span>
          ${newBadge}
        </div>
      </td>
      <td class="px-5 py-3.5">${renderStatusBadge(country.status, country.statusLabel)}</td>
      <td class="px-5 py-3.5 max-w-lg">
        <ul class="space-y-1">
          ${eventsList}
        </ul>
      </td>
      <td class="px-5 py-3.5">
        <div>
          <div class="flex items-center gap-2 mb-1">
            ${renderImpactBadge(country.oilGasImpact.severity)}
          </div>
          <span class="text-navy-900 text-sm font-semibold">${country.metrics ? (country.metrics.productionOffline || country.metrics.headline) : ''}</span>
          <br>
          <span class="text-navy-500 text-xs">${country.oilGasImpact.summary}</span>
        </div>
      </td>
      <td class="px-5 py-3.5 text-navy-600 text-sm hidden lg:table-cell">
        <span class="font-medium">${country.infrastructure.length}</span> facilities
      </td>
      <td class="px-5 py-3.5">${renderSourcesBadge(country.sources)}</td>
      <td class="px-5 py-3.5">
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
      <div class="detail-panel bg-navy-50 p-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2">
            <h4 class="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-4 flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              Declaration Details
            </h4>
            <div class="bg-white rounded-lg border border-navy-200 overflow-hidden">
              <div class="grid grid-cols-1 sm:grid-cols-2">
                <div class="p-4 border-b sm:border-r border-navy-100">
                  <span class="text-xs text-navy-500 uppercase tracking-wider font-medium block mb-1">Volume Affected</span>
                  <p class="text-sm text-navy-900 font-medium leading-relaxed">${item.details.volumeAffected}</p>
                </div>
                <div class="p-4 border-b border-navy-100">
                  <span class="text-xs text-navy-500 uppercase tracking-wider font-medium block mb-1">Commodity</span>
                  <p class="text-sm text-navy-900 font-medium">${item.details.commodity}</p>
                </div>
                <div class="p-4 border-b sm:border-b-0 sm:border-r border-navy-100">
                  <span class="text-xs text-navy-500 uppercase tracking-wider font-medium block mb-1">Duration</span>
                  <p class="text-sm text-navy-900 font-medium">${item.details.duration}</p>
                </div>
                <div class="p-4">
                  <span class="text-xs text-navy-500 uppercase tracking-wider font-medium block mb-1">Financial Impact</span>
                  <p class="text-sm text-navy-900 font-medium">${item.details.financialImpact || 'Not disclosed'}</p>
                </div>
              </div>
              <div class="p-4 border-t border-navy-100 bg-navy-50">
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
      <td class="px-5 py-3.5">
        <span class="font-semibold text-navy-900">${item.company}</span>
        ${newBadge}
      </td>
      <td class="px-5 py-3.5">
        <span class="text-navy-600 text-sm">${item.country}</span>
      </td>
      <td class="px-5 py-3.5 text-navy-700 text-sm font-medium">${formatDate(item.date)}</td>
      <td class="px-5 py-3.5">${renderStatusBadge(item.status, item.statusLabel)}</td>
      <td class="px-5 py-3.5 text-sm max-w-sm">
        ${item.details && item.details.volumeAffected ? `<p class="text-amber-600 font-semibold text-xs mb-0.5">${item.details.volumeAffected}</p>` : ''}
        <span class="text-navy-600 line-clamp-2">${item.summary}</span>
      </td>
      <td class="px-5 py-3.5">${renderSourcesBadge(item.sources)}</td>
      <td class="px-5 py-3.5">
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
      <td class="px-5 py-3.5">
        <span class="font-semibold text-navy-900">${item.company}</span>
        ${newBadge}
      </td>
      <td class="px-5 py-3.5">
        <span class="text-navy-600 text-sm">${item.country}</span>
        </div>
      </td>
      <td class="px-5 py-3.5 text-navy-700 text-sm font-medium">${formatDate(item.date)}</td>
      <td class="px-5 py-3.5">${renderStatusBadge(item.status, item.statusLabel)}</td>
      <td class="px-5 py-3.5 text-sm max-w-sm">
        ${item.details && item.details.volumeAffected ? `<p class="text-amber-600 font-semibold text-xs mb-0.5">${item.details.volumeAffected}</p>` : ''}
        <span class="text-navy-600 line-clamp-2">${item.summary}</span>
      </td>
      <td class="px-5 py-3.5">${renderSourcesBadge(item.sources)}</td>
      <td class="px-5 py-3.5">
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
    case 'exec-summary':
      stats = [
        { label: 'Countries Monitored', value: COUNTRY_STATUS_DATA.length, color: 'text-blue-600', change: 0 },
        { label: 'Critical / Conflict', value: COUNTRY_STATUS_DATA.filter(c => ['critical', 'conflict'].includes(c.status)).length, color: 'text-red-600', change: countNew(COUNTRY_STATUS_DATA, c => ['critical', 'conflict'].includes(c.status)) },
        { label: 'Active FM Declarations', value: FM_DECLARATIONS_DATA.filter(d => d.status === 'active').length, color: 'text-amber-600', change: countNew(FM_DECLARATIONS_DATA, d => d.status === 'active') },
        { label: 'Active Shutdowns', value: SHUTDOWNS_NO_FM_DATA.filter(d => ['shutdown', 'struck', 'ongoing', 'halted', 'suspended'].includes(d.status)).length, color: 'text-orange-600', change: countNew(SHUTDOWNS_NO_FM_DATA, d => ['shutdown', 'struck', 'ongoing', 'halted', 'suspended'].includes(d.status)) },
      ];
      break;
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
  }

  container.innerHTML = stats.map(s => {
    const changeColor = s.change > 0 ? 'text-emerald-600' : 'text-navy-400';
    const changeText = s.change > 0 ? `↑ +${s.change} from yesterday` : '— No change';
    return `
      <div class="stat-card bg-white rounded-xl p-4 border border-navy-200">
        <div class="text-3xl font-extrabold ${s.color}">${s.value}</div>
        <div class="text-sm text-navy-500 mt-1">${s.label}</div>
        <div class="text-xs mt-1.5 ${changeColor}">${changeText}</div>
      </div>
    `;
  }).join('');
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

  renderExecSummary();
  renderCountryMatrix();
  renderFMDeclarations();
  renderShutdowns();

  initTabs();
  updateStats('exec-summary');
});
