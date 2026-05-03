# Performance Pace Tracking Plan

## Goal

Add an investor-friendly pace-tracking layer to the Performance page so users can see whether a stock is currently ahead of, on, or behind a simple analyst target path.

This feature should feel intuitive first, not overly quant-heavy.

---

## Product Decisions Confirmed

1. **Primary UX goal:** investor-friendly
2. **Comparison basis:** show progress against both:
   - latest analyst target
   - original captured target
3. **Tolerance band:** 5%
4. **CDR mapping:** skip for now
5. **UI detail level:** show compact label first, with expandable detail when space allows

---

## Why This Exists

The current Performance module is strong for historical evaluation, but it stays blank for a long time until 90d windows mature.

Pace tracking fills that gap with something live and useful now:

- where the stock is trading today
- where a simple 12-month path says it would be if it were progressing steadily toward the analyst target
- whether it is ahead, on pace, or behind

This should complement historical hit-rate and alpha, not replace them.

---

## Core Framing

Do **not** present this as “the stock should go up this much every day.”

Present it as:

> Based on the analyst 12-month target captured on a given date, the stock is currently ahead of, on, or behind a simple reference path.

This keeps the concept useful without pretending the path is predictive or smooth.

---

## MVP Scope

## Compact row summary

For each symbol on `/performance`, add a compact pace status using the latest target:

- Ahead of pace
- On pace
- Behind pace
- Not enough data

## Expandable detail

When expanded, show:

### Latest target path
- capture/start date
- current price
- latest target
- expected price today on the reference path
- delta vs path in dollars
- delta vs path in percent
- pace label

### Original target path
If an original captured target snapshot exists, also show:
- original capture date
- original target
- expected price today from original path
- delta vs original path
- label vs original path

This lets users compare:
- how the stock is tracking against the current target
- how it is tracking against the original target set when tracking began

---

## Pace Model

## Input requirements

For each path:
- start date
- start price
- target price
- current price
- evaluation horizon = 365 days

## Reference path formula

Use a linear price path:

`expected_price_today = start_price + ((target_price - start_price) * elapsed_days / 365)`

Clamp elapsed days:
- minimum 0
- maximum 365

## Pace delta

`pace_delta_value = current_price - expected_price_today`

`pace_delta_pct = ((current_price - expected_price_today) / expected_price_today) * 100`

## Pace status thresholds

Use a 5% tolerance band around expected price:

- **Ahead of pace** if `pace_delta_pct > 5%`
- **Behind pace** if `pace_delta_pct < -5%`
- **On pace** if between `-5%` and `+5%`

---

## Target Sources

## Latest target path

Use the latest available target in this order:
1. latest stored performance snapshot target
2. live consensus fallback target

Start price for latest path:
- preferred: latest snapshot `current_price`
- fallback: current displayed price if no capture price exists

## Original target path

Use the earliest available stored target snapshot for the symbol.

This is intentionally historical and should never be replaced by live fallback data.

If no stored snapshot history exists yet:
- original path = unavailable

---

## UI Plan

## Phase 1, first implementation slice

Add to Performance page:
- new compact column or inline status chip for latest pace
- expandable detail area per row
- latest path metrics first
- original path placeholder or support if earliest snapshot is available cheaply

## Phase 2

Improve the expanded detail block with:
- side-by-side latest vs original cards
- more explicit date labels
- better copy for limited-history states

## Phase 3

Potential future extensions:
- mini path sparkline
- rebalance confidence integration
- target revision timeline
- checkpoint scoring at 30d / 90d / 180d / 365d

---

## Suggested Labels

Compact labels:
- Ahead of pace
- On pace
- Behind pace
- Waiting for target history

Expanded copy example:
- Expected today: $112.40
- Actual today: $118.90
- +5.8% ahead of latest target path

---

## Data Caveats

- Latest path can be shown sooner than historical hit-rate/alpha.
- Original path requires saved target snapshots.
- For symbols without analyst targets, pace status should remain blank / unavailable.
- CDR underlying-target inheritance is intentionally skipped for this phase.

---

## Recommended Build Order

1. Add pace metric helpers in `src/lib/performance-metrics.ts`
2. Query earliest snapshot alongside latest snapshot on `/performance`
3. Compute latest-path and original-path summaries
4. Add compact status display on each row
5. Add expandable row detail panel
6. Refine copy and styling

---

## First Commit Goal

The first commit should deliver a usable investor-facing slice:
- pace metric helpers
- latest pace status on Performance page
- expandable detail with expected today / actual / delta vs path

Original-target comparison can be partial in commit one if needed, but the architecture should leave room for it cleanly.
