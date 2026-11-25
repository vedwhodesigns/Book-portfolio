// Hook learning: how well each video's opening holds viewers, ranked, plus Claude's read on what works.
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { db, env, HttpError } from './core.js';
import { brandSummary } from './brand.js';

const MODEL = () => env('CLAUDE_MODEL', 'claude-opus-5-5');

/**
 * Hook score (0–100): how many people stayed past the first ~3 seconds.
 *   Instagram reels: 100 − skip rate (skip = left in the first 3 s).
 *   YouTube: % of starting viewers still watching at 3 s (retention curve), capped at 100.
 *   Fallback: average % of the video watched.
 */
export function hookScore(p) {
  const i = p.insights || {};
  if (i.skip_rate != null) return Math.max(0, Math.min(100, Math.round(100 - i.skip_rate)));
  if (i.hold_3s != null) return Math.max(0, Math.min(100, Math.round(i.hold_3s)));
  if (i.avg_view_pct != null) return Math.max(0, Math.min(100, Math.round(i.avg_view_pct)));
  return null;
}

const firstLine = (s) => String(s || '').split('\n').map((x) => x.trim()).find(Boolean) || '';

/** Every published video with its hook text and hook metrics, best first. */
export async function listHooks({ brand = null, account_id = null, days = 120 } = {}) {
  const rows = await db()`select p.id, p.platform, p.kind, p.title, p.caption, p.permalink, p.published_at, p.metrics, p.insights,
      a.username, a.brand->>'name' as brand, i.hook as idea_hook, i.title as idea_title, m.duration_s,
      coalesce((select c.url from postroom.media c where c.id = p.cover_media_id), m.poster_url) as thumb
    from postroom.posts p join postroom.accounts a on a.id = p.account_id
    left join postroom.plan_ideas i on i.id = p.idea_id
    left join postroom.media m on m.id = p.media_ids[1]
    where p.status = 'published' and p.archived_at is null and p.kind in ('reel', 'short', 'video')
      and p.published_at > now() - make_interval(days => ${Number(days) || 120})
      ${brand ? db()`and a.brand->>'name' = ${brand}` : db()``}
      ${account_id ? db()`and p.account_id = ${account_id}` : db()``}
    order by p.published_at desc limit 300`;
  // views relative to the account's median → "did this hook travel?"
  const med = new Map();
  for (const [acct, list] of Object.entries(rows.reduce((m, r) => ((m[r.username] ||= []).push(Number(r.metrics?.views || 0)), m), {}))) {
    const s = list.sort((x, y) => x - y);
    med.set(acct, s[Math.floor(s.length / 2)] || 0);
  }
  return rows.map((r) => {
    const views = r.metrics?.views == null ? null : Number(r.metrics.views);
    const m = med.get(r.username);
    return {
      id: r.id, platform: r.platform, kind: r.kind, account: r.username, brand: r.brand, permalink: r.permalink, published_at: r.published_at, thumb: r.thumb,
      hook: r.idea_hook || (r.platform === 'youtube' ? r.title : null) || firstLine(r.caption),
      score: hookScore(r),
      skip_rate: r.insights?.skip_rate ?? null,
      hold_3s: r.insights?.hold_3s ?? null,
      avg_watch_s: r.insights?.avg_watch_s ?? null,
      avg_view_pct: r.insights?.avg_view_pct ?? (r.insights?.avg_watch_s && r.duration_s ? Math.round((r.insights.avg_watch_s / Number(r.duration_s)) * 1000) / 10 : null),
      duration_s: r.duration_s == null ? null : Number(r.duration_s),
      views,
      views_vs_median: views != null && m ? Math.round((views / m) * 100) / 100 : null,
      shares: r.metrics?.shares ?? null,
      saves: r.metrics?.saves ?? null,
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.views ?? 0) - (a.views ?? 0));
}

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'patterns', 'keep_doing', 'stop_doing', 'try_next'],
  properties: {
    summary: { type: 'string', description: '2–3 sentences: what separates the hooks that hold from the ones that lose people.' },
    patterns: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['pattern', 'evidence', 'effect'],
        properties: {
          pattern: { type: 'string', description: 'A hook pattern, e.g. "opens with a direct question to the viewer".' },
          evidence: { type: 'string', description: 'Which posts show it, with their scores.' },
          effect: { type: 'string', enum: ['helps', 'hurts', 'unclear'] },
        },
      },
    },
    keep_doing: { type: 'array', items: { type: 'string' } },
    stop_doing: { type: 'array', items: { type: 'string' } },
    try_next: { type: 'array', items: { type: 'string' }, description: '5 concrete new hook lines for upcoming videos, in the brand voice, without invented facts.' },
  },
};

/** Ask Claude what the hook data says. Saved so the app shows the latest report. */
export async function analyzeHooks({ brand = null } = {}) {
  if (!env('ANTHROPIC_API_KEY')) throw new HttpError(400, 'Add a Claude API key in Settings → Claude to get hook learnings.');
  const hooks = (await listHooks({ brand })).filter((h) => h.score != null || h.views != null);
  if (hooks.length < 3) throw new HttpError(400, `Need at least 3 published videos with stats${brand ? ` for ${brand}` : ''} — ${hooks.length} so far.`);
  const accts = brand ? await db()`select username, platform, brand from postroom.accounts where brand->>'name' = ${brand}` : [];
  const kit = accts.length ? brandSummary(accts[0]) : '';
  const lines = hooks.slice(0, 60).map((h) => `- [${h.platform} ${h.kind}${h.duration_s ? ` ${Math.round(h.duration_s)}s` : ''}] "${h.hook}" → hook score ${h.score ?? 'n/a'}${h.skip_rate != null ? ` (skip ${h.skip_rate}%)` : ''}${h.hold_3s != null ? ` (held ${h.hold_3s}% at 3s)` : ''}${h.avg_view_pct != null ? `, watched ${h.avg_view_pct}% on average` : ''}, ${h.views ?? '?'} views${h.views_vs_median != null ? ` (${h.views_vs_median}× the account median)` : ''}`);
  const client = new Anthropic();
  const res = await client.beta.messages.parse({
    model: MODEL(),
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: jsonSchemaOutputFormat(REPORT_SCHEMA) },
    messages: [{
      role: 'user',
      content: [
        `You analyse short-video hooks (the first line / first 3 seconds) for ${brand || 'these accounts'}.`,
        kit && `Brand kit:\n${kit}`,
        `Hook score = % of viewers who did NOT skip in the first 3 seconds (Instagram: 100 − skip rate; YouTube: % still watching at 3 s). Higher is better. Views vs median shows reach.`,
        `Data (best hook score first):\n${lines.join('\n')}`,
        'Find the patterns in wording, structure and topic that separate high-scoring hooks from low ones. Only claim what the data supports; with little data, say so and keep conclusions tentative. Write try_next hooks in the brand voice; never invent facts.',
      ].filter(Boolean).join('\n\n'),
    }],
  });
  if (!res.parsed_output) throw new HttpError(502, 'Claude returned an unexpected answer. Try again.');
  const [row] = await db()`insert into postroom.hook_reports (brand, report, posts) values (${brand}, ${db().json(res.parsed_output)}, ${hooks.length}) returning *`;
  return row;
}

export async function latestHookReport({ brand = null } = {}) {
  const [r] = brand
    ? await db()`select * from postroom.hook_reports where brand = ${brand} order by created_at desc limit 1`
    : await db()`select * from postroom.hook_reports where brand is null order by created_at desc limit 1`;
  return r || null;
}
