-- Postroom v1 schema (Instagram only). Already present on the existing
-- Supabase project; included so a fresh database can be built from zero.
-- Safe to re-run.
create extension if not exists pgcrypto;
create schema if not exists postroom;

create table if not exists postroom.accounts (
  id uuid primary key default gen_random_uuid(),
  ig_user_id text not null unique,
  app_scoped_id text,
  username text not null,
  name text,
  account_type text,
  profile_picture_url text,
  followers_count integer,
  access_token_enc text not null,
  token_expires_at timestamptz,
  token_refreshed_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'needs_reconnect', 'disconnected')),
  status_detail text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists postroom.media (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  pathname text not null,
  kind text not null check (kind in ('image', 'video')),
  content_type text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_s numeric,
  filename text,
  source text not null default 'upload',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  poster_url text
);

create table if not exists postroom.batches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  created_by text not null default 'app',
  status text not null default 'draft' check (status in ('draft', 'approved', 'discarded')),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists postroom.posts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references postroom.batches(id),
  account_id uuid not null references postroom.accounts(id),
  kind text not null check (kind in ('image', 'carousel', 'reel', 'story')),
  caption text not null default '',
  media_ids uuid[] not null default '{}',
  cover_media_id uuid references postroom.media(id),
  options jsonb not null default '{}',
  scheduled_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'processing', 'published', 'failed', 'cancelled')),
  container_id text,
  child_container_ids text[],
  processing_started_at timestamptz,
  locked_until timestamptz,
  attempts integer not null default 0,
  ig_media_id text,
  permalink text,
  error text,
  published_at timestamptz,
  created_by text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists postroom.events (
  id bigint generated always as identity primary key,
  post_id uuid references postroom.posts(id),
  account_id uuid references postroom.accounts(id),
  level text not null default 'info',
  message text not null,
  at timestamptz not null default now()
);

create table if not exists postroom.kv (
  key text primary key,
  value jsonb,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
