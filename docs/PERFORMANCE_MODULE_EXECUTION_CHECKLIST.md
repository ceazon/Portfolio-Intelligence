# Performance Module Execution Checklist

## Goal

Ship the Performance module in visible steps, with at least one meaningful push to `main` early so the feature starts taking shape in production instead of living only in planning docs.

---

## Commit 1: schema foundation

### Outcome
Add the database foundation for the Performance module.

### Ship
- `supabase/020_performance_module_foundation.sql`

### Includes
- `analyst_target_snapshots`
- `symbol_price_history`
- `analyst_target_performance`
- indexes
- row level security
- owner-scoped policies where needed
- uniqueness constraint for evaluation rows by snapshot + horizon

### Why this is first
- visible, real progress
- unblocks all later work
- safe to review and ship independently

---

## Commit 2: capture layer

### Outcome
Start collecting the historical data needed for performance tracking.

### Ship
- `src/lib/performance-snapshots.ts`
- integration into quote/target refresh flow

### Includes
- append analyst target snapshots when target data exists
- append daily price history rows for tracked symbols
- skip duplicate daily price rows for the same symbol/day

### Likely files
- `src/lib/symbol-sync.ts`
- `src/lib/consensus-targets.ts`
- `src/lib/performance-snapshots.ts`

---

## Commit 3: evaluator job

### Outcome
Turn stored target snapshots into scored outcomes.

### Ship
- `src/lib/performance-evaluator.ts`
- cron entry point for evaluation

### Includes
- compute 90d evaluations
- compute 180d evaluations
- compute 365d evaluations
- upsert into `analyst_target_performance`

### Likely files
- `src/lib/performance-evaluator.ts`
- `src/app/api/cron/performance/route.ts`

---

## Commit 4: Performance page MVP

### Outcome
User-visible module lands in the app.

### Ship
- `/performance` page
- summary cards
- performance ranking table

### Includes
- current price
- current consensus target
- implied upside
- avg alpha vs consensus
- hit rate
- reliability label
- limited-history fallback state

### Likely files
- `src/app/performance/page.tsx`
- one or more new UI components under `src/components/`

---

## Commit 5: polish and reliability labels

### Outcome
Make the MVP easier to understand and more trustworthy.

### Ship
- label logic cleanup
- sorting improvements
- copy refinement
- optional lightweight row expansion

### Includes
- analysts too conservative
- analysts fairly accurate
- analysts too optimistic
- limited history

---

## Commit Order Rationale

This sequence is intentional:

1. schema first
2. capture second
3. evaluator third
4. UI fourth
5. polish fifth

That order gets real value into `main` quickly and avoids a long private branch where nothing is visible.

---

## Current Next Action

Start with **Commit 1: schema foundation**.
