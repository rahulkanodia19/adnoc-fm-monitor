# Russia / India / China Flow Sanity Audit

**Generated:** 2026-04-05
**Source:** flow-summary.json (Kpler vessel tracking + pipeline constants)

This report compares the most recent complete weekly window for key Russia/India/China flow datasets against approximate IEA/EIA/Reuters public reference bands. Deviations >20% are flagged for manual review.

---

## russia_crude — Russia crude exports (seaborne + ESPO pipeline)

**Reference band:** 4500–5500 kbd (daily avg, expected range)
**Pipeline contribution:** ~600 kbd (Hormuz-independent)
**Notes:** Post-sanctions mix dominated by Asia. Europe share near zero.

**Last complete period:** 2026-W13 (2026-03-23 → 2026-03-29, 7d)

| Metric | Value |
|---|---|
| Weekly total | 37,567 kbd |
| Daily average | **5,366.8 kbd** |
| Gulf share | 0% |
| Deviation from band mid-point | +7.3% → **IN BAND** |

**Top 5 counterparties (daily avg):**

| Rank | Country | Daily avg | Share |
|---|---|---|---|
| 1 | China | 1,292.6 kbd | 24.1% |
| 2 | India | 802.7 kbd | 15.0% |
| 3 | Turkey | 665.7 kbd | 12.4% |
| 4 | Italy | 657.1 kbd | 12.2% |
| 5 | France | 306.9 kbd | 5.7% |

> ⚠ Expected top counterparties not in actual top 5: South Korea

**In-flight partial period:** 2026-W14 (2026-03-30 → 2026-04-02, 4d)
Daily rate: 3,968.5 kbd

---

## india_crude — India crude imports

**Reference band:** 4500–5200 kbd (daily avg, expected range)
**Notes:** Russia ~35-40% share (crisis-elevated). Gulf share ~40-50% pre-crisis.

**Last complete period:** 2026-W13 (2026-03-23 → 2026-03-29, 7d)

| Metric | Value |
|---|---|
| Weekly total | 29,479 kbd |
| Daily average | **4,211.2 kbd** |
| Gulf share | 35.6% |
| Deviation from band mid-point | -13.2% → **near band** |

**Top 5 counterparties (daily avg):**

| Rank | Country | Daily avg | Share |
|---|---|---|---|
| 1 | Russian Federation | 1,626.4 kbd | 38.6% |
| 2 | Saudi Arabia | 951.4 kbd | 22.6% |
| 3 | United Arab Emirates | 485.7 kbd | 11.5% |
| 4 | Nigeria | 412.5 kbd | 9.8% |
| 5 | Ecuador | 301.6 kbd | 7.2% |

> ⚠ Expected top counterparties not in actual top 5: Iraq, UAE

**In-flight partial period:** 2026-W14 (2026-03-30 → 2026-04-02, 4d)
Daily rate: 6,123.5 kbd

---

## india_lng — India LNG imports

**Reference band:** 40–80 ktons (daily avg, expected range)
**Notes:** Qatar dominates ~50% pre-crisis.

**Last complete period:** 2026-W13 (2026-03-23 → 2026-03-29, 7d)

| Metric | Value |
|---|---|
| Weekly total | 550 ktons |
| Daily average | **78.6 ktons** |
| Gulf share | 40.9% |
| Deviation from band mid-point | +31.0% → **IN BAND** |

**Top 5 counterparties (daily avg):**

| Rank | Country | Daily avg | Share |
|---|---|---|---|
| 1 | Oman | 32.1 ktons | 40.8% |
| 2 | United States | 19.3 ktons | 24.6% |
| 3 | Nigeria | 17.6 ktons | 22.4% |
| 4 | Angola | 9.6 ktons | 12.2% |

> ⚠ Expected top counterparties not in actual top 5: Qatar, UAE

**In-flight partial period:** 2026-W14 (2026-03-30 → 2026-04-02, 4d)
Daily rate: 66.6 ktons

---

## china_crude — China crude imports (seaborne + pipelines: ESPO 600 + Kazakhstan 220 + Myanmar 200 = 1,020 kbd)

**Reference band:** 10500–11500 kbd (daily avg, expected range)
**Pipeline contribution:** ~1020 kbd (Hormuz-independent)
**Notes:** Hormuz-independent pipelines add ~1,020 kbd floor.

**Last complete period:** 2026-W13 (2026-03-23 → 2026-03-29, 7d)

| Metric | Value |
|---|---|
| Weekly total | 56,522 kbd |
| Daily average | **8,074.5 kbd** |
| Gulf share | 31% |
| Deviation from band mid-point | -26.6% → **FLAG (>20% deviation)** |

**Top 5 counterparties (daily avg):**

| Rank | Country | Daily avg | Share |
|---|---|---|---|
| 1 | Russian Federation | 2,210.3 kbd | 27.4% |
| 2 | Oman | 1,541.2 kbd | 19.1% |
| 3 | Brazil | 1,133.9 kbd | 14.0% |
| 4 | Iran | 888.1 kbd | 11.0% |
| 5 | Canada | 242.9 kbd | 3.0% |

> ⚠ Expected top counterparties not in actual top 5: Saudi Arabia, Iraq, UAE

**In-flight partial period:** 2026-W14 (2026-03-30 → 2026-04-02, 4d)
Daily rate: 6,956.1 kbd

---

## china_lng — China LNG imports

**Reference band:** 180–260 ktons (daily avg, expected range)
**Notes:** Australia + Qatar combined ~60-70%.

**Last complete period:** 2026-W13 (2026-03-23 → 2026-03-29, 7d)

| Metric | Value |
|---|---|
| Weekly total | 572 ktons |
| Daily average | **81.7 ktons** |
| Gulf share | 0% |
| Deviation from band mid-point | -62.9% → **FLAG (>20% deviation)** |

**Top 5 counterparties (daily avg):**

| Rank | Country | Daily avg | Share |
|---|---|---|---|
| 1 | Australia | 37.2 ktons | 45.5% |
| 2 | Malaysia | 15.4 ktons | 18.8% |
| 3 | Papua New Guinea | 11.2 ktons | 13.7% |
| 4 | Russian Federation | 9.1 ktons | 11.1% |
| 5 | Indonesia | 8.7 ktons | 10.6% |

> ⚠ Expected top counterparties not in actual top 5: Qatar, United States

**In-flight partial period:** 2026-W14 (2026-03-30 → 2026-04-02, 4d)
Daily rate: 116.2 ktons

---

## Summary

- Reference bands are approximate; update as new IEA Oil Market Report / EIA STEO / Reuters trader estimates land.
- Any FLAG verdict requires manual cross-check against a live public source before action.
- Pipeline contributions (ESPO, Kazakhstan-China, Myanmar-China, Yanbu-SUMED) are fixed constants loaded from `PIPELINE_STATUS_DATA` in `data.js` — update `currentThroughput` there if real-world conditions shift.
