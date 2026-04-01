// ============================================================
// port-data.js -- Key GCC Ports & Country Map Centers
// Companion to data.js for Production Overview map + table
// ============================================================

const COUNTRY_CENTERS = {
  "Qatar":        { lat: 25.30, lng: 51.18 },
  "Kuwait":       { lat: 29.38, lng: 47.49 },
  "Saudi Arabia": { lat: 24.71, lng: 46.68 },
  "UAE":          { lat: 24.00, lng: 54.00 },
  "Iraq":         { lat: 33.22, lng: 43.68 },
  "Iran":         { lat: 32.43, lng: 53.69 },
  "Bahrain":      { lat: 26.07, lng: 50.55 },
  "Israel":       { lat: 31.05, lng: 34.85 },
  "Oman":         { lat: 21.47, lng: 55.98 },
};

const GCC_KEY_PORTS = [
  {
    name: "Ras Tanura",
    country: "Saudi Arabia",
    flag: "\u{1F1F8}\u{1F1E6}",
    lat: 26.64, lng: 50.16,
    type: "crude",
    capacity: "6.5 mb/d",
    throughput: "~2.1 mb/d",
    utilizationPct: 32,
    status: "restricted",
    notes: "Drone debris damage on 2 Mar; operating at reduced capacity. Storage nearing limits."
  },
  {
    name: "Ju'aymah",
    country: "Saudi Arabia",
    flag: "\u{1F1F8}\u{1F1E6}",
    lat: 26.82, lng: 49.87,
    type: "crude",
    capacity: "3.0 mb/d",
    throughput: "~0.8 mb/d",
    utilizationPct: 27,
    status: "restricted",
    notes: "Offshore loading curtailed due to field shut-ins (Safaniya, Zuluf). Limited tanker arrivals."
  },
  {
    name: "Yanbu",
    country: "Saudi Arabia",
    flag: "\u{1F1F8}\u{1F1E6}",
    lat: 24.09, lng: 38.06,
    type: "crude",
    capacity: "~4.5 mb/d",
    throughput: "~4.4 mb/d",
    utilizationPct: 98,
    status: "operational",
    notes: "Red Sea terminal (North + South) — unaffected by Hormuz closure. Record throughput via East-West Pipeline; 40+ VLCCs queued. Port bottleneck constraining Petroline's 7M bpd capacity."
  },
  {
    name: "Mina Al Ahmadi",
    country: "Kuwait",
    flag: "\u{1F1F0}\u{1F1FC}",
    lat: 29.076, lng: 48.083,
    type: "crude",
    capacity: "2.4 mb/d",
    throughput: "~0.3 mb/d",
    utilizationPct: 13,
    status: "force-majeure",
    notes: "Force majeure declared on crude exports. Greater Burgan shut-in limits available crude."
  },
  {
    name: "Ras Laffan",
    country: "Qatar",
    flag: "\u{1F1F6}\u{1F1E6}",
    lat: 25.92, lng: 51.61,
    type: "lng",
    capacity: "77 Mtpa LNG",
    throughput: "~0 Mtpa",
    utilizationPct: 0,
    status: "damaged",
    notes: "Iran missile strikes on 18 Mar — extensive damage. All LNG trains shut. 7+ days minimum to reinstate."
  },
  {
    name: "Mesaieed",
    country: "Qatar",
    flag: "\u{1F1F6}\u{1F1E6}",
    lat: 24.99, lng: 51.55,
    type: "refined",
    capacity: "0.3 mb/d",
    throughput: "~0.05 mb/d",
    utilizationPct: 17,
    status: "force-majeure",
    notes: "Refinery at minimum. Condensate exports halted due to Hormuz closure."
  },
  {
    name: "Fujairah",
    country: "UAE",
    flag: "\u{1F1E6}\u{1F1EA}",
    lat: 25.13, lng: 56.33,
    type: "multi",
    capacity: "1.2 mb/d storage",
    throughput: "~0.6 mb/d",
    utilizationPct: 50,
    status: "restricted",
    notes: "Drone debris on 14 Mar; localized fire. Partially suspended. Key bunkering hub outside Hormuz."
  },
  {
    name: "Jebel Dhanna / Ruwais",
    country: "UAE",
    flag: "\u{1F1E6}\u{1F1EA}",
    lat: 24.18, lng: 52.62,
    type: "crude",
    capacity: "1.8 mb/d",
    throughput: "~0.5 mb/d",
    utilizationPct: 28,
    status: "restricted",
    notes: "Ruwais refinery attack disrupted feedstock. Crude loadings curtailed."
  },
  {
    name: "Das Island",
    country: "UAE",
    flag: "\u{1F1E6}\u{1F1EA}",
    lat: 25.14, lng: 52.88,
    type: "crude",
    capacity: "0.8 mb/d",
    throughput: "~0.3 mb/d",
    utilizationPct: 38,
    status: "restricted",
    notes: "Offshore storage constraints. Upper/Lower Zakum partial shut-ins limit export volumes."
  },
  {
    name: "Mina Saud / Shuaiba",
    country: "Kuwait",
    flag: "\u{1F1F0}\u{1F1FC}",
    lat: 29.03, lng: 48.17,
    type: "refined",
    capacity: "0.6 mb/d",
    throughput: "~0.2 mb/d",
    utilizationPct: 33,
    status: "restricted",
    notes: "Refinery throughput limited. Domestic supply prioritized over exports."
  },
  {
    name: "Basra Oil Terminal",
    country: "Iraq",
    flag: "\u{1F1EE}\u{1F1F6}",
    lat: 29.68, lng: 48.82,
    type: "crude",
    capacity: "3.4 mb/d",
    throughput: "~0.4 mb/d",
    utilizationPct: 12,
    status: "force-majeure",
    notes: "Tanker shortage critical. Fields shut-in. BP staff evacuated from Rumaila."
  },
  {
    name: "Sitra",
    country: "Bahrain",
    flag: "\u{1F1E7}\u{1F1ED}",
    lat: 26.15, lng: 50.62,
    type: "refined",
    capacity: "0.27 mb/d",
    throughput: "~0.12 mb/d",
    utilizationPct: 44,
    status: "damaged",
    notes: "Iranian missile strikes on 5 & 9 Mar. BAPCO force majeure. Partially operational."
  },
  {
    name: "Bandar Abbas",
    country: "Iran",
    flag: "\u{1F1EE}\u{1F1F7}",
    lat: 27.18, lng: 56.27,
    type: "crude",
    capacity: "1.5 mb/d",
    throughput: "~0.6 mb/d",
    utilizationPct: 40,
    status: "damaged",
    notes: "Israeli air strikes on 7 Mar hit port/refinery area. Reduced export capacity."
  }
];

// Approximate lat/lng for infrastructure items from COUNTRY_STATUS_DATA
// Used by the GCC map to plot infrastructure markers
const INFRA_COORDS = {
  // Qatar
  "North Field":              { lat: 26.02, lng: 51.88 },
  "Qatargas 1 (Trains 1-3)": { lat: 25.94, lng: 51.58 },
  "Qatargas 2 (Trains 4-5)": { lat: 25.93, lng: 51.56 },
  "Qatargas 3 (Train 6)":    { lat: 25.92, lng: 51.60 },
  "Qatargas 4 (Train 7)":    { lat: 25.91, lng: 51.62 },
  "RasGas 1 (Trains 1-2)":   { lat: 25.95, lng: 51.55 },
  "RasGas 2 (Trains 3-5)":   { lat: 25.96, lng: 51.57 },
  "RasGas 3 (Trains 6-7)":   { lat: 25.97, lng: 51.59 },
  "Pearl GTL":                { lat: 25.90, lng: 51.54 },
  "Al Shaheen Field":         { lat: 26.30, lng: 51.40 },
  "Dukhan Field":             { lat: 25.42, lng: 50.78 },
  "Idd El Shargi North Dome": { lat: 25.98, lng: 52.20 },
  "Bul Hanine Field":         { lat: 25.60, lng: 52.07 },
  "Maydan Mahzam Field":      { lat: 25.80, lng: 52.00 },
  "Al Khalij Field":          { lat: 26.10, lng: 52.15 },
  "Laffan Refinery 1":        { lat: 25.89, lng: 51.53 },
  "Laffan Refinery 2":        { lat: 25.88, lng: 51.52 },
  "Mesaieed Refinery":        { lat: 24.98, lng: 51.54 },
  "Mesaieed Industrial City": { lat: 24.97, lng: 51.56 },
  "North Field East Expansion": { lat: 26.05, lng: 51.90 },
  "Qatalum Smelter":          { lat: 24.96, lng: 51.58 },
  "QAFCO Fertilizer Complex": { lat: 24.96, lng: 51.56 },
  "Umm Al Houl Power":        { lat: 25.12, lng: 51.61 },
  "Hamad Port":               { lat: 25.02, lng: 51.54 },
  // Kuwait
  "Greater Burgan (Burgan/Magwa/Ahmadi)": { lat: 29.00, lng: 47.91 },
  "Minagish Field":           { lat: 29.10, lng: 47.55 },
  "Raudhatain Field":         { lat: 29.90, lng: 47.70 },
  "Sabriya Field":            { lat: 29.82, lng: 47.80 },
  "Northern Kuwait Fields (GC-29/30/31)": { lat: 29.95, lng: 47.60 },
  "Mina Al-Ahmadi Refinery":  { lat: 29.07, lng: 48.09 },
  "Mina Abdullah Refinery":   { lat: 29.00, lng: 48.10 },
  "Al-Zour Refinery":         { lat: 28.75, lng: 48.40 },
  "Mina Al-Ahmadi Terminal":  { lat: 29.08, lng: 48.15 },
  "Al-Zour LNG Import Terminal": { lat: 28.73, lng: 48.42 },
  "Kafco Fuel Storage":       { lat: 29.05, lng: 48.05 },
  "Subiya Power Plant":       { lat: 29.70, lng: 48.10 },
  "EQUATE Petrochemical Complex": { lat: 29.04, lng: 48.14 },
  "Az-Zour South Power & Desalination": { lat: 28.71, lng: 48.37 },
  // Saudi Arabia — Fields
  "Safaniya Field":           { lat: 28.10, lng: 48.90 },
  "Marjan Field":             { lat: 27.60, lng: 49.50 },
  "Zuluf Field":              { lat: 27.20, lng: 49.80 },
  "Shaybah Field":            { lat: 22.48, lng: 54.02 },
  "Berri Field":              { lat: 27.50, lng: 49.60 },
  "Ghawar Field":             { lat: 25.40, lng: 49.30 },
  "Abu Safa Field":           { lat: 26.00, lng: 50.30 },
  "Marjan Expansion":         { lat: 27.55, lng: 49.55 },
  // Saudi Arabia — Processing, Refineries, Petrochemicals
  "Abqaiq Processing":        { lat: 25.94, lng: 49.68 },
  "Ras Tanura Refinery":      { lat: 26.65, lng: 50.15 },
  "Ras Tanura Terminal":      { lat: 26.63, lng: 50.18 },
  "Yanbu Refinery Complex":   { lat: 24.08, lng: 38.10 },
  "YASREF (Yanbu)":           { lat: 24.06, lng: 38.12 },
  "SAMREF Yanbu":             { lat: 24.10, lng: 38.07 },
  "SAMREF Refinery (Yanbu)":  { lat: 24.10, lng: 38.07 },
  "SABIC Yanbu Complex":      { lat: 24.12, lng: 38.15 },
  "Khurais Field":            { lat: 24.15, lng: 48.15 },
  "Jafurah Gas Field":        { lat: 24.80, lng: 49.50 },
  "Jubail Industrial Port":   { lat: 27.00, lng: 49.66 },
  "SABIC Jubail Petrochemical Complex": { lat: 27.02, lng: 49.58 },
  "Ma'aden Aluminium Complex": { lat: 27.52, lng: 49.17 },
  "Ras Al-Khair IWPP":        { lat: 27.54, lng: 49.14 },
  "Jazan Refinery":           { lat: 16.90, lng: 42.58 },
  "Jeddah Refinery":          { lat: 21.42, lng: 39.17 },
  "Riyadh Refinery":          { lat: 24.63, lng: 46.80 },
  "East-West Pipeline (Petroline)": { lat: 25.50, lng: 43.00 },
  "East-West Pipeline":       { lat: 25.50, lng: 43.00 },
  // UAE — Fields
  "Upper Zakum Field":        { lat: 24.83, lng: 53.75 },
  "Lower Zakum Field":        { lat: 24.55, lng: 53.65 },
  "Umm Shaif Field":          { lat: 25.08, lng: 53.00 },
  "Bu Hasa Field":            { lat: 23.20, lng: 53.50 },
  "Bab Field":                { lat: 23.85, lng: 54.10 },
  "Asab Field":               { lat: 23.45, lng: 53.80 },
  "SARB Field":               { lat: 24.90, lng: 53.60 },
  "Nasr Field":               { lat: 24.70, lng: 53.55 },
  "Hail Field":               { lat: 24.65, lng: 53.50 },
  // UAE — Refineries, LNG, Processing
  "Ruwais Refinery":          { lat: 24.11, lng: 52.73 },
  "Ruwais Refinery Complex":  { lat: 24.11, lng: 52.73 },
  "Ruwais Refinery 2 (West)": { lat: 24.10, lng: 52.70 },
  "Das Island LNG/LPG (ADGAS)": { lat: 25.15, lng: 52.87 },
  "Jebel Ali Refinery (ENOC)": { lat: 24.99, lng: 55.06 },
  "ADCOP Pipeline":           { lat: 24.50, lng: 54.50 },
  "Habshan Gas Plant":        { lat: 23.89, lng: 53.80 },
  "Shah Gas Field":           { lat: 23.40, lng: 53.30 },
  "Shah Gas Field (ADNOC/Oxy)": { lat: 23.40, lng: 53.30 },
  "Murban Field":             { lat: 23.50, lng: 54.00 },
  "Habshan ASR Gas Complex":  { lat: 23.88, lng: 53.78 },
  "Habshan Gas Processing":   { lat: 23.89, lng: 53.80 },
  "Habshan-Fujairah Pipeline": { lat: 24.50, lng: 55.00 },
  // UAE — Terminals
  "Fujairah Oil Terminal":    { lat: 25.17, lng: 56.35 },
  "Dubai Airport Fuel Terminal": { lat: 25.25, lng: 55.37 },
  "ADNOC Musaffah Terminal":  { lat: 24.36, lng: 54.50 },
  "Jebel Ali Port":           { lat: 25.00, lng: 55.06 },
  "Jebel Dhanna Terminal":    { lat: 24.19, lng: 52.58 },
  "Khalifa Port":             { lat: 24.83, lng: 54.63 },
  // UAE — Industrial
  "EGA Al Taweelah Smelter":  { lat: 24.83, lng: 54.65 },
  "EGA Jebel Ali Smelter":    { lat: 25.01, lng: 55.06 },
  "Borouge Petrochemical Complex": { lat: 24.10, lng: 52.72 },
  "Jebel Ali Power & Desalination Complex": { lat: 25.06, lng: 55.10 },
  "Taweelah Power & Desalination Complex": { lat: 24.77, lng: 54.68 },
  // Iraq — Fields
  "Rumaila (North + South)":  { lat: 30.60, lng: 47.35 },
  "Rumaila Field":            { lat: 30.60, lng: 47.35 },
  "West Qurna-2":             { lat: 30.87, lng: 47.20 },
  "West Qurna 2":             { lat: 30.87, lng: 47.20 },
  "West Qurna-1":             { lat: 30.98, lng: 47.18 },
  "West Qurna 1":             { lat: 30.98, lng: 47.18 },
  "Halfaya Field":            { lat: 31.50, lng: 47.30 },
  "Majnoon Field":            { lat: 31.10, lng: 47.40 },
  "Zubair Field":             { lat: 30.40, lng: 47.50 },
  "Buzurgan Field":           { lat: 31.85, lng: 47.15 },
  "Faihaa Field":             { lat: 31.20, lng: 47.25 },
  "Fakka Field":              { lat: 31.95, lng: 47.20 },
  "Abu Ghirab Field":         { lat: 31.75, lng: 47.10 },
  "Garraf Field":             { lat: 31.40, lng: 46.60 },
  "Ahdab Field":              { lat: 32.20, lng: 46.40 },
  "Ratawi Field":             { lat: 30.75, lng: 47.60 },
  "Shaikan Field (Kurdistan)": { lat: 36.60, lng: 44.20 },
  "Tawke/Peshkabir (Kurdistan)": { lat: 37.05, lng: 43.20 },
  "Khor Mor Gas Field":       { lat: 35.10, lng: 45.40 },
  // Iraq — Terminals, Refineries
  "Basra Oil Terminal":       { lat: 29.68, lng: 48.82 },
  "KAAOT Terminal":           { lat: 29.80, lng: 48.75 },
  "Khor Al-Amaya Terminal":   { lat: 29.80, lng: 48.75 },
  "Ceyhan Pipeline Terminal": { lat: 36.88, lng: 35.95 },
  "Shaikan Field":            { lat: 36.60, lng: 44.20 },
  "Khor Mor Gas":             { lat: 35.10, lng: 45.40 },
  "Baiji Refinery":           { lat: 34.93, lng: 43.49 },
  "Basra Refinery":           { lat: 30.52, lng: 47.78 },
  "Daura Refinery":           { lat: 33.28, lng: 44.40 },
  "Karbala Refinery":         { lat: 32.58, lng: 44.02 },
  "Kalak (KAR) Refinery":    { lat: 36.38, lng: 44.18 },
  "Lanaz Refinery":           { lat: 36.19, lng: 44.01 },
  "Kirkuk Refinery":          { lat: 35.44, lng: 44.36 },
  "Umm Qasr Port":            { lat: 30.03, lng: 47.95 },
  "Besmaya Power Plant":      { lat: 33.17, lng: 44.62 },
  // Iran — Fields
  "Kharg Island Terminal":    { lat: 29.23, lng: 50.32 },
  "South Pars Gas":           { lat: 26.60, lng: 52.20 },
  "South Pars Phases 2-3":   { lat: 26.55, lng: 52.15 },
  "South Pars Phases 4-5":   { lat: 26.58, lng: 52.18 },
  "South Pars Phases 6-8":   { lat: 26.52, lng: 52.22 },
  "Ahwaz Asmari/Bangestan":  { lat: 31.32, lng: 48.67 },
  "Marun":                    { lat: 31.10, lng: 49.20 },
  "Gachsaran":               { lat: 30.36, lng: 50.80 },
  "Rag-E-Sefid":             { lat: 30.65, lng: 50.12 },
  "Parsi":                    { lat: 30.20, lng: 51.30 },
  "Bibi Hakimeh":            { lat: 30.90, lng: 49.85 },
  "Mansouri":                 { lat: 31.50, lng: 48.80 },
  "Shadegan":                 { lat: 30.65, lng: 48.66 },
  "Azadegan North Phase 1":  { lat: 31.85, lng: 48.10 },
  "Agha Jari":               { lat: 30.75, lng: 49.83 },
  "Sepehr/Jufair Phase 1":   { lat: 30.50, lng: 50.50 },
  "Karanj":                   { lat: 31.05, lng: 49.50 },
  // Iran — Refineries
  "Abadan Refinery":          { lat: 30.35, lng: 48.30 },
  "Tehran Refinery":          { lat: 35.59, lng: 51.42 },
  "Bandar Abbas Refinery":    { lat: 27.20, lng: 56.25 },
  "Persian Gulf Star Refinery": { lat: 27.15, lng: 52.60 },
  "Isfahan Refinery":         { lat: 32.60, lng: 51.68 },
  "Arak/Shazand Refinery":   { lat: 34.05, lng: 49.70 },
  "Tabriz Refinery":          { lat: 38.00, lng: 46.25 },
  "Siraf Condensate Refinery": { lat: 27.60, lng: 52.35 },
  "Bandar Imam Petrochemical Complex": { lat: 30.43, lng: 49.00 },
  "Isfahan Thermal Power Plant": { lat: 32.62, lng: 51.72 },
  "Jask Oil Terminal":        { lat: 25.64, lng: 57.77 },
  "Goreh-Jask Pipeline":      { lat: 27.50, lng: 54.00 },
  "Shahran Oil Depot":        { lat: 35.72, lng: 51.39 },
  "Aghdasieh Oil Depot":      { lat: 35.80, lng: 51.45 },
  "Shahid Dolati Oil Depot":  { lat: 35.65, lng: 51.35 },
  "Shahr-e Rey Oil Depot":    { lat: 35.58, lng: 51.43 },
  // Bahrain
  "BAPCO Sitra Refinery":     { lat: 26.15, lng: 50.60 },
  "Bahrain Field":            { lat: 26.10, lng: 50.50 },
  "Bahrain Field (Awali)":    { lat: 26.10, lng: 50.50 },
  "Abu Safa Field (shared)":  { lat: 26.00, lng: 50.30 },
  "Alba Aluminium Smelter":   { lat: 26.03, lng: 50.58 },
  "Bahrain LNG Import":       { lat: 26.14, lng: 50.64 },
  "Sitra Marine Terminal":    { lat: 26.14, lng: 50.62 },
  "Al Dur IWPP":              { lat: 25.97, lng: 50.61 },
  // Israel
  "Leviathan Phase 1A":       { lat: 33.25, lng: 33.26 },
  "Karish":                   { lat: 32.90, lng: 33.50 },
  "Tamar":                    { lat: 32.60, lng: 33.40 },
  "Leviathan Gas Field":      { lat: 33.25, lng: 33.26 },
  "Tamar Gas Field":          { lat: 32.60, lng: 33.40 },
  "Karish Gas Field":         { lat: 32.90, lng: 33.50 },
  "Karish North Gas Field":   { lat: 32.95, lng: 33.48 },
  "EMG Pipeline (Israel-Egypt)": { lat: 31.50, lng: 34.20 },
  "JNGET Pipeline (Israel-Jordan)": { lat: 30.80, lng: 35.00 },
  "EAPC Pipeline":            { lat: 30.50, lng: 34.75 },
  "Ashdod Refinery (Bazan)":  { lat: 31.80, lng: 34.63 },
  // Oman
  "PDO Fields (Block 6)":     { lat: 21.50, lng: 56.50 },
  "Khazzan Gas Field (BP)":   { lat: 21.00, lng: 56.80 },
  "Sohar Refinery":           { lat: 24.35, lng: 56.71 },
  "Duqm Refinery":            { lat: 19.67, lng: 57.71 },
  "Oman LNG (Qalhat)":       { lat: 22.93, lng: 59.03 },
  "Mina Al-Fahal Terminal":   { lat: 23.63, lng: 58.57 },
  "Salalah Port / Oil Storage": { lat: 16.94, lng: 54.01 },
  "Duqm Port & SEZ":         { lat: 19.51, lng: 57.70 },
  "Sohar Port":               { lat: 24.37, lng: 56.73 },
  "Sohar Aluminium":          { lat: 24.47, lng: 56.63 },
  "Barka IWPP":               { lat: 23.71, lng: 57.98 },
  "Mukhaizna Field":          { lat: 19.80, lng: 56.30 },
};

const PIPELINE_ROUTES = [
  {
    name: "East-West Pipeline (Petroline)",
    country: "Saudi Arabia",
    type: "oil",
    capacity: "~7 mb/d",
    currentFlow: "~7 mb/d",
    fromCountry: "Saudi Arabia",
    toCountry: "Saudi Arabia (Red Sea)",
    status: "operational",
    startLabel: "Abqaiq",
    endLabel: "Yanbu",
    notes: "Operating at full 7 mb/d since Mar 11 conversion; Yanbu port loading constrained to ~4.4-5 mb/d (port bottleneck, not pipeline)",
    // 1,201 km across Saudi Arabia: Abqaiq → central desert (11 pump stations) → Hijas Mountains → Yanbu
    coords: [
      [25.94, 49.68],  // Abqaiq
      [25.80, 49.00],  // West of Dhahran
      [25.55, 48.00],  // Approaching Riyadh longitude
      [25.30, 47.00],  // Central Province
      [25.10, 46.00],  // West of Riyadh
      [24.90, 45.00],  // Desert crossing
      [24.70, 44.00],  // Approaching Qassim
      [24.50, 43.00],  // Central Saudi
      [24.35, 42.00],  // Hijas foothills
      [24.25, 41.00],  // Hijas Mountains (1,082m)
      [24.18, 40.00],  // Western slope
      [24.12, 39.00],  // Approaching coast
      [24.09, 38.06]   // Yanbu (Red Sea)
    ]
  },
  {
    name: "Habshan-Fujairah (ADCOP)",
    country: "UAE",
    type: "oil",
    capacity: "1.5 mb/d",
    currentFlow: "~1.62 mb/d",
    fromCountry: "UAE (Abu Dhabi)",
    toCountry: "UAE (Fujairah)",
    status: "operational",
    startLabel: "Habshan",
    endLabel: "Fujairah",
    notes: "Bypassing Hormuz at record 1.62M bpd in Mar; 360km overland through Hajar Mountains",
    // 360 km: Habshan → Sweihan corridor → west of Al Ain → Hajar Mountains → Fujairah
    coords: [
      [23.89, 53.80],  // Habshan gas/oil complex
      [24.05, 54.10],  // Northeast toward Sweihan
      [24.20, 54.50],  // Sweihan industrial corridor
      [24.35, 54.90],  // East of Abu Dhabi city
      [24.45, 55.30],  // West of Al Ain
      [24.60, 55.60],  // Approaching Hajar Mountains
      [24.80, 55.90],  // Mountain crossing
      [24.95, 56.10],  // Eastern slope
      [25.05, 56.20],  // Approaching Fujairah
      [25.13, 56.33]   // Fujairah terminal (Gulf of Oman)
    ]
  },
  {
    name: "Iraq-Turkey Pipeline (Kirkuk-Ceyhan)",
    country: "Iraq/Turkey",
    type: "oil",
    capacity: "0.9 mb/d",
    currentFlow: "~0.25 mb/d",
    fromCountry: "Iraq",
    toCountry: "Turkey",
    status: "operational",
    startLabel: "Kirkuk",
    endLabel: "Ceyhan",
    notes: "Restarted Sep 2025 after 2.5yr shutdown; Iraq exporting ~250k bpd as of Mar 18; key Hormuz bypass",
    // 970 km: Kirkuk → northwest Iraq → Turkish border → southern Turkey → Ceyhan (Mediterranean)
    coords: [
      [35.47, 44.39],  // Kirkuk
      [35.75, 44.00],  // Northwest Iraq
      [36.10, 43.50],  // Approaching Mosul region
      [36.40, 43.10],  // Northern Iraq
      [36.70, 42.70],  // Near Turkish border
      [37.00, 42.30],  // Border crossing area
      [37.15, 41.50],  // Southeastern Turkey
      [37.20, 40.50],  // Southern Turkey
      [37.15, 39.50],  // Continuing west
      [37.05, 38.50],  // Near Gaziantep
      [36.98, 37.50],  // Approaching Adana
      [36.93, 36.70],  // Adana province
      [36.88, 35.95]   // Ceyhan terminal (Mediterranean)
    ]
  },
  {
    name: "Goreh-Jask Pipeline",
    country: "Iran",
    type: "oil",
    capacity: "0.3 mb/d (1 mb/d design)",
    currentFlow: "~0.1 mb/d",
    fromCountry: "Iran",
    toCountry: "Iran (Gulf of Oman)",
    status: "operational",
    startLabel: "Goreh",
    endLabel: "Jask",
    notes: "Iran's only Hormuz bypass; restarted Mar 7; 2M bbl loaded at Jask (Kpler)",
    // ~1,000 km: Goreh (southern Iran) → through mountains → Jask (Gulf of Oman)
    coords: [
      [27.50, 52.50],  // Goreh (near Assaluyeh/South Pars)
      [27.30, 53.30],  // Southeast along coast
      [27.00, 54.20],  // Through Bushehr province
      [26.80, 55.00],  // Hormozgan province
      [26.50, 56.00],  // Inland route
      [26.00, 57.00],  // Approaching Makran coast
      [25.64, 57.77]   // Jask terminal (Gulf of Oman)
    ]
  },
  // ── Cross-country pipelines ──
  {
    name: "Dolphin Gas Pipeline",
    country: "Qatar/UAE",
    type: "gas",
    capacity: "3.2 bcf/d",
    currentFlow: "~2 bcf/d",
    fromCountry: "Qatar",
    toCountry: "UAE",
    status: "partial",
    startLabel: "Ras Laffan",
    endLabel: "Taweelah",
    notes: "GCC's only cross-border gas pipeline; ~2 bcf/d pre-crisis flow to UAE — actual wartime throughput unverified, may be reduced due to Qatar production shutdowns. Operator: Dolphin Energy (Mubadala 51%, Total 24.5%, Oxy 24.5%)",
    // 364 km subsea: Ras Laffan → Persian Gulf → Taweelah (Abu Dhabi)
    coords: [
      [25.89, 51.54],  // Ras Laffan LNG complex, Qatar
      [26.05, 52.10],  // Offshore Qatar
      [25.90, 52.80],  // Mid-Gulf
      [25.50, 53.50],  // UAE waters
      [25.10, 54.10],  // Approaching Abu Dhabi
      [24.72, 54.65]   // Taweelah, Abu Dhabi
    ]
  },
  {
    name: "Saudi Arabia → Egypt (Yanbu–SUMED)",
    country: "Saudi Arabia/Egypt",
    type: "oil",
    capacity: "2.5 mb/d (SUMED)",
    currentFlow: "~1.5 mb/d",
    fromCountry: "Saudi Arabia",
    toCountry: "Egypt (Mediterranean)",
    status: "operational",
    startLabel: "Yanbu",
    endLabel: "Sidi Kerir",
    notes: "No direct pipeline — tanker from Yanbu across Red Sea to Ain Sokhna, then 320 km SUMED to Mediterranean. Egypt offered route Mar 2026. SUMED ownership: EGPC 50%, Aramco 15%, Kuwait 15%, Mubadala 15%, QatarEnergy 5%",
    // Yanbu → Red Sea (tanker) → Ain Sokhna → SUMED overland → Sidi Kerir (Mediterranean)
    coords: [
      [24.09, 38.06],  // Yanbu (Red Sea) — connects to Petroline
      [24.50, 37.50],  // Red Sea open water
      [25.50, 36.50],  // Red Sea mid-crossing
      [26.80, 35.50],  // Northern Red Sea
      [28.20, 34.00],  // Approaching Gulf of Suez
      [29.10, 33.00],  // Gulf of Suez entrance
      [29.60, 32.35],  // Ain Sokhna (SUMED start)
      [29.85, 31.80],  // Desert crossing
      [30.15, 31.20],  // Central Egypt
      [30.50, 30.60],  // Western desert
      [30.85, 30.10],  // Approaching coast
      [31.13, 29.77]   // Sidi Kerir (Mediterranean)
    ]
  },
  {
    name: "Abu Safa–Bahrain Pipeline",
    country: "Saudi Arabia/Bahrain",
    type: "oil",
    capacity: "~0.23 mb/d",
    currentFlow: "~0 mb/d",
    fromCountry: "Saudi Arabia",
    toCountry: "Bahrain",
    status: "shutdown",
    startLabel: "Abu Safa Field",
    endLabel: "Sitra Refinery",
    notes: "Shut: Abu Safa field shut in by Saudi + Bapco Sitra refinery (405 kb/d) struck by Iranian missiles, FM declared Mar 9. Pipeline capacity ~0.23 mb/d when operational",
    // ~115 km subsea: Abu Safa offshore field → Bahrain
    coords: [
      [26.05, 50.25],  // Abu Safa offshore field
      [26.08, 50.42],  // Mid-channel
      [26.13, 50.60]   // Sitra refinery, Bahrain
    ]
  },
  {
    name: "Iran–Iraq Gas Pipeline",
    country: "Iran/Iraq",
    type: "gas",
    capacity: "~1.7 bcf/d",
    currentFlow: "~0 bcf/d",
    fromCountry: "Iran",
    toCountry: "Iraq",
    status: "shutdown",
    startLabel: "South Pars",
    endLabel: "Baghdad",
    notes: "Halted after Israeli strike on South Pars Mar 18; Iran diverted gas for domestic use. Iraq lost ~3,100 MW power capacity. Supplied ~30-40% of Iraq electricity (~18 bcm/yr contracted)",
    // Southern route: South Pars → Basra region → Baghdad
    coords: [
      [27.50, 52.50],  // South Pars / Assaluyeh, Iran
      [28.50, 51.50],  // Southwest Iran
      [30.00, 49.50],  // Approaching Iraqi border
      [30.50, 48.50],  // Basra region, Iraq
      [31.50, 47.50],  // Southern Iraq
      [32.50, 46.50],  // Central Iraq
      [33.35, 44.40]   // Baghdad
    ]
  },
  {
    name: "Tabriz–Ankara Gas Pipeline",
    country: "Iran/Turkey",
    type: "gas",
    capacity: "~1.4 bcf/d",
    currentFlow: "~0 bcf/d",
    fromCountry: "Iran",
    toCountry: "Turkey",
    status: "shutdown",
    startLabel: "Tabriz",
    endLabel: "Ankara",
    notes: "Halted after South Pars strike Mar 18 (Bloomberg Mar 24). Iran's largest gas export (~14 bcm/yr). Turkey sourced ~14% of gas from Iran; now relying on Russia/Azerbaijan. Contract expires Jul 2026",
    // ~2,577 km: Tabriz (NW Iran) → eastern Turkey → Ankara
    coords: [
      [38.07, 46.30],  // Tabriz, Iran
      [38.50, 44.80],  // Iranian border region
      [38.90, 43.50],  // Eastern Turkey
      [39.20, 42.00],  // Continuing west
      [39.40, 40.50],  // Central eastern Turkey
      [39.60, 39.00],  // Near Erzincan
      [39.70, 37.50],  // Central Turkey
      [39.80, 36.00],  // Approaching Ankara
      [39.93, 32.87]   // Ankara
    ]
  }
];
