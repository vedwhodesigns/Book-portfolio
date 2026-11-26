// Video Lab, local half: download a YouTube / Instagram / TikTok video (or a channel's top videos) with yt-dlp,
// measure it with ffmpeg (cuts, pacing, first sound, loudness), make frame sheets, and send it all to Postroom,
// where Claude breaks it down for one of our channels. Runs on your computer because YouTube and Instagram block
// downloads from cloud servers.
//   · frames: every second of the video as a sheet of 12 frames (12 fps; videos over 3 min: the first minute at 12 fps,
//     then one frame per second), plus motion energy per second
//   · sound: earshot (if installed) listens to the soundtrack: tags, instruments, tempo/key, sections, sync with cuts
//   · words: the captions, or Whisper on this computer when there are none (if installed)
//
//   node postroom.mjs grab <link or video file> --brand "Curious in 8bit" [--top 3] [--cookies-from firefox] [--cookies cookies.txt]
//                                 [--only-download] [--no-analyze] [--no-earshot]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Where videos go: Desktop\Video Lab\<channel>\<video> (OneDrive Desktop on Windows if that's the real one); POSTROOM_LAB overrides. */
export function labRoot(home = os.homedir(), exists = fs.existsSync) {
  if (process.env.POSTROOM_LAB) return process.env.POSTROOM_LAB;
  const desk = [path.join(home, 'OneDrive', 'Desktop'), path.join(home, 'Desktop')].find((d) => exists(d));
  return desk ? path.join(desk, 'Video Lab') : path.join(home, 'postroom', 'lab');
}
const LAB = labRoot();
const safe = (x) => String(x || '').replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Unsorted';
const run = (bin, args, opts = {}) => spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true, ...opts });
const has = (bin, args = ['--version']) => { try { const r = run(bin, args, { timeout: 60000 }); return !r.error && r.status === 0; } catch { return false; } };
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

/** Our channel names, matched like the server does ("c8", "curious in 8bit", "@curiousin8bit" → "Curious in 8bit"). */
const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = { c8: 'curiousin8bit', curious: 'curiousin8bit', '8bit': 'curiousin8bit', hic: 'howitclicks', clicks: 'howitclicks', tca: 'thecrimearchives', crime: 'thecrimearchives', crimearchives: 'thecrimearchives' };
export function matchBrand(input, names) {
  const want = ALIASES[norm(input)] || norm(input);
  if (!want) return null;
  return names.find((n) => norm(n) === want) || names.find((n) => norm(n).startsWith(want) || want.startsWith(norm(n))) || null;
}

/** When each 12 fps sheet starts and ends: 12 frames per sheet = 1 second; past 3 minutes, 1 frame/s = 12 s per sheet. */
export function sheetPlan(duration) {
  const d = Math.max(0, Number(duration) || 0);
  const full = d <= 180 ? d : 60;
  const out = [];
  for (let s = 0; s < full - 0.04; s += 1) out.push({ start: s, end: r1(Math.min(s + 1, full)), fps: 12 });
  if (d > full) for (let s = full; s < d - 0.5; s += 12) out.push({ start: s, end: r1(Math.min(s + 12, d)), fps: 1 });
  return out;
}

/** Every second as a 4×3 sheet of 12 frames (12 fps). Returns [{file, start, end, fps}]. */
export function secondSheets(file, dir, m) {
  const plan = sheetPlan(m.duration_seconds);
  if (!plan.length) return [];
  const w = m.vertical ? 168 : 256;
  const sdir = path.join(dir, 'sheets-12fps');
  fs.rmSync(sdir, { recursive: true, force: true });
  fs.mkdirSync(sdir, { recursive: true });
  const fast = plan.filter((x) => x.fps === 12), slow = plan.filter((x) => x.fps === 1);
  const tile = `scale=${w}:-2,tile=4x3:padding=4:color=white`;
  if (fast.length) run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-t', String(fast[fast.length - 1].end), '-vf', `fps=12,${tile}`, '-q:v', '4', '-an', path.join(sdir, 'a_%04d.jpg')]);
  if (slow.length) run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(slow[0].start), '-i', file, '-vf', `fps=1,${tile}`, '-q:v', '4', '-an', path.join(sdir, 'b_%04d.jpg')]);
  const files = (pre) => fs.readdirSync(sdir).filter((f) => f.startsWith(pre)).sort().map((f) => path.join(sdir, f));
  const a = files('a_'), b = files('b_');
  return [...fast.map((x, i) => a[i] && { ...x, file: a[i] }), ...slow.map((x, i) => b[i] && { ...x, file: b[i] })].filter(Boolean);
}

/** Average frame-to-frame change per second at 12 fps (0 = still picture, 1 = a full change every frame). */
export function motionCurve(file) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', "fps=12,scale=160:-2,select='gte(scene,0)',metadata=print:key=lavfi.scene_score", '-an', '-f', 'null', '-']);
  return parseMotion(String(r.stderr));
}
export function parseMotion(text) {
  const sums = [], counts = [];
  let t = null;
  for (const line of text.split('\n')) {
    const pt = /pts_time:([\d.]+)/.exec(line);
    if (pt) { t = Number(pt[1]); continue; }
    const sc = /lavfi\.scene_score=([\d.]+)/.exec(line);
    if (sc && t != null) { const s = Math.floor(t); sums[s] = (sums[s] || 0) + Number(sc[1]); counts[s] = (counts[s] || 0) + 1; t = null; }
  }
  return Array.from({ length: sums.length }, (_, i) => (counts[i] ? Math.round((sums[i] / counts[i]) * 1000) / 1000 : 0));
}

/** earshot listens to the soundtrack (https://github.com/Leonxlnx/earshot, the listen extra). Returns what it said. */
function earshot(file, dir, log) {
  if (!has('earshot', ['--help'])) return { note: 'earshot is not installed on this computer' };
  const wav = path.join(dir, 'audio.wav');
  if (!fs.existsSync(wav)) run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '2', '-ar', '48000', wav]);
  if (!fs.existsSync(wav)) return { note: 'no soundtrack' };
  const out = { tool: 'earshot' };
  const call = (key, args) => {
    log(`… earshot ${args[0]} (it loads its listening models; up to a minute)`);
    const r = run('earshot', args, { timeout: 15 * 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    if (r.status === 0) out[key] = String(r.stdout).trim().slice(0, 20000);
    else out[`${key}_error`] = (String(r.stderr).trim().split('\n').pop() || `exit ${r.status}`).slice(0, 300);
  };
  call('describe', ['describe', wav, '--out', path.join(dir, 'earshot-describe.json')]);
  call('timeline', ['timeline', wav, '--video', file, '--out', path.join(dir, 'earshot-timeline.json')]);
  call('measure', ['measure', wav, '--out', path.join(dir, 'earshot-measure.json')]);
  return out;
}

/** Whisper on this computer, for videos without captions (most reels). Returns "[mm:ss] text" lines or null. */
function whisper(file, dir, log) {
  if (!has('whisper', ['--help'])) return null;
  const wav = path.join(dir, 'audio.wav');
  if (!fs.existsSync(wav)) run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', wav]);
  log('… Whisper is writing down the words');
  run('whisper', [wav, '--model', 'small', '--output_format', 'vtt', '--output_dir', dir, '--fp16', 'False', '--verbose', 'False'], { timeout: 20 * 60000 });
  const vtt = path.join(dir, 'audio.vtt');
  return fs.existsSync(vtt) ? vttToText(fs.readFileSync(vtt, 'utf8')) : null;
}

async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
  return out;
}

function download(url, { cookiesFrom, cookies, brand }) {
  const root = path.join(LAB, safe(brand || 'Downloads'));
  fs.mkdirSync(root, { recursive: true });
  const args = [
    '--no-playlist', '--no-progress', '--js-runtimes', 'node',
    '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b',
    '--merge-output-format', 'mp4', '--write-info-json', '--write-subs', '--write-auto-subs', '--sub-langs', 'en.*,en,-live_chat', '--sub-format', 'vtt',
    '-o', path.join(root, '%(upload_date>%Y-%m-%d|unknown date)s %(uploader_id|uploader|channel|NA).30B %(id)s', 'video.%(ext)s'), '--print', 'after_move:filepath',
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
  let file, dir, info;
  if (fs.existsSync(url) && fs.statSync(url).isFile()) {
    // a video file on this computer (e.g. our own draft): nothing to download
    file = path.resolve(url);
    const st = fs.statSync(file);
    const id = `file-${path.basename(file).replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40)}-${st.size.toString(36)}`;
    dir = path.join(LAB, safe(ctx.opts.brand || 'Downloads'), `${new Date().toISOString().slice(0, 10)} ${path.basename(file).replace(/\.[^.]+$/, '').slice(0, 40)}`);
    fs.mkdirSync(dir, { recursive: true });
    info = { id, title: path.basename(file), extractor_key: 'Local', uploader_id: 'our file' };
    log(`✓ Using the file ${file}`);
  } else {
    log(`↓ Downloading ${url}`);
    file = download(url, ctx.opts);
    dir = path.dirname(file);
    info = JSON.parse(fs.readFileSync(path.join(dir, 'video.info.json'), 'utf8'));
    log(`✓ Saved ${file}`);
  }
  if (onlyDownload) return null;
  log('… measuring cuts, pacing and sound');
  const m = measure(file);
  const t = frameTimes(m);
  const sheets = {};
  for (const k of ['hook', 'shots', 'overview']) {
    const p = sheet(file, dir, k, t[k], m);
    if (p) sheets[k] = await uploadImage(p, `lab-${info.id}-${k}.jpg`);
  }
  log('… cutting every second into 12 frames (12 fps) and measuring motion');
  const secs = secondSheets(file, dir, m);
  const stamp = Date.now().toString(36);
  const seconds = await mapLimit(secs, 6, async (x, i) => ({ url: await uploadImage(x.file, `lab-${info.id}-${stamp}-s${String(i).padStart(4, '0')}.jpg`), start: x.start, end: x.end, fps: x.fps }));
  const motion = motionCurve(file);
  log(`✓ ${seconds.length} frame sheets (${seconds.filter((x) => x.fps === 12).length} s at 12 fps${seconds.some((x) => x.fps === 1) ? ', the rest at 1 fps' : ''})`);
  const sound = m.has_audio && !ctx.opts.noEarshot ? earshot(file, dir, log) : { note: m.has_audio ? 'skipped (--no-earshot)' : 'no soundtrack' };
  if (sound.tool) log(`✓ earshot listened${sound.describe ? '' : ` (describe failed: ${sound.describe_error || '?'})`}${sound.timeline ? '' : ` (timeline failed: ${sound.timeline_error || '?'})`}`);
  else log(`  sound: ${sound.note}${sound.note?.includes('not installed') ? ' → pip install "earshot[listen] @ git+https://github.com/Leonxlnx/earshot"' : ''}`);
  const thumbPath = path.join(dir, 'thumb.jpg');
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.min(1, (m.duration_seconds || 2) / 2)), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', thumbPath]);
  const vtt = fs.readdirSync(dir).filter((f) => f.endsWith('.vtt')).sort((a, b) => (a.includes('.en.') ? -1 : 0) - (b.includes('.en.') ? -1 : 0))[0];
  let transcript = vtt && vtt !== 'audio.vtt' ? vttToText(fs.readFileSync(path.join(dir, vtt), 'utf8')) : null;
  let transcriptSource = transcript ? 'captions' : null;
  if (!transcript && m.has_audio) { transcript = whisper(file, dir, log); if (transcript) transcriptSource = 'Whisper on our computer'; }
  const platform = PF[info.extractor_key] || (String(info.extractor_key || '').toLowerCase().includes('youtube') ? 'youtube' : 'instagram');
  const type = platform === 'youtube' ? ((info.duration || 0) <= 180 && (m.vertical || /\/shorts\//.test(url)) ? 'short' : 'video') : platform === 'instagram' ? 'reel' : 'video';
  const date = info.timestamp ? new Date(info.timestamp * 1000) : /^\d{8}$/.test(info.upload_date || '') ? new Date(`${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6)}T12:00:00Z`) : null;
  const caption = platform === 'instagram' ? info.description || info.title : [info.title, info.description].filter(Boolean).join('\n\n');
  const measureOut = { ...m, frames: { ...sheets, hook_times: t.hook, shot_times: t.shots, overview_times: t.overview, seconds }, motion, sound, transcript_source: transcriptSource, tags: (info.tags || []).slice(0, 40), grabbed_at: new Date().toISOString() };
  const extId = externalId || info.id;
  const res = await api('research/ingest', {
    method: 'POST',
    body: {
      project,
      posts: [{
        postId: extId, platform, url: info.webpage_url || (/^https?:/.test(url) ? url : null), author: String(info.uploader_id || info.channel || info.uploader || '').replace(/^@/, ''),
        type, date, caption, likesNum: info.like_count, commentsNum: info.comment_count, viewsNum: info.view_count ?? info.play_count,
        duration_s: m.duration_seconds, transcript, measure: measureOut, brand,
        thumb_b64: fs.existsSync(thumbPath) ? fs.readFileSync(thumbPath).toString('base64') : undefined,
      }],
    },
  });
  const id = res.ids?.[extId];
  log(`✓ Measured: ${m.shot_count} shots, ${m.cuts_per_10_seconds} cuts/10s, first cut ${m.first_cut_seconds ?? '–'}s, sound from ${m.first_sound_seconds ?? '–'}s${transcript ? ', transcript saved' : ''}`);
  if (analyze && id) {
    try {
      const h = await api(`research/posts/${id}/handoff`);
      const blocks = h.missing_blocks || [];
      if (blocks.length) {
        log(`… Claude is reading the ${h.sheets} frame sheets, ${h.per_call} at a time (${blocks.length} part${blocks.length === 1 ? '' : 's'}, in parallel)`);
        let done = 0;
        await mapLimit(blocks, 4, async (from) => {
          await api(`research/posts/${id}/seconds`, { method: 'POST', body: { from } });
          log(`  ✓ part ${++done}/${blocks.length}`);
        });
      }
      log(`… Claude is writing the learnings for ${brand} (1–2 minutes)`);
      const a = await api(`research/posts/${id}/analyze`, { method: 'POST', body: { brand } });
      const td = a.teardown || {};
      log(`✓ ${td.idea?.topic || ''}${td.idea?.format ? ` · ${td.idea.format}` : ''}`);
      const md = path.join(dir, `for-${String(a.brand || brand).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`);
      fs.writeFileSync(md, a.handoff || '');
      log(`\n${a.handoff}\n`);
      log(`✓ Saved for ${a.brand}: ${md}  (paste it into the ${a.brand} chat, or ask that chat to "pull the latest Video Lab learnings")`);
    } catch (e) { log(`✗ Breakdown failed: ${e.message} (the video and numbers are saved; try again from the Research tab)`); }
  }
  log(`→ ${ctx.base}/#/research?post=${id}`);
  return { id, project_id: res.project_id };
}

export async function grab(args, ctx) {
  const opts = { brand: null, top: 3, cookiesFrom: null, cookies: null, onlyDownload: false, analyze: true, noEarshot: false };
  const links = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--brand') opts.brand = args[++i];
    else if (a === '--top') opts.top = Math.max(0, Math.min(10, Number(args[++i]) || 3));
    else if (a === '--cookies-from') opts.cookiesFrom = args[++i];
    else if (a === '--cookies') opts.cookies = args[++i];
    else if (a === '--only-download') opts.onlyDownload = true;
    else if (a === '--no-analyze') opts.analyze = false;
    else if (a === '--no-earshot') opts.noEarshot = true;
    else links.push(a);
  }
  if (!links.length) ctx.die('Usage: node postroom.mjs grab <youtube/instagram link or channel> … --brand "Curious in 8bit" [--top 3] [--cookies-from firefox] [--only-download] [--no-analyze] [--no-earshot]');
  if (opts.analyze && !opts.onlyDownload) {
    const names = await ctx.api('research/brands');
    const hit = matchBrand(opts.brand, names);
    if (!hit) ctx.die(`${opts.brand ? `"${opts.brand}" isn't one of our channels. ` : ''}Which channel is this analysis for? Add --brand with one of: ${names.map((n) => `"${n}"`).join(', ')}`);
    opts.brand = hit;
  }
  const needDownload = links.some((l) => !fs.existsSync(l));
  for (const bin of [...(needDownload ? ['yt-dlp'] : []), 'ffmpeg', 'ffprobe']) {
    if (!has(bin, bin === 'yt-dlp' ? ['--version'] : ['-version'])) ctx.die(`${bin} isn't installed. Windows: winget install yt-dlp.yt-dlp Gyan.FFmpeg  ·  Mac: brew install yt-dlp ffmpeg  — then open a new terminal.`);
  }
  ctx.opts = opts;
  const lab = { name: 'Video Lab', source: 'video-lab', niche: 'Videos sent for analysis' };
  for (const link of links) {
    const c = fs.existsSync(link) ? { kind: 'video', platform: null } : classify(link);
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
