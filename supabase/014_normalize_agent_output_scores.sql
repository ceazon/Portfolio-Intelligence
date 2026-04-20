-- Normalize shared agent output scoring semantics to match AGENT_OUTPUT_CONTRACT.md
-- normalized_score: [-1.00, 1.00]
-- confidence_score: [0.00, 1.00]

update public.agent_outputs
set normalized_score = round((((greatest(-1, least(1, ((coalesce(normalized_score, 50) - 50) / 50.0)))) )::numeric), 2)
where normalized_score is not null
  and (normalized_score > 1 or normalized_score < -1);

update public.agent_outputs
set confidence_score = round((((greatest(0, least(1, (coalesce(confidence_score, 0) / 100.0)))) )::numeric), 2)
where confidence_score is not null
  and confidence_score > 1;

alter table public.agent_outputs
  add constraint agent_outputs_normalized_score_range_ck
  check (normalized_score is null or (normalized_score >= -1 and normalized_score <= 1));

alter table public.agent_outputs
  add constraint agent_outputs_confidence_score_range_ck
  check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1));
