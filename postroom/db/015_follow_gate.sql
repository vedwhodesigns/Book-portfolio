-- "Follow to unlock": a comment rule can hold its link back until the person follows the account.
-- The private reply asks them to follow and reply; when they reply, Postroom checks the follow and sends the link.
alter table postroom.auto_rules add column if not exists follow_gate boolean not null default false;
alter table postroom.auto_rules add column if not exists link_text text;   -- sent once they follow

create table if not exists postroom.link_gates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references postroom.accounts(id) on delete cascade,
  rule_id uuid not null references postroom.auto_rules(id) on delete cascade,
  igsid text not null,
  username text,
  comment_id text,
  status text not null default 'waiting' check (status in ('waiting', 'sent')),
  nudges int not null default 0,
  last_nudge_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rule_id, igsid)
);
create index if not exists link_gates_open_idx on postroom.link_gates (account_id, igsid) where status = 'waiting';
alter table postroom.link_gates enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postroom_app') then
    drop policy if exists postroom_app_all on postroom.link_gates;
    create policy postroom_app_all on postroom.link_gates for all to postroom_app using (true) with check (true);
    grant select, insert, update, delete on postroom.link_gates to postroom_app;
  end if;
end $$;
