// Deeper analytics: per-post watch/hook metrics + retention, account audience and daily series.
import { db, logEvent } from './core.js';
import { platform } from './platforms/index.js';
import { accessToken } from './accounts.js';

async function saveAccountInsight(accountId, kind, data, error = null) {
  await db()`insert into postroom.account_insights (account_id, kind, data, error, fetched_at)
    values (${accountId}, ${kind}, ${db().json(data || {})}, ${error}, now())
    on conflict (account_id, kind) do update set
      data = case when ${error === null} then excluded.data else postroom.account_insights.data end,
      error = excluded.error, fetched_at = now()`;
}

/** YouTube per-video analytics + retention for recent posts (the API lags ~1–2 days; refreshed every few hours). */
export async function collectPostInsights({ deadline = Date.now() + 120000, postIds = null, force = false } = {}) {
  const posts = await db()`select p.*, m.duration_s from postroom.posts p
    left join postroom.media m on m.id = p.media_ids[1]
    where p.status = 'published' and p.archived_at is null and p.platform = 'youtube' and p.external_id is not null
      and p.published_at > now() - interval '45 days'
      ${postIds?.length ? db()`and p.id = any(${postIds}::uuid[])` : force ? db()`` : db()`and (p.insights_at is null or p.insights_at < now() - interval '3 hours')`}
    order by p.published_at desc limit 60`;
  const byAccount = new Map();
  for (const p of posts) byAccount.set(p.account_id, [...(byAccount.get(p.account_id) || []), p]);
  let updated = 0;
  for (const [accountId, list] of byAccount) {
    if (Date.now() > deadline - 15000) break;
    const [a] = await db()`select * from postroom.accounts where id = ${accountId} and status = 'active'`;
    if (!a) continue;
    try {
      const token = await accessToken(a);
      const r = await platform('youtube').fetchInsights({ account: a, token, posts: list });
      for (const p of list) {
        const x = r[p.id];
        await db()`update postroom.posts set insights_at = now(),
            insights = insights || ${db().json(x?.insights || {})},
            retention = coalesce(${x?.retention ? db().json(x.retention) : null}, retention)
          where id = ${p.id}`;
        if (x) updated++;
      }
    } catch (e) {
      // failed (e.g. API switched off, channel needs reconnecting): try again in ~15 minutes, not 3 hours
      await db()`update postroom.posts set insights_at = now() - interval '165 minutes' where id = any(${list.map((p) => p.id)}::uuid[])`;
      await logEvent({ accountId, level: 'warn', message: `YouTube analytics: ${e.message}` });
    }
  }
  return { updated };
}

/** Audience (demographics, countries, traffic) and daily series for every account. */
export async function collectAccountInsights({ kinds = ['audience', 'daily'], accountIds = null } = {}) {
  const accounts = await db()`select * from postroom.accounts where status = 'active'
    ${accountIds?.length ? db()`and id = any(${accountIds}::uuid[])` : db()``}`;
  const out = {};
  for (const a of accounts) {
    const p = platform(a.platform);
    let token;
    try { token = await accessToken(a); } catch { continue; }
    for (const kind of kinds) {
      const fn = kind === 'audience' ? p.fetchAudience : kind === 'daily' ? p.fetchDaily : null;
      if (!fn) continue;
      try {
        await saveAccountInsight(a.id, kind, await fn.call(p, { account: a, token }));
        out[`${a.username}/${kind}`] = 'ok';
      } catch (e) {
        await saveAccountInsight(a.id, kind, null, e.message.slice(0, 400));
        out[`${a.username}/${kind}`] = e.message;
      }
    }
  }
  return out;
}

export async function getAccountInsights({ account_id = null } = {}) {
  return db()`select i.*, a.username, a.platform, a.brand->>'name' as brand, a.followers_count
    from postroom.account_insights i join postroom.accounts a on a.id = i.account_id
    where a.status <> 'disconnected' ${account_id ? db()`and i.account_id = ${account_id}` : db()``}
    order by a.platform, a.username, i.kind`;
}

/** Views over time for one post, from the stats snapshots (for the growth curve). */
export async function postGrowth(postId) {
  const [p] = await db()`select id, published_at, platform, retention, insights from postroom.posts where id = ${postId}`;
  if (!p) return null;
  const points = await db()`select at, views, likes, comments, shares, saves, reach from postroom.post_metrics where post_id = ${postId} order by at`;
  return {
    published_at: p.published_at,
    points: points.map((r) => ({ hours: p.published_at ? Math.max(0, (new Date(r.at) - new Date(p.published_at)) / 3600e3) : null, at: r.at, views: r.views == null ? null : Number(r.views), likes: r.likes == null ? null : Number(r.likes) })),
    retention: p.retention,
    insights: p.insights,
  };
}

export { logEvent };
