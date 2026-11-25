// Home screen in one request (fast on a phone): what needs you, what's coming up, empty slots tonight,
// each brand's last 7 days, and what just went out with its live numbers.
import { db } from './core.js';

const thumbSql = (sql) => sql`coalesce((select c.url from postroom.media c where c.id = p.cover_media_id), m.poster_url, case when m.kind = 'image' then m.url end)`;

export async function homeData() {
  const sql = db();
  const [needs] = await sql`select
      (select count(*) from postroom.ig_comments where reply_status in ('draft', 'needs_you'))::int as comments,
      (select count(*) from postroom.posts where status = 'failed' and updated_at > now() - interval '7 days')::int as failed,
      (select count(*) from postroom.posts where status = 'draft')::int as drafts,
      (select count(*) from postroom.accounts where status not in ('active', 'disconnected'))::int as reconnect,
      (select count(*) from postroom.notifications where read_at is null)::int as alerts`;
  const [{ approvals }] = await sql`select count(*)::int as approvals from postroom.batches where status = 'draft'`;

  const upcoming = await sql`select p.id, p.platform, p.kind, p.status, p.scheduled_at, p.group_id, a.username, a.brand->>'name' as brand,
      coalesce(nullif(p.title, ''), split_part(p.caption, E'\n', 1)) as title, ${thumbSql(sql)} as thumb
    from postroom.posts p join postroom.accounts a on a.id = p.account_id left join postroom.media m on m.id = p.media_ids[1]
    where p.status in ('scheduled', 'processing') and p.scheduled_at < now() + interval '3 days'
    order by p.scheduled_at limit 30`;

  const recent = await sql`select p.id, p.platform, p.kind, p.published_at, p.permalink, p.metrics, p.insights, a.username, a.brand->>'name' as brand,
      coalesce(nullif(p.title, ''), split_part(p.caption, E'\n', 1)) as title, ${thumbSql(sql)} as thumb
    from postroom.posts p join postroom.accounts a on a.id = p.account_id left join postroom.media m on m.id = p.media_ids[1]
    where p.status = 'published' and p.archived_at is null and p.published_at > now() - interval '7 days'
    order by p.published_at desc limit 12`;

  const brands = await sql`select a.brand->>'name' as brand,
      array_agg(distinct a.platform) as platforms,
      sum(a.followers_count)::int as followers,
      coalesce(sum(s.views), 0)::int as views_7d, coalesce(sum(s.posts), 0)::int as posts_7d,
      bool_or(exists (select 1 from postroom.posts q where q.account_id = a.id and q.status in ('scheduled', 'processing') and q.scheduled_at < now() + interval '24 hours')) as has_next_24h,
      bool_or(jsonb_array_length(coalesce(a.slots, '[]'::jsonb)) > 0) as has_slots,
      min(a.slots->0->>'time') as slot_time
    from postroom.accounts a
    left join lateral (select sum((p.metrics->>'views')::bigint) as views, count(*) as posts from postroom.posts p
      where p.account_id = a.id and p.status = 'published' and p.archived_at is null and p.published_at > now() - interval '7 days') s on true
    where a.status <> 'disconnected' and a.brand->>'name' is not null
    group by 1 order by views_7d desc, 1`;

  return {
    needs: { ...needs, approvals },
    upcoming,
    recent: recent.map((r) => ({ ...r, views: r.metrics?.views ?? null, likes: r.metrics?.likes ?? null, comments: r.metrics?.comments ?? null })),
    brands,
    empty_slots: brands.filter((b) => b.has_slots && !b.has_next_24h).map((b) => ({ brand: b.brand, time: b.slot_time })),
  };
}
