// ============================================================
// market-prices.js -- Market Prices Dashboard
// Crude grades, Refined products, LNG & Gas benchmarks
// Data source: S&P Global Platts (daily sync)
// ============================================================

(function () {
  'use strict';

  // ---------- Constants ----------

  const COMMODITIES = {
    wti:         { label: 'WTI Futures (M1)',   category: 'crude',   unit: '$/bbl',   color: '#0ea5e9' },
    brent:       { label: 'Brent Futures (M1)', category: 'crude',   unit: '$/bbl',   color: '#f59e0b' },
    murban:      { label: 'Murban Futures (M1)',category: 'crude',   unit: '$/bbl',   color: '#10b981' },
    gasoline:    { label: 'Gasoline 95 RON',   category: 'product', unit: '$/bbl',   color: '#ef4444' },
    jetfuel:     { label: 'Jet Kero',          category: 'product', unit: '$/bbl',   color: '#ec4899' },
    gasoil:      { label: 'Gasoil 10 ppm',     category: 'product', unit: '$/bbl',   color: '#8b5cf6' },
    lng:         { label: 'LNG JKM Spot',      category: 'lng',     unit: '$/MMBtu', color: '#06b6d4' },
    lng_nwe:     { label: 'LNG NWE DES',       category: 'lng',     unit: '$/MMBtu', color: '#3b82f6' },
    ttf:         { label: 'Dutch TTF',         category: 'lng',     unit: '$/MMBtu', color: '#f97316' },
    henry_hub:   { label: 'Henry Hub',         category: 'lng',     unit: '$/MMBtu', color: '#22c55e' },
    lpg_propane: { label: 'LPG Propane FOB AG',category: 'petchem', unit: '$/mt',    color: '#14b8a6' },
    lpg_butane:  { label: 'LPG Butane FOB AG', category: 'petchem', unit: '$/mt',    color: '#0891b2' },
    ammonia:     { label: 'Ammonia FOB ME',    category: 'petchem', unit: '$/mt',    color: '#a855f7' },
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
    category: 'crude',    // 'crude' | 'product' | 'lng' | 'all'
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
    // LNG always excluded (has dedicated section). Petchem included only when category='petchem' (different unit from crude/products).
    return Object.entries(COMMODITIES)
      .filter(([, cfg]) => {
        if (cfg.category === 'lng') return false;
        if (state.category === 'petchem') return cfg.category === 'petchem';
        if (state.category === 'all') return cfg.category !== 'petchem';
        return cfg.category === state.category;
      })
      .map(([key]) => key);
  }

  function getPrimaryCommodity() {
    if (state.category === 'crude') return 'murban';
    if (state.category === 'product') return 'gasoline';
    if (state.category === 'petchem') return 'lpg_propane';
    return 'brent';
  }

  function hasCategoryData(cat) {
    if (!state.data?.prices) return false;
    return Object.entries(COMMODITIES).some(([k, c]) =>
      c.category === cat && state.data.prices[k]?.history?.length > 0);
  }

  function fmtCommodityValue(val, key) {
    if (val == null || !Number.isFinite(val)) return '—';
    const cfg = COMMODITIES[key];
    if (!cfg) return '$' + val.toFixed(1);
    const precisionByUnit = { '$/bbl': 1, '$/MMBtu': 1, '$/mt': 0, '%': 2 };
    const p = precisionByUnit[cfg.unit] ?? 1;
    if (cfg.unit === '$/mt') return '$' + val.toFixed(p);
    if (cfg.unit === '$/bbl') return '$' + val.toFixed(p);
    if (cfg.unit === '$/MMBtu') return '$' + val.toFixed(p);
    if (cfg.unit === '%') return val.toFixed(p) + '%';
    return '$' + val.toFixed(p);
  }

  function filterHistoryByRange(history) {
    if (!history || history.length === 0) return [];
    const now = new Date('2026-03-31');
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

  function formatAbsDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Range-aware helpers
  const RANGE_DAYS = { '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365 };
  const RANGE_LABELS = { '1w': '1W', '1m': '1M', '3m': '3M', '6m': '6M', '1y': '1Y' };

  function computeRangeChange(history, range) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const sorted = history.slice().sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const days = RANGE_DAYS[range] || 90;
    // Find entry closest to (last date - days)
    const targetTs = new Date(last.date).getTime() - days * 86400000;
    // Walk back to find a price on or before targetTs
    let refEntry = sorted[0];
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (new Date(sorted[i].date).getTime() <= targetTs) { refEntry = sorted[i]; break; }
    }
    const change = last.price - refEntry.price;
    const changePct = refEntry.price !== 0 ? (change / refEntry.price) * 100 : 0;
    return { change, changePct, refPrice: refEntry.price, refDate: refEntry.date, currentPrice: last.price };
  }

  function getRangeHighLow(history, range) {
    if (!Array.isArray(history) || history.length === 0) return null;
    const filtered = filterHistoryByRange(history);
    if (filtered.length === 0) return null;
    const prices = filtered.map(h => h.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const highEntry = filtered.find(h => h.price === high);
    const lowEntry = filtered.find(h => h.price === low);
    return { high, low, highDate: highEntry?.date, lowDate: lowEntry?.date };
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

  // ---------- IFAD Murban merge (replaces Platts-sourced murban with ICE IFAD data) ----------

  async function mergeMurbanIfadHistory() {
    if (!state.data || !state.data.prices) return;
    try {
      const resp = await fetch('/murban-history.json?v=' + Date.now());
      if (!resp.ok) return;
      const j = await resp.json();
      if (!Array.isArray(j.history) || j.history.length === 0) return;

      const sorted = j.history.slice().sort((a, b) => a.date.localeCompare(b.date));
      const last = sorted[sorted.length - 1];
      const prev = sorted.length > 1 ? sorted[sorted.length - 2] : last;

      // 52-week window (last 260 trading days)
      const window260 = sorted.slice(-260);
      const prices260 = window260.map(h => h.price);
      const high52w = prices260.length ? Math.max(...prices260) : last.price;
      const low52w = prices260.length ? Math.min(...prices260) : last.price;

      state.data.prices.murban = {
        current: last.price,
        previousClose: prev.price,
        high52w,
        low52w,
        history: sorted,
        _source: 'ifad-ice',
        _contract: j.contract || null,
      };
    } catch (e) {
      // silent fail — keep existing state.data.prices.murban (may be stale Platts data)
      console.warn('[market-prices] mergeMurbanIfadHistory failed:', e?.message);
    }
  }

  // ---------- Market Insights (LLM-generated) ----------

  async function fetchMarketInsights() {
    try {
      const resp = await fetch('/market-insights.json?v=' + Date.now());
      if (!resp.ok) { state.insights = null; return; }
      state.insights = await resp.json();
    } catch (e) {
      state.insights = null;
    }
  }

  // ---------- Key Insights Card ----------

  function renderInsightsCard() {
    const data = state.insights;
    if (!data || !Array.isArray(data.insights) || data.insights.length === 0) return '';

    const severityMap = {
      info:    { border: 'border-l-sky-400',     dot: 'bg-sky-500' },
      bullish: { border: 'border-l-emerald-400', dot: 'bg-emerald-500' },
      bearish: { border: 'border-l-red-400',     dot: 'bg-red-500' },
      warning: { border: 'border-l-amber-400',   dot: 'bg-amber-500' },
    };

    const bullets = data.insights.slice(0, 5).map(ins => {
      const sev = severityMap[ins.severity] || severityMap.info;
      const metricsHtml = Array.isArray(ins.metrics) && ins.metrics.length > 0
        ? `<div class="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-navy-400">
             ${ins.metrics.map(m => `<span><span class="text-navy-600 font-medium">${m.label}</span> <span class="tabular-nums text-navy-800">${m.value}</span></span>`).join('')}
           </div>`
        : '';
      return `
        <li class="flex gap-2.5 ${sev.border} border-l-2 pl-2.5 py-0.5">
          <div class="flex-1">
            <div class="text-[13px] font-semibold text-navy-800 leading-snug">${ins.title || ''}</div>
            ${ins.detail ? `<div class="text-xs text-navy-500 leading-snug mt-0.5">${ins.detail}</div>` : ''}
            ${metricsHtml}
          </div>
        </li>`;
    }).join('');

    const asOf = data.asOfDate ? formatAbsDate(data.asOfDate) : (data.generated_at ? formatAbsDate(data.generated_at) : '');

    return `
      <div class="bg-white rounded-xl border border-navy-200/70 shadow-sm p-3 sm:p-4 mb-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="w-1.5 h-5 rounded-full bg-amber-500"></span>
          <h3 class="text-sm font-bold text-navy-800">Key Insights</h3>
          ${asOf ? `<span class="text-[10px] text-navy-400 ml-auto">As of ${asOf}</span>` : ''}
        </div>
        <ul class="space-y-2">${bullets}</ul>
      </div>
    `;
  }

  // ---------- KPI Computation ----------

  function computeKPIs() {
    if (!state.data || !state.data.prices) return null;
    const primaryKey = getPrimaryCommodity();
    const priceData = state.data.prices[primaryKey];
    if (!priceData) return null;

    const current = priceData.current;
    const prevClose = priceData.previousClose || current;
    // Daily change (always day-over-day, shown in Daily Change card)
    const dailyChange = current - prevClose;
    const dailyChangePct = prevClose !== 0 ? (dailyChange / prevClose) * 100 : 0;
    // Range-aware high/low
    const hl = getRangeHighLow(priceData.history || [], state.timeRange);
    const sparse = (priceData.history || []).length < 10;

    return {
      primaryKey,
      label: COMMODITIES[primaryKey].label,
      unit: COMMODITIES[primaryKey].unit,
      current,
      prevClose,
      change: dailyChange,
      changePct: dailyChangePct,
      rangeHigh: hl?.high,
      rangeLow: hl?.low,
      rangeHighDate: hl?.highDate,
      rangeLowDate: hl?.lowDate,
      sparse,
      firstDate: (priceData.history || [])[0]?.date,
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

  function renderDataAsOf() {
    const lastUpdated = state.data?.lastUpdated;
    if (!lastUpdated) return '';
    const dateStr = typeof formatDateTimeGST === 'function'
      ? formatDateTimeGST(lastUpdated)
      : (function(x){const d=new Date(x);d.setMinutes(0,0,0);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'})+' GST'})(lastUpdated);
    if (typeof renderPipelineBadge === 'function') {
      return renderPipelineBadge('prices', lastUpdated);
    }
    return `
      <div class="flex items-center gap-1.5 text-xs text-navy-500 bg-white px-3 py-2 rounded-lg border border-navy-200 shadow-sm whitespace-nowrap">
        <svg class="w-3.5 h-3.5 text-navy-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Data as of <span class="font-semibold text-navy-700">${dateStr}</span>
      </div>
    `;
  }

  function renderSourceBanner() {
    if (!state.data) return '';
    const src = state.data._source;
    // Suppress banner for 'live' and 'stale' — only show for actual fallback/error states
    if (!src || src === 'live' || src === 'stale') return '';
    const lastUpd = state.data.lastUpdated ? formatAbsDate(state.data.lastUpdated) : 'latest';
    const msgs = {
      seed: `Showing seed data (as of ${lastUpd}).`,
      'seed-fallback': `API unavailable — showing cached data (as of ${lastUpd}).`,
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
    return `
      <div class="flex flex-col gap-3 mb-6">
        <div class="flex flex-wrap items-center gap-2">
          ${renderToggle('Category', 'category', [
            ['crude', 'Crude'], ['product', 'Products'], ['petchem', 'Petchem'], ['spread', 'Spread'], ['all', 'All']
          ])}
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
    const rangeLbl = RANGE_LABELS[state.timeRange] || '3M';
    const sparseNote = kpis.sparse ? `<div class="text-[9px] text-navy-400 mt-0.5">accumulating since ${kpis.firstDate ? formatAbsDate(kpis.firstDate) : '—'}</div>` : '';
    const highStr = kpis.sparse ? '—' : fmtPrice(kpis.rangeHigh);
    const lowStr = kpis.sparse ? '—' : fmtPrice(kpis.rangeLow);
    const highDateSub = (!kpis.sparse && kpis.rangeHighDate) ? formatAbsDate(kpis.rangeHighDate) : kpis.unit;
    const lowDateSub = (!kpis.sparse && kpis.rangeLowDate) ? formatAbsDate(kpis.rangeLowDate) : kpis.unit;

    return `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
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
          <div class="text-[10px] text-navy-400 mt-1">from $${kpis.prevClose.toFixed(2)} prev</div>
        </div>
        <div class="stat-card bg-white rounded-xl p-3 sm:p-4 border border-navy-200 border-l-4 border-l-emerald-400">
          <div class="flex items-center gap-1.5 mb-1.5">
            <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
            <span class="text-[10px] sm:text-xs font-semibold text-navy-500 uppercase tracking-wider">High (${rangeLbl})</span>
          </div>
          <div class="text-2xl sm:text-3xl font-extrabold text-navy-900">${highStr}</div>
          <div class="text-[10px] sm:text-xs text-navy-400 mt-0.5">${highDateSub}</div>
          ${sparseNote}
        </div>
        <div class="stat-card bg-white rounded-xl p-3 sm:p-4 border border-navy-200 border-l-4 border-l-red-400">
          <div class="flex items-center gap-1.5 mb-1.5">
            <svg class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
            </svg>
            <span class="text-[10px] sm:text-xs font-semibold text-navy-500 uppercase tracking-wider">Low (${rangeLbl})</span>
          </div>
          <div class="text-2xl sm:text-3xl font-extrabold text-navy-900">${lowStr}</div>
          <div class="text-[10px] sm:text-xs text-navy-400 mt-0.5">${lowDateSub}</div>
          ${sparseNote}
        </div>
      </div>
    `;
  }

  function renderMurbanSpotlight() {
    if (state.category !== 'crude' && state.category !== 'all') return '';
    if (!state.data || !state.data.prices || !state.data.prices.murban) return '';
    const raw = state.data.prices.murban;
    if (!raw || raw.current == null) return '';
    const current = raw.current;
    const prev = raw.previousClose || current;
    const change = current - prev;
    const changePct = prev !== 0 ? (change / prev) * 100 : 0;
    const up = change >= 0;
    const cc = up ? 'text-emerald-600' : 'text-red-600';
    return `
      <div class="bg-white rounded-xl p-4 sm:p-5 border border-navy-200/70 border-l-4 border-l-emerald-500 shadow-card mb-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span>ADNOC Benchmark — Murban Futures (IFAD Front-Month)</span>
              <span class="inline-flex items-center cursor-help text-navy-400 hover:text-navy-600" title="IFAD (ICE Futures Abu Dhabi) only trades futures — there is no IFAD spot market. The front-month contract represents ~2 months forward delivery per the Murban DB contract spec. For physical cargo spot prices, see Platts Dated Murban (separate assessment, not shown here).">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4m0-4h.01"/></svg>
              </span>
            </div>
            <div class="flex items-baseline gap-3">
              <span class="text-3xl sm:text-4xl font-extrabold tabular-nums text-navy-900">${fmtPrice(current)}</span>
              <span class="text-lg font-bold tabular-nums ${cc}">${fmtChange(change)}</span>
              <span class="text-sm font-medium tabular-nums ${cc}">(${fmtPct(changePct)})</span>
            </div>
            <div class="text-[11px] text-navy-400 mt-1">$/bbl · IFAD front-month contract (~2mo forward delivery) · Investing.com</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderLayout() {
    return `
      <div class="flow-fade-in">
        <div class="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 class="text-lg font-bold text-navy-900 flex items-center gap-2">
              <svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
              Market Prices
            </h2>
            <p class="text-sm text-navy-500 mt-0.5">Crude · Products · LNG · Petchem | Sources: S&P Platts + Investing.com</p>
          </div>
          <div id="mp-data-as-of"></div>
        </div>

        <div id="mp-source-banner"></div>
        <div id="mp-insights"></div>
        <div id="mp-controls"></div>
        <div id="mp-murban-spotlight"></div>
        <div id="mp-kpis"></div>

        <div id="mp-main-price-section" class="mb-6">
          <div class="bg-white rounded-xl border border-navy-200/70 shadow-sm p-3 sm:p-5">
            <h3 class="text-sm sm:text-base font-bold text-navy-800 mb-3">Price History</h3>
            <div class="chart-container">
              <canvas id="mp-chart-price"></canvas>
            </div>
          </div>
        </div>

        <div id="mp-spreads-section" class="mb-6 hidden">
          <div class="bg-white rounded-xl border border-navy-200/70 shadow-sm p-3 sm:p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="w-1.5 h-5 rounded-full bg-pink-500"></span>
              <h3 class="text-sm sm:text-base font-bold text-navy-800">Product Cracks vs Murban</h3>
              <span class="text-[10px] text-navy-400 ml-auto">$/bbl spread</span>
            </div>
            <div id="mp-spreads-kpis"></div>
            <div class="chart-container">
              <canvas id="mp-chart-spreads"></canvas>
            </div>
          </div>
        </div>

        <div id="mp-lng-section" class="mb-6">
          <div class="bg-white rounded-xl border border-navy-200/70 shadow-sm p-3 sm:p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="w-1.5 h-5 rounded-full bg-cyan-500"></span>
              <h3 class="text-sm sm:text-base font-bold text-navy-800">LNG & Natural Gas Benchmarks</h3>
              <span class="text-[10px] text-navy-400 ml-auto">$/MMBtu</span>
            </div>
            <div id="mp-lng-kpis"></div>
            <div class="chart-container">
              <canvas id="mp-chart-lng"></canvas>
            </div>
          </div>
        </div>


        <div id="mp-awrp-section" class="mb-6">
          <div class="bg-white rounded-xl border border-navy-200/70 shadow-sm p-3 sm:p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="w-1.5 h-5 rounded-full bg-red-500"></span>
              <h3 class="text-sm sm:text-base font-bold text-navy-800">War Risk Premium — Strait of Hormuz</h3>
              <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200 ml-1.5">NEW</span>
              <span class="text-[10px] text-navy-400 ml-auto">$/bbl (Platts) + % hull value</span>
            </div>
            <div id="mp-awrp-kpis"></div>
            <div class="chart-container">
              <canvas id="mp-chart-awrp"></canvas>
            </div>
          </div>
        </div>

        <div id="mp-price-table-section" class="bg-white rounded-xl border border-navy-200/70 shadow-sm overflow-hidden mb-6">
          <div class="px-3 py-3 sm:px-5 sm:py-4 border-b border-navy-100">
            <h3 class="text-sm sm:text-base font-bold text-navy-800">Price Comparison</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left min-w-[500px]">
              <thead class="bg-navy-50 text-navy-600 text-xs uppercase tracking-wider">
                <tr id="mp-price-table-head">
                  <th class="px-3 py-2.5 sm:px-5 sm:py-3 font-semibold">Commodity</th>
                  <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right">Price</th>
                  <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right" data-col="change">Δ (1D)</th>
                  <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right" data-col="pct">Δ% (1D)</th>
                  <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell" data-col="high">High (1D)</th>
                  <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell" data-col="low">Low (1D)</th>
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
          backgroundColor: cfg.color + '20',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          tension: 0.2,
          fill: true,
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
              backgroundColor: '#0a1929', titleColor: '#f0f4f8', bodyColor: '#d9e2ec',
              borderColor: '#334e68', borderWidth: 1, cornerRadius: 8,
              titleFont: { size: 12, weight: '600' }, bodyFont: { size: 11 },
              padding: 10,
              mode: 'index', intersect: false,
              callbacks: {
                label: ctx => {
                  // Resolve key from dataset label for unit-aware formatting
                  const entry = Object.entries(COMMODITIES).find(([, c]) => c.label === ctx.dataset.label);
                  const k = entry ? entry[0] : visible[0];
                  return ctx.dataset.label + ': ' + fmtCommodityValue(ctx.parsed.y, k);
                }
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
              title: { display: true, text: (COMMODITIES[visible[0]]?.unit || '$/bbl'), color: '#627d98', font: { size: 10 } },
            },
          },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    // --- Fuel spreads vs Murban ---
    drawFuelSpreadsChart(prices);

    // --- Separate LNG chart ---
    drawLngChart(prices);

    // --- War Risk Premium dual-axis chart ---
    drawAwrpChart(prices);
  }

  function drawLngChart(prices) {
    const lngCanvas = document.getElementById('mp-chart-lng');
    if (!lngCanvas) return;

    const lngKeys = Object.entries(COMMODITIES)
      .filter(([, cfg]) => cfg.category === 'lng')
      .map(([key]) => key);

    // Collect filtered history per commodity
    const histMap = {};
    const allDates = new Set();
    for (const key of lngKeys) {
      const d = prices[key];
      if (!d || !d.history) continue;
      const hist = filterHistoryByRange(d.history);
      if (hist.length === 0) continue;
      histMap[key] = {};
      for (const h of hist) { histMap[key][h.date] = h.price; allDates.add(h.date); }
    }

    // Build shared date axis (sorted)
    const sortedDates = [...allDates].sort();
    if (sortedDates.length === 0) return;
    const labels = sortedDates.map(d => formatDate(d));

    // Build datasets aligned to shared dates (null where no data)
    const datasets = [];
    for (const key of lngKeys) {
      if (!histMap[key]) continue;
      const cfg = COMMODITIES[key];
      const dataPoints = Object.keys(histMap[key]).length;
      datasets.push({
        label: cfg.label,
        data: sortedDates.map(d => histMap[key][d] ?? null),
        borderColor: cfg.color,
        backgroundColor: cfg.color + '20',
        borderWidth: 2,
        pointRadius: dataPoints < 5 ? 4 : 0,
        pointHoverRadius: 5,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        tension: 0.2,
        fill: true,
        spanGaps: false,
      });
    }
    if (datasets.length === 0) return;

    const skipFactor = labels.length > 60 ? Math.ceil(labels.length / 30) : 1;

    charts.lng = new Chart(lngCanvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: SHARED_LEGEND,
          tooltip: {
            backgroundColor: '#0a1929', titleColor: '#f0f4f8', bodyColor: '#d9e2ec',
            borderColor: '#334e68', borderWidth: 1, cornerRadius: 8,
            titleFont: { size: 12, weight: '600' }, bodyFont: { size: 11 },
            padding: 10,
            callbacks: {
              label: ctx => ctx.dataset.label + ': $' + ctx.parsed.y.toFixed(1) + '/MMBtu'
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
            ticks: { color: '#627d98', font: { size: 10 }, callback: v => '$' + v.toFixed(1) },
            title: { display: true, text: '$/MMBtu', color: '#627d98', font: { size: 10 } },
          },
        },
        interaction: { intersect: false, mode: 'index' },
      },
    });
  }

  // ---------- Fuel Spreads vs Murban ----------

  const SPREAD_PRODUCTS = ['gasoline', 'jetfuel', 'gasoil'];

  function computeFuelSpreads(prices) {
    const murbanHist = prices?.murban?.history;
    if (!Array.isArray(murbanHist) || murbanHist.length === 0) return null;
    const murbanMap = new Map(murbanHist.map(h => [h.date, h.price]));
    const series = {};
    for (const key of SPREAD_PRODUCTS) {
      const p = prices[key];
      if (!p || !Array.isArray(p.history)) continue;
      const pairs = [];
      for (const h of p.history) {
        const m = murbanMap.get(h.date);
        if (m != null) pairs.push({ date: h.date, spread: h.price - m });
      }
      if (pairs.length > 0) series[key] = pairs;
    }
    return Object.keys(series).length > 0 ? series : null;
  }

  function drawFuelSpreadsChart(prices) {
    const canvas = document.getElementById('mp-chart-spreads');
    if (!canvas) return;
    const allSeries = computeFuelSpreads(prices);
    if (!allSeries) return;

    // Filter each series by time range, then build shared date axis
    const filteredByKey = {};
    const allDates = new Set();
    for (const key of SPREAD_PRODUCTS) {
      if (!allSeries[key]) continue;
      const hist = filterHistoryByRange(allSeries[key].map(p => ({ date: p.date, price: p.spread })));
      if (hist.length === 0) continue;
      filteredByKey[key] = new Map(hist.map(h => [h.date, h.price]));
      for (const h of hist) allDates.add(h.date);
    }
    const sortedDates = [...allDates].sort();
    if (sortedDates.length === 0) return;

    const labels = sortedDates.map(d => formatDate(d));
    const skipFactor = labels.length > 60 ? Math.ceil(labels.length / 30) : 1;

    const datasets = [];
    for (const key of SPREAD_PRODUCTS) {
      if (!filteredByKey[key]) continue;
      const cfg = COMMODITIES[key];
      datasets.push({
        label: cfg.label + ' − Murban',
        data: sortedDates.map(d => filteredByKey[key].get(d) ?? null),
        borderColor: cfg.color,
        backgroundColor: cfg.color + '15',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        tension: 0.2,
        fill: false,
        spanGaps: true,
      });
    }
    if (datasets.length === 0) return;

    charts.spreads = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: SHARED_LEGEND,
          tooltip: {
            backgroundColor: '#0a1929', titleColor: '#f0f4f8', bodyColor: '#d9e2ec',
            borderColor: '#334e68', borderWidth: 1, cornerRadius: 8,
            titleFont: { size: 12, weight: '600' }, bodyFont: { size: 11 },
            padding: 10, mode: 'index', intersect: false,
            callbacks: {
              label: ctx => ctx.dataset.label + ': ' + (ctx.parsed.y >= 0 ? '+' : '') + '$' + ctx.parsed.y.toFixed(1)
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
            ticks: { color: '#627d98', font: { size: 10 }, callback: v => (v >= 0 ? '+' : '') + '$' + v.toFixed(0) },
            title: { display: true, text: '$/bbl spread', color: '#627d98', font: { size: 10 } },
          },
        },
        interaction: { intersect: false, mode: 'index' },
      },
    });
  }

  function renderSpreadKpis() {
    const el = document.getElementById('mp-spreads-kpis');
    if (!el) return;
    const prices = state.data?.prices;
    if (!prices) { el.innerHTML = ''; return; }
    const allSeries = computeFuelSpreads(prices);
    if (!allSeries) { el.innerHTML = ''; return; }

    const cards = SPREAD_PRODUCTS.map(key => {
      const series = allSeries[key];
      if (!series || series.length === 0) return '';
      const cfg = COMMODITIES[key];
      const last = series[series.length - 1];
      const prev = series.length > 1 ? series[series.length - 2] : last;
      const delta = last.spread - prev.spread;
      const dCol = delta >= 0 ? 'text-emerald-600' : 'text-red-600';
      const curStr = (last.spread >= 0 ? '+$' : '-$') + Math.abs(last.spread).toFixed(1);
      const dStr = (delta >= 0 ? '+$' : '-$') + Math.abs(delta).toFixed(2);
      return `
        <div class="bg-navy-50/50 rounded-lg p-2.5 border border-navy-100">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="w-1.5 h-3 rounded-full" style="background:${cfg.color}"></span>
            <span class="text-[10px] text-navy-500 font-medium uppercase">${cfg.label} − Murban</span>
          </div>
          <div class="font-bold text-navy-900 text-base tabular-nums">${curStr}</div>
          <div class="${dCol} text-xs font-medium tabular-nums">${dStr} today</div>
        </div>`;
    }).join('');

    el.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">${cards}</div>`;
  }

  // ---------- Generic Category Chart (petchem, etc.) ----------

  function drawCategoryChart(canvasId, categoryKey) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const prices = state.data?.prices;
    if (!prices) return;

    const keys = Object.entries(COMMODITIES)
      .filter(([, cfg]) => cfg.category === categoryKey)
      .map(([k]) => k);

    // Collect filtered history per commodity
    const histMap = {};
    const allDates = new Set();
    for (const key of keys) {
      const d = prices[key];
      if (!d || !Array.isArray(d.history)) continue;
      const hist = filterHistoryByRange(d.history);
      if (hist.length === 0) continue;
      histMap[key] = new Map(hist.map(h => [h.date, h.price]));
      for (const h of hist) allDates.add(h.date);
    }
    const sortedDates = [...allDates].sort();
    if (sortedDates.length === 0) return;

    const labels = sortedDates.map(d => formatDate(d));
    const skipFactor = labels.length > 60 ? Math.ceil(labels.length / 30) : 1;

    const datasets = [];
    for (const key of keys) {
      if (!histMap[key]) continue;
      const cfg = COMMODITIES[key];
      const dataPoints = histMap[key].size;
      datasets.push({
        label: cfg.label,
        data: sortedDates.map(d => histMap[key].get(d) ?? null),
        borderColor: cfg.color,
        backgroundColor: cfg.color + '15',
        borderWidth: 2,
        pointRadius: dataPoints < 5 ? 4 : 0,
        pointHoverRadius: 4,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        tension: 0.2,
        fill: false,
        spanGaps: true,
      });
    }
    if (datasets.length === 0) return;

    // Use unit from first commodity
    const firstKey = keys.find(k => histMap[k]);
    const unit = COMMODITIES[firstKey]?.unit || '$/mt';

    charts[categoryKey] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: SHARED_LEGEND,
          tooltip: {
            backgroundColor: '#0a1929', titleColor: '#f0f4f8', bodyColor: '#d9e2ec',
            borderColor: '#334e68', borderWidth: 1, cornerRadius: 8,
            titleFont: { size: 12, weight: '600' }, bodyFont: { size: 11 },
            padding: 10, mode: 'index', intersect: false,
            callbacks: {
              label: ctx => {
                const key = keys.find(k => COMMODITIES[k].label === ctx.dataset.label);
                return ctx.dataset.label + ': ' + fmtCommodityValue(ctx.parsed.y, key) + '/' + (unit.split('/')[1] || '');
              }
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
            title: { display: true, text: unit, color: '#627d98', font: { size: 10 } },
          },
        },
        interaction: { intersect: false, mode: 'index' },
      },
    });
  }

  function renderCategoryKpis(containerId, categoryKey) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const prices = state.data?.prices;
    if (!prices) { el.innerHTML = ''; return; }

    const keys = Object.entries(COMMODITIES)
      .filter(([, cfg]) => cfg.category === categoryKey)
      .map(([k]) => k);

    const cards = keys.map(key => {
      const p = prices[key];
      if (!p || p.current == null) return '';
      const cfg = COMMODITIES[key];
      const current = p.current;
      const prev = p.previousClose || current;
      const change = current - prev;
      const changePct = prev !== 0 ? (change / prev) * 100 : 0;
      const up = change >= 0;
      const cc = up ? 'text-emerald-600' : 'text-red-600';
      const arrow = up ? '&#9650;' : '&#9660;';
      const sign = change >= 0 ? '+' : '';
      return `
        <div class="bg-navy-50/50 rounded-lg p-2.5 border border-navy-100">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="w-1.5 h-3 rounded-full" style="background:${cfg.color}"></span>
            <span class="text-[10px] text-navy-500 font-medium uppercase">${cfg.label}</span>
          </div>
          <div class="font-bold text-navy-900 text-base tabular-nums">${fmtCommodityValue(current, key)}</div>
          <div class="${cc} text-xs font-medium tabular-nums">${sign}${change.toFixed(1)} (${arrow} ${fmtPct(changePct)})</div>
        </div>`;
    }).join('');

    el.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">${cards}</div>`;
  }

  // ---------- AWRP Dual-Axis Chart ----------

  function drawAwrpChart(prices) {
    const canvas = document.getElementById('mp-chart-awrp');
    if (!canvas) return;

    // $/bbl series from Platts AWARA00
    const awrpPlatts = prices?.awrp;
    const plattsHist = awrpPlatts?.history ? filterHistoryByRange(awrpPlatts.history) : [];
    const plattsMap = new Map(plattsHist.map(h => [h.date, h.price]));

    // % hull value series from WAR_RISK_PREMIUM_DATA (global from data.js)
    const hullData = (typeof WAR_RISK_PREMIUM_DATA !== 'undefined') ? WAR_RISK_PREMIUM_DATA : null;
    const hullHist = hullData?.history ? filterHistoryByRange(hullData.history.map(h => ({ date: h.date, price: h.rate }))) : [];
    const hullMap = new Map(hullHist.map(h => [h.date, h.price]));

    // Merge date axes
    const allDates = new Set([...plattsMap.keys(), ...hullMap.keys()]);
    const sortedDates = [...allDates].sort();
    if (sortedDates.length === 0) return;

    const labels = sortedDates.map(d => formatDate(d));
    const skipFactor = labels.length > 60 ? Math.ceil(labels.length / 30) : 1;

    const datasets = [];

    // $/bbl line (left axis)
    if (plattsMap.size > 0) {
      datasets.push({
        label: 'AWRP ($/bbl)',
        data: sortedDates.map(d => plattsMap.get(d) ?? null),
        borderColor: '#ef4444',
        backgroundColor: '#ef444420',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        tension: 0.2,
        fill: true,
        spanGaps: true,
        yAxisID: 'y',
      });
    }

    // % hull value line (right axis)
    if (hullMap.size > 0) {
      datasets.push({
        label: '% Hull Value',
        data: sortedDates.map(d => hullMap.get(d) ?? null),
        borderColor: '#8b5cf6',
        backgroundColor: '#8b5cf620',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        tension: 0.2,
        fill: false,
        spanGaps: true,
        yAxisID: 'y2',
      });
    }

    if (datasets.length === 0) return;

    // Compute dynamic axis maxes
    const plattsMax = plattsMap.size > 0 ? Math.max(...plattsMap.values()) : 5;
    const hullMax = hullMap.size > 0 ? Math.max(...hullMap.values()) : 10;

    charts.awrp = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10, boxHeight: 10, font: { size: 9 }, padding: 8,
              usePointStyle: true, pointStyle: 'rectRounded',
              generateLabels: SHARED_LEGEND.labels.generateLabels,
            }
          },
          tooltip: {
            backgroundColor: '#0a1929', titleColor: '#f0f4f8', bodyColor: '#d9e2ec',
            borderColor: '#334e68', borderWidth: 1, cornerRadius: 8,
            titleFont: { size: 12, weight: '600' }, bodyFont: { size: 11 },
            padding: 10,
            mode: 'index', intersect: false,
            callbacks: {
              label: function (ctx) {
                if (ctx.dataset.yAxisID === 'y2') {
                  return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + '%';
                }
                return ctx.dataset.label + ': $' + ctx.parsed.y.toFixed(2);
              }
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
            suggestedMin: 0,
            suggestedMax: Math.max(5, plattsMax * 1.1),
            ticks: { color: '#ef4444', font: { size: 9 }, callback: v => '$' + v.toFixed(2) },
            title: { display: true, text: '$/bbl', color: '#ef4444', font: { size: 9, weight: '600' } },
          },
          y2: {
            position: 'right',
            grid: { drawOnChartArea: false },
            suggestedMin: 0,
            suggestedMax: Math.max(10, hullMax * 1.1),
            ticks: { color: '#8b5cf6', font: { size: 9 }, callback: v => v.toFixed(1) + '%' },
            title: { display: true, text: '% hull', color: '#8b5cf6', font: { size: 9, weight: '600' } },
          },
        },
        interaction: { intersect: false, mode: 'index' },
      },
    });
  }

  function renderAwrpKpis() {
    const el = document.getElementById('mp-awrp-kpis');
    if (!el) return;

    const hullData = (typeof WAR_RISK_PREMIUM_DATA !== 'undefined') ? WAR_RISK_PREMIUM_DATA : null;
    const awrpPlatts = state.data?.prices?.awrp;

    const plattsPrice = awrpPlatts?.current;
    const plattsPrev = awrpPlatts?.previousClose || plattsPrice;
    const plattsChange = plattsPrice && plattsPrev ? plattsPrice - plattsPrev : 0;

    const hullRate = hullData?.current?.rate;
    const hullBaseline = hullData?.preConflictBaseline || 0.2;
    const hullMultiple = hullRate && hullBaseline ? Math.round(hullRate / hullBaseline) : 0;

    // Dynamic baseline/peak from history
    const history = Array.isArray(hullData?.history) ? hullData.history : [];
    let baselineEntry = null;
    let peakEntry = null;
    if (history.length > 0) {
      // Baseline: entry matching preConflictBaseline rate, else first entry
      baselineEntry = history.find(h => Math.abs(h.rate - hullBaseline) < 0.001) || history[0];
      // Peak: entry with max rate
      peakEntry = history.reduce((m, h) => (h.rate > (m?.rate ?? -Infinity) ? h : m), null);
    }
    const baselineDate = baselineEntry ? formatAbsDate(baselineEntry.date) : '—';
    const peakDate = peakEntry ? formatAbsDate(peakEntry.date) : '—';
    const baselineRateStr = baselineEntry ? baselineEntry.rate.toFixed(2) + '%' : '—';
    const peakRateStr = peakEntry ? peakEntry.rate.toFixed(1) + '%' : '—';

    const plattsChangeColor = plattsChange >= 0 ? 'text-red-600' : 'text-emerald-600';
    const plattsChangeStr = (plattsChange >= 0 ? '+' : '') + plattsChange.toFixed(2);

    el.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
        ${plattsPrice != null ? `
        <div class="bg-white rounded-lg p-3 border border-navy-200 border-l-4 border-l-red-400">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-navy-500 font-semibold uppercase tracking-wider">AWRP (Platts)</span>
            <span class="text-[10px] text-navy-400">$/bbl</span>
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-2xl font-extrabold tabular-nums text-navy-900">$${plattsPrice.toFixed(2)}</span>
            <span class="text-xs font-medium tabular-nums ${plattsChangeColor}">${plattsChangeStr} today</span>
          </div>
        </div>` : ''}
        ${hullRate != null ? `
        <div class="bg-white rounded-lg p-3 border border-navy-200 border-l-4 border-l-violet-400">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-navy-500 font-semibold uppercase tracking-wider">Hull Value Premium</span>
            <span class="text-[10px] text-navy-400">% hull, 7-day</span>
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-2xl font-extrabold tabular-nums text-navy-900">${hullRate.toFixed(1)}%</span>
            <span class="text-xs font-medium tabular-nums text-red-600">${hullMultiple}x baseline</span>
          </div>
        </div>` : ''}
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-navy-500 mb-3 px-1">
        <span>Baseline <span class="font-semibold text-navy-700 tabular-nums">${baselineRateStr}</span> on ${baselineDate}</span>
        <span class="text-navy-300">|</span>
        <span>Peak <span class="font-semibold text-red-700 tabular-nums">${peakRateStr}</span> on ${peakDate}</span>
      </div>
    `;
  }

  // ---------- Price Table ----------

  function renderPriceTable() {
    const tbody = document.getElementById('mp-price-table-body');
    if (!tbody || !state.data?.prices) return;

    const rangeLbl = RANGE_LABELS[state.timeRange] || '3M';

    // Update thead column labels
    const head = document.getElementById('mp-price-table-head');
    if (head) {
      const chg = head.querySelector('[data-col="change"]');
      const pct = head.querySelector('[data-col="pct"]');
      const hi = head.querySelector('[data-col="high"]');
      const lo = head.querySelector('[data-col="low"]');
      if (chg) chg.textContent = `Δ (${rangeLbl})`;
      if (pct) pct.textContent = `Δ% (${rangeLbl})`;
      if (hi) hi.textContent = `High (${rangeLbl})`;
      if (lo) lo.textContent = `Low (${rangeLbl})`;
    }

    const rows = Object.entries(COMMODITIES).map(([key, cfg], i) => {
      const p = state.data.prices[key];
      if (!p || p.current == null) {
        return `
          <tr class="hover:bg-sky-50/50 transition-colors ${i % 2 === 1 ? 'bg-navy-50/30' : ''}">
            <td class="px-3 py-2.5 sm:px-5 sm:py-3">
              <div class="flex items-center gap-2.5">
                <span class="w-1 h-6 rounded-full flex-shrink-0" style="background:${cfg.color}"></span>
                <div>
                  <span class="text-sm font-medium text-navy-800">${cfg.label}</span>
                  <span class="text-[10px] text-navy-400 ml-1.5">${cfg.unit}</span>
                </div>
              </div>
            </td>
            <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-400" colspan="5">—</td>
          </tr>`;
      }
      const current = p.current;
      // Range-aware Δ from history
      const rangeChange = computeRangeChange(p.history || [], state.timeRange);
      const change = rangeChange?.change ?? (current - (p.previousClose || current));
      const changePct = rangeChange?.changePct ?? 0;
      const up = change >= 0;
      const changeColor = up ? 'text-emerald-600' : 'text-red-600';
      const evenClass = i % 2 === 1 ? 'bg-navy-50/30' : '';
      // Range-aware H/L
      const hl = getRangeHighLow(p.history || [], state.timeRange);
      const sparse = (p.history || []).length < 10;
      const highStr = sparse ? '<span class="text-navy-400">—</span>' : fmtCommodityValue(hl?.high, key);
      const lowStr = sparse ? '<span class="text-navy-400">—</span>' : fmtCommodityValue(hl?.low, key);

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
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums font-semibold text-navy-900">${fmtCommodityValue(current, key)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums font-medium ${changeColor}">${fmtChange(change)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums font-medium ${changeColor}">${fmtPct(changePct)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700 hidden sm:table-cell">${highStr}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700 hidden sm:table-cell">${lowStr}</td>
        </tr>
        <tr class="sm:hidden ${evenClass} border-t-0">
          <td colspan="6" class="px-3 pb-2 pt-0 text-[11px] text-navy-500">
            <span class="text-navy-500 uppercase tracking-wider text-[9px] mr-1">High</span>${highStr} <span class="text-navy-300 mx-1">&middot;</span> <span class="text-navy-500 uppercase tracking-wider text-[9px] mr-1">Low</span>${lowStr}
          </td>
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

    const dataAsOfEl = document.getElementById('mp-data-as-of');
    if (dataAsOfEl) dataAsOfEl.innerHTML = renderDataAsOf();

    const bannerEl = document.getElementById('mp-source-banner');
    if (bannerEl) bannerEl.innerHTML = renderSourceBanner();

    const insightsEl = document.getElementById('mp-insights');
    if (insightsEl) insightsEl.innerHTML = renderInsightsCard();

    const controlsEl = document.getElementById('mp-controls');
    if (controlsEl) controlsEl.innerHTML = renderControls();

    const spotlightEl = document.getElementById('mp-murban-spotlight');
    if (spotlightEl) spotlightEl.innerHTML = renderMurbanSpotlight();

    const kpis = computeKPIs();
    const kpisEl = document.getElementById('mp-kpis');
    if (kpisEl) kpisEl.innerHTML = renderKPICards(kpis);

    // LNG & Gas mini KPIs — show all LNG-category commodities
    const lngKpisEl = document.getElementById('mp-lng-kpis');
    if (lngKpisEl && state.data?.prices) {
      const lngKeys = Object.entries(COMMODITIES).filter(([, cfg]) => cfg.category === 'lng');
      lngKpisEl.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          ${lngKeys.map(([key, cfg]) => {
            const p = state.data.prices[key];
            if (!p) return '';
            const current = p.current;
            const prev = p.previousClose || current;
            const change = current - prev;
            const changePct = prev !== 0 ? (change / prev) * 100 : 0;
            const up = change >= 0;
            const cc = up ? 'text-emerald-600' : 'text-red-600';
            const arrow = up ? '&#9650;' : '&#9660;';
            return `
              <div class="bg-navy-50/50 rounded-lg p-2.5 border border-navy-100">
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="w-1.5 h-3 rounded-full" style="background:${cfg.color}"></span>
                  <span class="text-[10px] text-navy-500 font-medium uppercase">${cfg.label}</span>
                </div>
                <div class="font-bold text-navy-900 text-base">$${current.toFixed(1)}</div>
                <div class="${cc} text-xs font-medium">${fmtChange(change)} (${arrow} ${fmtPct(changePct)})</div>
              </div>`;
          }).join('')}
        </div>
      `;
    }

    renderSpreadKpis();
    renderAwrpKpis();
    drawCharts();
    renderPriceTable();
    bindControlEvents();

    // Section visibility — when category='spread', show ONLY the spreads section
    const isSpread = state.category === 'spread';
    const toggleHidden = (id, hidden) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', hidden);
    };

    // Spreads section — visible on product/all/spread IF data exists
    const hasSpreadData = state.data?.prices && !!computeFuelSpreads(state.data.prices);
    const spreadsVisible = isSpread || (state.category === 'product' || state.category === 'all');
    toggleHidden('mp-spreads-section', !(spreadsVisible && hasSpreadData));

    // Main Price History — hidden on spread only (petchem now rendered in main chart)
    toggleHidden('mp-main-price-section', isSpread);

    // LNG section — hidden on spread (show on crude/product/petchem/all)
    toggleHidden('mp-lng-section', isSpread);

    // AWRP section — hidden on spread
    toggleHidden('mp-awrp-section', isSpread);

    // Price Comparison table — hidden on spread
    toggleHidden('mp-price-table-section', isSpread);

    // Murban Spotlight — hidden on spread (it's also hidden on non-crude/all via renderMurbanSpotlight's own check)
    toggleHidden('mp-murban-spotlight', isSpread);

    // Main KPI cards — hidden on spread
    toggleHidden('mp-kpis', isSpread);
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
    await mergeMurbanIfadHistory();
    await fetchMarketInsights();
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
