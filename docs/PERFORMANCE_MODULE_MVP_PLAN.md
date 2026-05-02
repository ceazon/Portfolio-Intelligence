# Performance Module MVP Plan

## Objective

Add a lightweight but durable Performance module that compares point-in-time analyst expectations against subsequent stock performance.

The MVP should answer:

- Which tracked stocks have historically performed above analyst expectations?
- Which ones have historically lagged analyst expectations?
- How often do analyst targets for a given stock prove too optimistic, too conservative, or roughly accurate?

This should be an operational analytics layer for the rebalance-first product, not a giant research subsystem.

---

## MVP Product Promise

For each tracked stock, the app should show:

- current price
- current analyst consensus target
- current implied upside/downside
- whether the stock has historically outperformed or underperformed prior analyst targets
- a simple reliability label for analyst estimates on that name

The first version does **not** need a deep symbol timeline, revision heatmaps, or complex forecasting. It just needs enough historical storage and evaluation logic to make consensus-target usage smarter and more trustworthy.

---

## Why This Module Matters

Right now the app uses analyst targets as a live signal, but it does not yet know whether those targets have historically been useful for a given stock.

That creates a blind spot:

- a stock can show +20% implied upside today
- but if analysts are consistently too bullish on that stock, the app should treat that upside more cautiously

The Performance module closes that gap.

It turns consensus targets from a raw signal into a scored signal with historical context.

---

## MVP Scope

The MVP should include only four things:

1. historical analyst target snapshots
2. historical price snapshots suitable for later evaluation
3. a simple evaluation job that scores old target snapshots against later price outcomes
4. a `/performance` page that ranks tracked stocks by above/below-estimate behavior

That is enough to ship a meaningful first version.

---

## Product Definitions

### Analyst target snapshot

A record of what analyst consensus looked like at a specific time.

Fields conceptually include:
- symbol
- capture timestamp
- mean target
- median target
- high target
- low target
- source
- current stock price at capture time

### Performance evaluation

A later judgment of how that snapshot performed.

Example:
- on Jan 1, analysts expected +18% upside for a stock
- by Jul 1, the stock was only up +4%
- that snapshot underperformed analyst expectations

### Reliability label

A stock-level summary of how analysts have historically performed on that symbol.

MVP labels:
- analysts too conservative
- analysts fairly accurate
- analysts too optimistic
- limited history

---

## MVP Data Model

## 1. New table: `analyst_target_snapshots`

Purpose:
Store point-in-time consensus expectations for tracked symbols.

Suggested fields:
- `id uuid primary key`
- `symbol_id uuid not null references symbols(id) on delete cascade`
- `owner_id uuid null`
- `ticker text not null`
- `source text not null`
- `captured_at timestamptz not null default now()`
- `current_price numeric(12,4) null`
- `current_price_currency text null`
- `mean_target numeric(12,4) null`
- `median_target numeric(12,4) null`
- `high_target numeric(12,4) null`
- `low_target numeric(12,4) null`
- `created_at timestamptz not null default now()`

Notes:
- owner_id can be null if this is shared symbol-level history rather than user-specific history
- store current price at capture time so expected return can be reconstructed later without ambiguity

## 2. New table: `symbol_price_history`

Purpose:
Store historical price points needed to evaluate target performance over time.

Suggested fields:
- `id uuid primary key`
- `symbol_id uuid not null references symbols(id) on delete cascade`
- `ticker text not null`
- `source text not null`
- `price numeric(12,4) not null`
- `currency text null`
- `captured_at timestamptz not null`
- `created_at timestamptz not null default now()`

MVP rule:
- one stored daily snapshot per symbol is enough
- do not overbuild OHLC history yet

## 3. New table: `analyst_target_performance`

Purpose:
Persist evaluated outcomes for target snapshots at standard horizons.

Suggested fields:
- `id uuid primary key`
- `target_snapshot_id uuid not null references analyst_target_snapshots(id) on delete cascade`
- `symbol_id uuid not null references symbols(id) on delete cascade`
- `evaluation_window_days integer not null`
- `price_at_evaluation numeric(12,4) null`
- `actual_return_pct numeric(8,3) null`
- `expected_return_pct_at_capture numeric(8,3) null`
- `alpha_vs_consensus_pct numeric(8,3) null`
- `hit_target boolean null`
- `days_to_target_hit integer null`
- `evaluated_at timestamptz not null default now()`
- unique key on (`target_snapshot_id`, `evaluation_window_days`)

MVP evaluation windows:
- 90 days
- 180 days
- 365 days

Do not include 30d in MVP unless it comes almost for free. It is more noise than signal.

---

## Data Capture Strategy

## 1. Capture analyst target snapshots on every quote/target refresh cycle

When tracked symbols are refreshed:
- fetch live consensus target
- fetch/store current quote
- append a row to `analyst_target_snapshots` when target data exists

Important:
This must be append-only history, not overwrite behavior.

## 2. Capture price history daily for tracked symbols

When the quote sync runs:
- append a daily price history row per tracked symbol
- if a row already exists for that symbol on the same market day, skip duplicate insert

This is enough for MVP evaluation.

## 3. Evaluate older target snapshots on a scheduled job

Create a job that looks for target snapshots old enough to evaluate and computes performance rows for:
- 90d
- 180d
- 365d

This can run once daily.

---

## Calculation Rules

## 1. Expected return at capture

For a target snapshot:

`expected_return_pct_at_capture = ((mean_target - current_price) / current_price) * 100`

Only compute if:
- `mean_target` exists
- `current_price > 0`

## 2. Actual return at evaluation

For a given horizon:

`actual_return_pct = ((evaluation_price - capture_price) / capture_price) * 100`

## 3. Alpha vs consensus

`alpha_vs_consensus_pct = actual_return_pct - expected_return_pct_at_capture`

Interpretation:
- positive: stock outperformed what analyst expectations implied
- negative: stock underperformed those expectations

## 4. Hit target

For MVP, define `hit_target` simply:
- true if the evaluation price at the selected horizon is greater than or equal to the captured mean target
- false otherwise

This is intentionally simple for v1.

## 5. Reliability label per stock

Aggregate 365d rows first. If not enough history, fall back to 180d.

Suggested simple label logic:

- **analysts too conservative**
  - average alpha vs consensus >= +10%
- **analysts too optimistic**
  - average alpha vs consensus <= -10%
- **analysts fairly accurate**
  - average alpha vs consensus between -10% and +10%
- **limited history**
  - fewer than 3 evaluated rows

This is intentionally blunt but useful.

---

## Backend Implementation

## New libraries

### `src/lib/performance-snapshots.ts`
Responsibilities:
- persist analyst target snapshots
- persist symbol price history
- enforce one daily price history row per symbol per day

### `src/lib/performance-evaluator.ts`
Responsibilities:
- find target snapshots eligible for evaluation
- compute 90d / 180d / 365d outcomes
- upsert rows into `analyst_target_performance`
- compute per-symbol summary metrics for UI consumption if helpful

### Optional helper: `src/lib/performance-metrics.ts`
Responsibilities:
- convert raw evaluation rows into labels and summary stats
- keep UI pages cleaner

---

## Sync Integration

## Existing quote/target flow changes

Touchpoints likely include:
- `src/lib/symbol-sync.ts`
- `src/lib/consensus-targets.ts`
- any cron route already refreshing tracked symbols

MVP integration idea:
- after quote refresh writes the latest quote snapshot
- call a helper that stores:
  - daily price history row
  - analyst target snapshot row when target data is available

This keeps the performance foundation attached to the real market-data pipeline instead of creating a separate fragile system.

---

## New Scheduled Work

## Job 1: performance evaluation job

New responsibility:
- evaluate historical target snapshots once they are old enough

Suggested behavior:
- run daily
- scan unevaluated target snapshots
- compute missing 90d / 180d / 365d rows

Suggested entry point:
- either a new protected route like `/api/cron/performance`
- or fold it into the existing scheduler if that path stays simple

Recommendation:
Use a dedicated performance cron route so this module stays conceptually clean.

---

## UI MVP

## New route: `/performance`

Purpose:
Show which tracked stocks tend to perform above or below analyst expectations.

## Top summary cards

Show 4 compact cards:
- stocks above analyst expectations
- stocks below analyst expectations
- highest hit-rate stock
- weakest hit-rate stock

## Main table

Columns:
- ticker
- current price
- current consensus target
- implied upside
- 365d hit rate
- avg alpha vs consensus
- reliability label
- evaluated snapshot count

Sort default:
- strongest positive avg alpha first
- or allow toggle between alpha and hit rate

## Row behavior

At MVP, rows do not need a full detail page.

Optional lightweight expansion can show:
- last 3 evaluated snapshots
- expected vs actual return
- most recent reliability interpretation

Do not build a deep symbol performance page in MVP unless delivery remains very fast.

---

## Data Requirements for MVP Success

The MVP is only useful if there is enough time-series data to judge.

That means:
- start capturing snapshots immediately
- accept that early days will show `limited history`
- backfilling may improve usefulness, but it is not required for initial ship

If backfill is easy from providers, do a light one.
If not, ship forward-capturing first.

---

## Recommended MVP Build Order

## Sprint 1: schema + capture
- add migration for `analyst_target_snapshots`
- add migration for `symbol_price_history`
- add migration for `analyst_target_performance`
- wire quote/target refresh flow to append daily history
- wire target refresh flow to append target snapshots

## Sprint 2: evaluator
- build evaluation job for 90d / 180d / 365d windows
- build aggregation helpers for hit rate and avg alpha
- validate results on a few test symbols manually

## Sprint 3: UI
- add `/performance`
- add summary cards
- add sortable performance table
- show reliability labels and evaluated count

## Sprint 4: polish
- improve copy and labels
- optionally add row expansion
- optionally add simple “used in rebalance confidence later” placeholder note

---

## Acceptance Criteria

The MVP is complete when:

- analyst target snapshots are stored historically rather than overwritten
- daily symbol price history is stored for tracked symbols
- a scheduled evaluator produces 90d / 180d / 365d performance rows
- `/performance` shows tracked stocks ranked by above/below-estimate behavior
- each stock shows a simple reliability label based on historical alpha vs consensus
- the system works even when some symbols have limited history

---

## Explicit Non-Goals for MVP

Do not include these yet:
- intraday performance tracking
- target revision event timelines
- analyst-by-analyst breakdowns
- earnings-estimate comparison logic
- complex charting
- rebalance engine integration
- portfolio notifications based on performance drift
- multi-year statistical modeling

Those can come later.

---

## Recommended Product Framing in the App

Suggested framing for the page:

> Performance shows how tracked stocks actually performed after analyst consensus targets were captured. It helps separate names where consensus tends to be useful from names where it tends to be too bullish or too conservative.

That framing is accurate, useful, and consistent with the rebalance-first direction.

---

## Final Recommendation

Build this as a lean, durable analytics module.

The MVP should not try to become a full quant lab.
It should simply make one thing true:

> analyst targets in Portfolio Intelligence are no longer treated as blind signals, they are judged against history.

That is enough to make the rest of the product smarter.
