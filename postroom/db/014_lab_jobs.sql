-- Video Lab in the cloud: a pasted link becomes a job that Vercel downloads, measures and has Claude analyse.
create table if not exists postroom.lab_jobs (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  brand text not null,
  status text not null default 'queued' check (status in ('queued', 'reading', 'writing', 'done', 'failed')),
  step text,                               -- what it's doing right now, for the progress line
  error text,
  research_post_id uuid references postroom.research_posts(id) on delete set null,
  attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lab_jobs_open_idx on postroom.lab_jobs (status, updated_at) where status in ('queued', 'reading', 'writing');
create index if not exists lab_jobs_recent_idx on postroom.lab_jobs (created_at desc);
alter table postroom.lab_jobs enable row level security;
