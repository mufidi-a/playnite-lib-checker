/**
 * Playnite Library Checker — content-steam.js
 * Runs on store.steampowered.com
 * Shared utilities come from lib.js (loaded first via manifest).
 */

function appIdFromHref(href) {
  if (!href) return null;
  const m = String(href).match(/\/app\/(\d+)/);
  return m ? m[1] : null;
}

// ─── App detail page UI ───────────────────────────────────────────────────────

function injectAppPageUI(owned, match, gameName) {
  const url  = match?.entry?.url || STE_CONFIG.libraryBaseUrl;
  const name = match?.entry?.name || gameName;
  const how  = match?.how || "";

  // Banner above buy box
  if (!document.getElementById("plc-banner")) {
    const anchor = document.querySelector(
      ".game_purchase_area, #game_area_purchase, .game_area_purchase_game"
    );
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

  // Title badge
  if (!document.getElementById("plc-title-badge")) {
    const titleEl = document.querySelector(
      "#appHubAppName, .apphub_AppName, div[class*='apphub_AppName']"
    );
    if (titleEl) {
      const b = document.createElement("span");
      b.id = "plc-title-badge";
      b.className = `plc-title-badge ${owned ? "owned" : "not-owned"}`;
      b.textContent = owned ? "✓ OWNED" : "✗ NOT OWNED";
      titleEl.appendChild(b);
    }
  }

  injectFloatChip(owned, url);
}

// ─── List / home / search page stamper ───────────────────────────────────────

const STEAM_NAME_SELS = [
  ".title", ".search_name", ".tab_item_name", ".game_name",
  ".capsule_name", "[class*='GameName']", "[class*='gameName']",
  "span:not([class*='price']):not([class*='tag']):not([class*='review'])",
];

function stampSteamPage(indexes) {
  document.querySelectorAll('a[href*="/app/"]:not([data-plc])').forEach((a) => {
    a.setAttribute("data-plc", "1");
    const appId   = appIdFromHref(a.getAttribute("href"));
    const nameEl  = a.querySelector(STEAM_NAME_SELS.join(", "));
    const rawName = nameEl?.textContent?.trim()
                    || a.getAttribute("aria-label") || "";
    stampCard(a, rawName, indexes, { steamAppId: appId }, STEAM_NAME_SELS);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!(await isStoreEnabled("steam"))) return;
  injectSharedStyles();

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
  const isAppPage = /^\/app\/\d+/.test(window.location.pathname);

  if (isAppPage) {
    const appId = appIdFromHref(window.location.pathname);
    const gameName = (() => {
      for (const s of ["#appHubAppName", ".apphub_AppName"]) {
        const el = document.querySelector(s);
        if (el?.textContent.trim()) return el.textContent.trim();
      }
      return document.title.replace(" on Steam", "").trim();
    })();

    const match = findMatch(indexes, { steamAppId: appId }, gameName);
    injectAppPageUI(!!match, match, gameName);

    // Background enrich + re-check
    if (Object.keys(steamIdMap).length < entries.length) {
      enrichWithSteamIds(entries, steamIdMap).then((enriched) => {
        setCache({ entries, steamIdMap: enriched });
        if (!match && appId) {
          const idx2 = buildIndexes(entries, enriched);
          const m2   = findMatch(idx2, { steamAppId: appId }, gameName);
          if (m2) {
            ["plc-banner", "plc-title-badge", "plc-float"]
              .forEach((id) => document.getElementById(id)?.remove());
            injectAppPageUI(true, m2, gameName);
          }
        }
      });
    }

  } else {
    // List/browse/search/home
    stampSteamPage(indexes);
    setTimeout(() => stampSteamPage(indexes), 1200);
    setTimeout(() => stampSteamPage(indexes), 3000);

    let debounce;
    new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => stampSteamPage(indexes), 350);
    }).observe(document.body, { childList: true, subtree: true });

    if (Object.keys(steamIdMap).length < entries.length) {
      enrichWithSteamIds(entries, steamIdMap).then((enriched) => {
        setCache({ entries, steamIdMap: enriched });
        const idx2 = buildIndexes(entries, enriched);
        document.querySelectorAll("[data-plc]")
          .forEach((el) => el.removeAttribute("data-plc"));
        stampSteamPage(idx2);
      });
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(main, 800));
} else {
  setTimeout(main, 800);
}
