-- Archived posts (YouTube made private from Postroom, or archived in the Instagram app): kept, but left out of analytics. Safe to re-run.
alter table postroom.posts add column if not exists archived_at timestamptz;
update postroom.posts set archived_at = coalesce((upload->>'archived_at')::timestamptz, now()) where archived_at is null and (upload->>'archived')::boolean is true;
