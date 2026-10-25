import type { BookSpec } from '../book/types'

// Placeholder copy. Swap text and add `src` to any image to use real work.
const EMAIL = 'vedwhodesigns@gmail.com'
const INSTAGRAM = 'https://www.instagram.com/vedwhodesigns'
const GITHUB = 'https://github.com/vedwhodesigns'

const projectCopy = [
  'Start with the brief: who it was for, what needed solving and what made it worth doing. Two or three sentences are plenty — the images on the facing page carry the rest.',
  'Then the idea. Describe the one decision the whole project hangs on, and how it shaped the typography, the image-making and the system around it.',
  'Close with the outcome: where it lives now, what changed for the client and what you would take forward into the next piece of work.',
]

const project = (n: number, name: string, discipline: string, seed: number) => ({
  left: {
    id: `p${n}-text`,
    section: 'Work',
    kind: 'projectText' as const,
    chapter: `Project 0${n}`,
    running: name,
    image: { seed, tone: n % 2 ? ('stone' as const) : ('smoke' as const) },
    captionLeft: `${name} — Fig. 0${n}.1`,
    captionRight: discipline,
    paragraphs: projectCopy,
  },
  right: {
    id: `p${n}-visual`,
    section: 'Work',
    kind: 'projectVisual' as const,
    chapter: discipline,
    running: `Project 0${n}`,
    intro: 'A short note on context goes here: the client, the year, the team and your role in it.',
    quote: 'One line that captures the idea behind the project, set large and quiet.',
    image: { seed: seed + 7, tone: n % 2 ? ('leather' as const) : ('night' as const) },
    captionLeft: `Fig. 0${n}.2`,
    captionRight: name,
  },
})

export const BOOK: BookSpec = {
  cover: {
    id: 'cover',
    section: 'Cover',
    kind: 'cover',
    eyebrow: 'Book Portfolio — Vol. 01',
    titleLines: ['Selected Work', '& Other Things'],
    footerLeft: 'Vedant Parikh',
    footerRight: 'Creative Director — 2026',
  },
  spreads: [
    {
      left: {
        id: 'inside-cover',
        section: 'Index',
        kind: 'fullImage',
        image: { seed: 11, tone: 'smoke' },
        captionLines: ['Plate I — Untitled study', 'Placeholder image'],
      },
      right: {
        id: 'contents',
        section: 'Index',
        kind: 'contents',
        title: 'Contents',
        entries: [
          { num: '01', title: 'About', page: '04' },
          { num: '02', title: 'Selected Work', page: '06' },
          { num: '03', title: 'Playground', page: '16' },
          { num: '04', title: 'Résumé', page: '18' },
          { num: '05', title: 'Contact', page: '20' },
        ],
        note: 'Drag a page corner — or swipe — to turn. Use the arrow keys on a keyboard.',
      },
    },
    {
      overlays: [{
        id: 'vellum-about',
        section: 'About',
        kind: 'vellum',
        chapter: 'Chapter 01',
        titleLines: ['About'],
        note: 'Interleaf — the designer, the practice and the way of working.',
      }],
      left: {
        id: 'about-portrait',
        section: 'About',
        kind: 'fullImage',
        image: { seed: 23, tone: 'night' },
        captionLines: ['Portrait — placeholder', 'Courtesy of the author'],
      },
      right: {
        id: 'about',
        section: 'About',
        kind: 'chapterTitle',
        chapter: 'Chapter 01',
        running: 'Book Portfolio',
        titleLines: ['The', 'Designer', '&', 'The Practice'],
        sections: [{ label: 'About — Vedant Parikh', page: 'Page 04' }],
        overview:
          'Vedant Parikh is a creative director working across identity, editorial and interactive design. Replace this paragraph with a few sentences in your own voice: what you make, who you make it for and what you care about when you make it.',
        details: [
          { label: 'Based in', value: 'Your city' },
          { label: 'Focus', value: 'Identity · Editorial · Interactive' },
          { label: 'Contact', value: EMAIL, href: `mailto:${EMAIL}` },
        ],
      },
    },
    {
      overlays: [{
        id: 'vellum-work',
        section: 'Work',
        kind: 'vellum',
        chapter: 'Chapter 02',
        titleLines: ['Selected', 'Work'],
        note: 'Interleaf — four projects, each told across a single spread.',
      }],
      left: {
        id: 'work-opener',
        section: 'Work',
        kind: 'opener',
        chapter: 'Chapter 02',
        titleLines: ['Selected Work', '& The Process'],
        image: { seed: 37, tone: 'smoke' },
        captionLines: ['Plate II — Placeholder', 'Studio, 2026'],
      },
      right: {
        id: 'work-index',
        section: 'Work',
        kind: 'list',
        chapter: 'Chapter 02',
        running: 'Selected Work',
        title: 'Projects',
        groups: [
          {
            heading: 'In this chapter',
            rows: [
              { left: '01', mid: 'Project One', right: 'Identity' },
              { left: '02', mid: 'Project Two', right: 'Editorial' },
              { left: '03', mid: 'Project Three', right: 'Digital' },
              { left: '04', mid: 'Project Four', right: 'Campaign' },
            ],
          },
        ],
      },
    },
    {
      ...project(1, 'Project One', 'Identity System', 101),
      overlays: [{
        id: 'sleeve-process',
        section: 'Work',
        kind: 'sleeve',
        backing: 'clear',
        items: [
          { type: 'photo', x: 400, y: 400, w: 400, rot: -3, image: { seed: 121, tone: 'stone' } },
          { type: 'polaroid', x: 700, y: 840, w: 320, rot: 6, image: { seed: 122, tone: 'smoke' }, text: 'Process' },
          { type: 'note', x: 340, y: 1060, w: 400, rot: -4, text: 'Contact sheet — the first round of sketches.' },
        ],
      }],
    },
    project(2, 'Project Two', 'Editorial Design', 211),
    project(3, 'Project Three', 'Digital Product', 307),
    project(4, 'Project Four', 'Campaign', 401),
    {
      overlays: [{
        id: 'vellum-playground',
        section: 'Playground',
        kind: 'vellum',
        chapter: 'Chapter 03',
        titleLines: ['Playground'],
        note: 'Interleaf — experiments, sketches and things made for fun.',
      }, {
        id: 'sleeve-ephemera',
        section: 'Playground',
        kind: 'sleeve',
        backing: 'black',
        items: [
          { type: 'note', x: 580, y: 760, w: 540, rot: 5, text: 'Ephemera — prints, tickets and keepsakes from the studio wall.' },
          { type: 'polaroid', x: 330, y: 360, w: 300, rot: -8, image: { seed: 611, tone: 'night' }, text: 'Studio, late' },
          { type: 'photo', x: 735, y: 330, w: 230, rot: 4, image: { seed: 612, tone: 'stone' } },
          { type: 'polaroid', x: 705, y: 1050, w: 300, rot: 9, image: { seed: 613, tone: 'leather' }, text: 'Test print 03' },
          { type: 'ticket', x: 320, y: 1110, w: 280, rot: -13, text: 'Admit one — Type talk' },
          { type: 'clip', x: 300, y: 196, w: 54, rot: 6 },
        ],
      }],
      left: {
        id: 'playground-grid',
        section: 'Playground',
        kind: 'grid',
        chapter: 'Chapter 03',
        running: 'Playground',
        title: 'Studies',
        text: 'Small experiments in type, motion and image-making. Replace these tiles with your favourite sketches.',
        tiles: [
          { seed: 501, tone: 'stone' },
          { seed: 502, tone: 'night' },
          { seed: 503, tone: 'leather' },
          { seed: 504, tone: 'smoke' },
        ],
      },
      right: {
        id: 'playground',
        section: 'Playground',
        kind: 'chapterTitle',
        chapter: 'Chapter 03',
        running: 'Playground',
        titleLines: ['The', 'Playground', '&', 'The Sketchbook'],
        sections: [{ label: 'Experiments & side projects', page: 'Page 16' }],
        overview:
          'Not everything has to be a project. This chapter collects the experiments, sketches and late-night ideas that feed the work. The full archive lives on Instagram.',
        details: [{ label: 'Archive', value: 'instagram.com/vedwhodesigns', href: INSTAGRAM }],
      },
    },
    {
      left: {
        id: 'resume-experience',
        section: 'Résumé',
        kind: 'list',
        chapter: 'Chapter 04',
        running: 'Résumé',
        title: 'Experience',
        groups: [
          {
            heading: 'Roles',
            rows: [
              { left: '20XX — Now', mid: 'Creative Director', right: 'Studio name' },
              { left: '20XX — 20XX', mid: 'Senior Designer', right: 'Company name' },
              { left: '20XX — 20XX', mid: 'Designer', right: 'Agency name' },
            ],
          },
          {
            heading: 'Education',
            rows: [{ left: '20XX', mid: 'Degree in Design', right: 'School name' }],
          },
        ],
      },
      right: {
        id: 'resume-skills',
        section: 'Résumé',
        kind: 'list',
        chapter: 'Chapter 04',
        running: 'Résumé',
        title: 'Practice',
        groups: [
          {
            heading: 'Disciplines',
            rows: [
              { left: 'A', mid: 'Brand identity', right: 'Systems' },
              { left: 'B', mid: 'Editorial design', right: 'Print' },
              { left: 'C', mid: 'Interactive', right: 'Web' },
              { left: 'D', mid: 'Art direction', right: 'Image' },
            ],
          },
          {
            heading: 'Recognition',
            rows: [{ left: '20XX', mid: 'Award or feature', right: 'Publication' }],
          },
        ],
        link: { label: 'github.com/vedwhodesigns', href: GITHUB },
      },
    },
    {
      left: {
        id: 'closing',
        section: 'Contact',
        kind: 'closing',
        titleLines: ['Thank', 'you for', 'reading'],
        text: 'For commissions, collaborations or a conversation, write to me — I read everything.',
        links: [
          { label: EMAIL, href: `mailto:${EMAIL}` },
          { label: 'instagram.com/vedwhodesigns', href: INSTAGRAM },
          { label: 'github.com/vedwhodesigns', href: GITHUB },
        ],
      },
      right: {
        id: 'colophon',
        section: 'Contact',
        kind: 'colophon',
        lines: [
          'Colophon',
          'Set in Inter Tight, IBM Plex Mono',
          'and Instrument Serif.',
          'Pages turned in WebGL.',
          '© 2026 Vedant Parikh',
        ],
      },
    },
  ],
  back: {
    id: 'back-cover',
    section: 'Back',
    kind: 'backCover',
    lines: ['Vedant Parikh', 'Book Portfolio — Vol. 01'],
  },
}
