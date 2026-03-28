#!/usr/bin/env python3
"""
Generate market-prices-seed.json from XLSX files in prices/ folder.
Uses stdlib only (zipfile + xml.etree.ElementTree) to parse XLSX.
"""

import json
import os
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
PRICES_DIR = os.path.join(PROJECT_DIR, "prices")
OUTPUT_FILE = os.path.join(PROJECT_DIR, "market-prices-seed.json")

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

# Map XLSX Description header to commodity key
DESCRIPTION_MAP = {
    "WTI Cushing Mo01": "wti",
    "Dated Brent": "brent",
    "Murban FOB Abu Dhabi Spore Mo01": "murban",
    "Gasoline 95 RON Arab Gulf Strip": "gasoline",
    "Jet Kero FOB Arab Gulf Cargo": "jetfuel",
    "Gasoil 10 ppm FOB Arab Gulf": "gasoil",
    "LNG Japan/Korea DES Spot Crg": "lng",
}


def parse_xlsx(filepath):
    """Parse an XLSX file and return (commodity_key, list of {date, price})."""
    z = zipfile.ZipFile(filepath)
    sheet_xml = z.read("xl/worksheets/sheet1.xml")
    root = ET.fromstring(sheet_xml)
    rows = list(root.findall(".//s:row", NS))

    if len(rows) < 5:
        return None, []

    # Row 0 = Description header, get the description from column B
    desc_row = rows[0]
    desc_cells = desc_row.findall("s:c", NS)
    if len(desc_cells) < 2:
        return None, []
    desc_val = desc_cells[1].find("s:v", NS)
    description = desc_val.text if desc_val is not None else ""

    commodity_key = DESCRIPTION_MAP.get(description)
    if not commodity_key:
        print(f"  Skipping unknown description: {description}")
        return None, []

    # Determine which column holds the price (prefer Close, fall back to Middle Price Index)
    bate_row = rows[3]
    bate_cells = bate_row.findall("s:c", NS)
    price_col = 1  # default: column B
    for bi, bc in enumerate(bate_cells):
        bv = bc.find("s:v", NS)
        if bv is not None and bv.text in ("Close", "Middle Price Index"):
            price_col = bi
            break

    # Data rows start at index 4 (after Description, Currency/UOM, Symbol Code, Bate headers)
    entries = []
    for row in rows[4:]:
        cells = row.findall("s:c", NS)
        if len(cells) <= price_col:
            continue

        # Column A = date, price_col = Close or Middle Price Index
        date_cell = cells[0].find("s:v", NS)
        price_cell = cells[price_col].find("s:v", NS)

        if date_cell is None or price_cell is None:
            continue
        if not date_cell.text or not price_cell.text:
            continue

        # Date format: "2026-03-25T00:00:00.000" -> "2026-03-25"
        date_str = date_cell.text[:10]
        try:
            price = round(float(price_cell.text), 2)
        except ValueError:
            continue

        entries.append({"date": date_str, "price": price})

    # XLSX data is newest-first; reverse to ascending order
    entries.reverse()
    return commodity_key, entries


def compute_metrics(entries):
    """Compute current, previousClose, high52w, low52w from history entries."""
    if not entries:
        return {"current": 0, "previousClose": 0, "high52w": 0, "low52w": 0}

    current = entries[-1]["price"]
    previous_close = entries[-2]["price"] if len(entries) > 1 else current

    # 52-week = last 260 trading days (approximate)
    recent = entries[-260:]
    prices = [e["price"] for e in recent]
    high52w = max(prices)
    low52w = min(prices)

    return {
        "current": current,
        "previousClose": previous_close,
        "high52w": high52w,
        "low52w": low52w,
    }


def main():
    if not os.path.isdir(PRICES_DIR):
        print(f"Error: prices directory not found at {PRICES_DIR}")
        sys.exit(1)

    xlsx_files = sorted(
        [f for f in os.listdir(PRICES_DIR) if f.endswith(".xlsx")],
    )

    if not xlsx_files:
        print("Error: no XLSX files found in prices/")
        sys.exit(1)

    print(f"Found {len(xlsx_files)} XLSX files in {PRICES_DIR}")

    commodities = {}
    for fname in xlsx_files:
        filepath = os.path.join(PRICES_DIR, fname)
        print(f"  Parsing {fname}...")
        key, entries = parse_xlsx(filepath)
        if key and entries:
            commodities[key] = entries
            print(f"    -> {key}: {len(entries)} entries, latest={entries[-1]['price']}")

    # Build output in desired key order
    key_order = ["wti", "brent", "murban", "gasoline", "jetfuel", "gasoil", "lng"]
    prices = {}
    for key in key_order:
        if key not in commodities:
            print(f"  Warning: no data for {key}")
            continue
        entries = commodities[key]
        metrics = compute_metrics(entries)
        prices[key] = {
            "current": metrics["current"],
            "previousClose": metrics["previousClose"],
            "high52w": metrics["high52w"],
            "low52w": metrics["low52w"],
            "history": entries,
        }
        print(
            f"  {key}: current={metrics['current']}, prevClose={metrics['previousClose']}, "
            f"52wH={metrics['high52w']}, 52wL={metrics['low52w']}, history={len(entries)}"
        )

    # Determine lastUpdated from the latest date across all commodities
    latest_date = max(
        entries[-1]["date"] for entries in commodities.values() if entries
    )

    output = {
        "lastUpdated": f"{latest_date}T00:00:00Z",
        "_source": "seed",
        "prices": prices,
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    file_size = os.path.getsize(OUTPUT_FILE)
    print(f"\nWrote {OUTPUT_FILE} ({file_size:,} bytes)")


if __name__ == "__main__":
    main()
