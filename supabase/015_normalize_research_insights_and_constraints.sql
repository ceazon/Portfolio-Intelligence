-- Normalize research insight confidence semantics to match the shared contract direction.
-- research_insights.confidence_score: [0.00, 1.00]

update public.research_insights
set confidence_score = round((((greatest(0, least(1, (coalesce(confidence_score, 0) / 100.0)))) )::numeric), 2)
where confidence_score is not null
  and confidence_score > 1;

alter table public.research_insights
  add constraint research_insights_confidence_score_range_ck
  check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1));
