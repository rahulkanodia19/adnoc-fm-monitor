// ============================================================
// market-prices.js -- Market Prices Dashboard
// Crude grades (WTI, Brent, Murban) & Refined products
// Data source: OilPriceAPI with seed-data fallback
// ============================================================

(function () {
  'use strict';

  // ---------- Constants ----------

  const COMMODITIES = {
    wti:      { label: 'WTI Crude',       category: 'crude',   unit: '$/bbl',   color: '#0ea5e9' },
    brent:    { label: 'Dated Brent',     category: 'crude',   unit: '$/bbl',   color: '#f59e0b' },
    murban:   { label: 'Murban Crude',    category: 'crude',   unit: '$/bbl',   color: '#10b981' },
    gasoline: { label: 'Gasoline 95 RON', category: 'product', unit: '$/bbl',   color: '#ef4444' },
    jetfuel:  { label: 'Jet Kero',        category: 'product', unit: '$/bbl',   color: '#ec4899' },
    gasoil:   { label: 'Gasoil 10 ppm',   category: 'product', unit: '$/bbl',   color: '#8b5cf6' },
    lng:      { label: 'LNG JKM Spot',    category: 'lng',     unit: '$/MMBtu', color: '#06b6d4' },
  };

  const SHARED_LEGEND = {
    position: 'bottom',
    labels: {
      boxWidth: 14, boxHeight: 14, font: { size: 10 }, padding: 10,
      usePointStyle: true, pointStyle: 'rectRounded',
      generateLabels(chart) {
        return chart.data.datasets.map((ds, i) => ({
          text: ds.label,
          fillStyle: ds.borderColor || ds.backgroundColor,
          strokeStyle: ds.borderColor || ds.backgroundColor,
          lineWidth: 0,
          hidden: !chart.isDatasetVisible(i),
          datasetIndex: i,
          pointStyle: 'rectRounded',
        }));
      },
    },
  };

  const FETCH_TTL = 15 * 60 * 1000; // 15 minutes

  // ---------- State ----------

  let state = {
    category: 'crude',    // 'crude' | 'product' | 'all'
    timeRange: '3m',      // '1w' | '1m' | '3m' | '6m' | '1y' | '5y'
    data: null,
    loading: false,
    error: null,
    lastFetch: 0,
  };

  let charts = {};
  let layoutRendered = false;

  // ---------- Helpers ----------

  function getVisibleCommodities() {
    // LNG has its own dedicated chart — exclude it from the main chart
    return Object.entries(COMMODITIES)
      .filter(([, cfg]) => cfg.category !== 'lng' && (state.category === 'all' || cfg.category === state.category))
      .map(([key]) => key);
  }

  function getPrimaryCommodity() {
    if (state.category === 'crude') return 'murban';
    if (state.category === 'product') return 'gasoline';
    return 'brent';
  }

  function filterHistoryByRange(history) {
    if (!history || history.length === 0) return [];
    const now = new Date('2026-03-27');
    const cutoff = new Date(now);
    const ranges = { '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365 };
    cutoff.setDate(cutoff.getDate() - (ranges[state.timeRange] || 90));
    return history.filter(h => new Date(h.date) >= cutoff);
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (state.timeRange === '1y') {
      return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    }
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  function fmtPrice(val) {
    return '$' + val.toFixed(1);
  }

  function fmtChange(val) {
    const sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(1);
  }

  function fmtPct(val) {
    const sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(1) + '%';
  }

  // ---------- Data Fetching ----------

  async function fetchPriceData(force) {
    if (!force && state.data && (Date.now() - state.lastFetch) < FETCH_TTL) {
      return state.data;
    }

    state.loading = true;
    state.error = null;
    renderLoading();

    try {
      const resp = await fetch('/api/market-prices?v=' + Date.now());
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      state.data = data;
      state.lastFetch = Date.now();
      state.loading = false;
      return data;
    } catch (err) {
      console.error('Market prices fetch error:', err);
      state.loading = false;

      // Fallback to seed data
      if (!state.data) {
        try {
          const resp = await fetch('/market-prices-seed.json?v=' + Date.now());
          if (resp.ok) {
            state.data = await resp.json();
            state.data._source = 'seed-fallback';
          }
        } catch (e) { /* ignore */ }
      }

      if (!state.data) {
        state.error = err.message;
      }

      return state.data;
    }
  }

  // ---------- KPI Computation ----------

  function computeKPIs() {
    if (!state.data || !state.data.prices) return null;
    const primaryKey = getPrimaryCommodity();
    const priceData = state.data.prices[primaryKey];
    if (!priceData) return null;

    const current = priceData.current;
    const prevClose = priceData.previousClose || current;
    const change = current - prevClose;
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    return {
      primaryKey,
      label: COMMODITIES[primaryKey].label,
      unit: COMMODITIES[primaryKey].unit,
      current,
      change,
      changePct,
      high52w: priceData.high52w,
      low52w: priceData.low52w,
    };
  }

  // ---------- Rendering ----------

  function renderLoading() {
    const container = document.getElementById('market-prices-content');
    if (!container) return;
    container.innerHTML = `
      <div class="flex items-center justify-center py-20">
        <div class="text-center">
          <svg class="w-8 h-8 mx-auto mb-3 text-amber-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p class="text-sm text-navy-500">Loading market prices...</p>
        </div>
      </div>
    `;
    layoutRendered = false;
  }

  function renderError() {
    const container = document.getElementById('market-prices-content');
    if (!container) return;
    container.innerHTML = `
      <div class="flex items-center justify-center py-20">
        <div class="text-center">
          <svg class="w-8 h-8 mx-auto mb-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p class="text-sm text-navy-700 font-medium">Failed to load market prices</p>
          <p class="text-xs text-navy-400 mt-1">${state.error || 'Unknown error'}</p>
          <button data-action="retry"
            class="mt-4 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
            Retry
          </button>
        </div>
      </div>
    `;
    layoutRendered = false;
  }

  function renderSourceBanner() {
    if (!state.data) return '';
    const src = state.data._source;
    if (!src || src === 'live') return '';
    const msgs = {
      seed: 'Showing seed data. Configure OILPRICEAPI_KEY for live prices.',
      'seed-fallback': 'API unavailable. Showing cached seed data.',
      stale: 'Showing cached data. Live API temporarily unavailable.',
    };
    return `
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800 flex items-center gap-2">
        <svg class="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        ${msgs[src] || ''}
      </div>
    `;
  }

  function renderToggle(label, key, options) {
    return `
      <div class="flex items-center bg-white rounded-lg border border-navy-200 shadow-sm overflow-hidden">
        <span class="px-2 py-1.5 text-[10px] sm:px-3 sm:py-2 sm:text-xs font-semibold text-navy-500 bg-navy-50 border-r border-navy-200">${label}</span>
        ${options.map(([v, text]) => `
          <button data-control="${key}" data-value="${v}"
            class="px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-medium transition-all ${state[key] === v ? 'bg-amber-500 text-white shadow-inner' : 'text-navy-600 hover:bg-navy-100'}"
          >${text}</button>
        `).join('')}
      </div>
    `;
  }

  function renderControls() {
    const lastUpdated = state.data?.lastUpdated;
    const dateStr = lastUpdated ? new Date(lastUpdated).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    return `
      <div class="flex flex-col gap-3 mb-6">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            ${renderToggle('Category', 'category', [
              ['crude', 'Crude'], ['product', 'Products'], ['all', 'All']
            ])}
          </div>
          ${dateStr ? `<div class="flex items-center gap-1.5 text-xs text-navy-500 bg-white px-3 py-2 rounded-lg border border-navy-200 shadow-sm">
            <svg class="w-3.5 h-3.5 text-navy-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Data as of <span class="font-semibold text-navy-700">${dateStr}</span>
          </div>` : ''}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${renderToggle('Range', 'timeRange', [
            ['1w', '1W'], ['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1Y']
          ])}
        </div>
      </div>
    `;
  }

  function renderKPICards(kpis) {
    if (!kpis) return '';
    const up = kpis.change >= 0;
    const changeColor = up ? 'text-emerald-700' : 'text-red-700';
    const changeBg = up ? 'bg-emerald-50' : 'bg-red-50';
    const arrow = up ? '&#9650;' : '&#9660;';

    return `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div class="stat-card bg-white rounded-xl p-3 sm:p-4 border border-navy-200 border-l-4 border-l-sky-400">
          <div class="flex items-center gap-1.5 mb-1.5">
            <svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-[10px] sm:text-xs font-semibold text-navy-500 uppercase tracking-wider">${kpis.label}</span>
          </div>
          <div class="text-2xl sm:text-3xl font-extrabold text-navy-900">${fmtPrice(kpis.current)}</div>
          <div class="text-[10px] sm:text-xs text-navy-400 mt-0.5">${kpis.unit}</div>
        </div>
        <div class="stat-card bg-white rounded-xl p-3 sm:p-4 border border-navy-200 border-l-4 ${up ? 'border-l-emerald-400' : 'border-l-red-400'}">
          <div class="flex items-center gap-1.5 mb-1.5">
            <svg class="w-4 h-4 ${up ? 'text-emerald-500' : 'text-red-500'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="${up ? 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941' : 'M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181'}" />
            </svg>
            <span class="text-[10px] sm:text-xs font-semibold text-navy-500 uppercase tracking-wider">Daily Change</span>
          </div>
          <div class="text-2xl sm:text-3xl font-extrabold ${changeColor}">${fmtChange(kpis.change)}</div>
          <div class="mt-1"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${changeBg} ${changeColor}">${arrow} ${fmtPct(kpis.changePct)}</span></div>
        </div>
        <div class="stat-card bg-white rounded-xl p-3 sm:p-4 border border-navy-200 border-l-4 border-l-emerald-400">
          <div class="flex items-center gap-1.5 mb-1.5">
            <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
            <span class="text-[10px] sm:text-xs font-semibold text-navy-500 uppercase tracking-wider">52W High</span>
          </div>
          <div class="text-2xl sm:text-3xl font-extrabold text-navy-900">${fmtPrice(kpis.high52w)}</div>
          <div class="text-[10px] sm:text-xs text-navy-400 mt-0.5">${kpis.unit}</div>
        </div>
        <div class="stat-card bg-white rounded-xl p-3 sm:p-4 border border-navy-200 border-l-4 border-l-red-400">
          <div class="flex items-center gap-1.5 mb-1.5">
            <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
            </svg>
            <span class="text-[10px] sm:text-xs font-semibold text-navy-500 uppercase tracking-wider">52W Low</span>
          </div>
          <div class="text-2xl sm:text-3xl font-extrabold text-navy-900">${fmtPrice(kpis.low52w)}</div>
          <div class="text-[10px] sm:text-xs text-navy-400 mt-0.5">${kpis.unit}</div>
        </div>
      </div>
    `;
  }

  function renderLayout() {
    return `
      <div class="flow-fade-in">
        <div class="mb-5">
          <h2 class="text-lg font-bold text-navy-900 flex items-center gap-2">
            <svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
            Market Prices
          </h2>
          <p class="text-sm text-navy-500 mt-0.5">Key crude grades, refined products & LNG spot prices | Source: S&P Global Platts</p>
        </div>

        <div id="mp-source-banner"></div>
        <div id="mp-controls"></div>
        <div id="mp-kpis"></div>

        <div class="mb-6">
          <div class="bg-white rounded-xl border border-navy-200 shadow-sm p-3 sm:p-5">
            <h3 class="text-sm sm:text-base font-bold text-navy-800 mb-3">Price History</h3>
            <div class="chart-container">
              <canvas id="mp-chart-price"></canvas>
            </div>
          </div>
        </div>

        <div class="mb-6">
          <div class="bg-white rounded-xl border border-navy-200 shadow-sm p-3 sm:p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="w-1.5 h-5 rounded-full bg-cyan-500"></span>
              <h3 class="text-sm sm:text-base font-bold text-navy-800">LNG Japan/Korea (JKM) Spot Price</h3>
              <span class="text-[10px] text-navy-400 ml-auto">$/MMBtu</span>
            </div>
            <div id="mp-lng-kpis"></div>
            <div class="chart-container">
              <canvas id="mp-chart-lng"></canvas>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-navy-200 shadow-sm overflow-hidden mb-6">
          <div class="px-3 py-3 sm:px-5 sm:py-4 border-b border-navy-100">
            <h3 class="text-sm sm:text-base font-bold text-navy-800">Price Comparison</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left min-w-[500px]">
              <thead class="bg-navy-50 text-navy-600 text-xs uppercase tracking-wider">
                <tr>
                  <th class="px-3 py-2.5 sm:px-5 sm:py-3 font-semibold">Commodity</th>
                  <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right">Price</th>
                  <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right">Change</th>
                  <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right">% Change</th>
                  <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell">52W High</th>
                  <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell">52W Low</th>
                </tr>
              </thead>
              <tbody id="mp-price-table-body" class="divide-y divide-navy-100">
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- Chart Drawing ----------

  function destroyCharts() {
    Object.values(charts).forEach(c => { try { c.destroy(); } catch (e) {} });
    charts = {};
  }

  function drawCharts() {
    if (!state.data || !state.data.prices) return;
    destroyCharts();

    const visible = getVisibleCommodities();
    const prices = state.data.prices;

    // Build unified date timeline from ALL visible commodities
    const allDatesSet = new Set();
    const filteredByKey = {};
    for (const key of visible) {
      const hist = filterHistoryByRange(prices[key]?.history || []);
      filteredByKey[key] = hist;
      for (const h of hist) allDatesSet.add(h.date);
    }
    const allDates = Array.from(allDatesSet).sort();
    const dateLabels = allDates.map(d => formatDate(d));

    // Thin out labels for readability
    const skipFactor = dateLabels.length > 60 ? Math.ceil(dateLabels.length / 30) : 1;

    // --- Primary price chart (crude & refined products) ---
    const priceCanvas = document.getElementById('mp-chart-price');
    if (priceCanvas && visible.length > 0) {
      const ctx = priceCanvas.getContext('2d');
      const datasets = visible.map(key => {
        const cfg = COMMODITIES[key];
        const priceMap = new Map(filteredByKey[key].map(h => [h.date, h.price]));
        const data = allDates.map(d => priceMap.get(d) ?? null);
        return {
          label: cfg.label,
          data: data,
          borderColor: cfg.color,
          backgroundColor: cfg.color + '15',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2,
          fill: false,
          spanGaps: true,
        };
      });

      charts.price = new Chart(ctx, {
        type: 'line',
        data: { labels: dateLabels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 600, easing: 'easeOutQuart' },
          plugins: {
            legend: SHARED_LEGEND,
            tooltip: {
              backgroundColor: '#102a43', titleColor: '#fff', bodyColor: '#d9e2ec',
              borderColor: '#334e68', borderWidth: 1, padding: 10,
              mode: 'index', intersect: false,
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' + fmtPrice(ctx.parsed.y)
              }
            },
            datalabels: { display: false },
          },
          scales: {
            x: {
              grid: { color: 'rgba(16,42,67,0.06)' },
              ticks: {
                color: '#627d98', font: { size: 10 }, maxRotation: 45,
                callback: function (val, idx) { return idx % skipFactor === 0 ? this.getLabelForValue(val) : ''; }
              },
            },
            y: {
              position: 'left',
              grid: { color: 'rgba(16,42,67,0.06)' },
              ticks: { color: '#627d98', font: { size: 10 }, callback: v => '$' + v.toFixed(0) },
              title: { display: true, text: '$/bbl', color: '#627d98', font: { size: 10 } },
            },
          },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    // --- Separate LNG chart ---
    drawLngChart(prices);
  }

  function drawLngChart(prices) {
    const lngCanvas = document.getElementById('mp-chart-lng');
    if (!lngCanvas) return;
    const lngData = prices.lng;
    if (!lngData || !lngData.history) return;

    const hist = filterHistoryByRange(lngData.history);
    if (hist.length === 0) return;

    const labels = hist.map(h => formatDate(h.date));
    const data = hist.map(h => h.price);
    const skipFactor = labels.length > 60 ? Math.ceil(labels.length / 30) : 1;

    const cfg = COMMODITIES.lng;
    const gradient = lngCanvas.getContext('2d').createLinearGradient(0, 0, 0, lngCanvas.parentElement.clientHeight || 260);
    gradient.addColorStop(0, cfg.color + '30');
    gradient.addColorStop(1, cfg.color + '02');

    charts.lng = new Chart(lngCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: cfg.label,
          data,
          borderColor: cfg.color,
          backgroundColor: gradient,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2,
          fill: true,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#102a43', titleColor: '#fff', bodyColor: '#d9e2ec',
            borderColor: '#334e68', borderWidth: 1, padding: 10,
            callbacks: {
              label: ctx => cfg.label + ': $' + ctx.parsed.y.toFixed(3) + '/MMBtu'
            }
          },
          datalabels: { display: false },
        },
        scales: {
          x: {
            grid: { color: 'rgba(16,42,67,0.06)' },
            ticks: {
              color: '#627d98', font: { size: 10 }, maxRotation: 45,
              callback: function (val, idx) { return idx % skipFactor === 0 ? this.getLabelForValue(val) : ''; }
            },
          },
          y: {
            position: 'left',
            grid: { color: 'rgba(16,42,67,0.06)' },
            ticks: { color: '#627d98', font: { size: 10 }, callback: v => '$' + v.toFixed(0) },
            title: { display: true, text: '$/MMBtu', color: '#627d98', font: { size: 10 } },
          },
        },
        interaction: { intersect: false, mode: 'index' },
      },
    });
  }

  // ---------- Price Table ----------

  function renderPriceTable() {
    const tbody = document.getElementById('mp-price-table-body');
    if (!tbody || !state.data?.prices) return;

    const rows = Object.entries(COMMODITIES).map(([key, cfg], i) => {
      const p = state.data.prices[key];
      if (!p) return '';
      const current = p.current;
      const prev = p.previousClose || current;
      const change = current - prev;
      const changePct = prev !== 0 ? (change / prev) * 100 : 0;
      const up = change >= 0;
      const changeColor = up ? 'text-emerald-600' : 'text-red-600';
      const evenClass = i % 2 === 1 ? 'bg-navy-50/30' : '';

      return `
        <tr class="hover:bg-sky-50/50 transition-colors ${evenClass}">
          <td class="px-3 py-2.5 sm:px-5 sm:py-3">
            <div class="flex items-center gap-2.5">
              <span class="w-1 h-6 rounded-full flex-shrink-0" style="background:${cfg.color}"></span>
              <div>
                <span class="text-sm font-medium text-navy-800">${cfg.label}</span>
                <span class="text-[10px] text-navy-400 ml-1.5">${cfg.unit}</span>
              </div>
            </div>
          </td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums font-semibold text-navy-900">${fmtPrice(current)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums font-medium ${changeColor}">${fmtChange(change)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums font-medium ${changeColor}">${fmtPct(changePct)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700 hidden sm:table-cell">${fmtPrice(p.high52w)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700 hidden sm:table-cell">${fmtPrice(p.low52w)}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rows;
  }

  // ---------- Main Render ----------

  function render() {
    const container = document.getElementById('market-prices-content');
    if (!container) return;

    if (state.error && !state.data) {
      renderError();
      return;
    }

    if (!layoutRendered) {
      container.innerHTML = renderLayout();
      layoutRendered = true;
    }

    const bannerEl = document.getElementById('mp-source-banner');
    if (bannerEl) bannerEl.innerHTML = renderSourceBanner();

    const controlsEl = document.getElementById('mp-controls');
    if (controlsEl) controlsEl.innerHTML = renderControls();

    const kpis = computeKPIs();
    const kpisEl = document.getElementById('mp-kpis');
    if (kpisEl) kpisEl.innerHTML = renderKPICards(kpis);

    // LNG mini KPIs
    const lngKpisEl = document.getElementById('mp-lng-kpis');
    if (lngKpisEl && state.data?.prices?.lng) {
      const p = state.data.prices.lng;
      const current = p.current;
      const prev = p.previousClose || current;
      const change = current - prev;
      const changePct = prev !== 0 ? (change / prev) * 100 : 0;
      const up = change >= 0;
      const cc = up ? 'text-emerald-600' : 'text-red-600';
      const arrow = up ? '&#9650;' : '&#9660;';
      lngKpisEl.innerHTML = `
        <div class="flex flex-wrap items-center gap-4 mb-3 text-sm">
          <span class="font-bold text-navy-900 text-lg">$${current.toFixed(3)}</span>
          <span class="${cc} font-medium">${fmtChange(change)} (${arrow} ${fmtPct(changePct)})</span>
          <span class="text-navy-400 text-xs">52W: <span class="text-navy-600 font-medium">$${p.low52w.toFixed(2)}</span> – <span class="text-navy-600 font-medium">$${p.high52w.toFixed(2)}</span></span>
        </div>
      `;
    }

    drawCharts();
    renderPriceTable();
    bindControlEvents();
  }

  function bindControlEvents() {
    document.querySelectorAll('#market-prices-content [data-control]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.control;
        const val = btn.dataset.value;
        if (state[key] !== val) {
          state[key] = val;
          layoutRendered = false;
          render();
        }
      });
    });

    // Retry button
    document.querySelectorAll('#market-prices-content [data-action="retry"]').forEach(btn => {
      btn.addEventListener('click', () => {
        fetchAndRender(true);
      });
    });
  }

  // ---------- Fetch + Render ----------

  async function fetchAndRender(force) {
    await fetchPriceData(force);
    render();
  }

  // ---------- Init ----------

  function initMarketPrices() {
    const panel = document.querySelector('[data-panel="market-prices"]');
    if (!panel) return;

    const observer = new MutationObserver(() => {
      if (!panel.classList.contains('hidden')) {
        layoutRendered = false;
        fetchAndRender(true); // always fetch fresh data when tab is shown
      }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });

    if (!panel.classList.contains('hidden')) {
      fetchAndRender(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMarketPrices);
  } else {
    initMarketPrices();
  }

})();
