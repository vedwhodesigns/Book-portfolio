-- Research extension: competitor/niche research pushed from the ig-research toolkit,
-- plus public YouTube channel lookups. Safe to re-run.
create table if not exists postroom.research_projects (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'ig-research' check (source in ('ig-research', 'youtube')),
  name text not null,
  niche text,
  search_terms text[] not null default '{}',
  competitors text[] not null default '{}',
  scraped_at timestamptz,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, name)
);

create table if not exists postroom.research_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references postroom.research_projects(id) on delete cascade,
  platform text not null default 'instagram' check (platform in ('instagram', 'youtube', 'tiktok')),
  external_id text not null,
  url text,
  author text,
  source text,
  type text,
  posted_at timestamptz,
  caption text,
  likes bigint,
  comments bigint,
  shares bigint,
  views bigint,
  duration_s numeric,
  transcript text,
  thumb_url text,
  teardown jsonb,
  measure jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, external_id)
);
create index if not exists research_posts_author_idx on postroom.research_posts (project_id, author);
create index if not exists research_posts_views_idx on postroom.research_posts (project_id, views desc nulls last);

-- ---------- security ----------
-- Row Level Security on every table, with full access for the app's own login role
-- (postroom_app, if it exists) and the owner. Supabase's anon/authenticated roles get nothing.
do $$
declare t text;
begin
  foreach t in array array['research_projects', 'research_posts'] loop
    execute format('alter table postroom.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'postroom_app') then
      execute format('drop policy if exists postroom_app_all on postroom.%I', t);
      execute format('create policy postroom_app_all on postroom.%I for all to postroom_app using (true) with check (true)', t);
      execute format('grant select, insert, update, delete on postroom.%I to postroom_app', t);
    end if;
  end loop;
end $$;
