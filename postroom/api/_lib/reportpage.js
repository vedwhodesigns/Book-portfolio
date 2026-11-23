import { bestWorst } from './reports.js';
// A weekly report as one self-contained HTML page: download it, print it to PDF, or open it from a share link.
// Everything from captions, comments or Claude is escaped; the page loads nothing but the post thumbnails.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-IN'));
const pct = (v) => (v == null ? '' : `<span class="chg ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(v))}% vs last week</span>`);
const safeUrl = (u) => (/^https:\/\//.test(String(u || '')) ? esc(u) : '');
const PF = { instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok' };
const STATUS = { new: 'New', confirmed: 'Confirmed', weakened: 'Weakened', contradicted: 'Contradicted' };
const VERDICT = { worked: 'Worked', did_not_work: "Didn't work", inconclusive: 'Inconclusive', not_tried: 'Not tried' };

export function reportFilename(r) {
  const label = String(r.data?.period?.label || '').replace(/[^\w\s–-]/g, '').replace(/[\s–]+/g, '-');
  return `${String(r.brand || 'Brand').replace(/[^\w]+/g, '-')}-weekly-report-${label || 'week'}.html`.replace(/-+/g, '-');
}

function bars(rows, label) {
  if (!rows?.length) return '';
  const max = Math.max(1, ...rows.map((b) => b.avg_views_24h || 0));
  return `<h3>${esc(label)}</h3><div class="bars">${rows.map((b) => `<div class="bar"><span>${esc(b.label)} · ${b.posts}</span><i style="width:${Math.max(2, ((b.avg_views_24h || 0) / max) * 100).toFixed(1)}%"></i><b>${num(b.avg_views_24h)}</b></div>`).join('')}</div>`;
}

export function renderReportHtml(r, { print = false, shared = false, appUrl = '' } = {}) {
  const d = r.data || {}, rep = r.report, t = d.totals || {}, ch = d.change || {};
  const bw = bestWorst(d.posts || []);
  const best = new Set(bw.best), worst = new Set(bw.worst);
  const kpi = (k, v, c) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div>${pct(c)}</div>`;
  const finding = (items, cls) => (items || []).map((f) => `<li><b>${esc(f.finding)}</b>${f.refs?.length ? ` <span class="refs">${f.refs.map(esc).join(' ')}</span>` : ''}<div class="muted">${esc(f.evidence)}</div></li>`).join('') || '<li class="muted">Nothing clear this week.</li>';
  const posts = (d.posts || []).map((p) => `<tr>
      <td>${p.thumb ? `<img src="${safeUrl(p.thumb)}" alt="" loading="lazy">` : ''}</td>
      <td><div class="ref">${esc(p.ref)}${best.has(p.ref) ? ' <span class="tag good">Best</span>' : ''}${worst.has(p.ref) ? ' <span class="tag bad">Weakest</span>' : ''}${p.outside ? ' <span class="tag">posted outside Postroom</span>' : ''}</div>
        <div class="hook">${p.permalink ? `<a href="${safeUrl(p.permalink)}">${esc(p.hook || '(no text)')}</a>` : esc(p.hook || '(no text)')}</div>
        <div class="muted small">${esc(PF[p.platform] || p.platform)} · ${esc(p.kind)} · ${esc(p.posted)}${p.duration_s ? ` · ${Math.round(p.duration_s)}s` : ''}</div></td>
      <td class="r"><b>${num(p.outside ? p.views : p.views_24h)}</b>${p.outside ? '<div class="muted small">total</div>' : ''}</td>
      <td class="r">${num(p.views)}</td>
      <td class="r">${p.hook_score != null ? `<span class="score ${p.hook_score >= 70 ? 'good' : p.hook_score >= 50 ? 'warn' : 'bad'}">${p.hook_score}</span>` : '—'}</td>
      <td class="r">${p.avg_view_pct != null ? `${p.avg_view_pct}%` : '—'}</td>
      <td class="r">${num(p.likes)} / ${num(p.comments)} / ${num(p.shares)} / ${num(p.saves)}</td>
    </tr>`).join('');
  const accounts = (d.accounts || []).map((a) => `<tr><td>${esc(PF[a.platform] || a.platform)} @${esc(a.username)}</td><td class="r">${a.this_week.posts} <span class="muted">(${a.last_week.posts})</span></td><td class="r">${num(a.this_week.views)} <span class="muted">(${num(a.last_week.views)})</span></td><td class="r">${num(a.followers)}${a.followers_change != null ? ` <span class="${a.followers_change >= 0 ? 'up' : 'down'}">${a.followers_change >= 0 ? '+' : ''}${a.followers_change}</span>` : ''}</td><td class="r">${a.days_without_a_post}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.brand)} · Weekly report · ${esc(d.period?.label || '')}</title>
<meta name="robots" content="noindex">
<style>
  :root { --ink:#16181d; --muted:#626a77; --line:#e3e6ea; --soft:#f5f6f8; --good:#137a3e; --bad:#b4232f; --warn:#9a6200; --accent:#2f5bd3; }
  * { box-sizing: border-box; }
  body { margin:0; background:#fff; color:var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  main { max-width: 920px; margin: 0 auto; padding: 32px 20px 48px; }
  header .brand { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 650; }
  h1 { font-size: 26px; line-height: 1.25; margin: 6px 0 10px; letter-spacing: -.01em; }
  h2 { font-size: 17px; margin: 28px 0 10px; padding-top: 16px; border-top: 1px solid var(--line); }
  h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 16px 0 8px; }
  .muted { color: var(--muted); } .small { font-size: 12.5px; }
  .summary { font-size: 15.5px; }
  .kpis { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 10px; margin: 18px 0 6px; }
  .kpi { border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
  .kpi .k { font-size: 12px; color: var(--muted); } .kpi .v { font-size: 22px; font-weight: 700; }
  .chg { font-size: 11.5px; font-weight: 600; } .up, .chg.up { color: var(--good); } .down, .chg.down { color: var(--bad); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  ul, ol { padding-left: 18px; margin: 6px 0; } li { margin: 0 0 9px; }
  .refs, .tag { font-size: 11px; background: var(--soft); border: 1px solid var(--line); border-radius: 99px; padding: 1px 7px; color: var(--muted); }
  .tag.good { color: var(--good); } .tag.bad { color: var(--bad); }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th { text-align: left; font-size: 11.5px; color: var(--muted); font-weight: 600; padding: 6px; border-bottom: 1px solid var(--line); }
  td { padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  td img { width: 42px; height: 56px; object-fit: cover; border-radius: 6px; display: block; }
  .hook a { color: var(--ink); } .ref { font-size: 11.5px; color: var(--muted); }
  .score { font-weight: 700; } .score.good { color: var(--good); } .score.warn { color: var(--warn); } .score.bad { color: var(--bad); }
  .bars .bar { display: grid; grid-template-columns: 170px 1fr 70px; align-items: center; gap: 8px; font-size: 12.5px; margin: 4px 0; }
  .bars i { display: block; height: 10px; background: var(--accent); border-radius: 4px; }
  .bars b { text-align: right; }
  .pill { font-size: 11px; font-weight: 650; padding: 1px 8px; border-radius: 99px; background: var(--soft); border: 1px solid var(--line); }
  .note { background: var(--soft); border-radius: 10px; padding: 10px 12px; font-size: 13.5px; }
  footer { margin-top: 32px; font-size: 12px; color: var(--muted); }
  .toolbar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid var(--line); padding: 10px 20px; display: flex; gap: 8px; justify-content: flex-end; }
  .toolbar button { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: #fff; cursor: pointer; }
  @media (max-width: 680px) { .kpis { grid-template-columns: repeat(2, minmax(0,1fr)); } .grid2 { grid-template-columns: 1fr; } .hide-sm { display: none; } .bars .bar { grid-template-columns: 110px 1fr 56px; } }
  @media print { .toolbar { display: none; } main { padding: 0; } h2 { break-after: avoid; } tr, li, .kpi { break-inside: avoid; } a { color: inherit; text-decoration: none; } }
</style></head>
<body>
${print || shared ? '' : ''}${shared ? `<div class="toolbar"><button onclick="window.print()">Save as PDF</button></div>` : ''}
<main>
<header>
  <div class="brand">${esc(r.brand)} · Weekly content report</div>
  <h1>${esc(rep?.headline || `${d.period?.label || ''}`)}</h1>
  <div class="muted small">${esc(d.period?.label || '')} (India time) · ${t.posts ?? 0} posts${d.outside_posts ? ` (${d.outside_posts} posted outside Postroom)` : ''} · written ${esc(new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }))}</div>
</header>
${rep ? `<p class="summary">${esc(rep.summary)}</p>` : `<p class="note">${esc(r.error || 'No written analysis for this week.')}</p>`}
<div class="kpis">
  ${kpi('Posts', num(t.posts), ch.posts)}
  ${kpi('Views', num(t.views), ch.views)}
  ${kpi('Median views (24h)', num(t.median_views_24h), ch.median_views_24h)}
  ${kpi('Hook score', t.avg_hook_score ?? '—', ch.avg_hook_score)}
  ${kpi('Engagement', t.engagement_rate != null ? `${t.engagement_rate}%` : '—', ch.engagement_rate)}
</div>
${d.followers_change != null ? `<div class="muted small">Followers this week: <b class="${d.followers_change >= 0 ? 'up' : 'down'}">${d.followers_change >= 0 ? '+' : ''}${d.followers_change}</b>${d.failed_posts ? ` · ${d.failed_posts} failed post(s)` : ''}</div>` : ''}
${rep ? `<div class="grid2"><div><h2>✓ What worked</h2><ul>${finding(rep.what_worked)}</ul></div><div><h2>✕ What didn't</h2><ul>${finding(rep.what_didnt)}</ul></div></div>
<h2>Decisions for next week</h2><ol>${(rep.decisions || []).map((x) => `<li><b>${esc(x.decision)}</b> <span class="pill">${esc(x.priority)}</span><div class="muted">${esc(x.why)}</div></li>`).join('')}</ol>
<h2>Experiments to run</h2><ul>${(rep.experiments || []).map((e) => `<li><b>${esc(e.test)}</b><div class="muted">${esc(e.how)}</div><div class="small">Judge by: ${esc(e.success_metric)}</div></li>`).join('') || '<li class="muted">None this week.</li>'}</ul>
${rep.experiment_review?.length ? `<h3>Last week's experiments</h3><ul>${rep.experiment_review.map((e) => `<li><span class="pill">${esc(VERDICT[e.verdict] || e.verdict)}</span> <b>${esc(e.experiment)}</b><div class="muted">${esc(e.evidence)}</div></li>`).join('')}</ul>` : ''}
<h2>What we've learned so far</h2><ul>${(rep.learnings || []).map((l) => `<li><span class="pill">${esc(STATUS[l.status] || l.status)}</span> <b>${esc(l.learning)}</b> <span class="muted small">· ${esc(l.confidence)} confidence</span><div class="muted">${esc(l.evidence)}</div></li>`).join('')}</ul>` : ''}
<h2>Every post this week</h2>
${(d.posts || []).length ? `<table><thead><tr><th></th><th>Post</th><th class="r">Views 24h</th><th class="r">Now</th><th class="r">Hook</th><th class="r">Watched</th><th class="r">Likes / comments / shares / saves</th></tr></thead><tbody>${posts}</tbody></table>
<p class="muted small">Hook score = % of viewers still watching after 3 seconds (70+ is strong). "Watched" = average % of the video viewed.</p>` : '<p class="muted">Nothing was published this week.</p>'}
<div class="grid2"><div>${bars(d.by_hour, 'Average views by posting time (IST)')}${bars(d.by_kind, 'By format')}</div><div>${bars(d.by_series, 'By series')}${bars(d.by_weekday, 'By weekday')}</div></div>
<h2>Accounts</h2>
<table><thead><tr><th>Account</th><th class="r">Posts (last wk)</th><th class="r">Views (last wk)</th><th class="r">Followers</th><th class="r">Days without a post</th></tr></thead><tbody>${accounts}</tbody></table>
${rep?.caveats ? `<p class="note"><b>Keep in mind:</b> ${esc(rep.caveats)}</p>` : ''}
${(d.notes || []).length ? `<p class="muted small">${d.notes.map(esc).join('<br>')}</p>` : ''}
<footer>Postroom weekly report · ${esc(r.brand)} · ${esc(d.period?.label || '')}${appUrl && !shared ? ` · ${esc(appUrl)}` : ''}</footer>
</main>
${print ? '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 400));</script>' : ''}
</body></html>`;
}
