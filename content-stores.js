/**
 * Playnite Library Checker — content-stores.js
 * Runs on: Epic Games Store, GOG, Amazon Games, Humble Store, itch.io
 * Shared utilities come from lib.js (loaded first via manifest).
 *
 * Strategy: each store has a STORE_PROFILE that defines
 *   - how to detect the current page type (detail vs list)
 *   - how to extract game name on a detail page
 *   - which selectors to scan on list/browse pages
 *   - where to inject the detail-page banner
 */

// ─── Store slug extractors ────────────────────────────────────────────────────

function epicSlugFromUrl(url) {
  if (!url) return null;
  // Handles all known Epic URL formats:
  //   store.epicgames.com/en-US/p/SLUG          (new format)
  //   www.epicgames.com/store/en-US/product/SLUG/home  (old Playnite format)
  //   store.epicgames.com/store/p/SLUG
  const m = String(url).match(/epicgames\.com(?:\/store)?\/(?:[^/]+\/)?(p|product)\/([a-zA-Z0-9_-]+)/i);
  return m ? m[2].toLowerCase() : null;
}

function gogSlugFromUrl(url) {
  if (!url) return null;
  // gog.com/game/SLUG  or  gog.com/en/game/SLUG
  const m = String(url).match(/gog\.com(?:\/[a-z]{2})?\/game\/([a-z0-9_-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function humbleStoreSlugFromUrl(url) {
  if (!url) return null;
  // humblebundle.com/store/game-slug
  const m = String(url).match(/humblebundle\.com\/store\/([a-z0-9_-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

// ─── Store profiles ───────────────────────────────────────────────────────────

const STORE_PROFILES = {

  // ── Epic Games Store ──────────────────────────────────────────────────────
  // URLs: store.epicgames.com/en-US/p/game-slug
  //       store.epicgames.com/en-US/browse  (list)
  //       store.epicgames.com/en-US/  (home)
  epic: {
    host: /store\.epicgames\.com/,
    showBanner:     false,
    showTitleBadge: false,
    bannerAnchorSel: [],
    titleSel:        [],

    getSlug() {
      return { epicSlug: epicSlugFromUrl(window.location.href) };
    },

    getCardSlug(anchor) {
      return { epicSlug: epicSlugFromUrl(anchor.href) };
    },

    isDetailPage() {
      return /\/p\/[^/]+$/.test(window.location.pathname);
    },

    getDetailName() {
      // Used only for name-based fallback matching — not for UI injection
      const slug = window.location.pathname.split("/p/")[1] || "";
      return slug.replace(/-/g, " ").trim();
    },

    cardSelector: [ 'a[href*="/p/"]' ],

    nameSels: [
      '[data-testid="offer-title"]',
      '[class*="title"]',
      '[class*="Title"]',
      "span",
    ],
  },

  // ── GOG ───────────────────────────────────────────────────────────────────
  // URLs: gog.com/en/game/slug  (detail)
  //       gog.com/en/games      (list)
  gog: {
    host: /(?:^|\.)gog\.com/,
    showBanner:     true,
    showTitleBadge: true,

    getSlug() {
      return { gogSlug: gogSlugFromUrl(window.location.href) };
    },

    getCardSlug(anchor) {
      return { gogSlug: gogSlugFromUrl(anchor.href) };
    },

    isDetailPage() {
      return /\/game\/[^/]+/.test(window.location.pathname);
    },

    getDetailName() {
      const sels = [
        ".productcard-basics__title",
        '[class*="title"] h1',
        "h1.title",
        "h1",
      ];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el?.textContent.trim()) return el.textContent.trim();
      }
      return document.title.replace(" - GOG.com", "").trim();
    },

    cardSelector: [
      'a[href*="/game/"]',
      'a[href*="/games/"]',
      ".product-tile a",
      ".product-row-wrapper a",
    ],

    nameSels: [
      ".product-tile__title",
      ".product-row-wrapper__title",
      '[class*="title"]',
      "span",
    ],

    bannerAnchorSel: [
      ".buy-btn",
      ".productcard-pricing",
      '[class*="buySection"]',
      '[class*="purchase"]',
    ],

    titleSel: [
      ".productcard-basics__title",
      "h1",
    ],
  },

  // ── Amazon Games ──────────────────────────────────────────────────────────
  // URLs: luna.amazon.com/game/game-slug
  //       luna.amazon.com/home  (browse)
  amazon: {
    host: /luna\.amazon\.com/,
    showBanner:     false,
    showTitleBadge: false,
    getSlug()          { return {}; },
    getCardSlug()      { return {}; },
    isDetailPage() {
      return /\/game\/[^/]+/.test(window.location.pathname);
    },

    getDetailName() {
      const sels = [
        '[class*="DetailHero"] h1',
        '[class*="hero"] h1',
        'h1[class*="title"]',
        "h1",
      ];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el?.textContent.trim()) return el.textContent.trim();
      }
      return document.title.replace(" | Prime Gaming", "").trim();
    },

    cardSelector: [
      'a[href*="/detail/"]',
      '[class*="GameCard"] a',
      '[class*="gameCard"] a',
    ],

    nameSels: [
      '[class*="GameTitle"]',
      '[class*="gameTitle"]',
      '[class*="title"]',
      "p",
    ],

    bannerAnchorSel: [
      '[class*="DetailHero"] button',
      '[class*="claimButton"]',
      '[class*="buyButton"]',
    ],

    titleSel: [
      '[class*="DetailHero"] h1',
      "h1",
    ],
  },

  // ── Humble Store ─────────────────────────────────────────────────────────
  // URLs: humblebundle.com/store/game-slug
  //       humblebundle.com/store  (list)
  humble: {
    host: /humblebundle\.com/,
    showBanner:     true,
    showTitleBadge: true,
    getSlug()     { return { humbleStoreSlug: humbleStoreSlugFromUrl(window.location.href) }; },
    getCardSlug() { return {}; },
    isDetailPage() {
      return /\/store\/[^/]+$/.test(window.location.pathname) &&
             !/\/store\/?$/.test(window.location.pathname);
    },

    getDetailName() {
      const sels = [
        ".product-name h1",
        ".pdp-title",
        "h1.heading",
        "h1",
      ];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el?.textContent.trim()) return el.textContent.trim();
      }
      return document.title.replace(" | Humble Store", "").trim();
    },

    cardSelector: [
      'a[href*="/store/"]',
      ".entity-title a",
      ".mosaic-product a",
    ],

    nameSels: [
      ".entity-title",
      ".mosaic-product__title",
      '[class*="title"]',
      "span",
    ],

    bannerAnchorSel: [
      ".add-to-cart-row",
      ".product-purchase-section",
      ".checkout-button",
    ],

    titleSel: [
      ".product-name h1",
      "h1",
    ],
  },

  // ── itch.io ───────────────────────────────────────────────────────────────
  // URLs: itch.io/  (home/browse)
  //       username.itch.io/game-slug  (detail — subdomain pattern)
  //       itch.io/games  (browse)
  itch: {
    host: /itch\.io/,
    showBanner:     true,
    showTitleBadge: true,
    getSlug()     { return {}; },
    getCardSlug() { return {}; },
    isDetailPage() {
      // Detail pages are on subdomains: username.itch.io/game
      return window.location.hostname !== "itch.io" &&
             window.location.hostname !== "www.itch.io";
    },

    getDetailName() {
      const sels = [
        ".game_title",
        "h1.game_title",
        "#game_title",
        "h1",
      ];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el?.textContent.trim()) return el.textContent.trim();
      }
      return document.title.replace(" by", "").split(" by ")[0].trim();
    },

    cardSelector: [
      ".game_cell a.game_link",
      ".game_thumb a",
      'a[href*=".itch.io"]',
      ".grid_columns a",
    ],

    nameSels: [
      ".game_title",
      ".title",
      '[class*="title"]',
    ],

    bannerAnchorSel: [
      ".buy_row",
      ".game_download_links",
      ".purchase_button",
    ],

    titleSel: [
      ".game_title",
      "h1",
    ],
  },
};

// ─── Detect which store we're on ──────────────────────────────────────────────

function detectStore() {
  const host = window.location.hostname;
  for (const [key, profile] of Object.entries(STORE_PROFILES)) {
    if (profile.host.test(host)) return { key, profile };
  }
  return null;
}

// ─── Detail page UI (generic) ─────────────────────────────────────────────────

function injectDetailUI(owned, match, gameName, profile) {
  const url  = match?.entry?.url || STE_CONFIG.libraryBaseUrl;
  const name = match?.entry?.name || gameName;
  const how  = match?.how || "";

  // If this profile doesn't show banner/badge, make sure any stale
  // ones from a previous page visit are gone
  if (!profile.showBanner)     document.getElementById("plc-banner")?.remove();
  if (!profile.showTitleBadge) document.getElementById("plc-title-badge")?.remove();

  // Banner above buy box — skip on stores where it causes layout issues
  // (Epic/GOG have dynamic React layouts where injection anchor is unreliable)
  if (!document.getElementById("plc-banner") && profile.showBanner) {
    let anchor = null;
    for (const sel of profile.bannerAnchorSel) {
      anchor = document.querySelector(sel);
      if (anchor) break;
    }
    if (anchor) {
      const el = document.createElement("div");
      el.id = "plc-banner";
      el.className = `plc-banner ${owned ? "owned" : "not-owned"}`;
      el.innerHTML = `
        <div class="plc-banner-icon">${owned ? "✅" : "🔍"}</div>
        <div class="plc-banner-text">
          <strong>${owned ? "In Your Library" : "Not in Library"}</strong>
          <small>${owned
            ? `Matched "${name}"${how === "fuzzy" ? " (fuzzy)" : ""}`
            : "Not found in your Playnite library"
          }</small>
        </div>
        ${owned ? `<a class="plc-banner-link" href="${url}" target="_blank">View →</a>` : ""}
      `;
      anchor.parentNode.insertBefore(el, anchor);
    }
  }

  // Title badge — skip on stores where selector is unreliable
  if (!document.getElementById("plc-title-badge") && profile.showTitleBadge) {
    let titleEl = null;
    for (const sel of profile.titleSel) {
      const candidates = document.querySelectorAll(sel);
      for (const el of candidates) {
        const text = el.textContent.trim();
        if (text.length < 4) continue;
        if (el.querySelector("a, button, [role='tab']")) continue;
        titleEl = el;
        break;
      }
      if (titleEl) break;
    }
    if (titleEl) {
      const b = document.createElement("span");
      b.id = "plc-title-badge";
      b.className = `plc-title-badge ${owned ? "owned" : "not-owned"}`;
      b.textContent = owned ? "✓ OWNED" : "✗ NOT OWNED";
      b.style.fontSize = "13px";
      titleEl.appendChild(b);
    }
  }

  // Floating chip — always shown on all stores
  injectFloatChip(owned, url);
}

// ─── List page stamper (generic) ─────────────────────────────────────────────

function stampStorePage(indexes, profile) {
  const cardSels = profile.cardSelector.join(", ");
  document.querySelectorAll(cardSels).forEach((card) => {
    const anchor = card.tagName === "A" ? card : card.querySelector("a");
    if (!anchor) return;
    if (anchor.getAttribute("data-plc")) return;
    anchor.setAttribute("data-plc", "1");

    // Extract store-specific slug from the card href
    const ids = profile.getCardSlug(anchor);

    // Extract visible game name
    let rawName = "";
    for (const sel of profile.nameSels) {
      const el = anchor.querySelector(sel);
      if (el?.textContent.trim()) { rawName = el.textContent.trim(); break; }
    }
    if (!rawName) rawName = anchor.getAttribute("aria-label") || anchor.title || "";

    stampCard(anchor, rawName, indexes, ids, profile.nameSels);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
// Split into two functions:
//   init()  — runs ONCE: loads cache, builds indexes, sets up list observer
//   run()   — runs on EVERY navigation: detects page type and injects badges

let _indexes = null;   // built once, reused on every navigation
let _profile = null;   // store profile, constant for the lifetime of the tab
let _listObserver = null; // MutationObserver for list pages, kept alive

async function init() {
  const detected = detectStore();
  if (!detected) return;
  const { key, profile } = detected;

  if (!(await isStoreEnabled(key))) return;

  _profile = profile;
  injectSharedStyles();

  // Load library from cache or fresh
  let entries = [], steamIdMap = {};
  const cached = await getCache();
  if (cached) {
    entries    = cached.entries    || [];
    steamIdMap = cached.steamIdMap || {};
  } else {
    try {
      entries = parseIndexHtml(await fetchLibraryIndex());
      await setCache({ entries, steamIdMap: {} });
    } catch (e) {
      console.warn("[Playnite Checker] Library fetch failed:", e);
      return;
    }
  }

  _indexes = buildIndexes(entries, steamIdMap);

  // Background enrich store IDs (improves future matches)
  if (Object.keys(steamIdMap).length < entries.length) {
    enrichStoreIds(entries, steamIdMap).then((enriched) => {
      setCache({ entries, steamIdMap: enriched });
      _indexes = buildIndexes(entries, enriched);
    });
  }

  // Now run the per-page logic for the initial URL
  run();
}

function run() {
  if (!_indexes || !_profile) return;

  if (_profile.isDetailPage()) {
    // ── Detail page ──
    const inject = () => {
      const gameName = _profile.getDetailName();
      const ids      = _profile.getSlug();
      const match    = findMatch(_indexes, ids, gameName);
      console.log("Match:", match);
      console.log("Game Name:", gameName);
      console.log("Indexes:", _indexes);
      console.log("Profile:", _profile);
      console.log("Ids:", ids);
      injectDetailUI(!!match, match, gameName, _profile);
    };

    // Epic is a SPA — DOM renders after navigation, wait for h1 to appear.
    // All other stores do a full page load so h1 is already present.
    const isEpic = window.location.hostname.includes("epicgames.com");
    if (isEpic) {
      const h1 = document.querySelector("h1");
      if (h1) {
        inject();
      } else {
        const observer = new MutationObserver(() => {
          if (document.querySelector("h1")) {
            observer.disconnect();
            inject();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // Safety fallback after 8s
        setTimeout(() => { observer.disconnect(); inject(); }, 8000);
      }
    } else {
      // Normal page load — inject immediately, with one short delay retry
      inject();
      setTimeout(inject, 1000);
    }

  } else {
    // ── List / browse / home ──
    stampStorePage(_indexes, _profile);
    setTimeout(() => stampStorePage(_indexes, _profile), 1200);
    setTimeout(() => stampStorePage(_indexes, _profile), 3000);

    // Disconnect old observer (if navigated back to list from detail)
    // then create a fresh one on the current body
    if (_listObserver) {
      _listObserver.disconnect();
      _listObserver = null;
    }
    let debounce;
    _listObserver = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => stampStorePage(_indexes, _profile), 350);
    });
    _listObserver.observe(document.body, { childList: true, subtree: true });
  }
}

// main() is now just an alias for run() — called from watchNavigation on SPA nav
function main() { run(); }

// ─── SPA navigation listener ──────────────────────────────────────────────────

console.log("[Playnite Checker] content-stores.js v3.1 loaded on", location.hostname);
// Epic and GOG use React routers that change the URL without a page reload.
// history.pushState patching is unreliable in Chrome extension content scripts
// because the extension's isolated world may receive the patched version too
// late, or the SPA router calls the native API directly.
//
// Reliable approach: poll location.pathname every 500ms AND watch document.title
// changes via MutationObserver (title always changes on navigation in SPAs).

(function watchNavigation() {
  let lastPath  = location.pathname;
  let lastTitle = document.title;

  function cleanupBadges() {
    // Remove detail-page injections
    ["plc-banner", "plc-title-badge", "plc-float"].forEach(
      (id) => document.getElementById(id)?.remove()
    );
    // Remove list-page stamps — attributes, inline badge spans, and row highlights
    document.querySelectorAll("[data-plc], [data-plc-owned]").forEach((el) => {
      el.removeAttribute("data-plc");
      el.removeAttribute("data-plc-owned");
      el.style.position = "";
    });
    document.querySelectorAll(".plc-badge").forEach((el) => el.remove());
    document.querySelectorAll(".plc-row-owned").forEach((el) =>
      el.classList.remove("plc-row-owned")
    );
  }

  function onNavigate() {
    const newPath  = location.pathname;
    const newTitle = document.title;
    if (newPath === lastPath && newTitle === lastTitle) return;
    lastPath  = newPath;
    lastTitle = newTitle;
    cleanupBadges();
    setTimeout(main, 800);
  }

  // Strip ALL injected markup immediately when user clicks any card link,
  // before Epic's router recycles DOM nodes into the detail page.
  document.addEventListener("click", (e) => {
    const anchor = e.target.closest("a[href]");
    if (!anchor) return;
    // Only care about clicks that will trigger SPA navigation
    const href = anchor.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("javascript")) return;
    // Immediately nuke all badges from the whole page
    cleanupBadges();
  }, true); // capture phase — fires before Epic's own handlers

  // 1. Poll pathname every 500ms — catches all router types
  setInterval(onNavigate, 500);

  // 2. MutationObserver on <title> — fires immediately when SPA updates the title
  const titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(onNavigate).observe(titleEl, { childList: true });
  } else {
    new MutationObserver(() => {
      const t = document.querySelector("title");
      if (t) new MutationObserver(onNavigate).observe(t, { childList: true });
    }).observe(document.head || document.documentElement, { childList: true });
  }
})();

// ─── Initial run ──────────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(init, 900));
} else {
  setTimeout(init, 900);
}