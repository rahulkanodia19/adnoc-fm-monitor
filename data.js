// ============================================================
// data.js -- ADNOC Force Majeure & Geopolitical Monitor
// Pre-populated monitoring data from verified intelligence
// Last updated: 2026-03-18T12:00:00Z
// Period: 28 February - 18 March 2026
// Context: Strait of Hormuz / Gulf military escalation
// ============================================================

const LAST_UPDATED = "2026-03-18T12:00:00Z";

// ---------- TABLE 1: Country Status Matrix ----------
const COUNTRY_STATUS_DATA = [
  {
    id: "qatar",
    country: "Qatar",
    flag: "\u{1F1F6}\u{1F1E6}",
    status: "critical",
    statusLabel: "FM Declared",
    summary: "QatarEnergy halted ALL LNG production after Iranian drone strikes on Ras Laffan and Mesaieed. All downstream (polymers, methanol, urea, aluminium) also suspended. ~20% of global LNG offline.",
    metrics: {
      headline: "~20% of global LNG offline",
      productionOffline: "77 Mtpa LNG + all downstream",
      keyFigure: "~7M tonnes/month removed"
    },
    events: [
      {
        date: "2026-03-11",
        title: "Shell & TotalEnergies cascade FM on Qatar LNG",
        description: "Shell declared FM on LNG contracts to Asia/Europe. TotalEnergies declared FM on 5.2 Mtpa Qatar LNG offtake. April deliveries impacted."
      },
      {
        date: "2026-03-05",
        title: "Hydro/Qatalum JV declares FM - smelter shutdown",
        description: "Hydro/Qatalum declared FM on aluminium production. Smelter shutdown initiated. Restart estimated 6-12 months."
      },
      {
        date: "2026-03-04",
        title: "QatarEnergy declares FM on all LNG exports",
        description: "QatarEnergy declared Force Majeure on all LNG exports globally, removing ~7M tonnes/month (~20% of global LNG supply). Strait of Hormuz transit disruption cited."
      },
      {
        date: "2026-03-03",
        title: "QatarEnergy suspends all downstream operations",
        description: "QatarEnergy halted output of polymers, methanol, urea, and other chemicals. Alba-linked aluminium production suspended. Complete industrial shutdown across Mesaieed and Ras Laffan."
      },
      {
        date: "2026-03-02",
        title: "Iranian drones strike Ras Laffan and Mesaieed",
        description: "Iranian drones struck water tank at Mesaieed power plant and energy facility at Ras Laffan. QatarEnergy suspended all LNG production. Dutch and British gas prices surged ~50%. Asian LNG spot prices jumped ~39%."
      }
    ],
    oilGasImpact: {
      severity: "critical",
      summary: "All LNG + downstream production halted",
      details: "All LNG production halted since 2 Mar after Iranian drone strikes on Ras Laffan and Mesaieed. QatarEnergy declared FM on 4 Mar. All downstream suspended 3 Mar: polymers, methanol, urea, aluminium. ~20% of global LNG supply offline (~7M tonnes/month). Shell and TotalEnergies cascaded FM. Dutch/British gas prices surged ~50%. Qatalum smelter shutdown (restart 6-12 months)."
    },
    infrastructure: [
      { name: "Ras Laffan LNG Complex", type: "LNG Plant", capacity: "77 Mtpa", status: "shutdown" },
      { name: "Qatargas Train 1-3", type: "LNG Train", capacity: "10 Mtpa", status: "shutdown" },
      { name: "Qatargas Train 4-7 (Mega)", type: "LNG Train", capacity: "31.2 Mtpa", status: "shutdown" },
      { name: "RasGas / QG2 Trains", type: "LNG Train", capacity: "~30 Mtpa", status: "shutdown" },
      { name: "Ras Laffan Refinery", type: "Refinery", capacity: "146,000 bpd", status: "shutdown" },
      { name: "Laffan Refinery 2", type: "Refinery", capacity: "146,000 bpd", status: "shutdown" },
      { name: "Mesaieed Industrial City", type: "Petrochemical Complex", capacity: "Various", status: "shutdown" },
      { name: "North Field", type: "Gas Field", capacity: "~17 Bcf/d", status: "partial" },
      { name: "North Field East Expansion", type: "LNG Expansion", capacity: "32 Mtpa (construction)", status: "shutdown" },
      { name: "Qatalum Smelter", type: "Aluminium", capacity: "585,000 tpa", status: "shutdown" }
    ],
    sources: [
      { id: 1, title: "QatarEnergy halts LNG production after attacks - Al Jazeera", url: "https://www.aljazeera.com/news/2026/3/2/qatarenergy-worlds-largest-lng-firm-halts-production-after-iran-attacks", date: "2026-03-02" },
      { id: 2, title: "Qatar shuts LNG production - Bloomberg", url: "https://www.bloomberg.com/news/articles/2026-03-02/qatar-stops-lng-production-at-world-s-top-plant-after-attack", date: "2026-03-02" },
      { id: 3, title: "QatarEnergy stops chemicals, aluminium - Bloomberg", url: "https://www.bloomberg.com/news/articles/2026-03-03/qatarenergy-stops-output-of-some-chemicals-metal-after-lng-halt", date: "2026-03-03" },
      { id: 4, title: "QatarEnergy FM declaration - The National", url: "https://www.thenationalnews.com", date: "2026-03-04" },
      { id: 5, title: "Shell FM on Qatar LNG - Al Jazeera", url: "https://www.aljazeera.com/economy/2026/3/11/shell-declares-force-majeure-on-lng-contracts-from-qatar", date: "2026-03-11" },
      { id: 6, title: "TotalEnergies FM - OilPrice.com", url: "https://oilprice.com/Latest-Energy-News/World-News/Shell-and-TotalEnergies-Issue-Force-Majeure-After-Qatar-LNG-Shut-Down.html", date: "2026-03-11" }
    ]
  },
  {
    id: "kuwait",
    country: "Kuwait",
    flag: "\u{1F1F0}\u{1F1FC}",
    status: "critical",
    statusLabel: "FM / Escalated",
    summary: "KPC declared FM on crude exports. Kafco fuel tanks struck. Subiya power plant fire from intercepted drone debris. 6 drones intercepted.",
    metrics: {
      headline: "~1.2 mb/d crude exports cut",
      productionOffline: "Refineries at 1.4M bpd (reduced)",
      keyFigure: "2.6 mb/d baseline disrupted"
    },
    events: [
      {
        date: "2026-03-09",
        title: "Subiya Power Plant fire - drone debris",
        description: "Subiya power plant fire caused by intercepted drone debris. 6 drones intercepted over Kuwait. Status escalated beyond KPC crude FM."
      },
      {
        date: "2026-03-07",
        title: "KPC declares FM on crude oil exports",
        description: "Kuwait Petroleum Corporation declared Force Majeure on crude oil exports. Cuts from 2.6 mb/d baseline. Kafco fuel tanks struck. Refineries lowering throughput to 1.4M bpd."
      }
    ],
    oilGasImpact: {
      severity: "critical",
      summary: "FM on crude exports, refineries reduced",
      details: "KPC declared FM on all crude exports. Refineries reduced to 1.4M bpd from normal throughput. Kafco fuel storage tanks struck. Subiya power plant fire from intercepted drone debris. Export via Hormuz severely disrupted."
    },
    infrastructure: [
      { name: "Burgan Field Complex", type: "Oil Field", capacity: "~1.7 mb/d", status: "partial" },
      { name: "Mina Al-Ahmadi Refinery", type: "Refinery", capacity: "466,000 bpd", status: "partial" },
      { name: "Mina Abdullah Refinery", type: "Refinery", capacity: "270,000 bpd", status: "partial" },
      { name: "Al-Zour Refinery", type: "Refinery", capacity: "615,000 bpd", status: "partial" },
      { name: "Mina Al-Ahmadi Terminal", type: "Export Terminal", capacity: "~1.5 mb/d", status: "shutdown" },
      { name: "Al-Zour LNG Import Terminal", type: "LNG Import", capacity: "22 Mtpa", status: "partial" },
      { name: "Kafco Fuel Storage", type: "Fuel Storage", capacity: "N/A", status: "shutdown" },
      { name: "Subiya Power Plant", type: "Power Plant", capacity: "2,400 MW", status: "shutdown" }
    ],
    sources: [
      { id: 1, title: "KPC FM on crude - Express Tribune", url: "https://tribune.com.pk", date: "2026-03-07" },
      { id: 2, title: "Kuwait FM - Sunday Guardian", url: "https://sundayguardianlive.com/world/iran-israel-tensions-will-saudi-arabia-follow-kuwaits-oil-cuts-declares-force-majeure-as-hormuz-blockade-enters-day-8-20-of-global-oil-supply-suspended-174606/", date: "2026-03-07" },
      { id: 3, title: "Subiya fire - Times Kuwait", url: "https://timeskuwait.com", date: "2026-03-09" },
      { id: 4, title: "Kuwait drone intercepts - FDD", url: "https://www.fdd.org", date: "2026-03-09" }
    ]
  },
  {
    id: "saudi_arabia",
    country: "Saudi Arabia",
    flag: "\u{1F1F8}\u{1F1E6}",
    status: "critical",
    statusLabel: "Shutdown",
    summary: "Ras Tanura (550 kb/d) shut. 4 offshore mega-fields shut (~2.5M bpd). Crude rerouted to Yanbu. No formal blanket FM but massive de facto curtailment.",
    metrics: {
      headline: "~2.5-3.0 mb/d offline",
      productionOffline: "4 offshore fields + Ras Tanura",
      keyFigure: "~20-25% of Saudi capacity"
    },
    events: [
      {
        date: "2026-03-09",
        title: "Aramco shuts 4 offshore mega-fields",
        description: "Saudi Aramco shut Safaniya, Zuluf, Marjan, and Abu Safa offshore fields. Combined ~2.0-2.5M bpd offline. Storage contagion concerns cited."
      },
      {
        date: "2026-03-02",
        title: "Ras Tanura shut, Shaybah targeted",
        description: "Ras Tanura refinery (550 kb/d) shut. LPG suspended. Crude rerouted to Yanbu (Red Sea). Shaybah targeted by drones but attack thwarted."
      }
    ],
    oilGasImpact: {
      severity: "critical",
      summary: "~2.5-3.0 mb/d offline",
      details: "Ras Tanura refinery (550 kb/d) shut since 2 Mar. Four major offshore fields (Safaniya, Zuluf, Marjan, Abu Safa) shut on 9 Mar totaling 2-2.5M bpd. Crude rerouted via East-West Pipeline to Yanbu. SABIC Yanbu plants operating via Red Sea route. ~20-25% of Saudi production capacity offline."
    },
    infrastructure: [
      { name: "Ghawar Field", type: "Oil Field", capacity: "~3.8 mb/d", status: "operational" },
      { name: "Safaniya Field", type: "Offshore Oil", capacity: "~1.2 mb/d", status: "shutdown" },
      { name: "Zuluf Field", type: "Offshore Oil", capacity: "~500,000 bpd", status: "shutdown" },
      { name: "Marjan Field", type: "Offshore Oil", capacity: "~500,000 bpd", status: "shutdown" },
      { name: "Abu Safa Field", type: "Offshore Oil", capacity: "~300,000 bpd", status: "shutdown" },
      { name: "Shaybah Field", type: "Oil Field", capacity: "~1.0 mb/d", status: "operational" },
      { name: "Ras Tanura Refinery", type: "Refinery", capacity: "550,000 bpd", status: "shutdown" },
      { name: "Ras Tanura Terminal", type: "Export Terminal", capacity: "~6 mb/d", status: "shutdown" },
      { name: "Yanbu Refinery Complex", type: "Refinery", capacity: "400,000 bpd", status: "operational" },
      { name: "YASREF (Yanbu)", type: "Refinery", capacity: "400,000 bpd", status: "operational" },
      { name: "East-West Pipeline", type: "Pipeline", capacity: "~5 mb/d", status: "operational" },
      { name: "SABIC Yanbu Complex", type: "Petrochemical", capacity: "Various", status: "operational" }
    ],
    sources: [
      { id: 1, title: "Ras Tanura shutdown - Bloomberg", url: "https://www.bloomberg.com", date: "2026-03-02" },
      { id: 2, title: "Aramco reroute to Yanbu - Argus", url: "https://www.argusmedia.com", date: "2026-03-02" },
      { id: 3, title: "Offshore fields shut - Maritime Executive", url: "https://maritime-executive.com", date: "2026-03-09" },
      { id: 4, title: "Safaniya/Zuluf/Marjan shutdown - Splash247", url: "https://splash247.com", date: "2026-03-09" }
    ]
  },
  {
    id: "uae",
    country: "United Arab Emirates",
    flag: "\u{1F1E6}\u{1F1EA}",
    status: "critical",
    statusLabel: "Escalated",
    isNew: true,
    summary: "Shah Gas Field struck by drones (16 Mar) - 1 Bcf/d offline. Ruwais Refinery-2 (417 kb/d) shut. Fujairah terminal attacked 3 times, ADNOC loading halted. No formal FM but massive disruption.",
    metrics: {
      headline: "Shah + Ruwais + Fujairah offline",
      productionOffline: "1 Bcf/d gas + 417 kb/d refining + 1M bpd exports",
      keyFigure: "20% of UAE gas supply disrupted"
    },
    events: [
      {
        date: "2026-03-17",
        title: "Fujairah terminal attacked 3rd time - ADNOC loading halted",
        description: "Oil loading at Fujairah partly halted after third drone attack in four days. ADNOC crude loading at Fujairah suspended. Fujairah handles ~1M bpd of Murban crude (~1% of global demand).",
        isNew: true
      },
      {
        date: "2026-03-16",
        title: "Shah Gas Field struck by Iranian drones",
        description: "Drone strike sparked fire at ADNOC/Occidental Shah Gas Field in Empty Quarter. Operations suspended. Shah supplies ~1 Bcf/d (~20% of UAE gas supply) and 5% of world's granulated sulphur.",
        isNew: true
      },
      {
        date: "2026-03-16",
        title: "Fujairah oil hub targeted by drone attack",
        description: "Drone attack caused large fire at Fujairah oil trading hub. ADNOC suspended crude loading operations. Fujairah is critical export terminal for UAE Murban crude.",
        isNew: true
      },
      {
        date: "2026-03-14",
        title: "Fujairah oil loading suspended after drone intercept fire",
        description: "Smoke rose in Fujairah oil zone from debris after drone interception. Some oil-loading operations suspended. Resumed briefly on 15 Mar before being halted again.",
        isNew: true
      },
      {
        date: "2026-03-10",
        title: "ADNOC Ruwais Refinery shut after drone strike",
        description: "Ruwais Refinery-2 (417 kb/d) shut after drone strike on complex. ADNOC initiated plant-wide safety audit. Offshore production cuts continue."
      },
      {
        date: "2026-03-07",
        title: "ADNOC managing offshore output, onshore continues",
        description: "ADNOC announced monitoring offshore production levels for 'operational flexibility'. Onshore operations continue. Has not declared formal FM despite Hormuz closure."
      },
      {
        date: "2026-03-02",
        title: "Fujairah bunker suppliers declare FM",
        description: "MEE and Pearl Marine declared FM on marine fuel deliveries at Fujairah bunkering hub. World's 2nd largest bunkering hub disrupted."
      },
      {
        date: "2026-03-01",
        title: "UAE enters precautionary status",
        description: "DXB suspended. ADNOC using Habshan-Fujairah pipeline bypass for exports. De facto FM on maritime exports."
      }
    ],
    oilGasImpact: {
      severity: "critical",
      summary: "Shah (1 Bcf/d) + Ruwais (417 kb/d) + Fujairah offline",
      details: "Shah Gas Field struck 16 Mar (~1 Bcf/d gas, 20% of UAE gas supply offline). Ruwais Refinery-2 (417 kb/d) shut after drone strike 10 Mar. Fujairah export terminal attacked 3 times (14, 16, 17 Mar) - ADNOC crude loading halted (~1M bpd). Das Island LNG/LPG operations restricted. ADNOC has NOT declared formal FM but de facto disruption is massive. Habshan-Fujairah pipeline (1.5 mb/d) at max capacity as Hormuz bypass."
    },
    infrastructure: [
      { name: "Shah Gas Field (ADNOC/Oxy)", type: "Sour Gas Processing", capacity: "~1 Bcf/d gas, 50k bpd condensate", status: "shutdown" },
      { name: "Upper Zakum Field", type: "Offshore Oil", capacity: "~1.0 mb/d", status: "partial" },
      { name: "Lower Zakum Field", type: "Offshore Oil", capacity: "~450,000 bpd", status: "partial" },
      { name: "Umm Shaif Field", type: "Offshore Oil/Gas", capacity: "~230,000 bpd", status: "partial" },
      { name: "Murban Field", type: "Onshore Oil", capacity: "~500,000 bpd", status: "operational" },
      { name: "Bu Hasa Field", type: "Onshore Oil", capacity: "~650,000 bpd", status: "operational" },
      { name: "Bab Field", type: "Onshore Oil", capacity: "~300,000 bpd", status: "operational" },
      { name: "Ruwais Refinery Complex", type: "Refinery", capacity: "922,000 bpd total", status: "partial" },
      { name: "Ruwais Refinery 2 (West)", type: "Refinery", capacity: "417,000 bpd", status: "shutdown" },
      { name: "Habshan Gas Processing", type: "Gas Processing", capacity: "~3.5 Bcf/d", status: "operational" },
      { name: "Habshan-Fujairah Pipeline", type: "Pipeline", capacity: "1.5 mb/d", status: "operational" },
      { name: "Fujairah Oil Terminal", type: "Export Terminal", capacity: "~1M bpd Murban crude", status: "shutdown" },
      { name: "Das Island LNG/LPG", type: "LNG/LPG Plant", capacity: "~5.8 Mtpa", status: "partial" },
      { name: "Jebel Ali Refinery (ENOC)", type: "Refinery", capacity: "120,000 bpd", status: "operational" }
    ],
    sources: [
      { id: 1, title: "UAE precautionary status - Euronews", url: "https://www.euronews.com", date: "2026-03-01" },
      { id: 2, title: "Fujairah bunker FM - Argus", url: "https://www.argusmedia.com/en/news-and-insights/latest-market-news/2796111-uae-s-fujairah-bunker-suppliers-declare-force-majeure", date: "2026-03-02" },
      { id: 3, title: "ADNOC managing offshore output - BOE Report", url: "https://boereport.com/2026/03/07/adnoc-says-it-is-managing-offshore-output-onshore-operations-continue/", date: "2026-03-07" },
      { id: 4, title: "Ruwais shutdown - GMA News", url: "https://www.gmanetwork.com/news/topstories/world/979523/uae-oil-giant-adnoc-shuts-ruwais-refinery-after-drone-strike-source-says/story/", date: "2026-03-10" },
      { id: 5, title: "Fujairah loading suspended - CNBC", url: "https://www.cnbc.com/2026/03/14/some-oil-loading-operations-in-uae-hub-suspended-after-fire-reuters.html", date: "2026-03-14" },
      { id: 6, title: "Shah Gas Field drone strike - World Oil", url: "https://www.worldoil.com/news/2026/3/16/drone-strike-sparks-fire-at-uae-s-shah-gas-field-operated-by-adnoc-occidental/", date: "2026-03-16" },
      { id: 7, title: "Shah Field shutdown - The National", url: "https://www.thenationalnews.com/business/2026/03/17/shah-field-a-vital-gas-and-sulphur-asset-attacked-by-iranian-drones/", date: "2026-03-17" },
      { id: 8, title: "Fujairah/Shah attacks - Cyprus Mail", url: "https://cyprus-mail.com/2026/03/17/attacks-on-uaes-fujairah-port-shah-gas-field-add-to-energy-disruptions", date: "2026-03-17" },
      { id: 9, title: "ADNOC loading halted Fujairah - Yahoo", url: "https://www.yahoo.com/news/articles/oil-loading-operations-suspended-uaes-081836446.html", date: "2026-03-17" }
    ]
  },
  {
    id: "iraq",
    country: "Iraq",
    flag: "\u{1F1EE}\u{1F1F6}",
    status: "critical",
    statusLabel: "Production Halt",
    summary: "Rumaila shut (700 kb/d), WQ2 cut 460 kb/d, Kurdistan halted. 1.5M+ bpd offline. Majnoon struck by drones. Basra terminals halted.",
    metrics: {
      headline: "1.5M+ bpd production cuts",
      productionOffline: "~30% of Iraq's 4.5M bpd",
      keyFigure: "Basra export corridor offline"
    },
    events: [
      {
        date: "2026-03-09",
        title: "Majnoon hit by drones - Basra terminals halted",
        description: "Majnoon oil field (Basra) hit by drones over multiple days (9-12 Mar). Basra port terminals halted loading operations."
      },
      {
        date: "2026-03-03",
        title: "SOMO confirms 1.5M+ bpd production cuts",
        description: "Iraq's SOMO confirmed total cuts exceeding 1.5M bpd. Rumaila fully shut, WQ2 severely cut. No formal FM declared. SOMO denied sanctions rumors."
      },
      {
        date: "2026-02-28",
        title: "Kurdistan fields halted by multiple operators",
        description: "DNO, Gulf Keystone, Dana Gas, and HKN Energy all ceased Kurdistan operations. Regional security cited. Pipeline exports to Ceyhan suspended."
      }
    ],
    oilGasImpact: {
      severity: "critical",
      summary: "1.5M+ bpd cuts, ~30% of production",
      details: "Rumaila (700 kb/d) fully shut. WQ2 cut by 460 kb/d. All Kurdistan production halted (DNO, Gulf Keystone, Dana Gas, HKN). SOMO confirmed 1.5M+ bpd total cuts. Majnoon struck by drones 9-12 Mar. Basra Oil Terminal and KAAOT halted. ~30% of Iraq's 4.5M bpd production offline."
    },
    infrastructure: [
      { name: "Rumaila Field", type: "Oil Field", capacity: "~1.4 mb/d", status: "shutdown" },
      { name: "West Qurna 2", type: "Oil Field", capacity: "~460,000 bpd", status: "shutdown" },
      { name: "West Qurna 1", type: "Oil Field", capacity: "~500,000 bpd", status: "partial" },
      { name: "Majnoon Field", type: "Oil Field", capacity: "~230,000 bpd", status: "shutdown" },
      { name: "Kurdistan Fields", type: "Oil/Gas Fields", capacity: "~400,000 bpd", status: "shutdown" },
      { name: "Basra Oil Terminal", type: "Export Terminal", capacity: "~1.8 mb/d", status: "shutdown" },
      { name: "Khor Al-Amaya Terminal", type: "Export Terminal", capacity: "~600,000 bpd", status: "shutdown" },
      { name: "Karbala Refinery", type: "Refinery", capacity: "140,000 bpd", status: "operational" },
      { name: "Basra Refinery", type: "Refinery", capacity: "210,000 bpd", status: "partial" }
    ],
    sources: [
      { id: 1, title: "Rumaila shut - Bloomberg", url: "https://www.bloomberg.com", date: "2026-03-01" },
      { id: 2, title: "SOMO 1.5M bpd cuts - Fortune", url: "https://fortune.com", date: "2026-03-03" },
      { id: 3, title: "DNO Kurdistan halt - GBAF", url: "https://www.globalbankingandfinance.com", date: "2026-02-28" },
      { id: 4, title: "Majnoon drone strikes - Shafaq News", url: "https://shafaq.com", date: "2026-03-09" },
      { id: 5, title: "Basra terminals halted - Arab News", url: "https://www.arabnews.com", date: "2026-03-12" }
    ]
  },
  {
    id: "bahrain",
    country: "Bahrain",
    flag: "\u{1F1E7}\u{1F1ED}",
    status: "critical",
    statusLabel: "FM / Struck",
    summary: "Alba FM on aluminium. BAPCO Sitra refinery (405 kb/d) struck by missiles twice. Bapco Energies FM on all operations. Abu Safa shut.",
    metrics: {
      headline: "405 kb/d refining offline",
      productionOffline: "Sitra refinery + Abu Safa field",
      keyFigure: "Full export revenue suspended"
    },
    events: [
      {
        date: "2026-03-09",
        title: "Bapco Energies FM on all group operations",
        description: "Bapco Energies declared FM on all group operations. Sitra refinery struck for second time. 405 kb/d offline. Local fuel supply secured but exports halted."
      },
      {
        date: "2026-03-04",
        title: "Alba FM + BAPCO Sitra missile strike",
        description: "Aluminium Bahrain (Alba) declared FM on aluminium shipments - smelter running but cannot ship. BAPCO Sitra refinery hit by missile. UK withdrew staff."
      }
    ],
    oilGasImpact: {
      severity: "critical",
      summary: "405 kb/d refining offline, FM declared",
      details: "BAPCO Sitra refinery (405 kb/d) struck by missiles on 4 Mar and 9 Mar. Bapco Energies declared FM on all group operations. Alba aluminium smelter FM - cannot ship via Hormuz. Abu Safa shared field (with Saudi) shut. UK evacuated personnel."
    },
    infrastructure: [
      { name: "Bahrain Field (Awali)", type: "Oil Field", capacity: "~45,000 bpd", status: "operational" },
      { name: "Abu Safa Field (shared)", type: "Offshore Oil", capacity: "~300,000 bpd", status: "shutdown" },
      { name: "BAPCO Sitra Refinery", type: "Refinery", capacity: "405,000 bpd", status: "shutdown" },
      { name: "Bahrain LNG Import", type: "LNG Import", capacity: "~800 mmscf/d", status: "partial" },
      { name: "Alba Aluminium Smelter", type: "Smelter", capacity: "~1.56 Mtpa", status: "partial" },
      { name: "Sitra Marine Terminal", type: "Export Terminal", capacity: "~200,000 bpd", status: "shutdown" }
    ],
    sources: [
      { id: 1, title: "Alba FM - Bloomberg", url: "https://www.bloomberg.com", date: "2026-03-04" },
      { id: 2, title: "BAPCO Sitra strike - Argus", url: "https://www.argusmedia.com", date: "2026-03-04" },
      { id: 3, title: "Bapco Energies FM - Bloomberg", url: "https://www.bloomberg.com", date: "2026-03-09" },
      { id: 4, title: "Sitra 2nd strike - Euronews", url: "https://www.euronews.com", date: "2026-03-09" }
    ]
  },
  {
    id: "oman",
    country: "Oman",
    flag: "\u{1F1F4}\u{1F1F2}",
    status: "high",
    statusLabel: "Collateral",
    summary: "Salalah Port oil tanks hit by Iranian drones. Fire confirmed. Maersk suspended all Salalah operations. Duqm Port also struck. Production intact.",
    metrics: {
      headline: "Export infrastructure damaged",
      productionOffline: "Production intact (~650k bpd)",
      keyFigure: "Salalah oil storage destroyed"
    },
    events: [
      {
        date: "2026-03-11",
        title: "Salalah Port oil tanks struck by Iranian drones",
        description: "Salalah Port oil storage tanks hit by Iranian Shahed drones. Fire confirmed. Maersk suspended all Salalah Port operations until further notice."
      },
      {
        date: "2026-03-01",
        title: "Duqm Port and Salalah struck - collateral",
        description: "Duqm Port and Salalah struck in regional escalation. Foreign worker casualties reported. No formal FM declared by Oman."
      }
    ],
    oilGasImpact: {
      severity: "moderate",
      summary: "Export infrastructure damaged, production intact",
      details: "Salalah Port oil storage struck by drones on 11 Mar with confirmed fire. Maersk suspended all Salalah operations. Duqm Port struck earlier. Oil production from inland fields (PDO, BP Khazzan) largely unaffected. Export infrastructure damaged but Mina Al-Fahal terminal operational."
    },
    infrastructure: [
      { name: "PDO Fields (Block 6)", type: "Oil/Gas Fields", capacity: "~650,000 bpd", status: "operational" },
      { name: "Mukhaizna Field", type: "Heavy Oil", capacity: "~120,000 bpd", status: "operational" },
      { name: "Khazzan Gas Field (BP)", type: "Gas Field", capacity: "~1.5 Bcf/d", status: "operational" },
      { name: "Oman LNG (Qalhat)", type: "LNG Plant", capacity: "10.4 Mtpa", status: "partial" },
      { name: "Sohar Refinery", type: "Refinery", capacity: "198,000 bpd", status: "operational" },
      { name: "Duqm Refinery", type: "Refinery", capacity: "230,000 bpd", status: "operational" },
      { name: "Mina Al-Fahal Terminal", type: "Export Terminal", capacity: "~900,000 bpd", status: "operational" },
      { name: "Salalah Port / Oil Storage", type: "Port/Storage", capacity: "Major storage", status: "shutdown" },
      { name: "Duqm Port & SEZ", type: "Port", capacity: "Multi-purpose", status: "partial" }
    ],
    sources: [
      { id: 1, title: "Duqm/Salalah struck - Anadolu", url: "https://www.aa.com.tr", date: "2026-03-01" },
      { id: 2, title: "Salalah tanks hit - Al Jazeera", url: "https://www.aljazeera.com", date: "2026-03-11" },
      { id: 3, title: "Salalah fire - Argus", url: "https://www.argusmedia.com", date: "2026-03-11" },
      { id: 4, title: "Maersk suspends Salalah - Maersk", url: "https://www.maersk.com", date: "2026-03-11" }
    ]
  },
  {
    id: "israel",
    country: "Israel",
    flag: "\u{1F1EE}\u{1F1F1}",
    status: "conflict",
    statusLabel: "Conflict / FM",
    summary: "Chevron FM on Leviathan gas field. Karish shut per ministry order. Tamar domestic only. All gas exports to Egypt and Jordan halted.",
    metrics: {
      headline: "~1.8 Bcf/d gas offline",
      productionOffline: "Leviathan + Karish shut",
      keyFigure: "Egypt/Jordan gas exports halted"
    },
    events: [
      {
        date: "2026-03-01",
        title: "Chevron declares FM on Leviathan gas field",
        description: "Chevron declared Force Majeure on Leviathan after government-ordered suspension. Israel's largest gas field offline. Gas exports to Egypt and Jordan halted."
      },
      {
        date: "2026-03-01",
        title: "Tamar producing domestic only - exports halted",
        description: "Tamar gas field continues producing for domestic consumption. All regional gas exports (EMG pipeline to Egypt, JNGET to Jordan) halted."
      },
      {
        date: "2026-02-28",
        title: "Karish gas field shut per ministry instruction",
        description: "Energean shut Karish offshore gas field per Israeli Energy Ministry instruction. FPSO Energean Power offline. Precautionary shutdown."
      }
    ],
    oilGasImpact: {
      severity: "critical",
      summary: "~1.8 Bcf/d gas offline, exports halted",
      details: "Leviathan (Chevron FM) and Karish (ministry shutdown) offline. Tamar producing for domestic only. All gas exports to Egypt and Jordan halted. Regional conflict is the primary driver of broader Middle East disruptions."
    },
    infrastructure: [
      { name: "Leviathan Gas Field", type: "Offshore Gas", capacity: "~1.2 Bcf/d", status: "shutdown" },
      { name: "Tamar Gas Field", type: "Offshore Gas", capacity: "~1.0 Bcf/d", status: "partial" },
      { name: "Karish Gas Field", type: "Offshore Gas", capacity: "~0.6 Bcf/d", status: "shutdown" },
      { name: "EMG Pipeline (Israel-Egypt)", type: "Subsea Pipeline", capacity: "~700 mmscf/d", status: "shutdown" },
      { name: "JNGET Pipeline (Israel-Jordan)", type: "Gas Pipeline", capacity: "~300 mmscf/d", status: "shutdown" },
      { name: "Ashdod Refinery (Bazan)", type: "Refinery", capacity: "~100,000 bpd", status: "partial" },
      { name: "EAPC Pipeline", type: "Pipeline", capacity: "~600,000 bpd", status: "partial" }
    ],
    sources: [
      { id: 1, title: "Chevron Leviathan FM - Yahoo Finance", url: "https://finance.yahoo.com", date: "2026-03-01" },
      { id: 2, title: "Leviathan FM - OilPrice.com", url: "https://oilprice.com", date: "2026-03-01" },
      { id: 3, title: "Karish shutdown - Sharecast", url: "https://www.sharecast.com", date: "2026-02-28" },
      { id: 4, title: "Israel gas shutdowns - World Oil", url: "https://www.worldoil.com", date: "2026-03-01" }
    ]
  }
];

// ---------- TABLE 2: Force Majeure Declarations ----------
const FM_DECLARATIONS_DATA = [
  {
    id: "fm-001",
    company: "QatarEnergy",
    country: "Qatar",
    flag: "\u{1F1F6}\u{1F1E6}",
    date: "2026-03-04",
    status: "active",
    statusLabel: "Active",
    summary: "FM on all LNG exports globally. All downstream (polymers, methanol, urea) also halted. ~20% of global LNG supply removed.",
    details: {
      volumeAffected: "~7 million tonnes/month (~20% global LNG supply); all downstream halted",
      commodity: "LNG, Polymers, Methanol, Urea, Aluminium",
      duration: "Indefinite - all production halted since 2 Mar",
      reason: "Iranian drone strikes on Ras Laffan and Mesaieed facilities; Strait of Hormuz blocked.",
      financialImpact: "Brent surged to $104/bbl. Dutch/British gas prices surged ~50%. Asian LNG spot prices jumped ~39%."
    },
    sources: [
      { id: 1, title: "QatarEnergy halts LNG - Al Jazeera", url: "https://www.aljazeera.com/news/2026/3/2/qatarenergy-worlds-largest-lng-firm-halts-production-after-iran-attacks", date: "2026-03-02" },
      { id: 2, title: "Qatar LNG shutdown - Bloomberg", url: "https://www.bloomberg.com/news/articles/2026-03-02/qatar-stops-lng-production-at-world-s-top-plant-after-attack", date: "2026-03-02" },
      { id: 3, title: "QatarEnergy FM - ROIC News", url: "https://www.roic.ai/news/qatarenergy-halts-all-lng-production-after-iranian-attacks-four-week-recovery-expected-03-04-2026", date: "2026-03-04" }
    ]
  },
  {
    id: "fm-019",
    company: "Shell",
    country: "UK / Global",
    flag: "\u{1F1EC}\u{1F1E7}",
    date: "2026-03-11",
    status: "active",
    statusLabel: "Active",
    summary: "FM on Qatar-sourced LNG contracts to Asia/Europe clients. April deliveries impacted.",
    details: {
      volumeAffected: "QatarEnergy-sourced LNG offtake contracts",
      commodity: "LNG",
      duration: "Ongoing - April deliveries confirmed impacted",
      reason: "Upstream QatarEnergy FM; Shell unable to fulfill downstream obligations.",
      financialImpact: "Downstream LNG obligations suspended; buyers scrambling for alternatives."
    },
    sources: [
      { id: 1, title: "Shell FM - Al Jazeera", url: "https://www.aljazeera.com/economy/2026/3/11/shell-declares-force-majeure-on-lng-contracts-from-qatar", date: "2026-03-11" },
      { id: 2, title: "Shell FM - Bloomberg", url: "https://www.bloomberg.com/news/articles/2026-03-11/shell-declares-force-majeure-on-lng-contracts-from-qatar", date: "2026-03-11" }
    ]
  },
  {
    id: "fm-020",
    company: "TotalEnergies",
    country: "France",
    flag: "\u{1F1EB}\u{1F1F7}",
    date: "2026-03-11",
    status: "active",
    statusLabel: "Active",
    summary: "FM on 5.2 Mtpa Qatar LNG offtake. Europe and Asia buyers notified.",
    details: {
      volumeAffected: "5.2 Mtpa Qatar LNG offtake",
      commodity: "LNG",
      duration: "Ongoing - buyers notified",
      reason: "QatarEnergy upstream FM; unable to deliver contracted volumes.",
      financialImpact: "5.2 Mtpa represents significant portion of TotalEnergies' LNG portfolio."
    },
    sources: [
      { id: 1, title: "TotalEnergies FM - OilPrice.com", url: "https://oilprice.com/Latest-Energy-News/World-News/Shell-and-TotalEnergies-Issue-Force-Majeure-After-Qatar-LNG-Shut-Down.html", date: "2026-03-11" },
      { id: 2, title: "TotalEnergies FM - Manila Times", url: "https://www.manilatimes.net", date: "2026-03-11" }
    ]
  },
  {
    id: "fm-023",
    company: "Wanhua Chemical",
    country: "China",
    flag: "\u{1F1E8}\u{1F1F3}",
    date: "2026-03-09",
    status: "active",
    statusLabel: "Active",
    summary: "FM on Middle East supplies. Hormuz shipping disruption makes delivery impossible. 2.2 Mtpa ethylene capacity.",
    details: {
      volumeAffected: "All Middle East supply contracts; 2.2 Mtpa ethylene capacity at Yantai",
      commodity: "Isocyanates, Polyurethane derivatives",
      duration: "Effective 7 Mar, declared 9 Mar - indefinite",
      reason: "Severe disruption of Strait of Hormuz shipping routes making delivery impossible or unreasonably dangerous.",
      financialImpact: "Polyurethane supply chain disrupted across Middle East and Asia."
    },
    sources: [
      { id: 1, title: "Wanhua Chemical FM - Hydrocarbon Processing", url: "https://hydrocarbonprocessing.com/news/2026/03/chinas-wanhua-chemical-declares-force-majeure-on-supplies-to-middle-east/", date: "2026-03-09" },
      { id: 2, title: "Wanhua FM - OE Digital", url: "https://energynews.oedigital.com/refined-products/2026/03/09/wanhua-chemical-a-chinese-company-declares-force-majeure-for-middle-east-supplies", date: "2026-03-09" }
    ]
  },
  {
    id: "fm-004",
    company: "Bapco Energies",
    country: "Bahrain",
    flag: "\u{1F1E7}\u{1F1ED}",
    date: "2026-03-09",
    status: "active",
    statusLabel: "Active",
    summary: "FM on all group operations after Sitra refinery struck 2nd time. 405 kb/d offline.",
    details: {
      volumeAffected: "405 kb/d (full Sitra refinery capacity)",
      commodity: "Refined Petroleum Products",
      duration: "Indefinite - refinery + exports suspended",
      reason: "Sitra refinery struck by missile a second time on 9 Mar.",
      financialImpact: "Full export and refining revenue suspended; local supply prioritized."
    },
    sources: [
      { id: 1, title: "Bapco FM - Financial Content", url: "https://markets.financialcontent.com/stocks/article/marketminute-2026-3-9-bahrains-bapco-declares-force-majeure-after-iranian-refinery-strike", date: "2026-03-09" },
      { id: 2, title: "Bapco FM - Euronews", url: "https://www.euronews.com", date: "2026-03-09" }
    ]
  },
  {
    id: "fm-002",
    company: "Kuwait Petroleum Corp (KPC)",
    country: "Kuwait",
    flag: "\u{1F1F0}\u{1F1FC}",
    date: "2026-03-07",
    status: "active",
    statusLabel: "Active",
    summary: "FM on crude exports from 2.6 mb/d baseline. Refineries lowering throughput to 1.4M bpd. Kafco struck.",
    details: {
      volumeAffected: "~1.2 mb/d crude export cuts (from 2.6 mb/d baseline)",
      commodity: "Crude Oil",
      duration: "Ongoing - escalated 9 Mar with Subiya fire",
      reason: "Regional military escalation; Kafco fuel tanks struck; 6 drones intercepted over Kuwait.",
      financialImpact: "Major crude export disruption; refineries forced to lower throughput."
    },
    sources: [
      { id: 1, title: "KPC FM - Express Tribune", url: "https://tribune.com.pk", date: "2026-03-07" },
      { id: 2, title: "Kuwait FM - Sunday Guardian", url: "https://sundayguardianlive.com/world/iran-israel-tensions-will-saudi-arabia-follow-kuwaits-oil-cuts-declares-force-majeure-as-hormuz-blockade-enters-day-8-20-of-global-oil-supply-suspended-174606/", date: "2026-03-07" }
    ]
  },
  {
    id: "fm-021",
    company: "Evergreen Marine",
    country: "Taiwan",
    flag: "\u{1F1F9}\u{1F1FC}",
    date: "2026-03-06",
    status: "active",
    statusLabel: "Active",
    summary: "FM on all Gulf bookings. Suspended services to Bahrain, Kuwait, Qatar, UAE, Saudi, Iraq.",
    details: {
      volumeAffected: "All Gulf-bound container bookings",
      commodity: "Maritime Shipping",
      duration: "Indefinite",
      reason: "Regional military escalation; all Gulf port calls suspended.",
      financialImpact: "Full Gulf service revenue suspended."
    },
    sources: [
      { id: 1, title: "Evergreen FM - ShipmentLink", url: "https://www.shipmentlink.com", date: "2026-03-06" },
      { id: 2, title: "Evergreen FM - Container Mag", url: "https://www.container-mag.com", date: "2026-03-06" }
    ]
  },
  {
    id: "fm-005",
    company: "Chevron (Leviathan field)",
    country: "Israel",
    flag: "\u{1F1EE}\u{1F1F1}",
    date: "2026-03-01",
    status: "active",
    statusLabel: "Active",
    summary: "FM on Leviathan gas field after govt-ordered suspension. Egypt/Jordan gas exports halted.",
    details: {
      volumeAffected: "Leviathan ~22 bcm/yr; Egypt & Jordan exports halted",
      commodity: "Natural Gas",
      duration: "Ongoing since 1 Mar 2026",
      reason: "Government-ordered suspension amid regional military escalation.",
      financialImpact: "Egypt and Jordan pipeline gas exports halted; downstream energy shortages."
    },
    sources: [
      { id: 1, title: "Chevron FM - Yahoo Finance", url: "https://finance.yahoo.com", date: "2026-03-01" },
      { id: 2, title: "Leviathan FM - OilPrice.com", url: "https://oilprice.com", date: "2026-03-01" }
    ]
  },
  {
    id: "fm-015",
    company: "Gujarat Gas",
    country: "India",
    flag: "\u{1F1EE}\u{1F1F3}",
    date: "2026-03-05",
    status: "active",
    statusLabel: "Active",
    summary: "FM to industrial customers. 50% supply cut. Stock fell -6.7%.",
    details: {
      volumeAffected: "50% supply cut to industrial customers",
      commodity: "Natural Gas (piped)",
      duration: "Ongoing",
      reason: "LNG supply cascade from QatarEnergy FM; insufficient gas for industrial demand.",
      financialImpact: "Gujarat Gas stock dropped -6.7%."
    },
    sources: [
      { id: 1, title: "Gujarat Gas FM - DeshGujarat", url: "https://www.deshgujarat.com", date: "2026-03-05" },
      { id: 2, title: "Gujarat Gas impact - OfficeNewz", url: "https://www.officenewz.com", date: "2026-03-05" }
    ]
  },
  {
    id: "fm-018",
    company: "PCS (Singapore)",
    country: "Singapore",
    flag: "\u{1F1F8}\u{1F1EC}",
    date: "2026-03-05",
    status: "active",
    statusLabel: "Active",
    summary: "FM on petrochemical products due to Middle East feedstock disruption.",
    details: {
      volumeAffected: "Petrochemical product output",
      commodity: "Petrochemicals",
      duration: "Ongoing",
      reason: "Middle East naphtha/condensate feedstock supply disrupted.",
      financialImpact: "Singapore petchem hub output reduced."
    },
    sources: [
      { id: 1, title: "PCS FM - OE Digital", url: "https://energynews.oedigital.com/crude-oil/2026/03/05/singapores-pcs-declares-petrochemical-force-majeure-a-letter-shows", date: "2026-03-05" },
      { id: 2, title: "Singapore petchem FM - Baird Maritime", url: "https://www.bairdmaritime.com", date: "2026-03-05" }
    ]
  },
  {
    id: "fm-006",
    company: "Hydro / Qatalum (JV)",
    country: "Norway / Qatar",
    flag: "\u{1F1F3}\u{1F1F4}",
    date: "2026-03-03",
    status: "active",
    statusLabel: "Active",
    summary: "FM on aluminium. Smelter maintaining scaled-down production. Restart estimated 6-12 months.",
    details: {
      volumeAffected: "585,000 tonnes/year (full smelter capacity)",
      commodity: "Aluminium",
      duration: "Restart estimated 6-12 months after resolution",
      reason: "Hormuz disruption preventing raw material imports and product exports.",
      financialImpact: "Smelter restart costs typically $100M+."
    },
    sources: [
      { id: 1, title: "Hydro Qatalum FM - Hydro.com", url: "https://www.hydro.com", date: "2026-03-03" },
      { id: 2, title: "Qatalum scaled-down production - GlobeNewsWire", url: "https://www.globenewswire.com/news-release/2026/03/12/3254424/0/en/Norsk-Hydro-Qatalum-maintaining-scaled-down-aluminium-production.html", date: "2026-03-12" }
    ]
  },
  {
    id: "fm-003",
    company: "Aluminium Bahrain (Alba)",
    country: "Bahrain",
    flag: "\u{1F1E7}\u{1F1ED}",
    date: "2026-03-04",
    status: "active",
    statusLabel: "Active",
    summary: "FM on aluminium shipments. Smelter running but cannot ship via Hormuz. BAPCO Sitra struck by missile.",
    details: {
      volumeAffected: "Full aluminium deliveries halted; BAPCO Sitra 405 kb/d struck",
      commodity: "Aluminium / Refined Products",
      duration: "Ongoing - Sitra struck 2nd time on 9 Mar",
      reason: "Hormuz shipping disruption; BAPCO Sitra missile strike; UK withdrew staff.",
      financialImpact: "Aluminium delivery obligations suspended; refinery damage ongoing."
    },
    sources: [
      { id: 1, title: "Alba FM - Newsweek", url: "https://www.newsweek.com/what-is-force-majeure-gulf-companies-shut-down-oil-production-11637203", date: "2026-03-04" },
      { id: 2, title: "Alba/Sitra - Kitco", url: "https://www.kitco.com", date: "2026-03-04" }
    ]
  },
  {
    id: "fm-013",
    company: "MRPL (Mangalore Refinery)",
    country: "India",
    flag: "\u{1F1EE}\u{1F1F3}",
    date: "2026-03-04",
    status: "active",
    statusLabel: "Active",
    summary: "FM on gasoline exports. Cutting 500 kb/d of refinery runs due to Gulf crude supply disruption.",
    details: {
      volumeAffected: "500 kb/d refinery throughput cuts; gasoline export FM",
      commodity: "Gasoline / Refined Products",
      duration: "Ongoing",
      reason: "Crude supply disruption from Gulf sources via Hormuz.",
      financialImpact: "Stock declined; refinery margin compression."
    },
    sources: [
      { id: 1, title: "MRPL FM - Bloomberg", url: "https://www.bloomberg.com", date: "2026-03-04" },
      { id: 2, title: "MRPL FM - Business Standard", url: "https://www.business-standard.com", date: "2026-03-04" }
    ]
  },
  {
    id: "fm-014",
    company: "Petronet LNG",
    country: "India",
    flag: "\u{1F1EE}\u{1F1F3}",
    date: "2026-03-04",
    status: "active",
    statusLabel: "Active",
    summary: "FM to QatarEnergy and local buyers after Qatar LNG halt. Stock fell -9.3%.",
    details: {
      volumeAffected: "QatarEnergy long-term LNG contracts (7.5 MTPA Dahej terminal)",
      commodity: "LNG",
      duration: "Linked to QatarEnergy FM resolution",
      reason: "Upstream QatarEnergy FM; inability to receive contracted LNG volumes.",
      financialImpact: "Petronet LNG stock dropped -9.3%."
    },
    sources: [
      { id: 1, title: "Petronet FM - PSU Connect", url: "https://www.psuconnect.in", date: "2026-03-04" },
      { id: 2, title: "Petronet stock fall - Moneylife", url: "https://www.moneylife.in", date: "2026-03-04" }
    ]
  },
  {
    id: "fm-017",
    company: "Yeochun NCC (YNCC)",
    country: "South Korea",
    flag: "\u{1F1F0}\u{1F1F7}",
    date: "2026-03-04",
    status: "active",
    statusLabel: "Active",
    summary: "FM on ethylene production due to total Middle East naphtha supply suspension.",
    details: {
      volumeAffected: "Ethylene production (naphtha cracker dependent)",
      commodity: "Ethylene / Petrochemicals",
      duration: "Ongoing",
      reason: "Total Middle East naphtha supply suspension; cracker feedstock unavailable.",
      financialImpact: "Ethylene and polymer supply chain disrupted across Asia."
    },
    sources: [
      { id: 1, title: "YNCC FM - CMS Law-Now", url: "https://cms-lawnow.com/en/ealerts/2026/03/force-majeure-at-oil-refineries-in-singapore-south-korea-and-china", date: "2026-03-05" },
      { id: 2, title: "Korea cracker FM - TradingView", url: "https://www.tradingview.com", date: "2026-03-05" }
    ]
  },
  {
    id: "fm-022",
    company: "Cosco Shipping",
    country: "China",
    flag: "\u{1F1E8}\u{1F1F3}",
    date: "2026-03-04",
    status: "active",
    statusLabel: "Suspended",
    summary: "Halted all Gulf services. Frozen bookings to UAE, Bahrain, Saudi, Iraq, Kuwait.",
    details: {
      volumeAffected: "All Gulf container and bulk services frozen",
      commodity: "Maritime Shipping",
      duration: "Indefinite",
      reason: "Regional security; all Gulf bookings frozen.",
      financialImpact: "Full Gulf trade revenue suspended."
    },
    sources: [
      { id: 1, title: "Cosco halt - Hong Kong Free Press", url: "https://hongkongfp.com", date: "2026-03-04" },
      { id: 2, title: "Cosco Gulf freeze - Cyprus Shipping", url: "https://www.cyprus-shipping.com", date: "2026-03-04" }
    ]
  },
  {
    id: "fm-016",
    company: "Chandra Asri",
    country: "Indonesia",
    flag: "\u{1F1EE}\u{1F1E9}",
    date: "2026-03-03",
    status: "active",
    statusLabel: "Active",
    summary: "FM on petrochemical production due to Middle East naphtha feedstock loss.",
    details: {
      volumeAffected: "Petrochemical production (naphtha-dependent units)",
      commodity: "Petrochemicals (naphtha-based)",
      duration: "Ongoing - linked to naphtha supply recovery",
      reason: "Middle East naphtha feedstock supply disrupted by Hormuz crisis.",
      financialImpact: "Production suspension; downstream polymer supply affected in SE Asia."
    },
    sources: [
      { id: 1, title: "Chandra Asri FM - Jakarta Post", url: "https://www.jakartapost.com", date: "2026-03-03" },
      { id: 2, title: "Indonesia petchem FM - The Edge Singapore", url: "https://www.theedgesingapore.com", date: "2026-03-03" }
    ]
  },
  {
    id: "fm-009",
    company: "MSC",
    country: "Switzerland",
    flag: "\u{1F1E8}\u{1F1ED}",
    date: "2026-03-03",
    status: "active",
    statusLabel: "Active",
    summary: "End of Voyage FM. $800/container surcharge on Gulf-affected routes.",
    details: {
      volumeAffected: "All Gulf-route container services",
      commodity: "Maritime Shipping",
      duration: "Indefinite",
      reason: "Strait of Hormuz security; End of Voyage FM invoked.",
      financialImpact: "$800/container surcharge applied across affected routes."
    },
    sources: [
      { id: 1, title: "MSC FM - Lloyd's List", url: "https://www.lloydslist.com", date: "2026-03-03" },
      { id: 2, title: "MSC surcharge - Container Mag", url: "https://www.container-mag.com", date: "2026-03-03" }
    ]
  },
  {
    id: "fm-010",
    company: "CMA CGM",
    country: "France",
    flag: "\u{1F1EB}\u{1F1F7}",
    date: "2026-03-02",
    status: "active",
    statusLabel: "Active",
    summary: "Suspended Hormuz and Suez transits. Vessels ordered to shelter positions.",
    details: {
      volumeAffected: "All Gulf and Suez route services",
      commodity: "Maritime Shipping",
      duration: "Indefinite",
      reason: "Strait of Hormuz and Suez Canal security threat.",
      financialImpact: "Full Gulf service revenue suspended; rerouting costs significant."
    },
    sources: [
      { id: 1, title: "CMA CGM FM - Arab News", url: "https://www.arabnews.com", date: "2026-03-02" },
      { id: 2, title: "CMA CGM FM - Kpler", url: "https://www.kpler.com", date: "2026-03-02" }
    ]
  },
  {
    id: "fm-011",
    company: "MEE (Fujairah bunker)",
    country: "UAE",
    flag: "\u{1F1E6}\u{1F1EA}",
    date: "2026-03-02",
    status: "active",
    statusLabel: "Active",
    summary: "FM on marine fuel deliveries across Fujairah bunkering hub. World's 2nd largest hub disrupted.",
    details: {
      volumeAffected: "Marine fuel delivery suspended across UAE hub",
      commodity: "Marine Fuel / Bunker Fuel",
      duration: "Indefinite",
      reason: "Drone attacks on Fujairah area; marine fuel delivery unsafe.",
      financialImpact: "World's 2nd largest bunkering hub disrupted; global vessel refueling affected."
    },
    sources: [
      { id: 1, title: "MEE FM - Argus Media", url: "https://www.argusmedia.com/en/news-and-insights/latest-market-news/2796111-uae-s-fujairah-bunker-suppliers-declare-force-majeure", date: "2026-03-02" },
      { id: 2, title: "Fujairah FM - Ship & Bunker", url: "https://www.shipandbunker.com", date: "2026-03-02" }
    ]
  },
  {
    id: "fm-012",
    company: "Pearl Marine",
    country: "UAE",
    flag: "\u{1F1E6}\u{1F1EA}",
    date: "2026-03-02",
    status: "active",
    statusLabel: "Active",
    summary: "FM on all bunker fuel supply contracts at Fujairah hub.",
    details: {
      volumeAffected: "All bunker fuel supply contracts suspended",
      commodity: "Marine Fuel",
      duration: "Indefinite",
      reason: "Regional security; unable to fulfill Fujairah supply obligations.",
      financialImpact: "Bunker fuel supply contracts force majeure'd."
    },
    sources: [
      { id: 1, title: "Pearl Marine FM - Argus", url: "https://www.argusmedia.com", date: "2026-03-02" },
      { id: 2, title: "Pearl Marine FM - Ship & Bunker", url: "https://www.shipandbunker.com", date: "2026-03-02" }
    ]
  },
  {
    id: "fm-007",
    company: "Hapag-Lloyd",
    country: "Germany",
    flag: "\u{1F1E9}\u{1F1EA}",
    date: "2026-03-01",
    status: "active",
    statusLabel: "Active",
    summary: "FM on Gulf shipping loops. Suspended all Hormuz transits. Rerouting via Cape of Good Hope.",
    details: {
      volumeAffected: "All Gulf container loop services",
      commodity: "Maritime Shipping",
      duration: "Indefinite",
      reason: "Strait of Hormuz security threat; inability to safely transit.",
      financialImpact: "Gulf trade lanes suspended; cargo rerouting costs escalating."
    },
    sources: [
      { id: 1, title: "Hapag-Lloyd FM - Maritime Executive", url: "https://www.maritime-executive.com", date: "2026-03-01" },
      { id: 2, title: "Hapag-Lloyd FM - Container Mag", url: "https://www.container-mag.com", date: "2026-03-01" }
    ]
  },
  {
    id: "fm-008",
    company: "Maersk",
    country: "Denmark",
    flag: "\u{1F1E9}\u{1F1F0}",
    date: "2026-03-01",
    status: "active",
    statusLabel: "Active",
    summary: "Suspended Hormuz transit, Cape reroute. FM under Bill of Lading. All Salalah ops suspended 11 Mar.",
    details: {
      volumeAffected: "All Gulf-bound container services",
      commodity: "Maritime Shipping",
      duration: "Ongoing - escalated 11 Mar with Salalah suspension",
      reason: "Hormuz security; Salalah Port struck by Iranian drones on 11 Mar.",
      financialImpact: "Cape rerouting adds 10-14 days per voyage."
    },
    sources: [
      { id: 1, title: "Maersk FM - France24", url: "https://www.france24.com", date: "2026-03-01" },
      { id: 2, title: "Maersk Salalah - Middle East Eye", url: "https://www.middleeasteye.net", date: "2026-03-11" }
    ]
  }
];

// ---------- TABLE 3: Shutdowns Without FM ----------
const SHUTDOWNS_NO_FM_DATA = [
  {
    id: "sd-016",
    company: "ADNOC / Occidental (Shah Gas Field)",
    country: "UAE",
    flag: "\u{1F1E6}\u{1F1EA}",
    date: "2026-03-16",
    status: "shutdown",
    statusLabel: "Shutdown",
    isNew: true,
    summary: "Drone strike sparked fire at Shah Gas Field. Operations suspended. ~1 Bcf/d gas (20% of UAE gas supply) and 5% of world sulphur offline.",
    details: {
      volumeAffected: "~1 Bcf/d gas, ~50,000 bpd condensate, 5% of global granulated sulphur",
      commodity: "Natural Gas, Condensate, Sulphur",
      duration: "Since 16 Mar 2026, ongoing",
      reason: "Iranian drone strike sparked fire at Shah Gas Field in Empty Quarter. ADNOC/Occidental JV. Operations suspended while damage assessed.",
      financialImpact: "20% of UAE domestic gas supply disrupted. Sulphur market tightening globally."
    },
    sources: [
      { id: 1, title: "Shah Gas Field drone strike - World Oil", url: "https://www.worldoil.com/news/2026/3/16/drone-strike-sparks-fire-at-uae-s-shah-gas-field-operated-by-adnoc-occidental/", date: "2026-03-16" },
      { id: 2, title: "Shah field shutdown - The National", url: "https://www.thenationalnews.com/business/2026/03/17/shah-field-a-vital-gas-and-sulphur-asset-attacked-by-iranian-drones/", date: "2026-03-17" },
      { id: 3, title: "Shah/Fujairah attacks - Cyprus Mail", url: "https://cyprus-mail.com/2026/03/17/attacks-on-uaes-fujairah-port-shah-gas-field-add-to-energy-disruptions", date: "2026-03-17" }
    ]
  },
  {
    id: "sd-017",
    company: "ADNOC (Fujairah Terminal)",
    country: "UAE",
    flag: "\u{1F1E6}\u{1F1EA}",
    date: "2026-03-16",
    status: "shutdown",
    statusLabel: "Shutdown",
    isNew: true,
    summary: "ADNOC suspended crude loading at Fujairah after repeated drone attacks. ~1M bpd Murban crude export capacity halted.",
    details: {
      volumeAffected: "~1 million bpd Murban crude loading (~1% of global demand)",
      commodity: "Crude Oil (Murban)",
      duration: "Loading suspended 16 Mar, 3rd attack 17 Mar - ongoing",
      reason: "Repeated drone attacks on Fujairah oil terminal (14, 16, 17 Mar). ADNOC suspended all crude loading operations.",
      financialImpact: "Murban crude buyers scrambling for alternatives. Fujairah storage at capacity."
    },
    sources: [
      { id: 1, title: "ADNOC loading halted - Yahoo", url: "https://www.yahoo.com/news/articles/oil-loading-operations-suspended-uaes-081836446.html", date: "2026-03-17" },
      { id: 2, title: "Fujairah drone attack - CNBC", url: "https://www.cnbc.com/2026/03/16/uae-fujairah-oil-hub-drone-fire-iran-war-us-israel-middle-east.html", date: "2026-03-16" },
      { id: 3, title: "ADNOC Fujairah halted - Baird Maritime", url: "https://www.bairdmaritime.com/shipping/ports/adnoc-oil-loading-still-halted-at-fujairah-as-other-loadings-resume", date: "2026-03-16" }
    ]
  },
  {
    id: "sd-012",
    company: "Maersk (Salalah operations)",
    country: "Denmark",
    flag: "\u{1F1E9}\u{1F1F0}",
    date: "2026-03-11",
    status: "suspended",
    statusLabel: "Suspended",
    summary: "All Salalah Port operations suspended until further notice after drone strikes. Operational suspension, not FM.",
    details: {
      volumeAffected: "All container and bulk cargo at Salalah",
      commodity: "Refined Products, Containers",
      duration: "Since 11 Mar 2026, indefinite",
      reason: "Security - Iranian drone strikes on Salalah Port oil storage.",
      financialImpact: "Major re-routing; freight rates surged for alternative routes."
    },
    sources: [
      { id: 1, title: "Maersk Salalah suspension - Maersk", url: "https://www.maersk.com", date: "2026-03-11" },
      { id: 2, title: "Maersk Oman halt - Middle East Eye", url: "https://www.middleeasteye.net", date: "2026-03-11" }
    ]
  },
  {
    id: "sd-011",
    company: "Salalah Port / Oil Storage",
    country: "Oman",
    flag: "\u{1F1F4}\u{1F1F2}",
    date: "2026-03-11",
    status: "struck",
    statusLabel: "Struck",
    summary: "Oil storage tanks hit by Iranian Shahed drones. Fire confirmed. No FM declared by Oman.",
    details: {
      volumeAffected: "Oil storage tank farm damaged; port throughput halted",
      commodity: "Crude Oil, Fuel Oil Storage",
      duration: "Since 11 Mar 2026, ongoing",
      reason: "Iranian Shahed-series drones struck oil storage tanks. Fire confirmed.",
      financialImpact: "Oman's southern export route compromised; Gulf shipping insurance surged."
    },
    sources: [
      { id: 1, title: "Salalah tanks hit - Argus Media", url: "https://www.argusmedia.com", date: "2026-03-11" },
      { id: 2, title: "Salalah fire - Middle East Eye", url: "https://www.middleeasteye.net", date: "2026-03-11" }
    ]
  },
  {
    id: "sd-009",
    company: "ADNOC (Ruwais Refinery)",
    country: "UAE",
    flag: "\u{1F1E6}\u{1F1EA}",
    date: "2026-03-10",
    status: "shutdown",
    statusLabel: "Shutdown",
    summary: "Ruwais Refinery-2 (417 kb/d) shut after drone strike. Plant-wide safety audit. No FM declared.",
    details: {
      volumeAffected: "417,000 bpd (Ruwais Refinery-2)",
      commodity: "Refined Products (gasoline, diesel, jet fuel)",
      duration: "Since 10 Mar 2026, ongoing",
      reason: "Drone strike on Ruwais complex; ADNOC ordered plant-wide safety audit.",
      financialImpact: "UAE refined product exports severely curtailed; ADNOC Distribution shares dropped."
    },
    sources: [
      { id: 1, title: "ADNOC Ruwais shutdown - GMA News", url: "https://www.gmanetwork.com/news/topstories/world/979523/uae-oil-giant-adnoc-shuts-ruwais-refinery-after-drone-strike-source-says/story/", date: "2026-03-10" },
      { id: 2, title: "ADNOC safety audit - Bloomberg", url: "https://www.bloomberg.com", date: "2026-03-10" }
    ]
  },
  {
    id: "sd-002",
    company: "Saudi Aramco (Offshore Fields)",
    country: "Saudi Arabia",
    flag: "\u{1F1F8}\u{1F1E6}",
    date: "2026-03-09",
    status: "shutdown",
    statusLabel: "Shutdown",
    summary: "Safaniya, Zuluf, Marjan, Abu Safa shut (~2-2.5M bpd). Storage contagion. No FM declared.",
    details: {
      volumeAffected: "2,000,000-2,500,000 bpd across 4 major offshore fields",
      commodity: "Crude Oil (Arab Heavy, Arab Medium)",
      duration: "Since 9 Mar 2026, ongoing",
      reason: "Precautionary shutdown after drone interceptions at Shaybah; floating storage filled, causing storage contagion.",
      financialImpact: "~20% of Saudi production capacity offline. Brent surged past $100/bbl."
    },
    sources: [
      { id: 1, title: "Aramco offshore shutdown - Maritime Executive", url: "https://www.maritime-executive.com", date: "2026-03-09" },
      { id: 2, title: "Saudi offshore shutdown - Splash247", url: "https://www.splash247.com", date: "2026-03-09" }
    ]
  },
  {
    id: "sd-010",
    company: "Iraq / Majnoon Oil Field",
    country: "Iraq",
    flag: "\u{1F1EE}\u{1F1F6}",
    date: "2026-03-09",
    status: "struck",
    statusLabel: "Struck",
    summary: "Majnoon oil field hit by drones over multiple days (9-12 Mar). Basra terminals halted. No FM declared.",
    details: {
      volumeAffected: "~240,000 bpd (Majnoon); Basra terminal exports suspended",
      commodity: "Crude Oil (Basra Heavy/Medium)",
      duration: "9-12 Mar 2026, ongoing",
      reason: "Repeated drone strikes on Majnoon oil field; Basra terminals suspended loading.",
      financialImpact: "Iraq southern export corridor compromised; Basra crude spot market seized up."
    },
    sources: [
      { id: 1, title: "Majnoon strikes - Shafaq News", url: "https://shafaq.com", date: "2026-03-09" },
      { id: 2, title: "Basra terminals halted - Arab News", url: "https://www.arabnews.com", date: "2026-03-12" }
    ]
  },
  {
    id: "sd-014",
    company: "Kuwait (Subiya Power Plant)",
    country: "Kuwait",
    flag: "\u{1F1F0}\u{1F1FC}",
    date: "2026-03-09",
    status: "ongoing",
    statusLabel: "Ongoing",
    summary: "Subiya power plant fire from intercepted drone debris. Not covered by KPC crude FM declaration.",
    details: {
      volumeAffected: "Subiya power plant partially damaged; gas supply affected",
      commodity: "Natural Gas (power generation)",
      duration: "Since 9 Mar 2026, ongoing",
      reason: "Collateral damage - 6 drones intercepted, debris caused fire. KPC FM (7 Mar) was crude exports only.",
      financialImpact: "Kuwait domestic power disrupted; emergency gas-to-oil switching activated."
    },
    sources: [
      { id: 1, title: "Subiya fire - Times Kuwait", url: "https://www.timeskuwait.com", date: "2026-03-09" },
      { id: 2, title: "Kuwait drones - Arab Times", url: "https://www.arabtimesonline.com", date: "2026-03-09" }
    ]
  },
  {
    id: "sd-013",
    company: "COSCO Shipping (Gulf services)",
    country: "China",
    flag: "\u{1F1E8}\u{1F1F3}",
    date: "2026-03-04",
    status: "suspended",
    statusLabel: "Suspended",
    summary: "All Gulf services halted. Bookings frozen to UAE, Bahrain, Saudi, Iraq, Kuwait. No FM declared.",
    details: {
      volumeAffected: "All container and tanker bookings to 5 Gulf states",
      commodity: "All Commodities",
      duration: "Since ~4 Mar 2026, indefinite",
      reason: "Security risk; Gulf-bound bookings frozen due to Hormuz deterioration.",
      financialImpact: "Chinese crude imports disrupted; China activated SPR drawdowns."
    },
    sources: [
      { id: 1, title: "COSCO Gulf freeze - HKFP", url: "https://hongkongfp.com", date: "2026-03-04" },
      { id: 2, title: "COSCO halt - Cyprus Shipping", url: "https://www.cyprusshippingnews.com", date: "2026-03-04" }
    ]
  },
  {
    id: "sd-003",
    company: "SOMO / Iraq",
    country: "Iraq",
    flag: "\u{1F1EE}\u{1F1F6}",
    date: "2026-03-03",
    status: "ongoing",
    statusLabel: "Ongoing",
    summary: "1.5M+ bpd cuts. Rumaila shut (700 kb/d), WQ2 cut (460 kb/d), Kurdistan halted. No FM declared.",
    details: {
      volumeAffected: "1,500,000+ bpd total - Rumaila 700 kb/d, WQ2 460 kb/d, Kurdistan halted",
      commodity: "Crude Oil",
      duration: "Ongoing since 28 Feb - 3 Mar 2026",
      reason: "Regional security escalation. SOMO denied sanctions rumors. Multiple operators halted simultaneously.",
      financialImpact: "~30% of Iraq's 4.5M bpd production offline. Basra differentials widened."
    },
    sources: [
      { id: 1, title: "Iraq output crashes - Bloomberg", url: "https://www.bloomberg.com", date: "2026-03-03" },
      { id: 2, title: "SOMO cuts confirmed - Fortune", url: "https://fortune.com", date: "2026-03-03" }
    ]
  },
  {
    id: "sd-001",
    company: "Saudi Aramco (Ras Tanura)",
    country: "Saudi Arabia",
    flag: "\u{1F1F8}\u{1F1E6}",
    date: "2026-03-02",
    status: "shutdown",
    statusLabel: "Shutdown",
    summary: "Ras Tanura refinery (550 kb/d) shut after Shaybah drone targeting. LPG suspended. Crude rerouted to Yanbu.",
    details: {
      volumeAffected: "550,000 bpd refining; LPG exports suspended",
      commodity: "Crude Oil, LPG",
      duration: "Ongoing since 2 Mar 2026",
      reason: "Security threat - Shaybah targeted by drones; Ras Tanura shut as precaution. Crude rerouted to Yanbu via East-West Pipeline.",
      financialImpact: "Asian crude term-contract liftings disrupted; LPG spot prices spiked ~15%."
    },
    sources: [
      { id: 1, title: "Aramco Ras Tanura shutdown - Bloomberg", url: "https://www.bloomberg.com", date: "2026-03-02" },
      { id: 2, title: "Aramco reroutes to Yanbu - Argus", url: "https://www.argusmedia.com", date: "2026-03-02" }
    ]
  },
  {
    id: "sd-015",
    company: "Salalah/Duqm Ports (Oman)",
    country: "Oman",
    flag: "\u{1F1F4}\u{1F1F2}",
    date: "2026-03-01",
    status: "ongoing",
    statusLabel: "Ongoing",
    summary: "Duqm Port and Salalah struck by collateral damage. Foreign worker casualties. No FM declared.",
    details: {
      volumeAffected: "Port operations disrupted; oil storage/terminal throughput affected",
      commodity: "Crude Oil, Refined Products",
      duration: "Ongoing since ~1 Mar 2026",
      reason: "Collateral damage from regional military strikes. Foreign worker casualties confirmed.",
      financialImpact: "Oman crude exports delayed; Duqm refinery (230 kb/d) operations uncertain."
    },
    sources: [
      { id: 1, title: "Oman ports struck - Anadolu", url: "https://www.aa.com.tr", date: "2026-03-01" },
      { id: 2, title: "Duqm/Salalah - Al Jazeera", url: "https://www.aljazeera.com", date: "2026-03-01" }
    ]
  },
  {
    id: "sd-008",
    company: "Energean (Karish field)",
    country: "Israel",
    flag: "\u{1F1EE}\u{1F1F1}",
    date: "2026-02-28",
    status: "shutdown",
    statusLabel: "Shutdown",
    summary: "Karish gas platform shut per Israeli Ministry instruction. No separate FM by Energean.",
    details: {
      volumeAffected: "~6.2 Bcm/yr capacity (Karish)",
      commodity: "Natural Gas, Condensate",
      duration: "Since 28 Feb 2026, ongoing",
      reason: "Government-ordered shutdown per Israeli Energy Ministry instruction.",
      financialImpact: "Israel activated emergency gas reserves."
    },
    sources: [
      { id: 1, title: "Karish shutdown - Sharecast", url: "https://www.sharecast.com", date: "2026-02-28" },
      { id: 2, title: "Karish closure - World Oil", url: "https://www.worldoil.com", date: "2026-02-28" }
    ]
  },
  {
    id: "sd-004",
    company: "DNO ASA",
    country: "Iraq / Norway",
    flag: "\u{1F1EE}\u{1F1F6}",
    date: "2026-02-28",
    status: "halted",
    statusLabel: "Halted",
    summary: "All Kurdistan oil field operations halted. Coordinated with KRG. No FM declared.",
    details: {
      volumeAffected: "~100,000 bpd (Tawke + Peshkabir fields)",
      commodity: "Crude Oil",
      duration: "Since 28 Feb 2026, ongoing",
      reason: "Precautionary halt coordinated with Kurdistan Regional Government.",
      financialImpact: "DNO shares dropped ~12% on Oslo Bors."
    },
    sources: [
      { id: 1, title: "DNO halt - GBAF", url: "https://www.gbaf.com", date: "2026-02-28" },
      { id: 2, title: "DNO Kurdistan - World Energy News", url: "https://www.worldenergynews.com", date: "2026-02-28" }
    ]
  },
  {
    id: "sd-005",
    company: "Gulf Keystone Petroleum",
    country: "Iraq / UK",
    flag: "\u{1F1EE}\u{1F1F6}",
    date: "2026-02-28",
    status: "halted",
    statusLabel: "Halted",
    summary: "Sheikhan oil field halted citing regional security. No FM declared.",
    details: {
      volumeAffected: "~40,000 bpd (Sheikhan field)",
      commodity: "Crude Oil",
      duration: "Since 28 Feb 2026, ongoing",
      reason: "Regional security - precautionary shutdown.",
      financialImpact: "Shares fell sharply on London AIM market."
    },
    sources: [
      { id: 1, title: "Gulf Keystone halt - The New Region", url: "https://www.thenewregion.com", date: "2026-02-28" }
    ]
  },
  {
    id: "sd-006",
    company: "Dana Gas",
    country: "Iraq / UAE",
    flag: "\u{1F1EE}\u{1F1F6}",
    date: "2026-02-28",
    status: "halted",
    statusLabel: "Halted",
    summary: "Khor Mor gas field in Kurdistan halted. No FM declared.",
    details: {
      volumeAffected: "~450 MMscf/d gas (Khor Mor field)",
      commodity: "Natural Gas, Condensate",
      duration: "Since 28 Feb 2026, ongoing",
      reason: "Precautionary shutdown due to regional security escalation.",
      financialImpact: "Kurdistan domestic gas supply disrupted."
    },
    sources: [
      { id: 1, title: "Dana Gas halt - ZAWYA", url: "https://www.zawya.com", date: "2026-02-28" }
    ]
  },
  {
    id: "sd-007",
    company: "HKN Energy",
    country: "Iraq",
    flag: "\u{1F1EE}\u{1F1F6}",
    date: "2026-02-28",
    status: "halted",
    statusLabel: "Halted",
    summary: "Kurdistan oil production halted as precautionary measure. No FM declared.",
    details: {
      volumeAffected: "~30,000 bpd (Sarsang block)",
      commodity: "Crude Oil",
      duration: "Since 28 Feb 2026, ongoing",
      reason: "Precautionary; coordinated with other Kurdistan operators.",
      financialImpact: "Kurdistan export pipeline flows reduced to zero."
    },
    sources: [
      { id: 1, title: "HKN halt - Al Jazeera", url: "https://www.aljazeera.com", date: "2026-02-28" },
      { id: 2, title: "HKN halt - Modern Diplomacy", url: "https://www.moderndiplomacy.eu", date: "2026-02-28" }
    ]
  }
];
