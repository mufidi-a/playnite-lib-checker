/**
 * ─────────────────────────────────────────────────────────
 *  Playnite Library Checker — lib.js
 *  Shared utilities loaded before every content script.
 * ─────────────────────────────────────────────────────────
 */

// ─── Name normalisation ───────────────────────────────────────────────────────

function normalizeName(str) {
  return str
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = STE_CONFIG.cacheTtlHours * 60 * 60 * 1000;

function getCache() {
  return new Promise((res) => {
    chrome.storage.local.get([STE_CONFIG.cacheKey], (r) => {
      const c = r[STE_CONFIG.cacheKey];
      if (!c || Date.now() - c.timestamp > CACHE_TTL_MS) return res(null);
      res(c);
    });
  });
}

function setCache(data) {
  return new Promise((res) =>
    chrome.storage.local.set(
      { [STE_CONFIG.cacheKey]: { ...data, timestamp: Date.now() } },
      res
    )
  );
}

// ─── Library fetch & parse ────────────────────────────────────────────────────

async function fetchLibraryIndex() {
  const r = await fetch(STE_CONFIG.libraryUrl, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function parseIndexHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const entries = [];
  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(href)) return;
    const name = a.textContent.trim();
    if (!name || name.length < 2) return;
    entries.push({
      name,
      norm: normalizeName(name),
      url: href.startsWith("http")
        ? href
        : `${STE_CONFIG.libraryBaseUrl}${href.replace(/^\//, "")}`,
    });
  });
  return entries;
}

// ─── Background enrichment — extract all store IDs/slugs from each game page ──
//
// From each Playnite game page we extract every store link:
//   steamId     → store.steampowered.com/app/XXXXX
//   epicSlug    → epicgames.com/.../p/SLUG  or  .../product/SLUG
//   gogSlug     → gog.com/game/SLUG
//
// idMap[url] = { steamId, epicSlug, gogSlug }

async function enrichStoreIds(entries, existing) {
  const map = { ...existing };
  const todo = entries.filter((e) => !(e.url in map));
  for (let i = 0; i < Math.min(todo.length, STE_CONFIG.enrichBatchLimit); i += 10) {
    await Promise.all(
      todo.slice(i, i + 10).map(async (e) => {
        try {
          const t = await (await fetch(e.url)).text();

          const steam  = t.match(/store\.steampowered\.com\/app\/(\d+)/);
          const epic   = t.match(/epicgames\.com(?:\/store)?\/(?:[^/]+\/)?(p|product)\/([a-zA-Z0-9_-]+)/i);
          const gog    = t.match(/gog\.com(?:\/[a-z]{2})?\/game\/([a-z0-9_-]+)/i);

          map[e.url] = {
            steamId:    steam  ? steam[1]              : null,
            epicSlug:   epic   ? epic[2].toLowerCase() : null,
            gogSlug:    gog    ? gog[1].toLowerCase()  : null,
          };
        } catch {
          map[e.url] = { steamId: null, epicSlug: null, gogSlug: null };
        }
      })
    );
    await new Promise((r) => setTimeout(r, 250));
  }
  return map;
}

// Keep legacy name for callers in content-steam.js
const enrichWithSteamIds = enrichStoreIds;

// ─── Slug → human name conversion ────────────────────────────────────────────
// Converts store slugs like "hollow-knight" or "hollow_knight" into a
// normalized name "hollow knight" that can be looked up in byName.

function slugToNorm(slug) {
  return normalizeName(slug.replace(/[-_]/g, " "));
}

// ─── Index builders ───────────────────────────────────────────────────────────

function buildIndexes(entries, idMap) {
  const byId      = {}; // steamAppId  → entry
  const byEpic    = {}; // epicSlug    → entry
  const byGog     = {}; // gogSlug     → entry
  const byName    = {}; // normalizedName (+ slug aliases) → entry

  for (const e of entries) {
    // Primary name from Playnite
    byName[e.norm] = e;

    const ids = idMap[e.url];
    if (ids) {
      if (ids.steamId)  byId[ids.steamId]    = e;
      if (ids.epicSlug) byEpic[ids.epicSlug] = e;
      if (ids.gogSlug)  byGog[ids.gogSlug]   = e;

      // Add every slug as an alias in byName so stores without
      // a dedicated index (Humble, Amazon, itch) still get exact slug matches.
      // e.g. humbleSlug "hollow-knight" → byName["hollow knight"] = e
      // This doesn't overwrite the Playnite name if already set.
      for (const slug of [ids.epicSlug, ids.gogSlug]) {
        if (!slug) continue;
        const alias = slugToNorm(slug);
        if (!byName[alias]) byName[alias] = e;
      }
    }
    // Legacy: old cache format stored steamId as a plain string
    else if (typeof idMap[e.url] === "string" && idMap[e.url]) {
      byId[idMap[e.url]] = e;
    }
  }
  return { byId, byEpic, byGog, byName };
}

// ─── Match logic ──────────────────────────────────────────────────────────────

/**
 * @param {object} indexes   - built by buildIndexes()
 * @param {object} ids       - { steamAppId, epicSlug, gogSlug } — pass whichever is known
 * @param {string} rawName   - visible game title on the page
 */
function findMatch(indexes, ids = {}, rawName = "") {
  const { byId, byEpic, byGog, byName } = indexes;

  // 1. Steam App ID
  if (ids.steamAppId && byId[ids.steamAppId])
    return { entry: byId[ids.steamAppId], how: "steam_id" };

  // 2. Epic slug
  if (ids.epicSlug && byEpic[ids.epicSlug])
    return { entry: byEpic[ids.epicSlug], how: "epic_slug" };

  // 3. GOG slug
  if (ids.gogSlug && byGog[ids.gogSlug])
    return { entry: byGog[ids.gogSlug], how: "gog_slug" };

  // 4. Exact normalised name
  if (!rawName) return null;
  const n = normalizeName(rawName);
  if (byName[n]) return { entry: byName[n], how: "exact_name" };

  // 5. Fuzzy substring (last resort)
  if (n.length > 6) {
    for (const [key, entry] of Object.entries(byName)) {
      if (key.length <= 6) continue;
      const longer  = key.length > n.length ? key : n;
      const shorter = key.length > n.length ? n   : key;
      // Length ratio guard
      if (longer.length / shorter.length > 1.3) continue;
      if (!longer.includes(shorter)) continue;
      // Sequel guard: if the shorter string is a prefix of the longer,
      // check the character immediately after it isn't a digit or roman numeral
      const idx = longer.indexOf(shorter);
      const after = longer.slice(idx + shorter.length).trim();
      if (/^(ii|iii|iv|vi{0,3}|[0-9])/.test(after)) continue;
      return { entry, how: "fuzzy_name" };
    }
  }
  return null;
}

// ─── Shared CSS injector ──────────────────────────────────────────────────────

const SHARED_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&display=swap');

  /* ── Capsule ribbon — CSS-only via ::after on the <a> itself ── */
  /*    No layout changes to image containers. Works on all stores.  */
  a[data-plc-owned] {
    /* anchor already gets position:relative from JS only if static */
  }
  a[data-plc-owned]::after {
    content: '✓ IN LIBRARY';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    padding: 20px 8px 6px;
    background: linear-gradient(to top, rgba(0,20,5,0.88) 0%, transparent 100%);
    font-family: 'Rajdhani', sans-serif;
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
    color: #22c55e;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    border-radius: 0 0 4px 4px;
    z-index: 10;
    pointer-events: none;
    animation: plc-fadein 0.25s ease;
    box-sizing: border-box;
  }
  /* Small pill variant for hover state */
  a[data-plc-owned]:hover::after {
    background: linear-gradient(to top, rgba(0,30,8,0.95) 0%, transparent 100%);
  }

  /* ── Inline text badge (search rows / list items) ── */
  .plc-badge {
    display: inline-flex; align-items: center;
    font-family: 'Rajdhani', sans-serif;
    font-size: 11px; font-weight: 700; letter-spacing: 0.07em;
    color: #22c55e;
    background: rgba(34,197,94,0.12);
    border: 1px solid rgba(34,197,94,0.4);
    padding: 1px 7px; border-radius: 3px;
    margin-left: 0px; vertical-align: middle;
    white-space: nowrap; pointer-events: none;
    animation: plc-fadein 0.2s ease; flex-shrink: 0;
  }

  /* ── Row highlight ── */
  .plc-row-owned {
    box-shadow: inset 0px 0 0 rgba(34,197,94,0.55) !important;
  }

  /* ── Hover tooltip ── */
  .plc-has-tooltip .plc-tooltip {
    display: none;
    position: absolute; bottom: calc(100% + 6px); left: 50%;
    transform: translateX(-50%);
    background: #0c1a10; border: 1px solid rgba(34,197,94,0.4);
    color: #22c55e; font-family: 'Rajdhani', sans-serif;
    font-size: 12px; font-weight: 700; letter-spacing: 0.05em;
    padding: 4px 10px; border-radius: 4px; white-space: nowrap;
    z-index: 99999; pointer-events: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  .plc-has-tooltip:hover .plc-tooltip { display: block; }

  /* ── App detail page: banner ── */
  .plc-banner {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 16px; border-radius: 6px;
    margin: 10px 0 8px;
    font-family: sans-serif; font-size: 13px; line-height: 1.4;
    animation: plc-fadein 0.3s ease;
  }
  .plc-banner.owned     { background: rgba(34,197,94,0.10); border: 1px solid rgba(34,197,94,0.35); }
  .plc-banner.not-owned { background: rgba(148,163,184,0.07); border: 1px solid rgba(148,163,184,0.2); }
  .plc-banner-icon { font-size: 20px; flex-shrink: 0; line-height: 1; }
  .plc-banner-text strong {
    display: block; font-family: 'Rajdhani', sans-serif;
    font-size: 15px; font-weight: 700; letter-spacing: 0.04em;
  }
  .plc-banner.owned     .plc-banner-text strong { color: #22c55e; }
  .plc-banner.not-owned .plc-banner-text strong { color: #94a3b8; }
  .plc-banner-text small { color: #64748b; font-size: 11px; }
  .plc-banner-link {
    margin-left: auto; font-size: 11px; color: #64748b;
    text-decoration: none; white-space: nowrap;
    padding: 3px 8px; border: 1px solid rgba(100,116,139,0.3);
    border-radius: 4px; transition: all 0.15s;
  }
  .plc-banner-link:hover { color: #94a3b8; border-color: rgba(148,163,184,0.5); }

  /* ── App detail page: title badge ── */
  .plc-title-badge {
    display: inline-flex; align-items: center;
    font-family: 'Rajdhani', sans-serif;
    font-size: 12px; font-weight: 700; letter-spacing: 0.06em;
    padding: 2px 9px 2px 7px; border-radius: 3px;
    vertical-align: middle; margin-left: 10px;
    position: relative; top: -2px;
    animation: plc-popin 0.25s cubic-bezier(0.34,1.56,0.64,1);
  }
  .plc-title-badge.owned     { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.38); color: #22c55e; }
  .plc-title-badge.not-owned { background: rgba(148,163,184,0.08); border: 1px solid rgba(148,163,184,0.2); color: #94a3b8; }

  /* ── App detail page: floating chip ── */
  .plc-float {
    position: fixed; bottom: 24px; right: 24px; z-index: 99999;
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px 10px 12px; border-radius: 8px;
    font-family: sans-serif; font-size: 13px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    cursor: pointer;
    animation: plc-floatin 0.4s cubic-bezier(0.22,1,0.36,1);
    transition: transform 0.15s, box-shadow 0.15s; max-width: 260px;
  }
  .plc-float:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
  .plc-float.owned     { background: #0c1a10; border: 1px solid rgba(34,197,94,0.38); }
  .plc-float.not-owned { background: #141a22; border: 1px solid rgba(148,163,184,0.2); }
  .plc-float-label {
    font-family: 'Rajdhani', sans-serif; font-weight: 700;
    font-size: 14px; letter-spacing: 0.04em; white-space: nowrap;
  }
  .plc-float.owned     .plc-float-label { color: #22c55e; }
  .plc-float.not-owned .plc-float-label { color: #94a3b8; }
  .plc-float-sub  { font-size: 11px; color: #475569; }
  .plc-float-close {
    margin-left: auto; color: #334155; font-size: 18px;
    line-height: 1; padding: 0 0 0 8px; cursor: pointer; flex-shrink: 0;
  }
  .plc-float-close:hover { color: #64748b; }

  @keyframes plc-fadein  { from { opacity: 0; }                              to { opacity: 1; }                         }
  @keyframes plc-popin   { from { opacity: 0; transform: scale(0.7); }       to { opacity: 1; transform: scale(1); }    }
  @keyframes plc-floatin { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0);} }
`;

function injectSharedStyles() {
  if (document.getElementById("plc-styles")) return;
  const s = document.createElement("style");
  s.id = "plc-styles";
  s.textContent = SHARED_CSS;
  document.head.appendChild(s);
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

/**
 * Adds a "✓ IN LIBRARY" ribbon overlay to a card.
 *
 * Strategy: attach directly to the <a> anchor using a CSS ::after pseudo-element
 * driven by a data attribute. This avoids touching the image container's layout,
 * which breaks React-managed stores like Epic Games.
 *
 * We set position:relative ONLY on the <a> itself — anchors are inline-block or
 * block by nature and tolerate this without disrupting image sizing inside them.
 */
function addRibbon(anchor) {
  if (anchor.hasAttribute("data-plc-owned")) return;
  anchor.setAttribute("data-plc-owned", "1");
  // Only set position:relative on the anchor itself — never touch overflow
  const pos = getComputedStyle(anchor).position;
  if (pos === "static") anchor.style.position = "relative";
}

function addInlineBadge(nameEl) {
  if (nameEl.querySelector(".plc-badge")) return;
  const b = document.createElement("span");
  b.className = "plc-badge";
  b.textContent = "✓ OWNED";
  nameEl.appendChild(b);
}

// function addTooltip(anchor) {
//   if (anchor.classList.contains("plc-has-tooltip")) return;
//   anchor.classList.add("plc-has-tooltip");
//   const tip = document.createElement("div");
//   tip.className = "plc-tooltip";
//   tip.textContent = "✓ Already in your Playnite library";
//   anchor.appendChild(tip);
// }

// ─── Shared floating chip (app detail pages) ──────────────────────────────────

function injectFloatChip(owned, entryUrl) {
  if (document.getElementById("plc-float")) return;
  const libraryHost = (() => {
    try { return new URL(STE_CONFIG.libraryBaseUrl).hostname; }
    catch { return STE_CONFIG.libraryBaseUrl; }
  })();
  const chip = document.createElement("div");
  chip.id = "plc-float";
  chip.className = `plc-float ${owned ? "owned" : "not-owned"}`;
  chip.innerHTML = `
    <span style="font-size:18px;flex-shrink:0">${owned ? "✅" : "❌"}</span>
    <div>
      <div class="plc-float-label">${owned ? "Already Owned" : "Not in Library"}</div>
      <div class="plc-float-sub">${libraryHost}</div>
    </div>
    <div class="plc-float-close" title="Dismiss">×</div>
  `;
  if (owned) {
    chip.addEventListener("click", (e) => {
      if (!e.target.classList.contains("plc-float-close")) window.open(entryUrl, "_blank");
    });
  }
  chip.querySelector(".plc-float-close").addEventListener("click", (e) => {
    e.stopPropagation(); chip.remove();
  });
  document.body.appendChild(chip);
}

// ─── Store toggle state (live from storage, falls back to config) ─────────────

const STORES_KEY = "plc_store_toggles";

function isStoreEnabled(storeKey) {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORES_KEY], (r) => {
      const saved = r[STORES_KEY] || {};
      // Saved popup toggle takes priority over config default
      if (storeKey in saved) return resolve(saved[storeKey]);
      resolve(STE_CONFIG.stores?.[storeKey] ?? true);
    });
  });
}

// ─── Generic list stamper (used by all store scripts) ────────────────────────
/**
 * Stamps owned-game badges on any element that either:
 *   (a) contains an <img> → ribbon overlay on the image container
 *   (b) is a text row     → inline badge on the name element
 *
 * Each store content script calls this after resolving its own
 * gameName/appId pair per card.
 *
 * @param {Element}  anchor    - The <a> or container element for the game card
 * @param {string}   rawName   - Game title extracted from the card
 * @param {object}   indexes   - { byId, byName } from buildIndexes()
 * @param {string}   [appId]   - Optional Steam App ID (Steam pages only)
 * @param {string[]} [nameSels] - CSS selectors to find the title within anchor
 */
function stampCard(anchor, rawName, indexes, ids = {}, nameSels = []) {
  const match = findMatch(indexes, ids, rawName);
  console.log("Match:", match);
  console.log("Game Name:", rawName);
  console.log("Indexes:", indexes);
  console.log("Ids:", ids);
  if (!match) return false;

  const img = anchor.querySelector("img");
  if (img) {
    // Ribbon on the <a> itself — never touch the image container
    addRibbon(anchor);
    // addTooltip(anchor);
  } else {
    let nameEl = null;
    for (const sel of nameSels) {
      nameEl = anchor.querySelector(sel);
      if (nameEl) break;
    }
    addInlineBadge(nameEl || anchor);
    const row = anchor.closest("li, tr, [class*='item'], [class*='row'], [class*='result']");
    if (row) row.classList.add("plc-row-owned");
  }
  return true;
}