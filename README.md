# Playnite Steam Library Checker

A Chrome extension that flags games you already own in your [Playnite](https://playnite.link/)-exported library while browsing the Steam store.

## Supported Stores

| Store | Detail page | Browse / Search |
|-------|-------------|-----------------|
| **Steam** | ✅ Banner + title badge + floating chip | ✅ Ribbon on cards, badge on rows |
| **Epic Games Store** | ✅ Banner + title badge + floating chip | ✅ Ribbon on cards |
| **GOG** | ✅ Banner + title badge + floating chip | ✅ Ribbon on cards |
| **Humble Store** | ✅ Banner + title badge + floating chip | ✅ Ribbon on cards |

## Features

- ✅ **Search results** — green `✓ OWNED` badge next to every game you own
- ✅ **Browse / genre / tag / sale pages** — ribbon overlay on game thumbnails
- ✅ **Homepage** — ribbon on featured tiles and carousels
- ✅ **App detail page** — banner above the buy button, title badge, and floating chip
- ✅ **Hover tooltip** — shows on any owned game card
- 🔄 **Smart matching** — matches by Steam App ID (most accurate) with name-based fallback

---

## Configuration

Open **`config.js`** and edit the values to point to your own library:

```js
const STE_CONFIG = {

  // URL of your Playnite-exported library index page
  libraryUrl: "https://YOUR-PLAYNITE-HTML-EXPORTER-URL/index.html",

  // Base URL used when linking to individual game pages
  libraryBaseUrl: "https://YOUR-PLAYNITE-HTML-EXPORTER-URL/",

  // How long to keep the game list cached locally (in hours)
  cacheTtlHours: 6,

  // Key used to store the cache in chrome.storage.local
  cacheKey: "YOUR-CACHE-NAME",

  // How many game pages to deep-fetch for Steam App ID enrichment
  enrichBatchLimit: 300,

};
```

That's the only file you need to touch.

---

## Installation

This extension is not on the Chrome Web Store — install it in developer mode:

1. Clone or download this repo
2. Edit `config.js` with your library URL (see above)
3. Open Chrome and go to `chrome://extensions/`
4. Enable **Developer mode** (toggle in the top-right)
5. Click **Load unpacked** and select this folder
6. Browse Steam — owned games will be flagged automatically

To update after pulling new changes, click the **↺ reload** button on the extension card.

---

## How it works

### Library data
The extension fetches your Playnite HTML export (the `index.html` of your GitHub Pages site) and parses the list of game names. This is cached locally for `cacheTtlHours` hours.

### Matching
Games are matched in order of reliability:

| Method | How |
|--------|-----|
| **Steam App ID** | Your Playnite pages include a Steam store link — the extension extracts the App ID and stores a reverse-lookup map. Most accurate. |
| **Exact name** | Normalized title comparison (strips ™/® and punctuation). |
| **Fuzzy name** | Substring match — catches "Game: Complete Edition" vs "Game". |

Steam App ID enrichment runs in the background on first use (fetches up to `enrichBatchLimit` game pages). After that, all subsequent matches are instant from cache.

### Popup
Click the extension icon to see cache stats, manually refresh the library, or clear the cache.

---

## Files

```
config.js       ← ✏️  Edit this — all your settings live here
content.js      ← Runs on Steam pages, injects badges
popup.html/js   ← Extension popup UI
manifest.json   ← Chrome extension manifest (v3)
icons/          ← Extension icons
```

---

## Compatibility

Tested on Chrome / Chromium with Manifest V3. Works on:
- `store.steampowered.com/` (homepage)
- `store.steampowered.com/search/`
- `store.steampowered.com/genre/`
- `store.steampowered.com/tag/`
- `store.steampowered.com/sale/`
- `store.steampowered.com/app/` (game detail pages)
- `store.steampowered.com/wishlist/`
- And any other Steam store page with game links

## Credits

Library data sourced from a [Playnite](https://playnite.link/) HTML export hosted on GitHub Pages.
