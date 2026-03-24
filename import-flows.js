// ============================================================
// import-flows.js -- India & China Import Flows Dashboard
// Crude & LNG imports by origin country (weekly/monthly)
// ============================================================

(function () {
  'use strict';

  // ---------- Constants ----------
  const DATASETS = {
    china_crude: { label: 'China Crude', unit: 'kb/d', country: 'china', commodity: 'crude' },
    china_lng:   { label: 'China LNG',   unit: 'kt',   country: 'china', commodity: 'lng' },
    india_crude: { label: 'India Crude', unit: 'kb/d', country: 'india', commodity: 'crude' },
    india_lng:   { label: 'India LNG',   unit: 'kt',   country: 'india', commodity: 'lng' },
  };

  const CHART_COLORS = [
    '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
    '#e11d48', '#84cc16', '#a855f7', '#22d3ee', '#fb923c',
  ];

  // Shared legend config for consistency across charts
  const SHARED_LEGEND = {
    position: 'bottom',
    labels: { boxWidth: 10, font: { size: 10 }, padding: 8 },
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

  function getMonthLabel(period) {
    const d = new Date(period + '-01');
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
    if (weekly && weekly.length > 0) return weekly[weekly.length - 1].e;
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
    const { totals, periods, countryTotals, base } = timeline;
    if (!totals || totals.length < 2) return {};

    const lastIsPartial = base && base.length > 0 && isPartialPeriod(base, base.length - 1);
    const currIdx = lastIsPartial ? totals.length - 2 : totals.length - 1;
    const prevIdx = currIdx - 1;
    const curr = totals[currIdx] || 0;
    const prev = prevIdx >= 0 ? (totals[prevIdx] || 0) : 0;
    const pctChange = prev > 0 ? ((curr - prev) / prev * 100) : 0;

    const last4 = totals.slice(Math.max(0, currIdx - 3), currIdx + 1);
    const avg4 = last4.reduce((a, b) => a + b, 0) / last4.length;

    const recentSum = last4.reduce((a, b) => a + b, 0);
    const yoyIdx = currIdx - (state.view === 'weekly' ? 52 : 12);
    let yoyChange = null;
    if (yoyIdx >= 3) {
      const lastYearSum = totals.slice(yoyIdx - 3, yoyIdx + 1).reduce((a, b) => a + b, 0);
      if (lastYearSum > 0) yoyChange = ((recentSum - lastYearSum) / lastYearSum * 100);
    }

    const grandTotal = Object.values(countryTotals || {}).reduce((a, b) => a + b, 0);

    return { curr, prev, pctChange, avg4, yoyChange, grandTotal, lastIsPartial, currIdx };
  }

  // ---------- Rendering ----------

  function getUnit() {
    if (state.commodity === 'lng') return 'kt';
    if (state.commodity === 'crude') return 'kb/d';
    return 'mixed units';
  }

  function fmtNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.round(n).toLocaleString();
  }

  function fmtPct(n) {
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function renderControls() {
    const lastDate = getLastUpdatedDate();
    const dateStr = lastDate ? new Date(lastDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    return `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div class="flex flex-wrap items-center gap-3">
          ${renderToggle('Importer', 'country', [
            ['india', 'India'], ['china', 'China']
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
        <span class="px-3 py-2 text-xs font-semibold text-navy-500 bg-navy-50 border-r border-navy-200">${label}</span>
        ${options.map(([v, text]) => `
          <button data-control="${key}" data-value="${v}"
            class="px-3 py-2 text-sm font-medium transition-all ${state[key] === v ? 'bg-amber-500 text-white' : 'text-navy-600 hover:bg-navy-50'}"
          >${text}</button>
        `).join('')}
      </div>
    `;
  }

  function renderKPICards(kpis) {
    if (!kpis.curr && kpis.curr !== 0) return '';
    const unit = getUnit();
    const periodLabel = state.view === 'weekly' ? 'week' : 'month';
    const pctColor = kpis.pctChange >= 0 ? 'text-emerald-600' : 'text-red-600';
    const pctArrow = kpis.pctChange >= 0 ? '&#9650;' : '&#9660;';
    const yoyColor = kpis.yoyChange !== null ? (kpis.yoyChange >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-navy-400';

    return `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="stat-card bg-white rounded-xl p-4 border border-navy-200">
          <div class="text-2xl font-extrabold text-blue-600">${fmtNum(kpis.curr)}</div>
          <div class="text-sm text-navy-500 mt-1">Current ${periodLabel} (${unit})</div>
          <div class="text-xs mt-1.5 ${pctColor} font-medium">${pctArrow} ${fmtPct(kpis.pctChange)} vs prior</div>
        </div>
        <div class="stat-card bg-white rounded-xl p-4 border border-navy-200">
          <div class="text-2xl font-extrabold text-amber-600">${fmtNum(kpis.avg4)}</div>
          <div class="text-sm text-navy-500 mt-1">4-${periodLabel} avg (${unit})</div>
          <div class="text-xs mt-1.5 text-navy-400">Rolling average</div>
        </div>
        <div class="stat-card bg-white rounded-xl p-4 border border-navy-200">
          <div class="text-2xl font-extrabold ${yoyColor}">${kpis.yoyChange !== null ? fmtPct(kpis.yoyChange) : 'N/A'}</div>
          <div class="text-sm text-navy-500 mt-1">Year-over-Year</div>
          <div class="text-xs mt-1.5 text-navy-400">vs same period last year</div>
        </div>
        <div class="stat-card bg-white rounded-xl p-4 border border-navy-200">
          <div class="text-2xl font-extrabold text-violet-600">${fmtNum(kpis.grandTotal)}</div>
          <div class="text-sm text-navy-500 mt-1">Total Volume (${unit})</div>
          <div class="text-xs mt-1.5 text-navy-400">Entire visible range</div>
        </div>
      </div>
    `;
  }

  function renderLayout() {
    return `
      <div id="if-controls"></div>
      <div id="if-kpis"></div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div class="bg-white rounded-xl border border-navy-200 shadow-sm p-5">
          <h3 class="text-sm font-semibold text-navy-700 mb-3" id="chart-trend-title">Total Import Volume</h3>
          <div style="position:relative; height:320px;">
            <canvas id="chart-total-trend"></canvas>
          </div>
        </div>
        <div class="bg-white rounded-xl border border-navy-200 shadow-sm p-5">
          <h3 class="text-sm font-semibold text-navy-700 mb-3">Origin Breakdown (Stacked)</h3>
          <div style="position:relative; height:320px;">
            <canvas id="chart-origin-stacked"></canvas>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-xl border border-navy-200 shadow-sm p-5 lg:col-span-2">
          <h3 class="text-sm font-semibold text-navy-700 mb-3">Origin Share Over Time (%)</h3>
          <div style="position:relative; height:320px;">
            <canvas id="chart-pct-stacked"></canvas>
          </div>
        </div>
        <div class="bg-white rounded-xl border border-navy-200 shadow-sm p-5">
          <h3 class="text-sm font-semibold text-navy-700 mb-3">Current Period Mix</h3>
          <div style="position:relative; height:320px;">
            <canvas id="chart-donut"></canvas>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-navy-200 shadow-sm overflow-hidden mb-4">
        <div class="px-5 py-4 border-b border-navy-200 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-navy-700">Top Suppliers Breakdown</h3>
          <span class="text-xs text-navy-400" id="if-table-subtitle"></span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left" id="if-supplier-table-wrapper">
            <thead id="if-supplier-thead" class="bg-navy-50 text-navy-600 text-xs uppercase tracking-wider"></thead>
            <tbody id="if-supplier-table" class="divide-y divide-navy-100"></tbody>
          </table>
        </div>
        <div id="if-table-footnote" class="px-5 py-2 text-xs text-navy-400 border-t border-navy-100"></div>
      </div>
    `;
  }

  // ---------- Chart Drawing ----------

  function destroyCharts() {
    Object.values(charts).forEach(c => { try { c.destroy(); } catch(e) {} });
    charts = {};
  }

  // Build supplier datasets with consistent order + colors (shared across charts)
  function buildSupplierColors(topSuppliers) {
    const colors = {};
    topSuppliers.forEach((c, i) => {
      colors[c] = CHART_COLORS[i % CHART_COLORS.length];
    });
    colors['Others'] = '#94a3b8';
    return colors;
  }

  function drawCharts(timeline) {
    destroyCharts();
    const { labels, totals, topSuppliers, countrySeriesData, others, base } = timeline;
    if (!labels || labels.length === 0) return;

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

    // Detect partial last period
    const lastIsPartial = base && base.length > 0 && isPartialPeriod(base, base.length - 1);
    const partialDays = lastIsPartial ? base[base.length - 1].d : 0;

    // Update trend chart title
    const trendTitle = document.getElementById('chart-trend-title');
    if (trendTitle) {
      trendTitle.innerHTML = lastIsPartial
        ? `Total Import Volume <span class="text-xs font-normal text-navy-400 ml-1">(last bar: partial ${state.view === 'monthly' ? 'month' : 'week'}, ${partialDays} days)</span>`
        : 'Total Import Volume';
    }

    // 1) Total Volume — BAR chart
    const ctxTrend = document.getElementById('chart-total-trend');
    if (ctxTrend) {
      // Per-bar colors: last bar lighter if partial
      const barColors = totals.map((_, i) => {
        if (i === totals.length - 1 && lastIsPartial) return 'rgba(14,165,233,0.35)';
        return '#0ea5e9';
      });
      const barBorders = totals.map((_, i) => {
        if (i === totals.length - 1 && lastIsPartial) return '#0ea5e9';
        return '#0284c7';
      });

      charts.trend = new Chart(ctxTrend, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Total Imports (' + getUnit() + ')',
            data: totals,
            backgroundColor: barColors,
            borderColor: barBorders,
            borderWidth: 1,
            borderRadius: 4,
            borderDash: [],
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltip,
              callbacks: {
                label: ctx => {
                  const suffix = (ctx.dataIndex === totals.length - 1 && lastIsPartial) ? ` (partial — ${partialDays} days)` : '';
                  return `Total: ${ctx.parsed.y.toLocaleString()} ${getUnit()}${suffix}`;
                }
              }
            },
          },
          scales: { x: commonScaleX, y: { ...commonScaleY, title: { display: true, text: getUnit(), color: tickColor, font: { size: 10 } } } },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    // 2) Stacked Area
    const ctxStacked = document.getElementById('chart-origin-stacked');
    if (ctxStacked) {
      const ds = topSuppliers.map(c => ({
        label: c, data: countrySeriesData[c],
        backgroundColor: supplierColors[c] + '99',
        borderColor: supplierColors[c],
        borderWidth: 1, fill: true, pointRadius: 0,
      }));
      ds.push({ label: 'Others', data: others, backgroundColor: 'rgba(148,163,184,0.5)', borderColor: '#94a3b8', borderWidth: 1, fill: true, pointRadius: 0 });

      charts.stacked = new Chart(ctxStacked, {
        type: 'line', data: { labels, datasets: ds },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: SHARED_LEGEND,
            tooltip: { ...commonTooltip, mode: 'index', callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()} ${getUnit()}` } },
          },
          scales: { x: commonScaleX, y: { ...commonScaleY, stacked: true, title: { display: true, text: getUnit(), color: tickColor, font: { size: 10 } } } },
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
        backgroundColor: supplierColors[c] + '99',
        borderColor: supplierColors[c],
        borderWidth: 1, fill: true, pointRadius: 0,
      }));
      pds.push({
        label: 'Others',
        data: labels.map((_, idx) => totals[idx] > 0 ? Math.round(others[idx] / totals[idx] * 1000) / 10 : 0),
        backgroundColor: 'rgba(148,163,184,0.5)', borderColor: '#94a3b8', borderWidth: 1, fill: true, pointRadius: 0,
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

    // 4) Donut — uses same color mapping
    const ctxDonut = document.getElementById('chart-donut');
    if (ctxDonut && topSuppliers.length > 0) {
      const lastIdx = totals.length - 1;
      const donutData = topSuppliers.map(c => countrySeriesData[c][lastIdx] || 0);
      const othersVal = others[lastIdx] || 0;
      const donutLabels = [...topSuppliers, 'Others'];
      const donutColors = donutLabels.map(c => supplierColors[c]);

      charts.donut = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
          labels: donutLabels,
          datasets: [{ data: [...donutData, othersVal], backgroundColor: donutColors, borderWidth: 2, borderColor: '#fff' }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '55%',
          plugins: {
            legend: SHARED_LEGEND,
            tooltip: { ...commonTooltip, callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0;
                return `${ctx.label}: ${ctx.parsed.toLocaleString()} ${getUnit()} (${pct}%)`;
              }
            }},
          },
        },
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

    const unit = getUnit();
    const supplierColors = buildSupplierColors(topSuppliers);
    const lastIdx = totals.length - 1;

    // Determine which periods to show as columns
    const periodIndices = [];
    for (let i = 0; i < periods.length; i++) periodIndices.push(i);

    // Build month headers
    const lastIsPartial = base && base.length > 0 && isPartialPeriod(base, base.length - 1);
    const partialDays = lastIsPartial ? base[base.length - 1].d : 0;

    const monthHeaders = periodIndices.map(i => {
      const label = getLabel(base[i]);
      const isLast = i === lastIdx;
      return isLast && lastIsPartial ? label + '*' : label;
    });

    if (subtitle) {
      subtitle.textContent = unit;
    }

    // Build thead
    thead.innerHTML = `<tr>
      <th class="px-5 py-3 font-semibold">#</th>
      <th class="px-5 py-3 font-semibold">Origin Country</th>
      ${monthHeaders.map(h => `<th class="px-4 py-3 font-semibold text-right whitespace-nowrap">${h}</th>`).join('')}
      <th class="px-4 py-3 font-semibold text-right">Change</th>
      <th class="px-4 py-3 font-semibold text-right">Share %</th>
    </tr>`;

    // Determine change: compare last full period vs the one before it
    const changeRefIdx = lastIsPartial ? lastIdx - 1 : lastIdx;
    const changePrevIdx = changeRefIdx - 1;
    const currentTotal = totals[lastIdx] || 0;

    // Build rows
    const rows = topSuppliers.map((c, i) => {
      const values = periodIndices.map(idx => countrySeriesData[c][idx] || 0);
      const refVal = changeRefIdx >= 0 ? (countrySeriesData[c][changeRefIdx] || 0) : 0;
      const prevVal = changePrevIdx >= 0 ? (countrySeriesData[c][changePrevIdx] || 0) : 0;
      const change = prevVal > 0 ? ((refVal - prevVal) / prevVal * 100) : (refVal > 0 ? 100 : 0);
      const share = currentTotal > 0 ? ((countrySeriesData[c][lastIdx] || 0) / currentTotal * 100) : 0;
      return { rank: i + 1, country: c, values, change, share, color: supplierColors[c] };
    });

    // Others row
    const othersValues = periodIndices.map(idx => others[idx] || 0);
    const othersRef = changeRefIdx >= 0 ? (others[changeRefIdx] || 0) : 0;
    const othersPrev = changePrevIdx >= 0 ? (others[changePrevIdx] || 0) : 0;
    const othersChange = othersPrev > 0 ? ((othersRef - othersPrev) / othersPrev * 100) : 0;
    const othersShare = currentTotal > 0 ? ((others[lastIdx] || 0) / currentTotal * 100) : 0;
    rows.push({ rank: rows.length + 1, country: 'Others', values: othersValues, change: othersChange, share: othersShare, color: '#94a3b8' });

    tbody.innerHTML = rows.map(r => {
      const changeColor = r.change > 0 ? 'text-emerald-600' : r.change < 0 ? 'text-red-600' : 'text-navy-400';
      const changeArrow = r.change > 0 ? '&#9650;' : r.change < 0 ? '&#9660;' : '&mdash;';
      const changePct = r.change !== 0 ? (r.change > 0 ? '+' : '') + r.change.toFixed(1) + '%' : '';
      return `
        <tr class="hover:bg-navy-50/50 transition-colors">
          <td class="px-5 py-3 text-sm text-navy-400 font-medium">${r.rank}</td>
          <td class="px-5 py-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-sm flex-shrink-0" style="background:${r.color}"></span>
              <span class="text-sm font-medium text-navy-800">${r.country}</span>
            </div>
          </td>
          ${r.values.map((v, vi) => {
            const isPartialCol = vi === lastIdx && lastIsPartial;
            return `<td class="px-4 py-3 text-right text-sm tabular-nums ${isPartialCol ? 'text-navy-400 italic' : 'text-navy-700'}">${Math.round(v).toLocaleString()}</td>`;
          }).join('')}
          <td class="px-4 py-3 text-right text-sm font-medium ${changeColor}">${changeArrow} ${changePct}</td>
          <td class="px-4 py-3 text-right text-sm font-semibold text-navy-700">${r.share.toFixed(1)}%</td>
        </tr>
      `;
    }).join('');

    // Footnote for partial period
    if (footnote) {
      if (lastIsPartial) {
        const expectedDays = state.view === 'monthly' ? 31 : 7;
        footnote.innerHTML = `* Partial ${state.view === 'monthly' ? 'month' : 'week'} (${partialDays} of ~${expectedDays} days of data)`;
        footnote.classList.remove('hidden');
      } else {
        footnote.innerHTML = '';
        footnote.classList.add('hidden');
      }
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
