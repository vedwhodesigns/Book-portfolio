-- Deeper analytics: per-post watch/hook metrics + retention curves, account audience & daily series. Safe to re-run.
alter table postroom.posts add column if not exists insights jsonb not null default '{}'::jsonb;  -- avg watch, skip rate, hold at 3s, subs gained…
alter table postroom.posts add column if not exists retention jsonb;                              -- [[elapsed_ratio, watch_ratio], …] (YouTube)
alter table postroom.posts add column if not exists insights_at timestamptz;

create table if not exists postroom.account_insights (
  account_id uuid not null references postroom.accounts(id) on delete cascade,
  kind text not null,              -- audience | online_hours | daily | traffic
  data jsonb not null default '{}'::jsonb,
  error text,
  fetched_at timestamptz not null default now(),
  primary key (account_id, kind)
);

create table if not exists postroom.hook_reports (
  id uuid primary key default gen_random_uuid(),
  brand text,
  report jsonb not null,           -- Claude's analysis: patterns, do/don't, suggested hooks
  posts int not null default 0,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['account_insights', 'hook_reports'] loop
    execute format('alter table postroom.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'postroom_app') then
      execute format('drop policy if exists postroom_app_all on postroom.%I', t);
      execute format('create policy postroom_app_all on postroom.%I for all to postroom_app using (true) with check (true)', t);
      execute format('grant select, insert, update, delete on postroom.%I to postroom_app', t);
    end if;
  end loop;
end $$;
