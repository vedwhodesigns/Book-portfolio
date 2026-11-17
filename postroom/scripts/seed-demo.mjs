// Fills a local database with demo accounts, media, posts and stats for trying the UI.
// Usage: DATABASE_URL=postgres://... APP_URL=http://localhost:3000 ENCRYPTION_KEY=dev STORAGE=local node scripts/seed-demo.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import postgres from 'postgres';
import { encrypt } from '../api/_lib/core.js';
import { LOCAL_DIR } from '../api/_lib/storage.js';

const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {}, transform: { undefined: null } });
const APP = process.env.APP_URL || 'http://localhost:3000';
const dir = LOCAL_DIR();
fs.mkdirSync(dir, { recursive: true });

const palettes = [['#1d2b53', '#7e2553'], ['#0f3b2e', '#1baf7a'], ['#3b1d0f', '#eb6834'], ['#1a1a2e', '#6250d6'], ['#2b0f0f', '#e34948'], ['#102a43', '#2a78d6'], ['#2e2a0f', '#eda100'], ['#222', '#888']];
async function poster(name, [a, b], w = 720, h = 1280) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.3}" r="${w * 0.22}" fill="#fff" opacity=".12"/><rect x="${w * 0.12}" y="${h * 0.62}" width="${w * 0.5}" height="${h * 0.035}" rx="8" fill="#fff" opacity=".5"/><rect x="${w * 0.12}" y="${h * 0.68}" width="${w * 0.32}" height="${h * 0.03}" rx="8" fill="#fff" opacity=".3"/></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toFile(path.join(dir, name));
  return `${APP}/dev-media/${name}`;
}

await sql`truncate postroom.events, postroom.post_metrics, postroom.account_metrics, postroom.posts, postroom.batches, postroom.media, postroom.accounts restart identity cascade`;

const acc = [
  { platform: 'instagram', external_id: 'ig1', username: 'demo.studio', name: 'Demo Studio', followers_count: 48200 },
  { platform: 'instagram', external_id: 'ig2', username: 'demo.clips', name: 'Demo Clips', followers_count: 9100 },
  { platform: 'youtube', external_id: 'UCdemo', username: 'DemoChannel', name: 'Demo Channel', followers_count: 21800 },
  { platform: 'tiktok', external_id: 'ttdemo', username: 'demo.tt', name: 'Demo TT', followers_count: 133000 },
];
const accounts = [];
for (const [i, a] of acc.entries()) {
  const avatar = await poster(`avatar-${i}.jpg`, palettes[i + 2], 200, 200);
  const [row] = await sql`insert into postroom.accounts ${sql({
    ...a, ig_user_id: a.platform === 'instagram' ? a.external_id : null, profile_picture_url: avatar,
    profile_url: a.platform === 'youtube' ? 'https://www.youtube.com/' : a.platform === 'tiktok' ? `https://www.tiktok.com/@${a.username}` : `https://www.instagram.com/${a.username}/`,
    access_token_enc: encrypt('demo'), refresh_token_enc: encrypt('demo'), token_expires_at: new Date(Date.now() + 40 * 864e5),
    status: i === 1 ? 'needs_reconnect' : 'active', status_detail: i === 1 ? 'Instagram asked you to log in again.' : null,
  })} returning *`;
  accounts.push(row);
  for (let d = 30; d >= 0; d--) {
    const day = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    const n = Math.round(a.followers_count * (1 - d * 0.004 + Math.sin(d) * 0.002));
    await sql`insert into postroom.account_metrics (account_id, day, followers) values (${row.id}, ${day}, ${n})`;
  }
}
const [ig, ig2, yt, tt] = accounts;

const titles = [
  'The 3 a.m. phone call that cracked the case',
  'Why this camera trick fooled everyone',
  'A 40-year-old mystery, solved in 60 seconds',
  'Behind the scenes: building the set',
  'The detail everyone missed in episode 4',
  'How it clicks: the lens that changed film',
  'We tested the viral editing hack',
  'Three clues hidden in plain sight',
];
const media = [];
for (let i = 0; i < 8; i++) {
  const url = await poster(`poster-${i}.jpg`, palettes[i]);
  const [m] = await sql`insert into postroom.media ${sql({ url, pathname: `poster-${i}.jpg`, poster_url: url, kind: 'video', content_type: 'video/mp4', size_bytes: 40e6 + i * 7e6, width: 1080, height: 1920, duration_s: 28 + i * 9, filename: `episode-${i + 1}.mp4` })} returning *`;
  media.push(m);
}

const day = (offset, h, m = 0) => {
  const d = new Date();
  d.setUTCHours(h - 5, m - 30, 0, 0); // ~h:m IST
  return new Date(d.getTime() + offset * 864e5);
};
async function post({ a, kind, mi, when, status, caption, title = null, options = {}, group = null, metrics = null, error = null, created_by = 'app', batch = null }) {
  const [p] = await sql`insert into postroom.posts ${sql({
    account_id: a.id, platform: a.platform, kind, media_ids: [media[mi].id], caption, title, options: sql.json(options), scheduled_at: when,
    status, group_id: group, batch_id: batch, created_by, error,
    published_at: status === 'published' ? when : null, external_id: status === 'published' ? `x${Math.random()}` : null,
    permalink: status === 'published' ? a.profile_url : null, metrics: sql.json(metrics || {}), metrics_at: metrics ? new Date() : null,
    upload: sql.json(status === 'processing' ? { progress: 0.62 } : {}),
  })} returning *`;
  await sql`insert into postroom.events (post_id, account_id, message) values (${p.id}, ${a.id}, ${`Scheduled ${kind}`})`;
  if (status === 'published') {
    await sql`insert into postroom.events (post_id, account_id, message) values (${p.id}, ${a.id}, ${`Published: ${a.profile_url}`})`;
    if (metrics) await sql`insert into postroom.post_metrics ${sql({ post_id: p.id, ...metrics })}`;
  }
  if (error) await sql`insert into postroom.events (post_id, account_id, level, message) values (${p.id}, ${a.id}, 'error', ${error})`;
  return p;
}
const cross = async (mi, when, status, metricsFn, extra = {}) => {
  const g = crypto.randomUUID();
  const cap = `${titles[mi]}\n\nFull story on the channel. #truecrime #mystery #film`;
  await post({ a: ig, kind: 'reel', mi, when, status, caption: cap, group: g, metrics: metricsFn?.(1), ...extra });
  await post({ a: yt, kind: 'short', mi, when, status, caption: cap, title: titles[mi], options: { privacy: 'public', made_for_kids: false }, group: g, metrics: metricsFn?.(0.6), ...extra });
  await post({ a: tt, kind: 'video', mi, when, status, caption: cap, options: { mode: 'direct', privacy_level: 'PUBLIC_TO_EVERYONE' }, group: g, metrics: metricsFn?.(2.4), ...extra });
};
const mk = (base) => (f) => ({ views: Math.round(base * f), likes: Math.round(base * f * 0.07), comments: Math.round(base * f * 0.006), shares: Math.round(base * f * 0.01) });

// past, published
for (let d = 20; d >= 1; d -= 2) await cross(d % 8, day(-d, d % 2 ? 19 : 13), 'published', mk(4000 + ((d * 7919) % 9000)));
// this week
await cross(1, day(0, 9), 'published', mk(2100));
await post({ a: ig, kind: 'reel', mi: 2, when: day(0, 13), status: 'processing', caption: titles[2] });
await post({ a: yt, kind: 'video', mi: 3, when: day(0, 11), status: 'failed', caption: titles[3], title: titles[3], options: { privacy: 'public', made_for_kids: false }, error: 'YouTube: API quota used up for today — it\'ll retry automatically.' });
await cross(4, day(1, 19), 'scheduled');
await post({ a: ig, kind: 'story', mi: 5, when: day(1, 10), status: 'scheduled', caption: '' });
await cross(5, day(2, 18, 30), 'scheduled');
await post({ a: tt, kind: 'video', mi: 6, when: day(3, 20), status: 'scheduled', caption: titles[6], options: { mode: 'inbox' } });
await post({ a: ig, kind: 'reel', mi: 7, when: day(4, 12), status: 'draft', caption: titles[7] });
await cross(6, day(5, 19), 'scheduled');
// a plan from Claude
const [b] = await sql`insert into postroom.batches (title, note, created_by) values ('Next week: mystery series', 'Three cross-posts at your best hours (7 pm), each with a hook in the first line.', 'claude') returning id`;
for (const [i, mi] of [0, 2, 7].entries()) {
  for (const a of [ig, tt]) await post({ a, kind: a.platform === 'tiktok' ? 'video' : 'reel', mi, when: day(7 + i * 2, 19), status: 'draft', caption: `${titles[mi]} #truecrime`, options: a.platform === 'tiktok' ? { mode: 'inbox' } : {}, created_by: 'claude', batch: b.id });
}
console.log('demo data ready');
await sql.end();
