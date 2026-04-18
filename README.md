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
- `FINNHUB_API_KEY`
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

## Vercel cron
Production quote refresh is designed to run independently via **Vercel Cron**, not OpenClaw.

Configured schedules in `vercel.json`:
- every 3 minutes during weekday market hours window
- every 30 minutes during weekday off-hours
- every 30 minutes on weekends

The cron route is:
- `/api/cron/quotes`

### Required Vercel env
Set this on the deployed project:
- `CRON_SECRET`

The cron route expects:
- `Authorization: Bearer <CRON_SECRET>`

## What works now
- dashboard shell
- live Supabase connectivity check
- create watchlists
- create portfolios
- import symbols from Finnhub into Supabase
- enrich imported symbols with company profile data from Finnhub
- fetch latest quote snapshot for imported symbols
- attach imported symbols to watchlists
- view enriched symbol metadata and quote context on the symbols page
- create and manage portfolio positions
- generate recommendation runs with historical tracking
- central quote refresh runs with shared logging

## Next step
- verify deployed Vercel cron execution against the protected quote route
- add shared research schedulers and research insight writers
- upgrade recommendation synthesis to use stored research insights
