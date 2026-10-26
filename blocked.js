// blocked.js
// Shown whenever a blocked site's request gets redirected here.
//
// The domain always comes from the URL (Chrome sets it fresh on every
// redirect), but the lock timing is read LIVE from chrome.storage rather
// than trusted from the "until"/"added" URL params. Those params are baked
// into the declarativeNetRequest rule at the moment it was last synced, so
// they can lag behind if the site was just extended or re-locked from the
// popup — reading storage directly means the countdown shown here is
// always correct, and a storage listener keeps it correct live if the user
// changes something while this tab stays open.

const params = new URLSearchParams(location.search);
const domain = params.get("d") || "this site";
let until = Number(params.get("until")) || 0;
let added = Number(params.get("added")) || 0;

const domEl = document.getElementById("dom");
const ringEl = document.getElementById("ring");
const titleEl = document.getElementById("title");
const messageEl = document.getElementById("message");
const labelEl = document.getElementById("statusLabel");
const timeEl = document.getElementById("statusTime");
const barEl = document.getElementById("bar");

domEl.textContent = domain;

let tickHandle = null;

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function renderReady() {
  ringEl.textContent = "🔓";
  titleEl.textContent = "This block has expired";
  labelEl.textContent = "Status";
  timeEl.textContent = "Removable now";
  timeEl.classList.add("ready");
  barEl.style.width = "100%";
  messageEl.textContent =
    domain + " is still blocked, but its timer has run out. Open the extension to remove it or lock it in again.";
}

function renderLocked(remaining) {
  ringEl.textContent = "🔒";
  titleEl.textContent = "This site is blocked";
  timeEl.classList.remove("ready");
  labelEl.textContent = "Removable in";
  messageEl.textContent =
    "You blocked this to stay focused. It stays blocked, and can't be removed until the timer below runs out.";
  const total = until - added;
  const pct = total > 0 ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 0;
  barEl.style.width = pct + "%";
  timeEl.textContent = fmt(remaining);
}

function tick() {
  clearTimeout(tickHandle);
  const remaining = until - Date.now();
  if (!until || remaining <= 0) {
    renderReady();
    return;
  }
  renderLocked(remaining);
  tickHandle = setTimeout(tick, 1000);
}

// Prefer live data from storage over the (possibly stale) redirect URL params.
function loadLiveEntry() {
  if (!(chrome && chrome.storage && chrome.storage.local)) {
    tick();
    return;
  }
  chrome.storage.local.get("blocklist", ({ blocklist }) => {
    const entry = Array.isArray(blocklist) ? blocklist.find((e) => e.domain === domain) : null;
    if (entry && entry.lockUntil) {
      until = entry.lockUntil;
      added = entry.addedAt || added;
    }
    tick();
  });
}

// If the user extends, re-locks, or removes this site from the popup while
// this tab stays open, pick that change up immediately.
if (chrome && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.blocklist) return;
    const list = changes.blocklist.newValue || [];
    const entry = list.find((e) => e.domain === domain);
    if (entry && entry.lockUntil) {
      until = entry.lockUntil;
      added = entry.addedAt || added;
      tick();
    } else {
      // Entry was removed entirely.
      renderReady();
    }
  });
}

loadLiveEntry();
