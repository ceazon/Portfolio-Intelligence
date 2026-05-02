# AI Rebalancing Pivot Plan

## Objective

Shift Portfolio Intelligence away from an AI-first stock recommendation engine and toward an AI-assisted portfolio rebalancing application.

The new core promise should be:

> Review my current portfolio, compare holdings against analyst expectations, and recommend how I should rebalance.

In this model, AI becomes a support layer for explanation, prioritization, and user-facing summaries, not the primary engine that decides what the portfolio should do.

---

## Why This Pivot Makes Sense

The current recommendation system has produced useful infrastructure:

- portfolio and position tracking
- cash tracking and allocation comparison UI
- quote refresh and FX handling
- analyst consensus targets in production
- recommendation display and rebalance framing surfaces

But the product is still conceptually centered on:

- agent-generated research
- AI synthesis
- recommendation narratives
- per-stock conviction and thesis generation

That approach is more complex, harder to trust, and farther from the highest-value workflow.

The stronger product is:

- portfolio-first
- allocation-driven
- transparent
- deterministic in its core math
- explainable in plain English

This moves the app closer to a practical portfolio operating tool and farther away from feeling like a black-box idea generator.

---

## Product Reframe

### Old framing

- AI-powered recommendation engine
- multi-agent stock analysis
- synthesized buy / hold / trim opinions

### New framing

- AI-assisted rebalancing workspace
- portfolio allocation optimizer
- analyst-estimate-driven rebalance planning
- cash deployment and trim guidance

### New user outcome

Instead of asking:

> What stocks does the AI like?

The user is asking:

> Given what I already hold, where should I add, trim, or hold based on analyst targets and portfolio balance?

---

## Core Product Principles

1. **Portfolio first**  
   Every major output should begin from the user’s actual portfolio, not a generic stock idea feed.

2. **Deterministic allocation logic**  
   Target weights and rebalance actions should come from transparent rules, not hidden model judgment.

3. **Analyst estimates as the anchor**  
   Consensus targets should become the primary investment signal for the first version of the rebalance engine.

4. **AI as explainer, not decider**  
   AI should summarize and explain rebalance outputs, not be the core allocator.

5. **Low-risk migration**  
   Build the new rebalancing system beside the current recommendation system, then swap defaults after validation.

---

## What Already Exists That Supports the Pivot

### Keep and build on

- portfolios and positions
- cash position support
- fully invested vs managed cash mode
- quote refresh pipeline
- FX support
- portfolio allocation overview UI
- rebalance comparison UI
- consensus target fetching (`getConsensusTargetForSymbol`)
- recommendation persistence patterns that can inspire the new rebalance storage model

### Reduce or demote over time

- multi-agent research pipeline
- news agent / bear case agent / fundamentals agent / macro agent
- synthesis-heavy recommendation engine
- recommendation language centered on conviction, thesis, and narrative
- agent activity as a core product surface

---

## Proposed Target Architecture

### Core deterministic layer

A new rebalancing engine should compute target allocations from:

- current holdings
- current portfolio weights
- current tracked cash
- portfolio cash mode
- analyst consensus target
- implied upside/downside
- optional basic guardrails (minimum position size, max position size, continuity bias for existing holdings)

### Optional AI layer

AI can remain useful for:

- plain-English summary of the rebalance plan
- explanation of why a holding is being increased or reduced
- short “what changed” summaries between rebalance runs
- dashboard prioritization phrasing later

AI should not be required for:

- target weight generation
- ranking logic
- cash deployment logic
- rebalance action determination

---

## Proposed New Data Model

Add new portfolio-rebalancing-specific persistence without immediately deleting the old recommendation system.

### New table: `rebalancing_runs`

Suggested fields:

- `id uuid primary key`
- `owner_id uuid not null`
- `portfolio_id uuid not null references portfolios(id) on delete cascade`
- `engine_name text not null default 'analyst-rebalance-v1'`
- `status text not null default 'completed'`
- `summary text null`
- `created_at timestamptz not null default now()`
- `completed_at timestamptz null`

### New table: `rebalance_recommendations`

Suggested fields:

- `id uuid primary key`
- `owner_id uuid not null`
- `portfolio_id uuid not null references portfolios(id) on delete cascade`
- `symbol_id uuid not null references symbols(id) on delete cascade`
- `rebalancing_run_id uuid not null references rebalancing_runs(id) on delete cascade`
- `action text not null` (`increase`, `reduce`, `maintain`, `initiate`, `exit`, `watch`)
- `rank integer null`
- `current_weight numeric null`
- `target_weight numeric null`
- `weight_delta numeric null`
- `current_price numeric null`
- `consensus_target numeric null`
- `implied_upside_pct numeric null`
- `rationale text null`
- `created_at timestamptz not null default now()`

### Keep existing tables temporarily

Do not immediately delete:

- `recommendations`
- `research_runs`
- `research_insights`
- `agent_outputs`
- `synthesis_runs`

These should be treated as legacy-but-still-available until the rebalance flow becomes the new default.

---

## Proposed Rebalancing Engine

### New library

Create:

- `src/lib/rebalancing-engine.ts`

### Responsibilities

- load current portfolio holdings
- load current quotes
- load current consensus targets
- calculate implied upside/downside for each held name
- score holdings for target allocation
- allocate target weights based on rules
- output portfolio rebalance actions
- optionally create user-facing explanation input for later AI summary generation

### Suggested function structure

- `buildRebalancePlan(ownerId, portfolioId)`
- `scoreHoldingForRebalance(holding, context)`
- `allocateTargetWeights(scoredHoldings, options)`
- `generateRebalanceActions(currentWeights, targetWeights)`
- `summarizeRebalancePlan(plan)`

---

## Suggested Deterministic Weighting Logic (v1)

Start simple.

### Inputs per holding

- current weight
- current price
- consensus target
- implied upside percent
- whether already held
- cash mode

### Simple first-pass logic

1. Compute implied upside:
   - `(consensusTarget - currentPrice) / currentPrice`

2. Rank held names by upside.

3. Translate upside into target allocation preference:
   - strongest upside gets largest target weight
   - weak or negative upside gets reduced target weight

4. Apply portfolio guardrails:
   - minimum position size
   - maximum position size
   - optional continuity bias toward current holdings
   - avoid abrupt full exits unless downside is clearly poor

5. Respect cash mode:
   - `fully-invested` → deploy all tracked cash into target weights
   - `managed-cash` → allow a residual cash sleeve

6. Convert target weights into actions:
   - `increase`
   - `reduce`
   - `maintain`
   - `initiate`
   - `exit`
   - `watch`

### Recommended v1 constraints

- only rebalance currently held names at first
- do not auto-allocate to watchlist names yet
- cap single-name target weights
- prefer gradual trims over binary drops

This keeps the first version understandable and safe.

---

## UX / UI Migration Plan

### Phase 1: Reframe copy only

Update user-facing wording:

- “Recommendations” → “Rebalancing” or “Rebalance Plan”
- “Synthesize recommendations” → “Generate rebalance plan”
- “Recommendation engine” → “Rebalancing engine”
- “Conviction” language should fade from primary UI

### Phase 2: Portfolio-first default flow

Make these surfaces central:

#### Portfolio page
- current allocation
- target allocation
- rebalance summary
- cash deployment impact

#### Rebalancing page
- ranked add / trim / hold actions
- current vs target weights
- analyst target context
- plain-English reasons

#### Dashboard
- biggest underweights
- biggest overweights
- best add opportunities
- weakest holdings to reduce

### Phase 3: De-emphasize old AI surfaces

Reduce prominence of:

- research page
- agent activity page
- recommendation feed as a primary workflow

Keep them accessible during transition if needed.

---

## What to Do With Existing AI Agent Infrastructure

### Recommendation

Do not rip it out immediately.

Instead:

1. stop treating it as the product center
2. freeze major expansion of the agent-first system
3. preserve it as optional context during the transition
4. remove or archive only after the new rebalance workflow proves better

### Practical handling

- keep the code for now
- stop building major new features on top of `agent_outputs`
- stop positioning `synthesis-agent.ts` as the core allocator
- later decide whether to:
  - archive agent pages
  - remove old buttons
  - repurpose pieces for explanation support only

---

## Recommended Implementation Phases

## Phase A: Product framing pivot

### Goal
Change the visible story of the app quickly.

### Tasks
- rewrite landing/dashboard/recommendation copy
- rename recommendation actions and buttons to rebalance language
- reword UI around adds, trims, and target allocations

### Outcome
The app already feels like a rebalance tool, even before the full backend pivot is complete.

---

## Phase B: Deterministic rebalance engine alongside current system

### Goal
Build the new core engine without breaking the current app.

### Tasks
- add `src/lib/rebalancing-engine.ts`
- consume holdings + consensus targets
- compute target weights deterministically
- output rebalance actions side-by-side with current recommendation flow

### Outcome
You can validate the rebalance model in production-like conditions before replacing the old engine.

---

## Phase C: New persistence model

### Goal
Store rebalance runs independently of the legacy recommendation engine.

### Tasks
- add `rebalancing_runs`
- add `rebalance_recommendations`
- persist each rebalance run and recommendation set
- expose history and change tracking later

### Outcome
The new system gets its own clean backbone.

---

## Phase D: Make rebalancing the primary UX

### Goal
Switch the main product flow to portfolio rebalancing.

### Tasks
- wire portfolio page to new rebalance records
- rebuild `/recommendations` as `/rebalancing` or make it rebalance-first
- show ranked portfolio actions instead of generic stock recommendations

### Outcome
Users engage with rebalance plans instead of AI recommendation narratives.

---

## Phase E: AI as a thin explanation layer

### Goal
Keep AI only where it improves trust and usability.

### Tasks
- generate short rationale summaries from deterministic outputs
- produce “what changed” blurbs between rebalance runs
- create optional dashboard summaries

### Outcome
AI still adds polish, but it is no longer a black-box dependency for the actual allocation logic.

---

## Key Product Decisions To Make Early

### 1. Universe scope

Should the rebalance engine operate on:

- held positions only
- held positions plus watchlist names

**Recommendation:** held positions only for v1.

This avoids forced initiations and keeps the engine highly explainable.

### 2. Position sizing rules

Define explicit rules for:

- maximum single-name target weight
- minimum meaningful target weight
- whether exits are allowed automatically
- whether cash can remain idle in managed-cash mode

### 3. Cash deployment behavior

For `fully-invested` mode:

- should all cash be deployed proportionally across highest-ranked held names?
- should new positions ever be opened automatically?

**Recommendation:** deploy only into existing holdings first.

### 4. Action thresholds

Define minimum deltas for showing an action:

- under 0.5% target-weight delta → maintain
- larger deltas → increase / reduce

This keeps the plan from becoming noisy.

---

## Strongest Recommendation

Do not attempt a full destructive rewrite.

The best path is:

1. **reframe the product now**
2. **build a deterministic rebalance engine beside the old system**
3. **make the new rebalance flow the default**
4. **retire agent-heavy infrastructure gradually**

This reduces risk, preserves useful infrastructure, and keeps shipping velocity high.

---

## Suggested First Build Sprint

If only one implementation sprint is started next, it should be:

### Sprint 1: Deterministic rebalance engine + UI reframing

Deliverables:

- rebalance-first language in UI
- new `rebalancing-engine.ts`
- target weights driven by analyst consensus upside
- portfolio page powered by rebalance outputs
- side-by-side validation without deleting old AI infrastructure

That sprint creates the foundation for the whole pivot.
