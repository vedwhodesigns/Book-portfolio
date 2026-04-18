/* =============================
   TIMING CONSTANTS (ms)
============================= */
const DECOR_TRANSITION_MS   = 320;
const NAV_KILL_RETRY_DELAYS = [300, 800];
const DEARFLIP_STABLE_MS    = 5000;
const PAGE_POLL_MS          = 150;

/* =============================
   PAGE PERIPHERAL DATA
   Each entry maps to one flipbook page (1-indexed).
   left/right: text shown on rotated side edges.
   topLeft/topRight/bottomLeft/bottomRight: artifact clusters.
   Artifact: { label: string } for placeholder, { src: string, label: string } for image.
============================= */
const PAGE_DATA = [
  // 1 — Front Cover
  {
    left:        "VEDANT PARIKH — CREATIVE DIRECTOR — 2026",
    right:       "BOOK PORTFOLIO — A VISUAL ARCHIVE OF WORK",
    topLeft:     [{ label: "VP" }, { label: "CD" }],
    topRight:    [{ label: "2026" }, { label: "BK" }],
    bottomLeft:  [{ label: "WORK" }, { label: "CRAFT" }, { label: "IDEA" }],
    bottomRight: [{ label: "DESIGN" }, { label: "ART" }, { label: "TYPE" }],
  },
  // 2–3 Spread 1
  {
    left:        "CHAPTER 01 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 01 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S01" }, { label: "CH1" }],
    topRight:    [{ label: "PG2" }, { label: "PG3" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 01 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 01 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S01" }, { label: "CH1" }],
    topRight:    [{ label: "PG2" }, { label: "PG3" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 4–5 Spread 2
  {
    left:        "CHAPTER 02 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 02 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S02" }, { label: "CH2" }],
    topRight:    [{ label: "PG4" }, { label: "PG5" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 02 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 02 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S02" }, { label: "CH2" }],
    topRight:    [{ label: "PG4" }, { label: "PG5" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 6–7 Spread 3
  {
    left:        "CHAPTER 03 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 03 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S03" }, { label: "CH3" }],
    topRight:    [{ label: "PG6" }, { label: "PG7" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 03 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 03 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S03" }, { label: "CH3" }],
    topRight:    [{ label: "PG6" }, { label: "PG7" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 8–9 Spread 4
  {
    left:        "CHAPTER 04 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 04 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S04" }, { label: "CH4" }],
    topRight:    [{ label: "PG8" }, { label: "PG9" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 04 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 04 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S04" }, { label: "CH4" }],
    topRight:    [{ label: "PG8" }, { label: "PG9" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 10–11 Spread 5
  {
    left:        "CHAPTER 05 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 05 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S05" }, { label: "CH5" }],
    topRight:    [{ label: "P10" }, { label: "P11" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 05 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 05 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S05" }, { label: "CH5" }],
    topRight:    [{ label: "P10" }, { label: "P11" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 12–13 Spread 6
  {
    left:        "CHAPTER 06 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 06 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S06" }, { label: "CH6" }],
    topRight:    [{ label: "P12" }, { label: "P13" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 06 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 06 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S06" }, { label: "CH6" }],
    topRight:    [{ label: "P12" }, { label: "P13" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 14–15 Spread 7
  {
    left:        "CHAPTER 07 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 07 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S07" }, { label: "CH7" }],
    topRight:    [{ label: "P14" }, { label: "P15" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 07 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 07 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S07" }, { label: "CH7" }],
    topRight:    [{ label: "P14" }, { label: "P15" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 16–17 Spread 8
  {
    left:        "CHAPTER 08 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 08 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S08" }, { label: "CH8" }],
    topRight:    [{ label: "P16" }, { label: "P17" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 08 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 08 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S08" }, { label: "CH8" }],
    topRight:    [{ label: "P16" }, { label: "P17" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 18–19 Spread 9
  {
    left:        "CHAPTER 09 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 09 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S09" }, { label: "CH9" }],
    topRight:    [{ label: "P18" }, { label: "P19" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 09 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 09 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S09" }, { label: "CH9" }],
    topRight:    [{ label: "P18" }, { label: "P19" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 20–21 Spread 10
  {
    left:        "CHAPTER 10 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 10 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S10" }, { label: "C10" }],
    topRight:    [{ label: "P20" }, { label: "P21" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 10 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 10 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S10" }, { label: "C10" }],
    topRight:    [{ label: "P20" }, { label: "P21" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 22–23 Spread 11
  {
    left:        "CHAPTER 11 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 11 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S11" }, { label: "C11" }],
    topRight:    [{ label: "P22" }, { label: "P23" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 11 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 11 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S11" }, { label: "C11" }],
    topRight:    [{ label: "P22" }, { label: "P23" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 24–25 Spread 12
  {
    left:        "CHAPTER 12 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 12 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S12" }, { label: "C12" }],
    topRight:    [{ label: "P24" }, { label: "P25" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 12 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 12 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S12" }, { label: "C12" }],
    topRight:    [{ label: "P24" }, { label: "P25" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 26 — Back Cover
  {
    left:        "VEDANT PARIKH — CREATIVE DIRECTOR — END OF PORTFOLIO",
    right:       "THANK YOU — VEDWHODESIGNS@GMAIL.COM",
    topLeft:     [{ label: "VP" }],
    topRight:    [{ label: "FIN" }],
    bottomLeft:  [{ label: "2026" }],
    bottomRight: [{ label: "END" }],
  },
];

/* =============================
   PERIPHERAL CONTENT UPDATER
============================= */
let totalPageCount = 26;

function buildArtifacts(items) {
  const frag = document.createDocumentFragment();
  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'artifact-item';
    if (item.src) {
      const img = document.createElement('img');
      img.src = item.src;
      img.alt = item.label || '';
      el.appendChild(img);
    } else {
      el.textContent = item.label || '?';
    }
    frag.appendChild(el);
    if (i < items.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'artifact-arrow';
      arrow.textContent = '→';
      frag.appendChild(arrow);
    }
  });
  return frag;
}

function updatePageCounter(pageNum) {
  const numEl   = document.getElementById('ctrl-page-num');
  const totalEl = document.getElementById('ctrl-page-total');
  if (numEl)   numEl.textContent   = pageNum;
  if (totalEl) totalEl.textContent = totalPageCount;
  savePrefs({ page: pageNum });
}

let lastDecorPage    = 0;
let pendingDecorTimer = null;

function updatePageDecor(pageNum) {
  if (pageNum === lastDecorPage) return;
  lastDecorPage = pageNum;
  if (pendingDecorTimer) { clearTimeout(pendingDecorTimer); pendingDecorTimer = null; }

  const idx = Math.max(0, Math.min(pageNum - 1, PAGE_DATA.length - 1));
  const data = PAGE_DATA[idx];
  if (!data) return;

  updatePageCounter(pageNum);

  const leftEl   = document.getElementById('side-text-left');
  const rightEl  = document.getElementById('side-text-right');
  const leftTxt  = document.getElementById('side-text-left-content');
  const rightTxt = document.getElementById('side-text-right-content');
  const tl = document.getElementById('artifacts-top-left');
  const tr = document.getElementById('artifacts-top-right');
  const bl = document.getElementById('artifacts-bottom-left');
  const br = document.getElementById('artifacts-bottom-right');

  [leftEl, rightEl, tl, tr, bl, br].filter(Boolean).forEach(el => el.classList.add('transitioning'));

  pendingDecorTimer = setTimeout(() => {
    if (leftTxt)  leftTxt.textContent  = data.left  || '';
    if (rightTxt) rightTxt.textContent = data.right || '';

    if (tl) { tl.innerHTML = ''; tl.appendChild(buildArtifacts(data.topLeft     || [])); }
    if (tr) { tr.innerHTML = ''; tr.appendChild(buildArtifacts(data.topRight    || [])); }
    if (bl) { bl.innerHTML = ''; bl.appendChild(buildArtifacts(data.bottomLeft  || [])); }
    if (br) { br.innerHTML = ''; br.appendChild(buildArtifacts(data.bottomRight || [])); }

    [leftEl, rightEl, tl, tr, bl, br].filter(Boolean).forEach(el => el.classList.remove('transitioning'));
    pendingDecorTimer = null;
  }, DECOR_TRANSITION_MS);
}

/* =============================
   BOOK DATA (static fallback)
============================= */
const BOOKS = [
  { id:1,  title:"The Great Gatsby",          author:"F. Scott Fitzgerald", genre:"Classic Fiction", year:1925, pages:180, rating:4.5, color:["#8b2635","#c0392b"], description:"A portrait of the Jazz Age in all of its excess and decadence. Jay Gatsby's obsession with the beautiful Daisy Buchanan becomes a timeless meditation on the American Dream and the impossibility of recapturing the past." },
  { id:2,  title:"1984",                       author:"George Orwell",        genre:"Dystopian",       year:1949, pages:328, rating:5,   color:["#1a3a5c","#2980b9"], description:"Winston Smith lives in a totalitarian superstate ruled by Big Brother. A chilling and profoundly prescient vision of authoritarianism, surveillance, and the destruction of truth." },
  { id:3,  title:"Dune",                       author:"Frank Herbert",        genre:"Sci-Fi",          year:1965, pages:688, rating:5,   color:["#5c4a1a","#d4a017"], description:"Paul Atreides and his family accept control of the desert planet Arrakis. An epic saga of politics, religion, ecology, and power set in a feudal interstellar future." },
  { id:4,  title:"Sapiens",                    author:"Yuval Noah Harari",    genre:"Non-Fiction",     year:2011, pages:443, rating:4.5, color:["#1a5c3a","#27ae60"], description:"A sweeping history of humankind from the emergence of Homo sapiens to the present day, raising fundamental questions about what it means to be human." },
  { id:5,  title:"To Kill a Mockingbird",      author:"Harper Lee",           genre:"Classic Fiction", year:1960, pages:281, rating:5,   color:["#4a3560","#8e44ad"], description:"Seen through young Scout Finch's eyes, this novel explores racial injustice in the American South. Atticus Finch remains one of literature's great moral heroes." },
  { id:6,  title:"Thinking, Fast and Slow",    author:"Daniel Kahneman",      genre:"Non-Fiction",     year:2011, pages:499, rating:4,   color:["#2c3e50","#34495e"], description:"Nobel laureate Kahneman distills decades of research into the two systems of thinking — fast, intuitive, and emotional versus slow, deliberate, and logical." },
  { id:7,  title:"The Alchemist",              author:"Paulo Coelho",         genre:"Fiction",         year:1988, pages:208, rating:4,   color:["#7d4a00","#d48000"], description:"A young shepherd's quest for treasure becomes a deeply personal journey about following dreams, listening to your heart, and finding your Personal Legend." },
  { id:8,  title:"Atomic Habits",              author:"James Clear",          genre:"Self-Help",       year:2018, pages:320, rating:4.5, color:["#1a4a6b","#1f6fa3"], description:"An easy and proven way to build good habits and break bad ones through the power of tiny, incremental improvements that compound into remarkable results." },
  { id:9,  title:"The Hobbit",                 author:"J.R.R. Tolkien",       genre:"Fantasy",         year:1937, pages:310, rating:5,   color:["#2d5a1b","#4a8f2d"], description:"Bilbo Baggins is swept into an epic quest to reclaim a dwarf kingdom from the dragon Smaug — a warm, adventurous tale of courage and unexpected heroism." },
  { id:10, title:"Educated",                   author:"Tara Westover",        genre:"Memoir",          year:2018, pages:352, rating:4.5, color:["#5c2a35","#9b4555"], description:"Tara Westover never set foot in a classroom until age 17. A testament to the transformative power of education and the struggle to define oneself." },
  { id:11, title:"Project Hail Mary",          author:"Andy Weir",            genre:"Sci-Fi",          year:2021, pages:476, rating:5,   color:["#1a2a5c","#2c4499"], description:"Ryland Grace wakes alone on a spacecraft with no memory of why he's there. The answer is staggering: he's humanity's last hope against an extinction-level threat." },
  { id:12, title:"Man's Search for Meaning",   author:"Viktor E. Frankl",     genre:"Non-Fiction",     year:1946, pages:165, rating:5,   color:["#3a2a1a","#6b4a30"], description:"A Holocaust survivor describes his experiences in Nazi concentration camps and argues that we cannot avoid suffering but can choose how to find meaning within it." },
];

/* =============================
   PREFERENCES (localStorage)
============================= */
const SESSION_KEY = 'bookportfolio_session'; // cleared on tab close
const PREFS_KEY   = 'bookportfolio_prefs';   // persists across sessions

function savePrefs(patch) {
  // page → sessionStorage (resets on tab close)
  // sound → localStorage (true preference, survives close)
  try {
    if (patch.page !== undefined) {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, page: patch.page }));
    }
    if (patch.sound !== undefined) {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...p, sound: patch.sound }));
    }
  } catch (_) {}
}

function loadPrefs() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
    const prefs   = JSON.parse(localStorage.getItem(PREFS_KEY)   || '{}');
    return { ...prefs, ...session };
  } catch (_) { return {}; }
}

/* =============================
   SUPABASE CONFIG
============================= */
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

async function loadBooks() {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') return BOOKS;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/books?select=*&order=id.asc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) throw new Error(res.statusText);
    const rows = await res.json();
    return rows.map(r => ({
      id:          r.id,
      title:       r.title,
      author:      r.author,
      genre:       r.genre,
      year:        r.year,
      pages:       r.pages,
      rating:      parseFloat(r.rating),
      color:       r.color,
      cover_url:   r.cover_url || null,
      description: r.description,
    }));
  } catch (_) {
    return BOOKS;
  }
}

/* =============================
   PAGE DIMENSIONS
============================= */
const PW = 700;
const PH = 933;

/* =============================
   CANVAS HELPERS
============================= */
function makePage(drawFn) {
  const c = document.createElement('canvas');
  c.width = PW; c.height = PH;
  drawFn(c.getContext('2d'));
  return c.toDataURL('image/jpeg', 0.91);
}

/* Clean ruled page — white paper, black horizontal lines, left margin */
function drawRuled(ctx, pageNum) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PW, PH);

  // Horizontal lines
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 0.75;
  for (let y = 72; y < PH - 24; y += 28) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PW, y); ctx.stroke();
  }

  // Left margin line
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, PH); ctx.stroke();

  // Page number — bottom right, small
  if (pageNum) {
    ctx.font = '10px Arial,sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(pageNum, PW - 24, PH - 14);
  }
}

/* =============================
   PAGE GENERATOR
   Cover: dark placeholder. Interior pages: clean white ruled paper only.
   Swap interior pages with PDF renders when PDF is ready.
============================= */
function generatePages(books) {
  const pages = [];
  const totalSpreads = books.length; // 12

  // Front cover — dark placeholder
  pages.push(makePage(ctx => {
    const g = ctx.createLinearGradient(0, 0, PW, PH);
    g.addColorStop(0, '#1e0f08'); g.addColorStop(1, '#3a1e10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);

    ctx.strokeStyle = 'rgba(212,168,83,0.55)'; ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, PW - 44, PH - 44);
    ctx.strokeStyle = 'rgba(212,168,83,0.18)'; ctx.lineWidth = 1;
    ctx.strokeRect(30, 30, PW - 60, PH - 60);

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '13px Georgia,serif';
    ctx.fillStyle = 'rgba(212,168,83,0.5)';
    ctx.fillText('A PERSONAL', PW / 2, PH / 2 - 130);

    ctx.font = 'bold 68px Georgia,serif';
    ctx.fillStyle = '#f0c97a';
    ctx.fillText('BOOK', PW / 2, PH / 2 - 100);
    ctx.fillText('PORTFOLIO', PW / 2, PH / 2 - 22);

    ctx.strokeStyle = '#d4a853'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PW/2 - 80, PH/2 + 62); ctx.lineTo(PW/2 + 80, PH/2 + 62); ctx.stroke();

    ctx.font = 'italic 20px Georgia,serif';
    ctx.fillStyle = 'rgba(212,168,83,0.6)';
    ctx.fillText('2026', PW / 2, PH / 2 + 76);

  }));

  // Interior pages — clean ruled paper, one pair per book spread
  for (let i = 0; i < totalSpreads; i++) {
    const leftNum  = i * 2 + 2;
    const rightNum = i * 2 + 3;
    pages.push(makePage(ctx => { drawRuled(ctx, leftNum);  }));
    pages.push(makePage(ctx => { drawRuled(ctx, rightNum); }));
  }

  // Back cover — dark placeholder
  pages.push(makePage(ctx => {
    const g = ctx.createLinearGradient(PW, PH, 0, 0);
    g.addColorStop(0, '#1e0f08'); g.addColorStop(1, '#3a1e10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);
    ctx.strokeStyle = 'rgba(212,168,83,0.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, PW - 44, PH - 44);
  }));

  return pages;
}

/* =============================
   INIT
============================= */
document.addEventListener('DOMContentLoaded', async () => {
  const books      = await loadBooks();
  const pages      = generatePages(books);
  const savedPrefs = loadPrefs();
  const startPage  = (savedPrefs.page && savedPrefs.page > 1) ? savedPrefs.page : 1;
  const startSound = savedPrefs.sound !== false;

  totalPageCount = pages.length;
  document.getElementById('ctrl-page-total').textContent = totalPageCount;

  if (window.DEARFLIP) {
    window.DEARFLIP.defaults.minZoom = 0.35;
  }

  const flipApp = new window.DEARFLIP.Application({
    source:               pages,
    element:              window.jQuery('#portfolio-viewer'),
    height:               Math.round(window.innerHeight * 0.79),
    backgroundColor:      '#b8b5b0',
    is3D:                 true,
    has3DShadow:          true,
    hasSpiral:            true,
    spiralColor:          0xC0C0C0,
    flipbookHardPages:    'cover',
    duration:             900,
    enableSound:          true,
    showDownloadControl:  false,
    showShareControl:     false,
    showSearchControl:    false,
    controlsPosition:     'bottom',
    autoEnableThumbnail:  false,
    openPage:             startPage,
    minZoom:              0.35,
    maxZoom:              3,
    onFlip: function(app) {
      updatePageDecor(app.currentPageNumber || 1);
    },
  });

  updatePageDecor(startPage);

  // Kill native DearFlip controls — CSS layer + JS layer (scoped to viewer only)
  const NAV_SELECTORS = '.df-ui,.df-ui-center,.df-ui-nav,.df-ui-prev,.df-ui-next,.df-ui-left,.df-ui-right,.df-control-bar,.df-sidemenu-wrapper';
  function killNativeControls() {
    document.querySelectorAll(NAV_SELECTORS).forEach(el => {
      el.style.setProperty('display',        'none',  'important');
      el.style.setProperty('visibility',     'hidden','important');
      el.style.setProperty('opacity',        '0',     'important');
      el.style.setProperty('pointer-events', 'none',  'important');
    });
  }
  killNativeControls();
  NAV_KILL_RETRY_DELAYS.forEach(ms => setTimeout(killNativeControls, ms));

  // MutationObserver scoped to viewer; disconnects after DearFlip stabilises
  const navObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length > 0) {
        killNativeControls();
        return;
      }
    }
  });
  navObserver.observe(document.getElementById('portfolio-viewer'), { childList: true, subtree: true });
  setTimeout(() => navObserver.disconnect(), DEARFLIP_STABLE_MS);

  initSpatialNav(flipApp, pages.length, startSound);
});

/* =============================
   SPATIAL TOOLTIP NAV
============================= */
function initSpatialNav(flipApp, totalPages, initialSoundOn) {
  // Lazy getter — DearFlip stores dfApp in jQuery data asynchronously after init
  function getApp() { return window.jQuery('#portfolio-viewer').data('dfApp'); }
  const tooltip    = document.getElementById('ctrl-tooltip');
  const labelsUl   = document.getElementById('ctrl-labels');
  const labelItems = Array.from(labelsUl.querySelectorAll('li'));
  const buttons    = Array.from(document.querySelectorAll('.ctrl-btn'));
  const BTN = 36;

  let soundOn = initialSoundOn !== false;

  // Apply saved sound state immediately
  if (!soundOn) {
    const nativeSound = document.querySelector('.df-ui-sound');
    if (nativeSound) nativeSound.click();
    document.getElementById('icon-sound-on').style.display  = 'none';
    document.getElementById('icon-sound-off').style.display = '';
  }

  function showTooltip(idx) {
    const item   = labelItems[idx];
    const itemW  = item.offsetWidth;
    const itemOL = item.offsetLeft;
    const x      = -((itemW - BTN) / 2);
    const counterW = document.getElementById('ctrl-counter').offsetWidth || 52;
    const leftPx   = counterW + (idx / buttons.length) * (buttons.length * BTN);

    tooltip.style.left      = leftPx + 'px';
    tooltip.style.transform = `translateX(${x}px)`;
    tooltip.style.width     = itemW + 'px';
    tooltip.style.opacity   = '1';
    labelsUl.style.transform = `translateX(${-itemOL}px)`;

    labelItems.forEach((li, i) => {
      const span = li.querySelector('span');
      if (i === idx) span.classList.remove('blurred');
      else span.classList.add('blurred');
    });
  }

  function hideTooltip() {
    tooltip.style.opacity = '0';
  }

  buttons.forEach((btn, i) => {
    btn.addEventListener('mouseenter', () => showTooltip(i));
    btn.addEventListener('mouseleave', hideTooltip);
  });

  // Poll currentPageNumber to keep counter + decor in sync
  let lastTrackedPage = 1;
  setInterval(() => {
    const app = getApp();
    const p = app && app.currentPageNumber;
    if (p && p !== lastTrackedPage) {
      lastTrackedPage = p;
      updatePageDecor(p);
    }
  }, PAGE_POLL_MS);

  // First page
  document.getElementById('ctrl-first').addEventListener('click', () => {
    const app = getApp(); if (!app) return;
    app.start(); updatePageDecor(1); lastTrackedPage = 1;
  });

  // Cover (home)
  document.getElementById('ctrl-cover').addEventListener('click', () => {
    const app = getApp(); if (!app) return;
    app.start(); updatePageDecor(1); lastTrackedPage = 1;
  });

  // Thumbnails / grid view
  document.getElementById('ctrl-pages').addEventListener('click', () => {
    const btn = document.querySelector('.df-ui-thumbnail');
    if (btn) { btn.click(); return; }
    const app = getApp(); if (!app) return;
    try { app.initThumbs(); } catch (_) {}
  });

  // Zoom in — delegate to DearFlip's native hidden button (dfApp.zoom() broken in 3D mode)
  document.getElementById('ctrl-zoomin').addEventListener('click', () => {
    const btn = document.querySelector('.df-ui-zoomin');
    if (btn) btn.click();
  });

  // Zoom out — same approach
  document.getElementById('ctrl-zoomout').addEventListener('click', () => {
    const btn = document.querySelector('.df-ui-zoomout');
    if (btn) btn.click();
  });

  // Last page
  document.getElementById('ctrl-last').addEventListener('click', () => {
    const app = getApp(); if (!app) return;
    app.end(); updatePageDecor(totalPages); lastTrackedPage = totalPages;
  });

  // Sound toggle — click DearFlip's hidden native btn (it owns viewer.soundOn state)
  document.getElementById('ctrl-sound').addEventListener('click', () => {
    soundOn = !soundOn;
    const nativeSound = document.querySelector('.df-ui-sound');
    if (nativeSound) nativeSound.click();
    document.getElementById('icon-sound-on').style.display  = soundOn ? ''     : 'none';
    document.getElementById('icon-sound-off').style.display = soundOn ? 'none' : '';
    document.getElementById('ctrl-sound').title = soundOn ? 'Sound On' : 'Sound Off';
    savePrefs({ sound: soundOn });
  });

  // Fullscreen — whole-page fullscreen keeps fixed-position controls visible
  const fsBtn = document.getElementById('ctrl-fullscreen');
  fsBtn.addEventListener('click', () => {
    const el  = document.documentElement;
    const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const enter = el.requestFullscreen || el.webkitRequestFullscreen;
    const exit  = document.exitFullscreen || document.webkitExitFullscreen;
    if (!inFs && enter) {
      enter.call(el).catch(() => {});
    } else if (inFs && exit) {
      exit.call(document).catch(() => {});
    }
  });
  // Sync icon when fullscreen changes (Esc key, etc.)
  document.addEventListener('fullscreenchange', syncFsIcon);
  document.addEventListener('webkitfullscreenchange', syncFsIcon);
  function syncFsIcon() {
    const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.getElementById('icon-fullscreen-enter').style.display = inFs ? 'none' : '';
    document.getElementById('icon-fullscreen-exit').style.display  = inFs ? ''     : 'none';
  }

  // Download PDF — disabled until PDF source is connected
  const dlBtn = document.getElementById('ctrl-download');
  dlBtn.disabled = true;
  dlBtn.setAttribute('aria-disabled', 'true');
  dlBtn.title  = 'PDF download — coming soon';
  dlBtn.style.opacity = '0.4';
  dlBtn.style.cursor  = 'not-allowed';
}
