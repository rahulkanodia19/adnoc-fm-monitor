# SOH Data Sync — Browser-Based Kpler Fetch

You are syncing Strait of Hormuz vessel and flow data from Kpler Terminal using Chrome browser automation.

**Important:** Do NOT use `sync-soh.js` — it fails with 401 because Kpler requires browser cookies. Instead, fetch data directly from the browser which already has full authentication.

## Step 1: Load Kpler Terminal

Navigate to `https://terminal.kpler.com` using the Chrome browser. It should already be logged in via the persistent Chrome profile. Wait for the page to load.

If the page redirects to a login screen, STOP and report that Kpler login is required.

## Step 2: Fetch Vessel Data

Use `evaluate_script` to fetch all vessels in the Hormuz monitoring zone directly from the browser:

```javascript
async () => {
  const resp = await fetch('/api/vessels?zones=107647&size=10000', {
    headers: { 'accept': 'application/json' }
  });
  const vessels = await resp.json();
  // Extract summary fields and filter to Hormuz area
  return vessels.filter(v => {
    const lat = v.lastPosition?.geo?.lat;
    const lng = v.lastPosition?.geo?.lon;
    return lat && lng && lat >= 23 && lat <= 31 && lng >= 47 && lng <= 58.5;
  }).map(v => ({
    name: v.name, imo: v.imo, mmsi: v.mmsi,
    vesselTypeClass: v.vesselTypeClass, state: v.state,
    flagName: v.flagName, deadWeight: v.deadWeight,
    commodityTypes: v.commodityTypes,
    capacity: v.cargoMetrics?.capacity,
    speed: v.lastPosition?.speed,
    course: v.lastPosition?.course,
    lat: v.lastPosition?.geo?.lat, lng: v.lastPosition?.geo?.lon,
    destination: v.nextDestination?.zone?.name,
    destinationEta: v.nextDestination?.eta,
    aisDestination: v.lastPosition?.destination || null,
    product: v.lastPosition?.currentCargo?.products?.[0]?.name,
    controller: v.vesselController?.default?.name,
    lastPortCall: v.portCallInfo?.lastPortCall,
  }));
}
```

The result will be large (~600KB). Save it to `soh-data/vessels.json`.

If the response is too large for evaluate_script, the tool will save it to a temp file. Parse that file and write the extracted JSON array to `soh-data/vessels.json`.

Verify: the file should contain 900-1200 vessel objects.

## Step 3: Fetch Flow Data

Use `evaluate_script` to fetch all 7 flow datasets in one call:

```javascript
async () => {
  const ZONE = 107647;
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const d90 = new Date(now - 90*86400000).toISOString().split('T')[0];
  const d2y = new Date(now - 730*86400000).toISOString().split('T')[0];
  const headers = { 'accept': 'application/json', 'content-type': 'application/json' };

  function body(opts) {
    return JSON.stringify({
      cumulative: false, filters: { product: [] },
      flowDirection: opts.dir || 'export',
      fromLocations: [], toLocations: [],
      toLocationsExclude: [], fromLocationsExclude: [],
      viaRoute: [{ id: ZONE, resourceType: 'zone' }],
      viaRouteExclude: [],
      granularity: opts.gran, interIntra: 'interintra',
      onlyRealized: false, withBetaVessels: false,
      withForecasted: true, withGrades: false,
      withIncompleteTrades: true, withIntraCountry: false,
      withProductEstimation: false,
      vesselClassifications: [], vessels: [],
      startDate: opts.start, endDate: end,
      numberOfSplits: opts.splits || 10,
      ...(opts.split ? { split: opts.split } : {}),
    });
  }

  const queries = [
    { key: 'flows-daily', b: body({gran:'days',start:d90,dir:'export'}) },
    { key: 'flows-daily-import', b: body({gran:'days',start:d90,dir:'import'}) },
    { key: 'flows-weekly', b: body({gran:'weeks',start:d2y,dir:'export'}) },
    { key: 'flows-weekly-import', b: body({gran:'weeks',start:d2y,dir:'import'}) },
    { key: 'flows-monthly', b: body({gran:'months',start:d2y,dir:'export'}) },
    { key: 'flows-monthly-import', b: body({gran:'months',start:d2y,dir:'import'}) },
    { key: 'flows-product', b: body({gran:'months',start:d2y,split:'Products',splits:15}) },
  ];

  const results = {};
  for (const q of queries) {
    const r = await fetch('/api/flows', { method:'POST', headers, body: q.b });
    results[q.key] = r.ok ? await r.json() : { error: r.status };
  }
  return results;
}
```

Save each key as `soh-data/<key>.json`.

## Step 4: Verify (processing happens after agent completes)

Note: Container ship merging (S&P MINT) and full data processing (process-soh.js) are handled by the sync-soh.sh shell wrapper after this agent completes. The agent only needs to fetch Kpler vessels and flows.

## Step 5: Verify

Read `soh-data/summary.json` and check:
- `syncTimestamp` is within the last few minutes
- `insideTotal` is roughly 600-900
- `outsideTotal` is roughly 200-500
- `adnocCount` is roughly 8-11
- `totalVessels` is roughly 900-1200

Also check `soh-data/crisis-transits.json` has `totalVessels` > 0.

Note: 3 ADNOC container ships (AL BAZM-II, AL REEM I, AL SADR-I) are tracked via S&P MINT (not Kpler).
They are merged into vessels.json by the shell wrapper and appear with `dataSource: 'mint'`.

Report the key numbers: Inside, Outside, ADNOC count, Total, Transit, Crisis transits.
