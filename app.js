/* ————————————————————————————————————————————
   My Shelf · all app logic, no dependencies
   Data lives in localStorage; nothing leaves the browser
   except book lookups to Open Library / Google Books.
   ———————————————————————————————————————————— */

"use strict";

const STORAGE_KEY = "my-shelf-v1";

const SHELVES = {
  reading:  "Reading now",
  want:     "Want to read",
  finished: "Finished",
  dnf:      "DNF",
};

/* ——— state ——— */

let state = load();
let activeShelf = "all";
let searchTerm = "";
let editingId = null;       // book id when editing, null when adding
let draftCover = "";        // cover url picked via lookup
let draftRating = 0;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.books)) return { books: data.books, activity: data.activity || [], owner: data.owner || "" };
    }
  } catch (e) { /* corrupted storage — start fresh rather than crash */ }
  return { books: [], activity: [], owner: "" };
}

const ownerName = () => state.owner || "";   // empty until the owner introduces themselves

/* possessive for the brand: "Maya" -> "Maya's", "James" -> "James'" */
const possessive = (name) => name + (/s$/i.test(name) ? "’" : "’s");

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* record that the owner did something bookish today — powers the streak */
function logActivity() {
  const today = isoDay(new Date());
  if (!state.activity.includes(today)) state.activity.push(today);
}

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ——— element lookups ——— */

const $ = (id) => document.getElementById(id);
const els = {
  greeting: $("greeting"), heroSub: $("hero-sub"), currentReading: $("current-reading"),
  brandName: $("brand-name"), footerNote: $("footer-note"),
  statsGrid: $("stats-grid"), statYear: $("stat-year"),
  shelfTabs: $("shelf-tabs"), bookGrid: $("book-grid"), search: $("search"),
  coverWall: $("cover-wall"),
  modal: $("book-modal"), modalTitle: $("modal-title"), form: $("book-form"),
  lookupBox: $("lookup-box"), lookupInput: $("lookup-input"), lookupBtn: $("lookup-btn"),
  lookupStatus: $("lookup-status"), lookupResults: $("lookup-results"),
  fTitle: $("f-title"), fAuthor: $("f-author"), fGenre: $("f-genre"), fPages: $("f-pages"),
  fStatus: $("f-status"), fCover: $("f-cover"), fNotes: $("f-notes"),
  fProgress: $("f-progress"), progressField: $("progress-field"),
  starInput: $("star-input"), btnDelete: $("btn-delete"),
  toast: $("toast"), importFile: $("import-file"),
};

/* ————————————————————————————————————————————
   Rendering
   ———————————————————————————————————————————— */

function renderAll() {
  renderGreeting();
  renderHero();
  renderStats();
  renderTabs();
  renderGrid();
  renderWall();
}

function renderGreeting() {
  const h = new Date().getHours();
  const timeOfDay = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = ownerName();
  els.greeting.textContent = name
    ? `${timeOfDay}, ${name} ☕`
    : `${timeOfDay} ☕ — tap here to add your name`;
  els.greeting.title = name ? "Tap to change your name" : "Tap to make this shelf yours";
  // keep the brand, page title and footer in sync with the owner's name
  const shelf = name ? `${possessive(name)} Shelf` : "My Shelf";
  els.brandName.textContent = shelf;
  document.title = `${shelf} · a cozy book library`;
  // footer stays as-is in the HTML — it's the gift-giver's signature
}

function renameOwner() {
  const name = prompt("Whose shelf is this? Enter your name:", ownerName());
  if (name === null) return;
  state.owner = name.trim().slice(0, 30);
  save();
  renderAll();
  toast(state.owner ? `Welcome to your shelf, ${state.owner} 💛` : "No name — this shelf keeps its mystery ✨");
}

/* warm-toned deterministic gradient for books without a cover image */
function genCoverStyle(title) {
  const palettes = [
    ["#c05e3a", "#d9942b"], ["#8e4048", "#c05e3a"], ["#6d7f4e", "#a8933a"],
    ["#a34a2b", "#7c5cbf"], ["#3d6b6b", "#6d9f7f"], ["#9a5a2b", "#c9a03a"],
  ];
  let hash = 0;
  for (const ch of String(title)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = palettes[hash % palettes.length];
  return `background: linear-gradient(155deg, ${a}, ${b});`;
}

function coverHtml(book) {
  if (book.cover) {
    return `<div class="cover"><img src="${esc(book.cover)}" alt="Cover of ${esc(book.title)}" loading="lazy"
      onerror="this.parentElement.innerHTML=window.__genCover(${JSON.stringify(String(book.id))})" /></div>`;
  }
  return `<div class="cover"><div class="cover-gen" style="${genCoverStyle(book.title)}">
      <span class="cg-title">${esc(book.title)}</span>
      <span class="cg-author">${esc(book.author || "")}</span>
    </div></div>`;
}

/* used by the <img onerror> fallback above — swaps a broken image for a generated cover */
window.__genCover = (id) => {
  const b = state.books.find((x) => x.id === id);
  if (!b) return "";
  return `<div class="cover-gen" style="${genCoverStyle(b.title)}">
    <span class="cg-title">${esc(b.title)}</span><span class="cg-author">${esc(b.author || "")}</span></div>`;
};

function starsHtml(rating) {
  if (!rating) return "";
  let out = '<div class="book-stars">';
  for (let i = 1; i <= 5; i++) out += `<span${i <= rating ? "" : ' class="off"'}>★</span>`;
  return out + "</div>";
}

/* — hero: currently reading — */

function renderHero() {
  const reading = state.books
    .filter((b) => b.status === "reading")
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

  if (!reading.length) {
    els.currentReading.innerHTML = `
      <div class="reading-empty">
        <p class="big">Nothing on the nightstand yet 🕯</p>
        <p>Add a book and mark it “Reading now” — it'll glow right here.</p>
      </div>`;
    return;
  }

  const b = reading[0];
  const pct = b.pages ? Math.min(100, Math.round(((b.progress || 0) / b.pages) * 100)) : 0;
  const extra = reading.length > 1 ? ` <span style="opacity:.7">(+${reading.length - 1} more on the go)</span>` : "";

  els.currentReading.innerHTML = `
    <div class="reading-card">
      ${coverHtml(b)}
      <div class="reading-body">
        <p class="reading-label">Currently reading${extra}</p>
        <h2 class="reading-title">${esc(b.title)}</h2>
        ${b.author ? `<p class="reading-author">by ${esc(b.author)}</p>` : ""}
        <div class="progress-wrap">
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="progress-meta">
            <span>${b.pages ? `Page ${b.progress || 0} of ${b.pages} · ${pct}%` : "Add a page count to track progress"}</span>
            <span>
              <button class="btn btn-ghost" data-action="log-progress" data-id="${esc(b.id)}">Update progress</button>
              <button class="btn btn-primary" data-action="finish" data-id="${esc(b.id)}">Finished it! 🎉</button>
            </span>
          </div>
        </div>
      </div>
    </div>`;
}

/* — stats: a little year in review — */

function computeStats() {
  const year = new Date().getFullYear();
  const finished = state.books.filter((b) => b.status === "finished");
  const finishedThisYear = finished.filter((b) => b.dateFinished && new Date(b.dateFinished).getFullYear() === year);

  // pages read = every finished book's pages + current progress in active reads
  let pages = 0;
  for (const b of finished) pages += Number(b.pages) || 0;
  for (const b of state.books) if (b.status === "reading") pages += Number(b.progress) || 0;

  // streak: consecutive days with activity, ending today or yesterday
  const days = new Set(state.activity);
  let streak = 0;
  const cursor = new Date();
  if (!days.has(isoDay(cursor))) cursor.setDate(cursor.getDate() - 1); // grace: today not logged yet
  while (days.has(isoDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // favourite genres across finished + reading books
  const tally = {};
  for (const b of state.books) {
    if (!b.genre || b.status === "want") continue;
    const g = b.genre.trim().toLowerCase();
    if (g) tally[g] = (tally[g] || 0) + 1;
  }
  const topGenres = Object.entries(tally).sort((a, z) => z[1] - a[1]).slice(0, 2)
    .map(([g]) => g.replace(/\b\w/g, (c) => c.toUpperCase()));

  return { year, finishedThisYear: finishedThisYear.length, pages, streak, topGenres };
}

function renderStats() {
  const s = computeStats();
  els.statYear.textContent = s.year;
  const cards = [
    { emoji: "📚", value: s.finishedThisYear, label: `book${s.finishedThisYear === 1 ? "" : "s"} finished in ${s.year}`, sub: s.finishedThisYear ? "look at you go" : "the year is young" },
    { emoji: "📖", value: s.pages.toLocaleString(), label: "pages read in total", sub: s.pages ? `that's ~${Math.max(1, Math.round(s.pages / 300))} paperbacks thick` : "every page counts" },
    { emoji: "🔥", value: s.streak, label: `day streak`, sub: s.streak ? "keep the fire lit" : "log something today!" },
    { emoji: "💛", value: s.topGenres[0] || "—", label: "favourite genre", sub: s.topGenres[1] ? `then ${s.topGenres[1]}` : "based on your shelves", isText: true },
  ];
  els.statsGrid.innerHTML = cards.map((c) => `
    <div class="stat-card">
      <span class="stat-emoji">${c.emoji}</span>
      <span class="stat-value" ${c.isText ? 'style="font-size:1.35rem;line-height:1.2"' : ""}>${esc(c.value)}</span>
      <span class="stat-label">${esc(c.label)}</span>
      <span class="stat-sub">${esc(c.sub)}</span>
    </div>`).join("");
}

/* — shelves & grid — */

function renderTabs() {
  const counts = { all: state.books.length };
  for (const key of Object.keys(SHELVES)) counts[key] = state.books.filter((b) => b.status === key).length;
  els.shelfTabs.querySelectorAll(".shelf-tab").forEach((tab) => {
    const shelf = tab.dataset.shelf;
    const base = shelf === "all" ? "All" : SHELVES[shelf];
    tab.innerHTML = `${base}<span class="count">${counts[shelf]}</span>`;
    tab.classList.toggle("active", shelf === activeShelf);
  });
}

function renderGrid() {
  let books = [...state.books].sort((a, z) => (z.dateAdded || 0) - (a.dateAdded || 0));
  if (activeShelf !== "all") books = books.filter((b) => b.status === activeShelf);
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    books = books.filter((b) =>
      (b.title || "").toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q) ||
      (b.genre || "").toLowerCase().includes(q));
  }

  if (!books.length) {
    const msg = searchTerm
      ? { big: "No matches on this shelf", p: "Try a different search — or add it as a new book!" }
      : activeShelf === "all"
        ? { big: ownerName() ? `Your shelves are waiting, ${ownerName()} ✨` : "Your shelves are waiting ✨", p: "Tap “Add a book” to place the first one." }
        : { big: `Nothing on “${activeShelf === "all" ? "All" : SHELVES[activeShelf]}” yet`, p: "Books you move here will appear on this shelf." };
    els.bookGrid.innerHTML = `<div class="grid-empty"><p class="big">${esc(msg.big)}</p><p>${esc(msg.p)}</p></div>`;
    return;
  }

  els.bookGrid.innerHTML = books.map((b) => `
    <button class="book-card" data-action="edit" data-id="${esc(b.id)}">
      ${coverHtml(b)}
      <span class="book-info">
        <span class="book-title">${esc(b.title)}</span>
        ${b.author ? `<span class="book-author">${esc(b.author)}</span>` : ""}
        ${starsHtml(b.rating)}
        <span class="badge badge-${esc(b.status)}">${SHELVES[b.status] || b.status}</span>
      </span>
    </button>`).join("");
}

/* — cover wall — */

function renderWall() {
  const finished = state.books.filter((b) => b.status === "finished")
    .sort((a, z) => (z.dateFinished || 0) - (a.dateFinished || 0));
  if (!finished.length) {
    els.coverWall.innerHTML = `<p class="wall-empty">Your finished books will line up here, like a shelf you can carry anywhere.</p>`;
    return;
  }
  els.coverWall.innerHTML = finished.map((b) => `
    <button class="wall-book" data-action="edit" data-id="${esc(b.id)}" title="${esc(b.title)}">
      ${coverHtml(b)}
    </button>`).join("");
}

/* ————————————————————————————————————————————
   Add / edit modal
   ———————————————————————————————————————————— */

function openModal(bookId = null) {
  editingId = bookId;
  const book = bookId ? state.books.find((b) => b.id === bookId) : null;

  els.modalTitle.textContent = book ? "Edit book" : "Add a book";
  els.lookupBox.hidden = !!book;                 // lookup only when adding
  els.btnDelete.hidden = !book;
  els.lookupInput.value = "";
  els.lookupResults.innerHTML = "";
  els.lookupStatus.hidden = true;

  els.fTitle.value = book?.title || "";
  els.fAuthor.value = book?.author || "";
  els.fGenre.value = book?.genre || "";
  els.fPages.value = book?.pages || "";
  els.fStatus.value = book?.status || "want";
  els.fCover.value = book?.cover || "";
  els.fNotes.value = book?.notes || "";
  els.fProgress.value = book?.progress || "";
  draftCover = book?.cover || "";
  setDraftRating(book?.rating || 0);
  toggleProgressField();

  els.modal.hidden = false;
  document.body.style.overflow = "hidden";
  if (!book) els.lookupInput.focus();
}

function closeModal() {
  els.modal.hidden = true;
  document.body.style.overflow = "";
  editingId = null;
}

function toggleProgressField() {
  els.progressField.hidden = els.fStatus.value !== "reading";
}

function setDraftRating(n) {
  draftRating = n;
  els.starInput.querySelectorAll("[data-star]").forEach((btn) => {
    btn.classList.toggle("lit", Number(btn.dataset.star) <= n);
  });
}

function submitForm(e) {
  e.preventDefault();
  const title = els.fTitle.value.trim();
  if (!title) return;

  const status = els.fStatus.value;
  const existing = editingId ? state.books.find((b) => b.id === editingId) : null;

  const book = {
    id: existing?.id || uid(),
    title,
    author: els.fAuthor.value.trim(),
    genre: els.fGenre.value.trim(),
    pages: Number(els.fPages.value) || null,
    cover: els.fCover.value.trim() || null,
    status,
    rating: draftRating || null,
    notes: els.fNotes.value,
    progress: status === "reading" ? Number(els.fProgress.value) || 0 : (existing?.progress ?? 0),
    dateAdded: existing?.dateAdded || Date.now(),
    dateFinished: status === "finished" ? (existing?.dateFinished || Date.now()) : null,
  };

  if (existing) Object.assign(existing, book);
  else state.books.push(book);

  logActivity();
  save();
  renderAll();
  closeModal();
  toast(existing ? `Updated “${title}”` : `“${title}” added to your shelf 📚`);
}

function deleteBook() {
  const book = state.books.find((b) => b.id === editingId);
  if (!book) return;
  if (!confirm(`Remove “${book.title}” from your library?`)) return;
  state.books = state.books.filter((b) => b.id !== editingId);
  save();
  renderAll();
  closeModal();
  toast(`“${book.title}” removed`);
}

/* ————————————————————————————————————————————
   Book lookup · Open Library first, Google Books fallback
   ———————————————————————————————————————————— */

async function lookupBook() {
  const q = els.lookupInput.value.trim();
  if (!q) return;

  els.lookupResults.innerHTML = "";
  setLookupStatus("Searching the stacks… 🔎");
  els.lookupBtn.disabled = true;

  let results = [];
  try {
    results = await searchOpenLibrary(q);
  } catch (e) { /* fall through to Google Books */ }

  if (!results.length) {
    setLookupStatus("Open Library came up empty — trying Google Books…");
    try {
      results = await searchGoogleBooks(q);
    } catch (e) { /* both failed */ }
  }

  els.lookupBtn.disabled = false;

  if (!results.length) {
    setLookupStatus("Couldn't find it — no worries, just fill in the details below by hand.", true);
    els.fTitle.value = els.fTitle.value || q;
    els.fTitle.focus();
    return;
  }

  setLookupStatus(`Found ${results.length} — tap the right one:`);
  els.lookupResults.innerHTML = results.map((r, i) => `
    <button type="button" class="lookup-result" data-pick="${i}">
      ${r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />` : '<span class="thumb-gen"></span>'}
      <span>
        <span class="lr-title">${esc(r.title)}</span><br />
        <span class="lr-meta">${esc(r.author || "Unknown author")}${r.year ? ` · ${r.year}` : ""}${r.pages ? ` · ${r.pages} pages` : ""}</span>
      </span>
      <span class="lr-src">${r.source}</span>
    </button>`).join("");
  window.__lookupHits = results;   // stash for the click handler
}

function setLookupStatus(msg, isError = false) {
  els.lookupStatus.hidden = false;
  els.lookupStatus.textContent = msg;
  els.lookupStatus.classList.toggle("error", isError);
}

async function searchOpenLibrary(q) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year,subject`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("openlibrary " + res.status);
  const data = await res.json();
  return (data.docs || []).slice(0, 5).map((d) => ({
    title: d.title,
    author: (d.author_name || [])[0] || "",
    pages: d.number_of_pages_median || null,
    year: d.first_publish_year || null,
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
    genre: pickGenre(d.subject),
    source: "Open Library",
  })).filter((r) => r.title);
}

async function searchGoogleBooks(q) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("googlebooks " + res.status);
  const data = await res.json();
  return (data.items || []).map((it) => {
    const v = it.volumeInfo || {};
    return {
      title: v.title,
      author: (v.authors || [])[0] || "",
      pages: v.pageCount || null,
      year: v.publishedDate ? String(v.publishedDate).slice(0, 4) : null,
      cover: v.imageLinks ? (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail || "").replace(/^http:/, "https:") : null,
      genre: (v.categories || [])[0] || "",
      source: "Google Books",
    };
  }).filter((r) => r.title);
}

/* Open Library subjects are noisy; pick the first one that looks like a real genre */
const KNOWN_GENRES = ["fantasy", "romance", "science fiction", "mystery", "thriller", "horror",
  "historical fiction", "literary fiction", "young adult", "poetry", "biography", "memoir",
  "self-help", "nonfiction", "classics", "adventure", "contemporary", "crime", "humor", "fiction"];
function pickGenre(subjects) {
  if (!Array.isArray(subjects)) return "";
  const lower = subjects.map((s) => String(s).toLowerCase());
  for (const g of KNOWN_GENRES) {
    const hit = lower.find((s) => s === g || s.startsWith(g));
    if (hit) return g.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "";
}

function applyLookupPick(r) {
  els.fTitle.value = r.title || "";
  els.fAuthor.value = r.author || "";
  if (r.pages) els.fPages.value = r.pages;
  if (r.genre && !els.fGenre.value) els.fGenre.value = r.genre;
  if (r.cover) els.fCover.value = r.cover;
  setLookupStatus(`Filled in “${r.title}” — tweak anything you like, then save. ✨`);
  els.lookupResults.innerHTML = "";
}

/* ————————————————————————————————————————————
   Export / import backup
   ———————————————————————————————————————————— */

function exportLibrary() {
  const payload = {
    app: "my-shelf",
    version: 1,
    exportedAt: new Date().toISOString(),
    ...state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const slug = ownerName() ? `${ownerName().toLowerCase().replace(/[^a-z0-9]+/g, "-")}s-shelf` : "my-shelf";
  a.download = `${slug}-backup-${isoDay(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Backup downloaded — keep it somewhere safe 💾");
}

function importLibrary(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const books = Array.isArray(data.books) ? data.books : null;
      if (!books) throw new Error("no books array");
      const replace = state.books.length === 0 ||
        confirm(`Import ${books.length} book${books.length === 1 ? "" : "s"}?\n\nOK = replace current library\nCancel = merge with current library`);
      if (replace) {
        state = { books, activity: data.activity || [], owner: data.owner || state.owner || "" };
      } else {
        const have = new Set(state.books.map((b) => `${b.title}::${b.author}`.toLowerCase()));
        for (const b of books) {
          if (!have.has(`${b.title}::${b.author}`.toLowerCase())) state.books.push({ ...b, id: b.id || uid() });
        }
        state.activity = [...new Set([...(state.activity || []), ...(data.activity || [])])];
      }
      save();
      renderAll();
      toast(`Library restored — ${state.books.length} books on the shelves 🏡`);
    } catch (e) {
      toast("That file doesn't look like a shelf backup 😕");
    }
  };
  reader.readAsText(file);
}

/* ————————————————————————————————————————————
   Small helpers
   ———————————————————————————————————————————— */

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3200);
}

function updateProgress(id) {
  const b = state.books.find((x) => x.id === id);
  if (!b) return;
  const input = prompt(`What page are you on in “${b.title}”?${b.pages ? ` (of ${b.pages})` : ""}`, b.progress || "");
  if (input === null) return;
  const page = Math.max(0, parseInt(input, 10) || 0);
  b.progress = b.pages ? Math.min(page, b.pages) : page;
  if (b.pages && b.progress >= b.pages) return finishBook(id);
  logActivity();
  save();
  renderAll();
  toast(b.pages ? `Saved — ${Math.round((b.progress / b.pages) * 100)}% through 🔖` : "Progress saved 🔖");
}

function finishBook(id) {
  const b = state.books.find((x) => x.id === id);
  if (!b) return;
  b.status = "finished";
  b.dateFinished = Date.now();
  if (b.pages) b.progress = b.pages;
  logActivity();
  save();
  renderAll();
  toast(`“${b.title}” → Finished! Onto the cover wall it goes 🎉`);
}

/* ————————————————————————————————————————————
   Events
   ———————————————————————————————————————————— */

document.addEventListener("click", (e) => {
  const actionEl = e.target.closest("[data-action]");
  if (actionEl) {
    const { action, id } = actionEl.dataset;
    if (action === "edit") openModal(id);
    if (action === "log-progress") updateProgress(id);
    if (action === "finish") finishBook(id);
    return;
  }
  const pick = e.target.closest("[data-pick]");
  if (pick && window.__lookupHits) applyLookupPick(window.__lookupHits[Number(pick.dataset.pick)]);
});

$("btn-add").addEventListener("click", () => openModal());
els.greeting.addEventListener("click", renameOwner);
$("modal-close").addEventListener("click", closeModal);
els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !els.modal.hidden) closeModal(); });

els.form.addEventListener("submit", submitForm);
els.fStatus.addEventListener("change", toggleProgressField);
$("btn-delete").addEventListener("click", deleteBook);

els.starInput.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-star]");
  if (btn) setDraftRating(Number(btn.dataset.star));
});
$("star-clear").addEventListener("click", () => setDraftRating(0));

els.lookupBtn.addEventListener("click", lookupBook);
els.lookupInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); lookupBook(); }
});

els.shelfTabs.addEventListener("click", (e) => {
  const tab = e.target.closest(".shelf-tab");
  if (!tab) return;
  activeShelf = tab.dataset.shelf;
  renderTabs();
  renderGrid();
});

els.search.addEventListener("input", () => {
  searchTerm = els.search.value.trim();
  renderGrid();
});

$("btn-export").addEventListener("click", exportLibrary);
$("btn-import").addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", () => {
  if (els.importFile.files[0]) importLibrary(els.importFile.files[0]);
  els.importFile.value = "";
});

/* ——— PWA: register the service worker ——— */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* offline mode just won't kick in */ });
  });
}

/* ——— go ——— */
renderAll();
