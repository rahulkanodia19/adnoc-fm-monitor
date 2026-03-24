// ============================================================
// import-flows.js -- Import Flows Dashboard
// Crude & LNG imports by origin country (weekly/monthly)
// ============================================================

(function () {
  'use strict';

  // ---------- Constants ----------
  const DATASETS = {
    china_crude:       { label: 'China Crude',       unit: 'mbbl', country: 'china',       commodity: 'crude' },
    china_lng:         { label: 'China LNG',         unit: 'Mt',   country: 'china',       commodity: 'lng' },
    india_crude:       { label: 'India Crude',       unit: 'mbbl', country: 'india',       commodity: 'crude' },
    india_lng:         { label: 'India LNG',         unit: 'Mt',   country: 'india',       commodity: 'lng' },
    japan_crude:       { label: 'Japan Crude',       unit: 'mbbl', country: 'japan',       commodity: 'crude' },
    japan_lng:         { label: 'Japan LNG',         unit: 'Mt',   country: 'japan',       commodity: 'lng' },
    south_korea_crude: { label: 'S. Korea Crude',    unit: 'mbbl', country: 'south_korea', commodity: 'crude' },
    south_korea_lng:   { label: 'S. Korea LNG',      unit: 'Mt',   country: 'south_korea', commodity: 'lng' },
  };

  const CHART_COLORS = [
    '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
    '#e11d48', '#84cc16', '#a855f7', '#22d3ee', '#fb923c',
  ];

  const SHARED_LEGEND = {
    position: 'bottom',
    labels: {
      boxWidth: 14,
      boxHeight: 14,
      font: { size: 10 },
      padding: 10,
      usePointStyle: true,
      pointStyle: 'rectRounded',
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

  const DONUT_LEGEND = {
    position: 'bottom',
    labels: {
      boxWidth: 12, boxHeight: 12, font: { size: 10 }, padding: 8,
      usePointStyle: true, pointStyle: 'rectRounded',
      generateLabels(chart) {
        const ds = chart.data.datasets[0];
        return chart.data.labels.map((label, i) => ({
          text: label,
          fillStyle: ds.backgroundColor[i],
          strokeStyle: ds.backgroundColor[i],
          lineWidth: 0,
          hidden: !chart.getDataVisibility(i),
          index: i, pointStyle: 'rectRounded',
        }));
      },
    },
    onClick(e, legendItem, legend) {
      legend.chart.toggleDataVisibility(legendItem.index);
      legend.chart.update();
    },
  };

  // ---------- State ----------
  let state = {
    country: 'india',
    commodity: 'crude',
    view: 'monthly',
    topN: 10,
    timeRange: '3m',
  };

  let charts = {};
  let layoutRendered = false;

  // ---------- Data Helpers ----------

  function getActiveKeys() {
    const keys = [];
    for (const [k, meta] of Object.entries(DATASETS)) {
      if (meta.country !== state.country) continue;
      if (meta.commodity !== state.commodity) continue;
      keys.push(k);
    }
    return keys;
  }

  function getAggData(key) {
    const src = IMPORT_FLOW_DATA[key];
    return state.view === 'weekly' ? src.weekly : src.monthly;
  }

  function filterByTimeRange(records) {
    if (state.timeRange === 'all') return records;
    const now = new Date('2026-03-24');
    const months = { '12m': 12, '6m': 6, '3m': 3, '1m': 1 };
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - months[state.timeRange]);
    return records.filter(r => {
      const d = new Date(r.s || r.p + '-01');
      return d >= cutoff;
    });
  }

  function getLabel(record) {
    if (record.s) {
      const s = new Date(record.s);
      return s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    }
    const d = new Date(record.p + '-01');
    return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  }

  function isPartialPeriod(base, idx) {
    if (!base || !base[idx]) return false;
    const rec = base[idx];
    if (state.view === 'monthly') return rec.d < 28;
    return rec.d < 5;
  }

  function getLastUpdatedDate() {
    const keys = getActiveKeys();
    if (keys.length === 0) return null;
    const data = IMPORT_FLOW_DATA[keys[0]];
    const weekly = data.weekly;
    if (weekly && weekly.length > 0) {
      const endDate = weekly[weekly.length - 1].e;
      const today = new Date().toISOString().slice(0, 10);
      return endDate > today ? today : endDate;
    }
    return null;
  }

  function getMergedTimeline() {
    const keys = getActiveKeys();
    if (keys.length === 0) return { labels: [], periods: [], totals: [], topSuppliers: [], countrySeriesData: {}, others: [], perPeriod: {}, countryTotals: {}, base: [] };

    const base = filterByTimeRange(getAggData(keys[0]));
    const periodSet = base.map(r => r.p);

    const allCountries = new Set();
    const perPeriod = {};

    for (const period of periodSet) {
      perPeriod[period] = { total: 0, countries: {} };
    }

    for (const key of keys) {
      const records = filterByTimeRange(getAggData(key));
      const src = IMPORT_FLOW_DATA[key];
      for (const r of records) {
        if (!perPeriod[r.p]) continue;
        perPeriod[r.p].total += r._t || 0;
        for (const c of src.countries) {
          if (r[c] && r[c] > 0) {
            allCountries.add(c);
            perPeriod[r.p].countries[c] = (perPeriod[r.p].countries[c] || 0) + r[c];
          }
        }
      }
    }

    const countryTotals = {};
    for (const c of allCountries) {
      countryTotals[c] = 0;
      for (const p of periodSet) {
        countryTotals[c] += perPeriod[p].countries[c] || 0;
      }
    }
    const topSuppliers = Object.entries(countryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, state.topN)
      .map(e => e[0]);

    const labels = base.map(getLabel);
    const totals = periodSet.map(p => Math.round(perPeriod[p].total));

    const countrySeriesData = {};
    for (const c of topSuppliers) {
      countrySeriesData[c] = periodSet.map(p => Math.round(perPeriod[p].countries[c] || 0));
    }
    const others = periodSet.map(p => {
      const topSum = topSuppliers.reduce((s, c) => s + (perPeriod[p].countries[c] || 0), 0);
      return Math.round(perPeriod[p].total - topSum);
    });

    return { labels, periods: periodSet, totals, topSuppliers, countrySeriesData, others, perPeriod, countryTotals, base };
  }

  // ---------- KPI Computation ----------

  function computeKPIs(timeline) {
    const { totals, periods, base } = timeline;
    if (!totals || totals.length === 0) return {};

    const lastIsPartial = base && base.length > 0 && isPartialPeriod(base, base.length - 1);
    const currIdx = totals.length - 1;
    const curr = totals[currIdx] || 0;
    const currDays = base[currIdx] ? base[currIdx].d : 0;
    const currRate = currDays > 0 ? curr / currDays / 1000 : 0;

    const prevIdx = currIdx - 1;
    const prev = prevIdx >= 0 ? (totals[prevIdx] || 0) : 0;
    const prevDays = prevIdx >= 0 && base[prevIdx] ? base[prevIdx].d : 0;
    const prevRate = prevDays > 0 ? prev / prevDays / 1000 : 0;
    const pctChange = prevRate > 0 ? ((currRate - prevRate) / prevRate * 100) : 0;

    const avgRate = base.reduce((s, rec, i) => s + (rec.d > 0 ? totals[i] / rec.d / 1000 : 0), 0) / base.length;
    const avgVol = totals.reduce((a, b) => a + b, 0) / totals.length;
    const currPeriod = periods[currIdx] || null;

    return { curr, currRate, prevRate, pctChange, avgRate, avgVol, lastIsPartial, currIdx, currPeriod, currDays };
  }

  // ---------- Rendering ----------

  function getUnit() {
    return state.commodity === 'lng' ? 'Mt' : 'mbbl';
  }

  function getRateUnit() {
    return 'mbbl/d';
  }

  function toDisplay(val) {
    return val / 1000;
  }

  function toRate(val, days) {
    return days > 0 ? val / days / 1000 : 0;
  }

  function isCrude() {
    return state.commodity !== 'lng';
  }

  function fmtNum(n) {
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
    if (Math.abs(n) >= 1) return n.toFixed(1);
    if (Math.abs(n) >= 0.01) return n.toFixed(2);
    return n.toFixed(3);
  }

  function fmtPct(n) {
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function renderControls() {
    const lastDate = getLastUpdatedDate();
    const dateStr = lastDate ? new Date(lastDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    return `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div class="flex flex-wrap items-center gap-2">
          ${renderToggle('Importer', 'country', [
            ['india', 'India'], ['china', 'China'], ['japan', 'Japan'], ['south_korea', 'S. Korea']
          ])}
          ${renderToggle('Commodity', 'commodity', [
            ['crude', 'Crude'], ['lng', 'LNG']
          ])}
          ${renderToggle('View', 'view', [
            ['weekly', 'Weekly'], ['monthly', 'Monthly']
          ])}
          ${renderToggle('Range', 'timeRange', [
            ['all', 'All'], ['12m', '12M'], ['6m', '6M'], ['3m', '3M'], ['1m', '1M']
          ])}
        </div>
        ${dateStr ? `<div class="flex items-center gap-1.5 text-xs text-navy-500 bg-white px-3 py-2 rounded-lg border border-navy-200 shadow-sm">
          <svg class="w-3.5 h-3.5 text-navy-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Data as of <span class="font-semibold text-navy-700">${dateStr}</span>
        </div>` : ''}
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

  function renderKPICards(kpis) {
    if (!kpis.currRate && kpis.currRate !== 0) return '';
    const crude = isCrude();
    const displayVal = crude ? kpis.currRate : toDisplay(kpis.curr);
    const displayAvg = crude ? kpis.avgRate : toDisplay(kpis.avgVol);
    const displayUnit = crude ? getRateUnit() : getUnit();

    let periodLabel;
    if (kpis.currPeriod) {
      if (state.view === 'monthly') {
        const d = new Date(kpis.currPeriod + '-01');
        periodLabel = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      } else {
        periodLabel = kpis.currPeriod;
      }
    } else {
      periodLabel = state.view === 'weekly' ? 'Latest week' : 'Latest month';
    }
    const partialNote = kpis.lastIsPartial ? ` (${kpis.currDays}d)` : '';
    const pctUp = kpis.pctChange >= 0;
    const pctBg = pctUp ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700';
    const pctArrow = pctUp ? '&#9650;' : '&#9660;';
    const rangeLabel = state.timeRange === 'all' ? 'All-Time' : state.timeRange.toUpperCase();

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="stat-card bg-white rounded-xl p-3 sm:p-5 border border-navy-200 border-l-4 border-l-sky-400">
          <div class="flex items-center gap-2 mb-2">
            <svg class="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <span class="text-xs font-semibold text-navy-500 uppercase tracking-wider">${periodLabel}${partialNote}</span>
          </div>
          <div class="text-2xl sm:text-3xl font-extrabold text-navy-900">${fmtNum(displayVal)}</div>
          <div class="text-xs text-navy-400 mt-0.5">${displayUnit}</div>
          <div class="mt-2"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${pctBg}">${pctArrow} ${fmtPct(kpis.pctChange)} vs prior</span></div>
        </div>
        <div class="stat-card bg-white rounded-xl p-3 sm:p-5 border border-navy-200 border-l-4 border-l-amber-400">
          <div class="flex items-center gap-2 mb-2">
            <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
            </svg>
            <span class="text-xs font-semibold text-navy-500 uppercase tracking-wider">${rangeLabel} Avg</span>
          </div>
          <div class="text-2xl sm:text-3xl font-extrabold text-navy-900">${fmtNum(displayAvg)}</div>
          <div class="text-xs text-navy-400 mt-0.5">${displayUnit}</div>
          <div class="mt-2"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-navy-100 text-navy-500">All visible periods</span></div>
        </div>
      </div>
    `;
  }

  function renderLayout() {
    const crude = isCrude();
    const unit = getUnit();
    const rateUnit = getRateUnit();

    return `
      <div class="flow-fade-in">
        <div class="mb-5">
          <h2 class="text-lg font-bold text-navy-900 flex items-center gap-2">
            <svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H21M3.375 14.25V3.375c0-.621.504-1.125 1.125-1.125h9.75c.621 0 1.125.504 1.125 1.125v3.026M12 21v-7.5M12 6.375l3.375 3.375M12 6.375L8.625 9.75" />
            </svg>
            Import Flows
          </h2>
          <p class="text-sm text-navy-500 mt-0.5">Crude oil & LNG imports by origin country | Source: Kpler vessel tracking</p>
        </div>

        <div id="if-controls"></div>
        <div id="if-kpis"></div>

        ${crude ? `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5">
            <h3 class="text-base font-bold text-navy-800 mb-0.5" id="chart-trend-title">Total Import Volume</h3>
            <p class="text-xs text-navy-400 mb-3">Cumulative volume per period (${unit})</p>
            <div class="chart-container">
              <canvas id="chart-total-trend"></canvas>
            </div>
          </div>
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5">
            <h3 class="text-base font-bold text-navy-800 mb-0.5" id="chart-rate-title">Daily Import Rate</h3>
            <p class="text-xs text-navy-400 mb-3">Average daily rate per period (${rateUnit})</p>
            <div class="chart-container">
              <canvas id="chart-daily-rate"></canvas>
            </div>
          </div>
        </div>
        ` : `
        <div class="mb-6">
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5">
            <h3 class="text-base font-bold text-navy-800 mb-0.5" id="chart-trend-title">Total Import Volume</h3>
            <p class="text-xs text-navy-400 mb-3">Cumulative volume per period (${unit})</p>
            <div class="chart-container">
              <canvas id="chart-total-trend"></canvas>
            </div>
          </div>
        </div>
        `}

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5 md:col-span-2">
            <h3 class="text-base font-bold text-navy-800 mb-0.5">Origin Breakdown</h3>
            <p class="text-xs text-navy-400 mb-3">${crude ? 'Daily rate by top source countries (' + rateUnit + ')' : 'Stacked volume by top source countries (' + unit + ')'}</p>
            <div class="chart-container">
              <canvas id="chart-origin-stacked"></canvas>
            </div>
          </div>
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5">
            <h3 class="text-base font-bold text-navy-800 mb-0.5">Current Period Mix</h3>
            <p class="text-xs text-navy-400 mb-3">${crude ? 'Latest period rate breakdown (' + rateUnit + ')' : 'Latest period supplier breakdown (' + unit + ')'}</p>
            <div class="chart-container">
              <canvas id="chart-donut"></canvas>
            </div>
          </div>
        </div>

        <div class="mb-6">
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5">
            <h3 class="text-base font-bold text-navy-800 mb-0.5">Origin Share Over Time</h3>
            <p class="text-xs text-navy-400 mb-3">Percentage contribution of each supplier</p>
            <div class="chart-container chart-container-sm">
              <canvas id="chart-pct-stacked"></canvas>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-navy-200 shadow-sm overflow-hidden mb-4">
          <div class="h-1 bg-gradient-to-r from-sky-400 via-amber-400 to-sky-400"></div>
          <div class="px-5 py-4 border-b border-navy-200 flex items-center justify-between">
            <div>
              <h3 class="text-base font-bold text-navy-800">Top Suppliers Breakdown</h3>
              <p class="text-xs text-navy-400 mt-0.5">${crude ? 'Daily rate by origin country (' + rateUnit + ')' : 'Volume by origin country (' + unit + ')'}</p>
            </div>
            <span class="text-xs font-semibold text-navy-500 bg-navy-100 px-2.5 py-1 rounded-full" id="if-table-subtitle"></span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left" id="if-supplier-table-wrapper">
              <thead id="if-supplier-thead" class="bg-navy-50 text-navy-600 text-xs uppercase tracking-wider"></thead>
              <tbody id="if-supplier-table" class="divide-y divide-navy-100"></tbody>
            </table>
          </div>
          <div id="if-table-footnote" class="px-5 py-2 text-xs text-navy-400 border-t border-navy-100"></div>
        </div>
      </div>
    `;
  }

  // ---------- Chart Drawing ----------

  function destroyCharts() {
    Object.values(charts).forEach(c => { try { c.destroy(); } catch(e) {} });
    charts = {};
  }

  function buildSupplierColors(topSuppliers) {
    const colors = {};
    topSuppliers.forEach((c, i) => {
      colors[c] = CHART_COLORS[i % CHART_COLORS.length];
    });
    colors['Others'] = '#94a3b8';
    return colors;
  }

  // Donut center text plugin
  const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart) {
      if (chart.config.type !== 'doughnut') return;
      const { ctx, chartArea } = chart;
      const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillStyle = '#102a43';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmtNum(total), cx, cy - 8);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#627d98';
      ctx.fillText(isCrude() ? getRateUnit() : getUnit(), cx, cy + 10);
      ctx.restore();
    }
  };

  function drawCharts(timeline) {
    destroyCharts();
    const { labels, totals, topSuppliers, countrySeriesData, others, base } = timeline;
    if (!labels || labels.length === 0) return;

    const crude = isCrude();
    const unit = getUnit();
    const rateUnit = getRateUnit();
    const gridColor = 'rgba(16,42,67,0.06)';
    const tickColor = '#627d98';
    const supplierColors = buildSupplierColors(topSuppliers);

    const commonScaleX = {
      grid: { display: false },
      ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45, autoSkipPadding: 12 },
    };
    const commonScaleY = {
      grid: { color: gridColor },
      ticks: { color: tickColor, font: { size: 10 } },
      beginAtZero: true,
    };
    const commonTooltip = {
      backgroundColor: '#102a43',
      titleFont: { size: 12, weight: '600' },
      bodyFont: { size: 11 },
      padding: 10,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4,
    };

    const lastIsPartial = base && base.length > 0 && isPartialPeriod(base, base.length - 1);
    const partialDays = lastIsPartial ? base[base.length - 1].d : 0;

    const trendTitle = document.getElementById('chart-trend-title');
    if (trendTitle) {
      trendTitle.innerHTML = lastIsPartial
        ? `Total Import Volume <span class="text-xs font-normal text-navy-400 ml-1">(last bar: partial ${state.view === 'monthly' ? 'month' : 'week'}, ${partialDays} days)</span>`
        : 'Total Import Volume';
    }

    // Converted data
    const displayTotals = totals.map(v => toDisplay(v));
    const rateTotals = totals.map((v, i) => toRate(v, base[i] ? base[i].d : 0));

    // 1) Bar chart — Total Volume
    const ctxTrend = document.getElementById('chart-total-trend');
    if (ctxTrend) {
      const barColors = displayTotals.map((_, i) => {
        if (i === displayTotals.length - 1 && lastIsPartial) return 'rgba(14,165,233,0.35)';
        return '#0ea5e9';
      });
      const barBorders = displayTotals.map((_, i) => {
        if (i === displayTotals.length - 1 && lastIsPartial) return '#0ea5e9';
        return '#0284c7';
      });

      charts.trend = new Chart(ctxTrend, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Total Imports (' + unit + ')',
            data: displayTotals,
            backgroundColor: barColors,
            borderColor: barBorders,
            borderWidth: 1,
            borderRadius: 6,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 600, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltip,
              callbacks: {
                label: ctx => {
                  const suffix = (ctx.dataIndex === displayTotals.length - 1 && lastIsPartial) ? ` (partial \u2014 ${partialDays} days)` : '';
                  return `Total: ${ctx.parsed.y.toFixed(1)} ${unit}${suffix}`;
                }
              }
            },
          },
          scales: { x: commonScaleX, y: { ...commonScaleY, title: { display: true, text: unit, color: tickColor, font: { size: 10 } } } },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    // 1b) Bar chart — Daily Rate (mbbl/d) — crude only
    const ctxRate = document.getElementById('chart-daily-rate');
    if (ctxRate && crude) {
      const rateBarColors = rateTotals.map((_, i) => {
        if (i === rateTotals.length - 1 && lastIsPartial) return 'rgba(245,158,11,0.35)';
        return '#f59e0b';
      });
      const rateBorders = rateTotals.map((_, i) => {
        if (i === rateTotals.length - 1 && lastIsPartial) return '#f59e0b';
        return '#d97706';
      });

      charts.rate = new Chart(ctxRate, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Daily Rate (' + rateUnit + ')',
            data: rateTotals,
            backgroundColor: rateBarColors,
            borderColor: rateBorders,
            borderWidth: 1,
            borderRadius: 6,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 600, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltip,
              callbacks: {
                label: ctx => {
                  const suffix = (ctx.dataIndex === rateTotals.length - 1 && lastIsPartial) ? ` (partial \u2014 ${partialDays} days)` : '';
                  return `Rate: ${ctx.parsed.y.toFixed(2)} ${rateUnit}${suffix}`;
                }
              }
            },
          },
          scales: { x: commonScaleX, y: { ...commonScaleY, title: { display: true, text: rateUnit, color: tickColor, font: { size: 10 } } } },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    // 2) Stacked Area — rate for crude, volume for LNG
    const stackedUnit = crude ? rateUnit : unit;
    const ctxStacked = document.getElementById('chart-origin-stacked');
    if (ctxStacked) {
      const ds = topSuppliers.map(c => ({
        label: c,
        data: crude
          ? countrySeriesData[c].map((v, i) => toRate(v, base[i] ? base[i].d : 0))
          : countrySeriesData[c].map(v => toDisplay(v)),
        backgroundColor: supplierColors[c],
        borderColor: supplierColors[c],
        borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3,
      }));
      const othersData = crude
        ? others.map((v, i) => toRate(v, base[i] ? base[i].d : 0))
        : others.map(v => toDisplay(v));
      ds.push({ label: 'Others', data: othersData, backgroundColor: '#94a3b8', borderColor: '#94a3b8', borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3 });

      const stackedPrecision = crude ? 2 : 1;
      charts.stacked = new Chart(ctxStacked, {
        type: 'line', data: { labels, datasets: ds },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: SHARED_LEGEND,
            tooltip: { ...commonTooltip, mode: 'index', callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(stackedPrecision)} ${stackedUnit}` } },
          },
          scales: { x: commonScaleX, y: { ...commonScaleY, stacked: true, title: { display: true, text: stackedUnit, color: tickColor, font: { size: 10 } } } },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    // 3) % Stacked
    const ctxPct = document.getElementById('chart-pct-stacked');
    if (ctxPct) {
      const pds = topSuppliers.map(c => ({
        label: c,
        data: labels.map((_, idx) => totals[idx] > 0 ? Math.round(countrySeriesData[c][idx] / totals[idx] * 1000) / 10 : 0),
        backgroundColor: supplierColors[c],
        borderColor: supplierColors[c],
        borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3,
      }));
      pds.push({
        label: 'Others',
        data: labels.map((_, idx) => totals[idx] > 0 ? Math.round(others[idx] / totals[idx] * 1000) / 10 : 0),
        backgroundColor: '#94a3b8', borderColor: '#94a3b8', borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3,
      });

      charts.pctStacked = new Chart(ctxPct, {
        type: 'line', data: { labels, datasets: pds },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: SHARED_LEGEND,
            tooltip: { ...commonTooltip, mode: 'index', callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } },
          },
          scales: { x: commonScaleX, y: { ...commonScaleY, stacked: true, max: 100, title: { display: true, text: '%', color: tickColor, font: { size: 10 } } } },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    // 4) Donut with center text — rate for crude, volume for LNG
    const ctxDonut = document.getElementById('chart-donut');
    if (ctxDonut && topSuppliers.length > 0) {
      const lastIdx = totals.length - 1;
      const lastDays = base[lastIdx] ? base[lastIdx].d : 0;
      const donutData = crude
        ? topSuppliers.map(c => toRate(countrySeriesData[c][lastIdx] || 0, lastDays))
        : topSuppliers.map(c => toDisplay(countrySeriesData[c][lastIdx] || 0));
      const othersVal = crude
        ? toRate(others[lastIdx] || 0, lastDays)
        : toDisplay(others[lastIdx] || 0);
      const donutLabels = [...topSuppliers, 'Others'];
      const donutColors = donutLabels.map(c => supplierColors[c]);
      const donutUnit = crude ? rateUnit : unit;
      const donutPrecision = crude ? 2 : 1;

      charts.donut = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
          labels: donutLabels,
          datasets: [{ data: [...donutData, othersVal], backgroundColor: donutColors, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          plugins: {
            legend: DONUT_LEGEND,
            tooltip: { ...commonTooltip, callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0;
                return `${ctx.label}: ${ctx.parsed.toFixed(donutPrecision)} ${donutUnit} (${pct}%)`;
              }
            }},
          },
        },
        plugins: [centerTextPlugin],
      });
    }
  }

  // ---------- Supplier Table ----------

  function renderSupplierTable(timeline) {
    const { totals, topSuppliers, countrySeriesData, others, periods, base } = timeline;
    const thead = document.getElementById('if-supplier-thead');
    const tbody = document.getElementById('if-supplier-table');
    const subtitle = document.getElementById('if-table-subtitle');
    const footnote = document.getElementById('if-table-footnote');
    if (!tbody || !thead || !totals || totals.length === 0) return;

    const crude = isCrude();
    const displayUnit = crude ? getRateUnit() : getUnit();
    const precision = crude ? 2 : 1;
    const supplierColors = buildSupplierColors(topSuppliers);
    const lastIdx = totals.length - 1;

    // Always use latest period
    const refIdx = lastIdx;
    const refDays = base[refIdx] ? base[refIdx].d : 0;

    const refTotal = crude
      ? toRate(totals[refIdx] || 0, refDays)
      : toDisplay(totals[refIdx] || 0);

    const avgTotal = crude
      ? base.reduce((s, rec, i) => s + toRate(totals[i], rec.d), 0) / base.length
      : toDisplay(totals.reduce((a, b) => a + b, 0) / totals.length);

    // Latest period label
    const latestLabel = refIdx >= 0 && base[refIdx] ? getLabel(base[refIdx]) : '';

    if (subtitle) {
      subtitle.textContent = displayUnit;
    }

    thead.innerHTML = `<tr>
      <th class="px-3 py-2.5 sm:px-5 sm:py-3 font-semibold w-12">#</th>
      <th class="px-3 py-2.5 sm:px-5 sm:py-3 font-semibold">Origin Country</th>
      <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right whitespace-nowrap">${latestLabel}</th>
      <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right">Share %</th>
      <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell">Period Avg</th>
      <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell">Avg Share %</th>
    </tr>`;

    const rows = topSuppliers.map((c, i) => {
      const latestVal = crude
        ? toRate(countrySeriesData[c][refIdx] || 0, refDays)
        : toDisplay(countrySeriesData[c][refIdx] || 0);
      const latestShare = refTotal > 0 ? (latestVal / refTotal * 100) : 0;
      const periodAvg = crude
        ? base.reduce((s, rec, idx) => s + toRate(countrySeriesData[c][idx] || 0, rec.d), 0) / base.length
        : toDisplay(countrySeriesData[c].reduce((a, b) => a + b, 0) / countrySeriesData[c].length);
      const avgShare = avgTotal > 0 ? (periodAvg / avgTotal * 100) : 0;
      return { rank: i + 1, country: c, latestVal, latestShare, periodAvg, avgShare, color: supplierColors[c] };
    });

    // Others row
    const othersLatest = crude
      ? toRate(others[refIdx] || 0, refDays)
      : toDisplay(others[refIdx] || 0);
    const othersLatestShare = refTotal > 0 ? (othersLatest / refTotal * 100) : 0;
    const othersAvg = crude
      ? base.reduce((s, rec, i) => s + toRate(others[i] || 0, rec.d), 0) / base.length
      : toDisplay(others.reduce((a, b) => a + b, 0) / others.length);
    const othersAvgShare = avgTotal > 0 ? (othersAvg / avgTotal * 100) : 0;
    rows.push({ rank: rows.length + 1, country: 'Others', latestVal: othersLatest, latestShare: othersLatestShare, periodAvg: othersAvg, avgShare: othersAvgShare, color: '#94a3b8' });

    // Data rows
    const dataRowsHtml = rows.map((r, ri) => {
      const evenClass = ri % 2 === 1 ? 'bg-navy-50/30' : '';
      return `
        <tr class="hover:bg-sky-50/50 transition-colors ${evenClass}">
          <td class="px-3 py-2.5 sm:px-5 sm:py-3 text-center">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-navy-100 text-xs font-bold text-navy-600">${r.rank}</span>
          </td>
          <td class="px-3 py-2.5 sm:px-5 sm:py-3">
            <div class="flex items-center gap-2.5">
              <span class="w-1 h-6 rounded-full flex-shrink-0" style="background:${r.color}"></span>
              <span class="text-sm font-medium text-navy-800">${r.country}</span>
            </div>
          </td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700">${r.latestVal.toFixed(precision)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700">${r.latestShare.toFixed(1)}%</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700 hidden sm:table-cell">${r.periodAvg.toFixed(precision)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-600 hidden sm:table-cell">${r.avgShare.toFixed(1)}%</td>
        </tr>
      `;
    }).join('');

    // Total row
    const totalRowHtml = `
      <tr class="bg-navy-100/70 border-t-2 border-navy-300">
        <td class="px-3 py-2.5 sm:px-5 sm:py-3"></td>
        <td class="px-3 py-2.5 sm:px-5 sm:py-3 text-sm font-bold text-navy-900">Total</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold tabular-nums text-navy-900">${refTotal.toFixed(precision)}</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold text-navy-900">100%</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold tabular-nums text-navy-900 hidden sm:table-cell">${avgTotal.toFixed(precision)}</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold text-navy-900 hidden sm:table-cell">100%</td>
      </tr>
    `;

    tbody.innerHTML = dataRowsHtml + totalRowHtml;

    if (footnote) {
      footnote.innerHTML = '';
      footnote.classList.add('hidden');
    }
  }

  // ---------- Main Render ----------

  function render() {
    const container = document.getElementById('import-flows-content');
    if (!container) return;

    if (!layoutRendered) {
      container.innerHTML = renderLayout();
      layoutRendered = true;
    }

    document.getElementById('if-controls').innerHTML = renderControls();

    const timeline = getMergedTimeline();
    const kpis = computeKPIs(timeline);

    document.getElementById('if-kpis').innerHTML = renderKPICards(kpis);
    drawCharts(timeline);
    renderSupplierTable(timeline);
    bindControlEvents();
  }

  function bindControlEvents() {
    document.querySelectorAll('#import-flows-content [data-control]').forEach(btn => {
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
  }

  // ---------- Init ----------

  function initImportFlows() {
    const panel = document.querySelector('[data-panel="import-flows"]');
    if (!panel) return;

    const observer = new MutationObserver(() => {
      if (!panel.classList.contains('hidden')) {
        layoutRendered = false;
        render();
      }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });

    if (!panel.classList.contains('hidden')) {
      render();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImportFlows);
  } else {
    initImportFlows();
  }

})();
