import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Missing Supabase env vars');
}

const sql = `
do $$
begin
  update public.agent_outputs
  set normalized_score = round((((greatest(-1, least(1, ((coalesce(normalized_score, 50) - 50) / 50.0)))) )::numeric), 2)
  where normalized_score is not null
    and (normalized_score > 1 or normalized_score < -1);

  update public.agent_outputs
  set confidence_score = round((((greatest(0, least(1, (coalesce(confidence_score, 0) / 100.0)))) )::numeric), 2)
  where confidence_score is not null
    and confidence_score > 1;

  update public.research_insights
  set confidence_score = round((((greatest(0, least(1, (coalesce(confidence_score, 0) / 100.0)))) )::numeric), 2)
  where confidence_score is not null
    and confidence_score > 1;

  begin
    alter table public.agent_outputs
      add constraint agent_outputs_normalized_score_range_ck
      check (normalized_score is null or (normalized_score >= -1 and normalized_score <= 1));
  exception when duplicate_object then null;
  end;

  begin
    alter table public.agent_outputs
      add constraint agent_outputs_confidence_score_range_ck
      check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1));
  exception when duplicate_object then null;
  end;

  begin
    alter table public.research_insights
      add constraint research_insights_confidence_score_range_ck
      check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1));
  exception when duplicate_object then null;
  end;
end $$;
`;

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
if (!error) {
  console.log('Applied via exec_sql');
  process.exit(0);
}

const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ sql_query: sql }),
});

const text = await res.text();
console.log(JSON.stringify({ status: res.status, body: text.slice(0, 1000) }, null, 2));
if (!res.ok) {
  process.exit(1);
}

fs.writeFileSync('/tmp/portfolio-intelligence-supabase-apply.log', text);
