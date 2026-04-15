/* =============================
   BOOK DATA
============================= */
const books = [
  {
    id: 1,
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    genre: "Classic Fiction",
    year: 1925,
    pages: 180,
    rating: 4.5,
    color: ["#8b2635", "#c0392b"],
    description:
      "A portrait of the Jazz Age in all of its excess and decadence, this novel follows the mysterious millionaire Jay Gatsby and his obsession with the beautiful Daisy Buchanan. A timeless meditation on the American Dream, class, and the impossibility of recapturing the past.",
  },
  {
    id: 2,
    title: "1984",
    author: "George Orwell",
    genre: "Dystopian",
    year: 1949,
    pages: 328,
    rating: 5,
    color: ["#1a3a5c", "#2980b9"],
    description:
      "Winston Smith lives in a totalitarian superstate ruled by Big Brother. He secretly rebels against the Party and falls in love, only to face the terrifying machinery of state control. A chilling and profoundly prescient vision of authoritarianism, surveillance, and truth.",
  },
  {
    id: 3,
    title: "Dune",
    author: "Frank Herbert",
    genre: "Science Fiction",
    year: 1965,
    pages: 688,
    rating: 5,
    color: ["#5c4a1a", "#d4a017"],
    description:
      "Set in a distant future amidst a feudal interstellar society, Dune tells the story of young Paul Atreides as his family accepts control of the desert planet Arrakis, the only source of the universe's most valuable substance. An epic saga of politics, religion, ecology, and power.",
  },
  {
    id: 4,
    title: "Sapiens",
    author: "Yuval Noah Harari",
    genre: "Non-Fiction",
    year: 2011,
    pages: 443,
    rating: 4.5,
    color: ["#1a5c3a", "#27ae60"],
    description:
      "A sweeping history of humankind, from the emergence of Homo sapiens in Africa to the present day. Harari examines how biology, culture, and ideas shaped human societies, raising fundamental questions about what it means to be human.",
  },
  {
    id: 5,
    title: "To Kill a Mockingbird",
    author: "Harper Lee",
    genre: "Classic Fiction",
    year: 1960,
    pages: 281,
    rating: 5,
    color: ["#4a3560", "#8e44ad"],
    description:
      "Narrated through the eyes of young Scout Finch, this novel explores racial injustice and moral growth in the American South. Her father, Atticus Finch, defends a Black man falsely accused of a crime—a role that would cement him as one of literature's great moral heroes.",
  },
  {
    id: 6,
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    genre: "Non-Fiction",
    year: 2011,
    pages: 499,
    rating: 4,
    color: ["#2c3e50", "#34495e"],
    description:
      "Nobel laureate Daniel Kahneman distills decades of research into the two systems of thinking: fast, intuitive, and emotional; and slow, deliberate, and logical. A revelatory tour through the science of the mind and the nature of human judgment.",
  },
  {
    id: 7,
    title: "The Alchemist",
    author: "Paulo Coelho",
    genre: "Fiction",
    year: 1988,
    pages: 208,
    rating: 4,
    color: ["#7d4a00", "#d48000"],
    description:
      "A young Andalusian shepherd boy dreams of finding a worldly treasure buried near the Egyptian pyramids. His quest becomes a deeply personal journey about following your dreams, listening to your heart, and finding your Personal Legend.",
  },
  {
    id: 8,
    title: "Atomic Habits",
    author: "James Clear",
    genre: "Self-Help",
    year: 2018,
    pages: 320,
    rating: 4.5,
    color: ["#1a4a6b", "#1f6fa3"],
    description:
      "An easy and proven way to build good habits and break bad ones. James Clear distills the most fundamental information about habit formation and provides a simple, step-by-step plan for making lasting changes through the power of tiny, incremental improvements.",
  },
  {
    id: 9,
    title: "The Hobbit",
    author: "J.R.R. Tolkien",
    genre: "Fantasy",
    year: 1937,
    pages: 310,
    rating: 5,
    color: ["#2d5a1b", "#4a8f2d"],
    description:
      "Bilbo Baggins, a homebody hobbit, is swept into an epic quest to reclaim a dwarf kingdom from the dragon Smaug. Tolkien's beloved prelude to The Lord of the Rings is a warm, adventurous tale of courage, friendship, and the unexpected heroism of the small.",
  },
  {
    id: 10,
    title: "Educated",
    author: "Tara Westover",
    genre: "Memoir",
    year: 2018,
    pages: 352,
    rating: 4.5,
    color: ["#5c2a35", "#9b4555"],
    description:
      "Born to survivalists in the mountains of Idaho, Tara Westover never set foot in a classroom until age 17. Her memoir is an account of the struggle to reconcile a violent, controlling family with her own thirst for knowledge—a testament to the transformative power of education.",
  },
  {
    id: 11,
    title: "Project Hail Mary",
    author: "Andy Weir",
    genre: "Science Fiction",
    year: 2021,
    pages: 476,
    rating: 5,
    color: ["#1a2a5c", "#2c4499"],
    description:
      "Ryland Grace wakes up alone on a spacecraft with no memory of who he is or why he's there. The answer he pieces together is staggering: he's humanity's last hope against an extinction-level threat. A thrillingly inventive and warmhearted science fiction adventure.",
  },
  {
    id: 12,
    title: "Man's Search for Meaning",
    author: "Viktor E. Frankl",
    genre: "Non-Fiction",
    year: 1946,
    pages: 165,
    rating: 5,
    color: ["#3a2a1a", "#6b4a30"],
    description:
      "A psychiatrist and Holocaust survivor describes his experiences in Nazi concentration camps and outlines his psychotherapeutic method—logotherapy—in this profoundly moving account. Frankl argues that we cannot avoid suffering but can choose how to cope with it and find meaning within.",
  },
];

/* =============================
   GENRE CONFIG
============================= */
const genreIcons = {
  "Classic Fiction": "📚",
  "Dystopian": "🏭",
  "Science Fiction": "🚀",
  "Non-Fiction": "🧠",
  "Fiction": "✨",
  "Self-Help": "💪",
  "Fantasy": "🐉",
  "Memoir": "📖",
};

/* =============================
   STATE
============================= */
let activeGenre = "all";
let searchQuery = "";

/* =============================
   HELPERS
============================= */
function getGenres() {
  const map = {};
  books.forEach((b) => {
    map[b.genre] = (map[b.genre] || 0) + 1;
  });
  return map;
}

function renderStars(rating) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) html += `<span class="star">&#9733;</span>`;
    else if (rating >= i - 0.5) html += `<span class="star">&#9734;</span>`;
    else html += `<span class="star empty">&#9733;</span>`;
  }
  return html;
}

function coverStyle(colors) {
  return `background: linear-gradient(145deg, ${colors[0]}, ${colors[1]});`;
}

function filteredBooks() {
  return books.filter((b) => {
    const matchGenre = activeGenre === "all" || b.genre === activeGenre;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.genre.toLowerCase().includes(q);
    return matchGenre && matchSearch;
  });
}

/* =============================
   RENDER BOOK CARDS
============================= */
function renderBooks() {
  const grid = document.getElementById("books-grid");
  const noResults = document.getElementById("no-results");
  const results = filteredBooks();
  grid.innerHTML = "";

  if (results.length === 0) {
    noResults.classList.remove("hidden");
    return;
  }
  noResults.classList.add("hidden");

  results.forEach((book, i) => {
    const card = document.createElement("div");
    card.className = "book-card fade-in";
    card.style.transitionDelay = `${i * 60}ms`;
    card.innerHTML = `
      <div class="book-cover" style="${coverStyle(book.color)}">
        <span class="book-cover-title">${book.title}</span>
        <span class="book-cover-author">${book.author}</span>
      </div>
      <div class="book-card-body">
        <span class="book-card-genre">${book.genre}</span>
        <div class="book-card-title">${book.title}</div>
        <div class="book-card-author">${book.author}</div>
        <div class="book-rating">${renderStars(book.rating)}</div>
      </div>
    `;
    card.addEventListener("click", () => openModal(book));
    grid.appendChild(card);
    requestAnimationFrame(() => card.classList.add("visible"));
  });
}

/* =============================
   GENRE FILTERS
============================= */
function renderGenreFilters() {
  const container = document.getElementById("genre-filters");
  const genres = getGenres();
  container.innerHTML = `<button class="filter-btn ${activeGenre === "all" ? "active" : ""}" data-genre="all">All</button>`;
  Object.keys(genres).forEach((g) => {
    const btn = document.createElement("button");
    btn.className = `filter-btn ${activeGenre === g ? "active" : ""}`;
    btn.dataset.genre = g;
    btn.textContent = g;
    container.appendChild(btn);
  });
  container.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeGenre = btn.dataset.genre;
      renderGenreFilters();
      renderBooks();
    });
  });
}

/* =============================
   GENRES GRID
============================= */
function renderGenresGrid() {
  const grid = document.getElementById("genres-grid");
  const genres = getGenres();
  grid.innerHTML = "";
  Object.entries(genres).forEach(([name, count]) => {
    const card = document.createElement("div");
    card.className = "genre-card fade-in";
    card.innerHTML = `
      <div class="genre-icon">${genreIcons[name] || "📗"}</div>
      <div class="genre-name">${name}</div>
      <div class="genre-count">${count} book${count > 1 ? "s" : ""}</div>
    `;
    card.addEventListener("click", () => {
      activeGenre = name;
      renderGenreFilters();
      renderBooks();
      document.getElementById("books").scrollIntoView({ behavior: "smooth" });
    });
    grid.appendChild(card);
    requestAnimationFrame(() => card.classList.add("visible"));
  });
}

/* =============================
   MODAL
============================= */
function openModal(book) {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  body.innerHTML = `
    <div class="modal-cover" style="${coverStyle(book.color)}">
      <span class="modal-cover-title">${book.title}</span>
    </div>
    <div class="modal-genre">${book.genre}</div>
    <h2 class="modal-title">${book.title}</h2>
    <div class="modal-author">by ${book.author}</div>
    <div class="modal-rating">${renderStars(book.rating)}</div>
    <div class="modal-description">${book.description}</div>
    <div class="modal-meta">
      <div class="modal-meta-item"><strong>Year:</strong> ${book.year}</div>
      <div class="modal-meta-item"><strong>Pages:</strong> ${book.pages}</div>
      <div class="modal-meta-item"><strong>Rating:</strong> ${book.rating} / 5</div>
    </div>
    <div class="modal-flipbook-action">
      <button class="btn btn-primary btn-flipbook" id="btn-flipbook">&#128366; Open 3D Flipbook</button>
    </div>
  `;
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  document.getElementById("btn-flipbook").addEventListener("click", () => {
    closeModal();
    openFlipbook(book);
  });
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

/* =============================
   HERO STATS (animated counter)
============================= */
function animateCounter(el, target, suffix = "") {
  let start = 0;
  const duration = 1200;
  const step = 16;
  const increment = target / (duration / step);
  const timer = setInterval(() => {
    start += increment;
    if (start >= target) {
      start = target;
      clearInterval(timer);
    }
    el.textContent = (Number.isInteger(target) ? Math.floor(start) : start.toFixed(1)) + suffix;
  }, step);
}

function initStats() {
  const genres = Object.keys(getGenres()).length;
  const avgRating = (books.reduce((s, b) => s + b.rating, 0) / books.length);
  animateCounter(document.getElementById("stat-total"), books.length);
  animateCounter(document.getElementById("stat-genres"), genres);
  animateCounter(document.getElementById("stat-rating"), avgRating);
}

/* =============================
   INTERSECTION OBSERVER
============================= */
function observeFadeIns() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  document.querySelectorAll(".fade-in").forEach((el) => io.observe(el));
}

/* =============================
   CONTACT FORM
============================= */
function initContactForm() {
  const form = document.getElementById("contact-form");
  const success = document.getElementById("form-success");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    success.classList.remove("hidden");
    form.reset();
    setTimeout(() => success.classList.add("hidden"), 4000);
  });
}

/* =============================
   MOBILE MENU
============================= */
function initMobileMenu() {
  const toggle = document.querySelector(".menu-toggle");
  const links = document.querySelector(".nav-links");
  toggle.addEventListener("click", () => links.classList.toggle("open"));
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => links.classList.remove("open"))
  );
}

/* =============================
   INIT
============================= */
document.addEventListener("DOMContentLoaded", () => {
  renderGenreFilters();
  renderBooks();
  renderGenresGrid();
  initStats();
  initContactForm();
  initMobileMenu();

  // Modal close
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-overlay")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const fbOverlay = document.getElementById("flipbook-overlay");
      if (fbOverlay && fbOverlay.classList.contains("open")) closeFlipbook();
      else closeModal();
    }
  });

  // Flipbook overlay close
  document.getElementById("flipbook-close").addEventListener("click", closeFlipbook);
  document.getElementById("flipbook-overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("flipbook-overlay")) closeFlipbook();
  });

  // Search
  document.getElementById("search-input").addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderBooks();
  });

  // Fade-in observer for static sections
  observeFadeIns();
  // Re-observe after render
  requestAnimationFrame(observeFadeIns);
});

/* =============================
   3D FLIPBOOK — PAGE GENERATOR
============================= */
function _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + " ";
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, y);
  return y + lineHeight;
}

function _pill(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
}

function generateBookPages(book) {
  const W = 600, H = 800;
  const [c1, c2] = book.color;

  function makeGrad(ctx, x1, y1, x2, y2) {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    return g;
  }

  function page(drawFn) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    drawFn(canvas.getContext("2d"));
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  // ── Cover ──────────────────────────────────────────────────
  const cover = page((ctx) => {
    ctx.fillStyle = makeGrad(ctx, 0, 0, W, H);
    ctx.fillRect(0, 0, W, H);

    // double border
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, W - 44, H - 44);
    ctx.strokeRect(30, 30, W - 60, H - 60);

    // thin top accent
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(0, 0, W, 6);

    // title
    const fontSize = book.title.length > 22 ? 38 : 46;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `bold ${fontSize}px Georgia, serif`;
    const afterTitle = _wrapText(ctx, book.title, W / 2, H / 2 - 95, W - 110, fontSize + 12);

    // separator
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 55, afterTitle + 4);
    ctx.lineTo(W / 2 + 55, afterTitle + 4);
    ctx.stroke();

    // author
    ctx.font = "italic 26px Georgia, serif";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText(book.author, W / 2, afterTitle + 20);

    // year (bottom)
    ctx.font = "17px Georgia, serif";
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.fillText(String(book.year), W / 2, H - 68);
  });

  // ── Info page ──────────────────────────────────────────────
  const infoPage = page((ctx) => {
    ctx.fillStyle = "#faf6f0";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = makeGrad(ctx, 0, 0, W, 0);
    ctx.fillRect(0, 0, W, 10);

    // genre pill
    const genreText = book.genre.toUpperCase();
    ctx.font = "bold 14px Georgia, serif";
    const pillW = ctx.measureText(genreText).width + 40;
    _pill(ctx, 50, 44, pillW, 34, 8, c1);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(genreText, 50 + 20, 61);

    // title
    const fs2 = book.title.length > 22 ? 34 : 40;
    ctx.fillStyle = "#2c1810";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `bold ${fs2}px Georgia, serif`;
    const afterT = _wrapText(ctx, book.title, W / 2, 102, W - 80, fs2 + 8);

    // author
    ctx.font = "italic 22px Georgia, serif";
    ctx.fillStyle = "#7a5c4a";
    ctx.fillText("by " + book.author, W / 2, afterT + 6);

    // stars
    const starsY = afterT + 60;
    let starsStr = "";
    for (let i = 1; i <= 5; i++) {
      starsStr += book.rating >= i ? "★" : book.rating >= i - 0.5 ? "✦" : "☆";
    }
    ctx.font = "34px Arial, sans-serif";
    ctx.fillStyle = "#d4a853";
    ctx.fillText(starsStr, W / 2, starsY);
    ctx.font = "16px Georgia, serif";
    ctx.fillStyle = "#7a5c4a";
    ctx.fillText(book.rating + " / 5", W / 2, starsY + 44);

    // divider
    ctx.strokeStyle = "#e8dcd0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, starsY + 82);
    ctx.lineTo(W - 60, starsY + 82);
    ctx.stroke();

    // meta rows
    const meta = [["Year Published", book.year], ["Pages", book.pages], ["Genre", book.genre]];
    let metaY = starsY + 108;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    meta.forEach(([label, val]) => {
      ctx.font = "bold 17px Georgia, serif";
      ctx.fillStyle = "#2c1810";
      ctx.fillText(label + ":", 68, metaY);
      ctx.font = "17px Georgia, serif";
      ctx.fillStyle = "#6b3d2a";
      ctx.fillText(String(val), 260, metaY);
      metaY += 38;
    });

    ctx.fillStyle = makeGrad(ctx, 0, 0, W, 0);
    ctx.fillRect(0, H - 10, W, 10);
  });

  // ── Description page ──────────────────────────────────────
  const descPage = page((ctx) => {
    ctx.fillStyle = "#faf6f0";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = makeGrad(ctx, 0, 0, W, 0);
    ctx.fillRect(0, 0, W, 10);

    ctx.fillStyle = "#2c1810";
    ctx.font = "bold 26px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("About This Book", W / 2, 40);

    ctx.strokeStyle = "#d4a853";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 70, 82);
    ctx.lineTo(W / 2 + 70, 82);
    ctx.stroke();

    ctx.font = "19px Georgia, serif";
    ctx.fillStyle = "#3a2010";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    _wrapText(ctx, book.description, 55, 110, W - 110, 30);

    ctx.fillStyle = "rgba(107,61,42,0.45)";
    ctx.font = "italic 15px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("— BookShelf Portfolio —", W / 2, H - 48);

    ctx.fillStyle = makeGrad(ctx, 0, 0, W, 0);
    ctx.fillRect(0, H - 10, W, 10);
  });

  // ── Back cover ─────────────────────────────────────────────
  const backCover = page((ctx) => {
    ctx.fillStyle = makeGrad(ctx, W, H, 0, 0);
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "bold 30px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u270F BookShelf", W / 2, H / 2 - 25);

    ctx.font = "18px Georgia, serif";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("A curated reading portfolio", W / 2, H / 2 + 24);
  });

  return [cover, infoPage, descPage, backCover];
}

/* =============================
   3D FLIPBOOK — OPEN / CLOSE
============================= */
let _flipbookApp = null;

function openFlipbook(book) {
  const overlay = document.getElementById("flipbook-overlay");
  const container = document.getElementById("flipbook-container");
  const titleEl = document.getElementById("flipbook-title");

  titleEl.textContent = book.title + " \u2014 3D Preview";
  container.innerHTML = "";
  if (_flipbookApp) { _flipbookApp = null; }

  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  const pages = generateBookPages(book);

  requestAnimationFrame(() => {
    const $ = window.jQuery || window.DEARFLIP.jQuery;
    _flipbookApp = new window.DEARFLIP.Application({
      source: pages,
      element: $(container),
      height: Math.min(window.innerHeight - 130, 560),
      duration: 800,
      backgroundColor: "transparent",
      enableSound: true,
      showDownloadControl: false,
      showShareControl: false,
      showSearchControl: false,
      is3D: true,
      has3DShadow: true,
      flipbookHardPages: "all",
    });
  });
}

function closeFlipbook() {
  const overlay = document.getElementById("flipbook-overlay");
  overlay.classList.remove("open");
  document.body.style.overflow = "";
  document.getElementById("flipbook-container").innerHTML = "";
  _flipbookApp = null;
}
