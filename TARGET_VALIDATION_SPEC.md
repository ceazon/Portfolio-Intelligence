# Target Validation Spec

## Goal
Add a first-class target validation layer so 12-month price targets are not shown as standalone numbers without context. The system should explain whether a target looks plausible, stretched, or aggressive, and why.

## Why
Raw target prices can look precise while still being fragile or unrealistic for the underlying archetype. Example: a bank showing +35% upside in 12 months should be challenged through valuation sanity checks before it is trusted.

## v1 Scope
Ship a lightweight validation layer now, using existing data already available in the app:
- current price
- generated 12-month target price
- inferred archetype from the valuation scenario engine
- current fundamentals snapshot from `symbol_fundamentals`
- optional consensus comparisons later

## v1 Outputs
Each recommendation target should have a validation summary with:
- `validation_status`: `plausible | stretched | aggressive | unavailable`
- `validation_summary`: short plain-English explanation
- `implied_upside_pct`: target vs current price percent move
- `implied_valuation_context`: structured explanation of what valuation regime the target implies

## Archetype-aware validation heuristics

### Financials / Banks
Primary checks:
- forward-ish earnings / earnings power sanity
- P/B sanity
- ROE context
- avoid extreme upside targets unless supported by unusually depressed starting valuation

Heuristics:
- if implied upside > 25% and bank metrics are only average, mark at least `stretched`
- if implied upside > 35% without strong supporting evidence, mark `aggressive`
- if P/B is already healthy and ROE is not inflecting materially, downgrade target plausibility

### High growth / Platform / Quality compounders
Primary checks:
- revenue growth durability
- margin quality
- current P/S or P/E already rich or not

Heuristics:
- large upside is more acceptable when revenue growth and margin profile support it
- if valuation is already rich and growth is slowing, mark large upside as `stretched` or `aggressive`

### Cyclical / Defensive
Primary checks:
- normalized earnings context
- margin cyclicality
- avoid excessive multiple expansion assumptions

## UI behavior
Recommendations page should show, alongside target price:
- implied upside/downside percent
- validation status chip
- short rationale

Portfolio row collapsed state can continue showing target price; expanded areas may later show the validation detail.

## v2 / next steps
- compare against sell-side consensus target / range
- store target history over time
- backtest target accuracy at 3m / 6m / 12m
- measure calibration by archetype, conviction bucket, and agent mix
- separate target generator from target validator more explicitly
