"""
generate-data.py — Parse all xlsx files and generate import-data.js / export-data.js
with daily, weekly, and monthly aggregations.
"""

import glob
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta

import openpyxl

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMPORT_DIR = os.path.join(PROJECT_DIR, "import-flows")
EXPORT_DIR = os.path.join(PROJECT_DIR, "export-flows")

# ---------- File -> Key Mapping ----------

IMPORT_MAP = {
    ("China", "Crude_Co"): "china_crude",
    ("China", "lng"): "china_lng",
    ("China", "LPG"): "china_lpg",
    ("India", "Crude_Co"): "india_crude",
    ("India", "lng"): "india_lng",
    ("India", "LPG"): "india_lpg",
    ("Japan", "Crude_Co"): "japan_crude",
    ("Japan", "lng"): "japan_lng",
    ("Japan", "LPG"): "japan_lpg",
    ("South Korea", "Crude_Co"): "south_korea_crude",
    ("South Korea", "lng"): "south_korea_lng",
    ("South Korea", "LPG"): "south_korea_lpg",
    ("Thailand", "Crude_Co"): "thailand_crude",
    ("Thailand", "lng"): "thailand_lng",
    ("Thailand", "LPG"): "thailand_lpg",
    ("Vietnam", "Crude_Co"): "vietnam_crude",
    ("Vietnam", "lng"): "vietnam_lng",
    ("Vietnam", "LPG"): "vietnam_lpg",
}

EXPORT_MAP = {
    ("Bahrain", "Crude_Co"): "bahrain_crude",
    ("Bahrain", "lng"): "bahrain_lng",
    ("Bahrain", "LPG"): "bahrain_lpg",
    ("Iran", "Crude_Co"): "iran_crude",
    ("Iran", "lng"): "iran_lng",
    ("Iran", "LPG"): "iran_lpg",
    ("Iraq", "Crude_Co"): "iraq_crude",
    ("Iraq", "lng"): "iraq_lng",
    ("Iraq", "LPG"): "iraq_lpg",
    ("Kuwait", "Crude_Co"): "kuwait_crude",
    ("Kuwait", "lng"): "kuwait_lng",
    ("Kuwait", "LPG"): "kuwait_lpg",
    ("Oman", "Crude_Co"): "oman_crude",
    ("Oman", "lng"): "oman_lng",
    ("Oman", "LPG"): "oman_lpg",
    ("Qatar", "Crude_Co"): "qatar_crude",
    ("Qatar", "lng"): "qatar_lng",
    ("Qatar", "LPG"): "qatar_lpg",
    ("Russian Federation", "Crude_Co"): "russia_crude",
    ("Russian Federation", "lng"): "russia_lng",
    ("Russian Federation", "LPG"): "russia_lpg",
    ("Saudi Arabia", "Crude_Co"): "saudi_arabia_crude",
    ("Saudi Arabia", "lng"): "saudi_arabia_lng",
    ("Saudi Arabia", "LPG"): "saudi_arabia_lpg",
    ("United Arab Emirates", "Crude_Co"): "uae_crude",
    ("United Arab Emirates", "lng"): "uae_lng",
    ("United Arab Emirates", "LPG"): "uae_lpg",
    ("United States", "Crude_Co"): "us_crude",
    ("United States", "lng"): "us_lng",
    ("United States", "LPG"): "us_lpg",
}


def parse_filename(filename):
    """Extract country and commodity from xlsx filename."""
    base = os.path.basename(filename)
    # Pattern: "Country daily imports/exports (Commodity, by ...)"
    m = re.match(r"^(.+?) daily (?:imports|exports) \((\w+),", base)
    if m:
        return m.group(1), m.group(2)
    return None, None


def read_xlsx(filepath):
    """Read xlsx file and return (headers, rows) where rows are list of (date_str, {country: value})."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    all_rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not all_rows:
        return [], []

    headers = list(all_rows[0])  # ['date', 'Country1', 'Country2', ...]
    countries = headers[1:]

    CUTOFF_DATE = datetime.now().strftime("%Y-%m-%d")

    daily_records = []
    for row in all_rows[1:]:
        date_val = row[0]
        if date_val is None:
            continue
        if isinstance(date_val, datetime):
            date_str = date_val.strftime("%Y-%m-%d")
        else:
            date_str = str(date_val)

        if date_str > CUTOFF_DATE:
            continue

        values = {}
        total = 0.0
        for i, country in enumerate(countries):
            val = row[i + 1]
            if val and isinstance(val, (int, float)) and val != 0:
                rounded = round(val, 1)
                if rounded != 0:
                    values[country] = rounded
                    total += val
            elif val and isinstance(val, (int, float)):
                total += val

        daily_records.append({
            "date": date_str,
            "values": values,
            "total": round(total, 1),
        })

    return countries, daily_records


def make_daily_records(daily_data):
    """Convert parsed daily data to record format."""
    records = []
    for day in daily_data:
        rec = {
            "p": day["date"],
            "s": day["date"],
            "e": day["date"],
            "d": 1,
        }
        rec.update(day["values"])
        rec["_t"] = day["total"]
        records.append(rec)
    return records


def make_weekly_records(daily_data):
    """Aggregate daily data into ISO weekly records."""
    weeks = defaultdict(lambda: {"values": defaultdict(float), "total": 0.0, "days": 0, "start": None, "end": None})

    for day in daily_data:
        dt = datetime.strptime(day["date"], "%Y-%m-%d")
        iso_year, iso_week, _ = dt.isocalendar()
        week_key = f"{iso_year}-W{iso_week:02d}"

        w = weeks[week_key]
        w["days"] += 1
        if w["start"] is None or day["date"] < w["start"]:
            w["start"] = day["date"]
        if w["end"] is None or day["date"] > w["end"]:
            w["end"] = day["date"]

        for country, val in day["values"].items():
            w["values"][country] += val
        w["total"] += day["total"]

    records = []
    for week_key in sorted(weeks.keys()):
        w = weeks[week_key]
        rec = {
            "p": week_key,
            "s": w["start"],
            "e": w["end"],
            "d": w["days"],
        }
        for country, val in w["values"].items():
            rounded = round(val, 1)
            if rounded != 0:
                rec[country] = rounded
        rec["_t"] = round(w["total"], 1)
        records.append(rec)
    return records


def make_monthly_records(daily_data):
    """Aggregate daily data into monthly records."""
    months = defaultdict(lambda: {"values": defaultdict(float), "total": 0.0, "days": 0, "start": None, "end": None})

    for day in daily_data:
        month_key = day["date"][:7]  # "2024-01"
        m = months[month_key]
        m["days"] += 1
        if m["start"] is None or day["date"] < m["start"]:
            m["start"] = day["date"]
        if m["end"] is None or day["date"] > m["end"]:
            m["end"] = day["date"]

        for country, val in day["values"].items():
            m["values"][country] += val
        m["total"] += day["total"]

    records = []
    for month_key in sorted(months.keys()):
        m = months[month_key]
        rec = {
            "p": month_key,
            "s": m["start"],
            "e": m["end"],
            "d": m["days"],
        }
        for country, val in m["values"].items():
            rounded = round(val, 1)
            if rounded != 0:
                rec[country] = rounded
        rec["_t"] = round(m["total"], 1)
        records.append(rec)
    return records


def compute_top_suppliers(daily_data, countries, top_n=15):
    """Compute top N suppliers/destinations by total volume."""
    totals = defaultdict(float)
    for day in daily_data:
        for country, val in day["values"].items():
            totals[country] += val

    sorted_countries = sorted(totals.keys(), key=lambda c: totals[c], reverse=True)
    return sorted_countries[:top_n]


def process_directory(directory, mapping):
    """Process all xlsx files in a directory and return data dict."""
    data = {}
    files = sorted(glob.glob(os.path.join(directory, "*.xlsx")), reverse=True)

    for filepath in files:
        country, commodity = parse_filename(filepath)
        if country is None:
            print(f"  SKIP (can't parse): {os.path.basename(filepath)}")
            continue

        key_tuple = (country, commodity)
        data_key = mapping.get(key_tuple)
        if data_key is None:
            print(f"  SKIP (no mapping): {country} / {commodity}")
            continue

        # Skip duplicates (e.g., Oman (1).xlsx)
        if data_key in data:
            print(f"  SKIP (duplicate): {os.path.basename(filepath)} -> {data_key}")
            continue

        print(f"  {os.path.basename(filepath)[:60]}... -> {data_key}")
        countries, daily_data = read_xlsx(filepath)

        if not daily_data:
            print(f"    WARNING: No data in file")
            continue

        all_countries = sorted(set(c for day in daily_data for c in day["values"].keys()))
        top_suppliers = compute_top_suppliers(daily_data, countries)

        data[data_key] = {
            "countries": all_countries,
            "topSuppliers": top_suppliers,
            "daily": make_daily_records(daily_data),
            "weekly": make_weekly_records(daily_data),
            "monthly": make_monthly_records(daily_data),
        }

    return data


def write_js_file(filepath, var_name, data, comment_lines):
    """Write data as a JS const declaration."""
    json_str = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    with open(filepath, "w", encoding="utf-8") as f:
        for line in comment_lines:
            f.write(line + "\n")
        f.write(f"\nconst {var_name} = {json_str};\n")

    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"  Wrote {filepath} ({size_mb:.1f} MB)")


def main():
    today = datetime.now().strftime("%Y-%m-%d")

    # --- Imports ---
    print("\n=== Processing Import Files ===")
    import_data = process_directory(IMPORT_DIR, IMPORT_MAP)
    print(f"\n  Total import datasets: {len(import_data)}")

    import_comments = [
        f"// Auto-generated from Excel data files — {today}",
        "// Import data (Crude, LNG & LPG) by origin country",
        "// Daily, weekly and monthly aggregations",
    ]
    write_js_file(
        os.path.join(PROJECT_DIR, "import-data.js"),
        "IMPORT_FLOW_DATA",
        import_data,
        import_comments,
    )

    # --- Exports ---
    print("\n=== Processing Export Files ===")
    export_data = process_directory(EXPORT_DIR, EXPORT_MAP)
    print(f"\n  Total export datasets: {len(export_data)}")

    export_comments = [
        f"// Auto-generated from Excel data files — {today}",
        "// Export data (Crude, LNG & LPG) by destination country",
        "// Daily, weekly and monthly aggregations",
    ]
    write_js_file(
        os.path.join(PROJECT_DIR, "export-data.js"),
        "EXPORT_FLOW_DATA",
        export_data,
        export_comments,
    )

    print("\nDone!")


if __name__ == "__main__":
    main()
