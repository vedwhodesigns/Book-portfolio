#!/usr/bin/env node
// =============================================================================
// Instagram Research — Single-pass scraper
// For each post: navigate → engagement + caption → screenshots → audio → next
// One visit per post. No second pass.
// Usage: node scripts/scrape.js <project-name>
// =============================================================================

import CDP from 'chrome-remote-interface';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { homedir, tmpdir } from 'os';

const execAsync = promisify(exec);

const projectName = process.argv[2];
const force = process.argv.includes('--force');
const profileViews = new Map();
if (!projectName) {
  console.error('Usage: node scripts/scrape.js <project-name>');
  process.exit(1);
}

const projectDir = join(import.meta.dirname, '..', 'projects', projectName);
const configFile = join(projectDir, 'config.json');
if (!existsSync(configFile)) {
  console.error(`Project not found: ${projectDir}\nCreate a config.json first.`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configFile, 'utf8'));
const outputFile = join(projectDir, 'raw-posts.json');
const transcriptsDir = join(projectDir, 'transcripts');
const hooksDir = join(projectDir, 'hook-screenshots');

[transcriptsDir, hooksDir].forEach(d => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

const wait = ms => new Promise(r => setTimeout(r, ms));

function getPort() {
  return config.browserPort || 9222;
}

async function assertAccessible(client) {
  const state = await client.Runtime.evaluate({ expression: `(() => ({url: location.href, text: document.body?.innerText || '', login: !!document.querySelector('input[name="username"], input[name="password"], iframe[src*="captcha"]')}))()`, returnByValue: true });
  const v = state.result.value;
  if (v && (v.login || /accounts\/login|challenge|checkpoint/.test(v.url) || /try again later|too many requests|we restrict certain activity|confirm you.re human|suspicious activity|log in to continue|sign up for Instagram to stay in the loop/i.test(v.text))) {
    console.error('STOP scraping: Instagram login wall, captcha, or rate limit detected.');
    await client.close();
    process.exit(2);
  }
}

async function getClient() {
  const port = getPort();
  let targets;
  try {
    targets = await CDP.List({ port });
  } catch (e) {
    console.error(`\nCannot connect to Chrome on port ${port}.`);
    console.error('Double-click start-chrome.command in this folder to launch Research Chrome.\n');
    process.exit(1);
  }
  let target = targets.find(t => t.type === 'page' && t.url.includes('instagram.com'));
  if (!target) {
    target = await CDP.New({ port, url: 'https://www.instagram.com/' });
    await wait(5000);
  }
  const client = await CDP({ port, target: target.id });
  await client.Page.enable();
  await client.Runtime.enable();
  await client.DOM.enable();
  await client.Network.enable();
  return client;
}

async function getClientWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await getClient();
    } catch (e) {
      if (i < retries - 1) { await wait(2000); } else { throw e; }
    }
  }
}

async function collectSearchPosts(client, searchTerm, maxPosts) {
  const searchUrl = `https://www.instagram.com/explore/tags/${searchTerm.replace(/\s+/g, '').replace(/^#/, '')}/`;
  console.log(`  Navigating to: ${searchUrl}`);
  await client.Page.navigate({ url: searchUrl });
  await wait(5000);

  const scrollRounds = Math.ceil(maxPosts / 12);
  for (let i = 0; i < scrollRounds; i++) {
    await client.Runtime.evaluate({ expression: 'window.scrollBy(0, 1500)' });
    await wait(2000);
  }

  const postLinks = await client.Runtime.evaluate({
    expression: `
      (() => {
        const links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
        const hrefs = [];
        const seen = new Set();
        for (const l of links) {
          const h = l.getAttribute('href');
          if (!seen.has(h)) { seen.add(h); hrefs.push(h); }
          if (hrefs.length >= ${maxPosts}) break;
        }
        return hrefs;
      })()
    `,
    returnByValue: true
  });
  return postLinks.result.value;
}

async function collectProfilePosts(client, profileUrl, maxPosts) {
  console.log(`  Navigating to: ${profileUrl}`);
  await client.Page.navigate({ url: profileUrl });
  await wait(5000);
  await assertAccessible(client);
  await client.Runtime.evaluate({ expression: 'window.scrollBy(0, 800)' });
  await wait(2000);

  const postLinks = await client.Runtime.evaluate({
    expression: `
      (() => {
        const links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
        const hrefs = [];
        const seen = new Set();
        for (const l of links) {
          const h = l.getAttribute('href');
          if (!seen.has(h)) { seen.add(h); hrefs.push(h); }
          if (hrefs.length >= ${maxPosts}) break;
        }
        return hrefs;
      })()
    `,
    returnByValue: true
  });
  const hrefs = postLinks.result.value;
  // The reels grid labels its play overlay with a play icon; bare profile stats are ignored.
  await client.Page.navigate({ url: profileUrl.replace(/\/$/, '') + '/reels/' });
  await wait(5000);
  await assertAccessible(client);
  const counts = await client.Runtime.evaluate({ expression: `(() => {
    return [...document.querySelectorAll('a[href*="/reel/"]')].map(a => {
      const icon = [...a.querySelectorAll('svg[aria-label]')].find(s => /play|view/i.test(s.getAttribute('aria-label')));
      if (!icon) return null;
      let region = icon.parentElement;
      while (region && region !== a) {
        const count = [...region.querySelectorAll('span')].map(s => s.textContent.trim()).find(t => /^[\\d,.]+\\s*[KM]?$/i.test(t));
        if (count) return [a.getAttribute('href'), count];
        region = region.parentElement;
      }
      return null;
    }).filter(Boolean);
  })()`, returnByValue: true });
  for (const [href, count] of counts.result.value || []) {
    const id = href.match(/\/reel\/([\w-]+)/)?.[1];
    if (id) profileViews.set(id, count);
  }
  return hrefs;
}

async function processPost(client, href, source) {
  const postId = href.match(/\/(p|reel)\/([\w-]+)/)?.[2] || '';
  const postUrl = href.startsWith('http') ? href : 'https://www.instagram.com' + href;
  const audioFile = join(transcriptsDir, `${postId}.m4a`);
  const ssFile0 = join(hooksDir, `${postId}_0s.jpg`);

  if (!force && existsSync(audioFile) && existsSync(ssFile0)) {
    return { postId, skipped: true };
  }

  await client.Page.navigate({ url: postUrl });
  await wait(2000);
  await assertAccessible(client);

  for (let attempt = 0; attempt < 20; attempt++) {
    const loaded = await client.Runtime.evaluate({
      expression: `(() => { const spans = document.querySelectorAll('span'); for (const s of spans) { if (s.textContent.match(/^[\\d,.]+[KkMm]?$/) && s.textContent.trim() !== '0') return true; } return false; })()`,
      returnByValue: true
    });
    if (loaded.result.value) break;
    await wait(500);
  }

  for (let attempt = 0; attempt < 15; attempt++) {
    const paused = await client.Runtime.evaluate({
      expression: `(() => { const v = document.querySelector('video'); if(v) { v.pause(); v.muted = true; return true; } return false; })()`,
      returnByValue: true
    });
    if (paused.result.value) break;
    await wait(300);
  }
  await wait(1000);

  const data = await client.Runtime.evaluate({
    expression: `
      (() => {
        const result = { url: window.location.href, likes: null, comments: null, commentsCount: null, shares: null };

        // Only read numbers between this action icon and the next one in its section.
        const actionSection = [...document.querySelectorAll('svg[aria-label="Comment"]')]
          .filter(svg => svg.getClientRects().length)
          .map(svg => svg.closest('section'))
          .find(section => section?.querySelector('svg[aria-label="Save"], svg[aria-label="Remove"]'));
        function actionCount(labels) {
          if (!actionSection) return null;
          const nodes = [...actionSection.querySelectorAll('svg[aria-label], span')];
          const index = nodes.findIndex(el => el.tagName.toLowerCase() === 'svg' && labels.includes(el.getAttribute('aria-label')));
          if (index < 0) return null;
          for (const el of nodes.slice(index + 1)) {
            if (el.tagName.toLowerCase() === 'svg') break;
            const text = el.textContent.trim();
            if (!el.querySelector('svg') && /^[\\d,.]+\\s*[KkMm]?$/.test(text) && el.getClientRects().length) return text;
          }
          return null;
        }
        result.likesFromBtn = actionCount(['Like', 'Unlike']);
        result.commentsFromBtn = actionCount(['Comment']);
        result.repostsFromBtn = actionCount(['Repost', 'Undo repost']);
        result.sharesFromBtn = actionCount(['Share']);
        const allSpans = document.querySelectorAll('span');
        const rawNumbers = [];
        for (const el of allSpans) {
          const t = el.textContent.trim();
          if (t.match(/^[\\d,.]+[KkMm]?$/) && t.length < 15 && t !== '0') {
            rawNumbers.push(t);
          }
          if (actionSection?.contains(el) && t.match(/^Liked by/i) && !result.likesContext) result.likesContext = t;
          if (actionSection?.contains(el) && t.match(/^[\\d,.]+[KkMm]?\\s+likes?$/i) && !result.likes) result.likes = t;
          if (t.match(/^View all (\\d[\\d,]*) comments$/i) && !result.comments) {
            result.comments = t;
            result.commentsCount = t.match(/^View all ([\\d,]+)/i)[1];
          }
        }

        const uniqueNums = [...new Set(rawNumbers)];
        result.rawNumbers = uniqueNums.slice(0, 10);


        const h1 = document.querySelector('h1');
        result.caption = h1 ? h1.textContent.substring(0, 500) : '';
        if (!result.caption) {
          const spans = document.querySelectorAll('span[dir="auto"]');
          for (const s of spans) {
            if (s.textContent.length > 20 && s.textContent.length < 5000) {
              result.caption = s.textContent.substring(0, 500);
              break;
            }
          }
        }
        result.fullCaption = h1 ? h1.textContent : '';
        if (!result.fullCaption) {
          const spans = document.querySelectorAll('span[dir="auto"]');
          for (const s of spans) {
            if (s.textContent.length > 20) { result.fullCaption = s.textContent; break; }
          }
        }

        result.type = document.querySelector('video') ? 'reel' : 'image';
        const timeEl = document.querySelector('time[datetime]');
        result.date = timeEl ? timeEl.getAttribute('datetime') : '';
        result.dateText = timeEl ? timeEl.textContent : '';

        const allPageLinks = document.querySelectorAll('a[href]');
        let foundAuthor = '';
        for (const a of allPageLinks) {
          const href = a.getAttribute('href') || '';
          if (href.length > 2 && href[0] === '/' && href[href.length - 1] === '/' && href.indexOf('/', 1) === href.length - 1) {
            const username = href.slice(1, -1);
            const text = a.textContent.trim().toLowerCase().replace('verified', '');
            if (text === username.toLowerCase()) {
              foundAuthor = username;
              break;
            }
          }
        }
        result.author = foundAuthor;

        return result;
      })()
    `,
    returnByValue: true
  });

  const post = data.result.value;
  if (!post) {
    console.log('failed (page did not load)');
    return { postId, skipped: true };
  }
  post.hasScreenshots = existsSync(ssFile0);
  post.href = href;
  post.source = source;
  post.postId = postId;
  post.likesNum = parseCount(post.likesFromBtn) ?? correctedLikes(post);
  post.commentsNum = parseCount(post.commentsFromBtn) ?? parseCount(post.commentsCount);
  post.repostsNum = parseCount(post.repostsFromBtn);
  post.sharesNum = parseCount(post.sharesFromBtn);
  post.likes = post.likesNum === null ? null : String(post.likesNum);
  post.views = profileViews.get(postId) ?? null;
  post.viewsNum = parseCount(post.views);
  if (post.type === 'reel' || /\/reel\//.test(href)) {
    try {
      const viewResult = await client.Runtime.evaluate({
        expression: `(() => {
          const root = document.querySelector('article') || document.querySelector('main');
          if (!root) return null;
          for (const el of root.querySelectorAll('span, [aria-label]')) {
            if (!el.getClientRects().length) continue;
            for (const text of [el.textContent, el.getAttribute('aria-label')]) {
              const match = (text || '').trim().match(/^[\\d,.]+\\s*[KkMm]?\\s+(?:views?|plays?)$/i);
              if (match) return match[0];
            }
          }
          return null;
        })()`,
        returnByValue: true
      });
      const views = viewResult.result?.value;
      const viewsNum = parseCount(views?.replace(/\s+(?:views?|plays?)$/i, ''));
      if (viewsNum !== null) { post.views = views; post.viewsNum = viewsNum; }
    } catch (_) {
      // View counts are optional; extraction must not interrupt the post.
    }
  }


  if (post.type === 'reel' && !existsSync(ssFile0)) {
    try {
      for (const sec of [0, 1, 2]) {
        const ssFile = join(hooksDir, `${postId}_${sec}s.jpg`);
        await client.Runtime.evaluate({
          expression: `(() => { const v = document.querySelector('video'); if(v) { v.currentTime = ${sec}; } })()`,
        });
        await wait(800);
        const ss = await client.Page.captureScreenshot({ format: 'jpeg', quality: 70 });
        writeFileSync(ssFile, Buffer.from(ss.data, 'base64'));
      }
      post.hasScreenshots = true;
    } catch (e) {
      post.hasScreenshots = false;
    }
  }

  // Carousel: screenshot each slide
  if (post.type === 'image') {
    const slide0File = join(hooksDir, `${postId}_slide_0.jpg`);
    if (!existsSync(slide0File)) {
      try {
        // Screenshot slide 1
        const ss0 = await client.Page.captureScreenshot({ format: 'jpeg', quality: 70 });
        writeFileSync(slide0File, Buffer.from(ss0.data, 'base64'));

        // Check for carousel next button and iterate
        let slideIndex = 1;
        while (slideIndex < 10) {
          const hasNext = await client.Runtime.evaluate({
            expression: `(() => {
              const btns = document.querySelectorAll('button');
              for (const b of btns) {
                const label = b.getAttribute('aria-label') || '';
                if (label.toLowerCase().includes('next') && b.offsetParent !== null) return true;
              }
              // Also check for chevron SVG buttons used in newer IG
              const chevrons = document.querySelectorAll('[aria-label="Next"]');
              return chevrons.length > 0 && chevrons[0].offsetParent !== null;
            })()`,
            returnByValue: true
          });

          if (!hasNext.result.value) break;

          await client.Runtime.evaluate({
            expression: `(() => {
              const btns = document.querySelectorAll('button');
              for (const b of btns) {
                const label = b.getAttribute('aria-label') || '';
                if (label.toLowerCase().includes('next') && b.offsetParent !== null) { b.click(); return true; }
              }
              const chevrons = document.querySelectorAll('[aria-label="Next"]');
              if (chevrons.length > 0) { chevrons[0].click(); return true; }
              return false;
            })()`,
            returnByValue: true
          });

          await wait(800);
          const ssN = await client.Page.captureScreenshot({ format: 'jpeg', quality: 70 });
          writeFileSync(join(hooksDir, `${postId}_slide_${slideIndex}.jpg`), Buffer.from(ssN.data, 'base64'));
          slideIndex++;
        }

        post.hasScreenshots = true;
        post.slideCount = slideIndex;
      } catch (e) {
        post.hasScreenshots = false;
      }
    }
  }

  if (post.type === 'reel') {
    const videoFile = join(transcriptsDir, `${postId}.mp4`);
    if (!existsSync(videoFile)) {
      try {
        // Extract Chrome's session cookies and pass to yt-dlp for authenticated download
        const cookiesResult = await client.Network.getAllCookies();
        const cookieLines = cookiesResult.cookies
          .filter(c => c.domain.includes('instagram.com'))
          .map(c => [
            c.domain.startsWith('.') ? c.domain : '.' + c.domain,
            'TRUE',
            c.path || '/',
            c.secure ? 'TRUE' : 'FALSE',
            Math.floor(c.expires > 0 ? c.expires : Date.now() / 1000 + 86400),
            c.name,
            c.value
          ].join('\t'))
          .join('\n');

        const cookiesTempDir = mkdtempSync(join(tmpdir(), 'ig-research-'));
        const cookiesFile = join(cookiesTempDir, 'cookies.txt');
        try {
          writeFileSync(cookiesFile, '# Netscape HTTP Cookie File\n' + cookieLines, { mode: 0o600 });
          await execAsync(
          `python3 -m yt_dlp --cookies "${cookiesFile}" --format "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --retries 0 --fragment-retries 0 --no-warnings --quiet -o "${videoFile}" "${postUrl}"`,
          { timeout: 60000 }
          );
        } finally {
          rmSync(cookiesTempDir, { recursive: true, force: true });
        }
        post.hasVideo = existsSync(videoFile);
      } catch (e) {
        if (/429|too many requests|login required|log in|captcha|rate.limit|challenge/i.test(String(e.stderr || '') + e.message)) {
          console.error('STOP scraping: download encountered login/challenge/rate limit.');
          await client.close();
          process.exit(2);
        }
        post.hasVideo = false;
        post.videoError = String(e.stderr || e.message).replace(/\s+/g, " ").slice(-1000);
      }
    } else {
      post.hasVideo = true;
    }
    post.hasAudio = post.hasVideo;
  }

  return post;
}

function parseCount(value) {
  const match = String(value ?? '').trim().match(/^([\d,]+(?:\.\d+)?)\s*([KM])?$/i);
  if (!match) return null;
  const multiplier = { K: 1000, M: 1000000 }[match[2]?.toUpperCase()] || 1;
  const count = Math.round(Number(match[1].replace(/,/g, '')) * multiplier);
  return Number.isFinite(count) ? count : null;
}

function correctedLikes(post) {
  const context = String(post.likesContext || '').trim();
  const others = context.match(/^Liked by\s+.+?\s+and\s+([\d,.]+\s*[KM]?)\s+others?$/i);
  if (others) {
    const count = parseCount(others[1]);
    if (count !== null) return count + 1;
  }
  for (const value of [context, post.likesFromBtn, post.likes]) {
    const match = String(value || '').trim().match(/^([\d,.]+\s*[KM]?)\s+likes?$/i);
    if (match) {
      const count = parseCount(match[1]);
      if (count !== null) return count;
    }
  }
  // Only trust bare counts already normalized by processPost, not old rawNumbers.
  return Number.isFinite(post.likesNum) && post.likesNum >= 0 ? post.likesNum : null;
}

function parseEngagement(post) {
  return correctedLikes(post) ?? 0;
}

(async () => {
  try {
    let client = await getClient();
    const allPosts = [];

    for (const term of config.searchTerms) {
      console.log(`\n========================================`);
      console.log(`  Searching: "${term}"`);
      console.log(`========================================`);

      const links = await collectSearchPosts(client, term, config.maxPostsPerSearch || 50);
      console.log(`  Found ${links.length} posts\n`);

      for (let i = 0; i < links.length; i++) {
        const postId = links[i].match(/\/(p|reel)\/([\w-]+)/)?.[2] || '';
        process.stdout.write(`  [${i + 1}/${links.length}] ${postId} — `);

        const post = await processPost(client, links[i], `search:${term}`);
        if (post.skipped) {
          console.log('skipped (done)');
        } else {
          const eng = post.likes || 'no data';
          const ss = post.hasScreenshots ? 'ss' : '';
          const audio = post.hasAudio ? 'audio' : '';
          console.log(`[${post.type}] ${eng} ${[ss, audio].filter(Boolean).join(' ')}`);
          allPosts.push(post);
        }
      }
    }

    for (const profileUrl of (config.competitors || [])) {
      const handle = profileUrl.match(/instagram\.com\/([^/]+)/)?.[1] || profileUrl;
      console.log(`\n========================================`);
      console.log(`  Competitor: @${handle}`);
      console.log(`========================================`);

      const links = await collectProfilePosts(client, profileUrl, config.maxCompetitorPosts || 10);
      console.log(`  Found ${links.length} posts\n`);

      for (let i = 0; i < links.length; i++) {
        const postId = links[i].match(/\/(p|reel)\/([\w-]+)/)?.[2] || '';
        process.stdout.write(`  [${i + 1}/${links.length}] ${postId} — `);

        let post;
        try {
          post = await processPost(client, links[i], `competitor:@${handle}`);
        } catch (e) {
          if (e.message && e.message.includes('WebSocket')) {
            console.log('reconnecting...');
            try { await client.close(); } catch (_) {}
            client = await getClientWithRetry();
            post = await processPost(client, links[i], `competitor:@${handle}`);
          } else {
            console.log(`error: ${e.message}`);
            continue;
          }
        }

        if (post.skipped) {
          console.log('skipped (done)');
        } else {
          const eng = post.likes || 'no data';
          const video = post.hasVideo ? 'video' : '';
          const ss = post.hasScreenshots ? 'ss' : '';
          console.log(`[${post.type}] ${eng} ${[ss, video].filter(Boolean).join(' ')}`);
          allPosts.push(post);
        }
      }
    }

    const seen = new Set();
    const unique = allPosts.filter(p => {
      const key = p.href || p.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => parseEngagement(b) - parseEngagement(a));

    const output = {
      project: config.name,
      niche: config.niche,
      scrapedAt: new Date().toISOString(),
      searchTerms: config.searchTerms,
      competitors: config.competitors,
      totalPosts: unique.length,
      reels: unique.filter(p => p.type === 'reel').length,
      images: unique.filter(p => p.type === 'image').length,
      posts: unique
    };

    writeFileSync(outputFile, JSON.stringify(output, null, 2));

    console.log(`\n========================================`);
    console.log(`  Complete!`);
    console.log(`  Total: ${unique.length} unique posts`);
    console.log(`  Reels: ${output.reels} | Images: ${output.images}`);
    console.log(`  Screenshots: ${hooksDir}`);
    console.log(`  Audio: ${transcriptsDir}`);
    console.log(`  Data: ${outputFile}`);
    console.log(`========================================`);

    await client.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
