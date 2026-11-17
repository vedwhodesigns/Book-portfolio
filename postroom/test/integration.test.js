// End-to-end: real Postgres (TEST_DATABASE_URL), fake platform APIs via a mocked fetch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postgres from 'postgres';

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && 'set TEST_DATABASE_URL to run integration tests';
Object.assign(process.env, {
  DATABASE_URL: URL_ || '', ENCRYPTION_KEY: 'k', SESSION_SECRET: 's', APP_URL: 'https://app.test', APP_PASSWORD: 'pw',
  CRON_SECRET: 'cron', MCP_KEY: 'mcpkey', IG_APP_ID: 'x', IG_APP_SECRET: 'y', GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'h',
  TIKTOK_CLIENT_KEY: 't', TIKTOK_CLIENT_SECRET: 'u', RESEARCH_KEY: 'rk', STORAGE: 'local', LOCAL_MEDIA_DIR: '/var/tmp/pr-test-media',
});
const MB = 1024 * 1024;
const VIDEO_SIZE = 70 * MB + 5;

// ---------- fake platforms ----------
const calls = [];
const state = { igStatusPolls: 0, ytReceived: 0, ttChunks: [], ttPolls: 0, igFail: null, ytFailOnce: false };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
async function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = init.method || 'GET';
  calls.push(`${method} ${url.host}${url.pathname}`);
  const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (url.host === 'media.test') {
    const size = url.pathname.endsWith('.mp4') ? VIDEO_SIZE : 1000;
    const m = /bytes=(\d+)-(\d+)/.exec(h.range || '');
    const [s, e] = m ? [Number(m[1]), Math.min(Number(m[2]), size - 1)] : [0, size - 1];
    return new Response(Buffer.alloc(e - s + 1, 7), { status: m ? 206 : 200 });
  }
  // Meta Unified login (graph.facebook.com)
  if (url.host === 'graph.facebook.com') {
    const p = url.pathname.replace(/^\/v[\d.]+\//, '');
    if (p === 'oauth/access_token') {
      assert.equal(url.searchParams.get('client_id'), '999');
      return json({ access_token: 'bisu-token', token_type: 'bearer' });
    }
    if (p === 'me') return json({ client_business_id: 'cb1', id: 'su1' });
    if (p.endsWith('/messages') && method === 'POST') {
      const f = new URLSearchParams(String(init.body));
      const recipient = JSON.parse(f.get('recipient'));
      const message = JSON.parse(f.get('message'));
      (state.sent ||= []).push({ recipient, text: message.text });
      return json({ recipient_id: recipient.id || 'igsid-commenter', message_id: `m_out_${state.sent.length}` });
    }
    if (p.endsWith('/replies') && method === 'POST') { state.publicReplies = (state.publicReplies || 0) + 1; return json({ id: 'reply1' }); }
    if (p.endsWith('/subscribed_apps') && method === 'POST') { state.subscribed = (state.subscribed || 0) + 1; return json({ success: true }); }
    if (p === 'igsid-1') return json({ username: 'fan.one', name: 'Fan One' });
    if (p === 'me/assigned_instagram_accounts') return json({ data: [{ id: '17841400000000001', username: 'brand.one' }, { id: '17841400000000002', username: 'brand.two' }] });
    if (/^1784140000000000[12]$/.test(p)) return json({ id: p, username: p.endsWith('1') ? 'brand.one' : 'brand.two', name: 'Brand', followers_count: 1234 });
    if (p.endsWith('content_publishing_limit')) return json({ data: [{ quota_usage: 0, config: { quota_total: 100 } }] });
    if (p.endsWith('/media') && method === 'POST') { state.fbPublish = true; return json({ id: 'fbcontainer' }); }
    if (p === 'fbcontainer') return json({ status_code: 'FINISHED' });
    if (p.endsWith('/media_publish')) return json({ id: 'fbmedia1' });
    if (p === 'fbmedia1') return json({ permalink: 'https://www.instagram.com/reel/unified/' });
  }
  // Instagram
  if (url.host === 'graph.instagram.com') {
    const p = url.pathname.replace(/^\/v[\d.]+\//, '');
    if (state.igFail) return json({ error: state.igFail }, 400);
    if (p.endsWith('content_publishing_limit')) return json({ data: [{ quota_usage: 2, config: { quota_total: 100 } }] });
    if (p.endsWith('/media') && method === 'POST') return json({ id: 'container1' });
    if (p === 'container1') return json({ status_code: ++state.igStatusPolls < 2 ? 'IN_PROGRESS' : 'FINISHED' });
    if (p.endsWith('/media_publish')) return json({ id: 'igmedia1' });
    if (p === 'igmedia1') return json({ permalink: 'https://www.instagram.com/reel/abc/' });
    if (p === 'igmedia1/insights') return json({ data: [{ name: 'views', values: [{ value: 1200 }] }, { name: 'likes', values: [{ value: 80 }] }, { name: 'reach', values: [{ value: 900 }] }] });
    if (p === 'me') return json({ followers_count: 5100 });
  }
  // Google / YouTube
  if (url.host === 'oauth2.googleapis.com') return json({ access_token: 'yt-new', expires_in: 3600 });
  if (url.host === 'www.googleapis.com' && url.pathname === '/upload/youtube/v3/videos') {
    const meta = JSON.parse(init.body);
    assert.equal(meta.status.selfDeclaredMadeForKids, false);
    assert.match(meta.snippet.description, /#Shorts/);
    assert.equal(h.authorization, 'Bearer yt-new', 'uses refreshed token');
    return new Response('', { status: 200, headers: { location: 'https://yt.upload.test/session1' } });
  }
  if (url.host === 'yt.upload.test') {
    if (state.ytFailOnce) { state.ytFailOnce = false; return json({ error: { message: 'backend', errors: [{ reason: 'backendError' }] } }, 503); }
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(h['content-range']);
    if (!m) return new Response('', { status: 308, headers: state.ytReceived ? { range: `bytes=0-${state.ytReceived - 1}` } : {} });
    assert.equal(Number(m[1]), state.ytReceived, 'chunks arrive in order');
    state.ytReceived = Number(m[2]) + 1;
    if (state.ytReceived < Number(m[3])) return new Response('', { status: 308, headers: { range: `bytes=0-${state.ytReceived - 1}` } });
    return json({ id: 'ytvid1' }, 201);
  }
  if (url.host === 'www.googleapis.com' && url.pathname === '/youtube/v3/videos' && url.searchParams.get('part') === 'statistics') return json({ items: [{ id: 'ytvid1', statistics: { viewCount: '3000', likeCount: '150', commentCount: '12' } }] });
  if (url.host === 'www.googleapis.com' && url.pathname === '/youtube/v3/channels' && url.searchParams.get('forHandle')) {
    assert.equal(url.searchParams.get('forHandle'), '@someone');
    return json({ items: [{ id: 'UCother', snippet: { title: 'Someone', customUrl: '@someone', thumbnails: {} }, statistics: { subscriberCount: '50000', viewCount: '9000000', videoCount: '2' }, contentDetails: { relatedPlaylists: { uploads: 'UUother' } } }] });
  }
  if (url.host === 'www.googleapis.com' && url.pathname === '/youtube/v3/channels') return json({ items: [{ statistics: { subscriberCount: '880' } }] });
  if (url.host === 'www.googleapis.com' && url.pathname === '/youtube/v3/playlistItems') return json({ items: [{ contentDetails: { videoId: 'v1' } }, { contentDetails: { videoId: 'v2' } }] });
  if (url.host === 'www.googleapis.com' && url.pathname === '/youtube/v3/videos' && url.searchParams.get('part').includes('snippet')) {
    return json({ items: [
      { id: 'v1', snippet: { title: 'Short one', description: '', publishedAt: '2026-11-01T00:00:00Z', thumbnails: { medium: { url: 'https://i.ytimg.test/v1.jpg' } } }, statistics: { viewCount: '120000', likeCount: '4000', commentCount: '90' }, contentDetails: { duration: 'PT45S' } },
      { id: 'v2', snippet: { title: 'Long one', description: 'desc', publishedAt: '2026-10-01T00:00:00Z', thumbnails: {} }, statistics: { viewCount: '30000', likeCount: '900', commentCount: '40' }, contentDetails: { duration: 'PT12M3S' } },
    ] });
  }
  // TikTok
  if (url.host === 'open.tiktokapis.com') {
    const ok = (data) => json({ data, error: { code: 'ok', message: '' } });
    if (url.pathname === '/v2/post/publish/creator_info/query/') return ok({ creator_username: 'ttuser', privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], max_video_post_duration_sec: 600 });
    if (url.pathname === '/v2/post/publish/video/init/') {
      const b = JSON.parse(init.body);
      assert.equal(b.post_info.privacy_level, 'PUBLIC_TO_EVERYONE');
      assert.equal(b.source_info.video_size, VIDEO_SIZE);
      state.ttPlan = b.source_info;
      return ok({ publish_id: 'pub1', upload_url: 'https://tt.upload.test/u1' });
    }
    if (url.pathname === '/v2/post/publish/status/fetch/') return ok(++state.ttPolls < 2 ? { status: 'PROCESSING_UPLOAD' } : { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7311] });
    if (url.pathname === '/v2/video/query/') return ok({ videos: [{ id: '7311', view_count: 9000, like_count: 700, comment_count: 30, share_count: 44 }] });
    if (url.pathname === '/v2/user/info/') return ok({ user: { follower_count: 12000 } });
  }
  if (url.host === 'tt.upload.test') {
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(h['content-range']);
    state.ttChunks.push([Number(m[1]), Number(m[2])]);
    return new Response('', { status: Number(m[2]) + 1 === Number(m[3]) ? 201 : 206 });
  }
  throw new Error(`unmocked ${method} ${url}`);
}

let sql, core, posts, publisher, accounts, analytics, mcp, router;
before(async () => {
  if (skip) return;
  sql = postgres(URL_, { onnotice: () => {}, transform: { undefined: null } });
  await sql.unsafe('drop schema if exists postroom cascade');
  for (const f of ['001_base.sql', '002_multiplatform.sql', '003_research.sql', '004_inbox.sql']) await sql.unsafe(fs.readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8'));
  globalThis.fetch = fakeFetch;
  core = await import('../api/_lib/core.js');
  posts = await import('../api/_lib/posts.js');
  publisher = await import('../api/_lib/publisher.js');
  accounts = await import('../api/_lib/accounts.js');
  analytics = await import('../api/_lib/analytics.js');
  mcp = await import('../api/_lib/mcp.js');
  router = (await import('../api/router.js')).default;
  const enc = core.encrypt;
  await sql`insert into postroom.accounts ${sql([
    { id: '00000000-0000-0000-0000-00000000000a', platform: 'instagram', external_id: '1789', ig_user_id: '1789', username: 'crimearchives', access_token_enc: enc('ig-tok'), token_expires_at: new Date(Date.now() + 50 * 864e5) },
    { id: '00000000-0000-0000-0000-00000000000b', platform: 'youtube', external_id: 'UC1', username: 'crimearchivesyt', access_token_enc: enc('yt-old'), refresh_token_enc: enc('yt-refresh'), token_expires_at: new Date(Date.now() - 1000) },
    { id: '00000000-0000-0000-0000-00000000000c', platform: 'tiktok', external_id: 'open1', username: 'ttuser', profile_url: 'https://www.tiktok.com/@ttuser', access_token_enc: enc('tt-tok'), refresh_token_enc: enc('tt-r'), token_expires_at: new Date(Date.now() + 20 * 3600e3) },
  ], 'id', 'platform', 'external_id', 'ig_user_id', 'username', 'profile_url', 'access_token_enc', 'refresh_token_enc', 'token_expires_at')}`;
  await sql`insert into postroom.media ${sql([
    { id: '00000000-0000-0000-0000-0000000000f1', url: 'https://media.test/v.mp4', pathname: 'v.mp4', kind: 'video', content_type: 'video/mp4', size_bytes: VIDEO_SIZE, width: 1080, height: 1920, duration_s: 45, filename: 'v.mp4' },
  ])}`;
});
after(async () => { if (sql) await sql.end(); if (core) await core.db().end(); });

async function drain(max = 30) {
  for (let i = 0; i < max; i++) {
    await sql`update postroom.posts set next_attempt_at = null where status = 'processing'`; // skip waits
    await publisher.tick({ budgetMs: 120000 });
    const left = await sql`select count(*)::int as n from postroom.posts where status = 'processing' or (status = 'scheduled' and scheduled_at <= now())`;
    if (!left[0].n) return i + 1;
  }
  throw new Error('posts did not finish');
}

test('cross-post one video to Instagram, YouTube and TikTok', { skip }, async () => {
  const bad = await posts.checkTargets({
    media_ids: ['00000000-0000-0000-0000-0000000000f1'],
    caption: 'The case nobody solved',
    targets: [{ account: 'tiktok:ttuser', options: { mode: 'direct' } }],
  });
  assert.equal(bad.ok, false, 'TikTok direct post needs a privacy choice');

  const r = await posts.createPosts({
    mode: 'now',
    media_ids: ['00000000-0000-0000-0000-0000000000f1'],
    caption: 'The case nobody solved\n\n#truecrime',
    targets: [
      { account: '@crimearchives' },
      { account: 'youtube:crimearchivesyt', options: { privacy: 'public', made_for_kids: false } },
      { account: 'tiktok:ttuser', options: { mode: 'direct', privacy_level: 'PUBLIC_TO_EVERYONE' } },
    ],
  });
  assert.equal(r.posts.length, 3);
  assert.ok(r.group_id);
  assert.deepEqual(r.posts.map((p) => p.kind).sort(), ['reel', 'short', 'video']);

  const ticks = await drain();
  const rows = await sql`select platform, status, permalink, external_id, error from postroom.posts order by platform`;
  for (const row of rows) assert.equal(row.status, 'published', `${row.platform}: ${row.error}`);
  const by = Object.fromEntries(rows.map((x) => [x.platform, x]));
  assert.equal(by.instagram.permalink, 'https://www.instagram.com/reel/abc/');
  assert.equal(by.youtube.permalink, 'https://www.youtube.com/shorts/ytvid1');
  assert.equal(by.tiktok.permalink, 'https://www.tiktok.com/@ttuser/video/7311');
  assert.equal(state.ytReceived, VIDEO_SIZE, 'YouTube got every byte');
  assert.equal(state.ttChunks.length, state.ttPlan.total_chunk_count);
  assert.equal(state.ttChunks.at(-1)[1], VIDEO_SIZE - 1, 'last TikTok chunk ends at the final byte');
  assert.ok(ticks >= 2, 'used more than one tick (polling)');
  const [yt] = await sql`select token_expires_at from postroom.accounts where platform = 'youtube'`;
  assert.ok(new Date(yt.token_expires_at) > Date.now(), 'YouTube token refreshed and saved');
});

test('analytics are collected and rolled up', { skip }, async () => {
  await sql`update postroom.posts set metrics_at = null`; // housekeeping may already have run during the ticks
  const m = await publisher.collectMetrics();
  assert.equal(m.updated, 3);
  const f = await publisher.collectFollowers();
  assert.equal(f.updated, 3);
  const o = await analytics.overview({ days: 7 });
  assert.equal(o.totals.posts, 3);
  assert.equal(o.totals.views, 1200 + 3000 + 9000);
  assert.equal(o.top_posts[0].platform, 'tiktok');
  assert.equal(o.by_platform.length, 3);
  assert.equal(o.followers.length, 3);
});

test('a revoked Instagram login fails the post and flags the account', { skip }, async () => {
  state.igFail = { message: 'Error validating access token', code: 190 };
  const r = await posts.createPosts({ mode: 'now', media_ids: ['00000000-0000-0000-0000-0000000000f1'], caption: 'x', targets: [{ account: 'instagram:crimearchives' }] });
  await publisher.tick({ budgetMs: 60000 });
  const [p] = await sql`select status, error from postroom.posts where id = ${r.posts[0].id}`;
  assert.equal(p.status, 'failed');
  assert.match(p.error, /access token/);
  state.igFail = null;
  // account flagged → new posts are rejected at check time
  await sql`update postroom.accounts set status = 'needs_reconnect' where platform = 'instagram'`;
  const c = await posts.checkTargets({ media_ids: ['00000000-0000-0000-0000-0000000000f1'], targets: [{ account: 'instagram:crimearchives' }] });
  assert.match(c.targets[0].errors[0], /reconnect/);
  await sql`update postroom.accounts set status = 'active' where platform = 'instagram'`;
});

test('a YouTube server error is retried, then the upload resumes', { skip }, async () => {
  state.ytReceived = 0;
  state.ytFailOnce = true;
  const r = await posts.createPosts({ mode: 'now', media_ids: ['00000000-0000-0000-0000-0000000000f1'], caption: 'Again', targets: [{ account: 'youtube:crimearchivesyt', options: { privacy: 'unlisted', made_for_kids: false } }] });
  await publisher.tick({ budgetMs: 60000 });
  let [p] = await sql`select status, attempts, next_attempt_at from postroom.posts where id = ${r.posts[0].id}`;
  assert.equal(p.status, 'processing');
  assert.equal(p.attempts, 1);
  assert.ok(p.next_attempt_at > new Date());
  await drain();
  [p] = await sql`select status from postroom.posts where id = ${r.posts[0].id}`;
  assert.equal(p.status, 'published');
});

test('editing, rescheduling, cancelling', { skip }, async () => {
  const when = new Date(Date.now() + 3 * 864e5).toISOString();
  const r = await posts.createPosts({ mode: 'schedule', scheduled_at: when, media_ids: ['00000000-0000-0000-0000-0000000000f1'], caption: 'later', targets: [{ account: 'instagram:crimearchives' }] });
  const id = r.posts[0].id;
  const u = await posts.updatePost(id, { caption: 'later, edited', scheduled_at: new Date(Date.now() + 4 * 864e5).toISOString() });
  assert.equal(u.caption, 'later, edited');
  await assert.rejects(posts.updatePost(id, { caption: '#a '.repeat(40) }), /hashtags/);
  await posts.cancelPost(id);
  await assert.rejects(posts.updatePost(id, { caption: 'x' }), /cancelled/);
  await posts.deletePost(id);
});

// ---------- HTTP layer ----------
function call(method, path, { body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b ? JSON.parse(b) : null }); },
    };
    router({ method, url: `/api/${path}`, headers, body, query: { ...Object.fromEntries(new URL(`http://x/api/${path}`).searchParams), __p: path.split('?')[0] } }, res);
  });
}

test('router: auth, cron secret, config', { skip }, async () => {
  assert.equal((await call('GET', 'accounts')).status, 401);
  assert.equal((await call('POST', 'login', { body: { password: 'nope' } })).status, 401);
  const ok = await call('POST', 'login', { body: { password: 'pw' } });
  assert.equal(ok.status, 200);
  const cookie = ok.headers['set-cookie'].split(';')[0];
  const cfg = await call('GET', 'config', { headers: { cookie } });
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.platforms.length, 3);
  assert.ok(cfg.body.platforms.every((p) => p.configured));
  const accs = await call('GET', 'accounts', { headers: { cookie } });
  assert.equal(accs.body.length, 3);
  assert.ok(!('access_token_enc' in accs.body[0]), 'tokens never leave the server');
  assert.equal((await call('POST', 'cron/tick', { headers: { 'x-cron-secret': 'wrong' } })).status, 401);
  assert.equal((await call('POST', 'cron/tick', { headers: { 'x-cron-secret': 'cron' } })).status, 200);
  const conn = await call('GET', 'connect/tiktok', { headers: { cookie } });
  assert.equal(conn.status, 302);
  assert.match(conn.headers.location, /^https:\/\/www\.tiktok\.com\/v2\/auth\/authorize\/\?client_key=t/);
  const bad = await call('GET', 'connect/tiktok/callback?state=forged&code=1', { headers: { cookie } });
  assert.match(decodeURIComponent(bad.headers.location), /expired/);
});

test('MCP: Claude plans posts, user approves', { skip }, async () => {
  const rpc = (msg) => call('POST', 'mcp/mcpkey', { body: msg });
  assert.equal((await call('POST', 'mcp/wrong', { body: {} })).status, 404);
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.body.result.serverInfo.name, 'postroom');
  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.ok(list.body.result.tools.some((t) => t.name === 'create_plan'));
  const when = new Date(Date.now() + 2 * 864e5).toISOString();
  const res = await rpc({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'create_plan', arguments: { title: 'Next week', note: 'Two cross-posts', posts: [{ media_ids: ['00000000-0000-0000-0000-0000000000f1'], caption: 'Episode 5', scheduled_at: when, targets: [{ account: 'instagram:crimearchives' }, { account: 'tiktok:ttuser', options: { mode: 'inbox' } }] }] } },
  });
  assert.ok(!res.body.result.isError, res.body.result.content[0].text);
  const out = JSON.parse(res.body.result.content[0].text);
  assert.equal(out.posts, 2);
  const plans = await posts.listPlans();
  assert.equal(plans.length, 1);
  assert.ok(plans[0].posts.every((p) => p.status === 'draft'));
  const a = await posts.approvePlan(out.plan_id);
  assert.equal(a.scheduled, 2);
  const err = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'check_posts', arguments: { media_ids: ['00000000-0000-0000-0000-0000000000f1'], targets: [{ account: 'nobody' }] } } });
  assert.equal(err.body.result.isError, true);
});

test('research: toolkit push, search, overview, MCP and YouTube lookup', { skip }, async () => {
  const td = (hook, views) => ({ teardown: { idea: { topic: 'Shelf view', format: 'Talking head' }, hook: { hook_type: hook, first_3s_spoken: 'Nobody looks at your logo.' }, replicate: { recipe_steps: ['Open wide', 'Claim', 'Prove'] } }, measure: { source: '/Users/x/a.mp4', cuts_per_10_seconds: 4.2 }, model: 'gemini' });
  const body = {
    project: { name: 'packaging', niche: 'Packaging design', searchTerms: ['packagingdesign'], competitors: [] },
    posts: [
      { postId: 'A1', author: '@studio', type: 'reel', fullCaption: 'Logo myth', viewsNum: 90000, likesNum: 5000, transcript: 'nobody looks at your logo', thumb_b64: Buffer.from('jpegbytes').toString('base64'), teardown: td('Contrarian', 90000) },
      { postId: 'A2', author: 'studio', type: 'reel', caption: 'Second', viewsNum: 10000, likesNum: 300, teardown: td('Question', 10000) },
      { postId: 'B1', author: 'other', type: 'image', caption: 'Carousel', likesNum: 800 },
    ],
  };
  assert.equal((await call('POST', 'research/ingest', { body, headers: { authorization: 'Bearer nope' } })).status, 401);
  const r1 = await call('POST', 'research/ingest', { body, headers: { authorization: 'Bearer rk' } });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.saved, 3);
  await call('POST', 'research/ingest', { body, headers: { authorization: 'Bearer rk' } }); // idempotent
  const research = await import('../api/_lib/research.js');
  const [{ n }] = await sql`select count(*)::int as n from postroom.research_posts`;
  assert.equal(n, 3);
  const [leak] = await sql`select count(*)::int as n from postroom.research_posts where measure ? 'source'`;
  assert.equal(leak.n, 0, 'local file paths are stripped');
  const o = await research.projectOverview(r1.body.project_id);
  assert.equal(o.stats.posts, 3);
  assert.equal(o.creators[0].author, 'studio');
  assert.equal(o.hooks[0].hook_type, 'Contrarian');
  const found = await research.searchPosts({ q: 'logo' });
  assert.equal(found[0].external_id, 'A1');
  assert.equal((await research.searchPosts({ hook_type: 'Question' }))[0].external_id, 'A2');
  const full = await research.getResearchPost(found[0].id);
  assert.match(research.inspirationBrief(full), /Contrarian/);

  const rpc = (msg) => call('POST', 'mcp/mcpkey', { body: msg });
  const s = await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'research_search', arguments: { author: '@studio', sort: 'views' } } });
  assert.equal(JSON.parse(s.body.result.content[0].text).length, 2);

  const yt = await rpc({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'research_youtube_channel', arguments: { channel: 'https://www.youtube.com/@someone' } } });
  assert.ok(!yt.body.result.isError, yt.body.result.content[0].text);
  const out = JSON.parse(yt.body.result.content[0].text);
  assert.equal(out.videos, 2);
  assert.equal(out.subscribers, 50000);
  const vids = await research.searchPosts({ project_id: out.project_id });
  assert.deepEqual(vids.map((v) => [v.external_id, v.type, v.views]), [['v1', 'short', 120000], ['v2', 'video', 30000]]);
});

test('settings stored in the database: save, apply, Vercel values win', { skip }, async () => {
  const login = await call('POST', 'login', { body: { password: 'pw' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const saved = await call('POST', 'settings', { body: { TIKTOK_AUDITED: 'true', ANTHROPIC_API_KEY: 'sk-test' }, headers: { cookie } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.settings.TIKTOK_AUDITED, 'postroom');
  const cfg = await call('GET', 'config', { headers: { cookie } });
  assert.equal(cfg.body.audited.tiktok, true);
  assert.equal(cfg.body.ai, true);
  assert.equal(cfg.body.settings.IG_APP_ID, 'vercel');
  assert.equal((await call('POST', 'settings', { body: { IG_APP_ID: 'x' }, headers: { cookie } })).status, 400, 'env vars win');
  assert.equal((await call('POST', 'settings', { body: { ENCRYPTION_KEY: 'x' }, headers: { cookie } })).status, 400, 'not editable');
  assert.equal((await call('POST', 'settings', { body: { TIKTOK_AUDITED: '' }, headers: { cookie } })).status, 200);
  await call('POST', 'settings', { body: { ANTHROPIC_API_KEY: '' }, headers: { cookie } });
  assert.equal((await call('GET', 'config', { headers: { cookie } })).body.audited.tiktok, false);
});

test('Instagram via Meta Unified login: one login connects several accounts and publishes', { skip }, async () => {
  const login = await call('POST', 'login', { body: { password: 'pw' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  assert.equal((await call('POST', 'settings', { body: { META_APP_ID: '999', META_APP_SECRET: 'sec', META_CONFIG_ID: 'cfg1' }, headers: { cookie } })).status, 200);
  const start = await call('GET', 'connect/instagram', { headers: { cookie } });
  const loc = new URL(start.headers.location);
  assert.equal(loc.host, 'www.facebook.com');
  assert.equal(loc.searchParams.get('config_id'), 'cfg1');
  const back = await call('GET', `connect/instagram/callback?code=abc&state=${loc.searchParams.get('state')}`, { headers: { cookie } });
  assert.match(decodeURIComponent(back.headers.location), /connected=instagram:brand\.one, @brand\.two/);
  const rows = await sql`select username, meta->>'login' as login, meta->>'client_business_id' as cb, token_expires_at from postroom.accounts where meta->>'login' = 'unified' order by username`;
  assert.deepEqual(rows.map((r) => [r.username, r.login, r.cb]), [['brand.one', 'unified', 'cb1'], ['brand.two', 'unified', 'cb1']]);
  assert.equal(rows[0].token_expires_at, null, 'unified tokens do not expire');

  const r = await posts.createPosts({ mode: 'now', media_ids: ['00000000-0000-0000-0000-0000000000f1'], caption: 'via unified', targets: [{ account: 'instagram:brand.one' }] });
  await drain();
  const [p] = await sql`select status, permalink, error from postroom.posts where id = ${r.posts[0].id}`;
  assert.equal(p.status, 'published', p.error);
  assert.equal(p.permalink, 'https://www.instagram.com/reel/unified/');
  assert.ok(state.fbPublish, 'published through graph.facebook.com');
  await call('POST', 'settings', { body: { META_APP_ID: '', META_APP_SECRET: '', META_CONFIG_ID: '' }, headers: { cookie } });
});

test('Instagram inbox: webhooks, auto-replies, comment-to-DM, 24h window, drafts', { skip }, async () => {
  const crypto = await import('node:crypto');
  await core.saveSettings({ META_APP_SECRET: 'appsecret', META_WEBHOOK_VERIFY_TOKEN: 'vt123' });
  const inbox = await import('../api/_lib/inbox.js');
  const [acct] = await sql`select * from postroom.accounts where username = 'brand.one'`;
  assert.ok(acct, 'unified account from the previous test');

  // verification handshake
  const bad = await call('GET', 'webhooks/meta?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42');
  assert.equal(bad.status, 403);
  const ok = await new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: b }); } };
    router({ method: 'GET', url: '/api/webhooks/meta', headers: {}, query: { __p: 'webhooks/meta', 'hub.mode': 'subscribe', 'hub.verify_token': 'vt123', 'hub.challenge': '42' } }, res);
  });
  assert.deepEqual([ok.status, ok.body], [200, '42']);

  // automations
  await inbox.createRule({ kind: 'welcome', reply_text: 'Hi {username}, thanks for writing!' });
  await inbox.createRule({ kind: 'dm_keyword', keywords: 'price, cost', reply_text: 'Our price list: example' });
  await inbox.createRule({ kind: 'comment_keyword', keywords: ['LINK'], reply_text: 'Here is your link {username}', public_reply_text: 'Check your DMs!' });
  await assert.rejects(inbox.createRule({ kind: 'dm_keyword', keywords: '', reply_text: 'x' }), /keyword/);
  assert.equal(inbox.ruleMatches({ match: 'contains', keywords: ['link'] }, 'Send me the LINK please'), true);
  assert.equal(inbox.ruleMatches({ match: 'contains', keywords: ['link'] }, 'linkedin?'), false, 'whole words only');

  const post = async (payload, sig = true) => {
    const raw = JSON.stringify(payload);
    const h = sig ? `sha256=${crypto.createHmac('sha256', 'appsecret').update(raw).digest('hex')}` : 'sha256=bad';
    return call('POST', 'webhooks/meta', { body: raw, headers: { 'x-hub-signature-256': h } });
  };
  const now = Date.now();
  const dm = (mid, text) => ({ object: 'instagram', entry: [{ id: acct.external_id, time: Date.now(), messaging: [{ sender: { id: 'igsid-1' }, recipient: { id: acct.external_id }, timestamp: Date.now(), message: { mid, text } }] }] });

  assert.equal((await post(dm('m1', 'hello'), false)).status, 401, 'bad signature rejected');
  state.sent = [];
  assert.equal((await post(dm('m1', 'hello'))).status, 200);
  await post(dm('m1', 'hello')); // duplicate delivery is ignored
  assert.equal(state.sent.length, 1, 'welcome sent once');
  assert.match(state.sent[0].text, /Hi @fan\.one/);
  await post(dm('m2', 'what is the PRICE?'));
  assert.equal(state.sent.length, 2);
  assert.equal(state.sent[1].text, 'Our price list: example');

  // comment → private DM + public reply
  const comment = { object: 'instagram', entry: [{ id: acct.external_id, time: now, changes: [{ field: 'comments', value: { id: 'c123', text: 'LINK please', from: { id: 'igsid-9', username: 'commenter' }, media: { id: 'media1' } } }] }] };
  await post(comment);
  await post(comment);
  const last = state.sent.at(-1);
  assert.deepEqual(last.recipient, { comment_id: 'c123' });
  assert.equal(last.text, 'Here is your link @commenter');
  assert.equal(state.publicReplies, 1);
  const [c] = await sql`select dm_sent, public_replied from postroom.ig_comments where comment_id = 'c123'`;
  assert.deepEqual([c.dm_sent, c.public_replied], [true, true]);

  // threads via HTTP
  const login = await call('POST', 'login', { body: { password: 'pw' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const threads = (await call('GET', 'inbox/threads', { headers: { cookie } })).body;
  const t = threads.find((x) => x.username === 'fan.one');
  assert.ok(t && t.can_reply);
  const full = (await call('GET', `inbox/threads/${t.id}`, { headers: { cookie } })).body;
  assert.deepEqual(full.messages.map((m) => m.direction), ['in', 'out', 'in', 'out']);
  const r = await call('POST', `inbox/threads/${t.id}/reply`, { body: { text: 'Anything else?' }, headers: { cookie } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(state.sent.at(-1).text, 'Anything else?');

  // 24h window
  await sql`update postroom.dm_threads set last_inbound_at = now() - interval '25 hours' where id = ${t.id}`;
  const late = await call('POST', `inbox/threads/${t.id}/reply`, { body: { text: 'late' }, headers: { cookie } });
  assert.equal(late.status, 409);

  // Claude drafts through MCP are saved, never sent
  const before = state.sent.length;
  const d = await call('POST', 'mcp/mcpkey', { body: { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'draft_dm_reply', arguments: { id: t.id, text: 'Happy to help!' } } } });
  assert.ok(!d.body.result.isError, d.body.result.content[0].text);
  assert.equal(state.sent.length, before);
  const [dt] = await sql`select draft_text, draft_by from postroom.dm_threads where id = ${t.id}`;
  assert.deepEqual([dt.draft_text, dt.draft_by], ['Happy to help!', 'claude']);
  const auto = await call('POST', 'mcp/mcpkey', { body: { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'create_automation', arguments: { kind: 'dm_keyword', keywords: ['hours'], reply_text: 'We are open 9–5' } } } });
  assert.equal(JSON.parse(auto.body.result.content[0].text).enabled, false, 'Claude-created automations start OFF');

  // subscribing accounts to webhooks
  const sub = await call('POST', 'inbox/subscribe', { headers: { cookie } });
  assert.ok(sub.body.some((x) => x.ok));
});
