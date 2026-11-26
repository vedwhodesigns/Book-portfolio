// Video Lab in the cloud: paste a link from anywhere (phone, laptop, a Claude chat through the connector) and Vercel
// downloads the video, measures it, cuts every second into 12 frames, has Claude read them, and writes the learnings
// for the chosen channel. A job moves queued → reading → writing → done; each run advances it as far as time allows,
// so a long video simply continues on the next run (the cron tick keeps kicking open jobs).
//
// Downloads: yt-dlp in a small Python function (api/lab_extract.py) finds the file; Node downloads it and ffmpeg
// (ffmpeg-static) does the rest. Instagram works from Vercel. YouTube blocks cloud servers unless YTDLP_PROXY is set.
// Music: earshot is too big for Vercel, so cloud analyses infer the music from loudness and cut rhythm.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, env, APP_URL, HttpError, fetchT } from './core.js';
import { putFile } from './storage.js';

const OPEN = ['queued', 'reading', 'writing'];
const MAX_ATTEMPTS = 8;

async function grabLib() {
  if (!process.env.FFMPEG_PATH) {
    try { process.env.FFMPEG_PATH = (await import('ffmpeg-static')).default; } catch { /* use ffmpeg on PATH */ }
  }
  return import('../../cli/grab.mjs');
}

/** Turn a pasted text (Instagram's share text, a URL with tracking) into the link. */
export function cleanLink(text) {
  const m = /https:\/\/[^\s"'<>]+/.exec(String(text || ''));
  if (!m) return null;
  try {
    const u = new URL(m[0].replace(/[).,]+$/, ''));
    if (/instagram\.com$/.test(u.hostname.replace(/^www\./, ''))) { u.search = ''; u.hash = ''; }
    for (const k of ['si', 'feature', 'utm_source', 'utm_medium', 'utm_campaign', 'igsh', 'igshid']) u.searchParams.delete(k);
    return u.toString();
  } catch { return null; }
}

/** Start a job for one video link and one of our channels. */
export async function createJob({ url, brand }) {
  const link = cleanLink(url);
  if (!link) throw new HttpError(400, 'Paste a link to a reel, Short or video.');
  const { classify } = await import('../../cli/grab.mjs');
  const c = classify(link);
  if (c.kind === 'channel') throw new HttpError(400, 'That is a whole channel. Paste one reel, Short or video (channels: Research → Analyse a channel).');
  if (c.platform === 'youtube' && !env('YTDLP_PROXY')) {
    throw new HttpError(400, 'YouTube blocks downloads from cloud servers. Add a residential proxy as YTDLP_PROXY in Vercel to analyse YouTube links here, or run "grab" on your PC.');
  }
  const { resolveBrand } = await import('./videolab.js');
  const channel = await resolveBrand(brand);
  const [open] = await db()`select * from postroom.lab_jobs where url = ${link} and brand = ${channel} and status in ${db()(OPEN)} limit 1`;
  if (open) return open;
  const [job] = await db()`insert into postroom.lab_jobs (url, brand, step) values (${link}, ${channel}, 'Waiting to start') returning *`;
  return job;
}

export async function listJobs({ limit = 20 } = {}) {
  return db()`select j.*, r.thumb_url, r.author, r.teardown->'idea'->>'topic' as topic, r.measure->>'video_url' as video_url
    from postroom.lab_jobs j left join postroom.research_posts r on r.id = j.research_post_id
    order by j.created_at desc limit ${Math.min(Math.max(Number(limit) || 20, 1), 100)}`;
}

export async function getJob(id) {
  const [j] = await db()`select j.*, r.thumb_url, r.author, r.teardown->'idea'->>'topic' as topic, r.measure->>'video_url' as video_url
    from postroom.lab_jobs j left join postroom.research_posts r on r.id = j.research_post_id where j.id = ${id}`;
  if (!j) throw new HttpError(404, 'Job not found.');
  if (j.status === 'done' && j.research_post_id) {
    const { handoffMarkdown } = await import('./videolab.js');
    const { getResearchPost } = await import('./research.js');
    j.handoff = handoffMarkdown(await getResearchPost(j.research_post_id));
  }
  return j;
}

export async function retryJob(id) {
  const [j] = await db()`update postroom.lab_jobs set status = case when research_post_id is null then 'queued' else 'reading' end,
    error = null, attempts = 0, locked_until = null, step = 'Trying again', updated_at = now() where id = ${id} and status = 'failed' returning *`;
  if (!j) throw new HttpError(400, 'Only a failed job can be retried.');
  return j;
}

/** Ask this app (another invocation) to run open jobs, without waiting for it. */
export async function kick() {
  if (!env('CRON_SECRET')) return false;
  try {
    await fetch(`${APP_URL()}/api/lab/run`, { method: 'POST', headers: { 'x-cron-secret': env('CRON_SECRET') }, signal: AbortSignal.timeout(2500) });
  } catch { /* the run continues on its own; we only needed to start it */ }
  return true;
}

export async function hasOpenJobs() {
  const [r] = await db()`select count(*)::int as n from postroom.lab_jobs where status in ${db()(OPEN)} and (locked_until is null or locked_until < now())`;
  return r.n > 0;
}

const setStep = (id, step, extra = {}) => db()`update postroom.lab_jobs set ${db()({ step, ...extra, updated_at: new Date() })} where id = ${id}`;

/** The default extractor: the Python yt-dlp function next to this app. */
async function extractRemote(url) {
  const r = await fetchT(`${APP_URL()}/api/lab_extract`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-secret': env('CRON_SECRET') }, body: JSON.stringify({ url }) }, 90000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new HttpError(r.status === 422 ? 422 : 502, j.error ? `Couldn't get the video: ${j.error}` : `Couldn't reach the downloader (HTTP ${r.status}).`);
    e.permanent = r.status === 422 && !/rate|429|temporar|timed out/i.test(j.error || '');
    throw e;
  }
  return j;
}

/** Pick what to download: one file with picture and sound (≤720p) if there is one, else the best video + audio pair. */
export function chooseFormats(formats = []) {
  const hasV = (f) => f.vcodec !== 'none', hasA = (f) => f.acodec !== 'none';
  const h = (f) => f.height || 0;
  const both = formats.filter((f) => hasV(f) && hasA(f) && (f.ext === 'mp4' || !f.ext) && (!f.height || f.height <= 1080));
  if (both.length) {
    const sized = both.filter((f) => f.height);
    const pick = sized.length ? sized.filter((f) => h(f) <= 720).sort((a, b) => h(b) - h(a))[0] || sized.sort((a, b) => h(a) - h(b))[0] : both[both.length - 1];
    return { single: pick };
  }
  const vids = formats.filter((f) => hasV(f) && !hasA(f) && f.height);
  const auds = formats.filter((f) => hasA(f) && !hasV(f));
  if (!vids.length) throw Object.assign(new HttpError(422, 'No downloadable video found at that link.'), { permanent: true });
  const v = vids.filter((f) => h(f) <= 720).sort((a, b) => h(b) - h(a))[0] || vids.sort((a, b) => h(a) - h(b))[0];
  const a = auds.sort((x, y) => (y.tbr || 0) - (x.tbr || 0))[0] || null;
  return { video: v, audio: a };
}

async function downloadTo(f, file) {
  const r = await fetchT(f.url, { headers: { ...(f.http_headers || {}) } }, 120000);
  if (!r.ok) throw new HttpError(502, `Download failed (HTTP ${r.status}).`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 300 * 1024 * 1024) throw Object.assign(new HttpError(413, 'That video is too big for cloud analysis (over 300 MB).'), { permanent: true });
  fs.writeFileSync(file, buf);
  return buf.length;
}

const PF = { Youtube: 'youtube', Instagram: 'instagram', TikTok: 'tiktok' };

/** Step 1: find, download, measure, cut frames, upload, and save as a research post. */
async function grabStep(job, { extract = extractRemote, download = downloadTo } = {}) {
  const g = await grabLib();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-'));
  try {
    await setStep(job.id, 'Finding the video');
    const info = await extract(job.url);
    await setStep(job.id, 'Downloading');
    const choice = chooseFormats(info.formats);
    const file = path.join(dir, 'video.mp4');
    if (choice.single) await download(choice.single, file);
    else {
      const v = path.join(dir, 'v.bin'), a = path.join(dir, 'a.bin');
      await download(choice.video, v);
      if (choice.audio) await download(choice.audio, a);
      const run = (await import('node:child_process')).spawnSync;
      run(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', v, ...(choice.audio ? ['-i', a] : []), '-c', 'copy', file]);
      if (!fs.existsSync(file)) throw new HttpError(500, 'Could not join the video and sound.');
    }
    await setStep(job.id, 'Saving the video');
    const saved = await putFile(`lab/${String(info.id || job.id).replace(/[^\w-]/g, '').slice(0, 40)}.mp4`, fs.readFileSync(file), 'video/mp4');
    await setStep(job.id, 'Measuring cuts, pacing and sound');
    const m = g.measure(file);
    if (!m.duration_seconds) throw Object.assign(new HttpError(422, 'That file has no readable video.'), { permanent: true });
    const t = g.frameTimes(m);
    const id = String(info.id || job.id).replace(/[^\w-]/g, '').slice(0, 40);
    const stamp = Date.now().toString(36);
    const up = async (p, name) => (await putFile(`research/${name}`, fs.readFileSync(p), 'image/jpeg')).url;
    const frames = {};
    for (const k of ['hook', 'shots', 'overview']) {
      const p = g.sheet(file, dir, k, t[k], m);
      if (p) frames[k] = await up(p, `lab-${id}-${stamp}-${k}.jpg`);
    }
    await setStep(job.id, 'Cutting every second into 12 frames');
    const secs = g.secondSheets(file, dir, m);
    const seconds = new Array(secs.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(8, secs.length) }, async () => {
      while (next < secs.length) {
        const i = next++;
        const x = secs[i];
        seconds[i] = { url: await up(x.file, `lab-${id}-${stamp}-s${String(i).padStart(4, '0')}.jpg`), start: x.start, end: x.end, fps: x.fps };
      }
    }));
    const motion = g.motionCurve(file);
    const thumbPath = path.join(dir, 'thumb.jpg');
    (await import('node:child_process')).spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.min(1, m.duration_seconds / 2)), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', thumbPath]);
    let transcript = null;
    const subUrl = Object.values(info.subtitles || {})[0];
    if (subUrl) { try { transcript = g.vttToText(await (await fetchT(subUrl, {}, 20000)).text()) || null; } catch { /* captions are optional */ } }
    const platform = PF[info.extractor_key] || (String(info.extractor_key || '').toLowerCase().includes('youtube') ? 'youtube' : 'instagram');
    const type = platform === 'youtube' ? ((m.duration_seconds || 0) <= 180 && m.vertical ? 'short' : 'video') : platform === 'instagram' ? 'reel' : 'video';
    const date = info.timestamp ? new Date(info.timestamp * 1000) : /^\d{8}$/.test(info.upload_date || '') ? new Date(`${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6)}T12:00:00Z`) : null;
    const sound = m.has_audio ? { note: 'cloud analysis: music inferred from loudness and cut rhythm (earshot runs on the PC)' } : { note: 'no soundtrack' };
    const measureOut = { ...m, frames: { ...frames, hook_times: t.hook, shot_times: t.shots, overview_times: t.overview, seconds }, motion, sound, transcript_source: transcript ? 'captions' : null, tags: (info.tags || []).slice(0, 40), grabbed_at: new Date().toISOString(), grabbed_by: 'vercel', video_url: saved.url };
    const { ingest } = await import('./research.js');
    const res = await ingest({
      project: { name: 'Video Lab', source: 'video-lab', niche: 'Videos sent for analysis' },
      posts: [{
        postId: info.id || job.id, platform, url: info.webpage_url || job.url,
        author: String(platform === 'instagram' ? info.channel || info.uploader || '' : info.uploader_id || info.channel || info.uploader || '').replace(/^@/, ''),
        type, date, caption: platform === 'instagram' ? info.description || info.title : [info.title, info.description].filter(Boolean).join('\n\n'),
        likesNum: info.like_count, commentsNum: info.comment_count, viewsNum: info.view_count,
        duration_s: m.duration_seconds, transcript, measure: measureOut, brand: job.brand,
        thumb_b64: fs.existsSync(thumbPath) ? fs.readFileSync(thumbPath).toString('base64') : undefined,
      }],
    });
    const postId = res.ids[String(info.id || job.id)];
    await setStep(job.id, `Claude is reading ${seconds.length} seconds at 12 fps`, { status: 'reading', research_post_id: postId, error: null });
    return { ...job, status: 'reading', research_post_id: postId };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Advance one job as far as the time allows. */
async function advance(job, { deadline, extract, download, ask }) {
  let j = job;
  if (j.status === 'queued') j = await grabStep(j, { extract, download });
  const vl = await import('./videolab.js');
  if (j.status === 'reading') {
    const [r] = await db()`select * from postroom.research_posts where id = ${j.research_post_id}`;
    if (!r) throw Object.assign(new HttpError(404, 'The saved video is gone.'), { permanent: true });
    let todo = vl.missingBlocks(r);
    const total = Math.ceil((r.measure?.frames?.seconds?.length || 0) / vl.SECONDS_PER_CALL);
    while (todo.length && Date.now() < deadline - 90000) {
      const batch = todo.splice(0, 4);
      await Promise.all(batch.map((from) => vl.analyzeSeconds(j.research_post_id, { from, ask })));
      await setStep(j.id, `Claude is reading the frames: ${total - todo.length}/${total}`);
    }
    if (todo.length) return j;
    j = { ...j, status: 'writing' };
    await setStep(j.id, `Claude is writing the learnings for ${j.brand}`, { status: 'writing' });
  }
  if (j.status === 'writing') {
    if (Date.now() > deadline - 150000) return j;
    await vl.analyzeVideo(j.research_post_id, { brand: j.brand, ask });
    await setStep(j.id, 'Done', { status: 'done', error: null });
    j = { ...j, status: 'done' };
  }
  return j;
}

/** Run open jobs, oldest first, until the time runs out. Safe to call from several places at once (row lock). */
export async function runJobs({ budgetMs = 270000, extract, download, ask } = {}) {
  const deadline = Date.now() + budgetMs;
  const done = [];
  while (Date.now() < deadline - 60000) {
    const [job] = await db()`update postroom.lab_jobs set locked_until = now() + interval '6 minutes', attempts = attempts + 1, updated_at = now()
      where id = (select id from postroom.lab_jobs where status in ${db()(OPEN)} and (locked_until is null or locked_until < now())
        order by created_at limit 1 for update skip locked)
      returning *`;
    if (!job) break;
    try {
      if (job.attempts > MAX_ATTEMPTS) throw Object.assign(new HttpError(500, job.error || 'Gave up after several tries.'), { permanent: true });
      const j = await advance(job, { deadline, extract, download, ask });
      await db()`update postroom.lab_jobs set locked_until = null where id = ${job.id}`;
      done.push({ id: job.id, status: j.status });
      if (j.status !== 'done') break; // out of time for this one; the next run continues it
    } catch (e) {
      const permanent = e.permanent || (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429);
      await db()`update postroom.lab_jobs set ${db()({ error: String(e.message || e).slice(0, 1000), locked_until: null, updated_at: new Date(), ...(permanent ? { status: 'failed', step: 'Failed' } : {}) })} where id = ${job.id}`;
      done.push({ id: job.id, error: e.message });
      if (permanent) {
        try { const { notify } = await import('./notify.js'); await notify({ kind: 'research', title: `Video Lab couldn't analyse a link for ${job.brand}`, body: String(e.message).slice(0, 180), url: '/#/research' }); } catch { /* optional */ }
      }
    }
  }
  return done;
}
