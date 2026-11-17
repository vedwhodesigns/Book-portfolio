// MCP server (Streamable HTTP, stateless JSON-RPC) so Claude can plan and manage posts.
// URL: {APP_URL}/api/mcp/{MCP_KEY}. Anything Claude schedules lands as a *plan* that you
// approve in the app, unless you set MCP_AUTO_APPROVE=true.
import { send, body, env, localLabel, TZ } from './core.js';
import { listAccounts } from './accounts.js';
import { listMedia, importFromUrl } from './media.js';
import { checkTargets, summariseCheck, createPosts, listPosts, getPost, updatePost, cancelPost, listPlans, findAccount } from './posts.js';
import { overview } from './analytics.js';
import { KIND_LABEL } from './platforms/index.js';
import { listProjects, projectOverview, searchPosts, getResearchPost, lookupYoutube, inspirationBrief } from './research.js';
import * as inbox from './inbox.js';

const PROTOCOL = '2025-06-18';

const target = {
  type: 'object',
  properties: {
    account: { type: 'string', description: 'Account id, @username, or platform:username (e.g. youtube:mychannel).' },
    kind: { type: 'string', enum: ['image', 'carousel', 'reel', 'story', 'short', 'video'], description: 'Optional. Defaults: Instagram reel/image/carousel, YouTube short (≤3 min vertical) or video, TikTok video.' },
    caption: { type: 'string', description: 'Overrides the shared caption for this account.' },
    title: { type: 'string', description: 'YouTube title (≤100 chars). Defaults to the caption\'s first line.' },
    scheduled_at: { type: 'string', description: 'Overrides the shared time for this account.' },
    options: {
      type: 'object',
      description: 'Platform options. YouTube: {privacy: public|unlisted|private, made_for_kids: boolean (required), tags: string[], category_id}. TikTok: {mode: direct|inbox, privacy_level: PUBLIC_TO_EVERYONE|MUTUAL_FOLLOW_FRIENDS|FOLLOWER_OF_CREATOR|SELF_ONLY (required for direct), disable_comment, disable_duet, disable_stitch, brand_content, brand_organic, is_aigc}. Instagram: {share_to_feed: boolean}.',
    },
  },
  required: ['account'],
};
const postInput = {
  media_ids: { type: 'array', items: { type: 'string' }, description: 'Media library ids, in order (carousel order).' },
  cover_media_id: { type: 'string', description: 'Optional image used as reel cover / YouTube thumbnail.' },
  caption: { type: 'string', description: 'Shared caption used for every account unless overridden.' },
  title: { type: 'string', description: 'Shared YouTube title.' },
  scheduled_at: { type: 'string', description: `When to post: ISO time with offset, or wall-clock "YYYY-MM-DDTHH:mm" in ${TZ()}.` },
  targets: { type: 'array', items: target, description: 'One entry per account to post to (cross-posting).' },
};

const TOOLS = [
  { name: 'list_accounts', description: 'List connected Instagram, YouTube and TikTok accounts with their status and counts.', inputSchema: { type: 'object', properties: { platform: { type: 'string', enum: ['instagram', 'youtube', 'tiktok'] } } } },
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
