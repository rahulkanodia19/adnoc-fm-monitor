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
  const DATASETS = {};
  const EXPORT_COUNTRIES = [
    { key: 'bahrain', label: 'Bahrain' }, { key: 'iran', label: 'Iran' }, { key: 'iraq', label: 'Iraq' },
    { key: 'kuwait', label: 'Kuwait' }, { key: 'oman', label: 'Oman' }, { key: 'qatar', label: 'Qatar' },
    { key: 'russia', label: 'Russia' }, { key: 'saudi_arabia', label: 'Saudi Arabia' },
    { key: 'uae', label: 'UAE' }, { key: 'us', label: 'United States' },
    { key: 'australia', label: 'Australia' }, { key: 'eu_27', label: 'EU-27' },
  ];
  const EXPORT_GROUPS = [
    { key: '_gulf', label: 'Gulf Total', members: ['bahrain', 'iran', 'iraq', 'kuwait', 'oman', 'qatar', 'saudi_arabia', 'uae'] },
    { key: '_all', label: 'All Tracked', members: ['bahrain', 'iran', 'iraq', 'kuwait', 'oman', 'qatar', 'saudi_arabia', 'uae', 'russia', 'us', 'australia', 'eu_27'] },
  ];
  const COMMODITIES_META = [
    { key: 'crude', label: 'Crude', unit: 'mbbl' },
    { key: 'lng', label: 'LNG', unit: 'Mt' },
    { key: 'lpg', label: 'LPG', unit: 'Mt' },
    { key: 'kero_jet', label: 'Kero/Jet', unit: 'mbbl' },
    { key: 'gasoil_diesel', label: 'Gasoil/Diesel', unit: 'mbbl' },
    { key: 'gasoline', label: 'Gasoline', unit: 'mbbl' },
    { key: 'naphtha', label: 'Naphtha', unit: 'mbbl' },
    { key: 'sulphur', label: 'Sulphur', unit: 'Mt' },
  ];
  for (const c of EXPORT_COUNTRIES) {
    for (const com of COMMODITIES_META) {
      DATASETS[`${c.key}_${com.key}`] = { label: c.label, unit: com.unit, key: c.key, commodity: com.key };
    }
  }

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

  // Return pipeline entries matching the given dataset key, direction='export'.
  // For exports, entry.supplierCountry represents the DESTINATION country
  // (field name is shared with imports where it's the origin).
  function getPipelinesForDataset(direction, datasetKey) {
    if (typeof PIPELINE_STATUS_DATA === 'undefined') return [];
    return PIPELINE_STATUS_DATA.filter(p =>
      p.dataset === datasetKey &&
      p.direction === direction &&
      p.status !== 'offline'
    );
  }

  function isGroupSelected() { return state.exporter.startsWith('_'); }
  function getGroupDef() { return EXPORT_GROUPS.find(g => g.key === state.exporter); }

  function getDataKeys() {
    if (isGroupSelected()) {
      return getGroupDef().members.map(m => m + '_' + state.commodity);
    }
    return [state.exporter + '_' + state.commodity];
  }

  function getDataKey() {
    return state.exporter + '_' + state.commodity;
  }

  function getAggDataForKey(key) {
    const src = EXPORT_FLOW_DATA[key];
    if (!src) return [];
    if (state.view === 'daily') return src.daily || [];
    return state.view === 'weekly' ? src.weekly : src.monthly;
  }

  function getAggData() {
    return getAggDataForKey(getDataKey());
  }

  function filterByTimeRange(records) {
    if (state.timeRange === 'all') return records;
    const now = new Date();
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
    const keys = getDataKeys();
    for (const key of keys) {
      const src = EXPORT_FLOW_DATA[key];
      if (!src) continue;
      const daily = src.daily;
      if (daily && daily.length > 0) return daily[daily.length - 1].e;
      const weekly = src.weekly;
      if (weekly && weekly.length > 0) return weekly[weekly.length - 1].e;
    }
    return null;
  }

  function getMergedTimeline() {
    const EMPTY = { labels: [], periods: [], totals: [], topDestinations: [], countrySeriesData: {}, others: [], perPeriod: {}, countryTotals: {}, base: [] };
    const dataKeys = getDataKeys();
    const allSrc = dataKeys.map(k => EXPORT_FLOW_DATA[k]).filter(Boolean);
    if (allSrc.length === 0) return EMPTY;

    // Use first available source to get period list (all sources share same periods from sync)
    const firstRecords = filterByTimeRange(getAggDataForKey(dataKeys.find(k => EXPORT_FLOW_DATA[k])));
    if (firstRecords.length === 0) return EMPTY;
    const periodSet = firstRecords.map(r => r.p);

    const allCountries = new Set();
    const perPeriod = {};

    for (const period of periodSet) {
      perPeriod[period] = { total: 0, countries: {} };
    }

    // Aggregate across all data sources
    for (const key of dataKeys) {
      const src = EXPORT_FLOW_DATA[key];
      if (!src) continue;
      const records = filterByTimeRange(getAggDataForKey(key));
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

    // Use firstRecords as base for period metadata (d, s, e)
    const base = firstRecords;

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
    const lastIdx = totals.length - 1;
    const lastCompleteIdx = lastIsPartial ? lastIdx - 1 : lastIdx;
    const partialIdx = lastIsPartial ? lastIdx : -1;
    const priorIdx = lastCompleteIdx - 1;

    function periodRate(idx) {
      if (idx < 0 || idx >= totals.length) return { val: 0, days: 0, rate: 0, label: '', period: null };
      const val = totals[idx] || 0;
      const days = base[idx] ? base[idx].d : 0;
      const rate = days > 0 ? val / days / 1000 : 0;
      return { val, days, rate, label: periods[idx] || '', period: periods[idx] || null };
    }
    const lastComplete = periodRate(lastCompleteIdx);
    const partial = periodRate(partialIdx);
    const prior = periodRate(priorIdx);

    const pctChangeLastVsPrior = prior.rate > 0 ? ((lastComplete.rate - prior.rate) / prior.rate * 100) : 0;
    const pctChangePartialVsLast = lastComplete.rate > 0 && lastIsPartial ? ((partial.rate - lastComplete.rate) / lastComplete.rate * 100) : 0;

    const fullBase = lastIsPartial ? base.slice(0, -1) : base;
    const fullTotals = lastIsPartial ? totals.slice(0, -1) : totals;
    const avgRate = fullBase.length > 0 ? fullBase.reduce((s, rec, i) => s + (rec.d > 0 ? fullTotals[i] / rec.d / 1000 : 0), 0) / fullBase.length : 0;

    return {
      curr: lastIsPartial ? partial.val : lastComplete.val,
      currRate: lastIsPartial ? partial.rate : lastComplete.rate,
      currDays: lastIsPartial ? partial.days : lastComplete.days,
      currPeriod: lastIsPartial ? partial.period : lastComplete.period,
      currIdx: lastIdx,
      prevRate: lastComplete.rate,
      pctChange: lastIsPartial ? pctChangePartialVsLast : pctChangeLastVsPrior,
      lastIsPartial,
      lastComplete, partial, prior,
      lastCompleteIdx, partialIdx, priorIdx,
      pctChangeLastVsPrior, pctChangePartialVsLast,
      avgRate,
    };
  }

  // ---------- Rendering ----------

  function isMassBased() { return ['lng', 'lpg', 'sulphur'].includes(state.commodity); }
  function getUnit() { return isMassBased() ? 'Mt' : 'mbbl'; }
  function getRateUnit() { return isMassBased() ? 'Mt/d' : 'mbbl/d'; }

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
    if (isGroupSelected()) return getGroupDef().label;
    const ds = DATASETS[getDataKey()];
    return ds ? ds.label : state.exporter;
  }

  function renderControls() {
    const lastDate = getLastUpdatedDate();
    const dateStr = lastDate ? (typeof formatDateTimeGST === 'function' ? formatDateTimeGST(lastDate) : (function(x){const d=new Date(x);d.setMinutes(0,0,0);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'})+' GST'})(lastDate)) : '';

    return `
      <div class="flex flex-col gap-3 mb-6">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            ${renderExporterToggle()}
            ${renderToggle('Commodity', 'commodity', [
              ['crude', 'Crude'], ['lng', 'LNG'], ['lpg', 'LPG'],
              ['kero_jet', 'Kero/Jet'], ['gasoil_diesel', 'Gasoil/Diesel'], ['gasoline', 'Gasoline'], ['naphtha', 'Naphtha'], ['sulphur', 'Sulphur']
            ])}
          </div>
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
    const groups = [['_gulf', 'Gulf Total'], ['_all', 'All']];
    const gulf = [
      ['bahrain', 'Bahrain'], ['iran', 'Iran'], ['iraq', 'Iraq'],
      ['kuwait', 'Kuwait'], ['oman', 'Oman'], ['qatar', 'Qatar'],
      ['saudi_arabia', 'Saudi'], ['uae', 'UAE'],
    ];
    const other = [['russia', 'Russia'], ['us', 'US'], ['australia', 'Australia'], ['eu_27', 'EU-27']];

    function btn(v, text) {
      return `<button data-control="exporter" data-value="${v}"
        class="px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-medium transition-all ${state.exporter === v ? 'bg-amber-500 text-white shadow-inner' : 'text-navy-600 hover:bg-navy-100'}"
      >${text}</button>`;
    }

    return `
      <div class="flex items-start bg-white rounded-lg border border-navy-200 shadow-sm overflow-hidden">
        <span class="px-2 py-1.5 sm:px-3 sm:py-2 text-xs font-semibold text-navy-500 bg-navy-50 border-r border-navy-200 self-stretch flex items-center">Exporter</span>
        <div class="flex flex-col">
          <div class="flex flex-wrap bg-amber-50/50 border-b border-amber-200">${groups.map(([v, t]) => btn(v, t)).join('')}</div>
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
    const displayUnit = getRateUnit();
    const rangeLabel = state.timeRange === 'all' ? 'All-Time' : state.timeRange.toUpperCase();

    function fmtPeriod(periodStr) {
      if (!periodStr) return '';
      if (state.view === 'monthly') return new Date(periodStr + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      return periodStr;
    }
    function fmtPctBadge(pct) {
      if (!isFinite(pct) || pct === 0) return '';
      const up = pct >= 0;
      const bg = up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700';
      const arrow = up ? '&#9650;' : '&#9660;';
      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bg}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
    }
    function kpiCard(leftBorder, iconSvg, iconColor, title, subtitle, value, pctBadgeHtml, footerTagHtml) {
      return `
        <div class="stat-card bg-white rounded-xl p-3 sm:p-5 border border-navy-200 border-l-4 border-l-${leftBorder}">
          <div class="flex items-center gap-2 mb-2">
            <svg class="w-4 h-4 text-${iconColor}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">${iconSvg}</svg>
            <span class="text-xs font-semibold text-navy-500 uppercase tracking-wider">${title}</span>
          </div>
          ${subtitle ? `<div class="text-[11px] text-navy-400 -mt-1 mb-1">${subtitle}</div>` : ''}
          <div class="text-2xl sm:text-3xl font-extrabold text-navy-900">${fmtNum(value)}</div>
          <div class="text-xs text-navy-400 mt-0.5">${displayUnit}</div>
          <div class="mt-2 flex items-center gap-2">
            ${pctBadgeHtml || ''}
            ${footerTagHtml || ''}
          </div>
        </div>`;
    }
    const svgChart = `<path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />`;
    const svgBars = `<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />`;
    const svgClock = `<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />`;

    const viewLabel = state.view === 'daily' ? 'Daily rate' : state.view === 'weekly' ? 'Weekly avg' : 'Monthly avg';
    const avgFooter = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-navy-100 text-navy-500">All visible periods</span>`;

    if (kpis.lastIsPartial && kpis.lastComplete && kpis.partial) {
      const lc = kpis.lastComplete;
      const par = kpis.partial;
      const lcFooter = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700">${viewLabel} (${lc.days}d)</span>`;
      const parFooter = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Partial in-flight (${par.days}d)</span>`;
      return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          ${kpiCard('sky-400', svgChart, 'sky-500', 'Last Complete', fmtPeriod(lc.period), lc.rate, fmtPctBadge(kpis.pctChangeLastVsPrior) + '<span class="text-[10px] text-navy-400">vs prior</span>', lcFooter)}
          ${kpiCard('amber-400', svgClock, 'amber-500', 'Current Partial', fmtPeriod(par.period), par.rate, fmtPctBadge(kpis.pctChangePartialVsLast) + '<span class="text-[10px] text-navy-400">vs last complete</span>', parFooter)}
          ${kpiCard('navy-400', svgBars, 'navy-500', rangeLabel + ' Avg', '(excl. partial)', kpis.avgRate, '', avgFooter)}
        </div>`;
    }
    const lc = kpis.lastComplete;
    const currFooter = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700">${viewLabel}</span>`;
    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        ${kpiCard('sky-400', svgChart, 'sky-500', fmtPeriod(lc.period) || 'Current Period', '', lc.rate, fmtPctBadge(kpis.pctChangeLastVsPrior) + '<span class="text-[10px] text-navy-400">vs prior</span>', currFooter)}
        ${kpiCard('navy-400', svgBars, 'navy-500', rangeLabel + ' Avg', '', kpis.avgRate, '', avgFooter)}
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

    // Gulf exporter set and conflict context from data.js
    const GULF_EXPORTERS = ['saudi_arabia', 'uae', 'iraq', 'qatar', 'kuwait', 'bahrain', 'iran', 'oman'];
    const isGroup = isGroupSelected();
    const isGulfExporter = isGroup ? (state.exporter === '_gulf') : GULF_EXPORTERS.includes(state.exporter);
    const exporterStatus = (!isGroup && typeof COUNTRY_STATUS_DATA !== 'undefined')
      ? COUNTRY_STATUS_DATA.find(c => c.id === state.exporter) : null;
    const isConflictAffected = isGroup
      ? (typeof COUNTRY_STATUS_DATA !== 'undefined' && COUNTRY_STATUS_DATA.some(c => ['critical', 'high'].includes(c.status)))
      : (exporterStatus && ['critical', 'high'].includes(exporterStatus.status));
    const statusSummary = exporterStatus ? exporterStatus.summary : '';

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

    // Helper: display name (rename Unknown → Undisclosed)
    function displayName(c) { return c === 'Unknown' ? 'Undisclosed' : c; }

    // Reference period = latest full; prior = one before
    const refIdx = isPartial ? totals.length - 2 : totals.length - 1;
    const prevIdx = refIdx - 1;
    if (refIdx < 1) return [];
    const refDays = base[refIdx].d || 1;
    const prevDays = base[prevIdx].d || 1;
    const refVal = toRate(totals[refIdx], refDays);
    const prevVal = toRate(totals[prevIdx], prevDays);
    const refLabel = periodStr(base[refIdx]);

    // Zero-volume edge case
    if (refVal === 0 && prevVal === 0) {
      let msg = `No ${commodityLabel} exports recorded for ${exporterLabel} in the latest two full periods.`;
      if (isConflictAffected && statusSummary) msg += ` ${statusSummary.split('.')[0]}.`;
      else if (isConflictAffected) msg += ' This is consistent with ongoing regional conflict and infrastructure disruption.';
      else msg += ' This may reflect data lag or minimal participation in this commodity market.';
      return [msg];
    }

    // Compute all full-period rates for statistical context
    const endIdx = isPartial ? totals.length - 2 : totals.length - 1;
    const fullRates = [];
    for (let i = 0; i <= endIdx; i++) {
      fullRates.push(toRate(totals[i], base[i].d || 1));
    }
    if (fullRates.length === 0) return insights;
    const displayAvg = kpis.avgRate;
    const minRate = Math.min(...fullRates);
    const maxRate = Math.max(...fullRates);
    const devFromAvg = displayAvg > 0 ? ((refVal - displayAvg) / displayAvg * 100) : 0;

    // Multi-period trend detection (3-period streak)
    let streak = 0;
    if (fullRates.length >= 3) {
      const last3 = fullRates.slice(-3);
      if (last3[2] > last3[1] && last3[1] > last3[0]) streak = 1;
      else if (last3[2] < last3[1] && last3[1] < last3[0]) streak = -1;
    }

    // Asian buyer share tracking
    const ASIAN_BUYERS = ['China', 'India', 'Japan', 'South Korea', 'Thailand', 'Vietnam', 'Taiwan', 'Indonesia', 'Malaysia', 'Philippines', 'Pakistan', 'Bangladesh', 'Sri Lanka'];
    let asianRefTotal = 0;
    const allDests = topDestinations || [];
    for (const c of Object.keys(countrySeriesData)) {
      if (ASIAN_BUYERS.includes(c)) asianRefTotal += toRate(countrySeriesData[c][refIdx] || 0, refDays);
    }
    const asianShareRef = refVal > 0 ? (asianRefTotal / refVal * 100) : 0;

    // --- Bullet 1: Headline with conflict context ---
    const changePct = prevVal > 0 ? ((refVal - prevVal) / prevVal * 100) : 0;
    const absChange = Math.abs(changePct);
    const flowType = isGroup ? 'seaborne + pipeline' : ((state.commodity === 'crude' && ['iraq', 'russia', 'saudi_arabia'].includes(state.exporter)) ? 'seaborne + pipeline' : 'seaborne');
    let b1 = `${exporterLabel} ${flowType} ${commodityLabel} exports averaged <strong>${refVal.toFixed(1)} ${unit}</strong> in ${refLabel}`;

    // Change framing — conflict-aware for Gulf exporters
    if (absChange < 2) {
      b1 += `, broadly flat versus the prior period`;
    } else if (changePct < 0) {
      b1 += `, <strong>down ${absChange.toFixed(0)}%</strong> from the prior period`;
      if (isConflictAffected && absChange > 10) b1 += ' — reflecting ongoing infrastructure damage and Hormuz disruption';
      else if (absChange > 15) b1 += ' — a significant contraction';
    } else {
      b1 += `, <strong>up ${absChange.toFixed(0)}%</strong> from the prior period`;
      if (isConflictAffected && absChange > 15) {
        // Try to reference specific recovery from data.js
        if (state.exporter === 'saudi_arabia') b1 += ' — reflecting the Yanbu pipeline reroute scaling while offshore fields remain shut';
        else if (state.exporter === 'iraq') b1 += ' — driven by Kirkuk-Ceyhan pipeline restart as southern terminals remain blocked';
        else b1 += ' — possibly reflecting partial recovery in export capacity';
      } else if (absChange > 15) {
        b1 += ' — likely driven by increased demand or favourable arbitrage';
      }
    }
    b1 += '.';

    // Context vs range average
    if (Math.abs(devFromAvg) > 5) {
      b1 += ` This is <strong>${Math.abs(devFromAvg).toFixed(0)}% ${devFromAvg > 0 ? 'above' : 'below'}</strong> the ${rangeLabel} average (${displayAvg.toFixed(1)} ${unit}).`;
    }
    // Partial-period in-flight tracker (when current period is partial)
    if (isPartial && kpis.partial && kpis.partial.days > 0) {
      const partialVal = toRate(totals[kpis.partialIdx], kpis.partial.days);
      const parLabel = periodStr(base[kpis.partialIdx]);
      const pctVsLast = refVal > 0 ? ((partialVal - refVal) / refVal * 100) : 0;
      const parDirWord = pctVsLast >= 0 ? 'up' : 'down';
      const parAbs = Math.abs(pctVsLast);
      const parPhrase = parAbs < 2 ? 'tracking flat against'
        : `${parDirWord} <strong>${parAbs.toFixed(0)}%</strong> versus`;
      b1 += ` In-flight: <strong>${parLabel}</strong> (${kpis.partial.days}d partial) running at <strong>${partialVal.toFixed(1)} ${unit}</strong>, ${parPhrase} the last complete period.`;
    }
    insights.push(b1);

    // --- Bullet 2: Destination shifts with per-destination changes ---
    if (allDests.length >= 2) {
      // Sort top 5 by current-period value (largest first)
      const top = allDests.slice(0, Math.min(5, allDests.length))
        .sort((a, b) => toRate(countrySeriesData[b][refIdx] || 0, refDays) - toRate(countrySeriesData[a][refIdx] || 0, refDays));
      const details = [];

      for (const c of top) {
        const curr = toRate(countrySeriesData[c][refIdx] || 0, refDays);
        const prev = toRate(countrySeriesData[c][prevIdx] || 0, prevDays);
        const diff = curr - prev;
        const pctOfTotal = refVal > 0 ? (curr / refVal * 100) : 0;
        let changeStr = '';
        if (Math.abs(diff) >= 0.05) {
          const arrow = diff > 0 ? ' ▲' : ' ▼';
          const color = diff > 0 ? 'text-emerald-700' : 'text-red-700';
          changeStr = ` (<span class="${color}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}${arrow}</span>)`;
        } else {
          changeStr = ' (flat)';
        }
        details.push(`${displayName(c)} ${curr.toFixed(1)} ${unit}, ${pctOfTotal.toFixed(0)}%${changeStr}`);
      }

      let b2 = `<strong>Destination shifts (${refLabel}):</strong> ${details.join('; ')}.`;

      // Summary line: concentration risk or Asian share
      if (top.length >= 2 && refVal > 0) {
        const top1Val = toRate(countrySeriesData[top[0]][refIdx] || 0, refDays);
        const top1Share = (top1Val / refVal * 100);
        if (top1Share >= 90) {
          b2 += ` <strong>Single-buyer dependency:</strong> ${displayName(top[0])} takes ${top1Share.toFixed(0)}% — loss of this market would eliminate nearly all export revenue.`;
        } else {
          const top2Val = top1Val + toRate(countrySeriesData[top[1]][refIdx] || 0, refDays);
          const top2Share = (top2Val / refVal * 100);
          if (top2Share >= 60) b2 += ` ${displayName(top[0])} and ${displayName(top[1])} at ${top2Share.toFixed(0)}% creates revenue concentration risk.`;
        }
      }
      if (asianShareRef > 60) {
        b2 += ` Asian buyers take ${asianShareRef.toFixed(0)}% of total exports.`;
      }
      insights.push(b2);
    }

    // --- Bullet 3: Assessment (merged trend + outlook + forward-looking, no repetition from B1) ---
    const assessParts = [];

    // Trend + conflict context
    if (streak === -1 && devFromAvg < -5) {
      if (isConflictAffected) {
        assessParts.push(`Exports have declined for three consecutive periods as ${statusSummary.split('.')[0].toLowerCase()}`);
      } else {
        assessParts.push(`Exports have declined for three consecutive periods, indicating a persistent downward trend`);
      }
    } else if (streak === 1 && devFromAvg > 5) {
      if (isConflictAffected) {
        assessParts.push(`Three consecutive periods of rising exports suggest a recovery trajectory, though volumes remain constrained by regional conflict`);
      } else {
        assessParts.push(`Three consecutive periods of rising exports indicate a sustained expansion`);
      }
    } else if (devFromAvg < -30 && absChange <= 10) {
      if (isConflictAffected) {
        assessParts.push(`Exports remain severely depressed at ${Math.abs(devFromAvg).toFixed(0)}% below the ${rangeLabel} average — effectively halted until export infrastructure is restored`);
      } else {
        assessParts.push(`Exports remain severely depressed at ${Math.abs(devFromAvg).toFixed(0)}% below the ${rangeLabel} average`);
      }
    } else if (absChange > 20) {
      assessParts.push(`The ${changePct > 0 ? 'surge' : 'sharp contraction'} of ${absChange.toFixed(0)}% is an outlier — determine whether this is a scheduling effect${isConflictAffected ? ', an infrastructure recovery milestone,' : ''} or a structural shift`);
    }

    // Forward-looking with conflict specifics
    if (isConflictAffected && devFromAvg < -10) {
      if (isGroup) {
        assessParts.push(`aggregate exports remain constrained by regional conflict — recovery depends on Hormuz reopening and restoration of damaged infrastructure across multiple Gulf producers`);
      } else if (state.exporter === 'saudi_arabia') {
        assessParts.push(`exports cannot return to pre-crisis levels (~${displayAvg.toFixed(1)} ${unit}) until Hormuz reopens or additional offshore fields restart — the East-West Pipeline to Yanbu provides partial but not full compensation`);
      } else if (state.exporter === 'qatar') {
        assessParts.push(`with 12.8 Mtpa of LNG capacity damaged for 3-5 years and all production halted since Mar 2, recovery will be protracted even after the conflict ends`);
      } else if (state.exporter === 'iraq') {
        assessParts.push(`with Basra terminals blocked and FM declared on all foreign oilfields, the Kirkuk-Ceyhan pipeline to Turkey (~250 kb/d) is the only active export route`);
      } else {
        assessParts.push(`recovery depends on resolution of regional conflict and restoration of Hormuz transit`);
      }
    } else if (!isConflictAffected && Math.abs(devFromAvg) <= 5 && absChange <= 5) {
      assessParts.push(`export flows are tracking within normal parameters — no immediate concern`);
    }

    // Range context (condensed, only if meaningful)
    if (fullRates.length >= 4 && maxRate - minRate > 0) {
      const coeffVar = displayAvg > 0 ? ((Math.sqrt(fullRates.reduce((s, v) => s + (v - displayAvg) ** 2, 0) / fullRates.length) / displayAvg) * 100) : 0;
      if (coeffVar > 25) assessParts.push(`volumes have swung ${minRate.toFixed(1)}–${maxRate.toFixed(1)} ${unit} over the ${rangeLabel} range — buyers should maintain contingency procurement`);
    }

    if (assessParts.length > 0) {
      let b3 = '<strong>Assessment:</strong> ' + assessParts.map((p, i) => {
        if (i === 0) return p;
        return p.charAt(0).toUpperCase() + p.slice(1);
      }).join('. ') + '.';
      insights.push(b3);
    }

    // Pipeline flow annotations now rendered via renderPipelineCallout() card
    // (reads from PIPELINE_STATUS_DATA in data.js).

    return insights;
  }

  // LLM-generated insights (loaded from flow-insights.json)
  let flowInsightsCache = null;
  function pickInsightsBucket(view, timeRange) {
    if (['1w','2w','3w','1m'].includes(timeRange)) return 'recent';
    if (view === 'daily') return 'recent';
    if (['3m','6m'].includes(timeRange)) return 'quarterly';
    if (['12m','all'].includes(timeRange)) return 'yearly';
    return 'recent';
  }

  async function loadFlowInsights() {
    if (isGroupSelected()) return []; // No LLM insights for aggregate views
    if (!flowInsightsCache) {
      try {
        const resp = await fetch('/flow-insights.json');
        if (resp.ok) flowInsightsCache = await resp.json();
      } catch {}
    }
    const key = state.exporter + '_' + state.commodity;
    const entry = flowInsightsCache?.[key];
    if (!entry) return [];
    if (Array.isArray(entry)) return entry;
    const bucket = pickInsightsBucket(state.view, state.timeRange);
    return entry[bucket] || entry.quarterly || entry.recent || entry.yearly || [];
  }

  // Render a callout card above the destinations table listing all pipeline
  // flows for the currently-selected export dataset. For exports,
  // supplierCountry represents the destination country.
  function renderPipelineCallout() {
    const el = document.getElementById('ef-pipeline-callout');
    if (!el) return;
    if (isGroupSelected()) { el.innerHTML = ''; return; }
    const datasetKey = state.exporter + '_' + state.commodity;
    const pipelines = getPipelinesForDataset('export', datasetKey);
    if (pipelines.length === 0) { el.innerHTML = ''; return; }
    const total = pipelines.reduce((s, p) => s + p.currentThroughput, 0);
    const rows = pipelines.map(p => {
      const statusColor = p.status === 'operational' ? 'text-emerald-700' : p.status === 'reduced' ? 'text-amber-700' : 'text-red-700';
      return `<li class="flex items-center justify-between gap-3 py-1 text-sm">
        <span class="text-navy-800">&bull; ${p.label}</span>
        <span class="text-navy-600 tabular-nums">${p.currentThroughput.toLocaleString()} kbd
          <span class="${statusColor} text-xs ml-2">${p.status}</span></span>
      </li>`;
    }).join('');
    el.innerHTML = `
      <div class="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-4">
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-4 h-4 text-sky-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          <h4 class="text-sm font-bold text-sky-900">Hormuz-Independent Pipelines (included in totals)</h4>
        </div>
        <ul class="space-y-0.5">${rows}</ul>
        <div class="flex items-center justify-between pt-2 mt-2 border-t border-sky-200 text-sm">
          <span class="font-semibold text-sky-900">Total pipeline throughput:</span>
          <span class="font-bold text-sky-900 tabular-nums">${total.toLocaleString()} kbd</span>
        </div>
      </div>`;
  }

  function renderInsights(timeline, kpis) {
    const el = document.getElementById('ef-insights');
    if (!el) return;

    el.innerHTML = `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <h4 class="text-base font-bold text-amber-900">Key Insights</h4>
        </div>
        <ul class="space-y-3" id="ef-insight-list">
          <li class="text-sm text-amber-900 leading-relaxed opacity-60">Loading insights...</li>
        </ul>
      </div>`;

    loadFlowInsights().then(llmInsights => {
      const listEl = document.getElementById('ef-insight-list');
      if (!listEl) return;

      let insights = llmInsights;
      if (!insights || insights.length === 0) {
        insights = generateInsights(timeline, kpis);
      }

      if (insights.length === 0) {
        el.innerHTML = '';
        return;
      }

      listEl.innerHTML = insights.map(text =>
        `<li class="flex gap-2 text-sm text-amber-900 leading-relaxed">
          <span class="text-amber-400 mt-1 flex-shrink-0">&bull;</span>
          <span>${text}</span>
        </li>`
      ).join('');
    });
  }

  // Async Bullet 5: Market context from sync-populated static data
  let efNewsCache = null;
  let efNewsFetchId = 0;
  async function fetchNewsInsight() {
    const fetchId = ++efNewsFetchId;
    const snapshotKey = state.exporter + '_' + state.commodity;

    try {
      if (!efNewsCache) {
        const resp = await fetch('/energy-news-data.json');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        efNewsCache = await resp.json();
      }

      // Race condition guard
      if (fetchId !== efNewsFetchId) return;
      if (snapshotKey !== state.exporter + '_' + state.commodity) return;

      const el = document.getElementById('ef-insight-news');
      if (!el) return;

      const headline = efNewsCache[snapshotKey];
      if (headline) {
        el.innerHTML = `<strong>Market context:</strong> ${headline}`;
        el.classList.remove('opacity-60');
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '1';
      } else {
        el.remove();
      }
    } catch (err) {
      const el = document.getElementById('ef-insight-news');
      if (el) el.remove();
    }
  }

  function renderLayout() {
    return `
      <div class="flow-fade-in">
        <div class="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 class="text-lg font-bold text-navy-900 flex items-center gap-2">
              <svg class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H21M3.375 14.25V3.375c0-.621.504-1.125 1.125-1.125h9.75c.621 0 1.125.504 1.125 1.125v3.026M12 3v7.5M12 17.625l3.375-3.375M12 17.625L8.625 14.25" />
              </svg>
              Export Flows
            </h2>
            <p class="text-sm text-navy-500 mt-0.5">${state.commodity === 'crude' ? 'Crude oil exports by destination country (includes pipeline flows for Iraq, Russia, Saudi Arabia via SUMED)' : (state.commodity === 'lng' ? 'LNG' : 'LPG') + ' exports by destination country'} | Source: Kpler vessel tracking + pipeline estimates</p>
          </div>
          <div id="ef-date-badge"></div>
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
            <p class="text-xs text-navy-400 mb-3" id="chart-ef-origin-stacked-subtitle">Daily rate by top buyer countries (${getRateUnit()})</p>
            <div class="chart-container">
              <canvas id="chart-ef-origin-stacked"></canvas>
            </div>
          </div>
          <div class="chart-card bg-white rounded-xl border border-navy-200 shadow-sm p-5">
            <h3 class="text-lg font-bold text-navy-800 mb-0.5" id="ef-chart-donut-title">Current Period Mix</h3>
            <p class="text-xs text-navy-400 mb-3" id="ef-chart-donut-subtitle">Latest period rate breakdown (${getRateUnit()})</p>
            <div id="ef-chart-donut-container">
              <div class="chart-container">
                <canvas id="chart-ef-donut"></canvas>
              </div>
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

        <div id="ef-pipeline-callout"></div>

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

  function drawCharts(timeline, kpis) {
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
      backgroundColor: '#0a1929',
      titleColor: '#f0f4f8',
      bodyColor: '#d9e2ec',
      borderColor: '#334e68',
      borderWidth: 1,
      cornerRadius: 8,
      titleFont: { size: 12, weight: '600' },
      bodyFont: { size: 11 },
      padding: 10,
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

    // Helper: split a series into two datasets — complete bars + partial bar (dashed).
    function splitPartialDatasets(seriesData, color, label, unitStr) {
      const lastIdx = seriesData.length - 1;
      const completeData = seriesData.map((v, i) => (lastIsPartial && i === lastIdx) ? null : v);
      const partialData = seriesData.map((v, i) => (lastIsPartial && i === lastIdx) ? v : null);
      return [
        {
          label: label + ' (' + unitStr + ')',
          data: completeData,
          backgroundColor: color + 'cc',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 3,
        },
        {
          label: label + ' (partial)',
          data: partialData,
          backgroundColor: color + '40',
          borderColor: color,
          borderWidth: 2,
          borderDash: [4, 4],
          borderRadius: 3,
        },
      ];
    }

    // 1) Bar chart — Total Volume
    const ctxTrend = document.getElementById('chart-ef-total-trend');
    if (ctxTrend) {
      charts.trend = new Chart(ctxTrend, {
        type: 'bar',
        data: { labels, datasets: splitPartialDatasets(displayTotals, '#0ea5e9', 'Total Exports', getUnit()) },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 600, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltip,
              callbacks: {
                label: ctx => {
                  if (ctx.parsed.y == null) return null;
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
      charts.rate = new Chart(ctxRate, {
        type: 'bar',
        data: { labels, datasets: splitPartialDatasets(rateTotals, '#f59e0b', 'Daily Rate', getRateUnit()) },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 600, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltip,
              callbacks: {
                label: ctx => {
                  if (ctx.parsed.y == null) return null;
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

    // 2) Stacked area — Daily rate by country (mbbl/d).
    // Exclude last period when partial AND <50% of expected days.
    const ctxStacked = document.getElementById('chart-ef-origin-stacked');
    if (ctxStacked) {
      const lastI = labels.length - 1;
      const dLast = base[lastI] ? base[lastI].d : 0;
      const belowHalf = (state.view === 'weekly' && dLast < 4) || (state.view === 'monthly' && dLast < 15);
      const excludeLast = lastIsPartial && belowHalf;
      const sliceEnd = excludeLast ? lastI : labels.length;
      const sLabels = labels.slice(0, sliceEnd);
      const sBase = base.slice(0, sliceEnd);

      const ds = topDestinations.map(c => ({
        label: c,
        data: countrySeriesData[c].slice(0, sliceEnd).map((v, i) => toRate(v, sBase[i] ? sBase[i].d : 0)),
        backgroundColor: destColors[c],
        borderColor: destColors[c],
        borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3,
      }));
      ds.push({ label: 'Others', data: others.slice(0, sliceEnd).map((v, i) => toRate(v, sBase[i] ? sBase[i].d : 0)), backgroundColor: '#94a3b8', borderColor: '#94a3b8', borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.3 });

      // Subtitle update with exclusion note
      const subtitleEl = document.getElementById('chart-ef-origin-stacked-subtitle');
      if (subtitleEl) {
        const baseText = 'Daily rate by top buyer countries (' + getRateUnit() + ')';
        const periodName = state.view === 'monthly' ? 'month' : 'week';
        subtitleEl.textContent = excludeLast
          ? `${baseText} — partial ${periodName} excluded (only ${dLast}d)`
          : baseText;
      }

      charts.stacked = new Chart(ctxStacked, {
        type: 'line', data: { labels: sLabels, datasets: ds },
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
    // When last period is partial, render TWO donuts side-by-side.
    if (topDestinations.length > 0) {
      const donutLabels = [...topDestinations, 'Others'];
      const donutColors = donutLabels.map(c => destColors[c]);
      const donutUnit = getRateUnit();

      function buildDonutData(idx) {
        const days = base[idx] ? base[idx].d : 0;
        const dArr = topDestinations.map(c => toRate(countrySeriesData[c][idx] || 0, days));
        return [...dArr, toRate(others[idx] || 0, days)];
      }
      function fmtDonutPeriod(idx) {
        if (idx < 0 || !base[idx]) return '';
        if (state.view === 'monthly') return new Date(base[idx].p + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        return base[idx].p;
      }
      function mkDonut(canvasId, data, showLegend) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        return new Chart(ctx, {
          type: 'doughnut',
          data: { labels: donutLabels, datasets: [{ data, backgroundColor: donutColors, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: {
              legend: showLegend === false ? { display: false } : DONUT_LEGEND,
              tooltip: { ...commonTooltip, callbacks: {
                label: c => {
                  const total = c.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? (c.parsed / total * 100).toFixed(1) : 0;
                  return `${c.label}: ${c.parsed.toFixed(2)} ${donutUnit} (${pct}%)`;
                }
              }},
              datalabels: {
                color: '#fff', font: { weight: 'bold', size: 11 },
                formatter: (value) => value > 0 ? value.toFixed(1) : '',
                display: (c) => c.dataset.data[c.dataIndex] > 0,
              },
            },
          },
          plugins: [centerTextPlugin],
        });
      }

      // Build a shared custom-HTML legend for the dual-donut layout
      function buildSharedLegendHtml() {
        return donutLabels.map((label, i) => `
          <span class="inline-flex items-center gap-1.5 mr-3 mb-1">
            <span class="inline-block w-3 h-3 rounded-sm" style="background:${donutColors[i]}"></span>
            <span class="text-[11px] text-navy-600">${label}</span>
          </span>`).join('');
      }

      const container = document.getElementById('ef-chart-donut-container');
      const titleEl = document.getElementById('ef-chart-donut-title');
      const subtitleEl = document.getElementById('ef-chart-donut-subtitle');
      const showDual = kpis && kpis.lastIsPartial && kpis.lastCompleteIdx >= 0 && kpis.partialIdx >= 0;

      if (showDual) {
        if (titleEl) titleEl.textContent = 'Period Mix';
        if (subtitleEl) subtitleEl.textContent = 'Last complete vs current partial (' + donutUnit + ')';
        if (container) {
          container.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
              <div>
                <div class="text-xs font-semibold text-sky-700 text-center mb-1">${fmtDonutPeriod(kpis.lastCompleteIdx)} (${kpis.lastComplete.days}d, complete)</div>
                <div class="chart-container"><canvas id="chart-ef-donut-complete"></canvas></div>
              </div>
              <div>
                <div class="text-xs font-semibold text-amber-700 text-center mb-1">${fmtDonutPeriod(kpis.partialIdx)} (${kpis.partial.days}d, partial)</div>
                <div class="chart-container"><canvas id="chart-ef-donut-partial"></canvas></div>
              </div>
            </div>
            <div class="flex flex-wrap justify-center mt-3 pt-3 border-t border-navy-100">${buildSharedLegendHtml()}</div>`;
        }
        charts.donutComplete = mkDonut('chart-ef-donut-complete', buildDonutData(kpis.lastCompleteIdx), false);
        charts.donutPartial = mkDonut('chart-ef-donut-partial', buildDonutData(kpis.partialIdx), false);
      } else {
        if (titleEl) titleEl.textContent = 'Current Period Mix';
        if (subtitleEl) subtitleEl.textContent = 'Latest period rate breakdown (' + donutUnit + ')';
        if (container) {
          container.innerHTML = `<div class="chart-container"><canvas id="chart-ef-donut"></canvas></div>`;
        }
        const lastIdx = totals.length - 1;
        charts.donut = mkDonut('chart-ef-donut', buildDonutData(lastIdx), true);
      }
    }
  }

  // ---------- Destination Table ----------

  function renderDestinationTable(timeline, kpis) {
    const { totals, topDestinations, countrySeriesData, others, periods, base } = timeline;
    const thead = document.getElementById('ef-thead');
    const tbody = document.getElementById('ef-tbody');
    const subtitle = document.getElementById('ef-table-subtitle');
    const footnote = document.getElementById('ef-table-footnote');
    if (!tbody || !thead || !totals || totals.length === 0) return;

    const destColors = buildDestinationColors(topDestinations);
    const lastIdx = totals.length - 1;

    // Map of destination country → pipeline info (for PIPE badges)
    const datasetKey = state.exporter + '_' + state.commodity;
    const pipelineMap = {};
    if (!isGroupSelected()) {
      for (const p of getPipelinesForDataset('export', datasetKey)) {
        pipelineMap[p.supplierCountry] = p;
      }
    }

    const dualMode = kpis && kpis.lastIsPartial && kpis.lastCompleteIdx >= 0 && kpis.partialIdx >= 0;
    const mainIdx = dualMode ? kpis.lastCompleteIdx : lastIdx;
    const partialIdx = dualMode ? kpis.partialIdx : -1;
    const mainDays = base[mainIdx] ? base[mainIdx].d : 0;
    const partialDays = partialIdx >= 0 && base[partialIdx] ? base[partialIdx].d : 0;

    function valFor(countryArr, idx, days) {
      if (idx < 0) return 0;
      return toRate(countryArr[idx] || 0, days);
    }
    const mainTotal = valFor(totals, mainIdx, mainDays);
    const partialTotal = valFor(totals, partialIdx, partialDays);
    const avgTotal = base.reduce((s, rec, i) => s + toRate(totals[i], rec.d), 0) / base.length;

    function periodHeaderFor(idx) {
      if (idx < 0 || !base[idx]) return '';
      if (state.view === 'daily') {
        return new Date(base[idx].s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      } else if (state.view === 'weekly') {
        return base[idx].p.replace(/^\d+-/, '') + ' (' + getLabel(base[idx]) + ')';
      }
      return new Date(base[idx].p + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    }
    const mainHeader = periodHeaderFor(mainIdx);
    const partialHeader = periodHeaderFor(partialIdx);
    const rangeAvgLabel = (state.timeRange === 'all' ? 'All-Time' : state.timeRange.toUpperCase()) + ' Avg';

    if (subtitle) subtitle.textContent = getRateUnit();

    if (dualMode) {
      thead.innerHTML = `<tr>
        <th class="px-3 py-2.5 sm:px-5 sm:py-3 font-semibold w-12">#</th>
        <th class="px-3 py-2.5 sm:px-5 sm:py-3 font-semibold">Destination Country</th>
        <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right whitespace-nowrap text-sky-700">${mainHeader} (${mainDays}d)</th>
        <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right text-sky-700">Share %</th>
        <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right whitespace-nowrap text-amber-700">${partialHeader} (${partialDays}d partial)</th>
        <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right text-amber-700">Share %</th>
        <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell">${rangeAvgLabel}</th>
      </tr>`;
    } else {
      thead.innerHTML = `<tr>
        <th class="px-3 py-2.5 sm:px-5 sm:py-3 font-semibold w-12">#</th>
        <th class="px-3 py-2.5 sm:px-5 sm:py-3 font-semibold">Destination Country</th>
        <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right whitespace-nowrap">${mainHeader}</th>
        <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right">Share %</th>
        <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell">${rangeAvgLabel}</th>
        <th class="px-2.5 py-2.5 sm:px-4 sm:py-3 font-semibold text-right hidden sm:table-cell">Avg Share %</th>
      </tr>`;
    }

    const rows = topDestinations.map((c, i) => {
      const mainVal = valFor(countrySeriesData[c], mainIdx, mainDays);
      const mainShare = mainTotal > 0 ? (mainVal / mainTotal * 100) : 0;
      const partialVal = valFor(countrySeriesData[c], partialIdx, partialDays);
      const partialShare = partialTotal > 0 ? (partialVal / partialTotal * 100) : 0;
      const periodAvg = base.reduce((s, rec, idx) => s + toRate(countrySeriesData[c][idx] || 0, rec.d), 0) / base.length;
      const avgShare = avgTotal > 0 ? (periodAvg / avgTotal * 100) : 0;
      return { rank: i + 1, country: c, mainVal, mainShare, partialVal, partialShare, periodAvg, avgShare, color: destColors[c] };
    });

    const othersMain = valFor(others, mainIdx, mainDays);
    const othersMainShare = mainTotal > 0 ? (othersMain / mainTotal * 100) : 0;
    const othersPartial = valFor(others, partialIdx, partialDays);
    const othersPartialShare = partialTotal > 0 ? (othersPartial / partialTotal * 100) : 0;
    const othersAvg = base.reduce((s, rec, i) => s + toRate(others[i] || 0, rec.d), 0) / base.length;
    const othersAvgShare = avgTotal > 0 ? (othersAvg / avgTotal * 100) : 0;
    rows.push({ rank: rows.length + 1, country: 'Others', mainVal: othersMain, mainShare: othersMainShare, partialVal: othersPartial, partialShare: othersPartialShare, periodAvg: othersAvg, avgShare: othersAvgShare, color: '#94a3b8' });

    // Data rows
    const dataRowsHtml = rows.map((r, ri) => {
      const evenClass = ri % 2 === 1 ? 'bg-navy-50/30' : '';
      const nameCell = `
          <td class="px-3 py-2.5 sm:px-5 sm:py-3 text-center">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-navy-100 text-xs font-bold text-navy-600">${r.rank}</span>
          </td>
          <td class="px-3 py-2.5 sm:px-5 sm:py-3">
            <div class="flex items-center gap-2.5">
              <span class="w-1 h-6 rounded-full flex-shrink-0" style="background:${r.color}"></span>
              <span class="text-sm font-medium text-navy-800">${r.country}</span>
              ${pipelineMap[r.country] ? `<span class="text-[10px] font-semibold px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded" title="Includes pipeline flow: ${pipelineMap[r.country].label} (~${pipelineMap[r.country].currentThroughput} kbd)">PIPE</span>` : ''}
            </div>
          </td>`;
      if (dualMode) {
        return `
        <tr class="hover:bg-sky-50/50 transition-colors ${evenClass}">
          ${nameCell}
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700">${r.mainVal.toFixed(2)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700">${r.mainShare.toFixed(1)}%</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-amber-700">${r.partialVal.toFixed(2)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-amber-700">${r.partialShare.toFixed(1)}%</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-600 hidden sm:table-cell">${r.periodAvg.toFixed(2)}</td>
        </tr>`;
      }
      return `
        <tr class="hover:bg-sky-50/50 transition-colors ${evenClass}">
          ${nameCell}
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700">${r.mainVal.toFixed(2)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700">${r.mainShare.toFixed(1)}%</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-700 hidden sm:table-cell">${r.periodAvg.toFixed(2)}</td>
          <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm tabular-nums text-navy-600 hidden sm:table-cell">${r.avgShare.toFixed(1)}%</td>
        </tr>`;
    }).join('');

    // Total row
    const totalRowHtml = dualMode ? `
      <tr class="bg-navy-100/70 border-t-2 border-navy-300">
        <td class="px-3 py-2.5 sm:px-5 sm:py-3"></td>
        <td class="px-3 py-2.5 sm:px-5 sm:py-3 text-sm font-bold text-navy-900">Total</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold tabular-nums text-navy-900">${mainTotal.toFixed(2)}</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold text-navy-900">100%</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold tabular-nums text-amber-700">${partialTotal.toFixed(2)}</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold text-amber-700">100%</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold tabular-nums text-navy-900 hidden sm:table-cell">${avgTotal.toFixed(2)}</td>
      </tr>` : `
      <tr class="bg-navy-100/70 border-t-2 border-navy-300">
        <td class="px-3 py-2.5 sm:px-5 sm:py-3"></td>
        <td class="px-3 py-2.5 sm:px-5 sm:py-3 text-sm font-bold text-navy-900">Total</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold tabular-nums text-navy-900">${mainTotal.toFixed(2)}</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold text-navy-900">100%</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold tabular-nums text-navy-900 hidden sm:table-cell">${avgTotal.toFixed(2)}</td>
        <td class="px-2.5 py-2.5 sm:px-4 sm:py-3 text-right text-sm font-bold text-navy-900 hidden sm:table-cell">100%</td>
      </tr>`;

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

    // Date badge in top-right
    const dateBadgeEl = document.getElementById('ef-date-badge');
    if (dateBadgeEl) {
      const lastDate = getLastUpdatedDate();
      const dateStr = lastDate ? (typeof formatDateTimeGST === 'function' ? formatDateTimeGST(lastDate) : (function(x){const d=new Date(x);d.setMinutes(0,0,0);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'})+' GST'})(lastDate)) : '';
      dateBadgeEl.innerHTML = typeof renderPipelineBadge === 'function' ? renderPipelineBadge('export_flows', lastDate) : (dateStr ? `<div class="flex items-center gap-1.5 text-xs text-navy-500 bg-white px-3 py-2 rounded-lg border border-navy-200 shadow-sm whitespace-nowrap">
        <svg class="w-3.5 h-3.5 text-navy-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Data as of <span class="font-semibold text-navy-700">${dateStr}</span>
      </div>` : '');
    }

    const timeline = getMergedTimeline();
    const kpis = computeKPIs(timeline);

    document.getElementById('ef-kpis').innerHTML = renderKPICards(kpis);
    renderInsights(timeline, kpis);
    fetchNewsInsight();
    drawCharts(timeline, kpis);
    renderPipelineCallout();
    renderDestinationTable(timeline, kpis);
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
