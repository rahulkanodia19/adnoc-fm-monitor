// ADNOC Vessels — Fleet tracking dashboard for ADNOC L&S owned/chartered vessels
// Data: soh-data/adnoc-fleet-data.json (from scripts/sync-adnoc-fleet.js)
(function () {
  'use strict';

  const DATA_FILE = 'soh-data/adnoc-fleet-data.json';
  const CHARTERED_FILE = 'soh-data/adnoc-chartered-data.json';

  const state = {
    loaded: false,
    data: null,
    charteredData: null,
    sortCol: 'name',
    sortAsc: true,
    filter: '',
    areaFilter: 'all',
    statusFilter: 'all',
    boundFilter: 'all',
    // Chartered table state
    cSortCol: 'nearPort',
    cSortAsc: true,
    cFilter: '',
    cPortFilter: 'all',
  };

  // ---------- Data Loading ----------

  async function loadData() {
    const resp = await fetch(DATA_FILE);
    if (!resp.ok) throw new Error(`Failed to load ${DATA_FILE}: ${resp.status}`);
    return resp.json();
  }

  // ---------- Helpers ----------

  function esc(s) { return s == null ? '-' : String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtNum(n) { return n == null ? '-' : n.toLocaleString('en-US'); }

  function fmtDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function statusBadge(status) {
    const colors = {
      'Under Way': 'bg-emerald-100 text-emerald-800',
      'Anchored': 'bg-amber-100 text-amber-800',
      'Moored': 'bg-sky-100 text-sky-800',
      'Unknown': 'bg-navy-100 text-navy-500',
    };
    const cls = colors[status] || colors['Unknown'];
    return `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}">${esc(status)}</span>`;
  }

  function boundBadge(bound) {
    const colors = {
      'Inbound': 'bg-blue-100 text-blue-800',
      'Outbound': 'bg-orange-100 text-orange-800',
      'Unknown': 'bg-navy-100 text-navy-500',
    };
    const icons = {
      'Inbound': '&#8592;',
      'Outbound': '&#8594;',
      'Unknown': '-',
    };
    const cls = colors[bound] || colors['Unknown'];
    const icon = icons[bound] || '';
    return `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}">${icon} ${esc(bound)}</span>`;
  }

  function aoiBadge(isAOI) {
    if (isAOI) return '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">Yes</span>';
    return '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-navy-100 text-navy-500">No</span>';
  }

  function areaBadge(area) {
    const colors = {
      'Strait of Hormuz': 'bg-red-100 text-red-800',
      'Gulf of Oman': 'bg-cyan-100 text-cyan-800',
      'Red Sea': 'bg-orange-100 text-orange-800',
      'Arabian Sea': 'bg-indigo-100 text-indigo-800',
      'Other': 'bg-slate-100 text-slate-600',
      'Unknown': 'bg-navy-100 text-navy-500',
    };
    const cls = colors[area] || colors['Unknown'];
    return `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}">${esc(area)}</span>`;
  }

  // ---------- Sorting ----------

  function sortVessels(vessels) {
    const col = state.sortCol;
    const asc = state.sortAsc ? 1 : -1;
    return [...vessels].sort((a, b) => {
      // Unavailable always at bottom
      if (a.dataSource === 'unavailable' && b.dataSource !== 'unavailable') return 1;
      if (a.dataSource !== 'unavailable' && b.dataSource === 'unavailable') return -1;

      let va = a[col], vb = b[col];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * asc;
      if (typeof va === 'boolean' && typeof vb === 'boolean') return (va === vb ? 0 : va ? -1 : 1) * asc;
      return String(va).localeCompare(String(vb)) * asc;
    });
  }

  // ---------- Filtering ----------

  function filterVessels(vessels) {
    let filtered = vessels;
    if (state.filter) {
      const q = state.filter.toLowerCase();
      filtered = filtered.filter(v =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.imo || '').toLowerCase().includes(q) ||
        (v.mmsi || '').toLowerCase().includes(q) ||
        (v.vesselType || '').toLowerCase().includes(q) ||
        (v.destinationPort || '').toLowerCase().includes(q) ||
        (v.currentLocation || '').toLowerCase().includes(q) ||
        (v.company || '').toLowerCase().includes(q)
      );
    }
    if (state.areaFilter === 'aoi') {
      filtered = filtered.filter(v => v.areaOfInterest);
    } else if (state.areaFilter !== 'all') {
      filtered = filtered.filter(v => v.area === state.areaFilter);
    }
    if (state.statusFilter !== 'all') {
      filtered = filtered.filter(v => v.currentStatus === state.statusFilter);
    }
    if (state.boundFilter !== 'all') {
      filtered = filtered.filter(v => v.bound === state.boundFilter);
    }
    return filtered;
  }

  // ---------- Excel Export ----------

  function exportToExcel(vessels) {
    if (typeof XLSX === 'undefined') {
      alert('XLSX library not loaded');
      return;
    }
    const rows = vessels.map(v => ({
      'Company': v.company || '-',
      'Vessel Name': v.name || '-',
      'IMO': v.imo || '-',
      'MMSI': v.mmsi || '-',
      'Location': v.currentLocation || '-',
      'Area': v.area || '-',
      'Bound': v.bound || '-',
      'Status': v.currentStatus || '-',
      'State': v.state || '-',
      'Bound': v.bound || '-',
      'Last Port': v.lastPort || '-',
      'Destination Port': v.destinationPort || '-',
      'Destination Country': v.destinationCountry || '-',
      'Flag': v.flagName || '-',
      'Ownership': v.ownership || '-',
      'Vessel Type': v.vesselType || '-',
      'Cargo Type': v.cargoType || '-',
      'Departure Port': v.departurePort || '-',
      'Departure Country': v.departureCountry || '-',
      'Voyage ETD': v.voyageETD || '-',
      'ETA': v.eta || '-',
      'Area of Interest': v.areaOfInterest ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ADNOC Fleet');
    XLSX.writeFile(wb, `ADNOC_Fleet_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  // ---------- Render ----------

  function render() {
    const container = document.getElementById('adnoc-vessels-content');
    if (!container) return;

    const data = state.data;
    if (!data || !data.vessels) {
      container.innerHTML = '<div class="text-center py-20 text-navy-400">No data available. Run sync-adnoc-fleet.js to fetch vessel data.</div>';
      return;
    }

    const allVessels = data.vessels;
    const filtered = filterVessels(allVessels);
    const sorted = sortVessels(filtered);
    const summary = data.summary || {};
    const areas = summary.areas || {};

    const sortIcon = (col) => {
      if (state.sortCol !== col) return '<span class="text-navy-400 ml-0.5">&#8597;</span>';
      return state.sortAsc
        ? '<span class="text-amber-400 ml-0.5">&#9650;</span>'
        : '<span class="text-amber-400 ml-0.5">&#9660;</span>';
    };

    const thClass = 'px-2 py-2 cursor-pointer hover:bg-navy-800 select-none whitespace-nowrap';

    const columns = [
      { key: 'name', label: 'Vessel Name', hide: '' },
      { key: 'imo', label: 'IMO', hide: 'hidden md:table-cell' },
      { key: 'currentLocation', label: 'Location', hide: 'hidden md:table-cell' },
      { key: 'area', label: 'Area', hide: '' },
      { key: 'currentStatus', label: 'Status', hide: '' },
      { key: 'state', label: 'State', hide: 'hidden md:table-cell' },
      { key: 'bound', label: 'Bound', hide: '' },
      { key: 'destinationPort', label: 'Dest. Port', hide: 'hidden lg:table-cell' },
      { key: 'destinationCountry', label: 'Dest. Country', hide: 'hidden xl:table-cell' },
      { key: 'departurePort', label: 'Dep. Port', hide: 'hidden lg:table-cell' },
      { key: 'vesselType', label: 'Vessel Type', hide: 'hidden lg:table-cell' },
      { key: 'cargoType', label: 'Cargo', hide: 'hidden lg:table-cell' },
      { key: 'eta', label: 'ETA', hide: 'hidden xl:table-cell' },
      { key: 'voyageETD', label: 'ETD', hide: 'hidden xl:table-cell' },
    ];

    const theadCells = columns.map(c =>
      `<th class="${thClass} ${c.hide}" data-sort="${c.key}">${c.label} ${sortIcon(c.key)}</th>`
    ).join('');

    const rows = sorted.map(v => {
      if (v.dataSource === 'unavailable') {
        return `<tr class="border-t border-navy-200 bg-navy-50 text-xs">
          <td class="px-2 py-2 font-semibold"><a href="${v.marineTrafficUrl}" target="_blank" rel="noreferrer" class="text-sky-700 hover:underline">${esc(v.name)} &#8599;</a></td>
          <td class="px-2 py-2 font-mono ${columns[1].hide}">${esc(v.imo)}</td>
          <td colspan="${columns.length - 2}" class="px-2 py-2 text-navy-400 italic">Data unavailable — not found in Kpler/MINT</td>
        </tr>`;
      }
      const cells = columns.map(c => {
        let val;
        switch (c.key) {
          case 'name':
            val = `<a href="${v.marineTrafficUrl}" target="_blank" rel="noreferrer" class="text-sky-700 hover:underline font-mono">${esc(v.name).toUpperCase()} &#8599;</a>`;
            break;
          case 'state':
            val = v.state === 'loaded'
              ? '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">Loaded</span>'
              : '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">Ballast</span>';
            break;
          case 'currentStatus':
            val = statusBadge(v.currentStatus);
            break;
          case 'bound':
            val = boundBadge(v.bound);
            break;
          case 'areaOfInterest':
            val = aoiBadge(v.areaOfInterest);
            break;
          case 'area':
            val = areaBadge(v.area);
            break;
          case 'voyageETD':
          case 'eta':
            val = fmtDate(v[c.key]);
            break;
          case 'deadWeight':
          case 'capacity':
            val = fmtNum(v[c.key]);
            break;
          default:
            val = esc(v[c.key]);
        }
        return `<td class="px-2 py-2 ${c.hide}">${val}</td>`;
      }).join('');
      return `<tr class="border-t border-navy-200 hover:bg-navy-50 text-xs">${cells}</tr>`;
    }).join('');

    // Area filter options
    const areaOptions = ['all', 'aoi', ...Object.keys(areas).sort()];
    const areaSelect = areaOptions.map(a =>
      `<option value="${a}" ${state.areaFilter === a ? 'selected' : ''}>${a === 'all' ? 'All Areas' : a === 'aoi' ? 'Area of Interest' : a}</option>`
    ).join('');

    // Status filter options
    const statusOptions = ['all', 'Under Way', 'Anchored', 'Moored', 'Unknown'];
    const statusSelect = statusOptions.map(s =>
      `<option value="${s}" ${state.statusFilter === s ? 'selected' : ''}>${s === 'all' ? 'All Status' : s}</option>`
    ).join('');

    // Bound filter options
    const boundOptions = ['all', 'Inbound', 'Outbound'];
    const boundSelect = boundOptions.map(b =>
      `<option value="${b}" ${state.boundFilter === b ? 'selected' : ''}>${b === 'all' ? 'All Bound' : b}</option>`
    ).join('');

    // Data as of badge (same pattern as soh-tracker)
    const syncDateStr = data.syncTimestamp
      ? (typeof formatDateTimeGST === 'function' ? formatDateTimeGST(data.syncTimestamp) : (function(x){const d=new Date(x);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'})+' GST'})(data.syncTimestamp))
      : null;
    const dataAsOfBadge = syncDateStr && typeof renderDataAsOfBadge === 'function'
      ? renderDataAsOfBadge(syncDateStr, 'ok')
      : '';

    container.innerHTML = `
    <div class="mb-4">
      <div class="flex justify-end mb-3">${dataAsOfBadge}</div>
      <div class="flex items-center gap-3 mb-3">
        <p class="text-[10px] text-navy-500 italic">ADNOC L&S Fleet Vessel Tracking — Live Kpler + MINT data</p>
      </div>
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 class="text-xl font-extrabold text-[#0055A5] flex items-center gap-2">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 17h2l.5-1.5L7 11l1.5 6H18l2-4h1"/></svg>
          ADNOC Fleet Tracker
        </h3>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <div class="bg-white border border-navy-200 rounded-lg p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Total Vessels</div>
          <div class="text-2xl font-extrabold text-navy-900">${summary.total || 0}</div>
        </div>
        <div class="bg-white border border-navy-200 rounded-lg p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Area of Interest</div>
          <div class="text-2xl font-extrabold text-navy-900">${summary.inAreaOfInterest || 0}</div>
        </div>
        <div class="bg-white border border-navy-200 rounded-lg p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-red-600"><span class="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>SOH</div>
          <div class="text-2xl font-extrabold text-navy-900">${areas['Strait of Hormuz'] || 0}</div>
        </div>
        <div class="bg-white border border-navy-200 rounded-lg p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-cyan-600"><span class="inline-block w-2 h-2 rounded-full bg-cyan-500 mr-1"></span>Gulf of Oman</div>
          <div class="text-2xl font-extrabold text-navy-900">${areas['Gulf of Oman'] || 0}</div>
        </div>
        <div class="bg-white border border-navy-200 rounded-lg p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-orange-600"><span class="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1"></span>Red Sea</div>
          <div class="text-2xl font-extrabold text-navy-900">${areas['Red Sea'] || 0}</div>
        </div>
        <div class="bg-white border border-navy-200 rounded-lg p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-indigo-600"><span class="inline-block w-2 h-2 rounded-full bg-indigo-500 mr-1"></span>Arabian Sea</div>
          <div class="text-2xl font-extrabold text-navy-900">${areas['Arabian Sea'] || 0}</div>
        </div>
      </div>

      <!-- AIS Disclaimer -->
      <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4 text-xs text-amber-800">
        <span class="font-bold uppercase tracking-wider text-[10px]">Live Vessel Tracking Disclaimer</span><br>
        AIS/GPS location services within the Mideast Gulf are subject to interference due to the ongoing hostilities, vessels may appear in irregular and imprecise locations.
      </div>

      <!-- Controls -->
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <input type="text" id="adnoc-fleet-search" placeholder="Search vessel, IMO, port..."
          class="px-3 py-1.5 text-xs border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 w-48"
          value="${state.filter.replace(/"/g, '&quot;')}">
        <div class="flex items-center gap-1" id="adnoc-fleet-area-chips">
          ${areaOptions.map(a => {
            const label = a === 'all' ? 'All' : a === 'aoi' ? 'AOI' : a;
            const active = state.areaFilter === a;
            return `<button data-area="${a}" class="px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-colors ${active ? 'bg-[#0055A5] text-white border-[#0055A5]' : 'bg-white text-navy-600 border-navy-300 hover:border-navy-400'}">${label}</button>`;
          }).join('')}
        </div>
        <span class="text-navy-300">|</span>
        <div class="flex items-center gap-1" id="adnoc-fleet-bound-chips">
          ${boundOptions.map(b => {
            const label = b === 'all' ? 'All' : b;
            const active = state.boundFilter === b;
            return `<button data-bound="${b}" class="px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-colors ${active ? 'bg-[#0055A5] text-white border-[#0055A5]' : 'bg-white text-navy-600 border-navy-300 hover:border-navy-400'}">${label}</button>`;
          }).join('')}
        </div>
        <button id="adnoc-fleet-export" class="px-3 py-1.5 text-xs font-semibold bg-[#0055A5] text-white rounded-lg hover:bg-[#004080] transition-colors ml-auto">
          Export Excel
        </button>
        <span class="text-[10px] text-navy-400">${sorted.length} of ${allVessels.length} vessels</span>
      </div>

      <!-- Table -->
      <div class="overflow-x-auto rounded-xl border border-navy-200 shadow-sm bg-white">
        <table class="w-full text-left" id="adnoc-fleet-table">
          <thead class="bg-[#0a1929] text-white text-[10px] font-mono uppercase tracking-wider">
            <tr>${theadCells}</tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="20" class="px-4 py-8 text-center text-navy-400">No vessels match your filters</td></tr>'}</tbody>
        </table>
      </div>
      ${data.unmatched > 0 ? `<p class="text-[10px] text-navy-400 mt-2">${data.unmatched} vessel(s) not found in Kpler zone response — may be outside Gulf region.</p>` : ''}
    </div>
    ${renderCharteredTable()}`;

    // Bind event listeners
    bindEvents(sorted);
    bindCharteredEvents();
  }

  // ---------- Chartered / FOB Table ----------

  function renderCharteredTable() {
    const cd = state.charteredData;
    if (!cd || !cd.vessels || cd.vessels.length === 0) return '';

    const allC = cd.vessels;
    let filtered = allC;
    if (state.cFilter) {
      const q = state.cFilter.toLowerCase();
      filtered = filtered.filter(v =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.imo || '').toLowerCase().includes(q) ||
        (v.nearPort || '').toLowerCase().includes(q) ||
        (v.vesselType || '').toLowerCase().includes(q) ||
        (v.destinationPort || '').toLowerCase().includes(q)
      );
    }
    if (state.cPortFilter !== 'all') {
      filtered = filtered.filter(v => v.nearPort === state.cPortFilter);
    }

    // Sort
    const col = state.cSortCol;
    const asc = state.cSortAsc ? 1 : -1;
    filtered.sort((a, b) => {
      let va = a[col], vb = b[col];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * asc;
      return String(va).localeCompare(String(vb)) * asc;
    });

    const summary = cd.summary || {};
    const byPort = summary.byPort || {};

    const cSortIcon = (c) => {
      if (state.cSortCol !== c) return '<span class="text-navy-400 ml-0.5">&#8597;</span>';
      return state.cSortAsc ? '<span class="text-amber-400 ml-0.5">&#9650;</span>' : '<span class="text-amber-400 ml-0.5">&#9660;</span>';
    };

    const thCls = 'px-2 py-2 cursor-pointer hover:bg-navy-800 select-none whitespace-nowrap';

    const cCols = [
      { key: 'nearPort', label: 'Port' },
      { key: 'name', label: 'Vessel Name' },
      { key: 'imo', label: 'IMO' },
      { key: 'vesselType', label: 'Type' },
      { key: 'cargoType', label: 'Cargo' },
      { key: 'state', label: 'State' },
      { key: 'currentStatus', label: 'Status' },
      { key: 'bound', label: 'Bound' },
      { key: 'destinationPort', label: 'Dest. Port' },
      { key: 'company', label: 'Controller' },
      { key: 'flagName', label: 'Flag' },
      { key: 'eta', label: 'ETA' },
    ];

    const cHead = cCols.map(c =>
      `<th class="${thCls}" data-csort="${c.key}">${c.label} ${cSortIcon(c.key)}</th>`
    ).join('');

    const cRows = filtered.map(v => {
      const cells = cCols.map(c => {
        let val;
        switch (c.key) {
          case 'name':
            val = `<a href="${v.marineTrafficUrl}" target="_blank" rel="noreferrer" class="text-sky-700 hover:underline font-mono">${esc(v.name).toUpperCase()} &#8599;</a>`;
            break;
          case 'currentStatus':
            val = statusBadge(v.currentStatus);
            break;
          case 'bound':
            val = boundBadge(v.bound);
            break;
          case 'state':
            val = v.state === 'loaded'
              ? '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">Loaded</span>'
              : '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">Ballast</span>';
            break;
          case 'eta':
            val = fmtDate(v[c.key]);
            break;
          default:
            val = esc(v[c.key]);
        }
        return `<td class="px-2 py-2">${val}</td>`;
      }).join('');
      return `<tr class="border-t border-navy-200 hover:bg-navy-50 text-xs">${cells}</tr>`;
    }).join('');

    // Port chip filters
    const portOptions = ['all', ...Object.keys(byPort).sort()];
    const portChips = portOptions.map(p => {
      const label = p === 'all' ? `All (${allC.length})` : `${p} (${byPort[p] || 0})`;
      const active = state.cPortFilter === p;
      return `<button data-cport="${p}" class="px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-colors ${active ? 'bg-[#0055A5] text-white border-[#0055A5]' : 'bg-white text-navy-600 border-navy-300 hover:border-navy-400'}">${label}</button>`;
    }).join('');

    return `
    <div class="mt-8 mb-4">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 class="text-xl font-extrabold text-[#0055A5] flex items-center gap-2">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H21"/></svg>
          Chartered / FOB Vessels at ADNOC Ports
        </h3>
        <span class="text-[10px] text-navy-400">${filtered.length} of ${allC.length} vessels</span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div class="bg-white border border-navy-200 rounded-lg p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Total at ADNOC Ports</div>
          <div class="text-2xl font-extrabold text-navy-900">${summary.total || 0}</div>
        </div>
        <div class="bg-white border border-navy-200 rounded-lg p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Loaded</div>
          <div class="text-2xl font-extrabold text-navy-900">${summary.loaded || 0}</div>
        </div>
        <div class="bg-white border border-navy-200 rounded-lg p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Ballast</div>
          <div class="text-2xl font-extrabold text-navy-900">${summary.ballast || 0}</div>
        </div>
        <div class="bg-white border border-navy-200 rounded-lg p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-navy-500">Ports Active</div>
          <div class="text-2xl font-extrabold text-navy-900">${Object.keys(byPort).length}</div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-3">
        <input type="text" id="adnoc-chartered-search" placeholder="Search vessel, IMO, port..."
          class="px-3 py-1.5 text-xs border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 w-48"
          value="${state.cFilter.replace(/"/g, '&quot;')}">
        <div class="flex items-center gap-1" id="adnoc-chartered-port-chips">
          ${portChips}
        </div>
        <button id="adnoc-chartered-export" class="px-3 py-1.5 text-xs font-semibold bg-[#0055A5] text-white rounded-lg hover:bg-[#004080] transition-colors ml-auto">
          Export Excel
        </button>
      </div>

      <div class="overflow-x-auto rounded-xl border border-navy-200 shadow-sm bg-white">
        <table class="w-full text-left" id="adnoc-chartered-table">
          <thead class="bg-[#0a1929] text-white text-[10px] font-mono uppercase tracking-wider">
            <tr>${cHead}</tr>
          </thead>
          <tbody>${cRows || '<tr><td colspan="12" class="px-4 py-8 text-center text-navy-400">No vessels at ADNOC ports</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  }

  function bindEvents(currentVessels) {
    // Search
    const searchInput = document.getElementById('adnoc-fleet-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.filter = e.target.value;
        render();
        // Re-focus input after re-render
        const el = document.getElementById('adnoc-fleet-search');
        if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
      });
    }

    // Area chip selectors
    const areaChips = document.getElementById('adnoc-fleet-area-chips');
    if (areaChips) {
      areaChips.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || !btn.dataset.area) return;
        state.areaFilter = btn.dataset.area;
        render();
      });
    }

    // Bound chip selectors
    const boundChips = document.getElementById('adnoc-fleet-bound-chips');
    if (boundChips) {
      boundChips.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || !btn.dataset.bound) return;
        state.boundFilter = btn.dataset.bound;
        render();
      });
    }

    // Column sorting
    const table = document.getElementById('adnoc-fleet-table');
    if (table) {
      table.querySelector('thead').addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (!th || !th.dataset.sort) return;
        const col = th.dataset.sort;
        if (state.sortCol === col) {
          state.sortAsc = !state.sortAsc;
        } else {
          state.sortCol = col;
          state.sortAsc = true;
        }
        render();
      });
    }

    // Excel export
    const exportBtn = document.getElementById('adnoc-fleet-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => exportToExcel(currentVessels));
    }
  }

  function bindCharteredEvents() {
    const search = document.getElementById('adnoc-chartered-search');
    if (search) {
      search.addEventListener('input', (e) => {
        state.cFilter = e.target.value;
        render();
        const el = document.getElementById('adnoc-chartered-search');
        if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
      });
    }
    const portChips = document.getElementById('adnoc-chartered-port-chips');
    if (portChips) {
      portChips.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || !btn.dataset.cport) return;
        state.cPortFilter = btn.dataset.cport;
        render();
      });
    }
    const table = document.getElementById('adnoc-chartered-table');
    if (table) {
      table.querySelector('thead').addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (!th || !th.dataset.csort) return;
        const col = th.dataset.csort;
        if (state.cSortCol === col) state.cSortAsc = !state.cSortAsc;
        else { state.cSortCol = col; state.cSortAsc = true; }
        render();
      });
    }
    const exportBtn = document.getElementById('adnoc-chartered-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (typeof XLSX === 'undefined') { alert('XLSX not loaded'); return; }
        const cd = state.charteredData;
        if (!cd) return;
        const rows = cd.vessels.map(v => ({
          'Port': v.nearPort || '-', 'Vessel Name': v.name || '-', 'IMO': v.imo || '-',
          'MMSI': v.mmsi || '-', 'Type': v.vesselType || '-', 'Cargo': v.cargoType || '-',
          'State': v.state || '-', 'Status': v.currentStatus || '-', 'Bound': v.bound || '-',
          'Location': v.currentLocation || '-', 'Area': v.area || '-',
          'Dest. Port': v.destinationPort || '-', 'Dest. Country': v.destinationCountry || '-',
          'Controller': v.company || '-', 'Flag': v.flagName || '-',
          'ETA': v.eta || '-', 'ETD': v.voyageETD || '-',
          'DWT': v.deadWeight || '-', 'Speed': v.speed || '-',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Chartered FOB');
        XLSX.writeFile(wb, `ADNOC_Chartered_FOB_${new Date().toISOString().split('T')[0]}.xlsx`);
      });
    }
  }

  // ---------- Initialization ----------

  function initTab() {
    const container = document.getElementById('adnoc-vessels-content');
    if (!container) return;

    if (state.loaded && state.data) {
      render();
      return;
    }

    container.innerHTML = `
      <div class="text-center py-20">
        <div class="inline-block w-8 h-8 border-4 border-navy-200 border-t-amber-500 rounded-full animate-spin mb-3"></div>
        <p class="text-sm text-navy-500">Loading ADNOC fleet data...</p>
      </div>`;

    Promise.all([
      loadData(),
      fetch(CHARTERED_FILE).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([data, charteredData]) => {
        state.data = data;
        state.charteredData = charteredData;
        state.loaded = true;
        render();
      })
      .catch(err => {
        container.innerHTML = `
          <div class="text-center py-20">
            <p class="text-sm text-red-600 mb-2">Failed to load fleet data</p>
            <p class="text-xs text-navy-400">${esc(err.message)}</p>
            <p class="text-xs text-navy-400 mt-2">Run: <code class="bg-navy-100 px-1 py-0.5 rounded">node scripts/sync-adnoc-fleet.js</code></p>
          </div>`;
      });
  }

  // MutationObserver for tab visibility
  function setup() {
    const panel = document.querySelector('[data-panel="adnoc-vessels"]');
    if (!panel) return;

    const observer = new MutationObserver(() => {
      if (!panel.classList.contains('hidden')) {
        initTab();
      }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });

    if (!panel.classList.contains('hidden')) {
      initTab();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
