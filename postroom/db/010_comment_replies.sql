-- Comment replies: Claude drafts a reply to each new comment (Instagram + YouTube); a person approves before it posts. Safe to re-run.
alter table postroom.ig_comments add column if not exists platform text not null default 'instagram';
alter table postroom.ig_comments add column if not exists is_reply boolean not null default false;   -- a reply inside a thread
alter table postroom.ig_comments add column if not exists reply_status text;      -- null (not looked at) | draft | needs_you | skipped | sent
alter table postroom.ig_comments add column if not exists reply_draft text;       -- Claude's suggested reply
alter table postroom.ig_comments add column if not exists reply_note text;        -- why it needs you / was skipped / send error
alter table postroom.ig_comments add column if not exists reply_sent_text text;
alter table postroom.ig_comments add column if not exists reply_external_id text;
alter table postroom.ig_comments add column if not exists replied_at timestamptz;
create index if not exists ig_comments_review_idx on postroom.ig_comments (created_at desc) where reply_status in ('draft', 'needs_you');
