// The publisher. Supabase pg_cron calls /api/cron/tick every minute.
// Each due post advances through its platform's steps (upload → processing → published),
// as far as the time budget allows, and picks up where it left off on the next tick.
import { db, logEvent, throttle, PlatformError } from './core.js';
import { platform, KIND_LABEL } from './platforms/index.js';
import { accessToken } from './accounts.js';
import { loadMedia } from './media.js';
import { MISSED_SLOT_HOURS } from './posts.js';
import { pollInbox } from './inbox.js';

const MAX_ATTEMPTS = 6;
const PROCESSING_TIMEOUT_HOURS = 6;
const TICK_BUDGET_MS = 250000; // function maxDuration is 300s
const CLAIM_LIMIT = 6;

export async function tick({ budgetMs = TICK_BUDGET_MS } = {}) {
  const started = Date.now();
  const deadline = started + budgetMs;
  const sql = db();

  await failMissed();

  const claimed = await sql`update postroom.posts set locked_until = now() + interval '5 minutes'
    where id in (
      select id from postroom.posts
      where ((status = 'scheduled' and scheduled_at <= now()) or status = 'processing')
        and (next_attempt_at is null or next_attempt_at <= now())
        and (locked_until is null or locked_until < now())
      order by scheduled_at
      limit ${CLAIM_LIMIT}
      for update skip locked)
    returning *`;

  const results = [];
  for (let i = 0; i < claimed.length; i++) {
    const post = claimed[i];
    const remaining = deadline - Date.now();
    if (remaining < 40000) {
      await sql`update postroom.posts set locked_until = null where id = ${post.id}`;
      continue;
    }
    // Share the remaining time fairly between the posts still to go.
    const share = Math.max(40000, Math.floor(remaining / (claimed.length - i)));
    try {
      results.push({ id: post.id, outcome: await advance(post, Date.now() + share) });
    } catch (e) {
      results.push({ id: post.id, outcome: await handleError(post, e) });
    }
  }

  let maintenance = null;
  if (deadline - Date.now() > 30000) {
    try {
      maintenance = await housekeeping(deadline);
    } catch (e) {
      maintenance = { error: e.message };
    }
  }
  return { claimed: claimed.length, results, maintenance, ms: Date.now() - started };
}

async function failMissed() {
  const missed = await db()`update postroom.posts set status = 'failed',
      error = ${`Missed its slot by more than ${MISSED_SLOT_HOURS}h (was the publisher down?). Retry to post now.`}, updated_at = now()
    where status = 'scheduled' and scheduled_at < now() - make_interval(hours => ${MISSED_SLOT_HOURS})
    returning id, account_id`;
  for (const p of missed) await logEvent({ postId: p.id, accountId: p.account_id, level: 'error', message: 'Missed its slot' });
  const stuck = await db()`update postroom.posts set status = 'failed',
      error = 'Upload took too long and was stopped. Retry to start again.', locked_until = null, updated_at = now()
    where status = 'processing' and processing_started_at < now() - make_interval(hours => ${PROCESSING_TIMEOUT_HOURS})
    returning id, account_id`;
  for (const p of stuck) await logEvent({ postId: p.id, accountId: p.account_id, level: 'error', message: 'Processing timed out' });
}

export async function advance(post, deadline) {
  const sql = db();
  const [account] = await sql`select * from postroom.accounts where id = ${post.account_id}`;
  const p = platform(post.platform);
  if (!account || account.status !== 'active') {
    throw new PlatformError(`@${account?.username || 'account'} needs reconnecting before this can post.`, { tokenInvalid: false });
  }
  if (post.status === 'scheduled') {
    await sql`update postroom.posts set status = 'processing', processing_started_at = now(), updated_at = now() where id = ${post.id}`;
    post.status = 'processing';
    await logEvent({ postId: post.id, accountId: account.id, message: `Started publishing ${KIND_LABEL[post.kind]} to ${p.label} @${account.username}` });
  }
  const token = await accessToken(account);
  const media = await loadMedia(post.media_ids);
  const cover = post.cover_media_id ? (await loadMedia([post.cover_media_id]))[0] : null;
  const upload = { ...(post.upload || {}) };
  const save = async (patch) => {
    Object.assign(upload, patch);
    await sql`update postroom.posts set upload = ${sql.json(upload)}, updated_at = now() where id = ${post.id}`;
  };

  for (let guard = 0; guard < 50; guard++) {
    const r = await p.step({ post, account, token, media, cover, upload, save, deadline });
    if (r.done) {
      await sql`update postroom.posts set status = 'published', published_at = now(), external_id = ${r.externalId},
          ig_media_id = ${post.platform === 'instagram' ? r.externalId : null},
          permalink = ${r.permalink || null}, note = ${r.note || null}, error = null, locked_until = null,
          next_attempt_at = null, upload = ${sql.json({ ...upload, progress: 1 })}, updated_at = now()
        where id = ${post.id}`;
      await logEvent({ postId: post.id, accountId: account.id, message: `Published${r.permalink ? `: ${r.permalink}` : ''}${r.note ? ` — ${r.note}` : ''}` });
      return 'published';
    }
    if (r.waitSec) {
      await sql`update postroom.posts set next_attempt_at = now() + make_interval(secs => ${r.waitSec}), locked_until = null, updated_at = now()
        where id = ${post.id}`;
      return `waiting ${r.waitSec}s`;
    }
    if (r.progress != null) await save({ progress: r.progress });
    if (Date.now() > deadline - 30000) break;
  }
  await sql`update postroom.posts set locked_until = null where id = ${post.id}`;
  return 'continuing next tick';
}

export async function handleError(post, e) {
  const sql = db();
  const attempts = (post.attempts || 0) + 1;
  const msg = e.message || String(e);
  console.error('publish error', post.id, msg);
  if (e.tokenInvalid) {
    await sql`update postroom.posts set status = 'failed', error = ${msg}, attempts = ${attempts}, locked_until = null, updated_at = now() where id = ${post.id}`;
    await logEvent({ postId: post.id, accountId: post.account_id, level: 'error', message: msg });
    return 'failed: reconnect needed';
  }
  if ((e.transient || e.retryAfterSec) && attempts < MAX_ATTEMPTS) {
    const wait = e.retryAfterSec || Math.min(60 * 2 ** attempts, 3600);
    await sql`update postroom.posts set attempts = ${attempts}, error = ${msg},
        next_attempt_at = now() + make_interval(secs => ${wait}), locked_until = null, updated_at = now()
      where id = ${post.id}`;
    await logEvent({ postId: post.id, accountId: post.account_id, level: 'warn', message: `${msg} — retrying in ${Math.round(wait / 60)} min` });
    return `retry in ${wait}s`;
  }
  await sql`update postroom.posts set status = 'failed', error = ${msg}, attempts = ${attempts}, locked_until = null, updated_at = now() where id = ${post.id}`;
  await logEvent({ postId: post.id, accountId: post.account_id, level: 'error', message: `Failed: ${msg}` });
  return 'failed';
}

// ---------- housekeeping: token refresh, analytics, cleanup ----------
export async function housekeeping(deadline = Date.now() + 60000) {
  const out = {};
  out.tokens = await throttle('tokens', 3600, refreshTokens);
  // Instagram DMs every minute, comments every ~3 minutes (works while the Meta app is unpublished).
  out.inbox = await throttle('inbox-dms', 50, () => pollInbox({ dms: true, comments: false, deadline: deadline - 15000 }));
  if (Date.now() < deadline - 25000) out.comments = await throttle('inbox-comments', 170, () => pollInbox({ dms: false, comments: true, deadline: deadline - 15000 }));
  if (Date.now() < deadline - 20000) out.metrics = await throttle('metrics', 3 * 3600, () => collectMetrics(deadline));
  if (Date.now() < deadline - 20000) out.followers = await throttle('followers', 12 * 3600, collectFollowers);
  out.prune = await throttle('prune', 86400, async () => {
    const r = await db()`delete from postroom.events where at < now() - interval '90 days'`;
    return { events: r.count };
  });
  return out;
}

async function refreshTokens() {
  const accounts = await db()`select * from postroom.accounts where status = 'active'`;
  let refreshed = 0;
  for (const a of accounts) {
    const p = platform(a.platform);
    if (!p.needsRefresh(a)) continue;
    try {
      await accessToken(a);
      refreshed++;
    } catch { /* accessToken marks the account and logs */ }
  }
  return { refreshed };
}

export async function collectMetrics(deadline = Date.now() + 120000) {
  const posts = await db()`select * from postroom.posts
    where status = 'published' and external_id is not null and coalesce((upload->>'inbox')::boolean, false) = false
      and published_at > now() - interval '45 days'
      and (metrics_at is null or metrics_at < now() - interval '3 hours')
    order by metrics_at nulls first limit 150`;
  const byAccount = new Map();
  for (const p of posts) byAccount.set(p.account_id, [...(byAccount.get(p.account_id) || []), p]);
  let updated = 0;
  for (const [accountId, list] of byAccount) {
    if (Date.now() > deadline - 15000) break;
    const [a] = await db()`select * from postroom.accounts where id = ${accountId} and status = 'active'`;
    if (!a) continue;
    try {
      const token = await accessToken(a);
      const m = await platform(a.platform).fetchMetrics({ account: a, token, posts: list });
      for (const p of list) {
        const v = m[p.id];
        if (!v) {
          await db()`update postroom.posts set metrics_at = now() where id = ${p.id}`;
          continue;
        }
        const clean = Object.fromEntries(Object.entries(v).filter(([, x]) => x != null).map(([k, x]) => [k, Number(x)]));
        await db()`insert into postroom.post_metrics ${db()({ post_id: p.id, ...clean })}`;
        await db()`update postroom.posts set metrics = ${db().json(clean)}, metrics_at = now() where id = ${p.id}`;
        updated++;
      }
    } catch (e) {
      await logEvent({ accountId, level: 'warn', message: `Couldn't fetch analytics: ${e.message}` });
    }
  }
  return { updated };
}

export async function collectFollowers() {
  const accounts = await db()`select * from postroom.accounts where status = 'active'`;
  let updated = 0;
  for (const a of accounts) {
    try {
      const token = await accessToken(a);
      const n = await platform(a.platform).fetchFollowers({ account: a, token });
      if (n == null) continue;
      await db()`insert into postroom.account_metrics (account_id, day, followers) values (${a.id}, current_date, ${n})
        on conflict (account_id, day) do update set followers = excluded.followers`;
      await db()`update postroom.accounts set followers_count = ${n}, updated_at = now() where id = ${a.id}`;
      updated++;
    } catch (e) {
      if (!e.tokenInvalid) await logEvent({ accountId: a.id, level: "warn", message: `Couldn't fetch follower count: ${e.message}` });
    }
  }
  return { updated };
}
