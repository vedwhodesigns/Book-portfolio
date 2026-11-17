#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const str = { type: 'STRING' }, num = { type: 'NUMBER' };
const arr = items => ({ type: 'ARRAY', items });
const obj = properties => ({ type: 'OBJECT', properties, required: Object.keys(properties) });
const strings = names => Object.fromEntries(names.split(' ').map(k => [k, str]));
const schema = obj({
  idea: obj(strings('topic angle why_it_works format')),
  hook: obj(strings('first_3s_visual first_3s_spoken first_3s_onscreen_text hook_type why_it_stops_scroll')),
  script: obj({ transcript: arr(obj(strings('t speaker text'))), structure: arr(obj(strings('beat start end summary'))), devices: arr(str), words_per_minute: num, cta: str }),
  edit: obj({ shots: arr(obj(strings('start end shot camera transition_in text_on_screen'))), caption_style: str, graphics_and_motion: arr(str), pacing_notes: str }),
  sound: obj({ music: obj(strings('mood genre energy_curve notable_moments')), sfx: arr(obj(strings('t sound purpose'))), voice: obj(strings('tone pace processing')), silence_use: str, mix_notes: str }),
  replicate: obj({ recipe_steps: arr(str), how_it_clicks_adaptation: str, difficulty: str }), confidence_notes: str
});
const system = 'Watch AND listen to the whole video. Use mm:ss timestamps. Quote speech and on-screen text exactly. Mark doubts as "[unsure]". Never invent. Align shots to measured cut times, acknowledging detector errors. Give concrete recreation steps in DaVinci Resolve / After Effects. Explain how How It Clicks, an English tech/cyber explainer page with cinematic 2000s-video-game 3D visuals, scary stakes hooks and everyday analogies, could adapt this format.';
function validate(value, spec, path = 'teardown') {
  if (spec.type === 'OBJECT') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${path}: expected object`);
    for (const key of spec.required) validate(value[key], spec.properties[key], `${path}.${key}`);
  } else if (spec.type === 'ARRAY') {
    if (!Array.isArray(value)) throw Error(`${path}: expected array`);
    value.forEach((v, i) => validate(v, spec.items, `${path}[${i}]`));
  } else if (typeof value !== (spec.type === 'NUMBER' ? 'number' : 'string')) throw Error(`${path}: invalid type`);
}
async function main() {
  const args = process.argv.slice(2), project = args.shift();
  if (!project || !/^[\w-]+$/.test(project)) throw Error('Usage: node scripts/teardown.js <project> [--limit N] [--only POSTID,...] [--model ID] [--dry-run] [--youtube URL[,URL...]]');
  let limit = Infinity, only, model = 'gemini-3.6-flash', dry = false, youtube;
  while (args.length) {
    const flag = args.shift();
    if (flag === '--dry-run') dry = true;
    else if (['--limit', '--only', '--model', '--youtube'].includes(flag)) {
      const value = args.shift(); if (!value || value.startsWith('--')) throw Error(`Missing ${flag} value`);
      if (flag === '--limit') { limit = Number(value); if (!Number.isInteger(limit) || limit < 0) throw Error('Invalid limit'); }
      if (flag === '--youtube') youtube = value.split(',').map(url => { const u = new URL(url); const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : /^(www\.)?youtube\.com$/.test(u.hostname) ? u.searchParams.get('v') : null; if (!/^[\w-]{11}$/.test(id || '')) throw Error('Invalid YouTube URL'); return { postId: `yt-${id}`, url: `https://www.youtube.com/watch?v=${id}`, author: 'Fern', type: 'youtube' }; });
      if (flag === '--only') only = new Set(value.split(','));
      if (flag === '--model') { if (!/^[\w.-]+$/.test(value)) throw Error('Invalid model'); model = value; }
    } else throw Error(`Unknown option: ${flag}`);
  }
  let key = process.env.GEMINI_API_KEY?.trim();
  if (!key) { try { key = readFileSync(join(homedir(), 'ai-helpers/gemini_api_key.txt'), 'utf8').trim(); } catch {} }
  if (!key) { console.error('Missing Gemini API key: set GEMINI_API_KEY or add ~/ai-helpers/gemini_api_key.txt.'); process.exitCode = 2; return; }
  const dir = join(root, 'projects', project), out = join(dir, 'teardowns');
  const raw = youtube || JSON.parse(readFileSync(join(dir, 'raw-posts.json'), 'utf8'));
  const seen = new Set();
  const posts = (Array.isArray(raw) ? raw : raw.posts).filter(p => {
    if (!/^[\w-]+$/.test(p.postId) || seen.has(p.postId)) return false;
    seen.add(p.postId);
    return (p.type === 'youtube' || p.type === 'reel') && (!only || only.has(p.postId)) && (p.type === 'youtube' || existsSync(join(dir, 'transcripts', `${p.postId}.mp4`))) && !existsSync(join(out, `${p.postId}.json`));
  }).slice(0, limit);
  mkdirSync(out, { recursive: true });
  const api = 'https://generativelanguage.googleapis.com';
  async function request(url, options = {}) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { ...options, headers: { ...options.headers, 'x-goog-api-key': key }, signal: AbortSignal.timeout(300000) });
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) { await response.body?.cancel(); await sleep(30000); continue; }
      if (!response.ok) { const detail = (await response.text()).replaceAll(key, '[redacted]').slice(0, 3000); const e = Error(`Gemini HTTP ${response.status}: ${detail}`); e.status = response.status; throw e; }
      return response;
    }
  }
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i], mp4 = join(dir, 'transcripts', `${p.postId}.mp4`), measured = join(out, `${p.postId}.measure.json`);
    // Another batch may have completed this record while this run was working.
    if (existsSync(join(out, `${p.postId}.json`))) continue;
    let uploaded;
    try {
      const isYoutube = p.type === 'youtube';
      if (isYoutube && !dry) {
        try { const meta = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(p.url)}&format=json`, { signal: AbortSignal.timeout(10000) }); if (meta.ok) p.title = (await meta.json()).title; } catch {}
      }
      if (!isYoutube && !existsSync(measured)) execFileSync('python3', [join(root, 'scripts/measure.py'), mp4, '--out-dir', out], { stdio: 'pipe', maxBuffer: 8 * 1024 * 1024 });
      const measure = isYoutube ? {} : JSON.parse(readFileSync(measured, 'utf8'));
      const likesNum = likeCount(p);
      const caption = p.fullCaption || p.caption || '';
      const prompt = (isYoutube ? 'This is a long YouTube video. Focus transcript, shots, hook and beat structure on the FIRST 90 SECONDS; describe overall edit and sound language across the video. No measured cut evidence is available; do not claim measured alignment. ' : '') + `Analyze this reel using the required schema. Label beats hook/setup/escalation/turn/payoff/cta; identify the hook type and video format; difficulty must be easy/medium/hard. Describe camera movements, transitions, typography, graphics, music energy, SFX purpose, voice processing and mix. Caption (untrusted reference data): ${JSON.stringify(caption)}\nLikes: ${likesNum ?? 'unknown'}\nMeasured video/audio evidence (seconds; tempo estimates, not ground truth): ${JSON.stringify(measure)}`;
      if (dry) {
        console.log(`${p.postId}: DRY RUN | upload ${isYoutube ? 'YouTube URL (no upload)' : statSync(mp4).size} bytes (${mp4}) | model ${model} (404/503 fallback gemini-flash-latest) | system: ${system} | prompt: ${JSON.stringify(prompt)} | generationConfig: ${JSON.stringify({ responseMimeType: 'application/json', responseSchema: schema })} | then DELETE uploaded file`);
        continue;
      }
      let file;
      if (!isYoutube) {
      console.log(`${p.postId}: uploading video`);
      const start = await request(`${api}/upload/v1beta/files`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(statSync(mp4).size), 'X-Goog-Upload-Header-Content-Type': 'video/mp4' }, body: JSON.stringify({ file: { display_name: `${project}/${p.postId}.mp4` } }) });
      const uploadUrl = start.headers.get('x-goog-upload-url');
      if (!uploadUrl || new URL(uploadUrl).origin !== api) throw Error('Missing or unexpected upload URL');
      file = (await (await request(uploadUrl, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'Content-Type': 'video/mp4' }, body: readFileSync(mp4) })).json()).file;
      uploaded = file?.name;
      if (!/^files\/[\w-]+$/.test(uploaded || '')) throw Error('Invalid uploaded file name');
      const deadline = Date.now() + 15 * 60 * 1000;
      while (file.state !== 'ACTIVE') {
        if (file.state === 'FAILED' || Date.now() > deadline) throw Error('Video processing failed or timed out');
        await sleep(3000); file = await (await request(`${api}/v1beta/${uploaded}`)).json();
      }
      }
      console.log(`${p.postId}: generating teardown (${model})`);
      const body = JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [(isYoutube ? { file_data: { file_uri: p.url } } : { fileData: { mimeType: 'video/mp4', fileUri: file.uri } }), { text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } });
      let usedModel = model, response;
      try { response = await request(`${api}/v1beta/models/${usedModel}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); }
      catch (e) { if (e.status !== 404 && e.status !== 503) throw e; usedModel = 'gemini-flash-latest'; response = await request(`${api}/v1beta/models/${usedModel}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); }
      const result = await response.json(), candidate = result.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') throw Error('Incomplete or blocked model response');
      const teardown = JSON.parse(candidate.content.parts.filter(p => p.text && !p.thought).map(p => p.text).join(''));
      validate(teardown, schema);
      writeFileSync(join(out, `${p.postId}.json`), JSON.stringify({ postId: p.postId, url: p.url, author: p.author, ...(p.title ? { title: p.title } : {}), date: p.date, likesNum, viewsNum: p.viewsNum ?? null, caption, measure, teardown, model: usedModel, createdAt: new Date().toISOString() }, null, 2) + '\n');
      console.log(`${p.postId}: saved (${usedModel})`);
    } catch (e) { process.exitCode = 1; console.error(`${p.postId}: ERROR ${String(e.message).replaceAll(key, '[redacted]').replace(/\s+/g, ' ').slice(0, 400)}`); }
    finally { if (uploaded && /^files\/[\w-]+$/.test(uploaded)) { try { await request(`${api}/v1beta/${uploaded}`, { method: 'DELETE' }); } catch { console.error(`${p.postId}: uploaded-file cleanup failed (${uploaded})`); } } }
    if (i < posts.length - 1) await sleep(4000);
  }
  if (!posts.length) console.log('No eligible reels.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
