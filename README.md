# 📚 My Shelf

A cozy personal digital book library. It's a single-page static web app: plain HTML,
CSS, and JavaScript with no backend, no build step, and no accounts. Everything lives in
your browser via `localStorage`, and it's installable as an app on your phone.

Open it, tap the greeting to add your name, and the whole shelf becomes yours.

**Live site:** https://syed-bska06.github.io/book-library/

## Features

1. **Make it yours** — tap the greeting on the home screen to set your name; the
   greeting, header, page title, and backups all personalize to you.
2. **Shelves / status** — every book sits on one of four shelves: *Reading now*,
   *Finished*, *Want to read*, or *DNF (did not finish)*, with one-tap filtering.
3. **Auto-fill book details** — type a title (and optionally the author) and the app
   fetches the cover, author, and page count from the **Open Library API**, falling back
   to the **Google Books API**. Everything stays editable, and manual entry always works.
4. **Visual cover wall** — right at the top: your finished books displayed as a wall of
   covers, like a real bookshelf.
5. **Reading stats** — a "year in books" section: books finished this year, total pages
   read, a reading streak, and favourite genres.
6. **Ratings & notes** — a 1–5 star rating plus a private notes/quotes field per book.
7. **Currently reading hero** — a warm, time-of-day greeting and a hero card for the
   book you're on, with a progress bar and a "Finished it!" button.
8. **Export / import backup** — download the whole library as a JSON file and restore it
   any time (replace or merge) — insurance against cleared browsers or new devices.
9. **PWA support** — web app manifest + service worker, so it can be added to the home
   screen on Android/iPhone and used offline like an installed app.
10. **localStorage persistence** — everything saves automatically in the browser and is
    right where you left it on the next visit.

## Files

```
index.html            the whole UI
styles.css            cozy/warm theme, fully responsive
app.js                all logic: shelves, stats, lookup, backup, persistence
manifest.webmanifest  PWA manifest
sw.js                 service worker (offline support)
icons/                app icons
```

## Run it locally

No build step — just serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly also works, minus the service worker.)

## Deploy on GitHub Pages

1. Push this repository to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main**, folder **/ (root)**, and click **Save**.
5. After a minute or two, the site is live at
   `https://<your-username>.github.io/book-library/`.

## A note on data

All data stays in the browser it was added in. The **Backup** button downloads a JSON
file — a good habit once in a while. **Import** restores it on any device.
