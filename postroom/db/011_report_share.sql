-- Weekly reports: private share links. Safe to re-run.
alter table postroom.weekly_reports add column if not exists share_token text;
create unique index if not exists weekly_reports_share_uq on postroom.weekly_reports (share_token) where share_token is not null;
