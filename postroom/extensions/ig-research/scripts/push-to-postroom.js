#!/usr/bin/env node
// Push an ig-research project into Postroom's Research tab.
//
//   POSTROOM_URL=https://vwd-postroom.vercel.app POSTROOM_RESEARCH_KEY=... node scripts/push-to-postroom.js <project>
//
// Sends: projects/<project>/config.json, raw-posts.json, transcripts/<id>.txt,
// teardowns/<id>.json and the first hook screenshot as a thumbnail. Re-running is safe —
// Postroom updates existing posts instead of duplicating them.
import fs from 'node:fs';
import path from 'node:path';

const project = process.argv[2];
const base = (process.env.POSTROOM_URL || '').replace(/\/$/, '');
const key = process.env.POSTROOM_RESEARCH_KEY;
if (!project || !base || !key) {
  console.error('Usage: POSTROOM_URL=https://… POSTROOM_RESEARCH_KEY=… node scripts/push-to-postroom.js <project>');
  process.exit(1);
}
const dir = path.resolve('projects', project);
if (!fs.existsSync(dir)) {
  console.error(`No such project folder: ${dir}`);
  process.exit(1);
}
const readJson = (f, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; }
};
const readText = (f) => {
  try { return fs.readFileSync(f, 'utf8').trim() || null; } catch { return null; }
};

const config = readJson(path.join(dir, 'config.json'), {});
const raw = readJson(path.join(dir, 'raw-posts.json'), []);
const posts = Array.isArray(raw) ? raw : raw.posts || [];
const byId = new Map(posts.filter((p) => p.postId).map((p) => [p.postId, p]));

// Teardowns can exist for posts that aren't in raw-posts.json (e.g. --youtube mode).
const tdDir = path.join(dir, 'teardowns');
const teardowns = new Map();
if (fs.existsSync(tdDir)) {
  for (const f of fs.readdirSync(tdDir).filter((f) => f.endsWith('.json') && !f.endsWith('.measure.json'))) {
    const t = readJson(path.join(tdDir, f));
    if (t?.postId) {
      teardowns.set(t.postId, t);
      if (!byId.has(t.postId)) byId.set(t.postId, { postId: t.postId, url: t.url, author: t.author, date: t.date, caption: t.caption || t.title, likesNum: t.likesNum, viewsNum: t.viewsNum, type: /youtu/.test(t.url || '') ? 'video' : 'reel', platform: /youtu/.test(t.url || '') ? 'youtube' : 'instagram' });
    }
  }
}

function thumbFor(id) {
  for (const name of [`${id}_0s.jpg`, `${id}_slide_1.jpg`, `${id}_slide_0.jpg`, `${id}_1s.jpg`]) {
    const f = path.join(dir, 'hook-screenshots', name);
    if (fs.existsSync(f) && fs.statSync(f).size < 1.4e6) return fs.readFileSync(f).toString('base64');
  }
  return null;
}

const payloadPosts = [...byId.values()].map((p) => {
  const t = teardowns.get(p.postId);
  return {
    ...p,
    rawNumbers: undefined,
    transcript: readText(path.join(dir, 'transcripts', `${p.postId}.txt`)),
    thumb_b64: thumbFor(p.postId),
    teardown: t ? { teardown: t.teardown, measure: t.measure, model: t.model } : undefined,
  };
});

const projectInfo = {
  name: config.name || project,
  niche: config.niche || raw.niche || null,
  searchTerms: config.searchTerms || raw.searchTerms || [],
  competitors: config.competitors || raw.competitors || [],
  scrapedAt: raw.scrapedAt || null,
};

const BATCH = 20;
let sent = 0;
for (let i = 0; i < payloadPosts.length || i === 0; i += BATCH) {
  const batch = payloadPosts.slice(i, i + BATCH);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${base}/api/research/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ project: projectInfo, posts: batch }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.ok) {
      sent += (await res.json()).saved;
      process.stdout.write(`\rPushed ${sent}/${payloadPosts.length} posts`);
      break;
    }
    const msg = await res.text();
    if (attempt >= 4 || res.status === 401 || res.status === 400) {
      console.error(`\nPostroom said ${res.status}: ${msg.slice(0, 300)}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  if (!payloadPosts.length) break;
}
console.log(`\nDone — open ${base}/#/research`);
