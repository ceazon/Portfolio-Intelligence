alter table public.recommendations
  add column if not exists headline text,
  add column if not exists thesis text,
  add column if not exists why_now text,
  add column if not exists valuation_view text,
  add column if not exists business_quality_view text,
  add column if not exists good_buy_because text,
  add column if not exists hesitation_because text,
  add column if not exists main_risk text,
  add column if not exists risk_monitor text,
  add column if not exists decision_style text,
  add column if not exists supporting_factors_json jsonb,
  add column if not exists risk_factors_json jsonb;

update public.recommendations
set
  headline = coalesce(headline, summary),
  thesis = coalesce(thesis, summary),
  main_risk = coalesce(main_risk, risks)
where recommendation_engine = 'synthesis-v1';

create index if not exists idx_recommendations_decision_style
  on public.recommendations(decision_style);
