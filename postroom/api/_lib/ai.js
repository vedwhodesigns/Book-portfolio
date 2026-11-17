// "Write with Claude": per-platform captions, titles and hashtags.
// Optional — needs ANTHROPIC_API_KEY. Without it, Claude can still do this through the MCP endpoint.
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { env, HttpError } from './core.js';
import { loadMedia } from './media.js';

const MODEL = () => env('CLAUDE_MODEL', 'claude-opus-5-5');
export const aiEnabled = () => !!env('ANTHROPIC_API_KEY');

const VARIANT = {
  type: 'object',
  additionalProperties: false,
  required: ['caption', 'hashtags'],
  properties: {
    title: { type: 'string', description: 'YouTube only: the video title, max 100 characters.' },
    caption: { type: 'string', description: 'The caption/description text, without the hashtags.' },
    hashtags: { type: 'array', items: { type: 'string' }, description: 'Hashtags without the # sign.' },
  },
};

const RULES = {
  instagram: 'Instagram: hook in the first line (it is cut off after ~125 chars), short paragraphs, a clear call to action, 3–5 focused hashtags.',
  youtube: 'YouTube: a searchable, curiosity-driven title of at most 70 characters (100 hard max) and a description whose first two lines summarise the video; 3–5 hashtags. For Shorts keep it brief.',
  tiktok: 'TikTok: one or two punchy lines in a conversational voice, a hook up front, 3–5 hashtags mixing niche and broad.',
};

export async function writeCaptions({ brief = '', platforms = [], media_id = null, tone = '', current = '' }) {
  if (!aiEnabled()) throw new HttpError(400, 'Add ANTHROPIC_API_KEY in Vercel to use Write with Claude — or ask Claude through the MCP connector (Settings).');
  const list = [...new Set(platforms)].filter((p) => RULES[p]);
  if (!list.length) throw new HttpError(400, 'Pick at least one platform.');
  if (!brief.trim() && !current.trim() && !media_id) throw new HttpError(400, 'Describe the post, or pick the media first.');

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: list,
    properties: Object.fromEntries(list.map((p) => [p, VARIANT])),
  };

  const content = [];
  if (media_id) {
    const [m] = await loadMedia([media_id]);
    const img = m.kind === 'image' ? m.url : m.poster_url;
    if (img && /^https:/.test(img)) content.push({ type: 'image', source: { type: 'url', url: img } });
  }
  content.push({
    type: 'text',
    text: [
      `Write social posts for: ${list.join(', ')}.`,
      brief && `What the post is about:\n${brief}`,
      current && `Draft caption to improve (keep its meaning):\n${current}`,
      tone && `Tone: ${tone}`,
      content.length ? 'The attached image is the media (or a frame from the video).' : '',
      'Platform rules:',
      ...list.map((p) => `- ${RULES[p]}`),
      'Write in the same language as the brief. No emojis unless the brief uses them. Never invent facts that are not in the brief or visible in the media.',
    ].filter(Boolean).join('\n\n'),
  });

  const client = new Anthropic();
  const res = await client.beta.messages.parse({
    model: MODEL(),
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: jsonSchemaOutputFormat(schema) },
    messages: [{ role: 'user', content }],
  });
  if (res.stop_reason === 'refusal') throw new HttpError(422, 'Claude declined to write this one. Try rephrasing the brief.');
  if (!res.parsed_output) throw new HttpError(502, 'Claude returned an unexpected answer. Try again.');
  const out = {};
  for (const p of list) {
    const v = res.parsed_output[p];
    const tags = (v.hashtags || []).map((t) => `#${String(t).replace(/^#/, '').replace(/\s+/g, '')}`).join(' ');
    out[p] = { title: p === 'youtube' ? (v.title || '').slice(0, 100) : undefined, caption: tags ? `${v.caption.trim()}\n\n${tags}` : v.caption.trim() };
  }
  return out;
}
