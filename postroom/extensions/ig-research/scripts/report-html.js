#!/usr/bin/env node
// Usage: node scripts/report-html.js <project-name>

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const projectName = process.argv[2];
if (!projectName) { console.error('Usage: node scripts/report-html.js <project-name>'); process.exit(1); }

const projectDir = resolve(join(import.meta.dirname, '..', 'projects', projectName));
const rawPostsFile = join(projectDir, 'raw-posts.json');
if (!existsSync(rawPostsFile)) { console.error(`raw-posts.json not found`); process.exit(1); }

const data = JSON.parse(readFileSync(rawPostsFile, 'utf8'));
const transcriptsDir = join(projectDir, 'transcripts');
const hooksDir = join(projectDir, 'hook-screenshots');

const transcripts = {};
if (existsSync(transcriptsDir)) {
  for (const f of readdirSync(transcriptsDir)) {
    if (f.endsWith('.txt')) transcripts[f.replace('.txt', '')] = readFileSync(join(transcriptsDir, f), 'utf8').trim();
  }
}

function getSlides(postId) {
  const slides = [];
  for (let i = 0; i < 20; i++) {
    const f = join(hooksDir, `${postId}_slide_${i}.jpg`);
    if (existsSync(f)) slides.push(`hook-screenshots/${postId}_slide_${i}.jpg`);
    else break;
  }
  return slides;
}

function getReelFrames(postId) {
  return [0,1,2].filter(s => existsSync(join(hooksDir, `${postId}_${s}s.jpg`)))
                 .map(s => `hook-screenshots/${postId}_${s}s.jpg`);
}

function hasMp4(postId) { return existsSync(join(transcriptsDir, `${postId}.mp4`)); }
function mp4Path(postId) { return `file://${transcriptsDir}/${postId}.mp4`; }

function cleanCaption(cap) {
  if (!cap) return '';
  // strip username prefix + time suffix like "username 3w" at start
  return cap.replace(/^[\w.]+\s*(Verified\s*)?(Edited\s*•\s*)?\d+[wdhm]\s*/i, '').trim();
}

function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Group by author, preserving order
const authorOrder = [];
const byAuthor = {};
for (const p of data.posts) {
  p.transcript = transcripts[p.postId] || '';
  const a = p.author || 'unknown';
  if (!byAuthor[a]) { byAuthor[a] = []; authorOrder.push(a); }
  byAuthor[a].push(p);
}

// Filter out stray single-post accounts (tagged accounts, not actual profiles)
const mainAuthors = authorOrder.filter(a => byAuthor[a].length >= 4);

function postCard(p) {
  const slides = getSlides(p.postId);
  const frames = getReelFrames(p.postId);
  const cap = cleanCaption(p.caption || p.fullCaption || '');
  const tr = p.transcript;
  const url = p.url || ('https://www.instagram.com' + (p.href || ''));
  const mp4 = hasMp4(p.postId);

  const mediaHtml = p.type === 'reel'
    ? `<div class="media-section">
        <div class="frames-row">
          ${frames.map((src, i) => `<div class="frame-wrap"><img src="${src}" loading="lazy"><span class="frame-time">${i}s</span></div>`).join('')}
        </div>
        ${mp4 ? `<a class="watch-btn" href="${mp4Path(p.postId)}" target="_blank">▶ Watch Video</a>` : ''}
       </div>`
    : slides.length > 0
    ? `<div class="media-section">
        <div class="slides-scroll">
          ${slides.map((src, i) => `<div class="slide-wrap"><img src="${src}" loading="lazy"><span class="slide-num">${i+1}/${slides.length}</span></div>`).join('')}
        </div>
        <div class="slide-count">${slides.length} slide${slides.length > 1 ? 's' : ''}</div>
       </div>`
    : '';

  const transcriptHtml = tr ? `
    <div class="field">
      <div class="field-label">Script / Transcript</div>
      <div class="field-body transcript">${esc(tr)}</div>
    </div>` : '';

  const captionHtml = cap ? `
    <div class="field">
      <div class="field-label">Caption</div>
      <div class="field-body caption">${esc(cap)}</div>
    </div>` : '';

  return `
<div class="post-card ${p.type}">
  <div class="post-header">
    <span class="type-badge ${p.type}">${p.type === 'reel' ? '▶ Reel' : slides.length > 1 ? '⊞ Carousel' : '◻ Image'}</span>
    ${p.date ? `<span class="post-date">${new Date(p.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>` : ''}
    <a class="ig-link" href="${esc(url)}" target="_blank">View on Instagram ↗</a>
  </div>
  ${mediaHtml}
  <div class="post-body">
    ${captionHtml}
    ${transcriptHtml}
  </div>
</div>`;
}

function accountSection(author) {
  const posts = byAuthor[author] || [];
  const reels = posts.filter(p => p.type === 'reel');
  const images = posts.filter(p => p.type === 'image');
  const transcribed = reels.filter(p => p.transcript);
  const carousels = images.filter(p => getSlides(p.postId).length > 1);

  return `
<section class="account-section" id="account-${author}">
  <div class="account-header">
    <div class="account-handle">@${esc(author)}</div>
    <div class="account-meta">
      <span>${posts.length} posts</span>
      <span>${reels.length} reels</span>
      <span>${images.length} images</span>
      <span>${carousels.length} carousels</span>
      <span>${transcribed.length} transcribed</span>
    </div>
  </div>
  <div class="posts-list">
    ${posts.map(postCard).join('')}
  </div>
</section>`;
}

// Hook gallery: first frame of every reel across all accounts
const allReels = data.posts.filter(p => p.type === 'reel' && getReelFrames(p.postId).length > 0);
const hookGallery = allReels.map(p => {
  const frames = getReelFrames(p.postId);
  const mp4 = hasMp4(p.postId);
  return `<div class="hook-thumb">
    <img src="${frames[0]}" loading="lazy">
    <div class="hook-thumb-info">
      <span class="hook-author">@${esc(p.author||'?')}</span>
      ${mp4 ? `<a href="${mp4Path(p.postId)}" target="_blank" class="hook-play">▶</a>` : ''}
    </div>
  </div>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.project || projectName)} — Creative Reference</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0D0D0B;
  --bg2:#141412;
  --bg3:#1C1C1A;
  --bg4:#242420;
  --gold:#D4A843;
  --gold2:#A07830;
  --text:#E8E6E0;
  --dim:#888680;
  --border:#2A2A26;
  --reel:#E84843;
  --image:#4389E8;
  --carousel:#A843D4;
  --r:10px;
}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;display:flex;min-height:100vh}

/* Sidebar */
.sidebar{width:220px;min-width:220px;background:var(--bg2);border-right:1px solid var(--border);position:sticky;top:0;height:100vh;overflow-y:auto;padding:20px 0;flex-shrink:0}
.sidebar-title{padding:0 16px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--dim);border-bottom:1px solid var(--border);margin-bottom:8px}
.sidebar-link{display:block;padding:10px 16px;font-size:13px;color:var(--dim);text-decoration:none;border-left:3px solid transparent;transition:all 0.15s}
.sidebar-link:hover,.sidebar-link.active{color:var(--text);border-left-color:var(--gold);background:var(--bg3)}
.sidebar-link span{display:block;font-size:11px;color:var(--dim);margin-top:2px}
.sidebar-sep{height:1px;background:var(--border);margin:8px 16px}

/* Main */
.main{flex:1;overflow-y:auto;padding:32px 40px;max-width:900px}

/* Nav tabs */
.section-nav{display:flex;gap:4px;margin-bottom:32px;flex-wrap:wrap}
.section-nav a{padding:7px 14px;border-radius:20px;font-size:12px;font-weight:600;color:var(--dim);text-decoration:none;border:1px solid var(--border);transition:all 0.15s}
.section-nav a:hover{color:var(--text);border-color:var(--gold2)}

/* Account section */
.account-section{margin-bottom:64px;scroll-margin-top:20px}
.account-header{margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid var(--border)}
.account-handle{font-size:26px;font-weight:700;color:var(--gold);margin-bottom:8px}
.account-meta{display:flex;gap:16px;flex-wrap:wrap}
.account-meta span{font-size:12px;color:var(--dim);background:var(--bg3);padding:3px 10px;border-radius:12px}

/* Post card */
.post-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin-bottom:20px;overflow:hidden;transition:border-color 0.2s}
.post-card:hover{border-color:var(--bg4)}
.post-header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.type-badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;text-transform:uppercase;letter-spacing:0.05em}
.type-badge.reel{background:rgba(232,72,67,0.15);color:var(--reel);border:1px solid rgba(232,72,67,0.25)}
.type-badge.image{background:rgba(67,137,232,0.15);color:var(--image);border:1px solid rgba(67,137,232,0.25)}
.post-date{font-size:12px;color:var(--dim)}
.ig-link{margin-left:auto;font-size:12px;color:var(--gold2);text-decoration:none;white-space:nowrap}
.ig-link:hover{color:var(--gold)}

/* Media */
.media-section{background:var(--bg);padding:12px;border-bottom:1px solid var(--border)}
.frames-row{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.frame-wrap{position:relative;flex-shrink:0;width:160px;border-radius:6px;overflow:hidden;background:var(--bg3)}
.frame-wrap img{width:100%;display:block}
.frame-time{position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.75);color:#fff;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px}
.watch-btn{display:inline-block;margin-top:10px;background:var(--reel);color:#fff;font-size:12px;font-weight:600;padding:7px 18px;border-radius:6px;text-decoration:none;transition:opacity 0.15s}
.watch-btn:hover{opacity:0.85}

.slides-scroll{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.slide-wrap{position:relative;flex-shrink:0;width:220px;border-radius:6px;overflow:hidden;background:var(--bg3)}
.slide-wrap img{width:100%;display:block}
.slide-num{position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.75);color:#fff;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px}
.slide-count{font-size:11px;color:var(--dim);margin-top:6px}

/* Body fields */
.post-body{padding:16px;display:flex;flex-direction:column;gap:14px}
.field-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--dim);margin-bottom:6px}
.field-body{font-size:13px;line-height:1.65;color:var(--text);white-space:pre-wrap;word-break:break-word}
.caption{color:#C8C6C0}
.transcript{background:var(--bg3);border-radius:6px;padding:12px 14px;border-left:3px solid var(--gold2);font-style:italic;color:#B8B6B0}

/* Hook gallery */
.hook-gallery-section{margin-bottom:64px;scroll-margin-top:20px}
.hook-gallery-title{font-size:20px;font-weight:700;color:var(--text);margin-bottom:6px}
.hook-gallery-sub{font-size:13px;color:var(--dim);margin-bottom:20px}
.hook-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.hook-thumb{position:relative;border-radius:8px;overflow:hidden;background:var(--bg3);aspect-ratio:9/16}
.hook-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.hook-thumb-info{position:absolute;bottom:0;left:0;right:0;padding:6px 8px;background:linear-gradient(transparent,rgba(0,0,0,0.85));display:flex;align-items:center;justify-content:space-between}
.hook-author{font-size:10px;color:#fff;font-weight:600}
.hook-play{background:var(--reel);color:#fff;font-size:11px;padding:2px 7px;border-radius:4px;text-decoration:none}

/* Page header */
.page-header{margin-bottom:40px;padding-bottom:24px;border-bottom:1px solid var(--border)}
.page-header h1{font-size:24px;font-weight:700;color:var(--text);margin-bottom:4px}
.page-header p{font-size:13px;color:var(--dim)}

/* Scrollbar */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:var(--bg2)}
::-webkit-scrollbar-thumb{background:var(--bg4);border-radius:2px}
</style>
</head>
<body>

<nav class="sidebar">
  <div class="sidebar-title">Accounts</div>
  <a class="sidebar-link" href="#hook-gallery">Hook Gallery<span>all reel first frames</span></a>
  <div class="sidebar-sep"></div>
  ${mainAuthors.map(a => {
    const ps = byAuthor[a];
    const reels = ps.filter(p => p.type === 'reel').length;
    return `<a class="sidebar-link" href="#account-${a}">@${a}<span>${ps.length} posts · ${reels} reels</span></a>`;
  }).join('')}
</nav>

<main class="main">
  <div class="page-header">
    <h1>${esc(data.project || projectName)} — Creative Reference</h1>
    <p>${mainAuthors.length} accounts · ${data.posts.length} posts · ${data.reels} reels with video · ${Object.keys(transcripts).length} transcripts</p>
  </div>

  <section class="hook-gallery-section" id="hook-gallery">
    <div class="hook-gallery-title">Hook Gallery</div>
    <div class="hook-gallery-sub">First frame of every reel. Click ▶ to open the video locally.</div>
    <div class="hook-gallery">${hookGallery}</div>
  </section>

  ${mainAuthors.map(accountSection).join('')}
</main>

</body>
</html>`;

const outputFile = join(projectDir, 'report.html');
writeFileSync(outputFile, html);
console.log(`\nReport: ${outputFile}`);
console.log(`open "${outputFile}"`);
