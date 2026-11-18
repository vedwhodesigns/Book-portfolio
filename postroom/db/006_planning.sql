-- Planner: references, mood boards, ideas pipeline, series. Safe to re-run.
create table if not exists postroom.plan_series (
  id uuid primary key default gen_random_uuid(),
  brand text not null,                      -- e.g. "The Crime Archives"
  name text not null,
  description text,
  format text,                              -- e.g. "Short (reel + YouTube Short)"
  cadence text,                             -- e.g. "Daily"
  next_note text,                           -- what the next episode should be / what the audience chose
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, name)
);

create table if not exists postroom.plan_boards (
  id uuid primary key default gen_random_uuid(),
  brand text,
  name text not null,
  description text,
  series_id uuid references postroom.plan_series(id) on delete set null,
  created_by text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists postroom.plan_ideas (
  id uuid primary key default gen_random_uuid(),
  brand text,
  title text not null,
  stage text not null default 'idea' check (stage in ('idea', 'scripting', 'producing', 'ready', 'scheduled', 'posted', 'dropped')),
  series_id uuid references postroom.plan_series(id) on delete set null,
  episode int,
  hook text,
  notes text,                               -- script / beats / shot list
  choice_a text,                            -- What Would You Do: the options offered
  choice_b text,
  choice_result text,                       -- what the comments chose → drives the next episode
  formats text[] not null default '{}',     -- e.g. {reel, short, carousel}
  due_date date,
  board_id uuid references postroom.plan_boards(id) on delete set null,
  post_group_id uuid,                       -- the posts created from this idea
  post_id uuid,
  sort double precision not null default 0,
  created_by text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_ideas_stage_idx on postroom.plan_ideas (brand, stage, sort);

create table if not exists postroom.plan_refs (
  id uuid primary key default gen_random_uuid(),
  brand text,
  kind text not null default 'link' check (kind in ('link', 'image', 'note', 'color')),
  url text,                                 -- link or stored image
  platform text,                            -- instagram | youtube | tiktok | web | upload
  title text,
  author text,
  thumb_url text,
  note text,
  color text,
  tags text[] not null default '{}',
  research_post_id uuid,
  idea_id uuid references postroom.plan_ideas(id) on delete set null,
  status text not null default 'kept' check (status in ('kept', 'suggested', 'discarded')),
  source text not null default 'app',       -- app | claude | cli
  created_at timestamptz not null default now()
);
create index if not exists plan_refs_recent_idx on postroom.plan_refs (status, created_at desc);

create table if not exists postroom.plan_board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references postroom.plan_boards(id) on delete cascade,
  kind text not null check (kind in ('ref', 'image', 'note', 'color', 'link')),
  ref_id uuid references postroom.plan_refs(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,   -- { text, color, url, thumb_url, title }
  x int not null default 40,
  y int not null default 40,
  w int not null default 220,
  h int not null default 220,
  z int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists plan_board_items_board_idx on postroom.plan_board_items (board_id);

alter table postroom.posts add column if not exists idea_id uuid;

do $$
declare t text;
begin
  foreach t in array array['plan_series', 'plan_boards', 'plan_ideas', 'plan_refs', 'plan_board_items'] loop
    execute format('alter table postroom.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'postroom_app') then
      execute format('drop policy if exists postroom_app_all on postroom.%I', t);
      execute format('create policy postroom_app_all on postroom.%I for all to postroom_app using (true) with check (true)', t);
      execute format('grant select, insert, update, delete on postroom.%I to postroom_app', t);
    end if;
  end loop;
end $$;
