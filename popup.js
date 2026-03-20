/**
 * Playnite Library Checker — popup.js
 */

const CACHE_KEY        = STE_CONFIG.cacheKey;
const LIBRARY_INDEX_URL = STE_CONFIG.libraryUrl;
const STORES_KEY       = "plc_store_toggles"; // separate key for toggle state

// ── Store definitions (display metadata) ─────────────────────────────────────
const STORE_DEFS = [
  { key: "steam",  label: "Steam",       icon: "🎮", url: "store.steampowered.com" },
  { key: "epic",   label: "Epic Games",  icon: "⚡", url: "store.epicgames.com"    },
  { key: "gog",    label: "GOG",         icon: "👾", url: "gog.com"                },
  { key: "humble", label: "Humble Store",icon: "🙏", url: "humblebundle.com/store" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function showToast(msg) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function formatAge(ts) {
  if (!ts) return "No cache";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function normalizeName(name) {
  return name.toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
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
      normalizedName: normalizeName(name),
      url: href.startsWith("http")
        ? href
        : `${STE_CONFIG.libraryBaseUrl}${href.replace(/^\//, "")}`,
    });
  });
  return entries;
}

// ── Dynamic text from config ──────────────────────────────────────────────────

function populateFromConfig() {
  let displayHost;
  try { displayHost = new URL(STE_CONFIG.libraryBaseUrl).hostname; }
  catch { displayHost = STE_CONFIG.libraryBaseUrl; }

  document.getElementById("header-title").textContent = displayHost;
  document.getElementById("header-sub").textContent   = "Playnite Library Checker";
  document.getElementById("btn-open-library").href    = STE_CONFIG.libraryBaseUrl;

  const footerLink = document.getElementById("footer-library-link");
  footerLink.href        = STE_CONFIG.libraryBaseUrl;
  footerLink.textContent = displayHost;
}

// ── Store toggles ─────────────────────────────────────────────────────────────

// Load saved toggle state, falling back to STE_CONFIG.stores defaults
function loadToggles() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORES_KEY], (r) => {
      const saved = r[STORES_KEY] || {};
      const state = {};
      for (const { key } of STORE_DEFS) {
        // saved value takes priority; fall back to config default (true if unset)
        state[key] = key in saved
          ? saved[key]
          : (STE_CONFIG.stores?.[key] ?? true);
      }
      resolve(state);
    });
  });
}

function saveToggles(state) {
  chrome.storage.local.set({ [STORES_KEY]: state });
}

function buildStoreRows(state) {
  const card = document.getElementById("stores-card");
  card.innerHTML = "";

  for (const store of STORE_DEFS) {
    const row = document.createElement("div");
    row.className = "store-row";
    row.innerHTML = `
      <div class="store-icon">${store.icon}</div>
      <div style="flex:1">
        <div class="store-name">${store.label}</div>
        <div class="store-url">${store.url}</div>
      </div>
      <label class="toggle">
        <input type="checkbox" data-store="${store.key}" ${state[store.key] ? "checked" : ""}>
        <div class="toggle-track"></div>
      </label>
    `;
    card.appendChild(row);
  }

  // Wire up change events
  card.querySelectorAll("input[data-store]").forEach((input) => {
    input.addEventListener("change", async () => {
      const current = await loadToggles();
      current[input.dataset.store] = input.checked;
      saveToggles(current);
      showToast(input.checked
        ? `✓ ${input.dataset.store} enabled`
        : `✗ ${input.dataset.store} disabled`
      );
    });
  });
}

// ── Cache stats ───────────────────────────────────────────────────────────────

function loadStats() {
  chrome.storage.local.get([CACHE_KEY], (result) => {
    const cached = result[CACHE_KEY];
    if (!cached) {
      document.getElementById("stat-count").textContent = "Not cached";
      document.getElementById("stat-ids").textContent   = "—";
      document.getElementById("stat-age").textContent   = "—";
      return;
    }
    const entries  = cached.entries    || [];
    const idMap    = cached.steamIdMap || {};

    // Count entries that have at least one store ID resolved
    const resolved = Object.values(idMap).filter((v) => {
      if (!v) return false;
      if (typeof v === "string") return true;          // legacy format
      return v.steamId || v.epicSlug || v.gogSlug;
    }).length;

    document.getElementById("stat-count").textContent = entries.length.toLocaleString();
    document.getElementById("stat-ids").textContent   = `${resolved} / ${entries.length}`;
    document.getElementById("stat-age").textContent   = formatAge(cached.timestamp);
  });
}

// ── Cache refresh ─────────────────────────────────────────────────────────────

async function refreshCache() {
  const btn = document.getElementById("btn-refresh");
  btn.disabled = true;
  btn.textContent = "⏳ Fetching…";
  try {
    const res = await fetch(LIBRARY_INDEX_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entries = parseIndexHtml(await res.text());

    chrome.storage.local.get([CACHE_KEY], (r) => {
      const existing  = r[CACHE_KEY] || {};
      const steamIdMap = existing.steamIdMap || {};
      chrome.storage.local.set(
        { [CACHE_KEY]: { entries, steamIdMap, timestamp: Date.now() } },
        () => {
          loadStats();
          showToast(`✓ ${entries.length} games cached`);
          btn.disabled = false;
          btn.innerHTML = "🔄 Refresh Library Cache";
        }
      );
    });
  } catch {
    showToast("✗ Failed to fetch library");
    btn.disabled = false;
    btn.innerHTML = "🔄 Refresh Library Cache";
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  populateFromConfig();
  const state = await loadToggles();
  buildStoreRows(state);
  loadStats();
}

document.getElementById("btn-refresh").addEventListener("click", refreshCache);
document.getElementById("btn-clear").addEventListener("click", () => {
  chrome.storage.local.remove([CACHE_KEY], () => {
    loadStats();
    showToast("Cache cleared");
  });
});

init();
