/**
 * Playnite Steam Library Checker — content.js v3
 *
 * Strategy: Instead of betting on specific CSS class names (which Steam changes
 * constantly), we scan ALL <a href="/app/XXXXX/..."> links on the page and
 * inject owned-game badges relative to each link's image or text content.
 *
 * This works on: homepage, search, genre, tag, sale, explore, wishlist, etc.
 * App detail pages still get the full banner + title badge + floating chip.
 */

const LIBRARY_INDEX_URL = STE_CONFIG.libraryUrl;
const CACHE_KEY         = STE_CONFIG.cacheKey;
const CACHE_TTL_MS      = STE_CONFIG.cacheTtlHours * 60 * 60 * 1000;

// ─── Utilities ────────────────────────────────────────────────────────────────

function normalizeName(str) {
  return str
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function appIdFromHref(href) {
  if (!href) return null;
  const m = String(href).match(/\/app\/(\d+)/);
  return m ? m[1] : null;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

function getCache() {
  return new Promise((res) => {
    chrome.storage.local.get([CACHE_KEY], (r) => {
      const c = r[CACHE_KEY];
      if (!c || Date.now() - c.timestamp > CACHE_TTL_MS) return res(null);
      res(c);
    });
  });
}

function setCache(data) {
  return new Promise((res) =>
    chrome.storage.local.set({ [CACHE_KEY]: { ...data, timestamp: Date.now() } }, res)
  );
}

// ─── Library parsing ─────────────────────────────────────────────────────────

async function fetchLibraryIndex() {
  const r = await fetch(LIBRARY_INDEX_URL, { cache: "no-store" });
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

// ─── Background: enrich with Steam App IDs ────────────────────────────────────

async function enrichWithSteamIds(entries, existing) {
  const map = { ...existing };
  const todo = entries.filter((e) => !(e.url in map));
  for (let i = 0; i < Math.min(todo.length, STE_CONFIG.enrichBatchLimit); i += 10) {
    await Promise.all(
      todo.slice(i, i + 10).map(async (e) => {
        try {
          const t = await (await fetch(e.url)).text();
          const m = t.match(/store\.steampowered\.com\/app\/(\d+)/);
          map[e.url] = m ? m[1] : null;
        } catch { map[e.url] = null; }
      })
    );
    await new Promise((r) => setTimeout(r, 250));
  }
  return map;
}

// ─── Indexes ─────────────────────────────────────────────────────────────────

function buildIndexes(entries, steamIdMap) {
  const byId   = {}; // appId  → entry
  const byName = {}; // norm   → entry
  for (const e of entries) {
    byName[e.norm] = e;
    const id = steamIdMap[e.url];
    if (id) byId[id] = e;
  }
  return { byId, byName };
}

function findMatch({ byId, byName }, appId, rawName) {
  if (appId && byId[appId]) return { entry: byId[appId], how: "id" };
  if (!rawName) return null;
  const n = normalizeName(rawName);
  if (byName[n]) return { entry: byName[n], how: "exact" };
  if (n.length > 4) {
    for (const [key, entry] of Object.entries(byName)) {
      if (key.length > 4 && (key.includes(n) || n.includes(key)))
        return { entry, how: "fuzzy" };
    }
  }
  return null;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&display=swap');

  /* ── Owned ribbon: overlaid on any image-containing link ── */
  .xyf-wrap {
    position: relative !important;
    display: inline-block !important;    /* preserve original display if block */
  }
  a.xyf-wrap, div.xyf-wrap { display: block !important; }

  .xyf-ribbon {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: linear-gradient(to top, rgba(0,20,5,0.88) 0%, transparent 100%);
    padding: 14px 8px 6px;
    display: flex; align-items: flex-end;
    z-index: 10;
    pointer-events: none;
    border-radius: 0 0 4px 4px;
    animation: xyf-fadein 0.25s ease;
  }
  .xyf-ribbon-label {
    font-family: 'Rajdhani', sans-serif;
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.08em;
    color: #22c55e;
    background: rgba(34,197,94,0.14);
    border: 1px solid rgba(34,197,94,0.45);
    padding: 2px 8px;
    border-radius: 3px;
    white-space: nowrap;
  }

  /* ── Search-row inline badge ── */
  .xyf-inline {
    display: inline-flex; align-items: center;
    font-family: 'Rajdhani', sans-serif;
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.07em;
    color: #22c55e;
    background: rgba(34,197,94,0.12);
    border: 1px solid rgba(34,197,94,0.4);
    padding: 1px 7px;
    border-radius: 3px;
    margin-left: 8px;
    vertical-align: middle;
    white-space: nowrap;
    pointer-events: none;
    animation: xyf-fadein 0.2s ease;
    flex-shrink: 0;
  }

  /* ── Search row highlight ── */
  .xyf-row-owned {
    box-shadow: inset 3px 0 0 rgba(34,197,94,0.55) !important;
  }

  /* ── App page: buy-box banner ── */
  .xyf-banner {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 16px; border-radius: 6px;
    margin: 10px 0 8px;
    font-family: sans-serif; font-size: 13px; line-height: 1.4;
    animation: xyf-fadein 0.3s ease;
  }
  .xyf-banner.owned     { background: rgba(34,197,94,0.10); border: 1px solid rgba(34,197,94,0.35); }
  .xyf-banner.not-owned { background: rgba(148,163,184,0.07); border: 1px solid rgba(148,163,184,0.2); }
  .xyf-banner-icon { font-size: 20px; flex-shrink: 0; line-height: 1; }
  .xyf-banner-text strong {
    display: block; font-family: 'Rajdhani', sans-serif;
    font-size: 15px; font-weight: 700; letter-spacing: 0.04em;
  }
  .xyf-banner.owned     .xyf-banner-text strong { color: #22c55e; }
  .xyf-banner.not-owned .xyf-banner-text strong { color: #94a3b8; }
  .xyf-banner-text small { color: #64748b; font-size: 11px; }
  .xyf-banner-link {
    margin-left: auto; font-size: 11px; color: #64748b;
    text-decoration: none; white-space: nowrap;
    padding: 3px 8px; border: 1px solid rgba(100,116,139,0.3);
    border-radius: 4px; transition: all 0.15s;
  }
  .xyf-banner-link:hover { color: #94a3b8; border-color: rgba(148,163,184,0.5); }

  /* ── App page: title badge ── */
  .xyf-title-badge {
    display: inline-flex; align-items: center;
    font-family: 'Rajdhani', sans-serif;
    font-size: 12px; font-weight: 700; letter-spacing: 0.06em;
    padding: 2px 9px 2px 7px; border-radius: 3px;
    vertical-align: middle; margin-left: 10px; position: relative; top: -2px;
    animation: xyf-popin 0.25s cubic-bezier(0.34,1.56,0.64,1);
  }
  .xyf-title-badge.owned     { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.38); color: #22c55e; }
  .xyf-title-badge.not-owned { background: rgba(148,163,184,0.08); border: 1px solid rgba(148,163,184,0.2); color: #94a3b8; }

  /* ── App page: float chip ── */
  .xyf-float {
    position: fixed; bottom: 24px; right: 24px; z-index: 99999;
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px 10px 12px; border-radius: 8px;
    font-family: sans-serif; font-size: 13px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    cursor: pointer;
    animation: xyf-floatin 0.4s cubic-bezier(0.22,1,0.36,1);
    transition: transform 0.15s, box-shadow 0.15s;
    max-width: 260px;
  }
  .xyf-float:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
  .xyf-float.owned     { background: #0c1a10; border: 1px solid rgba(34,197,94,0.38); }
  .xyf-float.not-owned { background: #141a22; border: 1px solid rgba(148,163,184,0.2); }
  .xyf-float-label {
    font-family: 'Rajdhani', sans-serif; font-weight: 700;
    font-size: 14px; letter-spacing: 0.04em; white-space: nowrap;
  }
  .xyf-float.owned     .xyf-float-label { color: #22c55e; }
  .xyf-float.not-owned .xyf-float-label { color: #94a3b8; }
  .xyf-float-sub  { font-size: 11px; color: #475569; }
  .xyf-float-close {
    margin-left: auto; color: #334155; font-size: 18px;
    line-height: 1; padding: 0 0 0 8px; cursor: pointer; flex-shrink: 0;
  }
  .xyf-float-close:hover { color: #64748b; }

  /* ── Hover tooltip ── */
  a.xyf-has-tooltip { position: relative; }
  a.xyf-has-tooltip .xyf-tooltip {
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
  a.xyf-has-tooltip:hover .xyf-tooltip { display: block; }

  @keyframes xyf-fadein  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes xyf-popin   { from { opacity:0; transform:scale(0.7); } to { opacity:1; transform:scale(1); } }
  @keyframes xyf-floatin { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
`;

function injectStyles() {
  if (document.getElementById("xyf-styles")) return;
  const s = document.createElement("style");
  s.id = "xyf-styles";
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ─── Core badge injection: universal link scanner ─────────────────────────────

/**
 * Walks every <a href="/app/XXXXX/..."> on the page.
 * For each owned game it finds:
 *   - If the link contains an <img> → wrap it and add a ribbon overlay
 *   - If the link is a text-only row → add an inline badge after the game name
 *   - Also adds a hover tooltip on the link itself as fallback
 *
 * Marks processed elements with data-xyf="1" to avoid re-processing.
 */
function stampAll(indexes) {
  const links = document.querySelectorAll('a[href*="/app/"]:not([data-xyf])');

  links.forEach((a) => {
    a.setAttribute("data-xyf", "1");

    const appId = appIdFromHref(a.getAttribute("href"));
    if (!appId) return;

    // Try to find a visible text name within the link
    const nameEl = a.querySelector(
      // common patterns across Steam's various pages
      ".title, .search_name, .tab_item_name, .game_name, " +
      ".capsule_name, [class*='GameName'], [class*='gameName'], " +
      "[class*='game-name'], [class*='AppName'], span.title, " +
      // fallback: any direct span/div that looks like a game title
      "span:not([class*='price']):not([class*='tag']):not([class*='review']):not([class*='platform'])"
    );
    const rawName = nameEl?.textContent?.trim() || a.getAttribute("aria-label") || "";

    const match = findMatch(indexes, appId, rawName);
    if (!match) return;

    const entryUrl = match.entry.url;

    // ── A. Image card (capsule / tile) ──
    const img = a.querySelector("img");
    if (img) {
      // Find the best container to wrap: the direct parent of <img> or the <a> itself
      const container = img.parentElement && img.parentElement !== a
        ? img.parentElement
        : a;

      if (!container.classList.contains("xyf-wrap")) {
        container.classList.add("xyf-wrap");
        // Ensure position:relative so the ribbon can anchor to it
        if (getComputedStyle(container).position === "static")
          container.style.position = "relative";

        const ribbon = document.createElement("div");
        ribbon.className = "xyf-ribbon";
        ribbon.innerHTML = `<span class="xyf-ribbon-label">✓ IN LIBRARY</span>`;
        container.appendChild(ribbon);
      }

      // Also add hover tooltip on the <a> so it shows on hover even if ribbon is cut off
      if (!a.classList.contains("xyf-has-tooltip")) {
        a.classList.add("xyf-has-tooltip");
        const tip = document.createElement("div");
        tip.className = "xyf-tooltip";
        tip.textContent = "✓ Already in your Playnite library";
        a.appendChild(tip);
      }
      return;
    }

    // ── B. Text row (search results, lists) ──
    // Try to badge the name element; fall back to appending to the link itself
    const target = nameEl || a;
    if (!target.querySelector(".xyf-inline")) {
      const badge = document.createElement("span");
      badge.className = "xyf-inline";
      badge.textContent = "✓ OWNED";
      target.appendChild(badge);
    }

    // Row highlight: walk up to find the search row container
    const row = a.closest(
      ".search_result_row, .search-result-row, [class*='result_row'], " +
      ".tab_item, [class*='ResultItem'], [class*='listItem'], li"
    );
    if (row && !row.classList.contains("xyf-row-owned")) {
      row.classList.add("xyf-row-owned");
    }
  });
}

// ─── App detail page ─────────────────────────────────────────────────────────

function injectAppPageUI(owned, match, gameName) {
  const url  = match?.entry?.url || STE_CONFIG.libraryBaseUrl;
  const name = match?.entry?.name || gameName;
  const how  = match?.how || "";

  // Banner above buy box
  if (!document.getElementById("xyf-banner")) {
    const anchor = document.querySelector(
      ".game_purchase_area, #game_area_purchase, .game_area_purchase_game"
    );
    if (anchor) {
      const el = document.createElement("div");
      el.id = "xyf-banner";
      el.className = `xyf-banner ${owned ? "owned" : "not-owned"}`;
      el.innerHTML = `
        <div class="xyf-banner-icon">${owned ? "✅" : "🔍"}</div>
        <div class="xyf-banner-text">
          <strong>${owned ? "In Your Library" : "Not in Library"}</strong>
          <small>${owned
            ? `Matched "${name}"${how === "fuzzy" ? " (fuzzy)" : ""}`
            : "Not found in your Playnite library"
          }</small>
        </div>
        ${owned ? `<a class="xyf-banner-link" href="${url}" target="_blank">View →</a>` : ""}
      `;
      anchor.parentNode.insertBefore(el, anchor);
    }
  }

  // Title badge
  if (!document.getElementById("xyf-title-badge")) {
    const titleEl = document.querySelector(
      "#appHubAppName, .apphub_AppName, div[class*='apphub_AppName']"
    );
    if (titleEl) {
      const b = document.createElement("span");
      b.id = "xyf-title-badge";
      b.className = `xyf-title-badge ${owned ? "owned" : "not-owned"}`;
      b.textContent = owned ? "✓ OWNED" : "✗ NOT OWNED";
      titleEl.appendChild(b);
    }
  }

  // Float chip
  if (!document.getElementById("xyf-float")) {
    const chip = document.createElement("div");
    chip.id = "xyf-float";
    chip.className = `xyf-float ${owned ? "owned" : "not-owned"}`;
    chip.innerHTML = `
      <span style="font-size:18px;flex-shrink:0">${owned ? "✅" : "❌"}</span>
      <div>
        <div class="xyf-float-label">${owned ? "Already Owned" : "Not in Library"}</div>
        <div class="xyf-float-sub">${(() => { try { return new URL(STE_CONFIG.libraryBaseUrl).hostname; } catch(e) { return STE_CONFIG.libraryBaseUrl; } })()}</div>
      </div>
      <div class="xyf-float-close" title="Dismiss">×</div>
    `;
    if (owned) {
      chip.addEventListener("click", (e) => {
        if (!e.target.classList.contains("xyf-float-close")) window.open(url, "_blank");
      });
    }
    chip.querySelector(".xyf-float-close").addEventListener("click", (e) => {
      e.stopPropagation(); chip.remove();
    });
    document.body.appendChild(chip);
  }
}

// ─── Page type ────────────────────────────────────────────────────────────────

function isAppPage() {
  return /^\/app\/\d+/.test(window.location.pathname);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  injectStyles();

  // Load cache or fetch fresh
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

  const indexes = buildIndexes(entries, steamIdMap);

  if (isAppPage()) {
    // ── App detail page ──
    const appId    = appIdFromHref(window.location.pathname);
    const gameName = (() => {
      for (const s of ["#appHubAppName", ".apphub_AppName"]) {
        const el = document.querySelector(s);
        if (el?.textContent.trim()) return el.textContent.trim();
      }
      return document.title.replace(" on Steam", "").trim();
    })();

    const match = findMatch(indexes, appId, gameName);
    injectAppPageUI(!!match, match, gameName);

    // Background enrich + re-check
    if (Object.keys(steamIdMap).length < entries.length) {
      enrichWithSteamIds(entries, steamIdMap).then((enriched) => {
        setCache({ entries, steamIdMap: enriched });
        if (!match && appId) {
          const idx2 = buildIndexes(entries, enriched);
          const m2   = findMatch(idx2, appId, gameName);
          if (m2) {
            ["xyf-banner", "xyf-title-badge", "xyf-float"]
              .forEach((id) => document.getElementById(id)?.remove());
            injectAppPageUI(true, m2, gameName);
          }
        }
      });
    }

  } else {
    // ── List / browse / home / search ──

    // Run immediately and after short delay (for late-rendered content)
    stampAll(indexes);
    setTimeout(() => stampAll(indexes), 1200);
    setTimeout(() => stampAll(indexes), 3000);

    // MutationObserver for infinite scroll / dynamic loads
    let debounce;
    new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => stampAll(indexes), 350);
    }).observe(document.body, { childList: true, subtree: true });

    // Background enrich → re-stamp with better ID matching
    if (Object.keys(steamIdMap).length < entries.length) {
      enrichWithSteamIds(entries, steamIdMap).then((enriched) => {
        setCache({ entries, steamIdMap: enriched });
        const idx2 = buildIndexes(entries, enriched);
        // Clear old marks so everything gets re-checked with better data
        document.querySelectorAll("[data-xyf]").forEach((el) => el.removeAttribute("data-xyf"));
        stampAll(idx2);
      });
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(main, 800));
} else {
  setTimeout(main, 800);
}
