/* =============================
   PAGE PERIPHERAL DATA
   Each entry maps to one flipbook page (1-indexed).
   left/right: text shown on side edges — swap with your own copy.
   topLeft/topRight: artifact clusters at top corners.
   bottomLeft/bottomRight: thumbnail strip at bottom corners.
   Each artifact: { label: string } for placeholder, or { src: string, label: string } for image.
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
  // 2–3 — Spread 1
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
  // 4–5 — Spread 2
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
  // 6–7 — Spread 3
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
  // 8–9 — Spread 4
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
  // 10–11 — Spread 5
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
  // 12–13 — Spread 6
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
  // 14–15 — Spread 7
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
  // 16–17 — Spread 8
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
  // 18–19 — Spread 9
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
  // 20–21 — Spread 10
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
  // 22–23 — Spread 11
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
  // 24–25 — Spread 12
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

function updatePageDecor(pageNum) {
  const idx = Math.max(0, Math.min(pageNum - 1, PAGE_DATA.length - 1));
  const data = PAGE_DATA[idx];
  if (!data) return;

  const leftEl   = document.getElementById('side-text-left');
  const rightEl  = document.getElementById('side-text-right');
  const leftTxt  = document.getElementById('side-text-left-content');
  const rightTxt = document.getElementById('side-text-right-content');
  const tl = document.getElementById('artifacts-top-left');
  const tr = document.getElementById('artifacts-top-right');
  const bl = document.getElementById('artifacts-bottom-left');
  const br = document.getElementById('artifacts-bottom-right');

  // Fade out
  [leftEl, rightEl, tl, tr, bl, br].forEach(el => el.classList.add('transitioning'));

  setTimeout(() => {
    // Update text
    leftTxt.textContent  = data.left  || '';
    rightTxt.textContent = data.right || '';

    // Update artifacts
    tl.innerHTML = ''; tl.appendChild(buildArtifacts(data.topLeft     || []));
    tr.innerHTML = ''; tr.appendChild(buildArtifacts(data.topRight    || []));
    bl.innerHTML = ''; bl.appendChild(buildArtifacts(data.bottomLeft  || []));
    br.innerHTML = ''; br.appendChild(buildArtifacts(data.bottomRight || []));

    // Fade in
    [leftEl, rightEl, tl, tr, bl, br].forEach(el => el.classList.remove('transitioning'));
  }, 350);
}

/* =============================
   BOOK DATA
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
  } catch (err) {
    console.warn('Supabase fetch failed, using static data:', err);
    return BOOKS;
  }
}

async function preloadCovers(books) {
  const imgs = {};
  await Promise.all(books.map(book => {
    if (!book.cover_url) return Promise.resolve();
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => { imgs[book.id] = img; resolve(); };
      img.onerror = resolve;
      img.src = book.cover_url;
    });
  }));
  return imgs;
}

/* =============================
   PAGE DIMENSIONS
============================= */
const PW = 700;
const PH = 933;

/* =============================
   DATE GENERATOR
============================= */
const DAYS   = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY',
                'AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

function bookDate(bookIdx, side) {
  const base = new Date(2026, 3, 1);
  base.setDate(base.getDate() + bookIdx * 2 + side);
  return { day: DAYS[base.getDay()], num: base.getDate(), month: MONTHS[base.getMonth()] };
}

/* =============================
   CANVAS HELPERS
============================= */
function makePage(drawFn) {
  const c = document.createElement('canvas');
  c.width = PW; c.height = PH;
  drawFn(c.getContext('2d'));
  return c.toDataURL('image/jpeg', 0.91);
}

function drawRuled(ctx) {
  ctx.fillStyle = '#f6f2e8';
  ctx.fillRect(0, 0, PW, PH);
  ctx.strokeStyle = 'rgba(120,165,215,0.32)';
  ctx.lineWidth = 1;
  for (let y = 108; y < PH - 18; y += 26) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PW, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(210,80,80,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(70, 0); ctx.lineTo(70, PH); ctx.stroke();
}

function drawDateBox(ctx, d, right) {
  const bw = 130, bh = 86;
  const x = right ? PW - bw - 18 : 18;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, 10, bw, bh);
  ctx.strokeStyle = '#ccc8c0';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, 10, bw, bh);
  const cx = x + bw / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#444';
  ctx.font = 'bold 12px Arial,sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(d.day, cx, 16);
  ctx.font = 'bold 34px Arial,sans-serif';
  ctx.fillStyle = '#111';
  ctx.fillText(d.num, cx, 30);
  ctx.font = 'bold 12px Arial,sans-serif';
  ctx.fillStyle = '#444';
  ctx.fillText(d.month, cx, 72);
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const t = line + w + ' ';
    if (ctx.measureText(t).width > maxW && line) {
      ctx.fillText(line.trim(), x, y);
      line = w + ' '; y += lh;
    } else line = t;
  }
  ctx.fillText(line.trim(), x, y);
  return y + lh;
}

function drawPolaroid(ctx, book, cx, cy, tilt, coverImg) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt * Math.PI / 180);

  const fw = 148, fh = 190, pad = 10, photoH = 148;

  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 14; ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#fff';
  ctx.fillRect(-fw / 2 - pad, -fh / 2 - pad, fw + pad * 2, fh + pad * 2);
  ctx.shadowColor = 'transparent';

  if (coverImg) {
    ctx.drawImage(coverImg, -fw / 2, -fh / 2, fw, photoH);
  } else {
    const g = ctx.createLinearGradient(-fw / 2, -fh / 2, fw / 2, -fh / 2 + photoH);
    g.addColorStop(0, book.color[0]); g.addColorStop(1, book.color[1]);
    ctx.fillStyle = g;
    ctx.fillRect(-fw / 2, -fh / 2, fw, photoH);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `bold ${book.title.length > 16 ? 11 : 13}px Georgia,serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  wrapText(ctx, book.title, 0, -fh / 2 + photoH / 2 - 10, fw - 16, 18);

  ctx.font = '10px Arial,sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(book.year, fw / 2 - 4, -fh / 2 + photoH - 4);

  ctx.fillStyle = '#666';
  ctx.font = 'italic 10px Georgia,serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(book.author, 0, -fh / 2 + photoH + 8);

  ctx.restore();
}

function drawGenreSticker(ctx, label, color, x, y) {
  ctx.font = 'bold 11px Arial,sans-serif';
  const tw = ctx.measureText(label).width;
  const pw = tw + 18, ph = 22;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, pw, ph, 4) : ctx.rect(x, y, pw, ph);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 9, y + ph / 2);
  return pw;
}

/* =============================
   PAGE GENERATOR
============================= */
function generatePages(books, coverImgs) {
  const pages = [];

  pages.push(makePage(ctx => {
    const g = ctx.createLinearGradient(0, 0, PW, PH);
    g.addColorStop(0, '#1e0f08'); g.addColorStop(1, '#3a1e10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);

    ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 1;
    for (let y = 0; y < PH; y += 5) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(PW,y); ctx.stroke(); }

    ctx.strokeStyle = 'rgba(212,168,83,0.55)'; ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, PW - 44, PH - 44);
    ctx.strokeStyle = 'rgba(212,168,83,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(30, 30, PW - 60, PH - 60);

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '13px Georgia,serif';
    ctx.fillStyle = 'rgba(212,168,83,0.55)';
    ctx.fillText('A PERSONAL', PW / 2, PH / 2 - 130);

    ctx.font = 'bold 68px Georgia,serif';
    ctx.fillStyle = '#f0c97a';
    ctx.fillText('BOOK', PW / 2, PH / 2 - 100);
    ctx.fillText('PORTFOLIO', PW / 2, PH / 2 - 22);

    ctx.strokeStyle = '#d4a853'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PW/2 - 90, PH/2 + 62); ctx.lineTo(PW/2 + 90, PH/2 + 62); ctx.stroke();

    ctx.font = 'italic 20px Georgia,serif';
    ctx.fillStyle = 'rgba(212,168,83,0.65)';
    ctx.fillText('2026', PW / 2, PH / 2 + 76);

    ctx.font = '14px Georgia,serif';
    ctx.fillStyle = 'rgba(240,201,122,0.38)';
    ctx.fillText('A Collection of 12 Books', PW / 2, PH - 76);
  }));

  books.forEach((book, i) => {
    const ld = bookDate(i, 0);
    const rd = bookDate(i, 1);
    const tilt = [-4, 2, -2, 3, -3, 2][i % 6];

    pages.push(makePage(ctx => {
      drawRuled(ctx);
      drawDateBox(ctx, ld, false);

      ctx.save();
      ctx.translate(35, PH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = book.color[0];
      ctx.font = 'bold 11px Arial,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('No.' + String(i + 1).padStart(2, '0'), 0, 0);
      ctx.restore();

      drawGenreSticker(ctx, book.genre, book.color[0], 84, 118);

      const fs = book.title.length > 20 ? 24 : 30;
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `bold ${fs}px Georgia,serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const afterTitle = wrapText(ctx, book.title, 84, 158, PW - 120, fs + 10);

      ctx.font = 'italic 16px Georgia,serif';
      ctx.fillStyle = '#555';
      ctx.fillText('by ' + book.author, 84, afterTitle + 4);

      ctx.font = '13px Arial,sans-serif';
      ctx.fillStyle = '#888';
      ctx.fillText('Published ' + book.year + '  ·  ' + book.pages + ' pages', 84, afterTitle + 32);

      drawPolaroid(ctx, book, PW * 0.68, PH * 0.68, tilt, coverImgs && coverImgs[book.id]);

      ctx.font = '11px Arial'; ctx.fillStyle = '#aaa';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      const n = i * 2 + 2;
      ctx.fillText(n + '-' + (n+1) + '  ·  ' + (n + 2), 84, PH - 12);
    }));

    pages.push(makePage(ctx => {
      drawRuled(ctx);
      drawDateBox(ctx, rd, true);

      let stars = '';
      for (let s = 1; s <= 5; s++)
        stars += book.rating >= s ? '★' : book.rating >= s - 0.5 ? '✦' : '☆';
      ctx.font = '26px Arial,sans-serif';
      ctx.fillStyle = '#c8992a';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(stars, 84, 118);
      ctx.font = '12px Arial,sans-serif';
      ctx.fillStyle = '#888';
      ctx.fillText('  ' + book.rating + ' / 5', 84 + ctx.measureText(stars).width, 126);

      ctx.font = 'bold 13px Arial,sans-serif';
      ctx.fillStyle = '#444';
      ctx.fillText('MY THOUGHTS', 84, 162);

      ctx.strokeStyle = book.color[0]; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(84, 178); ctx.lineTo(84 + 110, 178); ctx.stroke();

      ctx.font = '15px Georgia,serif';
      ctx.fillStyle = '#2a2a2a';
      ctx.textBaseline = 'top';
      wrapText(ctx, book.description, 84, 192, PW - 120, 26);

      ctx.font = '11px Arial'; ctx.fillStyle = '#aaa';
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(String(i * 2 + 3), PW - 20, PH - 12);
    }));
  });

  pages.push(makePage(ctx => {
    const g = ctx.createLinearGradient(PW, PH, 0, 0);
    g.addColorStop(0, '#1e0f08'); g.addColorStop(1, '#3a1e10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);
    ctx.strokeStyle = 'rgba(212,168,83,0.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, PW - 44, PH - 44);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(212,168,83,0.55)';
    ctx.font = 'italic 22px Georgia,serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('"A reader lives a thousand lives', PW / 2, PH / 2 - 28);
    ctx.fillText('before he dies."', PW / 2, PH / 2 + 10);
    ctx.font = '14px Georgia,serif';
    ctx.fillStyle = 'rgba(212,168,83,0.35)';
    ctx.fillText('— George R.R. Martin', PW / 2, PH / 2 + 48);
  }));

  return pages;
}

/* =============================
   INIT
============================= */
document.addEventListener('DOMContentLoaded', async () => {
  const books     = await loadBooks();
  const coverImgs = await preloadCovers(books);
  const pages     = generatePages(books, coverImgs);

  // Set minZoom before and in config for maximum compatibility
  if (window.DEARFLIP) {
    window.DEARFLIP.defaults.minZoom = 0.35;
  }

  const flipApp = new window.DEARFLIP.Application({
    source:               pages,
    element:              window.jQuery('#portfolio-viewer'),
    height:               window.innerHeight,
    backgroundColor:      '#b8b5b0',
    is3D:                 true,
    has3DShadow:          true,
    flipbookHardPages:    'cover',
    duration:             900,
    enableSound:          true,
    showDownloadControl:  false,
    showShareControl:     false,
    showSearchControl:    false,
    controlsPosition:     'bottom',
    autoEnableThumbnail:  false,
    openPage:             1,
    minZoom:              0.35,
    maxZoom:              3,
    onFlip: function(e, pageNum) {
      const num = (typeof pageNum === 'object' && pageNum !== null)
        ? (pageNum.page || pageNum.currentPage || 1)
        : (pageNum || 1);
      updatePageDecor(num);
    },
  });

  // Also listen via jQuery event for redundancy
  window.jQuery('#portfolio-viewer').on('afterFlip.dearflip flip.dearflip', function(e, data) {
    if (data && (data.page || data.currentPage)) {
      updatePageDecor(data.page || data.currentPage);
    }
  });

  // Set initial peripheral content
  updatePageDecor(1);

  setTimeout(() => initSpatialNav(flipApp), 600);
});

/* =============================
   SPATIAL TOOLTIP NAV
============================= */
function initSpatialNav(flipApp) {
  const tooltip    = document.getElementById('ctrl-tooltip');
  const labelsUl   = document.getElementById('ctrl-labels');
  const labelItems = Array.from(labelsUl.querySelectorAll('li'));
  const buttons    = Array.from(document.querySelectorAll('.ctrl-btn'));
  const BTN = 36;

  function showTooltip(idx) {
    const item   = labelItems[idx];
    const itemW  = item.offsetWidth;
    const itemOL = item.offsetLeft;
    const x      = -((itemW - BTN) / 2);
    const leftPct = (idx / buttons.length) * 100;

    tooltip.style.left      = leftPct + '%';
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

  function clickNative(selector) {
    const el = document.querySelector(selector);
    if (el) { el.click(); return true; }
    return false;
  }

  document.getElementById('ctrl-cover').addEventListener('click', () => {
    try { flipApp.gotoPage(1); } catch (_) {
      try { flipApp.app.gotoPage(1); } catch (_2) {
        clickNative('.df-btn-first-page, [data-df-btn="firstPage"]');
      }
    }
  });

  document.getElementById('ctrl-pages').addEventListener('click', () => {
    if (!clickNative('.df-btn-thumbnail')) {
      try { flipApp.app.toggleThumbnail(); } catch (_) {}
    }
  });

  document.getElementById('ctrl-zoomin').addEventListener('click', () => {
    if (!clickNative('.df-btn-zoom-in, [class*="zoom-in"]')) {
      try { flipApp.app.zoomIn(); } catch (_) {}
    }
  });

  document.getElementById('ctrl-zoomout').addEventListener('click', () => {
    if (!clickNative('.df-btn-zoom-out, [class*="zoom-out"]')) {
      try { flipApp.app.zoomOut(); } catch (_) {}
    }
  });

  document.getElementById('ctrl-fullscreen').addEventListener('click', () => {
    if (!clickNative('.df-btn-fullscreen, [class*="fullscreen"]')) {
      try { flipApp.toggleFullScreen(); } catch (_) {
        try { flipApp.app.toggleFullScreen(); } catch (_2) {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }
      }
    }
  });
}
