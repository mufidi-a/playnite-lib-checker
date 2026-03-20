# Changelog

All notable changes to Playnite Library Checker are documented here.

---

## [2.0.0] — 2026-03-20

### ⚡ New Stores
- **Epic Games Store** (`store.epicgames.com`) — ribbon on browse cards, float chip on product pages
- **GOG** (`gog.com`) — ribbon on browse cards, banner + title badge + float chip on product pages
- **Humble Store** (`humblebundle.com/store`) — ribbon on browse cards, banner + title badge + float chip

### 🏗️ Architecture
- Split monolithic `content.js` into three focused files:
  - `lib.js` — shared cache, matching, CSS, and badge helpers used by all content scripts
  - `content-steam.js` — Steam-specific logic (App ID extraction, Steam selectors)
  - `content-stores.js` — all other stores via a `STORE_PROFILE` system
- `config.js` variable renamed from `XYF_CONFIG` to `STE_CONFIG` for generality
- Extension renamed from "Xyfactory Library Checker" to "Playnite Library Checker"
- Manifest `host_permissions` changed from hardcoded `xyfactory.github.io` to `https://*/*` to support any Playnite export URL

### 🔍 Matching Improvements
- **Epic slug matching** — extracts Epic product slug from Playnite game pages (supports both old `/product/SLUG` and new `/p/SLUG` URL formats)
- **GOG slug matching** — extracts GOG game slug from Playnite game pages
- **Humble slug matching** — extracts Humble Store slug when present in Playnite game pages
- **Slug aliases in `byName`** — all extracted slugs are converted to normalized names and registered as aliases, improving name-based matching for stores without dedicated IDs
- **`useFuzzy` flag per store** — fuzzy substring matching now disabled by default; only enabled for name-only stores (Humble, Amazon, itch)
- **Tightened fuzzy matching** — length ratio guard (1.3×), minimum length (>6 chars), and sequel guard (`II`, `III`, `2`, `3`, etc.) prevent false positives like "Hades" matching "Hades II" or "Dead Island" matching "Dead Island 2"
- **Legacy cache compatibility** — old cache format (steamId as plain string) still supported

### 🎛️ Store Toggle UI
- Extension popup now shows a **Stores** section with live toggle switches for each store
- Toggles persist in `chrome.storage.local` independently of `config.js`
- Toggle state priority: popup setting → `config.js` default → enabled
- `config.js` `stores` block still works as the initial default per store

### 🖼️ Badge System Overhaul
- **Ribbon overlay** rewritten to use CSS `::after` pseudo-element on `<a>` tags via `data-plc-owned` attribute — no longer modifies image container layout (fixes broken thumbnails on Epic homepage)
- `overflow: hidden` removed from ribbon injection — fixes "GOOD OLD GAME" badge clipping on GOG
- `showBanner` and `showTitleBadge` flags per store profile — Epic disables both to avoid React layout conflicts, only shows float chip
- Empty `titleSel: []` and `bannerAnchorSel: []` on Epic make DOM injection physically impossible

### 🔄 SPA Navigation (Epic / GOG)
- **Click interceptor** (capture phase) strips all badge markup from clicked card anchors immediately before Epic's router recycles DOM nodes — fixes "✓ OWNED" appearing in tab bars
- `cleanupBadges()` now also removes `.plc-badge` spans and `.plc-row-owned` classes, not just ID'd elements
- **`init()` / `run()` split** — library is loaded once, badge injection re-runs on every navigation without re-fetching
- **`h1` MutationObserver** for Epic detail pages — injects only after React has rendered the product title, eliminating race conditions with tab elements
- **`setInterval` + title MutationObserver** navigation detection — replaced unreliable `history.pushState` patching (which doesn't work across Chrome extension isolated worlds)
- `_listObserver` now disconnects and re-attaches on each navigation to correctly handle list→detail→list flows

### 🐛 Bug Fixes
- Fixed Epic regex not matching `store.epicgames.com/en-US/p/SLUG` URLs (store is a subdomain, not a path segment)
- Fixed Epic regex not matching old Playnite-stored `/product/SLUG` format — now handles both `/p/` and `/product/`
- Fixed title badge injecting into "Overview" tab element instead of game title — `showTitleBadge: false` on Epic
- Fixed owned ribbon making game thumbnails disappear on Epic homepage — CSS `::after` approach replaces DOM manipulation
- Fixed "Already Owned" float chip blocking Epic search bar — banner injection removed for Epic
- Fixed `Achievements` tab disappearing when navigating to an owned game from homepage — click interceptor clears badges before DOM reuse
- Fixed stale badges persisting across SPA navigation — full cleanup on every URL change
- Fixed infinite retry loop on Epic detail pages when `showBanner`/`showTitleBadge` are false

### 📦 Popup
- "Steam IDs resolved" stat renamed to "Store IDs resolved"
- Stat counter updated to reflect all store ID types (Steam, Epic, GOG, Humble)
- Library URL, title, and footer link all populated dynamically from `config.js`

---

## [1.0.0] — Initial Release

- Chrome extension (Manifest V3) that checks Steam store pages against a Playnite HTML export
- Detects owned games on Steam app detail pages: banner above buy button, title badge, floating chip
- Scans Steam search results, browse pages, homepage, and wishlist with ribbon/badge overlays
- Universal `<a href="/app/XXXXX">` link scanner — works regardless of Steam CSS class changes
- Background enrichment of Steam App IDs from Playnite game pages (batched, cached)
- Name-based fallback matching: exact normalized → fuzzy substring
- Cache stored in `chrome.storage.local` with configurable TTL (default 6 hours)
- `config.js` for all user settings: library URL, cache key, TTL, enrichment limit
- Popup with cache stats, manual refresh, clear cache, and "Open My Library" button
- MutationObserver for infinite scroll / dynamically loaded Steam content
- `.gitignore` excludes build artifacts