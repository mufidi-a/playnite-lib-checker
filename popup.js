const CACHE_KEY = STE_CONFIG.cacheKey;
const LIBRARY_INDEX_URL = STE_CONFIG.libraryUrl;

// ── Hydrate all dynamic UI text from config ───────────────────────────────────
function populateFromConfig() {
  // Extract hostname for display (e.g. "YOUR-PLAYNITE-HTML-EXPORTER-URL.com")
  let displayHost;
  try { displayHost = new URL(STE_CONFIG.libraryBaseUrl).hostname; }
  catch { displayHost = STE_CONFIG.libraryBaseUrl; }

  // Header: use hostname as title, static subtitle
  document.getElementById("header-title").textContent = displayHost;
  document.getElementById("header-sub").textContent   = "Playnite Library Checker";

  // "Open My Library" button
  document.getElementById("btn-open-library").href = STE_CONFIG.libraryBaseUrl;

  // Footer link
  const footerLink = document.getElementById("footer-library-link");
  footerLink.href        = STE_CONFIG.libraryBaseUrl;
  footerLink.textContent = displayHost;
}

populateFromConfig();

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIndexHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const entries = [];
  const links = doc.querySelectorAll('a[href*=".html"]');
  links.forEach((a) => {
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

function showToast(msg) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
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

async function loadStats() {
  chrome.storage.local.get([CACHE_KEY], (result) => {
    const cached = result[CACHE_KEY];
    if (!cached) {
      document.getElementById("stat-count").textContent = "Not cached";
      document.getElementById("stat-ids").textContent = "—";
      document.getElementById("stat-age").textContent = "—";
      return;
    }
    const entries = cached.entries || [];
    const idMap = cached.steamIdMap || {};
    const resolved = Object.values(idMap).filter((v) => v !== null).length;
    document.getElementById("stat-count").textContent = entries.length.toLocaleString();
    document.getElementById("stat-ids").textContent = `${resolved} / ${entries.length}`;
    document.getElementById("stat-age").textContent = formatAge(cached.timestamp);
  });
}

async function refreshCache() {
  const btn = document.getElementById("btn-refresh");
  btn.disabled = true;
  btn.textContent = "⏳ Fetching…";

  try {
    const res = await fetch(LIBRARY_INDEX_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const entries = parseIndexHtml(html);

    // Preserve existing steamIdMap
    chrome.storage.local.get([CACHE_KEY], (result) => {
      const existing = result[CACHE_KEY] || {};
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
  } catch (err) {
    showToast("✗ Failed to fetch library");
    btn.disabled = false;
    btn.innerHTML = "🔄 Refresh Library Cache";
  }
}

document.getElementById("btn-refresh").addEventListener("click", refreshCache);

document.getElementById("btn-clear").addEventListener("click", () => {
  chrome.storage.local.remove([CACHE_KEY], () => {
    loadStats();
    showToast("Cache cleared");
  });
});

loadStats();
