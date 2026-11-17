-- Phone notifications (Web Push), brand kits and posting slots per account. Safe to re-run.
create table if not exists postroom.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                      -- published | failed | reconnect | dm | test
  title text not null,
  body text,
  url text,                                -- where tapping the notification goes
  post_id uuid,
  account_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_recent_idx on postroom.notifications (created_at desc);

create table if not exists postroom.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  keys jsonb,
  device text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures int not null default 0
);

-- brand: { tone, audience, signoff, hashtag_sets: [{ name, tags }], dos, donts, defaults: { category_id, playlist_id, ... }, notes }
alter table postroom.accounts add column if not exists brand jsonb not null default '{}'::jsonb;
-- slots: [{ days: [1..7] (1 = Monday), time: "19:00" }]
alter table postroom.accounts add column if not exists slots jsonb not null default '[]'::jsonb;

do $$
declare t text;
begin
  foreach t in array array['notifications', 'push_subscriptions'] loop
    execute format('alter table postroom.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'postroom_app') then
      execute format('drop policy if exists postroom_app_all on postroom.%I', t);
      execute format('create policy postroom_app_all on postroom.%I for all to postroom_app using (true) with check (true)', t);
      execute format('grant select, insert, update, delete on postroom.%I to postroom_app', t);
    end if;
  end loop;
end $$;

-- Research can also come from Instagram's Business Discovery API.
alter table postroom.research_projects drop constraint if exists research_projects_source_check;
alter table postroom.research_projects add constraint research_projects_source_check check (source in ('ig-research', 'youtube', 'instagram-api'));
