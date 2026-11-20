// Analytics rollups for the dashboard and the MCP tool.
import { db } from './core.js';

export async function overview({ days = 30, platform: pf = null, account_id = null } = {}) {
  days = Math.min(Math.max(Number(days) || 30, 1), 365);
  const since = new Date(Date.now() - days * 864e5);
  const prevSince = new Date(Date.now() - 2 * days * 864e5);
  const filt = (alias = 'p') => db()`
    ${pf ? db()`and ${db()(alias)}.platform = ${pf}` : db()``}
    ${account_id ? db()`and ${db()(alias)}.account_id = ${account_id}` : db()``}`;

  const sumQuery = (from, to) => db()`select
      count(*)::int as posts,
      coalesce(sum((metrics->>'views')::bigint), 0)::bigint as views,
      coalesce(sum((metrics->>'likes')::bigint), 0)::bigint as likes,
      coalesce(sum((metrics->>'comments')::bigint), 0)::bigint as comments,
      coalesce(sum((metrics->>'shares')::bigint), 0)::bigint as shares,
      coalesce(sum((metrics->>'saves')::bigint), 0)::bigint as saves
    from postroom.posts p where status = 'published' and published_at >= ${from} and published_at < ${to} ${filt()}`;
  const [[cur], [prev]] = await Promise.all([sumQuery(since, new Date()), sumQuery(prevSince, since)]);

  const byPlatform = await db()`select platform, count(*)::int as posts,
      coalesce(sum((metrics->>'views')::bigint), 0)::bigint as views,
      coalesce(sum((metrics->>'likes')::bigint), 0)::bigint as likes,
      coalesce(sum((metrics->>'comments')::bigint), 0)::bigint as comments,
      coalesce(sum((metrics->>'shares')::bigint), 0)::bigint as shares
    from postroom.posts p where status = 'published' and published_at >= ${since} ${filt()}
    group by platform order by views desc`;

  const byAccount = await db()`select a.id, a.platform, a.username, a.profile_picture_url, a.followers_count,
      count(p.id)::int as posts,
      coalesce(sum((p.metrics->>'views')::bigint), 0)::bigint as views,
      coalesce(sum((p.metrics->>'likes')::bigint), 0)::bigint as likes,
      coalesce(sum((p.metrics->>'comments')::bigint), 0)::bigint as comments
    from postroom.accounts a
    left join postroom.posts p on p.account_id = a.id and p.status = 'published' and p.published_at >= ${since}
    where a.status <> 'disconnected' ${pf ? db()`and a.platform = ${pf}` : db()``} ${account_id ? db()`and a.id = ${account_id}` : db()``}
    group by a.id order by views desc`;

  const daily = await db()`select date_trunc('day', published_at)::date as day, count(*)::int as posts,
      coalesce(sum((metrics->>'views')::bigint), 0)::bigint as views
    from postroom.posts p where status = 'published' and published_at >= ${since} ${filt()}
    group by 1 order by 1`;

  const followers = await db()`select m.account_id, m.day, m.followers from postroom.account_metrics m
    join postroom.accounts a on a.id = m.account_id
    where m.day >= ${since} and a.status <> 'disconnected'
      ${pf ? db()`and a.platform = ${pf}` : db()``} ${account_id ? db()`and a.id = ${account_id}` : db()``}
    order by m.day`;

  const top = await db()`select p.id, p.platform, p.kind, p.caption, p.title, p.permalink, p.published_at, p.metrics,
      a.username,
      (select coalesce(m.poster_url, case when m.kind = 'image' then m.url end) from postroom.media m where m.id = p.media_ids[1]) as thumb
    from postroom.posts p join postroom.accounts a on a.id = p.account_id
    where p.status = 'published' and p.published_at >= ${since} ${filt()}
    order by coalesce((p.metrics->>'views')::bigint, 0) desc, p.published_at desc limit 10`;

  const bestHours = await db()`select extract(hour from published_at at time zone ${process.env.APP_TIMEZONE || 'Asia/Kolkata'})::int as hour,
      count(*)::int as posts, round(avg(coalesce((metrics->>'views')::bigint, 0)))::bigint as avg_views
    from postroom.posts p where status = 'published' and published_at >= ${new Date(Date.now() - 90 * 864e5)} and metrics ? 'views' ${filt()}
    group by 1 order by avg_views desc limit 5`;

  const n = (x) => Number(x || 0);
  const totals = (r) => ({ posts: n(r.posts), views: n(r.views), likes: n(r.likes), comments: n(r.comments), shares: n(r.shares), saves: n(r.saves) });
  return {
    days,
    totals: totals(cur),
    previous: totals(prev),
    by_platform: byPlatform.map((r) => ({ ...r, posts: n(r.posts), views: n(r.views), likes: n(r.likes), comments: n(r.comments), shares: n(r.shares) })),
    by_account: byAccount.map((r) => ({ ...r, followers_count: r.followers_count == null ? null : n(r.followers_count), posts: n(r.posts), views: n(r.views), likes: n(r.likes), comments: n(r.comments) })),
    daily: daily.map((r) => ({ day: r.day, posts: n(r.posts), views: n(r.views) })),
    followers: followers.map((r) => ({ account_id: r.account_id, day: r.day, followers: n(r.followers) })),
    top_posts: top,
    best_hours: bestHours.map((r) => ({ hour: r.hour, posts: n(r.posts), avg_views: n(r.avg_views) })),
    updated_at: (await db()`select max(metrics_at) as t from postroom.posts where status = 'published'`)[0]?.t || null,
  };
}
