// ============================================================
// export-flows.js -- Export Flows Dashboard
// Crude, LNG & LPG exports by destination country (daily/weekly/monthly)
// ============================================================

(function () {
  'use strict';

  // Register datalabels plugin if available, disabled by default
  if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
    Chart.defaults.plugins.datalabels = { display: false };
  }

  // ---------- Constants ----------
  const DATASETS = {
    bahrain_crude:       { label: 'Bahrain',      unit: 'mbbl', key: 'bahrain',       commodity: 'crude' },
    bahrain_lng:         { label: 'Bahrain',      unit: 'Mt',   key: 'bahrain',       commodity: 'lng' },
    bahrain_lpg:         { label: 'Bahrain',      unit: 'Mt',   key: 'bahrain',       commodity: 'lpg' },
    iran_crude:          { label: 'Iran',          unit: 'mbbl', key: 'iran',          commodity: 'crude' },
    iran_lng:            { label: 'Iran',          unit: 'Mt',   key: 'iran',          commodity: 'lng' },
    iran_lpg:            { label: 'Iran',          unit: 'Mt',   key: 'iran',          commodity: 'lpg' },
    iraq_crude:          { label: 'Iraq',          unit: 'mbbl', key: 'iraq',          commodity: 'crude' },
    iraq_lng:            { label: 'Iraq',          unit: 'Mt',   key: 'iraq',          commodity: 'lng' },
    iraq_lpg:            { label: 'Iraq',          unit: 'Mt',   key: 'iraq',          commodity: 'lpg' },
    kuwait_crude:        { label: 'Kuwait',        unit: 'mbbl', key: 'kuwait',        commodity: 'crude' },
    kuwait_lng:          { label: 'Kuwait',        unit: 'Mt',   key: 'kuwait',        commodity: 'lng' },
    kuwait_lpg:          { label: 'Kuwait',        unit: 'Mt',   key: 'kuwait',        commodity: 'lpg' },
    oman_crude:          { label: 'Oman',          unit: 'mbbl', key: 'oman',          commodity: 'crude' },
    oman_lng:            { label: 'Oman',          unit: 'Mt',   key: 'oman',          commodity: 'lng' },
    oman_lpg:            { label: 'Oman',          unit: 'Mt',   key: 'oman',          commodity: 'lpg' },
    qatar_crude:         { label: 'Qatar',         unit: 'mbbl', key: 'qatar',         commodity: 'crude' },
    qatar_lng:           { label: 'Qatar',         unit: 'Mt',   key: 'qatar',         commodity: 'lng' },
    qatar_lpg:           { label: 'Qatar',         unit: 'Mt',   key: 'qatar',         commodity: 'lpg' },
    russia_crude:        { label: 'Russia',        unit: 'mbbl', key: 'russia',        commodity: 'crude' },
    russia_lng:          { label: 'Russia',        unit: 'Mt',   key: 'russia',        commodity: 'lng' },
    russia_lpg:          { label: 'Russia',        unit: 'Mt',   key: 'russia',        commodity: 'lpg' },
    saudi_arabia_crude:  { label: 'Saudi Arabia',  unit: 'mbbl', key: 'saudi_arabia',  commodity: 'crude' },
    saudi_arabia_lng:    { label: 'Saudi Arabia',  unit: 'Mt',   key: 'saudi_arabia',  commodity: 'lng' },
    saudi_arabia_lpg:    { label: 'Saudi Arabia',  unit: 'Mt',   key: 'saudi_arabia',  commodity: 'lpg' },
    uae_lng:             { label: 'UAE',           unit: 'Mt',   key: 'uae',           commodity: 'lng' },
    uae_lpg:             { label: 'UAE',           unit: 'Mt',   key: 'uae',           commodity: 'lpg' },
    us_crude:            { label: 'United States', unit: 'mbbl', key: 'us',            commodity: 'crude' },
    us_lng:              { label: 'United States', unit: 'Mt',   key: 'us',            commodity: 'lng' },
    us_lpg:              { label: 'United States', unit: 'Mt',   key: 'us',            commodity: 'lpg' },
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
    exporter: 'saudi_arabia',
    commodity: 'crude',
    view: 'weekly',
    topN: 10,
    timeRange: '3m',
  };

  let charts = {};
  let layoutRendered = false;

  // ---------- Data Helpers ----------

  function getDataKey() {
    return state.exporter + '_' + state.commodity;
  }

  function getAggData() {
    const src = EXPORT_FLOW_DATA[getDataKey()];
    if (!src) return [];
    if (state.view === 'daily') return src.daily || [];
    return state.view === 'weekly' ? src.weekly : src.monthly;
  }

  function filterByTimeRange(records) {
    if (state.timeRange === 'all') return records;
    const now = new Date('2026-03-25');
    const cutoff = new Date(now);
    const weeks = { '1w': 1, '2w': 2, '3w': 3 };
    const months = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 };
    if (weeks[state.timeRange]) {
      cutoff.setDate(cutoff.getDate() - weeks[state.timeRange] * 7);
    } else {
      cutoff.setMonth(cutoff.getMonth() - months[state.timeRange]);
    }
    return records.filter(r => {
      const d = new Date(r.s || r.p + '-01');
      return d >= cutoff;
    });
  }

  function getLabel(record) {
    // Monthly records: show "Feb 26", "Mar 26"
    if (record.p && record.p.length === 7 && !record.p.includes('W')) {
      const d = new Date(record.p + '-01');
      return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    }
    // Daily/weekly records with start date
    if (record.s) {
      const s = new Date(record.s);
      return s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    }
    return record.p;
  }

  function isPartialPeriod(base, idx) {
    if (!base || !base[idx]) return false;
    const rec = base[idx];
    if (state.view === 'monthly') return rec.d < 28;
    if (state.view === 'daily') return false;
    return rec.d < 5;
  }

  function getLastUpdatedDate() {
    const src = EXPORT_FLOW_DATA[getDataKey()];
    if (!src) return null;
    const daily = src.daily;
    if (daily && daily.length > 0) {
      return daily[daily.length - 1].e;
    }
    const weekly = src.weekly;
    if (weekly && weekly.length > 0) {
      return weekly[weekly.length - 1].e;
    }
    return null;
  }

  function getMergedTimeline() {
    const dataKey = getDataKey();
    const src = EXPORT_FLOW_DATA[dataKey];
    if (!src) return { labels: [], periods: [], totals: [], topDestinations: [], countrySeriesData: {}, others: [], perPeriod: {}, countryTotals: {}, base: [] };

    const base = filterByTimeRange(getAggData());
    const periodSet = base.map(r => r.p);

    const allCountries = new Set();
    const perPeriod = {};

    for (const period of periodSet) {
      perPeriod[period] = { total: 0, countries: {} };
    }

    for (const r of base) {
      if (!perPeriod[r.p]) continue;
      perPeriod[r.p].total += r._t || 0;
      for (const c of src.countries) {
        if (r[c] && r[c] > 0) {
          allCountries.add(c);
          perPeriod[r.p].countries[c] = (perPeriod[r.p].countries[c] || 0) + r[c];
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
    const topDestinations = Object.entries(countryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, state.topN)
      .map(e => e[0]);

    const labels = base.map(getLabel);
    const totals = periodSet.map(p => Math.round(perPeriod[p].total));

    const countrySeriesData = {};
    for (const c of topDestinations) {
      countrySeriesData[c] = periodSet.map(p => Math.round(perPeriod[p].countries[c] || 0));
    }
    const others = periodSet.map(p => {
      const topSum = topDestinations.reduce((s, c) => s + (perPeriod[p].countries[c] || 0), 0);
      return Math.round(perPeriod[p].total - topSum);
    });

    return { labels, periods: periodSet, totals, topDestinations, countrySeriesData, others, perPeriod, countryTotals, base };
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

    const fullBase = lastIsPartial ? base.slice(0, -1) : base;
    const fullTotals = lastIsPartial ? totals.slice(0, -1) : totals;
    const avgRate = fullBase.length > 0 ? fullBase.reduce((s, rec, i) => s + (rec.d > 0 ? fullTotals[i] / rec.d / 1000 : 0), 0) / fullBase.length : 0;
    const currPeriod = periods[currIdx] || null;

    return { curr, currRate, prevRate, pctChange, avgRate, lastIsPartial, currIdx, currPeriod, currDays };
  }

  // ---------- Rendering ----------

  function getUnit() { return state.commodity === 'crude' ? 'mbbl' : 'Mt'; }
  function getRateUnit() { return state.commodity === 'crude' ? 'mbbl/d' : 'Mt/d'; }

  function toDisplay(val) { return val / 1000; }
  function toRate(val, days) { return days > 0 ? val / days / 1000 : 0; }

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

  function getExporterLabel() {
    const ds = DATASETS[getDataKey()];
    return ds ? ds.label : state.exporter;
  }

  function renderControls() {
    const lastDate = getLastUpdatedDate();
    const dateStr = lastDate ? new Date(lastDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    return `
      <div class="flex flex-col gap-3 mb-6">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            ${renderExporterToggle()}
            ${renderToggle('Commodity', 'commodity', [
              ['crude', 'Crude'], ['lng', 'LNG'], ['lpg', 'LPG']
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
          ${renderToggle('View', 'view', [
            ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']
          ])}
          ${renderToggle('Range', 'timeRange', [
            ['1w', '1W'], ['2w', '2W'], ['3w', '3W'], ['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['12m', '12M'], ['all', 'All']
          ])}
        </div>
      </div>
    `;
  }

  function renderExporterToggle() {
    const gulf = [
      ['bahrain', 'Bahrain'], ['iran', 'Iran'], ['iraq', 'Iraq'],
      ['kuwait', 'Kuwait'], ['oman', 'Oman'], ['qatar', 'Qatar'],
      ['saudi_arabia', 'Saudi'], ['uae', 'UAE'],
    ];
    const other = [['russia', 'Russia'], ['us', 'US']];

    function btn(v, text) {
      return `<button data-control="exporter" data-value="${v}"
        class="px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-medium transition-all ${state.exporter === v ? 'bg-amber-500 text-white shadow-inner' : 'text-navy-600 hover:bg-navy-100'}"
      >${text}</button>`;
    }

    return `
      <div class="flex items-start bg-white rounded-lg border border-navy-200 shadow-sm overflow-hidden">
        <span class="px-2 py-1.5 sm:px-3 sm:py-2 text-xs font-semibold text-navy-500 bg-navy-50 border-r border-navy-200 self-stretch flex items-center">Exporter</span>
        <div class="flex flex-col">
          <div class="flex flex-wrap">${gulf.map(([v, t]) => btn(v, t)).join('')}</div>
          <div class="flex flex-wrap border-t border-navy-100">${other.map(([v, t]) => btn(v, t)).join('')}</div>
        </div>
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
          <div class="text-3xl sm:text-4xl font-extrabold text-navy-900">${fmtNum(kpis.currRate)}</div>
          <div class="text-xs text-navy-400 mt-0.5">${getRateUnit()}</div>
          <div class="mt-2"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium bg-navy-100 text-navy-500">${state.view === 'daily' ? 'Daily rate' : state.view === 'weekly' ? 'Weekly avg' : 'Monthly avg'}${kpis.lastIsPartial ? ' (partial — ' + kpis.currDays + 'd)' : ''}</span></div>
        </div>
        <div class="stat-card bg-white rounded-xl p-3 sm:p-5 border border-navy-200 border-l-4 border-l-amber-400">
          <div class="flex items-center gap-2 mb-2">
            <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
            </svg>
            <span class="text-xs font-semibold text-navy-500 uppercase tracking-wider">${rangeLabel} Avg</span>
          </div>
          <div class="text-3xl sm:text-4xl font-extrabold text-navy-900">${fmtNum(kpis.avgRate)}</div>
          <div class="text-xs text-navy-400 mt-0.5">${getRateUnit()}</div>
          <div class="mt-2"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-navy-100 text-navy-500">All visible periods</span></div>
        </div>
      </div>
    `;
  }

  function generateInsights(timeline, kpis) {
    const { totals, topDestinations, countrySeriesData, base } = timeline;
    if (!totals || totals.length < 3) return [];
    const unit = getRateUnit();
    const isPartial = kpis.lastIsPartial;
    const insights = [];
    const exporterLabel = getExporterLabel();
    const commodityLabel = state.commodity === 'crude' ? 'crude oil' : state.commodity.toUpperCase();
    const rangeLabel = state.timeRange === 'all' ? 'all-time' : state.timeRange.toUpperCase();

    // Helper: friendly period label (no week numbers)
    function periodStr(rec) {
      if (state.view === 'monthly') return new Date(rec.p + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (state.view === 'weekly') {
        const s = new Date(rec.s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const e = new Date(rec.e).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return s + ' – ' + e;
      }
      return new Date(rec.s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // Reference period = latest full; prior = one before
    const refIdx = isPartial ? totals.length - 2 : totals.length - 1;
    const prevIdx = refIdx - 1;
    if (refIdx < 1) return [];
    const refDays = base[refIdx].d || 1;
    const prevDays = base[prevIdx].d || 1;
    const refVal = toRate(totals[refIdx], refDays);
    const prevVal = toRate(totals[prevIdx], prevDays);
    const refLabel = periodStr(base[refIdx]);
    const prevLabel = periodStr(base[prevIdx]);

    // Compute all full-period rates for statistical context
    const endIdx = isPartial ? totals.length - 2 : totals.length - 1;
    const fullRates = [];
    for (let i = 0; i <= endIdx; i++) {
      fullRates.push(toRate(totals[i], base[i].d || 1));
    }
    const displayAvg = kpis.avgRate;
    const minRate = Math.min(...fullRates);
    const maxRate = Math.max(...fullRates);
    const devFromAvg = displayAvg > 0 ? ((refVal - displayAvg) / displayAvg * 100) : 0;

    // Multi-period trend detection (3-period streak)
    let streak = 0;
    if (fullRates.length >= 3) {
      const last3 = fullRates.slice(-3);
      if (last3[2] > last3[1] && last3[1] > last3[0]) streak = 1;   // rising
      else if (last3[2] < last3[1] && last3[1] < last3[0]) streak = -1; // falling
    }

    // --- Bullet 1: Volume trend with multi-period context ---
    const changePct = prevVal > 0 ? ((refVal - prevVal) / prevVal * 100) : 0;
    const dir = changePct >= 0 ? 'rose' : 'fell';
    const flowType = (state.commodity === 'crude' && ['iraq', 'russia'].includes(state.exporter)) ? 'seaborne + pipeline' : 'seaborne';
    let b1 = `${exporterLabel}'s ${flowType} ${commodityLabel} exports averaged <strong>${refVal.toFixed(1)} ${unit}</strong> in ${refLabel}, ${changePct === 0 ? 'unchanged' : dir + ' ' + Math.abs(changePct).toFixed(0) + '%'} from ${prevVal.toFixed(1)} ${unit} in ${prevLabel}.`;

    // Context vs range average
    if (Math.abs(devFromAvg) > 2) {
      b1 += ` This is <strong>${Math.abs(devFromAvg).toFixed(0)}% ${devFromAvg > 0 ? 'above' : 'below'}</strong> the ${rangeLabel} average of ${displayAvg.toFixed(1)} ${unit}.`;
    } else {
      b1 += ` This is in line with the ${rangeLabel} average of ${displayAvg.toFixed(1)} ${unit}.`;
    }

    // Multi-period trend
    if (streak === 1) b1 += ` Exports have risen for three consecutive periods, signalling a sustained upward trajectory.`;
    else if (streak === -1) b1 += ` Exports have declined for three consecutive periods, indicating a persistent downward trend.`;

    // Peak/trough callout
    if (fullRates.length >= 4) {
      if (refVal === maxRate) b1 += ` This marks the highest rate in the selected range.`;
      else if (refVal === minRate) b1 += ` This is the lowest rate recorded in the selected range.`;
    }
    insights.push(b1);

    // --- Bullet 2: Destination concentration & movers ---
    if (topDestinations && topDestinations.length >= 2) {
      const top = topDestinations.slice(0, Math.min(5, topDestinations.length));
      const rising = [];
      const falling = [];
      const details = [];
      let topTotal = 0;

      for (const c of top) {
        const curr = toRate(countrySeriesData[c][refIdx] || 0, refDays);
        const prev = toRate(countrySeriesData[c][prevIdx] || 0, prevDays);
        const diff = curr - prev;
        const pctOfTotal = refVal > 0 ? (curr / refVal * 100) : 0;
        topTotal += curr;
        details.push(`${c} ${curr.toFixed(1)} ${unit} (${pctOfTotal.toFixed(0)}%)`);
        if (Math.abs(diff) >= 0.05) {
          const movePct = prev > 0 ? Math.abs(diff / prev * 100).toFixed(0) : '—';
          if (diff > 0) rising.push(`${c} +${diff.toFixed(1)} ${unit} (+${movePct}%)`);
          else falling.push(`${c} ${diff.toFixed(1)} ${unit} (−${movePct}%)`);
        }
      }

      let b2 = `<strong>Top destinations (${refLabel}):</strong> ${details.join('; ')}.`;

      // Concentration risk
      if (top.length >= 2 && refVal > 0) {
        const top2Curr = toRate(countrySeriesData[top[0]][refIdx] || 0, refDays) + toRate(countrySeriesData[top[1]][refIdx] || 0, refDays);
        const top2Share = (top2Curr / refVal * 100).toFixed(0);
        if (top2Share >= 70) b2 += ` <strong>Concentration risk:</strong> ${top[0]} and ${top[1]} account for ${top2Share}% of total exports — high buyer dependency.`;
        else if (top2Share >= 50) b2 += ` ${top[0]} and ${top[1]} together represent ${top2Share}% of volume.`;
      }

      // Biggest movers
      if (rising.length > 0 || falling.length > 0) {
        b2 += ` Period-over-period moves: ${[...rising, ...falling].join('; ')}.`;
      }
      insights.push(b2);
    }

    // --- Bullet 3: Range context & volatility ---
    if (fullRates.length >= 4) {
      const range = maxRate - minRate;
      const coeffVar = displayAvg > 0 ? ((Math.sqrt(fullRates.reduce((s, v) => s + (v - displayAvg) ** 2, 0) / fullRates.length) / displayAvg) * 100) : 0;
      let b3 = `Over the selected ${rangeLabel} range, ${commodityLabel} export rates have ranged from ${minRate.toFixed(1)} to ${maxRate.toFixed(1)} ${unit} (spread: ${range.toFixed(1)} ${unit}).`;

      if (coeffVar > 25) b3 += ` Volatility is <strong>high</strong> (CV ${coeffVar.toFixed(0)}%) — export volumes have fluctuated significantly, suggesting supply or logistics disruptions.`;
      else if (coeffVar > 12) b3 += ` Moderate variability (CV ${coeffVar.toFixed(0)}%) points to periodic shifts in export scheduling or demand patterns.`;
      else b3 += ` Low variability (CV ${coeffVar.toFixed(0)}%) indicates stable, predictable export flows.`;

      insights.push(b3);
    }

    // --- Bullet 4: Strategic synthesis (dynamic, forward-looking) ---
    let b4 = '<strong>Outlook:</strong> ';
    const parts = [];

    // Trend + momentum
    if (streak === 1 && devFromAvg > 10) parts.push(`${exporterLabel}'s exports are on an upward trajectory and running well above the ${rangeLabel} norm — watch for potential capacity constraints or destination saturation`);
    else if (streak === -1 && devFromAvg < -10) parts.push(`Persistent volume declines well below the ${rangeLabel} average signal a structural shift — monitor whether this reflects reduced production, rerouted flows, or demand-side pullback`);
    else if (Math.abs(changePct) > 20) parts.push(`The sharp ${changePct > 0 ? 'increase' : 'decrease'} of ${Math.abs(changePct).toFixed(0)}% warrants close monitoring to determine if this is a one-off adjustment or the start of a new trend`);
    else parts.push(`Export volumes are tracking within normal ranges for ${exporterLabel}`);

    // Concentration-based outlook
    if (topDestinations && topDestinations.length >= 2 && refVal > 0) {
      const topDest = topDestinations[0];
      const topDestVal = toRate(countrySeriesData[topDest][refIdx] || 0, refDays);
      const topDestShare = (topDestVal / refVal * 100);
      if (topDestShare > 45) parts.push(`heavy reliance on ${topDest} (${topDestShare.toFixed(0)}% of exports) creates buyer-concentration risk — any demand shock from this market would significantly impact ${exporterLabel}'s revenues`);
    }

    // Partial period note
    if (isPartial) {
      const partialVal = toRate(totals[totals.length - 1], base[totals.length - 1].d || 1);
      const partialDays = base[totals.length - 1].d || 1;
      const partialVsRef = refVal > 0 ? ((partialVal - refVal) / refVal * 100) : 0;
      if (Math.abs(partialVsRef) > 10) parts.push(`the current incomplete period (${partialDays} days) is tracking ${partialVsRef > 0 ? 'above' : 'below'} the prior full period by ${Math.abs(partialVsRef).toFixed(0)}%`);
    }

    b4 += parts.join('. ') + '.';
    insights.push(b4);

    // Pipeline flow annotations
    if (state.exporter === 'iraq' && state.commodity === 'crude') {
      insights.push('<strong>Note — Pipeline flows included:</strong> Data includes Kirkuk-Ceyhan pipeline exports to Turkey (~250 kb/d) restarted Mar 17 after 3-year shutdown. Iraq\'s only remaining viable export route as southern Basra terminals remain blocked by Hormuz closure. Contract expires Jul 2026.');
    }
    if (state.exporter === 'russia' && state.commodity === 'crude') {
      insights.push('<strong>Note — Pipeline flows included:</strong> Data includes ESPO pipeline exports to China (~600 kb/d via Skovorodino-Mohe spur). This pipeline bypasses the Strait of Hormuz and operates at full capacity. China is Russia\'s #1 crude destination when pipeline + seaborne volumes are combined.');
    }

    return insights;
  }

  function renderInsights(timeline, kpis) {
    const el = document.getElementById('ef-insights');
    if (!el) return;
    const insights = generateInsights(timeline, kpis);
    if (insights.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <h4 class="text-base font-bold text-amber-900">Key Insights</h4>
        </div>
        <ul class="space-y-3">
          ${insights.map(text => `<li class="text-sm text-amber-900 leading-relaxed">${text}</li>`).join('')}
          <li id="ef-insight-news" class="text-sm text-amber-900 leading-relaxed opacity-60">
            <span class="inline-flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading market context...
            </span>
          </li>
        </ul>
      </div>
    `;
  }

  // Async Bullet 5: Live market context from web sources
  let efNewsFetchId = 0;
  async function fetchNewsInsight(timeline, kpis) {
    const fetchId = ++efNewsFetchId;
    const snapshotKey = state.exporter + '_' + state.commodity;

    // Compute trend from the same data generateInsights uses
    let trend = 'stable';
    const { totals, base } = timeline;
    if (totals && totals.length >= 3) {
      const isPartial = kpis.lastIsPartial;
      const endIdx = isPartial ? totals.length - 2 : totals.length - 1;
      const prevIdx = endIdx - 1;
      if (endIdx >= 1) {
        const refVal = toRate(totals[endIdx], base[endIdx].d || 1);
        const prevVal = toRate(totals[prevIdx], base[prevIdx].d || 1);
        const changePct = prevVal > 0 ? ((refVal - prevVal) / prevVal * 100) : 0;
        const devFromAvg = kpis.avgRate > 0 ? ((refVal - kpis.avgRate) / kpis.avgRate * 100) : 0;
        // 3-period streak
        let streak = 0;
        if (endIdx >= 2) {
          const r0 = toRate(totals[endIdx - 2], base[endIdx - 2].d || 1);
          const r1 = toRate(totals[endIdx - 1], base[endIdx - 1].d || 1);
          const r2 = refVal;
          if (r2 > r1 && r1 > r0) streak = 1;
          else if (r2 < r1 && r1 < r0) streak = -1;
        }
        if (streak === 1 || changePct > 10) trend = 'up';
        else if (streak === -1 || changePct < -10) trend = 'down';
        else if (Math.abs(changePct) > 20) trend = 'volatile';
      }
    }

    try {
      const resp = await fetch(`/api/energy-news?country=${state.exporter}&commodity=${state.commodity}&direction=export&trend=${trend}`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();

      // Race condition guard: check state hasn't changed during fetch
      if (fetchId !== efNewsFetchId) return;
      if (snapshotKey !== state.exporter + '_' + state.commodity) return;

      const el = document.getElementById('ef-insight-news');
      if (!el) return;

      if (data.headline) {
        el.innerHTML = `<strong>Market context:</strong> ${data.headline}`;
        el.classList.remove('opacity-60');
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '1';
      } else {
        el.remove();
      }
    } catch (err) {
      console.warn('Export news insight fetch failed:', err.message);
      const el = document.getElementById('ef-insight-news');
      if (el) el.remove();
    }
  }

  function renderLayout() {
    return `
      <div class="flow-fade-in">
        <div class="mb-5">
          <h2 class="text-lg font-bold text-navy-900 flex items-center gap-2">
            <svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H21M3.375 14.25V3.375c0-.621.504-1.125 1.125-1.125h9.75c.621 0 1.125.504 1.125 1.125v3.026M12 3v7.5M12 17.625l3.375-3.375M12 17.625L8.625 14.25" />
            </svg>
            Export Flows
          </h2>
          <p class="text-sm text-navy-500 mt-0.5">${state.commodity === 'crude' ? 'Crude oil exports by destination country (includes pipeline flows for Iraq, Russia)' : (state.commodity === 'lng' ? 'LNG' : 'LPG') + ' exports by destination country'} | Source: Kpler vessel tracking + pipeline estimates</p>
        </div>

        <div id="ef-controls"></div>
        <div id="ef-kpis"></div>
        <div id="ef-insights"></div>

        ${state.commodity === 'crude' ? `
        <div class="mb-6">
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5">
            <h3 class="text-lg font-bold text-navy-800 mb-0.5" id="ef-chart-rate-title">${state.view === 'daily' ? 'Daily Export Rate' : state.view === 'weekly' ? 'Weekly Export Rate' : 'Monthly Export Rate'}</h3>
            <p class="text-xs text-navy-400 mb-3">Average daily rate per period (${getRateUnit()})</p>
            <div class="chart-container">
              <canvas id="chart-ef-daily-rate"></canvas>
            </div>
          </div>
        </div>
        ` : `
        <div class="mb-6">
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5">
            <h3 class="text-lg font-bold text-navy-800 mb-0.5" id="ef-chart-trend-title">Total Export Volume</h3>
            <p class="text-xs text-navy-400 mb-3">Cumulative volume per period (${getUnit()})</p>
            <div class="chart-container">
              <canvas id="chart-ef-total-trend"></canvas>
            </div>
          </div>
        </div>
        `}

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5 md:col-span-2">
            <h3 class="text-lg font-bold text-navy-800 mb-0.5">Destination Breakdown</h3>
            <p class="text-xs text-navy-400 mb-3">Daily rate by top buyer countries (${getRateUnit()})</p>
            <div class="chart-container">
              <canvas id="chart-ef-origin-stacked"></canvas>
            </div>
          </div>
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5">
            <h3 class="text-lg font-bold text-navy-800 mb-0.5">Current Period Mix</h3>
            <p class="text-xs text-navy-400 mb-3">Latest period rate breakdown (${getRateUnit()})</p>
            <div class="chart-container">
              <canvas id="chart-ef-donut"></canvas>
            </div>
          </div>
        </div>

        <div class="mb-6">
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5">
            <h3 class="text-lg font-bold text-navy-800 mb-0.5">Destination Share Over Time</h3>
            <p class="text-xs text-navy-400 mb-3">Percentage contribution of each buyer</p>
            <div class="chart-container chart-container-sm">
              <canvas id="chart-ef-pct-stacked"></canvas>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-navy-200 shadow-sm overflow-hidden mb-4">
          <div class="h-1 bg-gradient-to-r from-sky-400 via-amber-400 to-sky-400"></div>
          <div class="px-5 py-4 border-b border-navy-200 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-bold text-navy-800">Top Destinations Breakdown</h3>
              <p class="text-xs text-navy-400 mt-0.5">Daily rate by destination country (${getRateUnit()})</p>
            </div>
            <span class="text-xs font-semibold text-navy-500 bg-navy-100 px-2.5 py-1 rounded-full" id="ef-table-subtitle"></span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left" id="ef-table-wrapper">
              <thead id="ef-thead" class="bg-navy-50 text-navy-600 text-xs uppercase tracking-wider"></thead>
              <tbody id="ef-tbody" class="divide-y divide-navy-100"></tbody>
            </table>
          </div>
          <div id="ef-table-footnote" class="px-5 py-2 text-xs text-navy-400 border-t border-navy-100"></div>
        </div>
      </div>
    `;
  }

  // ---------- Chart Drawing ----------

  function destroyCharts() {
    Object.values(charts).forEach(c => { try { c.destroy(); } catch(e) {} });
    charts = {};
  }

  function buildDestinationColors(topDestinations) {
    const colors = {};
    topDestinations.forEach((c, i) => {
      colors[c] = CHART_COLORS[i % CHART_COLORS.length];
    });
    colors['Others'] = '#94a3b8';
    return colors;
  }

  // Donut center text plugin
  const centerTextPlugin = {
    id: 'efCenterText',
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
      ctx.fillText(getRateUnit(), cx, cy + 10);
      ctx.restore();
    }
  };

  function drawCharts(timeline) {
    destroyCharts();
    const { labels, totals, topDestinations, countrySeriesData, others, base } = timeline;
    if (!labels || labels.length === 0) return;

    const gridColor = 'rgba(16,42,67,0.06)';
    const tickColor = '#627d98';
    const destColors = buildDestinationColors(topDestinations);

    const commonScaleX = {
      grid: { display: false },
      ticks: { color: tickColor, font: { size: 12 }, maxRotation: 45, autoSkipPadding: 12 },
    };
    const commonScaleY = {
      grid: { color: gridColor },
      ticks: { color: tickColor, font: { size: 12 } },
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

    const trendTitle = document.getElementById('ef-chart-trend-title');
    if (trendTitle) {
      trendTitle.innerHTML = lastIsPartial
        ? `Total Export Volume <span class="text-xs font-normal text-navy-400 ml-1">(last bar: partial ${state.view === 'monthly' ? 'month' : 'week'}, ${partialDays} days)</span>`
        : 'Total Export Volume';
    }

    // Converted data
    const displayTotals = totals.map(v => toDisplay(v));
    const rateTotals = totals.map((v, i) => toRate(v, base[i] ? base[i].d : 0));

    // 1) Bar chart — Total Volume (mbbl)
    const ctxTrend = document.getElementById('chart-ef-total-trend');
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
            label: 'Total Exports (' + getUnit() + ')',
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
                  return `Total: ${ctx.parsed.y.toFixed(1)} ${getUnit()}${suffix}`;
                }
              }
            },
          },
          scales: { x: commonScaleX, y: { ...commonScaleY, title: { display: true, text: getUnit(), color: tickColor, font: { size: 10 } } } },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    // 1b) Bar chart — Daily Rate (mbbl/d)
    const ctxRate = document.getElementById('chart-ef-daily-rate');
    if (ctxRate) {
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
            label: 'Daily Rate (' + getRateUnit() + ')',
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
                  return `Rate: ${ctx.parsed.y.toFixed(2)} ${getRateUnit()}${suffix}`;
                }
              }
            },
          },
          scales: { x: commonScaleX, y: { ...commonScaleY, title: { display: true, text: getRateUnit(), color: tickColor, font: { size: 10 } } } },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    // 2) Stacked area — Daily rate by country (mbbl/d)
    const ctxStacked = document.getElementById('chart-ef-origin-stacked');
    if (ctxStacked) {
      const ds = topDestinations.map(c => ({
        label: c, data: countrySeriesData[c].map((v, i) => toRate(v, base[i] ? base[i].d : 0)),
        backgroundColor: destColors[c],
        borderColor: destColors[c],
        borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3,
      }));
      ds.push({ label: 'Others', data: others.map((v, i) => toRate(v, base[i] ? base[i].d : 0)), backgroundColor: '#94a3b8', borderColor: '#94a3b8', borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3 });

      charts.stacked = new Chart(ctxStacked, {
        type: 'line', data: { labels, datasets: ds },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: SHARED_LEGEND,
            tooltip: { ...commonTooltip, mode: 'index', callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} ${getRateUnit()}` } },
          },
          scales: { x: commonScaleX, y: { ...commonScaleY, stacked: true, title: { display: true, text: getRateUnit(), color: tickColor, font: { size: 10 } } } },
          interaction: { intersect: false, mode: 'index' },
        },
      });
    }

    // 3) % Stacked area
    const ctxPct = document.getElementById('chart-ef-pct-stacked');
    if (ctxPct) {
      const pds = topDestinations.map(c => ({
        label: c,
        data: labels.map((_, idx) => totals[idx] > 0 ? Math.round(countrySeriesData[c][idx] / totals[idx] * 1000) / 10 : 0),
        backgroundColor: destColors[c],
        borderColor: destColors[c],
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

    // 4) Donut with center text — Daily rate (mbbl/d)
    const ctxDonut = document.getElementById('chart-ef-donut');
    if (ctxDonut && topDestinations.length > 0) {
      const lastIdx = totals.length - 1;
      const lastDays = base[lastIdx] ? base[lastIdx].d : 0;
      const donutData = topDestinations.map(c => toRate(countrySeriesData[c][lastIdx] || 0, lastDays));
      const othersVal = toRate(others[lastIdx] || 0, lastDays);
      const donutLabels = [...topDestinations, 'Others'];
      const donutColors = donutLabels.map(c => destColors[c]);

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
                return `${ctx.label}: ${ctx.parsed.toFixed(2)} ${getRateUnit()} (${pct}%)`;
              }
            }},
            datalabels: {
              color: '#fff',
              font: { weight: 'bold', size: 11 },
              formatter: (value) => value > 0 ? value.toFixed(1) : '',
              display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
            },
          },
        },
        plugins: [centerTextPlugin],
      });
    }
  }

  // ---------- Destination Table ----------

  function renderDestinationTable(timeline) {
    const { totals, topDestinations, countrySeriesData, others, periods, base } = timeline;
    const thead = document.getElementById('ef-thead');
    const tbody = document.getElementById('ef-tbody');
    const subtitle = document.getElementById('ef-table-subtitle');
    const footnote = document.getElementById('ef-table-footnote');
    if (!tbody || !thead || !totals || totals.length === 0) return;

    const destColors = buildDestinationColors(topDestinations);
    const lastIdx = totals.length - 1;

    // Always use latest period (even if partial)
    const refIdx = lastIdx;
    const refDays = base[refIdx] ? base[refIdx].d : 0;
    const refTotal = toRate(totals[refIdx] || 0, refDays);

    // Average rate across all visible periods
    const avgTotal = base.reduce((s, rec, i) => s + toRate(totals[i], rec.d), 0) / base.length;

    // Latest period label
    let periodHeader = '';
    if (refIdx >= 0 && base[refIdx]) {
      if (state.view === 'daily') {
        periodHeader = new Date(base[refIdx].s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      } else if (state.view === 'weekly') {
        periodHeader = base[refIdx].p.replace(/^\d+-/, '') + ' (' + getLabel(base[refIdx]) + ')';
      } else {
        periodHeader = new Date(base[refIdx].p + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      }
    }
    const rangeAvgLabel = (state.timeRange === 'all' ? 'All-Time' : state.timeRange.toUpperCase()) + ' Avg';

    if (subtitle) {
      subtitle.textContent = getRateUnit();
    }

    thead.innerHTML = `<tr>
      <th class="px-3 py-2.5 sm:px-5 sm:py-3 font-semibold w-12">#</th>
      <th class="px-3 py-2.5 sm:px-5 sm:py-3 font-semibold">Destination Country</th>
      <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right whitespace-nowrap">${periodHeader}</th>
      <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right">Share %</th>
      <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell">${rangeAvgLabel}</th>
      <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell">Avg Share %</th>
    </tr>`;

    const rows = topDestinations.map((c, i) => {
      const latestVal = toRate(countrySeriesData[c][refIdx] || 0, refDays);
      const latestShare = refTotal > 0 ? (latestVal / refTotal * 100) : 0;
      const periodAvg = base.reduce((s, rec, idx) => s + toRate(countrySeriesData[c][idx] || 0, rec.d), 0) / base.length;
      const avgShare = avgTotal > 0 ? (periodAvg / avgTotal * 100) : 0;
      return { rank: i + 1, country: c, latestVal, latestShare, periodAvg, avgShare, color: destColors[c] };
    });

    // Others row
    const othersLatest = toRate(others[refIdx] || 0, refDays);
    const othersLatestShare = refTotal > 0 ? (othersLatest / refTotal * 100) : 0;
    const othersAvg = base.reduce((s, rec, i) => s + toRate(others[i] || 0, rec.d), 0) / base.length;
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
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700">${r.latestVal.toFixed(2)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700">${r.latestShare.toFixed(1)}%</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700 hidden sm:table-cell">${r.periodAvg.toFixed(2)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-600 hidden sm:table-cell">${r.avgShare.toFixed(1)}%</td>
        </tr>
      `;
    }).join('');

    // Total row
    const totalRowHtml = `
      <tr class="bg-navy-100/70 border-t-2 border-navy-300">
        <td class="px-3 py-2.5 sm:px-5 sm:py-3"></td>
        <td class="px-3 py-2.5 sm:px-5 sm:py-3 text-sm font-bold text-navy-900">Total</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold tabular-nums text-navy-900">${refTotal.toFixed(2)}</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold text-navy-900">100%</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold tabular-nums text-navy-900 hidden sm:table-cell">${avgTotal.toFixed(2)}</td>
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
    const container = document.getElementById('export-flows-content');
    if (!container) return;

    if (!layoutRendered) {
      container.innerHTML = renderLayout();
      layoutRendered = true;
    }

    document.getElementById('ef-controls').innerHTML = renderControls();

    const timeline = getMergedTimeline();
    const kpis = computeKPIs(timeline);

    document.getElementById('ef-kpis').innerHTML = renderKPICards(kpis);
    renderInsights(timeline, kpis);
    fetchNewsInsight(timeline, kpis);
    drawCharts(timeline);
    renderDestinationTable(timeline);
    bindControlEvents();
  }

  function bindControlEvents() {
    document.querySelectorAll('#export-flows-content [data-control]').forEach(btn => {
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

  function initExportFlows() {
    const panel = document.querySelector('[data-panel="export-flows"]');
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
    document.addEventListener('DOMContentLoaded', initExportFlows);
  } else {
    initExportFlows();
  }

})();
