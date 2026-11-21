// MCP server (Streamable HTTP, stateless JSON-RPC) so Claude can plan and manage posts.
// URL: {APP_URL}/api/mcp/{MCP_KEY}. Anything Claude schedules lands as a *plan* that you
// approve in the app, unless you set MCP_AUTO_APPROVE=true.
import { updateBrand } from './brand.js';
import * as planner from './planner.js';
import { send, body, env, localLabel, TZ } from './core.js';
import { listAccounts } from './accounts.js';
import { listMedia, importFromUrl } from './media.js';
import { checkTargets, summariseCheck, createPosts, listPosts, getPost, updatePost, schedulePost, cancelPost, listPlans, findAccount } from './posts.js';
import { overview } from './analytics.js';
import { KIND_LABEL } from './platforms/index.js';
import { listProjects, projectOverview, searchPosts, getResearchPost, lookupYoutube, lookupInstagram, inspirationBrief } from './research.js';
import * as inbox from './inbox.js';

const PROTOCOL = '2025-06-18';

const target = {
  type: 'object',
  properties: {
    account: { type: 'string', description: 'Account id, @username, or platform:username (e.g. youtube:mychannel).' },
    kind: { type: 'string', enum: ['image', 'carousel', 'reel', 'story', 'short', 'video'], description: 'Optional. Defaults: Instagram reel/image/carousel, YouTube short (≤3 min vertical) or video, TikTok video.' },
    caption: { type: 'string', description: 'Overrides the shared caption for this account.' },
    title: { type: 'string', description: 'YouTube title (≤100 chars). Defaults to the caption\'s first line.' },
    scheduled_at: { type: 'string', description: 'Overrides the shared time for this account (or "next_slot").' },
    options: {
      type: 'object',
      description: 'Platform options. YouTube: {privacy: public|unlisted|private, made_for_kids: boolean (required), tags: string[], category_id (e.g. "22" People & Blogs, "24" Entertainment, "25" News & Politics, "27" Education, "28" Science & Technology), playlist_id, first_comment, synthetic: boolean (AI-altered realistic content), notify_subscribers: boolean, language: e.g. "en"}. TikTok: {mode: direct|inbox, privacy_level: PUBLIC_TO_EVERYONE|MUTUAL_FOLLOW_FRIENDS|FOLLOWER_OF_CREATOR|SELF_ONLY (required for direct), disable_comment, disable_duet, disable_stitch, brand_content, brand_organic, is_aigc}. Instagram: {share_to_feed: boolean (reels), collaborators: up to 3 usernames, user_tags: usernames to tag, alt_text (image) or alt_texts: {media_id: text} (carousel), audio_name (reels), thumb_offset_ms (reel cover frame), trial: "manual"|"auto" (trial reel), ai_generated: boolean, first_comment}.',
    },
    cover_media_id: { type: 'string', description: 'Optional image (library id) for this account only: Instagram reel cover (9:16, 1080×1920) or YouTube thumbnail (16:9, 1280×720; cropped/compressed automatically). Overrides the shared cover. For a reel cover frame instead, use options.thumb_offset_ms.' },
    media_ids: { type: 'array', items: { type: 'string' }, description: 'Optional: different media for this account only (e.g. a video for YouTube while Instagram gets images). YouTube only accepts videos.' },
  },
  required: ['account'],
};
const postInput = {
  media_ids: { type: 'array', items: { type: 'string' }, description: 'Media library ids, in order (carousel order).' },
  cover_media_id: { type: 'string', description: 'Optional image used as reel cover / YouTube thumbnail.' },
  idea_id: { type: 'string', description: 'Optional planner idea this post comes from; the idea moves to Scheduled, then Posted.' },
  caption: { type: 'string', description: 'Shared caption used for every account unless overridden.' },
  title: { type: 'string', description: 'Shared YouTube title.' },
  scheduled_at: { type: 'string', description: `When to post: ISO time with offset, wall-clock "YYYY-MM-DDTHH:mm" in ${TZ()}, or "next_slot" for each account's next free posting slot.` },
  targets: { type: 'array', items: target, description: 'One entry per account to post to (cross-posting).' },
};

const TOOLS = [
  { name: 'list_accounts', description: 'List connected Instagram, YouTube and TikTok accounts with status, counts, brand kit (tone, audience, sign-off, hashtag sets, dos/don\'ts, defaults) and posting slots. Always follow an account\'s brand kit when writing its captions.', inputSchema: { type: 'object', properties: { platform: { type: 'string', enum: ['instagram', 'youtube', 'tiktok'] } } } },
  {
    name: 'update_brand_kit',
    description: 'Save an account\'s brand kit and/or posting slots, as the user describes them. brand fields are merged into the existing kit. slots replace the existing slots.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Account id, @username or platform:username.' },
        brand: { type: 'object', description: '{ tone, audience, language, cta, signoff, dos, donts, notes, hashtag_sets: [{ name, tags: ["#a", "#b"] }], defaults: { category_id, playlist_id, privacy, ... } }' },
        slots: { type: 'array', items: { type: 'object', properties: { days: { type: 'array', items: { type: 'number' }, description: '1 = Monday … 7 = Sunday; omit for every day' }, time: { type: 'string', description: '"19:00" in the app time zone' } }, required: ['time'] } },
      },
      required: ['account'],
    },
  },
  { name: 'list_media', description: 'List the media library (newest first) with ids, type, size, dimensions and duration.', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'import_media', description: 'Download an image or video from a direct public URL into the media library.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, filename: { type: 'string' } }, required: ['url'] } },
  { name: 'check_posts', description: 'Dry-run: check a cross-post against each platform\'s rules (lengths, formats, durations) without saving.', inputSchema: { type: 'object', properties: postInput, required: ['media_ids', 'targets'] } },
  {
    name: 'create_plan',
    description: 'Propose posts. They are saved as a plan the user approves in Postroom before anything is published. Use one entry in `posts` per piece of content; each can target several accounts.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Plan name, e.g. "Week of 24 Nov".' },
        note: { type: 'string', description: 'Why this plan — shown to the user.' },
        posts: { type: 'array', items: { type: 'object', properties: postInput, required: ['media_ids', 'targets', 'scheduled_at'] } },
      },
      required: ['title', 'posts'],
    },
  },
  { name: 'list_plans', description: 'List plans waiting for approval.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'list_posts',
    description: 'List posts in a time range (calendar), optionally filtered.',
    inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, status: { type: 'string', description: 'Comma list: draft,scheduled,processing,published,failed,cancelled' }, platform: { type: 'string' } } },
  },
  { name: 'get_post', description: 'Get one post with its log, media and analytics history.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  {
    name: 'update_post',
    description: 'Edit a draft, scheduled or failed post (caption, title, time, options).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, caption: { type: 'string' }, title: { type: 'string' }, scheduled_at: { type: 'string' }, options: { type: 'object' } }, required: ['id'] },
  },
  {
    name: 'schedule_post',
    description: 'Schedule a DRAFT post so it publishes automatically. By default every draft in the same cross-post (e.g. its Instagram and YouTube versions) is scheduled together. Use this instead of re-creating a post. To only change the time of an already-scheduled post, use update_post.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Any one post id of the draft' }, scheduled_at: { type: 'string', description: 'Optional new time (ISO with offset, wall-clock "YYYY-MM-DDTHH:mm" in the app time zone, or "next_slot"); omit to keep the draft\'s time.' }, group: { type: 'boolean', description: 'Also schedule the other drafts of the same cross-post (default true).' } }, required: ['id'] },
  },
  { name: 'cancel_post', description: 'Cancel a draft, scheduled or failed post.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  {
    name: 'get_analytics',
    description: 'Views, likes, comments, shares per platform and account, top posts and best posting hours.',
    inputSchema: { type: 'object', properties: { days: { type: 'number' }, platform: { type: 'string' } } },
  },
  // ---- Research extension ----
  { name: 'research_projects', description: 'List research projects: Instagram niche/competitor research pushed from the ig-research toolkit, and YouTube channels looked up via the API.', inputSchema: { type: 'object', properties: {} } },
  { name: 'research_overview', description: 'One research project: stats, creator leaderboard (median views, top hook), which hook types perform best, common formats.', inputSchema: { type: 'object', properties: { project_id: { type: 'string' } }, required: ['project_id'] } },
  {
    name: 'research_search',
    description: 'Search researched posts (captions, transcripts, teardowns). Filter by creator, hook type or format; sort by views, likes, comments, recent, or pace (cuts per 10s).',
    inputSchema: { type: 'object', properties: { project_id: { type: 'string' }, q: { type: 'string' }, author: { type: 'string' }, hook_type: { type: 'string' }, format: { type: 'string' }, type: { type: 'string', enum: ['reel', 'image', 'short', 'video'] }, teardown_only: { type: 'boolean' }, sort: { type: 'string', enum: ['views', 'likes', 'comments', 'recent', 'pace'] }, limit: { type: 'number' } } },
  },
  { name: 'research_post', description: 'Full detail of one researched post: transcript, the full teardown (idea, hook, script beats, edit, sound, recipe) and measured pacing/loudness, plus an inspiration brief.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'research_youtube_channel', description: 'Analyse any public YouTube channel (by @handle, URL or channel id) through the official API: subscribers and its latest videos with views/likes/comments. Saved as a research project.', inputSchema: { type: 'object', properties: { channel: { type: 'string' }, limit: { type: 'number' } }, required: ['channel'] } },
  { name: 'research_instagram_account', description: 'Analyse any public Instagram Business/Creator account (by @username) through the official Business Discovery API: followers, its latest posts with likes/comments, and its most-used hashtags with average engagement. Saved as a research project.', inputSchema: { type: 'object', properties: { username: { type: 'string' }, limit: { type: 'number' } }, required: ['username'] } },
  // ---- Planner: references, mood boards, ideas, series ----
  { name: 'plan_overview', description: 'Planning snapshot: brands (with their accounts), series (episodes, what comes next), ideas grouped by stage (idea → scripting → producing → ready → scheduled → posted), mood boards and reference counts. Start here when planning content.', inputSchema: { type: 'object', properties: { brand: { type: 'string', description: 'e.g. "The Crime Archives"' } } } },
  {
    name: 'save_reference',
    description: 'Save a reference to the planner library: a link (Instagram/YouTube/TikTok/web — title and thumbnail are fetched), a post found with the research tools (research_post_id), a colour, or a note. Set suggest=true when YOU are proposing it (it lands in "Suggested by Claude" for the owner to keep or discard); leave it false when the owner asked you to save it. Tags describe why it is useful: hook, pacing, edit, lighting, thumbnail, cover, caption, colour, font, sound, format, transition…',
    inputSchema: { type: 'object', properties: {
      url: { type: 'string' }, research_post_id: { type: 'string' }, note: { type: 'string', description: 'Why it is a good reference / what to take from it' },
      color: { type: 'string', description: 'Hex colour for a palette swatch' }, title: { type: 'string' }, brand: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } }, suggest: { type: 'boolean' }, board_id: { type: 'string', description: 'Also pin it on this mood board' }, idea_id: { type: 'string', description: 'Attach it to this idea' },
    } },
  },
  { name: 'list_references', description: 'Search the reference library (kept by default; status "suggested" for pending suggestions).', inputSchema: { type: 'object', properties: { brand: { type: 'string' }, tag: { type: 'string' }, q: { type: 'string' }, status: { type: 'string', enum: ['kept', 'suggested', 'all'] }, limit: { type: 'number' } } } },
  { name: 'create_board', description: 'Create a mood board (for a brand, a series or one idea).', inputSchema: { type: 'object', properties: { name: { type: 'string' }, brand: { type: 'string' }, description: { type: 'string' }, series_id: { type: 'string' }, idea_id: { type: 'string', description: 'Make this the idea\'s board' } }, required: ['name'] } },
  { name: 'get_board', description: 'Read a mood board and everything pinned on it.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  {
    name: 'add_to_board',
    description: 'Pin things on a mood board: saved references (ref_ids), a sticky note, a colour swatch, or a link.',
    inputSchema: { type: 'object', properties: { board_id: { type: 'string' }, ref_ids: { type: 'array', items: { type: 'string' } }, note: { type: 'string' }, color: { type: 'string' }, link: { type: 'string' } }, required: ['board_id'] },
  },
  { name: 'list_ideas', description: 'List ideas, optionally by brand, stage (comma-separated) or series.', inputSchema: { type: 'object', properties: { brand: { type: 'string' }, stage: { type: 'string' }, series_id: { type: 'string' }, q: { type: 'string' } } } },
  { name: 'get_idea', description: 'One idea with its hook, script notes, references, board and linked posts.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  {
    name: 'create_idea',
    description: 'File a new post idea in the pipeline. For a What Would You Do episode give choice_a/choice_b. Episode numbers fill in automatically within a series.',
    inputSchema: { type: 'object', properties: {
      title: { type: 'string' }, brand: { type: 'string' }, series_id: { type: 'string' }, episode: { type: 'number' },
      stage: { type: 'string', enum: ['idea', 'scripting', 'producing', 'ready'] }, hook: { type: 'string' }, notes: { type: 'string', description: 'Script, beats, shot list' },
      choice_a: { type: 'string' }, choice_b: { type: 'string' }, formats: { type: 'array', items: { type: 'string' } }, due_date: { type: 'string', description: 'YYYY-MM-DD' },
      board_id: { type: 'string' }, ref_ids: { type: 'array', items: { type: 'string' } },
    }, required: ['title'] },
  },
  {
    name: 'update_idea',
    description: 'Update an idea: move its stage, edit hook/notes, record which choice the comments picked (choice_result), attach references or a board.',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string' }, title: { type: 'string' }, stage: { type: 'string', enum: ['idea', 'scripting', 'producing', 'ready', 'scheduled', 'posted', 'dropped'] },
      hook: { type: 'string' }, notes: { type: 'string' }, choice_a: { type: 'string' }, choice_b: { type: 'string' }, choice_result: { type: 'string' },
      series_id: { type: 'string' }, episode: { type: 'number' }, due_date: { type: 'string' }, board_id: { type: 'string' }, ref_ids: { type: 'array', items: { type: 'string' } },
    }, required: ['id'] },
  },
  { name: 'list_series', description: 'Series per brand with episode counts and what the next episode should be.', inputSchema: { type: 'object', properties: { brand: { type: 'string' } } } },
  {
    name: 'save_series',
    description: 'Create a series (give brand + name) or update one (give id): description, format, cadence, status, next_note (what the next episode should be / what the audience chose).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, brand: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, format: { type: 'string' }, cadence: { type: 'string' }, status: { type: 'string', enum: ['active', 'paused', 'ended'] }, next_note: { type: 'string' } } },
  },
  // ---- Deeper analytics ----
  { name: 'hook_report', description: 'Hook learning: every published video with its hook (first line / idea hook) and hook score = % of viewers who stayed past the first 3 seconds (Instagram: 100 − skip rate; YouTube: retention at 3 s), average % watched, views and views vs the account median; plus the latest saved hook analysis. Use it to explain what kind of hooks work and to write better ones.', inputSchema: { type: 'object', properties: { brand: { type: 'string' }, days: { type: 'number' } } } },
  { name: 'audience_report', description: 'Audience and trend data per account: Instagram follower/engaged demographics (age, gender, country, city — needs 100+ followers), online hours, daily reach; YouTube age & gender, top countries, traffic sources (Shorts feed, search, suggested…), devices, daily views/watch time/subscribers.', inputSchema: { type: 'object', properties: { account: { type: 'string', description: 'Optional: platform:username' } } } },
  { name: 'weekly_report', description: 'The weekly content report for a brand: every post of the week with views (6h/24h/now), hook score, watch %, engagement, plus totals vs the previous week, follower change, posting consistency, breakdowns by hour/weekday/format/series, and Claude\'s analysis (what worked, what didn\'t, learnings, review of last week\'s experiments, decisions and experiments for next week). Also returns the running learning log. Reports are written automatically every Monday 10:00 India time for Mon–Sun. Use this before planning next week\'s content.', inputSchema: { type: 'object', properties: { brand: { type: 'string', description: 'Brand kit name, e.g. "The Crime Archives"' }, id: { type: 'string', description: 'A specific report id (from list_reports)' } }, required: ['brand'] } },
  { name: 'list_reports', description: 'List saved weekly reports (newest first) with their headline and totals.', inputSchema: { type: 'object', properties: { brand: { type: 'string' } } } },
  { name: 'generate_report', description: 'Write a fresh report now for the last N days (default 7) for one brand: pulls the latest numbers and asks Claude for the analysis. Takes about a minute.', inputSchema: { type: 'object', properties: { brand: { type: 'string' }, days: { type: 'number' } }, required: ['brand'] } },
  { name: 'post_insights', description: 'One published post: its stats over time (growth curve), watch metrics (avg watch time, skip rate / hold at 3 s, avg % viewed, subs gained) and, for YouTube, the audience retention curve.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  // ---- Instagram DMs ----
  { name: 'inbox_threads', description: 'List Instagram DM conversations across the connected accounts (newest first), with unread counts and whether a reply is still allowed (Instagram only allows replies within 24h of their last message).', inputSchema: { type: 'object', properties: { account_id: { type: 'string' }, q: { type: 'string', description: 'Search username or last message' } } } },
  { name: 'inbox_thread', description: 'Read one DM conversation (messages oldest → newest).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'draft_dm_reply', description: 'Save a suggested reply on a DM conversation. It is NOT sent: the user reviews and sends it from Postroom → Inbox. Keep it brief, in their language, and never invent prices, dates or links.', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Conversation id from inbox_threads' }, text: { type: 'string' } }, required: ['id', 'text'] } },
  { name: 'list_automations', description: 'List DM automations: welcome message, keyword auto-replies, and comment-to-DM rules, with hit counts.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'create_automation',
    description: 'Create a DM automation. It is created switched OFF; the user turns it on in Postroom → Inbox → Automations. kind: welcome (first DM from someone), dm_keyword (DM contains a keyword), comment_keyword (a comment contains a keyword → private DM to the commenter, optional public reply). Use {username} to insert their handle.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['welcome', 'dm_keyword', 'comment_keyword'] },
        name: { type: 'string' },
        account: { type: 'string', description: 'Instagram account (@username) — omit for all accounts' },
        keywords: { type: 'array', items: { type: 'string' } },
        match: { type: 'string', enum: ['contains', 'exact', 'any'] },
        reply_text: { type: 'string', description: 'The DM to send (≤1000 chars)' },
        public_reply_text: { type: 'string', description: 'comment_keyword only: optional public reply under the comment' },
      },
      required: ['kind', 'reply_text'],
    },
  },
];

const short = (p) => ({
  id: p.id, account: `@${p.username}`, platform: p.platform, kind: KIND_LABEL[p.kind], status: p.status,
  when: localLabel(p.scheduled_at), caption: (p.caption || '').slice(0, 140), permalink: p.permalink || undefined,
  error: p.error || undefined, metrics: Object.keys(p.metrics || {}).length ? p.metrics : undefined,
});

async function callTool(name, a = {}) {
  switch (name) {
    case 'list_accounts': return listAccounts({ platform: a.platform });
    case 'hook_report': {
      const hk = await import('./hooks.js');
      return { hooks: (await hk.listHooks({ brand: a.brand || null, days: a.days || 120 })).slice(0, 80), latest_analysis: await hk.latestHookReport({ brand: a.brand || null }) };
    }
    case 'audience_report': {
      const ins = await import('./insights.js');
      const acct = a.account ? await findAccount(a.account) : null;
      return ins.getAccountInsights({ account_id: acct?.id || null });
    }
    case 'weekly_report': {
      const rp = await import('./reports.js');
      const r = a.id ? await rp.getReport(a.id) : await rp.latestReport({ brand: a.brand });
      if (!r) return { report: null, note: `No report yet for ${a.brand}. Use generate_report to write one now.`, learning_log: [] };
      return { ...r, learning_log: await rp.learningLog({ brand: r.brand }) };
    }
    case 'list_reports': {
      const rp = await import('./reports.js');
      return rp.listReports({ brand: a.brand || null });
    }
    case 'generate_report': {
      const rp = await import('./reports.js');
      const days = Math.min(Math.max(Number(a.days) || 7, 1), 90);
      return rp.generateReport({ brand: a.brand, end: new Date(), start: new Date(Date.now() - days * 864e5) });
    }
    case 'post_insights': {
      const ins = await import('./insights.js');
      return { post: await getPost(a.id), growth: await ins.postGrowth(a.id) };
    }
    case 'plan_overview': return planner.overview({ brand: a.brand || null });
    case 'save_reference': {
      const { suggest, ...rest } = a;
      const kind = rest.url || rest.research_post_id ? 'link' : rest.color ? 'color' : 'note';
      return planner.createRef({ ...rest, kind, status: suggest ? 'suggested' : 'kept' }, { source: 'claude' });
    }
    case 'list_references': return planner.listRefs({ brand: a.brand, tag: a.tag, q: a.q, status: a.status || 'kept', limit: a.limit || 50 });
    case 'create_board': return planner.createBoard(a, { by: 'claude' });
    case 'get_board': return planner.getBoard(a.id);
    case 'add_to_board': {
      const added = [];
      for (const id of a.ref_ids || []) added.push(await planner.addBoardItem(a.board_id, { kind: 'ref', ref_id: id }));
      if (a.note) added.push(await planner.addBoardItem(a.board_id, { kind: 'note', text: a.note }));
      if (a.color) added.push(await planner.addBoardItem(a.board_id, { kind: 'color', color: a.color }));
      if (a.link) {
        const r = await planner.createRef({ url: a.link, kind: 'link' }, { source: 'claude' });
        added.push(await planner.addBoardItem(a.board_id, { kind: 'ref', ref_id: r.id }));
      }
      return { added: added.length };
    }
    case 'list_ideas': return planner.listIdeas(a);
    case 'get_idea': return planner.getIdea(a.id);
    case 'create_idea': return planner.createIdea(a, { by: 'claude' });
    case 'update_idea': { const { id, ...patch } = a; return planner.updateIdea(id, patch); }
    case 'list_series': return planner.listSeries({ brand: a.brand || null });
    case 'save_series': { const { id, ...rest } = a; return id ? planner.updateSeries(id, rest) : planner.createSeries(rest); }
    case 'update_brand_kit': {
      const acct = await findAccount(a.account);
      return updateBrand(acct.id, { brand: a.brand ? { ...(acct.brand || {}), ...a.brand } : undefined, slots: a.slots });
    }
    case 'list_media': return listMedia({ limit: a.limit || 30 });
    case 'import_media': return importFromUrl(a);
    case 'check_posts': return summariseCheck(await checkTargets(a));
    case 'create_plan': {
      const auto = env('MCP_AUTO_APPROVE') === 'true';
      let batchId = null;
      const created = [];
      for (const p of a.posts || []) {
        const r = await createPosts({ ...p, mode: auto ? 'schedule' : 'plan', batch_id: batchId, plan_title: a.title, plan_note: a.note }, { createdBy: 'claude' });
        batchId = r.batch_id;
        created.push(...r.posts);
      }
      return {
        plan_id: batchId,
        posts: created.length,
        next: auto ? 'Scheduled (auto-approve is on).' : 'Saved as a plan. Ask the user to review and approve it in Postroom → Plans.',
      };
    }
    case 'list_plans': return (await listPlans()).map((b) => ({ id: b.id, title: b.title, note: b.note, posts: b.posts.map(short) }));
    case 'list_posts': return (await listPosts(a)).map(short);
    case 'get_post': return getPost(a.id);
    case 'update_post': { const { id, ...patch } = a; return updatePost(id, patch, { by: 'claude' }); }
    case 'cancel_post': return cancelPost(a.id, { by: 'claude' });
    case 'schedule_post': return schedulePost(a.id, { scheduled_at: a.scheduled_at || null, group: a.group !== false, by: 'claude' });
    case 'get_analytics': return overview(a);
    case 'inbox_threads': return (await inbox.listThreads(a)).map((t) => ({ id: t.id, account: `@${t.account_username}`, with: t.username ? `@${t.username}` : t.igsid, last: t.last_text, last_at: t.last_message_at, unread: t.unread, can_reply: t.can_reply, has_draft: !!t.draft_text }));
    case 'inbox_thread': { const t = await inbox.getThread(a.id, { markRead: false }); return { id: t.id, account: `@${t.account_username}`, with: t.username ? `@${t.username}` : t.igsid, can_reply: t.can_reply, window_ends_at: t.window_ends_at, messages: t.messages.map((m) => ({ from: m.direction === 'in' ? 'them' : 'us', text: m.text, at: m.created_at })) }; }
    case 'draft_dm_reply': await inbox.saveDraft(a.id, a.text, 'claude'); return { saved: true, next: 'Draft saved. The user reviews and sends it in Postroom → Inbox.' };
    case 'list_automations': return inbox.listRules();
    case 'create_automation': {
      let account_id = null;
      if (a.account) account_id = (await findAccount(a.account, 'instagram')).id;
      const r = await inbox.createRule({ ...a, account_id, enabled: false });
      return { ...r, next: 'Created switched OFF. Ask the user to review and turn it on in Postroom → Inbox → Automations.' };
    }
    case 'research_projects': return listProjects();
    case 'research_overview': return projectOverview(a.project_id);
    case 'research_search': return searchPosts({ ...a, limit: a.limit || 25 });
    case 'research_post': { const r = await getResearchPost(a.id); return { ...r, inspiration_brief: inspirationBrief(r) }; }
    case 'research_youtube_channel': return lookupYoutube(a);
    case 'research_instagram_account': return lookupInstagram(a);
    default: throw Object.assign(new Error(`Unknown tool ${name}`), { rpc: -32602 });
  }
}

async function handleOne(msg) {
  const { id, method, params } = msg || {};
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  if (method === 'initialize') {
    return reply({
      protocolVersion: params?.protocolVersion || PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'postroom', version: '2.0.0' },
      instructions: `Postroom schedules posts to the user's Instagram, YouTube and TikTok accounts. Times are in ${TZ()} unless an offset is given. Always call check_posts before create_plan, and never invent facts in captions. Use the research_* tools to study competitors and niches; when drafting posts inspired by research, make original content — borrow structure and hooks, never copy someone else's words or media.`,
    });
  }
  if (method === 'ping') return reply({});
  if (method === 'tools/list') return reply({ tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const data = await callTool(params?.name, params?.arguments || {});
      return reply({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
    } catch (e) {
      if (e.rpc) return { jsonrpc: '2.0', id, error: { code: e.rpc, message: e.message } };
      const detail = e.extra && Object.keys(e.extra).length ? `\n${JSON.stringify(e.extra, null, 2)}` : '';
      return reply({ content: [{ type: 'text', text: `${e.message}${detail}` }], isError: true });
    }
  }
  if (id === undefined) return null; // notification
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export async function handleMcp(req, res) {
  if (req.method === 'GET') return send(res, 405, { error: 'Use POST (Streamable HTTP, JSON responses).' }, { allow: 'POST' });
  if (req.method === 'DELETE') return send(res, 200, {});
  let msg;
  try {
    msg = await body(req);
  } catch {
    return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  const accepted = () => {
    res.statusCode = 202;
    res.end();
  };
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map(handleOne))).filter(Boolean);
    return out.length ? send(res, 200, out) : accepted();
  }
  const out = await handleOne(msg);
  return out ? send(res, 200, out) : accepted();
}
