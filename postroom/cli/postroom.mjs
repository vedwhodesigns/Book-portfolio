#!/usr/bin/env node
// Postroom command line: hand a finished post to Postroom from any computer (used by the TCA Tool Kit).
// Built into a single file served at https://vwd-postroom.vercel.app/postroom.mjs — needs only Node 18+.
//
//   POSTROOM_PASSWORD=… node postroom.mjs post card.json      upload the files and schedule the post
//   POSTROOM_PASSWORD=… node postroom.mjs check card.json     dry run: show what would be posted and any problems
//   POSTROOM_PASSWORD=… node postroom.mjs upload a.mp4 b.jpg  just upload files to the library (prints ids)
//   POSTROOM_PASSWORD=… node postroom.mjs queue               list upcoming posts
//   POSTROOM_PASSWORD=… node postroom.mjs accounts            list accounts, their slots and hashtag sets
//
// card.json:
// {
//   "media": ["short.mp4"],                         // local files (or library ids), in order (carousel order)
//   "accounts": ["crimearchives.media", "youtube:thecrimearchivesmedia"],
//   "caption": "…",                                  // shared caption ("captions": { "<account>": "…" } for per-account)
//   "title": "…",                                    // YouTube title (≤100 chars)
//   "when": "next_slot",                             // "next_slot" | "now" | "draft" | "2026-11-20T19:00" (India time) | ISO time
//   "hashtags": "brand",                             // "brand" adds each account's first hashtag set if missing; "none" leaves the caption as is
//   "kind": { "instagram": "reel" },                 // optional: image | carousel | reel | story | short | video
//   "instagram_cover": "cover.jpg",                  // optional 9:16 reel cover
//   "youtube_thumbnail": "thumb.jpg",                // optional 16:9 thumbnail
//   "youtube_tags": ["titan submarine", "deep sea"], // optional hidden YouTube tags for this video (brand tags are added)
//   "captions": { "youtube": "…", "instagram": "…" }, // optional per-platform (or per-account) captions
//   "options": { "instagram": { "first_comment": "…" }, "youtube": { "tags": ["…"] } }
// }
import fs from 'node:fs';
import path from 'node:path';
import { upload } from '@vercel/blob/client';

// Settings: env vars, or ~/.postroom.json  { "password": "…", "url": "https://vwd-postroom.vercel.app" }
const CONF = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(process.env.HOME || process.env.USERPROFILE || '.', '.postroom.json'), 'utf8')); } catch { return {}; }
})();
const BASE = (process.env.POSTROOM_URL || CONF.url || 'https://vwd-postroom.vercel.app').replace(/\/$/, '');
const TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' };
let cookie = null;

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function login() {
  const pw = process.env.POSTROOM_PASSWORD || CONF.password;
  if (!pw) die('Set POSTROOM_PASSWORD, or save {"password": "…"} in ~/.postroom.json.');
  const r = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
  if (!r.ok) die(`Postroom sign-in failed (${r.status}). Check POSTROOM_PASSWORD.`);
  cookie = r.headers.get('set-cookie').split(';')[0];
}

async function api(p, { method = 'GET', body } = {}) {
  const r = await fetch(`${BASE}/api/${p}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(j.error || `HTTP ${r.status}`);
    err.data = j;
    throw err;
  }
  return j;
}

// ---- MP4/MOV duration and display size (moov → mvhd / video tkhd) ----
function boxes(buf, start, end) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    let head = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(o + 8)); head = 16; }
    if (size === 0) size = end - o;
    if (size < head) break;
    out.push({ type, start: o + head, end: Math.min(o + size, end) });
    o += size;
  }
  return out;
}
function findMoov(file) {
  const fd = fs.openSync(file, 'r');
  const total = fs.fstatSync(fd).size;
  const h = Buffer.alloc(16);
  let o = 0;
  try {
    while (o + 8 <= total) {
      fs.readSync(fd, h, 0, 16, o);
      let size = h.readUInt32BE(0);
      const type = h.toString('latin1', 4, 8);
      if (size === 1) size = Number(h.readBigUInt64BE(8));
      if (size === 0) size = total - o;
      if (type === 'moov') {
        const b = Buffer.alloc(size);
        fs.readSync(fd, b, 0, size, o);
        return b;
      }
      if (size < 8) break;
      o += size;
    }
  } finally {
    fs.closeSync(fd);
  }
  return null;
}
function videoMeta(file) {
  try {
    const moov = findMoov(file);
    if (!moov) return {};
    const top = boxes(moov, 8, moov.length);
    const out = {};
    const mvhd = top.find((b) => b.type === 'mvhd');
    if (mvhd) {
      const v = moov[mvhd.start];
      const ts = v === 1 ? moov.readUInt32BE(mvhd.start + 20) : moov.readUInt32BE(mvhd.start + 12);
      const dur = v === 1 ? Number(moov.readBigUInt64BE(mvhd.start + 24)) : moov.readUInt32BE(mvhd.start + 16);
      if (ts && dur) out.duration_s = Math.round((dur / ts) * 100) / 100;
    }
    for (const trak of top.filter((b) => b.type === 'trak')) {
      const kids = boxes(moov, trak.start, trak.end);
      const mdia = kids.find((b) => b.type === 'mdia');
      const hdlr = mdia && boxes(moov, mdia.start, mdia.end).find((b) => b.type === 'hdlr');
      if (!hdlr || moov.toString('latin1', hdlr.start + 8, hdlr.start + 12) !== 'vide') continue;
      const tkhd = kids.find((b) => b.type === 'tkhd');
      if (!tkhd) continue;
      const base = tkhd.start + (moov[tkhd.start] === 1 ? 32 : 20) + 20; // matrix
      const rotated = moov.readInt32BE(base) === 0 && Math.abs(moov.readInt32BE(base + 4)) === 65536;
      const w = moov.readUInt32BE(base + 36) / 65536;
      const hh = moov.readUInt32BE(base + 40) / 65536;
      out.width = Math.round(rotated ? hh : w);
      out.height = Math.round(rotated ? w : hh);
      break;
    }
    return out;
  } catch {
    return {};
  }
}

async function uploadOne(file) {
  if (/^[0-9a-f-]{36}$/i.test(file)) return { id: file, reused: true }; // already in the library
  if (!fs.existsSync(file)) die(`File not found: ${file}`);
  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext];
  if (!type) die(`${file}: Postroom takes MP4/MOV videos and JPEG/PNG/WebP/HEIC images.`);
  const size = fs.statSync(file).size;
  const meta = type.startsWith('video/') ? videoMeta(file) : {};
  const name = path.basename(file).replace(/[^\w.\-]+/g, '-');
  let last = -1;
  const r = await upload(`media/${name}`, fs.readFileSync(file), {
    access: 'public',
    handleUploadUrl: `${BASE}/api/media/upload`,
    headers: { cookie },
    contentType: type,
    multipart: size > 50 * 1024 * 1024,
    onUploadProgress: (e) => {
      const p = Math.floor(e.percentage / 25) * 25;
      if (p > last) { last = p; process.stderr.write(`  ↑ ${name} ${p}%\n`); }
    },
  });
  const m = await api('media', { method: 'POST', body: { url: r.url, pathname: r.pathname, content_type: type, size_bytes: size, filename: path.basename(file), ...meta } });
  return m;
}

function resolveRef(ref, accounts) {
  const m = /^(instagram|youtube|tiktok):(.+)$/i.exec(ref);
  const name = (m ? m[2] : ref).replace(/^@/, '').toLowerCase();
  const list = accounts.filter((a) => a.username.toLowerCase() === name && (!m || a.platform === m[1].toLowerCase()));
  if (!list.length) die(`No connected account "${ref}". Run: node postroom.mjs accounts`);
  if (list.length > 1) die(`"${ref}" is on several platforms — write it as instagram:${name} or youtube:${name}.`);
  return list[0];
}

function withBrandTags(caption, account) {
  const set = account.brand?.hashtag_sets?.[0];
  if (!set) return caption;
  const have = new Set((caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase()));
  const missing = set.tags.filter((t) => !have.has(t.toLowerCase()));
  return missing.length ? `${caption.trimEnd()}\n\n${missing.join(' ')}` : caption;
}

async function buildPayload(cardPath, { dry }) {
  const dir = path.dirname(path.resolve(cardPath));
  const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
  const at = (f) => (path.isAbsolute(f) || /^[0-9a-f-]{36}$/i.test(f) ? f : path.join(dir, f));
  const accounts = await api('accounts');
  const refs = card.accounts || card.targets || [];
  if (!refs.length) die('The card needs "accounts".');
  if (!card.media?.length) die('The card needs "media".');
  const chosen = refs.map((r) => resolveRef(typeof r === 'string' ? r : r.account, accounts));

  const media = [];
  for (const f of card.media) media.push(dry && !/^[0-9a-f-]{36}$/i.test(f) ? null : await uploadOne(at(f)));
  const cover = async (f) => (f ? (dry ? null : (await uploadOne(at(f))).id) : undefined);
  const igCover = await cover(card.instagram_cover);
  const ytThumb = await cover(card.youtube_thumbnail);

  const targets = chosen.map((a) => {
    const base = card.captions?.[a.username] ?? card.captions?.[`${a.platform}:${a.username}`] ?? card.captions?.[a.platform] ?? card.caption ?? '';
    const caption = card.hashtags === 'none' ? base : withBrandTags(base, a);
    const opts = { ...(card.options?.[a.platform] || {}) };
    if (a.platform === 'youtube') {
      if (opts.made_for_kids === undefined) opts.made_for_kids = false;
      if (!opts.privacy) opts.privacy = 'public';
      if (!opts.category_id && a.brand?.defaults?.youtube_category_id) opts.category_id = a.brand.defaults.youtube_category_id;
      // Hidden tags: the brand's standing tags + this video's own ("youtube_tags" in the card), max 500 chars.
      const tags = [...new Set([...(a.brand?.defaults?.youtube_tags || []), ...(card.youtube_tags || []), ...(opts.tags || [])].map((t) => String(t).trim()).filter(Boolean))];
      const kept = [];
      for (const t of tags) if ([...kept, t].join(',').length <= 480) kept.push(t);
      if (kept.length) opts.tags = kept;
    }
    if (a.platform === 'instagram' && a.brand?.defaults?.instagram_ai_label && opts.ai_generated === undefined) opts.ai_generated = true;
    return {
      account_id: a.id,
      kind: card.kind?.[a.platform],
      caption,
      title: a.platform === 'youtube' ? card.titles?.[a.username] ?? card.title : undefined,
      options: opts,
      ...(a.platform === 'instagram' && igCover ? { cover_media_id: igCover } : {}),
      ...(a.platform === 'youtube' && ytThumb ? { cover_media_id: ytThumb } : {}),
    };
  });
  const when = card.when || 'next_slot';
  const mode = when === 'now' ? 'now' : when === 'draft' ? 'draft' : 'schedule';
  return { media_ids: media.map((m) => m?.id).filter(Boolean), targets, scheduled_at: mode === 'draft' ? 'now' : when, mode, chosen, card };
}

const fmt = (d) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(d));

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || cmd === 'help') {
  console.log('Usage: node postroom.mjs post|check <card.json> · drafts · schedule <post-id> [time|next_slot] · upload <files…> · queue · accounts');
  process.exit(0);
}
await login();

if (cmd === 'accounts') {
  for (const a of await api('accounts')) {
    console.log(`${a.platform}:${a.username}  [${a.status}]  slots: ${(a.slots || []).map((s) => `${s.time}${s.days?.length === 7 ? '' : ` d${s.days.join('')}`}`).join(', ') || 'none'}`);
    if (a.brand?.hashtag_sets?.[0]) console.log(`    hashtags: ${a.brand.hashtag_sets[0].tags.join(' ')}`);
  }
} else if (cmd === 'upload') {
  for (const f of args) {
    const m = await uploadOne(f);
    console.log(JSON.stringify({ id: m.id, filename: m.filename, kind: m.kind, width: m.width, height: m.height, duration_s: m.duration_s }));
  }
} else if (cmd === 'queue') {
  const rows = await api('posts?status=scheduled,processing&limit=60');
  for (const p of rows) console.log(`${fmt(p.scheduled_at)}  ${p.platform}:@${p.username}  ${p.kind}  ${(p.title || p.caption || '').split('\n')[0].slice(0, 60)}`);
  if (!rows.length) console.log('Nothing scheduled.');
} else if (cmd === 'schedule') {
  // node postroom.mjs schedule <post-id> [time|next_slot]   — schedule a draft (and its other platforms)
  if (!args[0]) die('Usage: node postroom.mjs schedule <post-id> [2026-11-20T22:00 | next_slot]');
  const r = await api(`posts/${args[0]}/schedule`, { method: 'POST', body: args[1] ? { scheduled_at: args[1] } : {} });
  for (const x of r.scheduled) console.log(`✓ ${x.platform} ${x.kind} → ${fmt(x.scheduled_at)}  [post ${x.id}]`);
} else if (cmd === 'drafts') {
  const rows = await api('posts?status=draft&limit=100');
  for (const p of rows) console.log(`${fmt(p.scheduled_at)}  ${p.platform}:@${p.username}  ${p.kind}  ${(p.title || p.caption || '').split('\n')[0].slice(0, 50)}  [post ${p.id}]`);
  if (!rows.length) console.log('No drafts.');
} else if (cmd === 'post' || cmd === 'check') {
  if (!args[0]) die(`Usage: node postroom.mjs ${cmd} card.json`);
  const dry = cmd === 'check';
  const p = await buildPayload(args[0], { dry });
  if (dry) {
    for (const t of p.targets) {
      const a = p.chosen.find((x) => x.id === t.account_id);
      console.log(`\n— ${a.platform}:@${a.username}${t.title ? `\n  title: ${t.title}` : ''}\n  ${t.caption.replace(/\n/g, '\n  ')}`);
    }
    if (p.media_ids.length) {
      const r = await api('posts/check', { method: 'POST', body: { media_ids: p.media_ids, targets: p.targets, scheduled_at: p.scheduled_at } });
      for (const t of r.targets) console.log(`${t.errors.length ? '✗' : '✓'} ${t.platform} ${t.account} ${t.kind}${[...t.errors, ...t.warnings].map((x) => `\n    - ${x}`).join('')}`);
    } else {
      console.log('\n(Files are only checked against platform rules after upload — run "post" to upload and schedule.)');
    }
  } else {
    try {
      const r = await api('posts', { method: 'POST', body: { media_ids: p.media_ids, targets: p.targets, scheduled_at: p.scheduled_at, mode: p.mode } });
      for (const x of r.posts) {
        const a = p.chosen.find((c) => c.platform === x.platform);
        console.log(`✓ ${x.platform} ${x.kind} → ${p.mode === 'now' ? 'publishing now' : p.mode === 'draft' ? 'saved as draft' : fmt(x.scheduled_at)}${a ? ` (@${a.username})` : ''}  [post ${x.id}]`);
      }
      if (p.mode === 'now') await api('run', { method: 'POST' }).catch(() => {});
    } catch (e) {
      console.error(`✗ ${e.message}`);
      for (const t of e.data?.targets || []) for (const x of t.errors) console.error(`  ${t.platform} ${t.account}: ${x}`);
      process.exit(1);
    }
  }
} else {
  die(`Unknown command "${cmd}".`);
}
