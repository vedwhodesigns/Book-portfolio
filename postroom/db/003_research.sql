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

alter table postroom.research_projects enable row level security;
alter table postroom.research_posts enable row level security;
