#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Legacy `likes` can contain a stray UI number; only trust likesNum or context.
function likeCount(post) {
  if (post.likesNum != null) return post.likesNum;
  const context = String(post.likesContext || '').trim();
  const others = context.match(/^Liked by\s+.+?\s+and\s+([\d,.]+\s*[KM]?)\s+others?$/i);
  const match = others || context.match(/^([\d,.]+\s*[KM]?)\s+likes?$/i);
  if (!match) return null;
  const count = match[1].replaceAll(',', '').replace(/\s/g, '').match(/^(\d+(?:\.\d+)?)([KM]?)$/i);
  if (!count) return null;
  const value = Math.round(Number(count[1]) * ({ K: 1e3, M: 1e6 }[count[2].toUpperCase()] || 1));
  return Number.isSafeInteger(value) ? value + (others ? 1 : 0) : null;
}
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out')) { console.error('Usage: node scripts/library.js [--out ~/ig-research/library-site]'); process.exit(1); }
const out = resolve((args[1] || join(root, 'library-site')).replace(/^~(?=\/|$)/, homedir()));
// Keep generated public assets separate from middleware and deployment source.
const pub = join(out, 'public');
for (const dir of [out, pub, join(pub, 'img'), join(pub, 'post')]) mkdirSync(dir, { recursive: true });
// Remove prior generated post pages/thumbnails so deleted records cannot linger.
for (const [dir, pattern] of [[join(pub, 'post'), /^[\w-]+\.html$/], [join(pub, 'img'), /^[\w-]+\.jpg$/]]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isFile() && pattern.test(entry.name)) unlinkSync(join(dir, entry.name));
}
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = s => s.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const safeUrl = v => { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) ? esc(u.href) : '#'; } catch { return '#'; } };
const fmt = n => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
const css = `:root{color-scheme:dark;--bg:#101213;--panel:#191d20;--line:#343b3e;--muted:#a9b3b8;--accent:#c3f08b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#eef0eb;font:16px/1.65 system-ui,sans-serif}main,nav{max-width:1160px;margin:auto;padding:24px}nav{display:flex;gap:24px;border-bottom:1px solid var(--line)}a{color:var(--accent);text-underline-offset:4px}nav a{text-decoration:none}h1{font-size:clamp(2rem,6vw,4rem);line-height:1.12;letter-spacing:-.04em}h2{font-size:1.6rem;border-top:1px solid var(--line);padding-top:24px;margin-top:40px}h3{font-size:1.1rem;color:var(--accent)}p{white-space:pre-wrap;overflow-wrap:anywhere}small,.muted{color:var(--muted)}.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:28px 0}label{font-size:.85rem;color:var(--muted)}input,select{display:block;width:100%;padding:12px;margin-top:5px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:inherit;font:inherit}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:20px}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}.card a{display:block;padding:20px;color:inherit;text-decoration:none}.card img{width:100%;height:220px;object-fit:cover}.card blockquote{margin:12px 0;font-size:1.2rem;font-weight:600}.tag{color:var(--accent);font-size:.8rem}.stats{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:.85rem}article{max-width:850px}dt{color:var(--muted);font-size:.85rem;margin-top:15px}dd{margin:4px 0 16px;white-space:pre-wrap;overflow-wrap:anywhere}.entry{padding:12px 0;border-bottom:1px solid var(--line)}svg{width:100%;height:auto;display:block;background:var(--panel);border-radius:6px}li{margin:10px 0}code,pre{background:var(--panel);padding:3px 6px}pre{overflow:auto;padding:16px}a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:4px}[hidden]{display:none!important}@media(max-width:500px){main,nav{padding:18px}.filters{grid-template-columns:1fr 1fr}.filters label:first-child{grid-column:1/-1}}`;
const shell = (title, content, depth = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Reel Library</title><link rel="stylesheet" href="${depth}style.css"></head><body><nav aria-label="Main"><a href="${depth}index.html">Reel Library</a><a href="${depth}playbook.html">Playbook</a></nav><main>${content}</main></body></html>`;
function render(v) {
  if (v == null) return '<p class="muted">Not available</p>';
  if (Array.isArray(v)) return v.length ? `<ol>${v.map(x => `<li>${typeof x === 'object' ? render(x) : esc(x)}</li>`).join('')}</ol>` : '<p class="muted">None recorded</p>';
  if (typeof v === 'object') return `<dl>${Object.entries(v).map(([k, x]) => `<dt>${esc(label(k))}</dt><dd>${typeof x === 'object' ? render(x) : esc(x)}</dd>`).join('')}</dl>`;
  return `<p>${esc(v)}</p>`;
}
function charts(m) {
  const lengths = (m.shot_lengths_seconds || []).filter(v => Number.isFinite(v) && v >= 0), sum = lengths.reduce((a,b) => a+b,0);
  let x = 0;
  const cuts = sum ? `<svg viewBox="0 0 800 60" role="img" aria-label="Shot lengths across the video">${lengths.map((v,i) => { const w = v / sum * 800, rect = `<rect x="${x}" y="0" width="${w}" height="60" fill="${i%2 ? '#507155' : '#c3f08b'}" stroke="#101213"><title>Shot ${i+1}: ${v}s</title></rect>`; x += w; return rect; }).join('')}</svg>` : '<p>No shot timeline available.</p>';
  const curve = (m.short_term_loudness_curve || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  let loud = '<p>No loudness curve available.</p>';
  if (curve.length) { const low = Math.min(...curve.map(p => p[1])), high = Math.max(...curve.map(p => p[1])), duration = Math.max(m.duration_seconds || 0, ...curve.map(p => p[0]), 1); loud = `<svg viewBox="0 0 800 150" role="img" aria-label="Short term loudness curve in LUFS"><polyline fill="none" stroke="#c3f08b" stroke-width="2" points="${curve.map(([t,v]) => `${t/duration*800},${140-(v-low)/(high-low || 1)*130}`).join(' ')}"/></svg><p class="muted">${fmt(low)} to ${fmt(high)} LUFS · 3-second window</p>`; }
  return `<h3>Shot lengths · start → end</h3>${cuts}<h3>Loudness</h3>${loud}`;
}
// Minimal Markdown: headings, paragraphs, lists, fenced code, emphasis, safe links. Raw HTML is escaped.
function inline(s) { return esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>'); }
function markdown(text) {
  let result = '', para = [], list = null, code = null;
  const flush = () => { if (para.length) { result += `<p>${inline(para.join('\n'))}</p>`; para = []; } if (list) { result += `</${list}>`; list = null; } };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('```')) { flush(); if (code !== null) { result += `<pre><code>${esc(code.join('\n'))}</code></pre>`; code = null; } else code = []; continue; }
    if (code !== null) { code.push(line); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/), item = line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
    if (heading) { flush(); result += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`; }
    else if (item) { const type = item[1] ? 'ul' : 'ol'; if (list !== type) { flush(); list = type; result += `<${type}>`; } result += `<li>${inline(item[2])}</li>`; }
    else if (!line.trim()) flush();
    else { if (list) flush(); para.push(line); }
  }
  flush(); if (code !== null) result += `<pre><code>${esc(code.join('\n'))}</code></pre>`;
  return result;
}
const posts = new Map();
for (const project of readdirSync(join(root, 'projects'), { withFileTypes: true }).filter(d => d.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
  const dir = join(root, 'projects', project.name), td = join(dir, 'teardowns');
  if (!existsSync(td)) continue;
  const rawPath = join(dir, 'raw-posts.json');
  const raw = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, 'utf8')) : [];
  const rawPosts = new Map((Array.isArray(raw) ? raw : raw.posts).map(p => [p.postId, p]));
  for (const name of readdirSync(td).filter(f => f.endsWith('.json') && !f.endsWith('.measure.json')).sort()) {
    try {
      const p = JSON.parse(readFileSync(join(td, name), 'utf8'));
      if (!/^[\w-]+$/.test(p.postId) || !p.teardown || !p.measure) throw Error('Invalid teardown record');
      if (posts.has(p.postId)) { console.warn(`Duplicate ${p.postId}: keeping first project`); continue; }
      const source = rawPosts.get(p.postId);
      p.likesNum = p.likesNum ?? source?.likesNum ?? likeCount(p) ?? likeCount(source || {});
      p.project = project.name;
      const image = join(dir, 'hook-screenshots', `${p.postId}_0s.jpg`);
      if (existsSync(image)) { copyFileSync(image, join(pub, 'img', `${p.postId}.jpg`)); p.image = true; }
      posts.set(p.postId, p);
    } catch (e) { console.warn(`${project.name}/${name}: ${e.message}`); }
  }
}
const records = [...posts.values()];
const options = values => '<option value="">All</option>' + [...new Set(values.filter(Boolean))].sort().map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
const filters = `<div class="filters"><label>Search<input id="search" type="search" placeholder="Search ideas, hooks, captions…"></label><label>Account<select id="account">${options(records.map(p => p.author))}</select></label><label>Hook type<select id="hook">${options(records.map(p => p.teardown.hook?.hook_type))}</select></label><label>Format<select id="format">${options(records.map(p => p.teardown.idea?.format))}</select></label><label>Sort by<select id="sort"><option value="likes">Likes</option><option value="views">Views</option><option value="date">Newest</option><option value="cuts">Cuts per 10s</option></select></label></div>`;
const cards = records.map(p => {
  const t = p.teardown, m = p.measure;
  const search = [p.author, p.caption, JSON.stringify(t)].join(' ').toLowerCase();
  return `<div class="card" data-account="${esc(p.author)}" data-hook="${esc(t.hook?.hook_type)}" data-format="${esc(t.idea?.format)}" data-search="${esc(search)}" data-likes="${p.likesNum ?? -1}" data-views="${p.viewsNum ?? -1}" data-date="${Date.parse(p.date) || 0}" data-cuts="${m.cuts_per_10_seconds ?? -1}">${p.image ? `<img src="img/${p.postId}.jpg" alt="Hook frame from ${esc(p.author)}" loading="lazy">` : ''}<a href="post/${p.postId}.html"><small>@${esc(p.author)}</small><blockquote>${esc(t.hook?.first_3s_spoken || '[No spoken hook]')}</blockquote><p class="tag">${esc(t.hook?.hook_type)} · ${esc(t.idea?.format)}</p><div class="stats"><span>${fmt(p.likesNum)} likes</span><span>${fmt(p.viewsNum)} views</span><span>${fmt(m.shot_length_seconds?.average)}s avg shot</span><span>${fmt(m.bpm)} BPM</span></div></a></div>`;
}).join('');
writeFileSync(join(pub, 'index.html'), shell('Browse', `<h1>Study the scroll stop.</h1><p class="muted">A working library of hooks, edits, and sound.</p>${filters}<p id="count" role="status">${records.length} reels</p><div class="grid" id="grid">${cards}</div><p id="empty" hidden>No reels match these filters.</p><script src="library.js" defer></script>`));
writeFileSync(join(pub, 'library.js'), `const ids=['search','account','hook','format','sort'];const controls=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));const grid=document.getElementById('grid'),cards=[...grid.children];function update(){const q=controls.search.value.toLowerCase().trim();let count=0;cards.sort((a,b)=>Number(b.dataset[controls.sort.value])-Number(a.dataset[controls.sort.value])).forEach(card=>{card.hidden=!(card.dataset.search.includes(q)&&['account','hook','format'].every(k=>!controls[k].value||card.dataset[k]===controls[k].value));if(!card.hidden)count++;grid.append(card)});document.getElementById('count').textContent=count+' reels';document.getElementById('empty').hidden=count!==0}ids.forEach(id=>controls[id].addEventListener('input',update));update();\n`);
for (const p of records) {
  const t = p.teardown;
  const sections = [['Idea',t.idea],['Hook',t.hook],['Timestamped transcript',t.script?.transcript],['Beat structure',t.script?.structure],['Script devices',t.script?.devices],['Words per minute',t.script?.words_per_minute],['CTA',t.script?.cta],['Shot list',t.edit?.shots],['Caption style',t.edit?.caption_style],['Graphics and motion',t.edit?.graphics_and_motion],['Pacing',t.edit?.pacing_notes],['Sound',t.sound],['Replicate recipe',t.replicate?.recipe_steps],['How It Clicks adaptation',t.replicate?.how_it_clicks_adaptation],['Difficulty',t.replicate?.difficulty],['Confidence notes',t.confidence_notes]];
  const body = `<article><h1>@${esc(p.author)}</h1><p>${esc(p.date)} · ${fmt(p.likesNum)} likes · ${fmt(p.viewsNum)} views</p><p><a href="${safeUrl(p.url)}" rel="noopener noreferrer">Original Instagram post ↗</a></p>${sections.map(([title,v]) => `<section><h2>${title}</h2>${render(v)}</section>`).join('')}<section><h2>Measured stats</h2>${charts(p.measure)}${render(Object.fromEntries(Object.entries(p.measure).filter(([k]) => !['source','short_term_loudness_curve','onset_timestamps_seconds'].includes(k))))}</section><h2>Source caption</h2><p>${esc(p.caption)}</p><p class="muted">Model: ${esc(p.model)} · Created: ${esc(p.createdAt)}</p></article>`;
  writeFileSync(join(pub, 'post', `${p.postId}.html`), shell(p.postId, body, '../'));
}
const playbook = join(root, 'library', 'playbook.md');
writeFileSync(join(pub, 'playbook.html'), shell('Playbook', `<article>${existsSync(playbook) ? markdown(readFileSync(playbook, 'utf8')) : '<h1>Playbook</h1><p>Add library/playbook.md to collect patterns and production recipes here.</p>'}</article>`));
writeFileSync(join(pub, 'style.css'), css);
writeFileSync(join(out, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2) + '\n');
writeFileSync(join(out, 'vercel.json'), JSON.stringify({ framework: null, buildCommand: null, outputDirectory: 'public', cleanUrls: false, proxy: { entrypoint: 'middleware.js', matcher: '/:path*' } }, null, 2) + '\n');
writeFileSync(join(out, 'middleware.js'), `// Runs before every static asset and page. Missing configuration fails closed.
export const config = { matcher: '/:path*' };
export default function middleware(request) {
  const user = process.env.LIBRARY_USER, pass = process.env.LIBRARY_PASS;
  const auth = request.headers.get('authorization') || '';
  let valid = false;
  if (user && pass && /^Basic /i.test(auth)) {
    try {
      const bytes = Uint8Array.from(atob(auth.slice(6).trim()), c => c.charCodeAt(0));
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const colon = decoded.indexOf(':');
      valid = colon >= 0 && decoded.slice(0, colon) === user && decoded.slice(colon + 1) === pass;
    } catch {}
  }
  if (!valid) return new Response('Authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Reel Library", charset="UTF-8"', 'Cache-Control': 'no-store' } });
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
`);
console.log(`Built ${records.length} cards and ${records.length} post pages in ${out} (static assets: public/).`);
