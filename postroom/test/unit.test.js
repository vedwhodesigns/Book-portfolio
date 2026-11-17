import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ENCRYPTION_KEY = 'test-key';
process.env.APP_TIMEZONE = 'Asia/Kolkata';
const { zonedToUtc, parseWhen, encrypt, decrypt } = await import('../api/_lib/core.js');
const { chunkPlan } = await import('../api/_lib/platforms/tiktok.js');
const { PLATFORMS } = await import('../api/_lib/platforms/index.js');
const { videoDescription, videoTitle } = await import('../api/_lib/platforms/youtube.js');

const vid = (o = {}) => ({ id: 'v', kind: 'video', content_type: 'video/mp4', width: 1080, height: 1920, duration_s: 30, size_bytes: 20e6, filename: 'a.mp4', ...o });
const img = (o = {}) => ({ id: 'i', kind: 'image', content_type: 'image/jpeg', width: 1080, height: 1350, size_bytes: 1e6, filename: 'a.jpg', ...o });

test('wall-clock times convert using the app timezone', () => {
  assert.equal(zonedToUtc('2026-11-20T18:30', 'Asia/Kolkata').toISOString(), '2026-11-20T13:00:00.000Z');
  assert.equal(zonedToUtc('2026-07-01T09:00', 'America/New_York').toISOString(), '2026-07-01T13:00:00.000Z');
  assert.equal(zonedToUtc('2026-01-01T09:00', 'America/New_York').toISOString(), '2026-01-01T14:00:00.000Z');
  assert.equal(parseWhen('2030-01-01T10:00:00Z').toISOString(), '2030-01-01T10:00:00.000Z');
  assert.throws(() => parseWhen('2020-01-01T10:00'), /past/);
  assert.throws(() => parseWhen('next tuesday'), /Couldn't read/);
});

test('tokens round-trip through encryption and v1 values are rejected', () => {
  const e = encrypt('secret-token');
  assert.notEqual(e, 'secret-token');
  assert.equal(decrypt(e), 'secret-token');
  assert.equal(decrypt('legacy:abc'), null);
  assert.equal(decrypt(`${e.slice(0, -3)}xyz`), null);
});

test('TikTok chunk plans follow the 5–64 MB rules', () => {
  assert.deepEqual(chunkPlan(3e6), { chunk_size: 3e6, total_chunk_count: 1 });
  const mb = 1024 * 1024;
  const p = chunkPlan(250 * mb + 123);
  assert.equal(p.chunk_size, 10 * mb);
  assert.equal(p.total_chunk_count, 25);
  const last = 250 * mb + 123 - 24 * p.chunk_size;
  assert.ok(last <= 128 * mb && last >= 5 * mb);
  const huge = chunkPlan(20000 * mb);
  assert.ok(huge.total_chunk_count <= 1000 && huge.chunk_size <= 64 * mb);
});

test('Instagram validation', () => {
  const ig = PLATFORMS.instagram;
  assert.equal(ig.defaultKind([vid()]), 'reel');
  assert.equal(ig.defaultKind([img(), img()]), 'carousel');
  assert.deepEqual(ig.validate({ kind: 'reel', caption: 'hi #a', media: [vid()] }).errors, []);
  assert.match(ig.validate({ kind: 'reel', caption: '', media: [vid({ duration_s: 2 })] }).errors[0], /3s–15m/);
  assert.match(ig.validate({ kind: 'image', caption: '', media: [img({ width: 1000, height: 2000 })] }).errors[0], /4:5/);
  assert.match(ig.validate({ kind: 'carousel', caption: '', media: [img()] }).errors[0], /2–10/);
  const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ');
  assert.ok(ig.validate({ kind: 'reel', caption: tags, media: [vid()] }).errors.some((e) => /30/.test(e)));
});

test('YouTube validation and metadata', () => {
  const yt = PLATFORMS.youtube;
  assert.equal(yt.defaultKind([vid()]), 'short');
  assert.equal(yt.defaultKind([vid({ width: 1920, height: 1080, duration_s: 600 })]), 'video');
  const ok = yt.validate({ kind: 'short', caption: 'My title\nmore', media: [vid()], options: { privacy: 'public', made_for_kids: false } });
  assert.deepEqual(ok.errors, []);
  assert.ok(ok.warnings.some((w) => /private/.test(w)), 'warns about unaudited private uploads');
  assert.ok(yt.validate({ kind: 'short', caption: 'x', media: [vid({ duration_s: 200 })], options: { made_for_kids: false } }).errors.some((e) => /3 minutes/.test(e)));
  assert.ok(yt.validate({ kind: 'video', caption: 'x', media: [vid()], options: {} }).errors.some((e) => /kids/.test(e)));
  assert.ok(yt.validate({ kind: 'video', caption: 'a <b>', media: [vid()], options: { made_for_kids: false } }).errors.some((e) => /< or >/.test(e)));
  assert.equal(videoTitle({ title: '', caption: '\n  First line here\nsecond' }), 'First line here');
  assert.match(videoDescription({ kind: 'short', caption: 'hello' }), /#Shorts$/);
  assert.equal(videoDescription({ kind: 'short', caption: 'hello #shorts' }), 'hello #shorts');
});

test('TikTok validation', () => {
  const tt = PLATFORMS.tiktok;
  assert.ok(tt.validate({ caption: '', media: [vid()], options: { mode: 'direct' } }).errors.some((e) => /who can see/.test(e)));
  assert.deepEqual(tt.validate({ caption: '', media: [vid()], options: { mode: 'direct', privacy_level: 'SELF_ONLY' } }).errors, []);
  assert.deepEqual(tt.validate({ caption: '', media: [vid()], options: { mode: 'inbox' } }).errors, []);
  assert.ok(tt.validate({ caption: '', media: [img()], options: { mode: 'inbox' } }).errors.length);
  assert.ok(tt.validate({ caption: '', media: [vid()], options: { mode: 'direct', privacy_level: 'SELF_ONLY', brand_content: true } }).errors.some((e) => /Branded/.test(e)));
});
