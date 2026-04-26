# Next Phase Implementation Plan

## Objective

Turn Portfolio Intelligence from a recommendation generator into a durable portfolio operating system.

The current product already has:
- tracked symbols and live positions
- quote refresh and shared research capture
- fundamentals, macro, and synthesis layers
- investor-facing recommendations with structured explanation fields
- FMP-backed analyst consensus targets in production

The next phase should focus on trust, continuity, and decision usefulness.

## Recommended Build Order

1. Recommendation history and change tracking
2. Deeper company intelligence and drill-down surfaces
3. Portfolio operating system layer
4. Monitoring and automation

This order is intentional.

Recommendation quality is now good enough that the biggest product gap is not better wording, but better continuity. The system needs to explain what changed, why it changed, and what deserves attention now.

---

# Phase 1: Recommendation History and Change Tracking

## Goal

Persist every recommendation as part of a living investment case, then surface change over time.

## Product Outcomes

- Users can see how a recommendation evolved
- Conviction, target, and action changes become visible
- The app starts to feel like an ongoing analyst workflow rather than a one-shot generator
- Later portfolio-level prioritization can be based on real deltas instead of static snapshots

## Database Changes

### New table: `recommendation_versions`

Each synthesis run should append a historical snapshot for every recommendation it updates or creates.

Suggested fields:

- `id uuid primary key`
- `recommendation_id uuid not null references recommendations(id) on delete cascade`
- `owner_id uuid not null`
- `symbol_id uuid not null references symbols(id) on delete cascade`
- `created_at timestamptz not null default now()`
- `synthesis_run_id uuid null`
- `action text not null`
- `target_weight numeric null`
- `target_price numeric null`
- `conviction_score integer not null`
- `confidence text null`
- `target_validation_status text null`
- `target_validation_summary text null`
- `implied_upside_pct numeric null`
- `decision_style text null`
- `summary text null`
- `risks text null`
- `headline text null`
- `thesis text null`
- `why_now text null`
- `valuation_view text null`
- `business_quality_view text null`
- `good_buy_because text null`
- `hesitation_because text null`
- `main_risk text null`
- `risk_monitor text null`
- `supporting_factors_json jsonb not null default '[]'::jsonb`
- `risk_factors_json jsonb not null default '[]'::jsonb`
- `consensus_source text null`
- `consensus_mean_target numeric null`
- `consensus_median_target numeric null`
- `consensus_high_target numeric null`
- `consensus_low_target numeric null`

### Optional table: `recommendation_change_events`

This is optional for v1. You can compute diffs on read at first. Add a dedicated event table only if timeline performance or notification logic later needs precomputed change rows.

## Backend Changes

### 1. Persist version rows during synthesis

Update `runRecommendationSynthesis(...)` so that after each recommendation upsert, it also inserts a corresponding `recommendation_versions` row.

Source files likely involved:
- `src/lib/synthesis-agent.ts`
- `src/app/actions.ts`

### 2. Snapshot consensus context

When persisting a version, also save the current external target reference from FMP:
- mean
- median
- high
- low
- source

This matters because recommendation diffs should later be explainable in the context of the market target at the time.

### 3. Build diff utility

Add a reusable helper:
- `src/lib/recommendation-diff.ts`

Functions:
- `compareRecommendationVersions(previous, current)`
- `summarizeRecommendationChange(diff)`
- `hasMaterialRecommendationChange(diff)`

Diff categories to detect:
- action changed
- conviction changed materially
- target price changed materially
- target weight changed materially
- thesis changed
- main risk changed
- support/risk factors added or removed
- market consensus gap widened or narrowed

### 4. Materiality thresholds

Define simple thresholds for v1:
- conviction delta >= 5 points
- target price delta >= 5 percent
- target weight delta >= 0.5 percent of portfolio
- action change always material
- main risk label/text change material

## UI Changes

### 1. Recommendation card: add “What changed”

On `/recommendations`, if a recommendation has a previous version, show a compact summary like:
- Conviction raised from 68 to 77
- Target increased from $245 to $272
- Main hesitation shifted from valuation to execution risk

This should appear in expanded view first, not collapsed view.

### 2. Recommendation timeline panel

On recommendation detail or card expansion:
- latest version
- previous version
- timestamped version list
- badges for action / conviction / target changes

### 3. Optional detail route

If recommendation cards feel too crowded, create a dedicated route such as:
- `/recommendations/[id]`

This route can hold:
- full current thesis
- previous versions
- change log
- target history
- supporting/risk factor evolution

## Acceptance Criteria

- Every synthesis run creates new history rows
- Existing current recommendation behavior remains unchanged
- At least one user-visible change summary appears when versions differ materially
- No internal agent jargon appears in the surfaced change copy

## Sprint Tickets

### Sprint 1A
- Add `recommendation_versions` migration
- Persist version rows from synthesis
- Store consensus snapshot

### Sprint 1B
- Add diff utility
- Add material change detection
- Add simple “what changed” block on recommendations page

### Sprint 1C
- Add version timeline UI
- Add detail route if needed

---

# Phase 2: Deeper Company Intelligence and Drill-Downs

## Goal

Give every symbol a durable intelligence page that reads like a compact investment memo.

## Product Outcomes

- Users can inspect a company in depth without reading fragmented recommendation copy
- Recommendation outputs become easier to trust because supporting analysis is visible
- The product starts to differentiate as an investor research environment, not just a recommendation feed

## New Surface

### Route: `/symbols/[ticker]` or `/symbols/[id]`

Suggested sections:
- Business snapshot
- Current recommendation
- Recommendation history
- Valuation view
- Business quality view
- Key risks
- Catalyst monitor
- Research evidence
- Consensus target context

## Data Model Additions

### Optional table: `symbol_risk_register`

Suggested fields:
- `id`
- `owner_id`
- `symbol_id`
- `label`
- `description`
- `severity`
- `status` (active / improving / worsening / resolved)
- `monitor_signal`
- `created_at`
- `updated_at`

### Optional table: `symbol_catalysts`

Suggested fields:
- `id`
- `owner_id`
- `symbol_id`
- `title`
- `description`
- `type` (earnings, product cycle, estimate revisions, macro, regulatory, capital returns, etc.)
- `time_horizon`
- `status`
- `created_at`
- `updated_at`

These can also start as derived UI-only sections using existing research and recommendation fields if you want to avoid schema expansion in v1.

## Backend Changes

### 1. Company intelligence assembler

Create:
- `src/lib/company-intelligence.ts`

Responsibilities:
- fetch symbol profile
- fetch current quote and latest fundamentals
- fetch latest recommendation
- fetch recommendation history
- fetch relevant research insights
- fetch consensus target reference
- assemble a single page model for UI use

### 2. Quality framework

Standardize business quality dimensions:
- durability
- margins
- balance sheet
- capital allocation
- competitive position
- cyclicality
- execution

This can be initially inferred from fundamentals + existing research/recommendation outputs, then upgraded later into explicit scoring.

### 3. Valuation framework expansion

Current valuation should be displayed in layers:
- internal 12-month target
- current market consensus target
- bull / base / bear framing if available
- premium / discount framing versus current price
- whether confidence is high, medium, or low

## UI Changes

### Symbol detail page

Use modular sections instead of one long memo.

Suggested components:
- `CompanySnapshotCard`
- `RecommendationSummaryCard`
- `RecommendationHistoryCard`
- `BusinessQualityCard`
- `ValuationCard`
- `RisksCard`
- `CatalystsCard`
- `ResearchEvidenceCard`

## Acceptance Criteria

- User can click into a symbol and understand the investment case in one place
- The page is useful even before every advanced table exists
- Consensus target context is visible but not overemphasized

## Sprint Tickets

### Sprint 2A
- Add symbol detail route
- Add company intelligence assembler
- Show current recommendation + current valuation context

### Sprint 2B
- Add recommendation history block
- Add research evidence block
- Add business quality and risk sections

### Sprint 2C
- Add catalysts and richer risk tracking

---

# Phase 3: Portfolio Operating System Layer

## Goal

Move from per-stock analysis to portfolio-level action support.

## Product Outcomes

- The dashboard surfaces what matters now
- Users can see where capital should be reallocated
- The system starts helping prioritize instead of just informing

## Dashboard Modules to Add

### 1. Best ideas

Criteria can include:
- high conviction
- attractive internal target upside
- supportive consensus gap
- current underweight versus target weight

### 2. Weakest holdings

Criteria can include:
- falling conviction
- stretched valuation
- rising risk severity
- trim recommendation
- negative change events

### 3. Watchlist upgrades

Names on watchlist that are approaching buy quality based on:
- conviction improvement
- valuation compression
- better risk/reward
- improving research tone

### 4. Capital allocation suggestions

Examples:
- Add to underweight high-conviction names
- Reduce oversized low-conviction names
- Revisit holdings with target below current price
- Review high-conviction names with stale research

### 5. Review queue

A “needs attention now” queue driven by:
- material recommendation changes
- stale data
- upcoming catalysts
- risk worsening
- sharp price movement

## Backend Changes

Create:
- `src/lib/portfolio-priorities.ts`

Functions:
- `getBestIdeas(ownerId)`
- `getWeakestHoldings(ownerId)`
- `getWatchlistUpgrades(ownerId)`
- `getCapitalAllocationSuggestions(ownerId)`
- `getReviewQueue(ownerId)`

## UI Changes

### Dashboard expansion

Add sections to `/dashboard`:
- Best ideas now
- Weakest holdings
- Capital allocation opportunities
- Review queue

These should be concise and ranked.

## Acceptance Criteria

- Dashboard helps answer “what should I look at right now?”
- Suggestions are traceable to visible recommendation / portfolio data
- No black-box wording

## Sprint Tickets

### Sprint 3A
- Add portfolio priorities library
- Build best ideas and weakest holdings modules

### Sprint 3B
- Add capital allocation suggestions
- Add watchlist upgrade module

### Sprint 3C
- Add review queue and ranking logic

---

# Phase 4: Monitoring and Automation

## Goal

Keep the intelligence layer current with less manual intervention and clearer system health.

## Product Outcomes

- Research and recommendation freshness improve
- The user has better trust in what is current and what is stale
- The system becomes more proactive without feeling uncontrolled

## Monitoring Concepts

### Freshness windows

Define target freshness by data type:
- quotes: intraday cadence
- research: 1 day
- fundamentals: 7 to 30 days depending on source
- macro: 1 day or 1 week depending on component
- recommendations: rerun when major inputs change, otherwise on schedule
- consensus targets: daily or weekly depending on provider behavior

### Health visibility

Track and show:
- last successful quote refresh
- last successful research run
- last successful synthesis run
- symbols skipped
- stale recommendation count
- stale research count
- provider failure count

## Automation Changes

### 1. Refresh scheduler review

Build or tighten scheduled flows for:
- central quote refresh
- shared news research
- fundamentals refresh
- recommendation synthesis refresh

### 2. Trigger rules

Re-run deeper analysis when:
- price moves beyond threshold
- recommendation becomes stale
- catalyst window approaches
- consensus target moves materially
- major news arrives

### 3. Notification layer

Later phase, but design for it now.

Potential alert types:
- recommendation changed materially
- target moved materially
- high-conviction idea is underweight
- main risk worsened
- a watchlist name was upgraded

## Backend Changes

Potential additions:
- `system_health_snapshots`
- `recommendation_refresh_runs`
- trigger evaluation helpers

## UI Changes

### Dashboard health strip

Add a small operational strip with:
- quotes fresh/stale
- research fresh/stale
- recommendations fresh/stale
- last successful synthesis

## Acceptance Criteria

- User can tell if the system is fresh
- Important refresh failures are visible
- Scheduled intelligence workflows reduce manual maintenance

## Sprint Tickets

### Sprint 4A
- Define freshness rules
- Add dashboard freshness indicators

### Sprint 4B
- Add scheduled synthesis refresh logic
- Add stale recommendation detection

### Sprint 4C
- Add event-driven triggers and health reporting

---

# Cross-Cutting Principles

## 1. Preserve backward compatibility

Do not break current recommendation pages or workflows while adding history and deeper intelligence.

## 2. Keep user-facing language investor-native

Never expose agent internals, orchestration terms, scoring mechanics, or chain-of-thought style wording.

## 3. Prefer durable persistence over ephemeral derivation

If a change matters later for trust, auditability, or notifications, store it.

## 4. Use staged delivery

Every phase should deliver useful surface area on its own. Do not wait for the fully realized operating system before shipping intermediate wins.

## 5. Keep production-safe shipping discipline

Continue the current approach:
- build locally
- avoid accidental env/config commits
- ship to `main`
- verify Vercel deployment

---

# Strongest Recommendation

If only one thing is built next, build Phase 1 first:

## Recommendation history and change tracking

This has the best leverage because it:
- compounds all current recommendation work
- immediately improves trust
- creates the backbone for dashboard prioritization
- makes future automation and notifications much more valuable

It is the cleanest bridge from “smart outputs” to “real portfolio intelligence system.”
