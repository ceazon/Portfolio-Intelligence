# Portfolio Intelligence

Phase 1 foundation for an agent-guided long-term portfolio research app.

## Current scope
- Next.js app shell
- Supabase-ready environment wiring
- Core product pages: dashboard, portfolio, watchlist, recommendations, agent activity
- Initial SQL foundation for high-level entities
- Watchlist, portfolio, and position flows
- Multi-user auth with per-user data isolation
- Shared quote refresh foundation and historical run tracking

## Environment
Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FMP_API_KEY`
- `FINNHUB_API_KEY` (still used for consensus targets and parts of the research layer)
- `CRON_SECRET`

## SQL migrations
Apply these in order:

- `supabase/001_initial_foundation.sql`
- `supabase/002_symbol_enrichment.sql`
- `supabase/003_position_inputs.sql`
- `supabase/004_multi_user.sql`
- `supabase/005_rls_multi_user.sql`
- `supabase/006_research_and_recommendation_runs.sql`
- `supabase/007_quote_scheduler_foundation.sql`

## External scheduler
Production quote refresh is designed to run independently via an external scheduler such as **cron-job.org**, while the app keeps the protected cron route.

The cron route is:
- `/api/cron/quotes`

### Required env
Set this on the deployed project:
- `CRON_SECRET`

The cron route expects:
- `Authorization: Bearer <CRON_SECRET>`

### Recommended scheduler cadence
For a lightweight production setup:
- every 15 minutes during weekday market hours
- once daily during off-hours / weekends

Example approach with an external scheduler:
- Job 1: weekday market-hours refresh
- Job 2: daily off-hours refresh

## What works now
- dashboard shell
- live Supabase connectivity check
- create watchlists
- create portfolios
- import symbols from FMP into Supabase
- enrich imported symbols with company profile data from FMP
- fetch latest quote snapshots for imported symbols through FMP when available
- fall back to Yahoo Finance chart data for some Canadian quotes when FMP quote access is blocked
- attach imported symbols to watchlists
- view enriched symbol metadata and quote context on the symbols page
- create and manage portfolio positions
- generate recommendation runs with historical tracking
- central quote refresh runs with shared logging

## Provider strategy right now
- **FMP** powers symbol search/import and profile enrichment
- **FMP quotes** are used when the plan supports the requested symbol
- **Yahoo Finance chart fallback** is used for some Canadian symbols when FMP quote coverage is unavailable
- **Finnhub** is still used in the research and consensus-target layer, so provider migration is partial rather than fully complete

## Next step
- verify deployed Vercel cron execution against the protected quote route
- surface quote source transparency in the UI (FMP vs Yahoo fallback)
- continue reducing stale provider assumptions while preserving the research and consensus pipeline
