-- Postroom v2: Instagram + YouTube + TikTok, cross-posting, analytics.
-- Additive: existing v1 rows keep working and are treated as Instagram.
-- Safe to re-run.

-- ---------- accounts ----------
alter table postroom.accounts add column if not exists platform text not null default 'instagram';
alter table postroom.accounts add column if not exists external_id text;
alter table postroom.accounts add column if not exists refresh_token_enc text;
alter table postroom.accounts add column if not exists refresh_expires_at timestamptz;
alter table postroom.accounts add column if not exists scopes text;
alter table postroom.accounts add column if not exists profile_url text;
alter table postroom.accounts add column if not exists meta jsonb not null default '{}';

update postroom.accounts set external_id = ig_user_id where external_id is null;
alter table postroom.accounts alter column ig_user_id drop not null;

-- Keep Postroom v1 working while both versions run: rows it inserts (no platform/external_id)
-- get external_id from ig_user_id.
create or replace function postroom.accounts_fill_external_id() returns trigger language plpgsql as $$
begin
  if new.external_id is null then new.external_id := new.ig_user_id; end if;
  return new;
end $$;
drop trigger if exists accounts_fill_external_id on postroom.accounts;
create trigger accounts_fill_external_id before insert or update on postroom.accounts
  for each row execute function postroom.accounts_fill_external_id();
alter table postroom.accounts alter column external_id set not null;

do $$ begin
  alter table postroom.accounts add constraint accounts_platform_check
    check (platform in ('instagram', 'youtube', 'tiktok'));
exception when duplicate_object then null; end $$;

create unique index if not exists accounts_platform_external_uq
  on postroom.accounts (platform, external_id);

-- ---------- posts ----------
alter table postroom.posts add column if not exists platform text;
update postroom.posts p set platform = a.platform
  from postroom.accounts a where a.id = p.account_id and p.platform is null;
alter table postroom.posts alter column platform set default 'instagram';
alter table postroom.posts alter column platform set not null;

alter table postroom.posts add column if not exists title text;
alter table postroom.posts add column if not exists group_id uuid;
alter table postroom.posts add column if not exists external_id text;
alter table postroom.posts add column if not exists upload jsonb not null default '{}';
alter table postroom.posts add column if not exists next_attempt_at timestamptz;
alter table postroom.posts add column if not exists metrics jsonb not null default '{}';
alter table postroom.posts add column if not exists metrics_at timestamptz;
alter table postroom.posts add column if not exists note text;

update postroom.posts set external_id = ig_media_id where external_id is null and ig_media_id is not null;

-- widen the kind check (v1 allowed image/carousel/reel/story only)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'postroom.posts'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table postroom.posts drop constraint %I', c.conname);
  end loop;
end $$;
alter table postroom.posts add constraint posts_kind_check
  check (kind in ('image', 'carousel', 'reel', 'story', 'video', 'short'));

-- deleting a post (only drafts/cancelled from the app) removes its log
alter table postroom.events drop constraint if exists events_post_id_fkey;
alter table postroom.events add constraint events_post_id_fkey
  foreign key (post_id) references postroom.posts(id) on delete cascade;

create index if not exists posts_due_idx on postroom.posts (status, scheduled_at);
create index if not exists posts_group_idx on postroom.posts (group_id);
create index if not exists posts_account_idx on postroom.posts (account_id, scheduled_at);
create index if not exists events_post_idx on postroom.events (post_id, at);

-- ---------- analytics ----------
create table if not exists postroom.post_metrics (
  post_id uuid not null references postroom.posts(id) on delete cascade,
  at timestamptz not null default now(),
  views bigint,
  reach bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  primary key (post_id, at)
);

create table if not exists postroom.account_metrics (
  account_id uuid not null references postroom.accounts(id) on delete cascade,
  day date not null,
  followers bigint,
  primary key (account_id, day)
);

-- ---------- security ----------
-- Row Level Security on every table, with full access for the app's own login role
-- (postroom_app, if it exists) and the owner. Supabase's anon/authenticated roles get nothing.
do $$
declare t text;
begin
  foreach t in array array['accounts', 'media', 'batches', 'posts', 'events', 'kv', 'post_metrics', 'account_metrics'] loop
    execute format('alter table postroom.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'postroom_app') then
      execute format('drop policy if exists postroom_app_all on postroom.%I', t);
      execute format('create policy postroom_app_all on postroom.%I for all to postroom_app using (true) with check (true)', t);
      execute format('grant select, insert, update, delete on postroom.%I to postroom_app', t);
    end if;
  end loop;
end $$;
