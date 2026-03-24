// ============================================================
// shipping.js -- Shipping & Logistics Dashboard
// Fleet Focus, Route Monitor, Operational Signal Lens, Vessel Desk
// Fetches live data from /api/shipping (AIS API proxy)
// ============================================================

(function () {
  'use strict';

  // ---------- State ----------
  let state = {
    matrixView: 'combined', // 'combined' | 'inside' | 'outside'
    data: null,
    loading: false,
    error: null,
    lastFetch: 0
  };

  const FETCH_TTL = 5 * 60 * 1000; // 5 minutes
  let refreshInterval = null;
  let layoutRendered = false;

  // ---------- Helpers ----------

  function fmtChange(n) {
    if (n > 0) return '+' + n;
    return String(n);
  }

  function changeColor(n) {
    if (n < 0) return 'text-red-500';
    if (n > 0) return 'text-emerald-500';
    return 'text-navy-400';
  }

  function changeColorDark(n) {
    if (n < 0) return 'text-red-400';
    if (n > 0) return 'text-cyan-400';
    return 'text-navy-300';
  }

  function pct(part, total) {
    if (!total) return '0.0';
    return (part / total * 100).toFixed(1);
  }

  // ---------- Data Fetching ----------

  async function fetchData(force) {
    if (!force && state.data && (Date.now() - state.lastFetch) < FETCH_TTL) {
      return state.data;
    }

    state.loading = true;
    state.error = null;
    renderLoading();

    try {
      const resp = await fetch('/api/shipping');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      state.data = data;
      state.lastFetch = Date.now();
      state.loading = false;
      return data;
    } catch (err) {
      console.error('Shipping data fetch error:', err);
      state.error = err.message;
      state.loading = false;

      // Try seed data as fallback
      if (!state.data) {
        try {
          const resp = await fetch('/shipping-seed.json');
          if (resp.ok) {
            state.data = await resp.json();
            state.data._source = 'seed-fallback';
          }
        } catch (e) { /* ignore */ }
      }
      return state.data;
    }
  }

  // ---------- Section 1: Fleet Focus ----------

  function renderFleetFocus(d) {
    const ff = d.fleetFocus;
    if (!ff) return '';

    const alertHtml = ff.alert ? `
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5 alert-pulse">
        <div class="font-mono text-xs uppercase tracking-widest text-amber-700 font-bold mb-1">${ff.alert.type}</div>
        <p class="text-sm text-navy-800">
          ${ff.alert.message.replace(/([A-Z]{2,}[\s-]*[A-Z]*[\s-]*[IVX]*)/g, '<strong class="text-navy-900">$1</strong>')}
        </p>
      </div>
    ` : '';

    return `
      <section class="mb-8">
        <div class="flex items-start justify-between mb-4">
          <div>
            <div class="font-mono text-xs uppercase tracking-widest text-amber-600 font-semibold">Fleet Focus</div>
            <h2 class="text-xl font-bold text-navy-900">Current Fleet Positioning</h2>
          </div>
          <p class="text-sm text-navy-400 hidden md:block max-w-sm text-right">Core vessel posture, movement deltas, and fast links into the detailed tabs.</p>
        </div>

        ${alertHtml}

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- ADNOC Vessels -->
          <div class="bg-white rounded-xl border border-navy-200 p-5 stat-card">
            <div class="font-mono text-xs uppercase tracking-widest text-navy-500 mb-2">ADNOC Vessels in Hormuz</div>
            <div class="text-4xl font-extrabold text-navy-900 tabular-nums">${ff.adnocVessels.count}</div>
            <div class="font-mono text-xs mt-2 ${changeColor(ff.adnocVessels.change)}">CHANGE VS LAST: ${fmtChange(ff.adnocVessels.change)}</div>
          </div>

          <!-- Vessels Inside -->
          <div class="bg-white rounded-xl border border-navy-200 p-5 stat-card">
            <div class="font-mono text-xs uppercase tracking-widest text-navy-500 mb-2">Vessels Inside</div>
            <div class="text-4xl font-extrabold text-navy-900 tabular-nums">${ff.vesselsInside.count}</div>
            <div class="font-mono text-xs mt-2 ${changeColor(ff.vesselsInside.change)}">CHANGE VS LAST: ${fmtChange(ff.vesselsInside.change)}</div>
            <div class="font-mono text-xs text-navy-400 mt-1">BALLAST ${ff.vesselsInside.ballast} &nbsp;|&nbsp; LADEN ${ff.vesselsInside.laden}</div>
            <div class="font-mono text-xs text-navy-400">DELTA B ${fmtChange(ff.vesselsInside.deltaB)} &nbsp;|&nbsp; DELTA L ${fmtChange(ff.vesselsInside.deltaL)}</div>
          </div>

          <!-- Vessels Outside -->
          <div class="bg-white rounded-xl border border-navy-200 p-5 stat-card">
            <div class="font-mono text-xs uppercase tracking-widest text-navy-500 mb-2">Vessels Outside</div>
            <div class="text-4xl font-extrabold text-navy-900 tabular-nums">${ff.vesselsOutside.count}</div>
            <div class="font-mono text-xs mt-2 ${changeColor(ff.vesselsOutside.change)}">CHANGE VS LAST: ${fmtChange(ff.vesselsOutside.change)}</div>
            <div class="font-mono text-xs text-navy-400 mt-1">BALLAST ${ff.vesselsOutside.ballast} &nbsp;|&nbsp; LADEN ${ff.vesselsOutside.laden}</div>
            <div class="font-mono text-xs text-navy-400">DELTA B ${fmtChange(ff.vesselsOutside.deltaB)} &nbsp;|&nbsp; DELTA L ${fmtChange(ff.vesselsOutside.deltaL)}</div>
          </div>
        </div>
      </section>
    `;
  }

  // ---------- Section 2: Route Monitor ----------

  function renderRouteMonitor(d) {
    const rm = d.routeMonitor;
    if (!rm) return '';

    const iframeUrl = rm.iframeUrl || '';
    const fullMapUrl = rm.fullMapUrl || '';

    return `
      <section class="mb-8">
        <div class="flex items-start justify-between mb-4">
          <div>
            <div class="font-mono text-xs uppercase tracking-widest text-amber-600 font-semibold">Route Monitor</div>
            <h2 class="text-xl font-bold text-navy-900">Live Hormuz Traffic Picture</h2>
          </div>
          <div class="flex items-center gap-3 text-xs">
            <span class="font-mono text-navy-400 uppercase hidden sm:inline">${rm.source || 'MarineTraffic AIS Embed'}</span>
            <a href="${fullMapUrl}" target="_blank" rel="noopener noreferrer"
               class="font-mono text-xs uppercase tracking-wider text-amber-600 hover:text-amber-700 font-semibold">
              Open Full Map
            </a>
          </div>
        </div>

        <div class="flex flex-col lg:flex-row rounded-xl border border-navy-200 overflow-hidden shadow-sm">
          <!-- Map iframe -->
          <div class="iframe-container lg:w-[70%]">
            <iframe
              src="${iframeUrl}"
              class="w-full h-[400px] lg:h-[500px] border-0"
              loading="lazy"
              title="Strait of Hormuz AIS Traffic"
              sandbox="allow-scripts allow-same-origin"
              referrerpolicy="no-referrer"
            ></iframe>
            <div class="iframe-fallback">
              <div class="text-center">
                <svg class="w-10 h-10 mx-auto mb-2 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
                <p class="text-sm">Map loading...</p>
                <a href="${fullMapUrl}" target="_blank" class="text-amber-400 text-xs hover:underline mt-1 inline-block">Open MarineTraffic</a>
              </div>
            </div>
          </div>

          <!-- Dark sidebar -->
          <div class="bg-navy-900 text-white p-5 lg:w-[30%] flex flex-col justify-start">
            <div class="font-mono text-xs uppercase tracking-widest text-amber-400 font-bold mb-4">Since Last Update</div>

            <!-- Transited In -->
            <div class="bg-navy-800/50 rounded-lg p-4 border border-navy-700 mb-3">
              <div class="font-mono text-xs uppercase tracking-wider text-navy-300 mb-1">Transited In (Inside Region)</div>
              <div class="text-3xl font-extrabold tabular-nums ${changeColorDark(rm.transitedIn.change)}">${fmtChange(rm.transitedIn.change)}</div>
              <p class="text-sm text-navy-300 mt-1">${rm.transitedIn.description}</p>
            </div>

            <!-- Transited Out -->
            <div class="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
              <div class="font-mono text-xs uppercase tracking-wider text-navy-300 mb-1">Transited Out (Outside Region)</div>
              <div class="text-3xl font-extrabold tabular-nums ${changeColorDark(rm.transitedOut.change)}">${fmtChange(rm.transitedOut.change)}</div>
              <p class="text-sm text-navy-300 mt-1">${rm.transitedOut.description}</p>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // ---------- Section 3: Operational Signal Lens ----------

  function renderVesselTable(d) {
    const vm = d.vesselMatrix;
    if (!vm || !vm.classes) return '';

    let classes = [...vm.classes];

    // Sort based on active view
    if (state.matrixView === 'inside') {
      classes.sort((a, b) => b.inside.total - a.inside.total);
    } else if (state.matrixView === 'outside') {
      classes.sort((a, b) => b.outside.total - a.outside.total);
    } else {
      classes.sort((a, b) => (b.inside.total + b.outside.total) - (a.inside.total + a.outside.total));
    }

    // Compute grand totals
    const totals = classes.reduce((acc, cls) => {
      acc.inside.total += cls.inside.total;
      acc.inside.ballast += cls.inside.ballast;
      acc.inside.laden += cls.inside.laden;
      acc.outside.total += cls.outside.total;
      acc.outside.ballast += cls.outside.ballast;
      acc.outside.laden += cls.outside.laden;
      return acc;
    }, { inside: { total: 0, ballast: 0, laden: 0 }, outside: { total: 0, ballast: 0, laden: 0 } });

    const grandTotal = totals.inside.total + totals.outside.total;

    const rowsHtml = classes.map((cls, i) => {
      const combined = cls.inside.total + cls.outside.total;
      const insidePct = pct(cls.inside.total, combined);
      const outsidePct = pct(cls.outside.total, combined);
      const rowBg = i % 2 === 1 ? 'bg-navy-50/50' : '';

      return `
        <tr class="${rowBg} border-b border-navy-100">
          <td class="px-4 py-3 text-sm font-medium text-navy-900">${cls.name}</td>
          <td class="px-4 py-3 text-right">
            <div class="text-sm font-semibold text-navy-900 tabular-nums">${cls.inside.total}</div>
            <div class="text-xs font-mono text-navy-400">B ${cls.inside.ballast} | L ${cls.inside.laden}</div>
          </td>
          <td class="px-4 py-3 text-right">
            <div class="text-sm font-semibold text-navy-900 tabular-nums">${cls.outside.total}</div>
            <div class="text-xs font-mono text-navy-400">B ${cls.outside.ballast} | L ${cls.outside.laden}</div>
          </td>
          <td class="px-4 py-3 text-center">
            <div class="text-sm font-bold text-navy-900 tabular-nums">${combined}</div>
          </td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="w-32 h-4 bg-navy-100 rounded-full overflow-hidden flex">
                <div class="h-full bg-blue-500 vessel-bar rounded-l-full" style="width: ${insidePct}%"></div>
              </div>
              <span class="text-xs font-mono text-navy-500 whitespace-nowrap">I ${insidePct}% | O ${outsidePct}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const grandInsidePct = pct(totals.inside.total, grandTotal);
    const grandOutsidePct = pct(totals.outside.total, grandTotal);

    return `
      <div class="overflow-x-auto">
        <table class="w-full text-left min-w-[800px]">
          <thead>
            <tr class="bg-navy-800 text-white">
              <th class="px-4 py-3 text-xs font-mono uppercase tracking-wider">Vessel Class</th>
              <th class="px-4 py-3 text-xs font-mono uppercase tracking-wider text-right">Inside</th>
              <th class="px-4 py-3 text-xs font-mono uppercase tracking-wider text-right">Outside</th>
              <th class="px-4 py-3 text-xs font-mono uppercase tracking-wider text-center">Combined</th>
              <th class="px-4 py-3 text-xs font-mono uppercase tracking-wider">Inside / Outside Split</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-navy-300 bg-navy-100/70">
              <td class="px-4 py-3 text-sm font-bold text-navy-900">GRAND TOTAL</td>
              <td class="px-4 py-3 text-right">
                <div class="text-sm font-bold text-navy-900 tabular-nums">${totals.inside.total}</div>
                <div class="text-xs font-mono text-navy-400">B ${totals.inside.ballast} | L ${totals.inside.laden}</div>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="text-sm font-bold text-navy-900 tabular-nums">${totals.outside.total}</div>
                <div class="text-xs font-mono text-navy-400">B ${totals.outside.ballast} | L ${totals.outside.laden}</div>
              </td>
              <td class="px-4 py-3 text-center">
                <div class="text-sm font-bold text-navy-900 tabular-nums">${grandTotal}</div>
              </td>
              <td class="px-4 py-3">
                <span class="text-sm font-mono text-navy-600">Inside ${grandInsidePct}% | Outside ${grandOutsidePct}%</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  function renderOperationalLens(d) {
    const vm = d.vesselMatrix;
    if (!vm) return '';

    return `
      <section class="mb-8">
        <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 class="text-xl font-bold text-navy-900">Operational Signal Lens</h2>
            <p class="text-sm text-navy-400">Fleet exposure, risk intensity, and intelligence cadence in a single view.</p>
          </div>
          <div class="flex items-center bg-white rounded-lg border border-navy-200 shadow-sm overflow-hidden">
            <button data-matrix="combined"
              class="shipping-toggle px-4 py-2 text-xs font-mono uppercase tracking-wide font-semibold transition-all ${state.matrixView === 'combined' ? 'bg-amber-500 text-white' : 'text-navy-600 hover:bg-navy-50'}">
              Combined
            </button>
            <button data-matrix="inside"
              class="shipping-toggle px-4 py-2 text-xs font-mono uppercase tracking-wide font-semibold transition-all ${state.matrixView === 'inside' ? 'bg-amber-500 text-white' : 'text-navy-600 hover:bg-navy-50'}">
              Inside Matrix
            </button>
            <button data-matrix="outside"
              class="shipping-toggle px-4 py-2 text-xs font-mono uppercase tracking-wide font-semibold transition-all ${state.matrixView === 'outside' ? 'bg-amber-500 text-white' : 'text-navy-600 hover:bg-navy-50'}">
              Outside Matrix
            </button>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-navy-200 shadow-sm overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-navy-200">
            <div class="font-mono text-xs uppercase tracking-wider text-navy-500">Vessel Class Breakdown (Inside vs Outside)</div>
            <div class="font-mono text-xs text-red-600 font-bold">TOTAL: ${vm.totalVessels}</div>
          </div>
          <div id="sl-matrix-container">
            ${renderVesselTable(d)}
          </div>
        </div>
      </section>
    `;
  }

  // ---------- Section 4: Vessel Desk ----------

  function renderVesselDesk(d) {
    const vessels = d.trackedVessels;
    if (!vessels) return '';

    const statusDotMap = {
      green: 'bg-emerald-500',
      orange: 'bg-amber-500 status-pulse',
      red: 'bg-red-500 status-pulse'
    };

    const cargoMap = {
      BALLAST: 'bg-navy-100 text-navy-600 border border-navy-200',
      LADEN: 'bg-blue-500 text-white'
    };

    const navMap = {
      MOORED: { color: 'text-amber-600', icon: '<svg class="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>' },
      'UNDER WAY': { color: 'text-teal-600', icon: '<svg class="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>' },
      ANCHORED: { color: 'text-red-600', icon: '<svg class="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>' }
    };

    const vesselRows = vessels.map(v => {
      const dot = statusDotMap[v.status] || statusDotMap.green;
      const cargo = cargoMap[v.cargo] || cargoMap.BALLAST;
      const nav = navMap[v.navStatus] || navMap.MOORED;
      const portStr = v.port ? `${v.port} &rarr; ${v.destination || '-'}` : '-';

      return `
        <div class="vessel-card flex items-center gap-4 px-5 py-4 border-b border-navy-100">
          <span class="w-3 h-3 rounded-full ${dot} flex-shrink-0"></span>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-navy-900 text-sm">${v.name}</div>
            <div class="text-xs font-mono text-navy-400 uppercase truncate">${v.class} // ${v.subclass || ''}</div>
            <div class="text-xs text-navy-500">${portStr}</div>
          </div>
          <span class="px-3 py-1 rounded text-xs font-bold uppercase ${cargo} flex-shrink-0">${v.cargo}</span>
          <div class="text-right text-xs font-mono flex-shrink-0 ${nav.color}">
            ${nav.icon} ${v.navStatus}
          </div>
        </div>
      `;
    }).join('');

    return `
      <section class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <div>
            <div class="font-mono text-xs uppercase tracking-widest text-amber-600 font-semibold">Vessel Desk</div>
            <h2 class="text-xl font-bold text-navy-900">Current Tracked Vessels</h2>
            <p class="text-sm text-navy-400">Immediate ADNOC-linked hull list with fast access into the vessel tracker.</p>
          </div>
          <span class="bg-navy-800 text-white text-xs font-bold font-mono px-2.5 py-1 rounded">${vessels.length}</span>
        </div>

        <div class="bg-white rounded-xl border border-navy-200 shadow-sm overflow-hidden">
          <div class="flex items-center gap-4 px-5 py-2.5 border-b border-navy-200 bg-navy-50">
            <span class="w-3 text-xs font-mono text-navy-500 uppercase">ST</span>
            <span class="flex-1 text-xs font-mono text-navy-500 uppercase">Vessel</span>
            <span class="text-xs font-mono text-navy-500 uppercase w-20 text-center">Cargo</span>
            <span class="text-xs font-mono text-navy-500 uppercase w-24 text-right">Status</span>
          </div>
          ${vesselRows}
        </div>
      </section>
    `;
  }

  // ---------- Loading / Error States ----------

  function renderLoading() {
    const container = document.getElementById('shipping-content');
    if (!container) return;
    container.innerHTML = `
      <div class="flex items-center justify-center py-20">
        <div class="text-center">
          <svg class="w-8 h-8 mx-auto mb-3 text-amber-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="text-sm text-navy-500">Loading vessel data...</p>
        </div>
      </div>
    `;
  }

  function renderSourceBanner(d) {
    if (!d._source || d._source === 'aisstream' || d._source === 'datalastic') return '';
    const msgs = {
      seed: 'Showing demo data. Configure AIS_API_KEY for live vessel tracking.',
      'seed-fallback': 'API unavailable. Showing cached demo data.',
      cache: 'Showing cached data. Live API temporarily unavailable.'
    };
    const msg = msgs[d._source] || '';
    if (!msg) return '';
    return `
      <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-5 flex items-center gap-2 text-sm text-amber-700">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        ${msg}
      </div>
    `;
  }

  // ---------- Main Render ----------

  async function render() {
    const container = document.getElementById('shipping-content');
    if (!container) return;

    const data = await fetchData();
    if (!data) {
      container.innerHTML = `
        <div class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p class="text-red-700 font-medium">Failed to load shipping data.</p>
          <p class="text-red-600 text-sm mt-1">${state.error || 'Unknown error'}</p>
          <button onclick="window.__shippingRetry && window.__shippingRetry()" class="mt-3 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors">
            Retry
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      ${renderSourceBanner(data)}
      ${renderFleetFocus(data)}
      ${renderRouteMonitor(data)}
      ${renderOperationalLens(data)}
      ${renderVesselDesk(data)}
    `;

    bindEvents();
    layoutRendered = true;
  }

  // ---------- Event Bindings ----------

  function bindEvents() {
    // Matrix toggle
    document.querySelectorAll('#shipping-content .shipping-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.matrix;
        if (view && state.matrixView !== view) {
          state.matrixView = view;
          // Re-render just the table + toggle highlights
          const tableContainer = document.getElementById('sl-matrix-container');
          if (tableContainer && state.data) {
            tableContainer.innerHTML = renderVesselTable(state.data);
          }
          // Update toggle button styles
          document.querySelectorAll('#shipping-content .shipping-toggle').forEach(b => {
            const isActive = b.dataset.matrix === view;
            b.classList.toggle('bg-amber-500', isActive);
            b.classList.toggle('text-white', isActive);
            b.classList.toggle('text-navy-600', !isActive);
            b.classList.toggle('hover:bg-navy-50', !isActive);
          });
        }
      });
    });
  }

  // ---------- Auto-refresh ----------

  function startAutoRefresh() {
    if (refreshInterval) return;
    refreshInterval = setInterval(() => {
      const panel = document.querySelector('[data-panel="shipping"]');
      if (panel && !panel.classList.contains('hidden')) {
        fetchData(true).then(() => {
          if (state.data) render();
        });
      }
    }, FETCH_TTL);
  }

  function stopAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  // ---------- Init ----------

  // Expose retry for error state button
  window.__shippingRetry = function () {
    state.lastFetch = 0;
    state.error = null;
    render();
  };

  function initShipping() {
    const panel = document.querySelector('[data-panel="shipping"]');
    if (!panel) return;

    const observer = new MutationObserver(() => {
      if (!panel.classList.contains('hidden')) {
        render();
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });

    // Render immediately if visible
    if (!panel.classList.contains('hidden')) {
      render();
      startAutoRefresh();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShipping);
  } else {
    initShipping();
  }

})();
