// Weekly content reports: what we posted in a week, how each post did, what changed vs the week before,
// and Claude's read on what worked, what didn't, what we've learned and what to do next week.
// Automatic every Monday 10:00 India time for the week Mon–Sun just ended (one per brand); also on demand.
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { db, env, HttpError } from './core.js';
import { brandSummary } from './brand.js';
import { hookScore } from './hooks.js';
import { notify } from './notify.js';
import { accessToken } from './accounts.js';
import { platform } from './platforms/index.js';
import { igGet } from './platforms/instagram.js';
import { listUploads } from './platforms/youtube.js';

const igDate = (t) => new Date(String(t || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
const IG_KIND = { REELS: 'reel', CAROUSEL_ALBUM: 'carousel', IMAGE: 'image', VIDEO: 'reel' };

/** Posts made on the account outside Postroom (Instagram app, YouTube Studio…) in [from, to), with their current stats. */
export async function outsidePosts(account, from, to, knownIds) {
  const token = await accessToken(account);
  let items = [];
  if (account.platform === 'instagram') {
    const r = await igGet(`${account.external_id}/media`, token, { fields: 'id,caption,timestamp,permalink,media_type,media_product_type,thumbnail_url,media_url', limit: 50 }, account);
    items = (r.data || []).map((m) => ({
      external_id: m.id, kind: IG_KIND[m.media_product_type === 'REELS' ? 'REELS' : m.media_type] || 'image', caption: m.caption || '', title: null,
      permalink: m.permalink || null, published_at: igDate(m.timestamp), thumb: m.thumbnail_url || (m.media_type === 'IMAGE' ? m.media_url : null) || null, duration_s: null,
    }));
  } else if (account.platform === 'youtube') {
    items = (await listUploads({ token, channelId: account.external_id })).map((v) => ({ ...v, published_at: new Date(v.published_at) }));
  } else return [];
  items = items.filter((i) => !knownIds.has(String(i.external_id)) && i.published_at >= from && i.published_at < to);
  if (!items.length) return [];
  const p = platform(account.platform);
  const stats = await p.fetchMetrics({ account, token, posts: items.map((i) => ({ id: i.external_id, external_id: i.external_id, kind: i.kind })) }).catch(() => ({}));
  let deep = {};
  if (account.platform === 'youtube' && p.fetchInsights) deep = await p.fetchInsights({ account, token, posts: items.map((i) => ({ id: i.external_id, external_id: i.external_id, published_at: i.published_at, duration_s: i.duration_s })), withRetention: false }).catch(() => ({}));
  return items.map((i) => {
    const st = stats[i.external_id] || {};
    const { _insights, ...metrics } = st;
    return {
      id: `outside:${i.external_id}`, account_id: account.id, platform: account.platform, kind: i.kind, title: i.title, caption: i.caption,
      permalink: i.permalink, published_at: i.published_at, metrics, insights: { ...(_insights || {}), ...(deep[i.external_id]?.insights || {}) },
      username: account.username, idea_hook: null, series: null, duration_s: i.duration_s, thumb: i.thumb, views_24h: null, views_6h: null, outside: true,
    };
  });
}

const MODEL = () => env('CLAUDE_MODEL', 'claude-opus-5-5');
const IST = 330 * 60000; // India has no daylight saving: always UTC+05:30
const DAY = 864e5;
const RUN_AFTER_H = 10; // Monday 10:00 IST: stats from Sunday-night posts have had ~13 hours

/** The last finished Monday–Sunday week (India time), as real instants. */
export function lastWeek(now = new Date()) {
  const t = new Date(now.getTime() + IST);
  const dow = (t.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - dow) - IST;
  return { start: new Date(monday - 7 * DAY), end: new Date(monday), thisMonday: new Date(monday) };
}

const fmtIst = (d, o) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...o }).format(new Date(d));
const when = (d) => fmtIst(d, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const istHour = (d) => Number(fmtIst(d, { hour: '2-digit', hour12: false })) % 24;
const istDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d)); // YYYY-MM-DD
const firstLine = (s) => String(s || '').split('\n').map((x) => x.trim()).find(Boolean) || '';
const n = (v) => (v == null || v === '' ? null : Number(v));
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const avg = (vals) => { const v = vals.filter((x) => x != null && !Number.isNaN(x)); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
const median = (vals) => { const v = vals.filter((x) => x != null).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2)) : null; };
const v24 = (r) => r.views_24h ?? (r.outside ? r.views : null); // outside posts: lifetime views
/** Best / weakest posts: at most a third of the week each way (none marked weakest under 4 posts). */
export function bestWorst(posts) {
  const ranked = [...posts].filter((r) => v24(r) != null).sort((a, b) => v24(b) - v24(a));
  const k = Math.min(3, Math.floor(ranked.length / 3));
  return { best: ranked.slice(0, Math.max(1, k)).map((r) => r.ref), worst: ranked.length >= 4 ? ranked.slice(-k).reverse().map((r) => r.ref) : [] };
}
const pctChange = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

function totals(rows) {
  const views = sum(rows, 'views');
  const inter = sum(rows, 'likes') + sum(rows, 'comments') + sum(rows, 'shares') + sum(rows, 'saves');
  return {
    posts: rows.length,
    views,
    likes: sum(rows, 'likes'),
    comments: sum(rows, 'comments'),
    shares: sum(rows, 'shares'),
    saves: sum(rows, 'saves'),
    median_views_24h: median(rows.map(v24)),
    avg_views_24h: avg(rows.map(v24)),
    avg_hook_score: avg(rows.map((r) => r.hook_score)),
    avg_view_pct: avg(rows.map((r) => r.avg_view_pct)),
    engagement_rate: views ? Math.round((inter / views) * 1000) / 10 : null,
    subs_gained: sum(rows, 'subs_gained'),
  };
}

function breakdown(rows, keyFn, labelFn = (k) => k) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null || k === '') continue;
    (m.get(k) || m.set(k, []).get(k)).push(r);
  }
  return [...m].map(([k, list]) => ({ key: String(k), label: labelFn(k), posts: list.length, avg_views_24h: avg(list.map(v24)), avg_hook_score: avg(list.map((r) => r.hook_score)) }))
    .sort((a, b) => (b.avg_views_24h ?? -1) - (a.avg_views_24h ?? -1));
}

/** All the numbers for one brand's week (and the week before, for comparison). No Claude involved. */
export async function weekData({ brand, start, end }) {
  start = new Date(start); end = new Date(end);
  const len = end - start;
  const prevStart = new Date(start - len);
  const accts = await db()`select id, platform, username, followers_count, slots, brand from postroom.accounts where brand->>'name' = ${brand} order by platform, username`;
  if (!accts.length) throw new HttpError(404, `No accounts use the brand kit "${brand}".`);
  const ids = accts.map((a) => a.id);
  const rows = await db()`select p.id, p.account_id, p.platform, p.kind, p.title, p.caption, p.permalink, p.published_at, p.metrics, p.insights,
      a.username, i.hook as idea_hook, s.name as series, m.duration_s,
      coalesce((select c.url from postroom.media c where c.id = p.cover_media_id), m.poster_url, case when m.kind = 'image' then m.url end) as thumb,
      (select pm.views from postroom.post_metrics pm where pm.post_id = p.id and pm.at <= p.published_at + interval '24 hours' order by pm.at desc limit 1) as views_24h,
      (select pm.views from postroom.post_metrics pm where pm.post_id = p.id and pm.at <= p.published_at + interval '6 hours' order by pm.at desc limit 1) as views_6h
    from postroom.posts p join postroom.accounts a on a.id = p.account_id
    left join postroom.plan_ideas i on i.id = p.idea_id
    left join postroom.plan_series s on s.id = i.series_id
    left join postroom.media m on m.id = p.media_ids[1]
    where p.status = 'published' and p.archived_at is null and p.account_id = any(${ids}) and p.published_at >= ${prevStart} and p.published_at < ${end}
    order by p.published_at`;
  // plus everything posted on these accounts outside Postroom (phone, Studio…), so each brand's report is complete
  const notes = [];
  const known = new Set((await db()`select external_id from postroom.posts where account_id = any(${ids}) and external_id is not null`).map((r) => String(r.external_id)));
  for (const a of accts) {
    try {
      const [full] = await db()`select * from postroom.accounts where id = ${a.id} and status = 'active'`;
      if (full) rows.push(...(await outsidePosts(full, prevStart, end, known)));
    } catch (e) { notes.push(`${a.platform}:${a.username}: couldn't read posts made outside Postroom (${e.message})`); }
  }
  rows.sort((x, y) => new Date(x.published_at) - new Date(y.published_at));
  const now = Date.now();
  const toRow = (r) => {
    const met = r.metrics || {}, ins = r.insights || {};
    const views = n(met.views);
    const age = (now - new Date(r.published_at)) / 3600e3;
    const inter = (n(met.likes) || 0) + (n(met.comments) || 0) + (n(met.shares) || 0) + (n(met.saves) || 0);
    return {
      id: r.id, account: `${r.platform}:${r.username}`, platform: r.platform, kind: r.kind,
      posted: when(r.published_at), published_at: r.published_at, hour_ist: istHour(r.published_at), weekday: fmtIst(r.published_at, { weekday: 'short' }),
      hook: r.idea_hook || (r.platform === 'youtube' && r.title) || firstLine(r.caption), title: r.title || null,
      hashtags: [...new Set((String(r.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.toLowerCase()))],
      series: r.series || null, duration_s: n(r.duration_s), thumb: r.thumb || null, permalink: r.permalink || null,
      views, views_6h: n(r.views_6h) ?? (age < 6 ? views : null), views_24h: n(r.views_24h) ?? (age < 24 ? views : null), age_h: Math.round(age),
      reach: n(met.reach), likes: n(met.likes), comments: n(met.comments), shares: n(met.shares), saves: n(met.saves),
      engagement_rate: views ? Math.round((inter / views) * 1000) / 10 : null,
      hook_score: hookScore(r), skip_rate: ins.skip_rate ?? null, hold_3s: ins.hold_3s ?? null, avg_watch_s: ins.avg_watch_s ?? null,
      avg_view_pct: ins.avg_view_pct ?? (ins.avg_watch_s && r.duration_s ? Math.round((ins.avg_watch_s / Number(r.duration_s)) * 1000) / 10 : null),
      subs_gained: ins.subs_gained ?? null,
      outside: !!r.outside,
    };
  };
  const all = rows.map(toRow);
  const cur = all.filter((r) => new Date(r.published_at) >= start);
  const prev = all.filter((r) => new Date(r.published_at) < start);
  cur.forEach((r, i) => { r.ref = `P${i + 1}`; });
  prev.forEach((r, i) => { r.ref = `L${i + 1}`; });

  // followers at the start and end of the week (daily snapshots)
  const snaps = await db()`select account_id, day, followers from postroom.account_metrics where account_id = any(${ids}) and day <= ${istDay(end)}::date and day >= ${istDay(prevStart)}::date order by day`;
  const followersAt = (id, day) => { let v = null; for (const s of snaps) if (s.account_id === id && String(istDay(s.day)) <= day) v = s.followers; return v; };
  // platform-side daily totals (all content, not just this week's posts): Instagram reach, YouTube views/subs
  const daily = await db()`select account_id, data from postroom.account_insights where account_id = any(${ids}) and kind = 'daily'`;
  const dailySum = (id, k, from, to) => {
    const d = daily.find((x) => x.account_id === id)?.data?.days || [];
    const pick = d.filter((x) => x.day >= istDay(from) && x.day < istDay(to) && x[k] != null);
    return pick.length ? pick.reduce((s, x) => s + Number(x[k] || 0), 0) : null;
  };
  const failed = await db()`select count(*)::int as n from postroom.posts where account_id = any(${ids}) and status = 'failed' and scheduled_at >= ${start} and scheduled_at < ${end}`;
  const days = Math.round(len / DAY);

  const accounts = accts.map((a) => {
    const c = cur.filter((r) => r.account === `${a.platform}:${a.username}`);
    const p = prev.filter((r) => r.account === `${a.platform}:${a.username}`);
    const postedDays = new Set(c.map((r) => istDay(r.published_at))).size;
    const planned = Math.round(((a.slots || []).reduce((s, sl) => s + (sl.days?.length || 0), 0) * days) / 7);
    const fStart = followersAt(a.id, istDay(start)), fEnd = followersAt(a.id, istDay(new Date(end - 1))) ?? a.followers_count;
    return {
      account: `${a.platform}:${a.username}`, platform: a.platform, username: a.username,
      followers: fEnd, followers_change: fStart != null && fEnd != null ? fEnd - fStart : null,
      this_week: totals(c), last_week: totals(p),
      planned_slots: planned || null, days_with_a_post: postedDays, days_without_a_post: days - postedDays,
      platform_reach: a.platform === 'instagram' ? dailySum(a.id, 'reach', start, end) : null,
      platform_reach_last_week: a.platform === 'instagram' ? dailySum(a.id, 'reach', prevStart, start) : null,
      channel_views: a.platform === 'youtube' ? dailySum(a.id, 'views', start, end) : null,
      channel_views_last_week: a.platform === 'youtube' ? dailySum(a.id, 'views', prevStart, start) : null,
    };
  });
  const tc = totals(cur), tp = totals(prev);
  const byViews = [...cur].filter((r) => v24(r) != null).sort((a, b) => v24(b) - v24(a));
  return {
    brand, period: { start, end, label: `${fmtIst(start, { day: 'numeric', month: 'short' })} – ${fmtIst(new Date(end - 1), { day: 'numeric', month: 'short', year: 'numeric' })}`, days },
    totals: tc, previous: tp,
    change: Object.fromEntries(['posts', 'views', 'likes', 'comments', 'shares', 'saves', 'median_views_24h', 'avg_hook_score', 'engagement_rate'].map((k) => [k, pctChange(tc[k] || 0, tp[k] || 0)])),
    followers_change: accounts.some((a) => a.followers_change != null) ? accounts.reduce((s, a) => s + (a.followers_change || 0), 0) : null,
    failed_posts: failed[0].n,
    accounts,
    posts: cur,
    previous_posts: prev,
    ...bestWorst(cur),
    by_hour: breakdown(cur, (r) => r.hour_ist, (h) => `${String(h).padStart(2, '0')}:00`),
    by_weekday: breakdown(cur, (r) => r.weekday),
    by_kind: breakdown(cur, (r) => `${r.platform} ${r.kind}`),
    by_series: breakdown(cur, (r) => r.series),
    brand_kit: brandSummary(accts[0]),
    notes,
    outside_posts: cur.filter((r) => r.outside).length,
  };
}

const REF = { type: 'array', items: { type: 'string' }, description: 'Post refs from the data, e.g. ["P2","P5"]' };
const FINDING = { type: 'object', additionalProperties: false, required: ['finding', 'evidence', 'refs'], properties: { finding: { type: 'string' }, evidence: { type: 'string', description: 'The numbers that show it.' }, refs: REF } };
const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'summary', 'what_worked', 'what_didnt', 'learnings', 'experiment_review', 'decisions', 'experiments', 'caveats'],
  properties: {
    headline: { type: 'string', description: 'One-sentence verdict on the week, under 120 characters.' },
    summary: { type: 'string', description: '3–5 sentences: how the week went vs last week and the single most important takeaway.' },
    what_worked: { type: 'array', items: FINDING },
    what_didnt: { type: 'array', items: FINDING },
    learnings: {
      type: 'array',
      description: 'The running list of things we know about this audience. Carry forward earlier learnings: mark them confirmed, weakened or contradicted by this week; add new ones.',
      items: {
        type: 'object', additionalProperties: false, required: ['learning', 'status', 'confidence', 'evidence'],
        properties: {
          learning: { type: 'string' },
          status: { type: 'string', enum: ['new', 'confirmed', 'weakened', 'contradicted'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          evidence: { type: 'string' },
        },
      },
    },
    experiment_review: {
      type: 'array',
      description: 'One entry per experiment suggested in the previous report (empty if none).',
      items: {
        type: 'object', additionalProperties: false, required: ['experiment', 'verdict', 'evidence'],
        properties: { experiment: { type: 'string' }, verdict: { type: 'string', enum: ['worked', 'did_not_work', 'inconclusive', 'not_tried'] }, evidence: { type: 'string' } },
      },
    },
    decisions: {
      type: 'array',
      description: '3–6 concrete decisions for next week (keep / stop / start), most important first.',
      items: {
        type: 'object', additionalProperties: false, required: ['decision', 'why', 'priority'],
        properties: { decision: { type: 'string' }, why: { type: 'string' }, priority: { type: 'string', enum: ['high', 'medium', 'low'] } },
      },
    },
    experiments: {
      type: 'array',
      description: '1–3 controlled tests for next week: change one thing, say how to judge it.',
      items: {
        type: 'object', additionalProperties: false, required: ['test', 'how', 'success_metric'],
        properties: { test: { type: 'string' }, how: { type: 'string' }, success_metric: { type: 'string' } },
      },
    },
    caveats: { type: 'string', description: 'What the data cannot tell us yet (small sample, young posts, locked demographics…).' },
  },
};

function postLine(r) {
  const bits = [
    `${r.ref} [${r.account} ${r.kind}${r.duration_s ? ` ${Math.round(r.duration_s)}s` : ''}] ${r.posted} IST${r.outside ? ' (posted outside Postroom: lifetime totals only, no 6h/24h curve)' : ''}`,
    r.series && `series "${r.series}"`,
    `hook: "${r.hook}"`,
    `views ${r.views ?? '?'} (6h ${r.views_6h ?? '?'}, 24h ${r.views_24h ?? '?'}, age ${r.age_h}h)`,
    r.reach != null && `reach ${r.reach}`,
    `likes ${r.likes ?? 0}, comments ${r.comments ?? 0}, shares ${r.shares ?? 0}, saves ${r.saves ?? 0}`,
    r.engagement_rate != null && `engagement ${r.engagement_rate}%`,
    r.hook_score != null && `hook score ${r.hook_score}${r.skip_rate != null ? ` (skip ${r.skip_rate}%)` : r.hold_3s != null ? ` (held ${r.hold_3s}% at 3s)` : ''}`,
    r.avg_view_pct != null && `watched ${r.avg_view_pct}% on average`,
    r.subs_gained != null && `subs +${r.subs_gained}`,
    r.hashtags.length && `tags ${r.hashtags.join(' ')}`,
  ];
  return `- ${bits.filter(Boolean).join(' · ')}`;
}

function buildPrompt(d, history) {
  const t = d.totals, p = d.previous;
  const acctLines = d.accounts.map((a) => `- ${a.account}: ${a.this_week.posts} posts (last week ${a.last_week.posts}), views ${a.this_week.views} (last week ${a.last_week.views}), median 24h views ${a.this_week.median_views_24h ?? '–'} (last week ${a.last_week.median_views_24h ?? '–'}), avg hook score ${a.this_week.avg_hook_score ?? '–'}, followers ${a.followers ?? '?'}${a.followers_change != null ? ` (${a.followers_change >= 0 ? '+' : ''}${a.followers_change})` : ''}, ${a.days_without_a_post} of ${d.period.days} days without a post${a.planned_slots ? `, ${a.planned_slots} slots planned` : ''}${a.platform_reach != null ? `, account reach ${a.platform_reach} (last week ${a.platform_reach_last_week ?? '?'})` : ''}${a.channel_views != null ? `, channel views ${a.channel_views} (last week ${a.channel_views_last_week ?? '?'})` : ''}`);
  const bd = (name, rows) => rows.length ? `${name}: ${rows.map((r) => `${r.label} → ${r.posts} posts, avg 24h views ${r.avg_views_24h ?? '–'}, hook ${r.avg_hook_score ?? '–'}`).join('; ')}` : null;
  const hist = history.map((h) => {
    const r = h.report || {};
    return [
      `Report for ${h.data?.period?.label || h.period_start} (${h.posts} posts): ${r.headline || ''}`,
      (r.learnings || []).length && `Learnings: ${(r.learnings || []).map((l) => `${l.learning} [${l.confidence}, ${l.status}]`).join(' | ')}`,
      (r.experiments || []).length && `Experiments suggested for the following week: ${(r.experiments || []).map((e) => `${e.test} (judge by: ${e.success_metric})`).join(' | ')}`,
      (r.decisions || []).length && `Decisions: ${(r.decisions || []).map((x) => x.decision).join(' | ')}`,
    ].filter(Boolean).join('\n');
  });
  return [
    `You are the content analyst for ${d.brand}. Write the weekly report for ${d.period.label} (India time). The owner uses it to decide what to post next week, so be specific, honest and practical.`,
    d.brand_kit && `Brand kit:\n${d.brand_kit}`,
    `How to read the numbers: views_24h (views in a post's first 24 hours) is the fair way to compare posts of different ages. Hook score = % of viewers who did not skip in the first 3 seconds (Instagram 100 − skip rate; YouTube % still watching at 3 s); 70+ is strong, under 50 is weak. Engagement = (likes+comments+shares+saves) / views. Posts younger than 24 hours are still growing.`,
    `This week: ${t.posts} posts, ${t.views} views, median 24h views ${t.median_views_24h ?? '–'}, avg hook score ${t.avg_hook_score ?? '–'}, engagement ${t.engagement_rate ?? '–'}%, ${t.shares} shares, ${t.saves} saves, ${d.failed_posts} failed posts${d.followers_change != null ? `, followers ${d.followers_change >= 0 ? '+' : ''}${d.followers_change}` : ''}.`,
    `Last week: ${p.posts} posts, ${p.views} views, median 24h views ${p.median_views_24h ?? '–'}, avg hook score ${p.avg_hook_score ?? '–'}, engagement ${p.engagement_rate ?? '–'}%.`,
    `Per account:\n${acctLines.join('\n')}`,
    `This week's posts:\n${d.posts.map(postLine).join('\n') || '(none)'}`,
    d.previous_posts.length && `Last week's posts (for comparison):\n${d.previous_posts.map(postLine).join('\n')}`,
    [bd('By posting hour (IST)', d.by_hour), bd('By weekday', d.by_weekday), bd('By format', d.by_kind), bd('By series', d.by_series)].filter(Boolean).join('\n'),
    hist.length ? `Earlier reports (newest first) — carry their learnings forward and judge last report's experiments against this week:\n${hist.join('\n\n')}` : 'This is the first report: there are no earlier learnings or experiments.',
    'Rules: only claim what the numbers support and quote them; with few posts, say the signal is weak and keep confidence low. Refer to posts by their ref (P1, L2…). Separate correlation from cause. Decisions and experiments must be things the owner can actually do next week (topic, hook style, format, length, posting time, series, hashtags, cadence). Never invent numbers or facts.',
  ].filter(Boolean).join('\n\n');
}

async function askClaude(prompt) {
  const client = new Anthropic({ timeout: 170000, maxRetries: 1 });
  const res = await client.beta.messages.parse({
    model: MODEL(),
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: jsonSchemaOutputFormat(REPORT_SCHEMA) },
    messages: [{ role: 'user', content: prompt }],
  });
  if (!res.parsed_output) throw new Error('Claude returned an unexpected answer.');
  return res.parsed_output;
}

const history = (brand, before) => db()`select id, period_start, posts, data, report from postroom.weekly_reports
  where brand = ${brand} and report is not null and period_end <= ${before} order by period_end desc, created_at desc limit 3`;

/**
 * Build one report: the numbers, then Claude's analysis (if a Claude key is set — otherwise the numbers alone, with a note).
 * kind 'weekly' = the automatic Mon–Sun report (one per brand per week, replaced if re-run); 'manual' = on demand.
 */
export async function generateReport({ brand, start = null, end = null, kind = 'manual', ask = askClaude, notifyDone = false } = {}) {
  if (!brand) throw new HttpError(400, 'Pick a brand.');
  if (!start || !end) { end = new Date(); start = new Date(end - 7 * DAY); }
  const data = await weekData({ brand, start, end });
  let report = null, error = null;
  if (!env('ANTHROPIC_API_KEY') && ask === askClaude) error = 'Add a Claude API key in Settings → Claude to get the written analysis. The numbers below are complete.';
  else if (!data.posts.length && !data.previous_posts.length) error = 'Nothing was posted in this week or the week before, so there is nothing to analyse yet.';
  else {
    try { report = await ask(buildPrompt(data, await history(brand, data.period.start))); } catch (e) { error = `Claude could not write the analysis: ${e.message}. Tap "Rewrite analysis" to try again.`; }
  }
  const sql = db();
  const [row] = kind === 'weekly'
    ? await sql`insert into postroom.weekly_reports (brand, kind, period_start, period_end, posts, data, report, error)
        values (${brand}, 'weekly', ${data.period.start}, ${data.period.end}, ${data.posts.length}, ${sql.json(data)}, ${report ? sql.json(report) : null}, ${error})
        on conflict (brand, period_start) where kind = 'weekly' do update set period_end = excluded.period_end, posts = excluded.posts, data = excluded.data,
          report = excluded.report, error = excluded.error, created_at = now()
        returning *`
    : await sql`insert into postroom.weekly_reports (brand, kind, period_start, period_end, posts, data, report, error)
        values (${brand}, 'manual', ${data.period.start}, ${data.period.end}, ${data.posts.length}, ${sql.json(data)}, ${report ? sql.json(report) : null}, ${error})
        returning *`;
  if (notifyDone) {
    await notify({ kind: 'report', title: `Weekly report · ${brand}`, body: report?.headline || `${data.posts.length} posts, ${data.totals.views} views. ${error || ''}`.trim(), url: `/#/analytics?tab=reports&id=${row.id}` });
  }
  return row;
}

/** Re-run Claude on a saved report's period (e.g. after adding the key, or once more stats are in). */
export async function rewriteReport(id, { ask = askClaude } = {}) {
  const [r] = await db()`select * from postroom.weekly_reports where id = ${id}`;
  if (!r) throw new HttpError(404, 'Report not found.');
  if (r.kind === 'weekly') return generateReport({ brand: r.brand, start: r.period_start, end: r.period_end, kind: 'weekly', ask });
  const fresh = await generateReport({ brand: r.brand, start: r.period_start, end: r.period_end, kind: 'manual', ask });
  await db()`delete from postroom.weekly_reports where id = ${id}`;
  return fresh;
}

/** Housekeeping: after Monday 10:00 IST, write last week's report for each brand that posted (one at a time). */
export async function runWeeklyReports({ deadline = Date.now() + 200000, now = new Date(), ask = askClaude } = {}) {
  const { start, end } = lastWeek(now);
  if (now - end < RUN_AFTER_H * 3600e3) return { waiting: 'until Monday 10:00 India time' };
  // every brand gets its own report (posts made outside Postroom are read from Instagram/YouTube)
  const brands = await db()`select distinct a.brand->>'name' as brand from postroom.accounts a
    where a.brand->>'name' is not null and a.status = 'active'
      and not exists (select 1 from postroom.weekly_reports w where w.kind = 'weekly' and w.brand = a.brand->>'name' and w.period_start = ${start})
    order by 1`;
  const done = [];
  for (const { brand } of brands) {
    if (Date.now() > deadline - 120000) break;
    const r = await generateReport({ brand, start, end, kind: 'weekly', ask, notifyDone: true });
    done.push({ brand, id: r.id, ok: !!r.report });
  }
  return { week: start.toISOString().slice(0, 10), done, left: brands.length - done.length };
}

export async function listReports({ brand = null, limit = 30 } = {}) {
  return db()`select id, brand, kind, period_start, period_end, posts, report->>'headline' as headline, error, created_at,
      data->'totals' as totals, data->'change' as change, data->'period'->>'label' as label
    from postroom.weekly_reports ${brand ? db()`where brand = ${brand}` : db()``}
    order by period_end desc, created_at desc limit ${Math.min(Number(limit) || 30, 100)}`;
}

export async function getReport(id) {
  const [r] = await db()`select * from postroom.weekly_reports where id = ${id}`;
  if (!r) throw new HttpError(404, 'Report not found.');
  return r;
}

export async function latestReport({ brand }) {
  const [r] = await db()`select * from postroom.weekly_reports where brand = ${brand} order by period_end desc, created_at desc limit 1`;
  return r || null;
}

/** Everything we've learned about a brand's audience, newest status first (one line per learning). */
export async function learningLog({ brand, limit = 12 }) {
  const rows = await db()`select period_start, data->'period'->>'label' as label, report->'learnings' as learnings from postroom.weekly_reports
    where brand = ${brand} and report is not null order by period_end desc, created_at desc limit ${limit}`;
  const seen = new Set(), out = [];
  for (const r of rows) for (const l of r.learnings || []) {
    const k = l.learning.toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...l, week: r.label });
  }
  return out;
}
