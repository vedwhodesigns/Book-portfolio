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
  assert.match(ig.validate({ kind: 'carousel', caption: '', media: [img()] }).errors[0], /2–20/);
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

test('Video Lab: link types, captions to text, frame times, measuring a real file', async () => {
  const { classify, vttToText, frameTimes, measure } = await import('../cli/grab.mjs');
  assert.deepEqual(classify('https://www.youtube.com/shorts/abc'), { kind: 'video', platform: 'youtube' });
  assert.deepEqual(classify('https://youtu.be/x'), { kind: 'video', platform: 'youtube' });
  assert.deepEqual(classify('https://www.youtube.com/@xqcow/shorts'), { kind: 'channel', platform: 'youtube', handle: '@xqcow' });
  assert.deepEqual(classify('https://www.instagram.com/reel/Cabc/'), { kind: 'video', platform: 'instagram' });
  assert.deepEqual(classify('https://www.instagram.com/watchthewhyside/'), { kind: 'channel', platform: 'instagram', handle: 'watchthewhyside' });
  assert.equal(classify('not a link').kind, 'bad');
  assert.equal(vttToText('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello <c>world</c>\n\n00:00:01.500 --> 00:00:03.000\nHello world\nnext\n\n00:01:05.000 --> 00:01:06.000\nlater'), '[00:00] Hello world\n[00:01] next\n[01:05] later');
  const t = frameTimes({ duration_seconds: 9, cuts: [2, 3.5, 6.5] });
  assert.equal(t.hook.length, 12);
  assert.deepEqual(t.shots, [1, 2.8, 5, 7.8]);
  assert.equal(t.overview.length, 16);
  // a real 9 s file: cuts at 2, 3.5, 6.5 s and silence for the first second
  const { spawnSync } = await import('node:child_process');
  if (spawnSync('ffmpeg', ['-version']).status !== 0) return;
  const f = '/tmp/postroom-lab-test.mp4';
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=red:s=360x640:d=2', '-f', 'lavfi', '-i', 'color=blue:s=360x640:d=1.5', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:d=3', '-f', 'lavfi', '-i', 'color=green:s=360x640:d=2.5', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=1', '-f', 'lavfi', '-i', 'sine=f=440:d=8:r=44100',
    '-filter_complex', '[0][1][2][3]concat=n=4:v=1:a=0[v];[4][5]concat=n=2:v=0:a=1[a]', '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f]);
  const m = measure(f);
  assert.deepEqual(m.cuts, [2, 3.5, 6.5]);
  assert.equal(m.shot_count, 4);
  assert.equal(m.first_sound_seconds, 1);
  assert.equal(m.vertical, true);
  // every second as a 4×3 sheet of 12 frames, and motion per second
  const { secondSheets, motionCurve } = await import('../cli/grab.mjs');
  const fs = await import('node:fs');
  const dir = fs.mkdtempSync('/tmp/postroom-lab-');
  const sheets = secondSheets(f, dir, m);
  assert.equal(sheets.length, Math.ceil(m.duration_seconds - 0.04));
  assert.deepEqual([sheets[0].start, sheets[0].end, sheets[0].fps], [0, 1, 12]);
  assert.ok(sheets.every((x) => fs.existsSync(x.file)));
  const mo = motionCurve(f);
  assert.ok(mo.length >= 8);
  assert.ok(mo[2] > mo[0], 'the cut at 2 s shows up as motion');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Video Lab: 12 fps sheet plan, motion parsing, channel names', async () => {
  const { sheetPlan, parseMotion, matchBrand } = await import('../cli/grab.mjs');
  assert.equal(sheetPlan(45.5).length, 46);
  assert.ok(sheetPlan(180).every((x) => x.fps === 12));
  const long = sheetPlan(200);
  assert.equal(long.filter((x) => x.fps === 12).length, 60, 'past 3 minutes: first minute at 12 fps');
  assert.deepEqual(long.filter((x) => x.fps === 1)[0], { start: 60, end: 72, fps: 1 });
  assert.deepEqual(parseMotion('pts_time:0\nlavfi.scene_score=0.2\npts_time:0.5\nlavfi.scene_score=0.4\npts_time:1.2\nlavfi.scene_score=0.1'), [0.3, 0.1]);
  const names = ['BONBEC', 'Curious in 8bit', 'How It Clicks', 'The Crime Archives'];
  assert.equal(matchBrand('curious in 8bit', names), 'Curious in 8bit');
  assert.equal(matchBrand('C8', names), 'Curious in 8bit');
  assert.equal(matchBrand('tca', names), 'The Crime Archives');
  assert.equal(matchBrand('bonbec', names), 'BONBEC');
  assert.equal(matchBrand('', names), null);
  assert.equal(matchBrand('nope', names), null);
});
