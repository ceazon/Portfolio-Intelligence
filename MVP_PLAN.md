# Portfolio Intelligence MVP Plan

## Goal
Ship a usable long-term investing workspace where a user can:
- create a portfolio
- create one or more watchlists
- import real symbols from external APIs
- see basic company and price context for those symbols
- create and manage portfolio positions
- receive simple recommendation records based on real tracked symbols

This MVP is not trying to be a full autonomous hedge fund. It should prove the core workflow: universe in, portfolio state in, market context in, recommendation scaffolding out.

## What exists now
Working today:
- Next.js app shell and navigation
- Supabase wiring
- Vercel production deployment
- core pages: dashboard, portfolio, watchlist, symbols, recommendations, agent activity
- create portfolio
- create watchlist
- import symbols from Finnhub
- attach symbols to watchlists
- initial Supabase schema for symbols, watchlists, portfolios, positions, recommendations, and agent runs

Recent lessons:
- Production env setup and server action stability issues are now fixed
- The app is ready to move from shell/foundation into real data plumbing

## MVP definition
The MVP should answer these user questions:
1. What symbols am I tracking?
2. What do I currently own or want to own?
3. What is the latest basic market context for each symbol?
4. Which symbols look worth buying, trimming, or watching next?
5. What did the system base that suggestion on?

## Recommended MVP phases

### Phase 1: Solidify market data foundation
Priority: highest

#### 1. Symbol enrichment
After importing a symbol, enrich and store:
- exchange
- country
- asset type
- currency
- Finnhub symbol metadata if available
- optional company profile fields: logo, weburl, market capitalization, ipo, finnhubIndustry

Recommended schema additions to `symbols`:
- `currency text`
- `figi text`
- `mic text`
- `logo_url text`
- `web_url text`
- `market_cap numeric`
- `ipo_date date`
- `raw_profile jsonb`
- `last_profile_sync_at timestamptz`

#### 2. Price snapshot table
Create a dedicated table for latest quote data rather than stuffing everything into `symbols`.

Suggested table: `symbol_price_snapshots`
- `symbol_id uuid references symbols(id)`
- `price numeric`
- `change numeric`
- `percent_change numeric`
- `high numeric`
- `low numeric`
- `open numeric`
- `previous_close numeric`
- `fetched_at timestamptz`
- unique on (`symbol_id`)

Why:
- cleaner separation between master symbol metadata and market state
- easy dashboard/recommendation joins
- can later extend into daily historical prices

#### 3. Server-side data sync utilities
Add reusable server functions for:
- search/import symbol
- fetch company profile
- fetch latest quote
- refresh one symbol
- refresh all tracked symbols

Start with Finnhub only. Keep the provider abstraction light for now.

## Phase 2: Portfolio and watchlist become truly useful
Priority: highest

#### 4. Portfolio position CRUD
Implement create/list/update/delete for `portfolio_positions`.

Minimum fields for MVP:
- symbol
- target weight
- current weight
- notes
- conviction score
- status

UI result:
- user can add imported symbols into a portfolio
- portfolio page shows actual tracked holdings/targets, not just portfolio containers

#### 5. Watchlist ranking fields
Add lightweight fields to `watchlist_items`:
- `priority integer`
- `thesis text`
- `last_reviewed_at timestamptz`
- `score numeric`

This gives the watchlist page a meaningful sorting and review workflow.

## Phase 3: Recommendation scaffolding on real data
Priority: high

#### 6. Simple recommendation engine
Do not overbuild this yet.

For MVP, create recommendations from a rules-based scaffold using:
- whether symbol is already in portfolio
- watchlist priority/score
- latest price move
- optional conviction score

Initial recommendation actions:
- `buy`
- `watch`
- `trim`
- `hold`

Each recommendation should store:
- `summary`
- `risks`
- `confidence`
- `status`
- `created_at`

This can be generated manually with a button first, then automated later.

#### 7. Recommendation review page
Make the recommendations page actually useful:
- show current open recommendations
- show symbol, action, confidence, summary
- show which portfolio the recommendation belongs to
- allow status changes like open, accepted, dismissed

## Phase 4: Background refresh and agent traces
Priority: medium

#### 8. Refresh jobs
Add background jobs or protected server actions to:
- refresh all tracked symbol profiles
- refresh latest quotes for all tracked symbols
- stamp `agent_runs` rows when syncs happen

For MVP, manual-trigger buttons are acceptable before cron.

#### 9. Agent activity page uses real records
Populate `agent_runs` with:
- job name
- run type
- started/completed time
- status
- summary

This gives a visible audit trail without building full autonomous agents yet.

## Proposed API strategy

### Primary API for MVP: Finnhub
Use Finnhub for:
- symbol search
- company profile
- quote endpoint

Why this is the right first move:
- already partially integrated
- enough coverage for MVP
- minimizes moving parts while the schema is still settling

### Avoid for now
Do not add multiple overlapping market data providers yet unless Finnhub blocks a required feature.
Avoid news ingestion, transcripts, fundamentals, or complex screening in MVP phase one.

## Concrete build order

### Sprint 1
1. add schema migration for symbol enrichment and price snapshots
2. add Finnhub profile + quote fetch utilities
3. enrich symbol import flow to save metadata immediately
4. display quote/profile data on symbols page

### Sprint 2
1. add portfolio position CRUD
2. allow adding imported symbols into a portfolio
3. show positions on portfolio page with target/current weight and latest price

### Sprint 3
1. add watchlist ranking/thesis fields
2. implement recommendation generation scaffold
3. wire recommendations page to real data

### Sprint 4
1. add manual refresh actions
2. record sync jobs in agent_runs
3. polish dashboard to show real counts and recent activity

## UI changes recommended next
- Symbols page: show latest price, daily change, exchange, sector/industry when available
- Portfolio page: show positions table under each portfolio
- Watchlist page: add score/priority and thesis notes
- Dashboard: replace placeholder stats with live counts and recent sync timestamps
- Recommendations: replace placeholder cards with actual recommendation list

## Success criteria for MVP
MVP is done when a user can:
- import a real symbol and see enriched metadata
- refresh and view current price context
- add that symbol to a watchlist
- add that symbol to a portfolio as a position
- generate a recommendation tied to that symbol and portfolio
- review recent system activity and data freshness

## My recommendation
The best next build is:
1. symbol enrichment + quote snapshots
2. portfolio positions CRUD
3. basic recommendation generation

That path gets you from "shell" to "actually useful product" fastest.

## Open questions
These are the only product questions I’d want answered before deeper implementation:
1. Should MVP support a single user/workspace only for now? I recommend yes.
2. Do you want recommendations to be purely rules-based first, or do you want an LLM-written explanation layer in MVP? I recommend rules first, optional AI explanation second.
3. Do you want manual refresh buttons first, or should I wire scheduled refreshes immediately? I recommend manual first, then cron.
