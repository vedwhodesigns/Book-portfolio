-- Weekly content reports: the numbers for a week of posts + Claude's analysis and learnings. Safe to re-run.
create table if not exists postroom.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  brand text not null,                     -- brand kit name, e.g. "The Crime Archives"
  kind text not null default 'weekly',     -- weekly (automatic, Mon–Sun) | manual (on demand, last 7 days)
  period_start timestamptz not null,
  period_end timestamptz not null,
  posts int not null default 0,
  data jsonb not null default '{}'::jsonb, -- totals, vs previous week, per-post rows, breakdowns
  report jsonb,                            -- Claude's analysis (null if it failed)
  error text,
  created_at timestamptz not null default now()
);
create unique index if not exists weekly_reports_auto_uq on postroom.weekly_reports (brand, period_start) where kind = 'weekly';
create index if not exists weekly_reports_recent_idx on postroom.weekly_reports (brand, created_at desc);

do $$
begin
  alter table postroom.weekly_reports enable row level security;
  if exists (select 1 from pg_roles where rolname = 'postroom_app') then
    drop policy if exists postroom_app_all on postroom.weekly_reports;
    create policy postroom_app_all on postroom.weekly_reports for all to postroom_app using (true) with check (true);
    grant select, insert, update, delete on postroom.weekly_reports to postroom_app;
  end if;
end $$;
