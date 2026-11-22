// Video Lab, local half: download a YouTube / Instagram / TikTok video (or a channel's top videos) with yt-dlp,
// measure it with ffmpeg (cuts, pacing, first sound, loudness), make frame sheets, and send it all to Postroom,
// where Claude breaks it down. Runs on your computer because YouTube and Instagram block downloads from cloud servers.
//
//   node postroom.mjs grab <link> [--brand "How It Clicks"] [--top 3] [--cookies-from firefox] [--cookies cookies.txt]
//                                 [--only-download] [--no-analyze]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const LAB = path.join(os.homedir(), 'postroom', 'lab');
const run = (bin, args, opts = {}) => spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true, ...opts });
const has = (bin) => { try { return run(bin, ['--version']).status === 0; } catch { return false; } };
const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

/** What kind of link is this? */
export function classify(url) {
  let u;
  try { u = new URL(url); } catch { return { kind: 'bad' }; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be' || (host.endsWith('youtube.com') && (u.searchParams.get('v') || ['shorts', 'live', 'embed'].includes(parts[0])))) return { kind: 'video', platform: 'youtube' };
  if (host.endsWith('youtube.com') && parts[0] && (parts[0].startsWith('@') || ['channel', 'c', 'user'].includes(parts[0]))) {
    return { kind: 'channel', platform: 'youtube', handle: parts[0].startsWith('@') ? parts[0] : `${u.origin}/${parts[0]}/${parts[1]}` };
  }
  if (host.endsWith('instagram.com') && ['reel', 'reels', 'p', 'tv'].includes(parts[0])) return { kind: 'video', platform: 'instagram' };
  if (host.endsWith('instagram.com') && parts.length >= 1 && /^[\w.]{1,30}$/.test(parts[0]) && !['explore', 'stories', 'accounts'].includes(parts[0])) return { kind: 'channel', platform: 'instagram', handle: parts[0] };
  if (host.endsWith('tiktok.com')) return { kind: 'video', platform: 'tiktok' };
  return { kind: 'video', platform: null };
}

/** WebVTT captions → "[mm:ss] text" lines, with YouTube's rolling duplicates removed. */
export function vttToText(vtt) {
  const out = [];
  let last = '';
  const blocks = String(vtt).replace(/\r/g, '').split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const m = /(\d+):(\d+):(\d+)[.,]\d+|(\d+):(\d+)[.,]\d+/.exec(lines[i]);
    const secs = m ? (m[1] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[4] * 60 + +m[5]) : 0;
    const text = lines.slice(i + 1).map((l) => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    for (const t of text) {
      if (t === last || (last && last.endsWith(t))) continue;
      last = t;
      out.push(`[${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.floor(secs % 60)).padStart(2, '0')}] ${t}`);
    }
  }
  return out.join('\n');
}

/** Measure a video file: size, fps, shot cuts, pacing, first sound, loudness. */
export function measure(file) {
  const pr = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration', '-of', 'json', file]).stdout || '{}');
  const v = (pr.streams || []).find((s) => s.codec_type === 'video') || {};
  const hasAudio = (pr.streams || []).some((s) => s.codec_type === 'audio');
  const duration = Number(pr.format?.duration) || 0;
  const [fn, fd] = String(v.r_frame_rate || '0/1').split('/').map(Number);
  const sc = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', "scale=320:-2,select='gt(scene,0.32)',showinfo", '-an', '-f', 'null', '-']);
  const cuts = [...String(sc.stderr).matchAll(/pts_time:([\d.]+)/g)].map((x) => Number(x[1])).filter((t) => t > 0.15 && t < duration - 0.1);
  let first_sound = null, lufs = null;
  if (hasAudio) {
    const au = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'silencedetect=noise=-35dB:d=0.3,ebur128', '-f', 'null', '-']);
    const err = String(au.stderr);
    const s0 = /silence_start: (-?[\d.]+)/.exec(err), e0 = /silence_end: ([\d.]+)/.exec(err);
    first_sound = s0 && Number(s0[1]) <= 0.05 && e0 ? Number(e0[1]) : 0;
    const L = [...err.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
    lufs = L.length ? Number(L[L.length - 1][1]) : null;
  }
  const shots = cuts.length + 1;
  return {
    duration_seconds: r1(duration), width: v.width || null, height: v.height || null, fps: fd ? r1(fn / fd) : null,
    vertical: v.height > v.width, cuts: cuts.map(r1), shot_count: shots,
    cuts_per_10_seconds: duration ? r1((cuts.length / duration) * 10) : null,
    avg_shot_seconds: shots ? r1(duration / shots) : null,
    first_cut_seconds: cuts.length ? r1(cuts[0]) : null,
    cuts_in_first_3_seconds: cuts.filter((t) => t < 3).length,
    first_sound_seconds: r1(first_sound), integrated_lufs: r1(lufs), has_audio: hasAudio,
  };
}

/** Grab frames at the given times and tile them into one sheet. Returns the sheet path. */
export function sheet(file, dir, name, times, { vertical }) {
  if (!times.length) return null;
  const w = vertical ? 260 : 390;
  const cols = Math.min(times.length, vertical ? 6 : 4);
  const fdir = path.join(dir, `${name}-frames`);
  fs.mkdirSync(fdir, { recursive: true });
  times.forEach((t, i) => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, t)), '-i', file, '-frames:v', '1', '-vf', `scale=${w}:-2`, '-q:v', '4', path.join(fdir, `f${String(i + 1).padStart(2, '0')}.jpg`)]));
  const n = fs.readdirSync(fdir).filter((f) => f.endsWith('.jpg')).length;
  if (!n) return null;
  const rows = Math.ceil(n / cols);
  const out = path.join(dir, `${name}.jpg`);
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(fdir, 'f%02d.jpg'), '-vf', `tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', '-q:v', '3', out]);
  return fs.existsSync(out) ? out : null;
}

export function frameTimes(m) {
  const d = m.duration_seconds || 0;
  const hook = Array.from({ length: 12 }, (_, i) => i * 0.25).filter((t) => t < d - 0.05);
  const starts = [0, ...(m.cuts || [])];
  let mids = starts.map((s, i) => r1((s + (starts[i + 1] ?? d)) / 2));
  if (mids.length > 24) mids = Array.from({ length: 24 }, (_, i) => mids[Math.floor((i * mids.length) / 24)]);
  const overview = Array.from({ length: 16 }, (_, i) => r1((d * (i + 0.5)) / 16));
  return { hook, shots: mids, overview };
}

function download(url, { cookiesFrom, cookies }) {
  fs.mkdirSync(LAB, { recursive: true });
  const args = [
    '--no-playlist', '--no-progress', '--js-runtimes', 'node',
    '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b',
    '--merge-output-format', 'mp4', '--write-info-json', '--write-subs', '--write-auto-subs', '--sub-langs', 'en.*,en,-live_chat', '--sub-format', 'vtt',
    '-o', path.join(LAB, '%(extractor_key)s-%(id)s', 'video.%(ext)s'), '--print', 'after_move:filepath',
    ...(cookiesFrom ? ['--cookies-from-browser', cookiesFrom] : []), ...(cookies ? ['--cookies', cookies] : []),
    url,
  ];
  let r = run('yt-dlp', args);
  if (r.status !== 0 && /js-runtimes|no such option/i.test(r.stderr)) r = run('yt-dlp', args.filter((a, i) => a !== '--js-runtimes' && args[i - 1] !== '--js-runtimes'));
  const file = String(r.stdout).trim().split('\n').filter(Boolean).pop();
  if (r.status !== 0 || !file || !fs.existsSync(file)) {
    const err = String(r.stderr).split('\n').filter((l) => /ERROR/.test(l)).join('\n') || String(r.stderr).slice(-600);
    const needsLogin = /sign in|log ?in|cookies|empty media|private|rate-limit|not a bot/i.test(err);
    throw new Error(`${err.trim()}${needsLogin && !cookiesFrom && !cookies ? '\n  → This needs a logged-in browser. Log in to the site in Firefox, then add:  --cookies-from firefox\n    (Chrome and Edge lock their cookies on Windows; Firefox works.)' : ''}`);
  }
  return file;
}

const PF = { Youtube: 'youtube', Instagram: 'instagram', TikTok: 'tiktok' };

/** Download + measure + frame sheets + upload one video. Returns the research post id. */
async function grabVideo(url, ctx, { project, externalId = null, onlyDownload = false, analyze = true, brand = null }) {
  const { api, uploadImage, log } = ctx;
  log(`↓ Downloading ${url}`);
  const file = download(url, ctx.opts);
  const dir = path.dirname(file);
  const info = JSON.parse(fs.readFileSync(path.join(dir, 'video.info.json'), 'utf8'));
  log(`✓ Saved ${file}`);
  if (onlyDownload) return null;
  log('… measuring cuts, pacing and sound');
  const m = measure(file);
  const t = frameTimes(m);
  const sheets = {};
  for (const k of ['hook', 'shots', 'overview']) {
    const p = sheet(file, dir, k, t[k], m);
    if (p) sheets[k] = await uploadImage(p, `lab-${info.id}-${k}.jpg`);
  }
  const thumbPath = path.join(dir, 'thumb.jpg');
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.min(1, (m.duration_seconds || 2) / 2)), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', thumbPath]);
  const vtt = fs.readdirSync(dir).filter((f) => f.endsWith('.vtt')).sort((a, b) => (a.includes('.en.') ? -1 : 0) - (b.includes('.en.') ? -1 : 0))[0];
  const transcript = vtt ? vttToText(fs.readFileSync(path.join(dir, vtt), 'utf8')) : null;
  const platform = PF[info.extractor_key] || (String(info.extractor_key || '').toLowerCase().includes('youtube') ? 'youtube' : 'instagram');
  const type = platform === 'youtube' ? ((info.duration || 0) <= 180 && (m.vertical || /\/shorts\//.test(url)) ? 'short' : 'video') : platform === 'instagram' ? 'reel' : 'video';
  const date = info.timestamp ? new Date(info.timestamp * 1000) : /^\d{8}$/.test(info.upload_date || '') ? new Date(`${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6)}T12:00:00Z`) : null;
  const caption = platform === 'instagram' ? info.description || info.title : [info.title, info.description].filter(Boolean).join('\n\n');
  const measureOut = { ...m, frames: { ...sheets, hook_times: t.hook, shot_times: t.shots, overview_times: t.overview }, tags: (info.tags || []).slice(0, 40), grabbed_at: new Date().toISOString() };
  const extId = externalId || info.id;
  const res = await api('research/ingest', {
    method: 'POST',
    body: {
      project,
      posts: [{
        postId: extId, platform, url: info.webpage_url || url, author: String(info.uploader_id || info.channel || info.uploader || '').replace(/^@/, ''),
        type, date, caption, likesNum: info.like_count, commentsNum: info.comment_count, viewsNum: info.view_count ?? info.play_count,
        duration_s: m.duration_seconds, transcript, measure: measureOut,
        thumb_b64: fs.existsSync(thumbPath) ? fs.readFileSync(thumbPath).toString('base64') : undefined,
      }],
    },
  });
  const id = res.ids?.[extId];
  log(`✓ Measured: ${m.shot_count} shots, ${m.cuts_per_10_seconds} cuts/10s, first cut ${m.first_cut_seconds ?? '–'}s, sound from ${m.first_sound_seconds ?? '–'}s${transcript ? ', transcript saved' : ''}`);
  if (analyze && id) {
    log('… Claude is breaking it down (about a minute)');
    try {
      const a = await api(`research/posts/${id}/analyze`, { method: 'POST', body: { brand } });
      const td = a.teardown || {};
      log(`✓ ${td.idea?.topic || ''}${td.idea?.format ? ` · ${td.idea.format}` : ''}`);
      if (td.hook) log(`  Hook (${td.hook.hook_type}): ${td.hook.first_3s_spoken || td.hook.first_3s_onscreen_text || td.hook.first_3s_visual}`);
      if (td.idea?.why_it_works) log(`  Why it works: ${td.idea.why_it_works}`);
      if (td.replicate?.how_it_clicks_adaptation) log(`  For us: ${td.replicate.how_it_clicks_adaptation}`);
    } catch (e) { log(`✗ Breakdown failed: ${e.message} (the video and numbers are saved; try again from the Research tab)`); }
  }
  log(`→ ${ctx.base}/#/research?post=${id}`);
  return { id, project_id: res.project_id };
}

export async function grab(args, ctx) {
  const opts = { brand: null, top: 3, cookiesFrom: null, cookies: null, onlyDownload: false, analyze: true };
  const links = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--brand') opts.brand = args[++i];
    else if (a === '--top') opts.top = Math.max(0, Math.min(10, Number(args[++i]) || 3));
    else if (a === '--cookies-from') opts.cookiesFrom = args[++i];
    else if (a === '--cookies') opts.cookies = args[++i];
    else if (a === '--only-download') opts.onlyDownload = true;
    else if (a === '--no-analyze') opts.analyze = false;
    else links.push(a);
  }
  if (!links.length) ctx.die('Usage: node postroom.mjs grab <youtube/instagram link or channel> … [--brand "How It Clicks"] [--top 3] [--cookies-from firefox] [--only-download] [--no-analyze]');
  for (const bin of ['yt-dlp', 'ffmpeg', 'ffprobe']) {
    if (!has(bin)) ctx.die(`${bin} isn't installed. Windows: winget install yt-dlp.yt-dlp Gyan.FFmpeg  ·  Mac: brew install yt-dlp ffmpeg  — then open a new terminal.`);
  }
  ctx.opts = opts;
  const lab = { name: 'Video Lab', source: 'video-lab', niche: 'Videos sent for analysis' };
  for (const link of links) {
    const c = classify(link);
    try {
      if (c.kind === 'bad') { ctx.log(`✗ Not a link: ${link}`); continue; }
      if (c.kind === 'video' || opts.onlyDownload) {
        await grabVideo(link, ctx, { project: lab, onlyDownload: opts.onlyDownload, analyze: opts.analyze, brand: opts.brand });
        continue;
      }
      // a whole channel / account: official API for every post's numbers, then download the top videos
      ctx.log(`… Reading ${c.platform === 'youtube' ? 'the YouTube channel' : 'the Instagram account'} ${c.handle}`);
      const look = c.platform === 'youtube'
        ? await ctx.api('research/youtube', { method: 'POST', body: { channel: c.handle, limit: 50 } })
        : await ctx.api('research/instagram', { method: 'POST', body: { username: c.handle, limit: 50 } });
      const { project } = await ctx.api(`research/projects/${look.project_id}`);
      ctx.log(`✓ ${project.name}: ${look.videos ?? look.posts_read} posts${look.subscribers ? `, ${look.subscribers.toLocaleString('en')} subscribers` : look.followers ? `, ${look.followers.toLocaleString('en')} followers` : ''}`);
      const posts = await ctx.api(`research/posts?project_id=${look.project_id}&sort=views&limit=60`);
      const sortKey = (p) => p.views ?? p.likes ?? 0;
      const videos = posts.filter((p) => ['short', 'video', 'reel', 'clips'].includes(String(p.type || '').toLowerCase()) && p.url).sort((a, b) => sortKey(b) - sortKey(a)).slice(0, opts.top);
      for (const p of videos) {
        try { await grabVideo(p.url, ctx, { project: { name: project.name, source: project.source }, externalId: p.external_id, analyze: opts.analyze, brand: opts.brand }); } catch (e) { ctx.log(`✗ ${p.url}: ${e.message}`); }
      }
      if (opts.analyze) {
        ctx.log('… Claude is analysing the whole channel');
        const a = await ctx.api(`research/projects/${look.project_id}/analyze`, { method: 'POST', body: { brand: opts.brand } });
        ctx.log(`✓ ${a.analysis.summary}`);
        for (const o of a.analysis.opportunities_for_us || []) ctx.log(`  • ${o.idea} (${o.for_brand})`);
      }
      ctx.log(`→ ${ctx.base}/#/research?project=${look.project_id}`);
    } catch (e) {
      ctx.log(`✗ ${link}: ${e.message}`);
    }
  }
}
