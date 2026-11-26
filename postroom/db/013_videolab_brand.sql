-- Video Lab per channel: which of our channels a video was analysed for, and the 12 fps second-by-second log.
alter table postroom.research_posts add column if not exists brand text;
alter table postroom.research_posts add column if not exists lab jsonb not null default '{}'::jsonb;
create index if not exists research_posts_brand_idx on postroom.research_posts (brand, updated_at desc) where brand is not null;
