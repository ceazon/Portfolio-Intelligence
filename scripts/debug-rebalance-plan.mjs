import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { getConsensusTargetForSymbol } from '../src/lib/consensus-targets.ts';

const ownerId = process.argv[2];
if (!ownerId) {
  console.error('Usage: node scripts/debug-rebalance-plan.mjs <ownerId>');
  process.exit(1);
}

const envText = fs.readFileSync('.env.local', 'utf8');
const getEnv = (name) => {
  const m = envText.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].replace(/^"|"$/g, '') : '';
};

const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'));

const { data: positions, error } = await supabase
  .from('portfolio_positions')
  .select('id, portfolio_id, quantity, portfolios(id, name, cash_position, cash_currency, display_currency, recommendation_cash_mode), symbols(id, ticker, name, symbol_price_snapshots(price, percent_change, fetched_at))')
  .eq('owner_id', ownerId)
  .gt('quantity', 0);

if (error) {
  console.error(error);
  process.exit(1);
}

const firstRelation = (value) => Array.isArray(value) ? value[0] ?? null : value;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const toUsd = (amount, currency) => !amount ? 0 : currency === 'CAD' ? amount / 1.39 : amount;
const upsideBucketScore = (impliedUpsidePct) => {
  if (impliedUpsidePct == null) return 0.75;
  if (impliedUpsidePct >= 30) return 1.35;
  if (impliedUpsidePct >= 20) return 1.2;
  if (impliedUpsidePct >= 10) return 1.0;
  if (impliedUpsidePct >= 0) return 0.8;
  if (impliedUpsidePct >= -10) return 0.55;
  return 0.3;
};

const rows = positions || [];
const totalInvestedByPortfolio = new Map();
const portfolioMeta = new Map();
for (const row of rows) {
  const portfolio = firstRelation(row.portfolios);
  const symbol = firstRelation(row.symbols);
  const quote = firstRelation(symbol?.symbol_price_snapshots || null);
  const marketValue = (row.quantity ?? 0) * (quote?.price ?? 0);
  totalInvestedByPortfolio.set(row.portfolio_id, (totalInvestedByPortfolio.get(row.portfolio_id) || 0) + marketValue);
  if (portfolio) {
    portfolioMeta.set(row.portfolio_id, {
      name: portfolio.name,
      cashUsd: toUsd(portfolio.cash_position ?? 0, portfolio.cash_currency ?? portfolio.display_currency ?? 'USD'),
      recommendationCashMode: portfolio.recommendation_cash_mode === 'fully-invested' ? 'fully-invested' : 'managed-cash',
    });
  }
}

const perPortfolio = new Map();
for (const row of rows) {
  const portfolio = firstRelation(row.portfolios);
  const symbol = firstRelation(row.symbols);
  const quote = firstRelation(symbol?.symbol_price_snapshots || null);
  if (!portfolio || !symbol) continue;
  const currentPrice = quote?.price ?? null;
  const marketValue = (row.quantity ?? 0) * (currentPrice ?? 0);
  const cashMeta = portfolioMeta.get(row.portfolio_id);
  const totalInvested = totalInvestedByPortfolio.get(row.portfolio_id) || 0;
  const totalPortfolioValue = totalInvested + (cashMeta?.cashUsd || 0);
  const currentWeight = totalPortfolioValue > 0 ? (marketValue / totalPortfolioValue) * 100 : null;
  const consensus = await getConsensusTargetForSymbol(symbol.ticker);
  const consensusTarget = consensus.meanTarget;
  const impliedUpsidePct = typeof consensusTarget === 'number' && typeof currentPrice === 'number' && currentPrice > 0
    ? ((consensusTarget - currentPrice) / currentPrice) * 100
    : null;
  const upsideScore = upsideBucketScore(impliedUpsidePct);
  const continuityBoost = currentWeight !== null && currentWeight > 0 ? clamp(currentWeight / 18, 0.15, 0.85) : 0.15;
  const growthScore = upsideScore + continuityBoost;
  const score = currentPrice && consensusTarget ? growthScore : Math.max(0.35, continuityBoost);

  const existing = perPortfolio.get(row.portfolio_id) || [];
  existing.push({ ticker: symbol.ticker, currentWeight, consensusTarget, impliedUpsidePct, score });
  perPortfolio.set(row.portfolio_id, existing);
}

for (const [portfolioId, items] of perPortfolio.entries()) {
  const meta = portfolioMeta.get(portfolioId);
  const targetInvestedPct = meta?.recommendationCashMode === 'fully-invested' ? 100 : 95;
  const minWeight = 4;
  const maxWeight = 35;
  const rawScoreTotal = items.reduce((sum, item) => sum + item.score, 0);
  const preliminary = items.map((item) => {
    const normalizedTarget = rawScoreTotal > 0 ? (item.score / rawScoreTotal) * targetInvestedPct : item.currentWeight ?? 0;
    const boundedTarget = clamp(normalizedTarget, item.impliedUpsidePct != null && item.impliedUpsidePct <= -10 ? 2 : minWeight, maxWeight);
    return { ...item, normalizedTarget, boundedTarget };
  });
  const boundedTotal = preliminary.reduce((sum, item) => sum + item.boundedTarget, 0);
  const scale = boundedTotal > 0 ? targetInvestedPct / boundedTotal : 1;
  console.log('\nPortfolio', meta?.name, meta);
  console.table(preliminary.map((item) => ({
    ticker: item.ticker,
    currentWeight: item.currentWeight?.toFixed(1),
    upside: item.impliedUpsidePct?.toFixed?.(1) ?? null,
    score: item.score.toFixed(3),
    normalizedTarget: item.normalizedTarget.toFixed(2),
    boundedTarget: item.boundedTarget.toFixed(2),
    finalTarget: (item.boundedTarget * scale).toFixed(2),
  })));
  console.log('boundedTotal', boundedTotal.toFixed(2), 'scale', scale.toFixed(4));
}
