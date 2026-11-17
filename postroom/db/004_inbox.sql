-- Instagram DMs, comments and automations. Safe to re-run.
create table if not exists postroom.dm_threads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references postroom.accounts(id) on delete cascade,
  igsid text not null,                     -- the other person's Instagram-scoped ID
  username text,
  name text,
  profile_pic text,
  last_message_at timestamptz,
  last_text text,
  last_direction text,
  last_inbound_at timestamptz,             -- Meta's 24h reply window starts here
  unread int not null default 0,
  draft_text text,                         -- reply suggested by Claude, sent only by a person
  draft_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, igsid)
);
create index if not exists dm_threads_recent_idx on postroom.dm_threads (account_id, last_message_at desc);

create table if not exists postroom.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references postroom.dm_threads(id) on delete cascade,
  mid text,                                -- Meta message ID (dedupe)
  direction text not null check (direction in ('in', 'out')),
  text text,
  attachments jsonb,
  source text not null default 'webhook',  -- webhook | sync | manual | auto | comment
  rule_id uuid,
  created_at timestamptz not null default now(),
  unique (mid)
);
create index if not exists dm_messages_thread_idx on postroom.dm_messages (thread_id, created_at);

create table if not exists postroom.auto_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references postroom.accounts(id) on delete cascade,  -- null = all Instagram accounts
  kind text not null check (kind in ('welcome', 'dm_keyword', 'comment_keyword')),
  name text,
  keywords text[] not null default '{}',
  match text not null default 'contains' check (match in ('contains', 'exact', 'any')),
  reply_text text not null,                -- the DM to send
  public_reply_text text,                  -- comment rules: optional public reply under the comment
  media_external_id text,                  -- comment rules: only this post/reel (null = any)
  enabled boolean not null default true,
  hits int not null default 0,
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists postroom.ig_comments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references postroom.accounts(id) on delete cascade,
  comment_id text not null unique,
  media_external_id text,
  from_id text,
  username text,
  text text,
  rule_id uuid references postroom.auto_rules(id) on delete set null,
  dm_sent boolean not null default false,
  public_replied boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ig_comments_recent_idx on postroom.ig_comments (account_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['dm_threads', 'dm_messages', 'auto_rules', 'ig_comments'] loop
    execute format('alter table postroom.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'postroom_app') then
      execute format('drop policy if exists postroom_app_all on postroom.%I', t);
      execute format('create policy postroom_app_all on postroom.%I for all to postroom_app using (true) with check (true)', t);
      execute format('grant select, insert, update, delete on postroom.%I to postroom_app', t);
    end if;
  end loop;
end $$;
