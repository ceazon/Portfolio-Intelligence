# Portfolio Intelligence

Phase 1 foundation for an agent-guided long-term portfolio research app.

## Current scope
- Next.js app shell
- Supabase-ready environment wiring
- Core product pages: dashboard, portfolio, watchlist, recommendations, agent activity
- Initial SQL foundation for high-level entities
- First watchlist and portfolio create flows

## Environment
Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Initial SQL
Run the SQL in:

- `supabase/001_initial_foundation.sql`

This creates the first high-level tables for:
- symbols
- watchlists
- watchlist_items
- portfolios
- portfolio_positions
- recommendations
- agent_runs

## What works now
- dashboard shell
- live Supabase connectivity check
- create watchlists
- create portfolios
- list watchlists
- list portfolios
- import symbols from Finnhub into Supabase
- attach imported symbols to watchlists

## Additional env
- `FINNHUB_API_KEY`

## Next step
- Add symbol search result selection instead of simple first-match import
- Add portfolio position CRUD
- Add company metadata enrichment and price ingestion jobs
- Add recommendation scaffolding on top of real symbols
