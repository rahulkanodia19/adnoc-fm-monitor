# Flow Data Sync — Kpler xlsx Download

You are automating the download of import/export flow data from Kpler Terminal. You will navigate to 48 Kpler URLs, download xlsx files, and move them to the correct project directories.

---

## Step 1: Read configuration

Read `scripts/kpler-ids.json` for zone IDs and product IDs. Then build the full URL list.

### Import URLs (18 total — 6 countries × 3 commodities)

Pattern: `https://terminal.kpler.com/cargo/flows?productEstimation=false&projection=actual&split=origin--country&granularity=days&unit={unit}&dates=1m&mZones={zoneId}&products={productId}&dir=import`

| Key | Country | Zone | Commodity | Product | Unit |
|-----|---------|------|-----------|---------|------|
| china_crude | China | 213 | Crude/Co | 1370 | kbd |
| china_lng | China | 213 | LNG | 1750 | ktons |
| china_lpg | China | 213 | LPG | 2052 | ktons |
| india_crude | India | 447 | Crude/Co | 1370 | kbd |
| india_lng | India | 447 | LNG | 1750 | ktons |
| india_lpg | India | 447 | LPG | 2052 | ktons |
| japan_crude | Japan | 477 | Crude/Co | 1370 | kbd |
| japan_lng | Japan | 477 | LNG | 1750 | ktons |
| japan_lpg | Japan | 477 | LPG | 2052 | ktons |
| south_korea_crude | South Korea | 873 | Crude/Co | 1370 | kbd |
| south_korea_lng | South Korea | 873 | LNG | 1750 | ktons |
| south_korea_lpg | South Korea | 873 | LPG | 2052 | ktons |
| thailand_crude | Thailand | 911 | Crude/Co | 1370 | kbd |
| thailand_lng | Thailand | 911 | LNG | 1750 | ktons |
| thailand_lpg | Thailand | 911 | LPG | 2052 | ktons |
| vietnam_crude | Vietnam | 963 | Crude/Co | 1370 | kbd |
| vietnam_lng | Vietnam | 963 | LNG | 1750 | ktons |
| vietnam_lpg | Vietnam | 963 | LPG | 2052 | ktons |

### Export URLs (30 total — 10 countries × 3 commodities)

Pattern: `https://terminal.kpler.com/cargo/flows?productEstimation=false&projection=actual&split=destination--country&granularity=days&unit={unit}&dates=1m&mZones={zoneId}&products={productId}`

| Key | Country | Zone | Commodity | Product | Unit |
|-----|---------|------|-----------|---------|------|
| bahrain_crude | Bahrain | 77 | Crude/Co | 1370 | kbd |
| bahrain_lng | Bahrain | 77 | LNG | 1750 | ktons |
| bahrain_lpg | Bahrain | 77 | LPG | 2052 | ktons |
| iran_crude | Iran | 455 | Crude/Co | 1370 | kbd |
| iran_lng | Iran | 455 | LNG | 1750 | ktons |
| iran_lpg | Iran | 455 | LPG | 2052 | ktons |
| iraq_crude | Iraq | 457 | Crude/Co | 1370 | kbd |
| iraq_lng | Iraq | 457 | LNG | 1750 | ktons |
| iraq_lpg | Iraq | 457 | LPG | 2052 | ktons |
| kuwait_crude | Kuwait | 505 | Crude/Co | 1370 | kbd |
| kuwait_lng | Kuwait | 505 | LNG | 1750 | ktons |
| kuwait_lpg | Kuwait | 505 | LPG | 2052 | ktons |
| oman_crude | Oman | 677 | Crude/Co | 1370 | kbd |
| oman_lng | Oman | 677 | LNG | 1750 | ktons |
| oman_lpg | Oman | 677 | LPG | 2052 | ktons |
| qatar_crude | Qatar | 739 | Crude/Co | 1370 | kbd |
| qatar_lng | Qatar | 739 | LNG | 1750 | ktons |
| qatar_lpg | Qatar | 739 | LPG | 2052 | ktons |
| russia_crude | Russian Federation | 757 | Crude/Co | 1370 | kbd |
| russia_lng | Russian Federation | 757 | LNG | 1750 | ktons |
| russia_lpg | Russian Federation | 757 | LPG | 2052 | ktons |
| saudi_arabia_crude | Saudi Arabia | 787 | Crude/Co | 1370 | kbd |
| saudi_arabia_lng | Saudi Arabia | 787 | LNG | 1750 | ktons |
| saudi_arabia_lpg | Saudi Arabia | 787 | LPG | 2052 | ktons |
| uae_crude | United Arab Emirates | 943 | Crude/Co | 1370 | kbd |
| uae_lng | United Arab Emirates | 943 | LNG | 1750 | ktons |
| uae_lpg | United Arab Emirates | 943 | LPG | 2052 | ktons |
| us_crude | United States | 947 | Crude/Co | 1370 | kbd |
| us_lng | United States | 947 | LNG | 1750 | ktons |
| us_lpg | United States | 947 | LPG | 2052 | ktons |

---

## Step 2: Check Kpler login

Before starting downloads, navigate to `terminal.kpler.com` and verify you are logged in:
- Use `mcp__chrome-devtools__navigate_page` to load `https://terminal.kpler.com/cargo/flows`
- Check the page title — it should contain "Kpler Terminal", NOT a login page
- If you see a login page, STOP and report: "Kpler login required — please log in manually at terminal.kpler.com in the Chrome debugging session"

---

## Step 3: Download all 48 xlsx files

For each dataset, execute this sequence:

### 3a. Navigate to URL
```
mcp__chrome-devtools__navigate_page → the dataset's URL
```
Wait 8 seconds for the chart to fully load.

### 3b. Verify page loaded correctly
Use `evaluate_script` to check the page title matches the expected country/commodity:
```javascript
() => document.title
```
If the title doesn't match (e.g., shows login page), flag the error and skip.

### 3c. Click Export
Use `evaluate_script`:
```javascript
async () => {
  // Open export menu
  const btn = document.querySelector('button[aria-label="Export as CSV or PDF"]');
  if (!btn) return { error: 'Export button not found' };
  btn.click();
  await new Promise(r => setTimeout(r, 500));

  // Click "Export as CSV" menu item
  const items = document.querySelectorAll('[role="menuitem"]');
  for (const item of items) {
    if (item.textContent.trim() === 'Export as CSV') {
      item.click();
      return { success: true };
    }
  }
  return { error: 'CSV menu item not found' };
}
```

### 3d. Wait for download
Wait 3 seconds after clicking, then verify the file appeared using Bash:
```bash
ls -t ~/Downloads/*.xlsx | head -1
```
Check that the most recent file has a timestamp within the last 30 seconds.

### 3e. Move file to project directory

**IMPORTANT:** Kpler's "Export as CSV" button actually downloads `.xlsx` files (not CSV). This is expected behavior.

Move the downloaded file from `~/Downloads/` to the project directory. Keep the original Kpler filename (with timestamp) — do NOT rename to "latest.xlsx". The `generate-data.py` script reads ALL `.xlsx` files in the directory and deduplicates by date.

For **import** datasets:
```bash
mv ~/Downloads/"{Country} daily imports"*.xlsx import-flows/
```

For **export** datasets:
```bash
mv ~/Downloads/"{Country} daily exports"*.xlsx export-flows/
```

Use the actual country name and commodity from Kpler (e.g., "Crude_Co" not "Crude/Co", "lng" not "LNG"). Match the naming convention of existing files in the directories.

**Note:** If a file with a similar name already exists in the target directory, the new file (with a different timestamp) will coexist. The Python script handles deduplication by date — newer data for the same date overwrites older data.

### 3f. Log progress
After each successful download, log: `[N/48] ✓ {key} — downloaded and moved`
After each failure: `[N/48] ✗ {key} — {error reason}`

---

## Step 4: Process batching

To stay efficient, process URLs in batches. For each URL:
1. Navigate (1 tool call)
2. Wait + export (1 evaluate_script call)
3. Move file (1 Bash call)

That's ~3 tool calls per dataset × 48 = ~144 tool calls. Stay within the max-turns limit.

If you're running low on turns, prioritize the most important datasets:
1. **Priority 1 (critical):** Saudi Arabia, UAE, Iraq, Qatar, China, India (crude)
2. **Priority 2 (high):** Russia, US, Japan, South Korea (crude + LNG)
3. **Priority 3 (medium):** All LNG datasets
4. **Priority 4 (lower):** All LPG datasets

---

## Rules

- Do NOT fabricate any data — all data comes from Kpler's own export
- If a download fails after 1 retry, skip it and continue with the next
- Do NOT modify any existing xlsx files in import-flows/ or export-flows/ — only add new files
- The `dates=1m` parameter means Kpler returns the last 1 month of daily data — this is correct for daily sync
- If Kpler shows a login screen at any point, STOP and alert the user
- Report the total number of successful downloads at the end
