#!/usr/bin/env node
// Daily deal-intake bot.
// Usage:
//   npm run dealbot -- init deals
//   npm run dealbot -- add deals "https://example.com" "Optional note"
//   npm run dealbot -- morning deals
//   npm run dealbot -- night deals

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';

const [, , command, projectName, ...args] = process.argv;

if (!command || !projectName) {
  usage();
}

const projectDir = resolve(join(import.meta.dirname, '..', 'projects', projectName));
const inboxDir = join(projectDir, 'deal-inbox');
const reportsDir = join(projectDir, 'deal-reports');
const inboxFile = join(inboxDir, 'deals.jsonl');
const profileFile = join(projectDir, 'deal-profile.md');

const today = new Date().toISOString().slice(0, 10);

await main();

async function main() {
  if (command === 'init') {
    ensureProject();
    if (!existsSync(profileFile)) {
      writeFileSync(profileFile, defaultProfile(), 'utf8');
    }
    console.log(`Created deal bot project: ${projectDir}`);
    console.log(`Edit your evaluation criteria here: ${profileFile}`);
    return;
  }

  ensureProject();

  if (command === 'add') {
    const raw = args.join(' ').trim();
    if (!raw) die('Provide the deal text, URL, or pasted Instagram message.');
    const deal = normalizeDeal(raw);
    appendDeal(deal);
    console.log(`Added deal ${deal.id}: ${deal.title}`);
    return;
  }

  if (['daily', 'morning', 'night'].includes(command)) {
    const report = await buildReport(command === 'daily' ? 'night' : command, args[0] || today);
    console.log(`Wrote report: ${report}`);
    return;
  }

  if (command === 'list') {
    const deals = readDeals();
    for (const deal of deals) {
      console.log(`${deal.createdAt.slice(0, 10)}  ${deal.id}  ${deal.title}`);
    }
    return;
  }

  usage();
}

function usage() {
  console.error(`
Usage:
  npm run dealbot -- init <project>
  npm run dealbot -- add <project> "<deal text or URL>"
  npm run dealbot -- list <project>
  npm run dealbot -- morning <project> [YYYY-MM-DD]
  npm run dealbot -- night <project> [YYYY-MM-DD]
  npm run dealbot -- daily <project> [YYYY-MM-DD]   # alias for night

Environment:
  OPENAI_API_KEY       Optional. Enables AI scoring and planning.
  DEALBOT_MODEL        Optional. Default: gpt-4.1-mini
`);
  process.exit(1);
}

function ensureProject() {
  mkdirSync(inboxDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });
  if (!existsSync(inboxFile)) writeFileSync(inboxFile, '', 'utf8');
}

function normalizeDeal(raw) {
  const url = raw.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.;]+$/, '') || '';
  const title = raw
    .replace(url, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || url || 'Untitled deal';
  const id = createHash('sha1').update(`${url}\n${title}`).digest('hex').slice(0, 10);

  return {
    id,
    createdAt: new Date().toISOString(),
    source: 'manual-or-instagram',
    title,
    url,
    raw,
  };
}

function appendDeal(deal) {
  const existing = new Set(readDeals().map(item => item.id));
  if (existing.has(deal.id)) die(`Deal already exists: ${deal.id}`);
  appendFileSync(inboxFile, `${JSON.stringify(deal)}\n`, 'utf8');
}

function readDeals() {
  if (!existsSync(inboxFile)) return [];
  return readFileSync(inboxFile, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function buildReport(mode, date) {
  const deals = readDeals().filter(deal => deal.createdAt.slice(0, 10) === date);
  const profile = existsSync(profileFile) ? readFileSync(profileFile, 'utf8') : defaultProfile();
  const analyses = [];

  for (const deal of deals) {
    const analysis = process.env.OPENAI_API_KEY
      ? await analyzeWithOpenAI(deal, profile)
      : heuristicAnalysis(deal);
    analyses.push({ deal, analysis });
  }

  const plan = process.env.OPENAI_API_KEY
    ? await makePlanWithOpenAI(analyses, profile, date, mode)
    : heuristicPlan(analyses, date, mode);

  const markdown = renderReport(date, mode, analyses, plan);
  const reportFile = join(reportsDir, `${mode}-${date}.md`);
  writeFileSync(reportFile, markdown, 'utf8');
  return reportFile;
}

async function analyzeWithOpenAI(deal, profile) {
  const prompt = `You are evaluating Instagram videos, business ideas, deals, and useful resources for a founder/operator.

User criteria:
${profile}

Deal:
${JSON.stringify(deal, null, 2)}

Return compact JSON with keys:
score_0_to_10, verdict, core_lesson, why_relevant, risks, missing_info, next_action, content_angle, category.`;

  const text = await callOpenAI(prompt);
  return parseJsonLoose(text) || heuristicAnalysis(deal, text);
}

async function makePlanWithOpenAI(analyses, profile, date, mode) {
  const prompt = mode === 'morning'
    ? `Create a morning execution plan for ${date}.

User criteria:
${profile}

Learnings/resources collected:
${JSON.stringify(analyses, null, 2)}

Return Markdown with:
1. Today's main focus
2. Top 3 ideas to act on
3. Content or business experiments to run
4. People/accounts/resources to inspect deeper
5. What to ignore today
6. First 90-minute work block.`
    : `Create a night learning review and improvement plan for ${date}.

User criteria:
${profile}

Analyzed deals:
${JSON.stringify(analyses, null, 2)}

Return Markdown with:
1. What we learned
2. Patterns worth copying
3. What to do better tomorrow
4. Concrete next actions
5. Suggested follow-up messages
6. Save or ignore list.`;

  return callOpenAI(prompt);
}

async function callOpenAI(input) {
  const model = process.env.DEALBOT_MODEL || 'gpt-4.1-mini';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    die(`OpenAI API failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.output_text || data.output?.flatMap(item => item.content || [])
    .map(item => item.text || '')
    .join('\n')
    .trim();
}

function heuristicAnalysis(deal, note = '') {
  const text = `${deal.raw} ${note}`.toLowerCase();
  const signals = [
    ['has clear URL', Boolean(deal.url)],
    ['mentions pricing or offer', /price|pricing|cost|deal|discount|offer|\$|rs\.?|inr/.test(text)],
    ['mentions business outcome', /lead|sales|revenue|margin|customer|growth|roi|resource|launch|app|brand|content/.test(text)],
    ['mentions urgency', /today|tomorrow|deadline|limited|expires|last day/.test(text)],
    ['has content learning signal', /hook|creative|content|reel|clip|video|angle|brand|launch|marketing/.test(text)],
  ];
  const score = signals.filter(([, ok]) => ok).length * 2;
  return {
    score_0_to_10: Math.min(10, score),
    verdict: score >= 6 ? 'review' : 'needs more info',
    core_lesson: inferLesson(text),
    why_relevant: signals.filter(([, ok]) => ok).map(([label]) => label),
    risks: score < 6 ? ['Not enough context to judge quality or fit.'] : [],
    missing_info: ['Exact post URL', 'Transcript or caption', 'Why it was saved', 'Action owner'],
    next_action: deal.url ? 'Open the resource, capture the hook, and decide whether to copy the pattern.' : 'Open the Instagram attachment and capture the post link.',
    content_angle: inferAngle(text),
    category: 'uncategorized',
  };
}

function heuristicPlan(analyses, date, mode) {
  const sorted = [...analyses].sort((a, b) => b.analysis.score_0_to_10 - a.analysis.score_0_to_10);
  const top = sorted.slice(0, 5);
  const ignored = sorted.filter(item => item.analysis.score_0_to_10 < 4);

  if (mode === 'morning') {
    return `## Today's main focus
- Turn the highest-signal clips into concrete experiments before collecting more references.

## Top ideas to act on
${top.map(item => `- ${item.deal.title}: ${item.analysis.core_lesson} Next: ${item.analysis.next_action}`).join('\n') || '- No clips captured yet.'}

## Experiments to run
- Rewrite one saved hook for your own offer.
- Build one small landing page/content test from the strongest pattern.
- Save the original post URL, hook, promise, and CTA for every useful clip.

## Ignore today
${ignored.map(item => `- ${item.deal.title}: too little signal.`).join('\n') || '- Nothing obvious yet.'}

## First 90-minute work block
- 20m: open top clips and capture URLs.
- 30m: write the lesson from each clip in one sentence.
- 40m: turn the best lesson into one action or content draft.

_Generated without AI because OPENAI_API_KEY is not set for ${date}._`;
  }

  return `## What we learned
${top.map(item => `- ${item.deal.title}: ${item.analysis.core_lesson}`).join('\n') || '- No clips captured.'}

## Patterns worth copying
- Strong clips usually make the hook visible immediately.
- Product references should be broken into pain, promise, proof, demo, and CTA.
- Strategy references should be rewritten into one testable business action.

## What to do better tomorrow
- Capture exact post URLs when opening each DM attachment.
- Add one sentence on why the clip was saved.
- Separate entertainment references from business/content experiments.

## Concrete next actions
- Open the highest-signal clips and capture URLs.
- Write one reusable hook formula from the best clip.
- Turn one saved pattern into a post, landing page section, or outreach message.

## Save or ignore list
${ignored.map(item => `- Ignore for now: ${item.deal.title}`).join('\n') || '- Save all captured items until the exact links and captions are reviewed.'}

_Generated without AI because OPENAI_API_KEY is not set for ${date}._`;
}

function renderReport(date, mode, analyses, plan) {
  const title = mode === 'morning' ? 'Morning Plan' : 'Night Learning Review';
  return `# ${title} - ${date}

Captured items: ${analyses.length}

## Item Reviews
${analyses.map(({ deal, analysis }) => `### ${deal.title}
- ID: ${deal.id}
- URL: ${deal.url || 'none'}
- Score: ${analysis.score_0_to_10}/10
- Verdict: ${analysis.verdict}
- Core lesson: ${analysis.core_lesson || 'Needs review'}
- Content angle: ${analysis.content_angle || 'Unknown'}
- Next action: ${analysis.next_action}
- Missing info: ${(analysis.missing_info || []).join(', ') || 'none'}
`).join('\n')}

${plan}
`;
}

function inferLesson(text) {
  if (/launch|app|mac|software/.test(text)) return 'Study how the product frames the pain, benefit, and demo sequence.';
  if (/brand|growth|marketing|content/.test(text)) return 'Study the hook and how the idea creates urgency or a sharp opinion.';
  if (/price|deal|offer|discount/.test(text)) return 'Extract the offer structure and test whether the value proposition is clear.';
  if (/papaya|funny|meme|relatable/.test(text)) return 'Watch for a relatable hook or repeatable short-form format.';
  return 'Open the clip and write the hook, promise, proof, and CTA.';
}

function inferAngle(text) {
  if (/launch|app|mac|software/.test(text)) return 'product demo';
  if (/brand|growth|marketing/.test(text)) return 'marketing strategy';
  if (/content|hook|reel|clip|video/.test(text)) return 'content format';
  if (/price|deal|offer|discount/.test(text)) return 'offer';
  return 'reference';
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function defaultProfile() {
  return `# Deal And Learning Profile

Use this file to teach the bot what good Instagram videos, deals, and resources look like for you.

## Good fit
- Helps with revenue, partnerships, sourcing, content, software, operations, or learning.
- Has a clear owner, next step, deadline, or measurable upside.
- Is relevant to my current business priorities.
- Teaches a repeatable hook, offer, landing page idea, product demo, or sales angle.

## Bad fit
- Vague inspiration with no action.
- Requires too much time for unclear return.
- Looks spammy, low trust, or unrelated to my current goals.
- Is entertaining but has no transferable lesson.

## Output preference
- Be direct.
- Tell me whether to pursue, save for later, or ignore.
- Extract the core lesson from each video.
- Give morning priorities and night improvements.
- Give the exact next action and any message I should send.
`;
}

function die(message) {
  console.error(message);
  process.exit(1);
}
