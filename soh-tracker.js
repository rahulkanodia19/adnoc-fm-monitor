// SOH Tracker — Strait of Hormuz vessel & flow tracking dashboard
// Data: Kpler Terminal (live) | MarineTraffic AIS
(function () {
  'use strict';

  const DATA_BASE = 'soh-data';
  let mapInstance = null;
  let flowChartExport = null;
  let flowChartImport = null;
  let vesselCountExportChart = null;
  let vesselCountImportChart = null;
  let categoryChart = null;
  let statusDonut = null;
  let productChart = null;

  const state = {
    matrixRegion: 'inside',
    breakdownTab: 'product',
    flowView: 'daily',
    flowRange: '2m',
    flowCommodity: 'crude',
    expandedClasses: {},
    loaded: false,
    data: {},
  };

  // ---------- Data Loading ----------

  async function loadJSON(filename) {
    const resp = await fetch(`${DATA_BASE}/${filename}`);
    if (!resp.ok) throw new Error(`Failed to load ${filename}: ${resp.status}`);
    return resp.json();
  }

  async function loadAllData() {
    const results = await Promise.allSettled([
      loadJSON('summary.json'),            // 0
      loadJSON('vessel-matrix.json'),      // 1
      loadJSON('adnoc-vessels.json'),      // 2
      loadJSON('map-positions.json'),      // 3
      loadJSON('flows-daily.json'),        // 4
      loadJSON('breakdown-product.json'),  // 5
      loadJSON('breakdown-vessel-type.json'), // 6
      loadJSON('breakdown-destination.json'), // 7
      loadJSON('transit-vessels.json'),    // 8
      loadJSON('flows-daily-import.json'), // 9
      loadJSON('flows-weekly.json'),       // 10
      loadJSON('flows-weekly-import.json'),// 11
      loadJSON('flows-monthly.json'),      // 12
      loadJSON('flows-monthly-import.json'), // 13
      loadJSON('imf-hormuz-transit.json'),   // 14
      loadJSON('flows-crude.json'),          // 15
      loadJSON('flows-lng.json'),            // 16
      loadJSON('flows-lpg.json'),            // 17
      loadJSON('crisis-transits.json'),      // 18
      loadJSON('flows-crude-import.json'),   // 19
      loadJSON('flows-lng-import.json'),     // 20
      loadJSON('flows-lpg-import.json'),     // 21
      loadJSON('daily-transit-history.json'), // 22
      loadJSON('transit-current.json'),        // 23
    ]);
    const get = (i) => results[i].status === 'fulfilled' ? results[i].value : null;
    return {
      summary: get(0), vesselMatrix: get(1), adnocVessels: get(2), mapPositions: get(3),
      flowsDaily: get(4), breakdownProduct: get(5), breakdownVesselType: get(6),
      breakdownDest: get(7), transitVessels: get(8),
      flowsDailyImport: get(9), flowsWeekly: get(10), flowsWeeklyImport: get(11),
      flowsMonthly: get(12), flowsMonthlyImport: get(13),
      imfTransit: get(14),
      flowsCrude: get(15), flowsLng: get(16), flowsLpg: get(17),
      crisisTransits: get(18),
      flowsCrudeImport: get(19), flowsLngImport: get(20), flowsLpgImport: get(21),
      dailyTransitHistory: get(22),
      transitCurrent: get(23),
    };
  }

  // ---------- Helpers ----------

  function fmtNum(n) { return n == null ? '-' : n.toLocaleString('en-US'); }
  function fmtDelta(d) {
    if (d == null) return '<span class="text-xs text-navy-400">—</span>';
    if (d === 0) return '<span class="text-xs text-navy-400">No change</span>';
    const sign = d > 0 ? '+' : '';
    const color = d > 0 ? 'text-emerald-600' : 'text-red-600';
    return `<span class="${color} text-xs font-medium">${sign}${d}</span>`;
  }
  function fmtSignedDelta(d) {
    if (d == null) return '—';
    return `${d > 0 ? '+' : ''}${d}`;
  }
  function deltaColor(d) {
    if (d == null || d === 0) return '#666';
    return d > 0 ? '#166534' : '#991B1B';
  }
  function fmtDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    d.setMinutes(0, 0, 0);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const ADNOC_IMOS = new Set(['9592898','9380324','9494204','9573505','9300984','9574016','9074626','9923085','9923097','9034236','9482873']);
  function isUAEVessel(v) { return v.flagName === 'United Arab Emirates'; }
  function isADNOCVessel(v) {
    if (ADNOC_IMOS.has(v.imo)) return true;
    const c = (v.controller || '').toLowerCase();
    return c.includes('adnoc') || c.includes('abu dhabi');
  }
  function flagBadge(v) {
    const uae = isUAEVessel(v);
    const adnoc = isADNOCVessel(v);
    if (!uae && !adnoc) return v.flagName || '-';
    let badges = '';
    if (uae) badges += '<span class="bg-sky-100 text-sky-700 text-[10px] font-bold px-1.5 py-0.5 rounded">UAE</span> ';
    if (adnoc) badges += '<span class="bg-[#0055A5]/10 text-[#0055A5] text-[10px] font-bold px-1.5 py-0.5 rounded">ADNOC</span> ';
    if (!uae) badges += `<span class="text-navy-500 text-[10px]">${v.flagName || ''}</span>`;
    return badges;
  }

  function cargoBadge(st) {
    const s = (st || '').toLowerCase();
    if (s === 'loaded' || s === 'laden') return `<span class="soh-badge-laden">LADEN</span>`;
    if (s === 'ballast') return `<span class="soh-badge-ballast">BALLAST</span>`;
    return `<span class="soh-badge-ballast">${(st || 'N/A').toUpperCase()}</span>`;
  }

  function renderToggle(label, key, options) {
    return `<div class="flex items-center bg-white rounded-lg border border-navy-200 shadow-sm overflow-hidden">
      <span class="px-2.5 py-1.5 text-[10px] font-semibold text-navy-500 bg-navy-50 border-r border-navy-200">${label}</span>
      ${options.map(([v, text]) => `<button data-soh-control="${key}" data-value="${v}"
        class="px-2.5 py-1.5 text-xs font-medium transition-all ${state[key] === v ? 'bg-amber-500 text-white shadow-inner' : 'text-navy-600 hover:bg-navy-100'}">${text}</button>`).join('')}
    </div>`;
  }

  function filterFlowsByRange(series, range) {
    if (!series || range === 'all') return series || [];
    const now = new Date();
    const cutoff = new Date(now);
    const weeks = { '1w': 1, '2w': 2, '3w': 3 };
    const months = { '1m': 1, '2m': 2, '3m': 3, '6m': 6, '12m': 12 };
    if (weeks[range]) cutoff.setDate(cutoff.getDate() - weeks[range] * 7);
    else if (months[range]) cutoff.setMonth(cutoff.getMonth() - months[range]);
    return series.filter(p => new Date(p.date) >= cutoff);
  }

  function trimToToday(series) {
    if (!series) return [];
    const today = new Date().toISOString().split('T')[0];
    return series.filter(p => p.date <= today);
  }

  function alignDateRanges(seriesA, seriesB) {
    if (!seriesA?.length || !seriesB?.length) return { a: seriesA || [], b: seriesB || [] };
    const startDate = seriesA[0].date > seriesB[0].date ? seriesA[0].date : seriesB[0].date;
    const endDate = seriesA[seriesA.length - 1].date < seriesB[seriesB.length - 1].date ? seriesA[seriesA.length - 1].date : seriesB[seriesB.length - 1].date;
    return {
      a: seriesA.filter(p => p.date >= startDate && p.date <= endDate),
      b: seriesB.filter(p => p.date >= startDate && p.date <= endDate),
    };
  }

  function aggregateToWeekly(series) {
    if (!series?.length) return [];
    const weeks = {};
    for (const p of series) {
      const d = new Date(p.date);
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(mon.getDate() - ((day + 6) % 7)); // Monday
      const weekKey = mon.toISOString().split('T')[0];
      if (!weeks[weekKey]) weeks[weekKey] = { date: weekKey, volume: 0, mass: 0, count: 0 };
      const vals = p.datasets?.[0]?.values || {};
      weeks[weekKey].volume += (vals.volume || 0);
      weeks[weekKey].mass += (vals.mass || 0);
      weeks[weekKey].count++;
    }
    return Object.values(weeks).sort((a, b) => a.date.localeCompare(b.date)).map(w => ({
      date: w.date,
      datasets: [{ datasetName: 'flows', values: { volume: w.volume / w.count, volume_gas: 0, mass: w.mass / w.count, energy: 0 } }],
    }));
  }

  function aggregateToMonthly(series) {
    if (!series?.length) return [];
    const months = {};
    for (const p of series) {
      const mk = p.date.substring(0, 7); // YYYY-MM
      if (!months[mk]) months[mk] = { date: mk, volume: 0, mass: 0, count: 0 };
      const vals = p.datasets?.[0]?.values || {};
      months[mk].volume += (vals.volume || 0);
      months[mk].mass += (vals.mass || 0);
      months[mk].count++;
    }
    return Object.values(months).sort((a, b) => a.date.localeCompare(b.date)).map(m => ({
      date: m.date,
      datasets: [{ datasetName: 'flows', values: { volume: m.volume / m.count, volume_gas: 0, mass: m.mass / m.count, energy: 0 } }],
    }));
  }

  // Estimate vessel count from volume (avg ~500K bbl per vessel transit)
  const AVG_BBL_PER_VESSEL = 500000;

  // ---------- Excel Export ----------

  const GULF_BOUNDARY = [
    { lat: 30.0, lng: 56.50 }, { lat: 29.0, lng: 56.50 }, { lat: 28.0, lng: 56.45 },
    { lat: 27.2, lng: 56.45 }, { lat: 27.0, lng: 56.40 }, { lat: 26.8, lng: 56.35 },
    { lat: 26.5, lng: 56.30 }, { lat: 26.2, lng: 56.25 }, { lat: 26.0, lng: 56.20 },
    { lat: 25.8, lng: 56.15 }, { lat: 25.5, lng: 56.05 }, { lat: 25.3, lng: 56.00 },
    { lat: 25.0, lng: 55.90 }, { lat: 24.5, lng: 55.50 }, { lat: 24.0, lng: 55.00 },
    { lat: 23.5, lng: 54.00 },
  ];
  const EXCLUDED_VESSEL_TYPES = ['Short Sea Tankers', 'Small Tankers', 'Mini Bulker'];

  function boundaryLng(lat) {
    for (let i = 0; i < GULF_BOUNDARY.length - 1; i++) {
      const a = GULF_BOUNDARY[i], b = GULF_BOUNDARY[i + 1];
      if (lat >= b.lat && lat <= a.lat) {
        const frac = (lat - b.lat) / (a.lat - b.lat);
        return b.lng + frac * (a.lng - b.lng);
      }
    }
    return lat > 30.0 ? 56.50 : 54.00;
  }

  function isInsideGulf(lat, lng) { return lng < boundaryLng(lat); }

  async function exportVesselsXlsx() {
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded. Please refresh the page.'); return; }
    const btn = document.getElementById('soh-export-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Exporting...'; }
    try {
      const resp = await fetch(`${DATA_BASE}/vessels.json`);
      if (!resp.ok) throw new Error('Failed to load vessels.json');
      const allVessels = await resp.json();

      const rows = [];
      for (const v of allVessels) {
        if (EXCLUDED_VESSEL_TYPES.includes(v.vesselTypeClass)) continue;
        if (!v.lat || !v.lng) continue;
        rows.push({
          'Location': isInsideGulf(v.lat, v.lng) ? 'Inside Gulf' : 'Outside Gulf',
          'Vessel Name': v.name || '',
          'IMO': v.imo || '',
          'Vessel Type': v.vesselTypeClass || '',
          'Cargo State': v.state || '',
          'Flag': v.flagName || '',
          'DWT': v.deadWeight || '',
          'Speed (kn)': v.speed != null ? v.speed : '',
          'Lat': v.lat,
          'Lng': v.lng,
          'Destination': v.destination || v.aisDestination || '',
          'Product': v.product || '',
          'Controller': v.controller || '',
          'Data Source': v.dataSource || 'kpler',
        });
      }
      rows.sort((a, b) => a.Location.localeCompare(b.Location)
        || (a['Vessel Type'] || '').localeCompare(b['Vessel Type'] || '')
        || (a['Vessel Name'] || '').localeCompare(b['Vessel Name'] || ''));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      // Column widths
      ws['!cols'] = [
        { wch: 14 }, // Location
        { wch: 25 }, // Vessel Name
        { wch: 12 }, // IMO
        { wch: 20 }, // Vessel Type
        { wch: 12 }, // Cargo State
        { wch: 18 }, // Flag
        { wch: 12 }, // DWT
        { wch: 10 }, // Speed
        { wch: 12 }, // Lat
        { wch: 12 }, // Lng
        { wch: 22 }, // Destination
        { wch: 25 }, // Product
        { wch: 22 }, // Controller
        { wch: 12 }, // Data Source
      ];

      // Header row styling — bold white text on navy background
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1E3A5F' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      };
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[addr]) ws[addr].s = headerStyle;
      }

      // Freeze top row
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', state: 'frozen' };

      // Autofilter on full range
      ws['!autofilter'] = { ref: ws['!ref'] };

      XLSX.utils.book_append_sheet(wb, ws, 'Vessels');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `soh-vessels-${today}.xlsx`);
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Export Excel'; }
    }
  }

  // ---------- Section 1: KPI Cards ----------

  function renderKPIs(summary, transitCurrent, dailyHistory) {
    const d = summary.deltas || {};
    // KPI cards use the last CLOSED day (second-to-last entry; latest is today's partial)
    const histLen = Array.isArray(dailyHistory) ? dailyHistory.length : 0;
    const latest = histLen >= 2 ? dailyHistory[histLen - 2] : (histLen === 1 ? dailyHistory[0] : null);
    const tc = latest ? {
      exitedCount: latest.exited || 0,
      enteredCount: latest.entered || 0,
      omanEnteredCount: (latest.omanEntered || []).length,
      omanLeftCount: (latest.omanLeft || []).length,
      sinceMidnight: latest.date,
    } : {};
    const cards = [
      {
        title: 'ADNOC Vessels in Hormuz', value: summary.adnocCount,
        delta: d.adnocDelta, ballast: null, laden: null,
        deltaB: null, deltaL: null,
        cta: 'Open Vessels', target: 'soh-adnoc',
      },
      {
        title: 'Vessels Inside', value: summary.insideTotal,
        delta: d.insideDelta, ballast: summary.insideBallast, laden: summary.insideLaden,
        deltaB: d.insideBallastDelta, deltaL: d.insideLadenDelta,
        entered: tc.enteredCount || 0, exited: tc.exitedCount || 0,
        cta: 'Open Inside Matrix', target: 'soh-matrix',
      },
      {
        title: 'Vessels Outside', value: summary.outsideTotal,
        delta: d.outsideDelta, ballast: summary.outsideBallast, laden: summary.outsideLaden,
        deltaB: d.outsideBallastDelta, deltaL: d.outsideLadenDelta,
        arrived: tc.omanEnteredCount || 0,
        departed: tc.omanLeftCount || 0,
        isOutside: true,
        cta: 'Open Outside Matrix', target: 'soh-matrix',
      },
    ];
    const sinceLabel = tc.sinceMidnight ? `during ${tc.sinceMidnight}` : '';
    const transitDeltaHtml = (c) => {
      if (c.isOutside) {
        if (!c.arrived && !c.departed) return '';
        const parts = [];
        if (c.arrived) parts.push(`<span class="text-emerald-600">&uarr;${c.arrived} arrived</span>`);
        if (c.departed) parts.push(`<span class="text-red-500">&darr;${c.departed} departed</span>`);
        return `<div class="mt-1 flex items-center gap-2 text-[10px] font-medium">${parts.join('<span class="text-navy-300">|</span>')}<span class="text-navy-400">${sinceLabel}</span></div>`;
      }
      if (c.entered == null && c.exited == null) return '';
      if (!c.entered && !c.exited) return '';
      const parts = [];
      if (c.exited) parts.push(`<span class="text-emerald-600">&uarr;${c.exited} exited</span>`);
      if (c.entered) parts.push(`<span class="text-red-500">&darr;${c.entered} entered</span>`);
      return `<div class="mt-1 flex items-center gap-2 text-[10px] font-medium">${parts.join('<span class="text-navy-300">|</span>')}<span class="text-navy-400">${sinceLabel}</span></div>`;
    };
    const cardHtml = cards.map(c => `
      <button class="soh-kpi-card flex flex-col justify-between text-left border border-navy-200 bg-white rounded-xl p-4 transition-all hover:border-navy-400 hover:shadow-sm cursor-pointer"
        onclick="document.getElementById('${c.target}').scrollIntoView({behavior:'smooth'})">
        <div>
          <div class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-navy-500">${c.title}</div>
          <div class="text-3xl font-extrabold leading-none text-navy-900">${fmtNum(c.value)}</div>
          ${c.ballast != null && c.laden != null ? `
          <div class="mt-3 flex items-center gap-2 text-[10px] font-semibold uppercase text-navy-500">
            <span>Ballast ${fmtNum(c.ballast)}</span><span>|</span><span>Laden ${fmtNum(c.laden)}</span>
          </div>` : ''}
          ${transitDeltaHtml(c)}
        </div>
        <div class="mt-4 text-xs text-sky-600 font-medium">${c.cta} &rarr;</div>
      </button>`).join('');
    return `
    <div class="soh-section" id="soh-kpis">
      <div class="mb-4 flex items-start justify-between">
        <div>
          <h2 class="text-lg sm:text-xl font-extrabold text-navy-900 tracking-tight">STRAIT OF HORMUZ TRACKER</h2>
          <p class="text-xs text-navy-500 mt-0.5">Data: Kpler Terminal + S&amp;P MINT (containers)</p>
        </div>
        <button id="soh-export-btn" onclick="window.__sohExportXlsx()"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-navy-600 bg-white border border-navy-200 rounded-lg hover:border-navy-400 hover:text-navy-800 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3"/></svg>
          Export Excel
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${cardHtml}</div>
    </div>`;
  }

  // ---------- Section 2: Map ----------

  function renderMap() {
    return `
    <div class="soh-section mt-6" id="soh-map">
      <h3 class="text-sm font-bold text-navy-900 uppercase tracking-wider mb-3">Live Hormuz Traffic Picture</h3>
      <div class="relative rounded-xl overflow-hidden border border-navy-200 shadow-sm">
        <div id="soh-map-container" class="h-[420px] lg:h-[520px] w-full bg-[#0a1929]"></div>
      </div>
      <p class="text-[10px] text-navy-400 mt-2">Source: Kpler AIS + S&amp;P MINT (containers). Vessel locations may be imprecise due to GPS interference in the region.</p>
    </div>`;
  }

  function initMap(mapData) {
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }
    const container = document.getElementById('soh-map-container');
    if (!container) return;

    mapInstance = L.map(container, { center: mapData.center, zoom: mapData.zoom || 8, minZoom: 5, maxZoom: 14, zoomControl: true });
    L.tileLayer(mapData.tileUrl, { attribution: 'Tiles &copy; Esri' }).addTo(mapInstance);



    // Vessel markers
    const colorMap = { liquids: '#ef4444', lng: '#22c55e', lpg: '#a855f7', dry: '#06b6d4', container: '#f59e0b', other: '#6b7280' };
    for (const p of (mapData.positions || [])) {
      const color = colorMap[p.commodity] || colorMap.other;
      const fillOpacity = p.state === 'loaded' ? 0.9 : 0.5;
      const radius = p.isTransiting ? 5 : 3;
      const weight = p.isTransiting ? 2 : 0.5;
      const borderColor = p.isTransiting ? '#ffffff' : '#1e293b';
      L.circleMarker([p.lat, p.lng], { radius, color: borderColor, weight, fillColor: color, fillOpacity })
        .bindTooltip(`${p.name || 'Vessel'}<br>${p.type} (${p.state})${p.isTransiting ? '<br><b>IN TRANSIT</b>' : ''}`, { direction: 'top', offset: [0, -6] })
        .addTo(mapInstance);
    }

    // Legend (collapsible on mobile)
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'map-legend bg-white/90 backdrop-blur rounded-lg border border-navy-200 text-[10px] text-navy-700');
      const isMobile = window.innerWidth < 640;
      div.innerHTML = `
        <div class="map-legend-toggle font-bold" style="cursor:pointer;display:flex;align-items:center;gap:4px;user-select:none">
          <span class="map-legend-arrow" style="font-size:8px;transition:transform 0.2s">${isMobile ? '&#9654;' : '&#9660;'}</span> Vessel Type
        </div>
        <div class="map-legend-body" style="${isMobile ? 'display:none' : ''}">
          ${Object.entries(colorMap).map(([k, c]) => `<div class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${c}"></span>${k}</div>`).join('')}
          <div class="mt-1 border-t border-navy-200 pt-1">
            <span class="opacity-50">&#9679;</span> Ballast &nbsp; <span class="opacity-90">&#9679;</span> Laden
            <br><span style="font-size:13px">&#9679;</span> = In Transit
          </div>
        </div>
      `;
      L.DomEvent.disableClickPropagation(div);
      const toggle = div.querySelector('.map-legend-toggle');
      const body = div.querySelector('.map-legend-body');
      const arrow = div.querySelector('.map-legend-arrow');
      toggle.addEventListener('click', () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        arrow.innerHTML = open ? '&#9654;' : '&#9660;';
      });
      return div;
    };
    legend.addTo(mapInstance);
    setTimeout(() => mapInstance.invalidateSize(), 100);
  }

  // ---------- Section 3: Dual Flow Charts ----------

  function renderFlowCharts() {
    return `
    <div class="soh-section mt-6" id="soh-flows">
      <h3 class="text-sm font-bold text-navy-900 uppercase tracking-wider mb-3">Commodity Flows via Hormuz</h3>
      <div class="flex flex-wrap items-center gap-2 mb-4">
        ${renderToggle('Commodity', 'flowCommodity', [['all', 'All'], ['crude', 'Crude/Condensate'], ['lpg', 'LPG'], ['lng', 'Refined & Other']])}
        ${renderToggle('View', 'flowView', [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']])}
        ${renderToggle('Range', 'flowRange', [['1w', '1W'], ['2w', '2W'], ['3w', '3W'], ['1m', '1M'], ['2m', '2M']])}
      </div>
      <div class="bg-white rounded-xl border border-navy-200 p-3 sm:p-5">
        <p class="text-xs font-semibold text-navy-700 mb-1">Volume via Hormuz</p>
        <p class="text-[10px] text-navy-400 mb-2">${{all:'All commodity',crude:'Crude/condensate',lng:'Refined products, LNG, dry bulk & other',lpg:'LPG'}[state.flowCommodity]} flows via Hormuz (${{all:'bbl/day',crude:'bbl/day',lng:'bbl/day',lpg:'mmt/day'}[state.flowCommodity]}) — Source: Kpler</p>
        <div class="h-[280px] sm:h-[320px]"><canvas id="soh-flow-export-chart"></canvas></div>
      </div>

      <h3 class="text-sm font-bold text-navy-900 uppercase tracking-wider mt-6 mb-3">Vessel Transits via Hormuz</h3>
      <p class="text-xs text-navy-500 mb-3">Vessel exits (&uarr;) and entries (&darr;) through the Strait of Hormuz by type. Dashed red line = crisis start (28 Feb). Range toggle applies.</p>
      <div class="bg-white rounded-xl border border-navy-200 p-3 sm:p-5">
        <p class="text-xs font-semibold text-navy-700 mb-1">Daily Vessel Exits &amp; Entries by Type</p>
        <p class="text-[10px] text-navy-400 mb-2">Sources: IMF PortWatch (pre-23 Mar, total transits) | Kpler (23-30 Mar, approx exits) | Kpler + MINT midnight snapshots (31 Mar+, exits &amp; entries)</p>
        <p class="text-[10px] text-navy-400 mb-2">Solid bars = exits | Faded bars = entries (stacked on top)</p>
        <div class="h-[280px] sm:h-[320px]"><canvas id="soh-vessel-stacked-chart"></canvas></div>
      </div>
      <div class="bg-sky-50 border border-sky-200 rounded-lg px-4 py-2.5 mt-3 text-xs text-sky-800">
        <strong>Note:</strong> Volume chart: Crude/condensate &amp; Refined in bbl/day; LPG in mmt/day. Pre-crisis crude: ~15M bbl/day.
        Vessel transits: ~96/day pre-crisis (total), collapsed during Hormuz disruption. Commodity toggle does not affect vessel counts.
      </div>
    </div>`;
  }

  function getFlowSeries(data, direction) {
    const view = state.flowView;
    const commodity = state.flowCommodity;
    let raw;
    if (direction === 'export') {
      if (commodity === 'crude') raw = data.flowsCrude;
      else if (commodity === 'lng') raw = data.flowsLng;
      else if (commodity === 'lpg') raw = data.flowsLpg;
      if (!raw) raw = view === 'monthly' ? data.flowsMonthly : data.flowsDaily;
    } else {
      if (commodity === 'crude') raw = data.flowsCrudeImport;
      else if (commodity === 'lng') raw = data.flowsLngImport;
      else if (commodity === 'lpg') raw = data.flowsLpgImport;
      if (!raw) raw = view === 'monthly' ? data.flowsMonthlyImport : data.flowsDailyImport;
    }
    let series = trimToToday(raw?.series);
    if (view === 'weekly') series = aggregateToWeekly(series);
    else if (view === 'monthly') series = aggregateToMonthly(series);
    return series;
  }

  function initFlowCharts(data) {
    let exportSeries = getFlowSeries(data, 'export');

    // Apply range filter
    exportSeries = filterFlowsByRange(exportSeries, state.flowRange);

    // Unit conversion: Kpler 'volume' is in m³, 'mass' in metric tons
    const commodity = state.flowCommodity;
    const unitInfo = commodity === 'lpg'
      ? { field: 'mass', factor: 1e-6, unit: 'mmt', label: 'mmt/day', threshold: 0.05 }
      : { field: 'volume', factor: 6.29, unit: 'bbl', label: 'bbl/day', threshold: 3e6 };  // m³ → bbl for all/crude/refined

    function makeVolumeChart(canvasId, series, oldChart) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return null;
      if (oldChart) oldChart.destroy();
      const labels = series.map(p => p.date);
      const volumes = series.map(p => {
        const raw = (p.datasets?.[0]?.values?.[unitInfo.field] || 0) * unitInfo.factor;
        return unitInfo.unit === 'bbl' ? Math.round(raw) : parseFloat(raw.toFixed(3));
      });
      return new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'Volume', data: volumes, backgroundColor: volumes.map(v => v < unitInfo.threshold ? '#ef4444' : '#0d9488'), borderWidth: 0, borderRadius: 1 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false },
            datalabels: { display: (ctx) => ctx.dataset.data[ctx.dataIndex] === 0, formatter: () => '0', color: '#94a3b8', font: { size: 8 }, anchor: 'end', align: 'top' },
            tooltip: { callbacks: { label: (ctx) => `${unitInfo.unit === 'bbl' ? fmtNum(ctx.raw) : ctx.raw.toFixed(2)} ${unitInfo.unit}`, title: (items) => items[0]?.label || '' } } },
          scales: {
            x: { ticks: { maxTicksLimit: 10, font: { size: 9 }, color: '#627d98' }, grid: { display: false } },
            y: { ticks: { callback: (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : v, font: { size: 9 }, color: '#627d98' }, grid: { color: '#e5e7eb' } },
          },
        },
      });
    }

    function makeVesselCountChart(canvasId, series, oldChart) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return null;
      if (oldChart) oldChart.destroy();
      const labels = series.map(p => p.date);
      const counts = series.map(p => Math.round((p.datasets?.[0]?.values?.volume || 0) / AVG_BBL_PER_VESSEL));
      return new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'Est. vessels', data: counts, backgroundColor: counts.map(v => v < 2 ? '#ef4444' : '#6366f1'), borderWidth: 0, borderRadius: 1 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, datalabels: { display: false },
            tooltip: { callbacks: { label: (ctx) => `~${ctx.raw} vessels`, title: (items) => items[0]?.label || '' } } },
          scales: {
            x: { ticks: { maxTicksLimit: 10, font: { size: 9 }, color: '#627d98' }, grid: { display: false } },
            y: { ticks: { font: { size: 9 }, color: '#627d98' }, grid: { color: '#e5e7eb' }, beginAtZero: true },
          },
        },
      });
    }

    // Vessel transit chart — stitched from IMF + crisis-transits + midnight snapshots
    const imf = data.imfTransit;
    const crisisTransits = data.crisisTransits;
    const dailyTransitHistory = data.dailyTransitHistory;

    // Build unified timeseries with exit/entry fields from all sources
    const merged = {};
    const today = new Date(Date.now() + 4 * 3600000).toISOString().split('T')[0]; // UAE date

    // Source 1: IMF PortWatch (total transits both directions, no exit/entry split)
    if (imf?.records) {
      for (const r of imf.records) {
        if (r.date > today) continue;
        merged[r.date] = {
          tanker_exit: r.n_tanker || 0,
          bulk_exit: r.n_dry_bulk || 0,
          container_exit: r.n_container || 0,
          other_exit: (r.n_total || 0) - (r.n_tanker || 0) - (r.n_dry_bulk || 0) - (r.n_container || 0),
          tanker_enter: 0, bulk_enter: 0, container_enter: 0, other_enter: 0,
          source: 'imf',
        };
      }
    }

    // Source 2: crisis-transits dailyCounts (approx exits only, gap fill after IMF ends)
    const imfLastDate = imf?.records?.filter(r => r.date <= today).slice(-1)[0]?.date || '2000-01-01';
    if (crisisTransits?.dailyCounts) {
      for (const d of crisisTransits.dailyCounts) {
        if (d.date > imfLastDate && d.date <= today) {
          merged[d.date] = {
            tanker_exit: d.tankers || 0, bulk_exit: d.bulk || 0,
            container_exit: d.container || 0, other_exit: d.other || 0,
            tanker_enter: 0, bulk_enter: 0, container_enter: 0, other_enter: 0,
            source: 'crisis',
          };
        }
      }
    }

    // Source 3: midnight snapshot history (exits & entries)
    if (Array.isArray(dailyTransitHistory)) {
      for (const d of dailyTransitHistory) {
        merged[d.date] = {
          tanker_exit: d.tanker_exit || 0, bulk_exit: d.bulk_exit || 0,
          container_exit: d.container_exit || 0, other_exit: d.other_exit || 0,
          tanker_enter: d.tanker_enter || 0, bulk_enter: d.bulk_enter || 0,
          container_enter: d.container_enter || 0, other_enter: d.other_enter || 0,
          source: 'snapshot',
        };
      }
    }

    // Sort and filter by range
    let transitRecords = Object.entries(merged)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    // Default to Feb 1 2026 onwards (crisis context)
    const rangeStart = state.flowRange === 'all' ? null : '2026-02-01';
    if (rangeStart) {
      transitRecords = transitRecords.filter(r => r.date >= rangeStart);
    }
    transitRecords = filterFlowsByRange(transitRecords, state.flowRange);

    // Aggregate by week/month if view is not daily
    if (state.flowView !== 'daily' && transitRecords.length > 0) {
      const groups = {};
      const fields = ['tanker_exit', 'bulk_exit', 'container_exit', 'other_exit', 'tanker_enter', 'bulk_enter', 'container_enter', 'other_enter'];
      for (const r of transitRecords) {
        let key;
        if (state.flowView === 'weekly') {
          const d = new Date(r.date);
          const day = d.getUTCDay();
          const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
          key = mon.toISOString().split('T')[0];
        } else {
          key = r.date.substring(0, 7);
        }
        if (!groups[key]) { groups[key] = { date: key, source: r.source }; fields.forEach(f => groups[key][f] = 0); }
        fields.forEach(f => groups[key][f] += (r[f] || 0));
      }
      transitRecords = Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
    }

    // Sync x-axis: both charts use same start and end date (union, not intersection)
    if (exportSeries.length > 0 && transitRecords.length > 0) {
      const commonStart = exportSeries[0].date > transitRecords[0].date ? exportSeries[0].date : transitRecords[0].date;
      const commonEnd = exportSeries[exportSeries.length - 1].date > transitRecords[transitRecords.length - 1].date
        ? exportSeries[exportSeries.length - 1].date : transitRecords[transitRecords.length - 1].date;

      exportSeries = exportSeries.filter(p => p.date >= commonStart);
      transitRecords = transitRecords.filter(r => r.date >= commonStart);

      // Pad flow data with empty entries for dates in transit but not flow
      const flowDates = new Set(exportSeries.map(p => p.date));
      for (const r of transitRecords) {
        if (!flowDates.has(r.date) && r.date <= commonEnd) {
          exportSeries.push({ date: r.date, datasets: [{ values: { volume: 0, mass: 0 } }] });
        }
      }
      exportSeries.sort((a, b) => a.date.localeCompare(b.date));

      // Pad transit data with empty entries for dates in flow but not transit
      const transitDates = new Set(transitRecords.map(r => r.date));
      const emptyTransit = { tanker_exit: 0, bulk_exit: 0, container_exit: 0, other_exit: 0, tanker_enter: 0, bulk_enter: 0, container_enter: 0, other_enter: 0, source: '' };
      for (const p of exportSeries) {
        if (!transitDates.has(p.date)) {
          transitRecords.push({ date: p.date, ...emptyTransit });
        }
      }
      transitRecords.sort((a, b) => a.date.localeCompare(b.date));
    }

    // Render flow chart (after alignment)
    flowChartExport = makeVolumeChart('soh-flow-export-chart', exportSeries, flowChartExport);

    // Compute pre-crisis average for reference line (from IMF Feb data)
    const preCrisisRecords = Object.entries(merged)
      .filter(([d, v]) => d >= '2026-02-01' && d < '2026-02-28' && v.source === 'imf')
      .map(([, v]) => v.tanker_exit + v.bulk_exit + v.container_exit + v.other_exit);
    const preCrisisAvg = preCrisisRecords.length > 0
      ? Math.round(preCrisisRecords.reduce((s, v) => s + v, 0) / preCrisisRecords.length)
      : 96;

    const canvas = document.getElementById('soh-vessel-stacked-chart');
    if (canvas && transitRecords.length > 0) {
      if (vesselCountExportChart) vesselCountExportChart.destroy();
      const labels = transitRecords.map(r => r.date);

      // Find crisis start index — only show if exact date is in range
      const crisisIdx = labels.indexOf('2026-02-28');
      // Only show pre-crisis reference line if range includes pre-crisis dates
      const hasPreCrisisDates = labels.some(d => d < '2026-02-28');

      vesselCountExportChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            // Exit datasets (positive, above axis)
            { label: 'Tankers (exit)', data: transitRecords.map(r => r.tanker_exit), backgroundColor: 'rgba(239,68,68,0.6)', borderColor: '#ef4444', borderWidth: 1, stack: 'vessels' },
            { label: 'Dry Bulk (exit)', data: transitRecords.map(r => r.bulk_exit), backgroundColor: 'rgba(6,182,212,0.6)', borderColor: '#06b6d4', borderWidth: 1, stack: 'vessels' },
            { label: 'Container (exit)', data: transitRecords.map(r => r.container_exit), backgroundColor: 'rgba(139,92,246,0.6)', borderColor: '#8b5cf6', borderWidth: 1, stack: 'vessels' },
            { label: 'Other (exit)', data: transitRecords.map(r => r.other_exit), backgroundColor: 'rgba(156,163,175,0.4)', borderColor: '#9ca3af', borderWidth: 1, stack: 'vessels' },
            // Entry datasets (negative, below axis)
            { label: 'Tankers (enter)', data: transitRecords.map(r => r.tanker_enter || 0), backgroundColor: 'rgba(239,68,68,0.3)', borderColor: '#ef4444', borderWidth: 1, stack: 'vessels' },
            { label: 'Dry Bulk (enter)', data: transitRecords.map(r => r.bulk_enter || 0), backgroundColor: 'rgba(6,182,212,0.3)', borderColor: '#06b6d4', borderWidth: 1, stack: 'vessels' },
            { label: 'Container (enter)', data: transitRecords.map(r => r.container_enter || 0), backgroundColor: 'rgba(139,92,246,0.3)', borderColor: '#8b5cf6', borderWidth: 1, stack: 'vessels' },
            { label: 'Other (enter)', data: transitRecords.map(r => r.other_enter || 0), backgroundColor: 'rgba(156,163,175,0.2)', borderColor: '#9ca3af', borderWidth: 1, stack: 'vessels' },
            // Pre-crisis average reference line (only when pre-crisis dates visible)
            ...(hasPreCrisisDates ? [{ label: `Pre-crisis avg (${preCrisisAvg}/day)`, data: labels.map(() => preCrisisAvg), type: 'line', borderColor: '#334e68', borderWidth: 1, borderDash: [6, 3], pointRadius: 0, fill: false }] : []),
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { size: 10 }, usePointStyle: true, pointStyle: 'rect',
                filter: (item) => !item.text.includes('(enter)'),
              },
            },
            datalabels: { display: false },
            tooltip: {
              mode: 'index', intersect: false,
              callbacks: {
                title: (items) => {
                  const d = items[0]?.label;
                  const src = transitRecords.find(r => r.date === d)?.source;
                  const srcLabel = src === 'imf' ? 'IMF PortWatch (total transits)' : src === 'crisis' ? 'Kpler (approx exits)' : src === 'snapshot' ? 'Kpler + MINT Snapshot' : '';
                  return `${d}${srcLabel ? ' \u2014 ' + srcLabel : ''}`;
                },
                label: (ctx) => {
                  if (ctx.dataset.borderDash) return null; // skip reference line
                  return ctx.raw > 0 ? `${ctx.dataset.label}: ${ctx.raw}` : null;
                },
                afterBody: (items) => {
                  const exits = items.filter(i => !i.dataset.borderDash && i.dataset.label.includes('exit')).reduce((s, i) => s + (i.raw || 0), 0);
                  const entries = items.filter(i => !i.dataset.borderDash && i.dataset.label.includes('enter')).reduce((s, i) => s + (i.raw || 0), 0);
                  const lines = [];
                  if (exits > 0) lines.push(`Total exits: ${exits}`);
                  if (entries > 0) lines.push(`Total entries: ${entries}`);
                  if (exits > 0 || entries > 0) lines.push(`Net: ${exits - entries > 0 ? '+' : ''}${exits - entries}`);
                  return lines.join('\n');
                },
              },
            },
          },
          scales: {
            x: {
              stacked: true,
              ticks: { autoSkip: true, maxRotation: 45, font: { size: 9 }, color: '#627d98' },
              grid: { display: false },
            },
            y: {
              stacked: true,
              ticks: { font: { size: 9 }, color: '#627d98' },
              grid: { color: '#e5e7eb' },
            },
          },
        },
        plugins: [{
          // Custom plugin: crisis start vertical line
          id: 'crisisLine',
          afterDraw: (chart) => {
            if (crisisIdx < 0) return;
            const meta = chart.getDatasetMeta(0);
            if (!meta.data[crisisIdx]) return;
            const x = meta.data[crisisIdx].x;
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, yAxis.top);
            ctx.lineTo(x, yAxis.bottom);
            ctx.stroke();
            ctx.fillStyle = '#ef4444';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Crisis Start', x, yAxis.top - 4);
            ctx.restore();
          },
        }],
      });
    }
  }

  // ---------- Section 4: ADNOC Vessels ----------

  function renderADNOCVessels(adnocData) {
    const vessels = adnocData.vessels || [];
    const tracked = vessels.filter(v => v.dataSource === 'kpler' || v.dataSource === 'mint');
    const anchored = tracked.filter(v => v.status === 'Anchored').length;
    const moored = tracked.filter(v => v.status === 'Moored').length;
    const underway = tracked.filter(v => v.status === 'Under way using engine').length;
    const unavailable = vessels.filter(v => v.dataSource === 'unavailable').length;

    const rows = vessels.map(v => {
      if (v.dataSource === 'unavailable') {
        return `<tr class="border-t border-navy-200 bg-navy-50 text-xs">
          <td class="px-3 py-2.5 font-semibold"><a href="${v.marineTrafficUrl}" target="_blank" rel="noreferrer" class="text-sky-700 hover:underline">${v.name} &#8599;</a></td>
          <td colspan="8" class="px-3 py-2.5 text-navy-400 italic">Vessel data unavailable — check MarineTraffic for live status</td>
        </tr>`;
      }
      const statusIcon = v.status === 'Under way using engine' ? '&#9654;' : v.status === 'Anchored' ? '&#9875;' : '&#9875;';
      const statusColor = v.status === 'Under way using engine' ? 'text-emerald-600' : v.status === 'Anchored' ? 'text-amber-600' : 'text-amber-600';
      return `<tr class="border-t border-navy-200 hover:bg-navy-50 text-xs">
        <td class="px-3 py-2.5 font-semibold"><a href="${v.marineTrafficUrl}" target="_blank" rel="noreferrer" class="text-sky-700 hover:underline font-mono">${v.name.toUpperCase()} &#8599;</a></td>
        <td class="px-3 py-2.5 hidden sm:table-cell text-navy-600">${v.type || '-'}</td>
        <td class="px-3 py-2.5">${cargoBadge(v.state)}</td>
        <td class="px-3 py-2.5"><span class="${statusColor}">${statusIcon}</span> ${v.status || '-'}</td>
        <td class="px-3 py-2.5 hidden md:table-cell text-navy-600">${v.departed || '-'}</td>
        <td class="px-3 py-2.5 hidden md:table-cell text-navy-600">${v.destination || '-'}</td>
        <td class="px-3 py-2.5 hidden lg:table-cell text-right font-mono">${fmtNum(v.deadWeight)}</td>
        <td class="px-3 py-2.5 hidden lg:table-cell text-right font-mono">${v.capacity ? fmtNum(v.capacity) : '-'}</td>
      </tr>`;
    }).join('');

    return `
    <div class="soh-section mt-6" id="soh-adnoc">
      <div class="flex items-center gap-3 mb-3">
        <p class="text-[10px] text-navy-500 italic">Strait of Hormuz Vessel Tracking - Curated live list</p>
      </div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-extrabold text-[#0055A5] flex items-center gap-2">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 17h2l.5-1.5L7 11l1.5 6H18l2-4h1"/></svg>
          ADNOC Vessels in Hormuz
        </h3>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="bg-white border border-navy-200 rounded-lg p-3"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">ADNOC Vessels in Hormuz</div><div class="text-2xl font-extrabold text-navy-900">${vessels.length}</div></div>
        <div class="bg-white border border-navy-200 rounded-lg p-3"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500"><span class="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span>Anchored</div><div class="text-2xl font-extrabold text-navy-900">${anchored}</div></div>
        <div class="bg-white border border-navy-200 rounded-lg p-3"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500"><span class="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"></span>Moored</div><div class="text-2xl font-extrabold text-navy-900">${moored}</div></div>
        <div class="bg-white border border-navy-200 rounded-lg p-3"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500"><span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1"></span>Under Way</div><div class="text-2xl font-extrabold text-navy-900">${underway}</div></div>
      </div>
      <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4 text-xs text-amber-800">
        <span class="font-bold uppercase tracking-wider text-[10px]">Live Vessel Tracking Disclaimer</span><br>
        AIS/GPS location services within the Mideast Gulf are subject to interference due to the ongoing hostilities, vessels may appear in irregular and imprecise locations.
      </div>
      <div class="overflow-x-auto rounded-xl border border-navy-200 shadow-sm bg-white">
        <table class="w-full text-left min-w-[700px]">
          <thead class="bg-[#0a1929] text-white text-[10px] font-mono uppercase tracking-wider">
            <tr>
              <th class="px-3 py-2.5">Vessel Name</th>
              <th class="px-3 py-2.5 hidden sm:table-cell">Type</th>
              <th class="px-3 py-2.5">Cargo</th>
              <th class="px-3 py-2.5">Status</th>
              <th class="px-3 py-2.5 hidden md:table-cell">Departed</th>
              <th class="px-3 py-2.5 hidden md:table-cell">Destination</th>
              <th class="px-3 py-2.5 hidden lg:table-cell text-right">DWT (mt)</th>
              <th class="px-3 py-2.5 hidden lg:table-cell text-right">Max Cargo (m3)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${unavailable > 0 ? `<p class="text-[10px] text-navy-400 mt-2">${unavailable} vessel(s) with data unavailable. Check MarineTraffic for live data.</p>` : ''}
    </div>`;
  }

  // ---------- Section 5: Vessel Matrix + Product Volumes ----------

  function renderVesselMatrix(vesselMatrix) {
    const region = state.matrixRegion;
    const data = vesselMatrix[region];
    if (!data) return '';

    const matrix = data.matrix || [];
    const gt = data.grandTotal;
    const pv = data.productVolumes || [];

    const rows = matrix.map(cls => {
      const share = gt.total > 0 ? ((cls.total / gt.total) * 100).toFixed(1) : '0.0';
      const mixB = cls.total > 0 ? ((cls.ballast / cls.total) * 100).toFixed(0) : 0;
      const mixL = cls.total > 0 ? ((cls.laden / cls.total) * 100).toFixed(0) : 0;
      return `<tr class="soh-matrix-row border-t border-navy-200 bg-navy-50 hover:bg-sky-50 font-semibold text-xs">
        <td class="px-3 py-2.5 text-sky-800">${cls.label}</td>
        <td class="px-3 py-2.5 text-right font-mono">${cls.ballast}</td>
        <td class="px-3 py-2.5 text-right font-mono">${cls.laden}</td>
        <td class="px-3 py-2.5 text-right font-mono font-bold">${cls.total}</td>
        <td class="px-3 py-2.5 text-right font-mono hidden sm:table-cell">${share}%</td>
        <td class="px-3 py-2.5 hidden md:table-cell"><div class="soh-mix-bar w-24"><div style="width:${mixB}%;background:#0F4C81" class="h-full"></div><div style="width:${mixL}%;background:#8A2D1A" class="h-full"></div></div></td>
      </tr>`;
    }).join('');

    // Product volumes sub-section (grouped by commodity type)
    const pvFiltered = pv.filter(p => p.totalCapacity > 0);
    const pvTotal = pvFiltered.reduce((s, p) => s + p.totalCapacity, 0);
    const pvRows = pvFiltered.map((p, i) => `
      <tr class="border-t border-navy-200 text-xs ${i % 2 ? 'bg-navy-50' : 'bg-white'}">
        <td class="px-3 py-2 font-semibold text-navy-900">${p.commodity}</td>
        <td class="px-3 py-2 text-right font-mono">${p.vesselCount}</td>
        <td class="px-3 py-2 text-right font-mono font-bold">${fmtNum(Math.round(p.totalCapacity))}</td>
        <td class="px-3 py-2 text-navy-500">${p.unit}</td>
        <td class="px-3 py-2 text-right font-mono hidden sm:table-cell">${pvTotal > 0 ? ((p.totalCapacity / pvTotal) * 100).toFixed(1) : 0}%</td>
        <td class="px-3 py-2 hidden md:table-cell text-[10px] text-navy-500">${(p.topProducts || []).map(tp => tp.name + ' (' + tp.count + ')').join(', ')}</td>
      </tr>`).join('');

    return `
    <div class="soh-section mt-6" id="soh-matrix">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
        <h3 class="text-sm font-bold text-navy-900 uppercase tracking-wider">Vessel Breakdown Inside/Outside Hormuz</h3>
        <div class="flex border border-navy-200 rounded-lg overflow-hidden">
          <button onclick="window.__sohSetRegion('inside')" class="px-3 py-1.5 text-xs font-medium ${region === 'inside' ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}">Inside Gulf (${vesselMatrix.inside?.grandTotal?.total || 0})</button>
          <button onclick="window.__sohSetRegion('outside')" class="px-3 py-1.5 text-xs font-medium border-l border-navy-200 ${region === 'outside' ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}">Outside Gulf (${vesselMatrix.outside?.grandTotal?.total || 0})</button>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="bg-white border border-navy-200 rounded-lg p-3"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Total Vessels</div><div class="text-2xl font-extrabold text-navy-900">${gt.total}</div></div>
        <div class="bg-white border border-navy-200 rounded-lg p-3"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500"><span class="inline-block w-2 h-2 rounded-full mr-1" style="background:#0F4C81"></span>Ballast</div><div class="text-2xl font-extrabold text-navy-900">${gt.ballast}</div></div>
        <div class="bg-white border border-navy-200 rounded-lg p-3"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500"><span class="inline-block w-2 h-2 rounded-full mr-1" style="background:#8A2D1A"></span>Laden</div><div class="text-2xl font-extrabold text-navy-900">${gt.laden}</div></div>
      </div>
      <div class="flex flex-col lg:flex-row gap-4 mb-4">
        <div class="lg:w-[65%] bg-white rounded-xl border border-navy-200 p-4"><p class="text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-2">Category Composition</p><div class="h-[300px]"><canvas id="soh-category-chart"></canvas></div></div>
        <div class="lg:w-[35%] bg-white rounded-xl border border-navy-200 p-4"><p class="text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-2">Status Mix</p><div class="h-[300px]"><canvas id="soh-status-donut"></canvas></div></div>
      </div>
      <div class="overflow-x-auto rounded-xl border border-navy-200 shadow-sm bg-white">
        <table class="w-full text-left min-w-[400px]">
          <thead class="bg-navy-900 text-white text-[10px] uppercase tracking-wider">
            <tr><th class="px-3 py-2.5">Class</th><th class="px-3 py-2.5 text-right">Ballast</th><th class="px-3 py-2.5 text-right">Laden</th><th class="px-3 py-2.5 text-right">Total</th><th class="px-3 py-2.5 text-right hidden sm:table-cell">Share</th><th class="px-3 py-2.5 hidden md:table-cell">Mix</th></tr>
          </thead>
          <tbody>${rows}
            <tr class="border-t-2 border-navy-300 bg-navy-100 font-bold text-xs"><td class="px-3 py-2.5 uppercase">Grand Total</td><td class="px-3 py-2.5 text-right font-mono">${gt.ballast}</td><td class="px-3 py-2.5 text-right font-mono">${gt.laden}</td><td class="px-3 py-2.5 text-right font-mono">${gt.total}</td><td class="px-3 py-2.5 text-right hidden sm:table-cell">100.0%</td><td class="px-3 py-2.5 hidden md:table-cell"></td></tr>
          </tbody>
        </table>
      </div>
      ${pvFiltered.length > 0 ? `
      <div class="mt-4">
        <p class="text-[10px] uppercase tracking-wider text-navy-500 font-semibold mb-2">Estimated Laden Cargo by Product (${region === 'inside' ? 'Inside Gulf' : 'Outside Gulf'})</p>
        <div class="overflow-x-auto rounded-xl border border-navy-200 shadow-sm bg-white">
          <table class="w-full text-left">
            <thead class="bg-navy-100 text-[10px] uppercase tracking-wider text-navy-600"><tr><th class="px-3 py-2">Commodity</th><th class="px-3 py-2 text-right">Vessels</th><th class="px-3 py-2 text-right">Est. Capacity</th><th class="px-3 py-2">Unit</th><th class="px-3 py-2 text-right hidden sm:table-cell">Share</th><th class="px-3 py-2 hidden md:table-cell">Top Products</th></tr></thead>
            <tbody>${pvRows}</tbody>
          </table>
        </div>
      </div>` : ''}
    </div>`;
  }

  function initMatrixCharts(vesselMatrix) {
    const data = vesselMatrix[state.matrixRegion];
    if (!data) return;
    const matrix = data.matrix || [];
    const gt = data.grandTotal;

    const catCanvas = document.getElementById('soh-category-chart');
    if (catCanvas) {
      if (categoryChart) categoryChart.destroy();
      categoryChart = new Chart(catCanvas, {
        type: 'bar',
        data: {
          labels: matrix.map(c => c.label),
          datasets: [
            { label: 'Ballast', data: matrix.map(c => c.ballast), backgroundColor: '#0F4C81' },
            { label: 'Laden', data: matrix.map(c => c.laden), backgroundColor: '#8A2D1A' },
          ],
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { font: { size: 10 } } }, datalabels: { display: false } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } }, grid: { color: '#e5e7eb' } }, y: { stacked: true, ticks: { font: { size: 10 } } } } },
      });
    }

    const donutCanvas = document.getElementById('soh-status-donut');
    if (donutCanvas) {
      if (statusDonut) statusDonut.destroy();
      statusDonut = new Chart(donutCanvas, {
        type: 'doughnut',
        data: { labels: ['Ballast', 'Laden'], datasets: [{ data: [gt.ballast, gt.laden], backgroundColor: ['#0F4C81', '#8A2D1A'], borderWidth: 2, borderColor: '#fff' }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 12 }, textAlign: 'center', formatter: (value, ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); if (!value || !total) return ''; return `${value}\n(${(value / total * 100).toFixed(0)}%)`; }, display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0 } } },
      });
    }
  }

  // ---------- Section 6: Breakdowns ----------

  function renderBreakdowns(bp, bv, bd) {
    const tab = state.breakdownTab;
    const bdata = tab === 'product' ? bp : tab === 'vesselType' ? bv : bd;
    const items = (bdata?.data || []).slice(0, 20);
    const rows = items.map((item, i) => `
      <tr class="border-t border-navy-200 text-xs ${i % 2 ? 'bg-navy-50' : 'bg-white'} hover:bg-sky-50">
        <td class="px-3 py-2 font-medium text-navy-800">${item.label}</td><td class="px-3 py-2 text-right font-mono">${item.total}</td><td class="px-3 py-2 text-right font-mono">${item.ballast}</td><td class="px-3 py-2 text-right font-mono">${item.laden}</td>
        <td class="px-3 py-2 hidden sm:table-cell"><div class="soh-mix-bar w-20"><div style="width:${item.total > 0 ? (item.ballast / item.total * 100).toFixed(0) : 0}%;background:#0F4C81" class="h-full"></div><div style="width:${item.total > 0 ? (item.laden / item.total * 100).toFixed(0) : 0}%;background:#8A2D1A" class="h-full"></div></div></td>
      </tr>`).join('');

    return `
    <div class="soh-section mt-6" id="soh-breakdowns">
      <h3 class="text-sm font-bold text-navy-900 uppercase tracking-wider mb-3">Breakdown Analysis</h3>
      <div class="flex gap-1 mb-4">
        <button onclick="window.__sohSetBreakdown('product')" class="px-3 py-1.5 rounded-lg text-xs font-medium ${tab === 'product' ? 'bg-navy-900 text-white' : 'bg-white border border-navy-200 text-navy-600 hover:bg-navy-50'}">By Product</button>
        <button onclick="window.__sohSetBreakdown('vesselType')" class="px-3 py-1.5 rounded-lg text-xs font-medium ${tab === 'vesselType' ? 'bg-navy-900 text-white' : 'bg-white border border-navy-200 text-navy-600 hover:bg-navy-50'}">By Vessel Type</button>
        <button onclick="window.__sohSetBreakdown('destination')" class="px-3 py-1.5 rounded-lg text-xs font-medium ${tab === 'destination' ? 'bg-navy-900 text-white' : 'bg-white border border-navy-200 text-navy-600 hover:bg-navy-50'}">By Destination</button>
      </div>
      <div class="flex flex-col lg:flex-row gap-4">
        <div class="lg:w-[55%] bg-white rounded-xl border border-navy-200 p-4"><div class="h-[300px]"><canvas id="soh-product-chart"></canvas></div></div>
        <div class="lg:w-[45%] overflow-x-auto rounded-xl border border-navy-200 shadow-sm bg-white">
          <table class="w-full text-left"><thead class="bg-navy-100 text-[10px] uppercase tracking-wider text-navy-600"><tr><th class="px-3 py-2">${tab === 'product' ? 'Product' : tab === 'vesselType' ? 'Vessel Type' : 'Destination'}</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2 text-right">Ballast</th><th class="px-3 py-2 text-right">Laden</th><th class="px-3 py-2 hidden sm:table-cell">Mix</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
      </div>
    </div>`;
  }

  function initBreakdownChart(bp, bv, bd) {
    const tab = state.breakdownTab;
    const bdata = tab === 'product' ? bp : tab === 'vesselType' ? bv : bd;
    const items = (bdata?.data || []).slice(0, 12);
    const canvas = document.getElementById('soh-product-chart');
    if (!canvas) return;
    if (productChart) productChart.destroy();
    const colors = ['#0d9488', '#0F4C81', '#8A2D1A', '#9C6B00', '#6366f1', '#ec4899', '#f97316', '#84cc16', '#06b6d4', '#a855f7', '#ef4444', '#64748b'];
    productChart = new Chart(canvas, {
      type: 'doughnut',
      data: { labels: items.map(i => i.label), datasets: [{ data: items.map(i => i.total), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 12 } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 10 }, textAlign: 'center', formatter: (value, ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); if (!value || !total) return ''; return `${value} (${(value / total * 100).toFixed(0)}%)`; }, display: (ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total > 0 && (ctx.dataset.data[ctx.dataIndex] / total) > 0.03; } } } },
    });
  }

  // ---------- Section 7: Transit Vessels ----------

  function renderTransitVessels(transitData) {
    if (!transitData) return '<div class="soh-section mt-6" id="soh-transit"></div>';
    const vessels = transitData.vessels || [];
    const exiting = transitData.exitingCount || 0;
    const entering = transitData.enteringCount || 0;

    function dirBadge(d) {
      if (d === 'exiting') return '<span class="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded">Exiting &rarr;</span>';
      if (d === 'entering') return '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">&larr; Entering</span>';
      return '<span class="bg-navy-100 text-navy-500 text-[10px] font-bold px-2 py-0.5 rounded">Unknown</span>';
    }

    const uaeTotal = (transitData.uaeExiting || 0) + (transitData.uaeEntering || 0);
    const adnocTotal = (transitData.adnocExiting || 0) + (transitData.adnocEntering || 0);

    const rows = vessels.map((v, i) => `
      <tr class="border-t border-navy-200 text-xs ${i % 2 ? 'bg-navy-50' : 'bg-white'} hover:bg-sky-50">
        <td class="px-3 py-2 text-navy-400">${i + 1}</td>
        <td class="px-3 py-2 font-semibold text-navy-800">${v.name || '-'}</td>
        <td class="px-3 py-2">${dirBadge(v.transitDirection)}</td>
        <td class="px-3 py-2 hidden sm:table-cell">${flagBadge(v)}</td>
        <td class="px-3 py-2 hidden sm:table-cell text-navy-600">${v.vesselTypeClass || '-'}</td>
        <td class="px-3 py-2">${cargoBadge(v.state)}</td>
        <td class="px-3 py-2 hidden md:table-cell text-navy-600">${v.product || '-'}</td>
        <td class="px-3 py-2 hidden md:table-cell text-navy-600">${v.destination || '-'}</td>
        <td class="px-3 py-2 hidden lg:table-cell text-right font-mono">${fmtNum(v.deadWeight)}</td>
        <td class="px-3 py-2 text-right font-mono">${v.speed != null ? v.speed.toFixed(1) : '-'}</td>
        <td class="px-3 py-2 hidden lg:table-cell text-right font-mono">${v.course || '-'}°</td>
      </tr>`).join('');

    return `
    <div class="soh-section mt-6" id="soh-transit">
      <h3 class="text-sm font-bold text-navy-900 uppercase tracking-wider mb-3">Vessels In Transit</h3>
      <p class="text-xs text-navy-500 mb-3">Commodity vessels actively transiting the Strait (speed &gt; 3 kn) — Source: Kpler AIS + S&amp;P MINT</p>
      <div class="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
        <div class="bg-white border border-navy-200 rounded-lg p-3 text-center"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Exiting Gulf</div><div class="text-2xl font-extrabold text-red-600">${exiting}</div></div>
        <div class="bg-white border border-navy-200 rounded-lg p-3 text-center"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Entering Gulf</div><div class="text-2xl font-extrabold text-emerald-600">${entering}</div></div>
        <div class="bg-white border border-navy-200 rounded-lg p-3 text-center"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Total Transit</div><div class="text-2xl font-extrabold text-navy-900">${vessels.length}</div></div>
        <div class="bg-white border border-sky-200 rounded-lg p-3 text-center"><div class="text-[10px] font-semibold uppercase tracking-wider text-sky-600">UAE Flagged</div><div class="text-2xl font-extrabold text-sky-700">${uaeTotal}</div></div>
        <div class="bg-white border border-[#0055A5]/30 rounded-lg p-3 text-center"><div class="text-[10px] font-semibold uppercase tracking-wider text-[#0055A5]">ADNOC</div><div class="text-2xl font-extrabold text-[#0055A5]">${adnocTotal}</div></div>
      </div>
      <div class="overflow-x-auto rounded-xl border border-navy-200 shadow-sm bg-white">
        <table class="w-full text-left min-w-[500px]">
          <thead class="bg-navy-100 text-[10px] uppercase tracking-wider text-navy-600">
            <tr><th class="px-3 py-2.5 w-8">#</th><th class="px-3 py-2.5">Name</th><th class="px-3 py-2.5">Direction</th><th class="px-3 py-2.5 hidden sm:table-cell">Flag</th><th class="px-3 py-2.5 hidden sm:table-cell">Type</th><th class="px-3 py-2.5">Cargo</th><th class="px-3 py-2.5 hidden md:table-cell">Product</th><th class="px-3 py-2.5 hidden md:table-cell">Destination</th><th class="px-3 py-2.5 hidden lg:table-cell text-right">DWT</th><th class="px-3 py-2.5 text-right">Speed</th><th class="px-3 py-2.5 hidden lg:table-cell text-right">Course</th></tr>
          </thead><tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ---------- Section 7b: Vessel Transit Log — Unified (crisis + snapshots) ----------

  const isVesselUAE = (v) => (v.flag || v.flagName || '') === 'United Arab Emirates';
  const isVesselADNOC = (v) => { const c = (v.controller || '').toLowerCase(); return c.includes('adnoc') || c.includes('abu dhabi'); };
  function uaeBadge(v) {
    if (isVesselADNOC(v)) return '<span class="bg-[#0055A5]/10 text-[#0055A5] text-[10px] font-bold px-1.5 py-0.5 rounded">ADNOC</span>';
    if (isVesselUAE(v)) return '<span class="bg-sky-100 text-sky-700 text-[10px] font-bold px-1.5 py-0.5 rounded">UAE</span>';
    return '';
  }

  function renderSnapshotTransitLog(tc, dailyHistory, crisisData, imfData) {
    function dirBadge(dir) {
      if (dir === 'exit') return '<span class="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded">Exited Hormuz &rarr;</span>';
      return '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">&larr; Entered Hormuz</span>';
    }

    // Build unified day list from both sources
    const allDays = {};

    // Crisis-transits days (Feb 28 – Mar 31, exits only)
    if (crisisData?.dailyCounts) {
      const crisisVessels = crisisData.vessels || [];
      for (const d of crisisData.dailyCounts) {
        const dayVessels = crisisVessels.filter(v => v.departureDate === d.date).map(v => ({
          name: v.name, imo: v.imo, type: v.vesselTypeClass || '-', commodity: v.product || v.commodity || '-',
          flag: v.flagName || '', state: v.state || '', destination: v.destination || '-',
          deadWeight: v.deadWeight || 0, controller: v.controller || '', dir: 'exit',
        }));
        allDays[d.date] = { date: d.date, exited: d.count || 0, entered: 0, vessels: dayVessels, source: 'crisis' };
      }
    }

    // Snapshot days (Apr 1+, exits & entries)
    for (const d of (dailyHistory || [])) {
      if (!d.exitedVessels && !d.enteredVessels) continue;
      const vessels = [
        ...(d.exitedVessels || []).map(v => ({ ...v, dir: 'exit' })),
        ...(d.enteredVessels || []).map(v => ({ ...v, dir: 'enter' })),
      ];
      allDays[d.date] = { date: d.date, exited: d.exited || 0, entered: d.entered || 0, vessels, source: 'snapshot', omanEntered: d.omanEntered, omanLeft: d.omanLeft };
    }

    const days = Object.values(allDays).sort((a, b) => b.date.localeCompare(a.date));
    if (!days.length) return '';

    // Totals
    const totalExited = days.reduce((s, d) => s + d.exited, 0);
    const totalEntered = days.reduce((s, d) => s + d.entered, 0);

    // Pre-crisis avg from IMF Feb 2026
    const imfRecords = imfData?.records || [];
    const febRecords = imfRecords.filter(r => r.date >= '2026-02-01' && r.date <= '2026-02-27');
    const preCrisisAvg = febRecords.length > 0 ? Math.round(febRecords.reduce((s, r) => s + r.n_total, 0) / febRecords.length) : 96;
    // Post-crisis avg (exits per day)
    const postCrisisAvg = days.length > 0 ? (totalExited / days.length).toFixed(1) : 0;

    const dayAccordions = days.map((d, idx) => {
      const total = d.exited + d.entered;
      const uaeCount = d.vessels.filter(v => isVesselUAE(v)).length;
      const adnocCount = d.vessels.filter(v => isVesselADNOC(v)).length;
      const isOpen = idx === 0;

      const rows = d.vessels.map((v, i) => `
        <tr class="border-t border-navy-100 text-[11px] ${i % 2 ? 'bg-navy-50' : 'bg-white'} hover:bg-sky-50">
          <td class="px-2 py-1.5 font-medium">${v.name || '-'}</td>
          <td class="px-2 py-1.5">${dirBadge(v.dir)}</td>
          <td class="px-2 py-1.5 hidden sm:table-cell">${v.type || '-'}</td>
          <td class="px-2 py-1.5">${cargoBadge(v.state)}</td>
          <td class="px-2 py-1.5 hidden md:table-cell">${v.commodity || '-'}</td>
          <td class="px-2 py-1.5 hidden md:table-cell">${v.flag || '-'} ${uaeBadge(v)}</td>
          <td class="px-2 py-1.5 hidden lg:table-cell">${v.destination || '-'}</td>
          <td class="px-2 py-1.5 hidden lg:table-cell text-right font-mono">${fmtNum(v.deadWeight)}</td>
        </tr>`).join('');

      return `
        <details class="border border-navy-200 rounded-lg" ${isOpen ? 'open' : ''}>
          <summary class="list-none px-4 py-3 bg-navy-50 cursor-pointer hover:bg-navy-100 rounded-lg">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-navy-800">${d.date}</span>
                <span class="text-[10px] text-navy-400">${d.source === 'crisis' ? '(approx)' : ''}</span>
              </div>
              <span class="flex items-center gap-3 text-[10px] font-semibold">
                <span class="text-emerald-600">&uarr;${d.exited} exited</span>
                ${d.entered ? `<span class="text-red-500">&darr;${d.entered} entered</span>` : ''}
                <span class="text-navy-500">${total} total</span>
                ${uaeCount ? `<span class="text-sky-700">UAE: ${uaeCount}</span>` : ''}
                ${adnocCount ? `<span class="text-[#0055A5]">ADNOC: ${adnocCount}</span>` : ''}
              </span>
            </div>
          </summary>
          ${d.vessels.length > 0 ? `
          <div class="overflow-x-auto bg-white">
            <table class="w-full text-left">
              <thead class="bg-navy-100 text-[10px] uppercase tracking-wider text-navy-600">
                <tr><th class="px-2 py-1.5">Name</th><th class="px-2 py-1.5">Direction</th><th class="px-2 py-1.5 hidden sm:table-cell">Type</th><th class="px-2 py-1.5">Cargo</th><th class="px-2 py-1.5 hidden md:table-cell">Commodity</th><th class="px-2 py-1.5 hidden md:table-cell">Flag</th><th class="px-2 py-1.5 hidden lg:table-cell">Dest</th><th class="px-2 py-1.5 hidden lg:table-cell text-right">DWT</th></tr>
              </thead><tbody>${rows}</tbody>
            </table>
          </div>` : '<p class="px-4 py-3 text-xs text-navy-400">No vessel details</p>'}
        </details>`;
    }).join('');

    return `
    <div class="soh-section mt-6" id="soh-snapshot-transit">
      <h3 class="text-sm font-bold text-navy-900 uppercase tracking-wider mb-3">Vessel Transit Log &mdash; Hormuz Crossings</h3>
      <p class="text-xs text-navy-500 mb-3">Vessels crossing the Strait of Hormuz since crisis start (Feb 28). Feb 28&ndash;Mar 31: Kpler lastPortCall (approx exits). Apr 1+: Kpler + MINT midnight snapshots (exits &amp; entries).</p>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="bg-white border border-navy-200 rounded-lg p-3 text-center"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Pre-Crisis Avg</div><div class="text-2xl font-extrabold text-navy-900">~${preCrisisAvg}</div><div class="text-[10px] text-navy-400">vessels/day (IMF Feb)</div></div>
        <div class="bg-white border border-navy-200 rounded-lg p-3 text-center"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Post-Crisis Avg</div><div class="text-2xl font-extrabold text-amber-600">~${postCrisisAvg}</div><div class="text-[10px] text-navy-400">exits/day (${days.length} days)</div></div>
      </div>
      <div class="max-h-[600px] overflow-y-auto flex flex-col gap-2">${dayAccordions}</div>
    </div>
    ${renderOmanZoneLog(days)}`;
  }

  function renderOmanZoneLog(days) {
    // Filter to snapshot days that have Oman activity
    const omanDays = days.filter(d => d.source === 'snapshot');
    if (!omanDays.length) return '';

    const totalArrived = omanDays.reduce((s, d) => s + (d.omanEntered?.length || 0), 0);
    const totalDeparted = omanDays.reduce((s, d) => s + (d.omanLeft?.length || 0), 0);

    function dirBadge(dir) {
      if (dir === 'entered') return '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">&larr; Entered</span>';
      return '<span class="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded">Left &rarr;</span>';
    }

    const dayAccordions = omanDays.map((d, idx) => {
      const entered = (d.omanEntered || []).map(v => ({ ...v, dir: 'entered' }));
      const left = (d.omanLeft || []).map(v => ({ ...v, dir: 'left' }));
      const allVessels = [...entered, ...left];
      const arrivedCount = entered.length;
      const departedCount = left.length;
      const isOpen = idx === 0;

      const rows = allVessels.map((v, i) => `
        <tr class="border-t border-navy-100 text-[11px] ${i % 2 ? 'bg-navy-50' : 'bg-white'} hover:bg-sky-50">
          <td class="px-2 py-1.5 font-medium">${v.name || '-'}</td>
          <td class="px-2 py-1.5">${dirBadge(v.dir)}</td>
          <td class="px-2 py-1.5 hidden sm:table-cell">${v.type || '-'}</td>
          <td class="px-2 py-1.5 hidden md:table-cell">${v.commodity || '-'}</td>
          <td class="px-2 py-1.5 hidden md:table-cell">${v.flag || '-'} ${uaeBadge(v)}</td>
        </tr>`).join('');

      return `
        <details class="border border-navy-200 rounded-lg" ${isOpen ? 'open' : ''}>
          <summary class="list-none px-4 py-3 bg-navy-50 cursor-pointer hover:bg-navy-100 rounded-lg">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-navy-800">${d.date}</span>
              <span class="flex items-center gap-3 text-[10px] font-semibold">
                <span class="text-emerald-600">&larr;${arrivedCount} arrived</span>
                <span class="text-red-500">${departedCount} departed&rarr;</span>
              </span>
            </div>
          </summary>
          ${allVessels.length > 0 ? `
          <div class="overflow-x-auto bg-white">
            <table class="w-full text-left">
              <thead class="bg-navy-100 text-[10px] uppercase tracking-wider text-navy-600">
                <tr><th class="px-2 py-1.5">Name</th><th class="px-2 py-1.5">Direction</th><th class="px-2 py-1.5 hidden sm:table-cell">Type</th><th class="px-2 py-1.5 hidden md:table-cell">Commodity</th><th class="px-2 py-1.5 hidden md:table-cell">Flag</th></tr>
              </thead><tbody>${rows}</tbody>
            </table>
          </div>` : ''}
        </details>`;
    }).join('');

    return `
    <div class="soh-section mt-6" id="soh-oman-transit">
      <h3 class="text-sm font-bold text-navy-900 uppercase tracking-wider mb-3">Gulf of Oman &mdash; Zone Arrivals &amp; Departures</h3>
      <p class="text-xs text-navy-500 mb-3">Vessels entering or leaving the monitoring zone (lat 22-32, lng 46-60) from the open ocean side. Detected via midnight snapshot comparison.</p>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="bg-white border border-navy-200 rounded-lg p-3 text-center"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Arrived in Zone</div><div class="text-2xl font-extrabold text-emerald-600">${totalArrived}</div></div>
        <div class="bg-white border border-navy-200 rounded-lg p-3 text-center"><div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Departed Zone</div><div class="text-2xl font-extrabold text-red-500">${totalDeparted}</div></div>
      </div>
      <div class="max-h-[400px] overflow-y-auto flex flex-col gap-2">${dayAccordions}</div>
    </div>`;
  }

  // ---------- Section 9: Small Vessels Summary ----------

  function renderSmallVesselsSummary(summary) {
    const sv = summary.smallVessels;
    if (!sv) return '';
    return `
    <div class="soh-section mt-6" id="soh-small-vessels">
      <div class="bg-navy-50 border border-navy-200 rounded-xl p-4">
        <h3 class="text-xs font-bold text-navy-500 uppercase tracking-wider mb-2">Small / Coastal Vessels (Excluded from counts above)</h3>
        <div class="flex items-center gap-6 text-sm">
          <div><span class="font-bold text-navy-900">${fmtNum(sv.total)}</span> <span class="text-navy-500">total</span></div>
          <div><span class="font-bold text-navy-900">${fmtNum(sv.inside)}</span> <span class="text-navy-500">inside Gulf</span></div>
          <div><span class="font-bold text-navy-900">${fmtNum(sv.outside)}</span> <span class="text-navy-500">outside Gulf</span></div>
        </div>
        <p class="text-[10px] text-navy-400 mt-2">Types: ${(sv.types || []).join(', ')}</p>
      </div>
    </div>`;
  }

  // ---------- Main Render ----------

  function render(data) {
    const container = document.getElementById('soh-tracker-content');
    if (!container) return;

    // Add "Data as of" badge at top
    const syncDateStr = data.summary && data.summary.syncTimestamp
      ? (typeof formatDateTimeGST === 'function' ? formatDateTimeGST(data.summary.syncTimestamp) : (function(x){const d=new Date(x);d.setMinutes(0,0,0);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'})+' GST'})(data.summary.syncTimestamp))
      : null;
    const badgeHtml = syncDateStr && typeof renderDataAsOfBadge === 'function'
      ? `<div class="flex justify-end mb-3">${renderDataAsOfBadge(syncDateStr, 'ok')}</div>`
      : '';

    container.innerHTML = badgeHtml + [
      renderKPIs(data.summary || {}, data.transitCurrent, data.dailyTransitHistory),
      renderMap(),
      renderFlowCharts(),
      renderADNOCVessels(data.adnocVessels || { vessels: [] }),
      renderVesselMatrix(data.vesselMatrix || {}),
      renderBreakdowns(data.breakdownProduct, data.breakdownVesselType, data.breakdownDest),
      renderTransitVessels(data.transitVessels),
      (() => { try { return renderSnapshotTransitLog(data.transitCurrent, data.dailyTransitHistory, data.crisisTransits, data.imfTransit); } catch(e) { console.error('Transit log render error:', e); return '<div class="text-red-500 p-4">Transit log error: ' + e.message + '</div>'; } })(),
      renderSmallVesselsSummary(data.summary || {}),
    ].join('');

    setTimeout(() => {
      initMap(data.mapPositions || {});
      initFlowCharts(data);
      initMatrixCharts(data.vesselMatrix || {});
      initBreakdownChart(data.breakdownProduct, data.breakdownVesselType, data.breakdownDest);
    }, 50);
  }

  // ---------- Global Handlers ----------

  window.__sohSetRegion = function (region) {
    state.matrixRegion = region;
    if (state.data.vesselMatrix) {
      const el = document.getElementById('soh-matrix');
      if (el) { el.outerHTML = renderVesselMatrix(state.data.vesselMatrix); setTimeout(() => initMatrixCharts(state.data.vesselMatrix), 50); }
    }
  };

  window.__sohSetBreakdown = function (tab) {
    state.breakdownTab = tab;
    const d = state.data;
    const el = document.getElementById('soh-breakdowns');
    if (el) { el.outerHTML = renderBreakdowns(d.breakdownProduct, d.breakdownVesselType, d.breakdownDest); setTimeout(() => initBreakdownChart(d.breakdownProduct, d.breakdownVesselType, d.breakdownDest), 50); }
  };

  // ---------- Event Delegation for Flow Controls ----------

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-soh-control]');
    if (!btn) return;
    const key = btn.dataset.sohControl;
    const val = btn.dataset.value;
    if (key === 'flowView') state.flowView = val;
    else if (key === 'flowRange') state.flowRange = val;
    else if (key === 'flowCommodity') state.flowCommodity = val;
    else return;
    // Re-render flow section
    const el = document.getElementById('soh-flows');
    if (el) { el.outerHTML = renderFlowCharts(); setTimeout(() => initFlowCharts(state.data), 50); }
  });

  // ---------- Init ----------

  function initSOH() {
    if (state.loaded) return;
    state.loaded = true;
    const container = document.getElementById('soh-tracker-content');
    if (!container) return;
    container.innerHTML = '<div class="text-center py-20"><div class="animate-spin inline-block w-8 h-8 border-4 border-navy-200 border-t-amber-500 rounded-full"></div><p class="text-sm text-navy-500 mt-3">Loading SOH Tracker data from Kpler...</p></div>';
    loadAllData().then(data => { state.data = data; render(data); }).catch(err => {
      container.innerHTML = `<div class="text-center py-20 text-red-600"><p class="font-bold">Failed to load SOH data</p><p class="text-sm mt-2">${err.message}</p><p class="text-xs mt-2 text-navy-500">Run: node scripts/process-soh.js</p></div>`;
    });
  }

  const observer = new MutationObserver(() => {
    const panel = document.querySelector('[data-panel="soh-tracker"]');
    if (panel && !panel.classList.contains('hidden')) initSOH();
  });

  window.__sohExportXlsx = exportVesselsXlsx;

  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.querySelector('[data-panel="soh-tracker"]');
    if (panel) {
      observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
      if (!panel.classList.contains('hidden')) initSOH();
    }
  });
})();
