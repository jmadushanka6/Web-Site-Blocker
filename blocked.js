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
//
// The page has three states: locked (counting down), expired (still
// blocked, but removable) and removed (no longer on the list at all).

import { t, applyI18n } from "./i18n.js";

applyI18n();

const params = new URLSearchParams(location.search);
const hasDomain = !!params.get("d");
const domain = params.get("d") || t("thisSite");
let until = Number(params.get("until")) || 0;
let added = Number(params.get("added")) || 0;

const domEl = document.getElementById("dom");
const ringEl = document.getElementById("ring");
const titleEl = document.getElementById("title");
const messageEl = document.getElementById("message");
const labelEl = document.getElementById("statusLabel");
const timeEl = document.getElementById("statusTime");
const barEl = document.getElementById("bar");
const hintEl = document.getElementById("hint");
const goLink = document.getElementById("goLink");

domEl.textContent = domain;

let tickHandle = null;

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return t("cdD", d, h, m);
  if (h > 0) return t("cdH", h, m, sec);
  if (m > 0) return t("cdM", m, sec);
  return t("cdS", sec);
}

function renderLocked(remaining) {
  document.title = t("blkTabTitle", domain);
  ringEl.textContent = "🔒";
  titleEl.textContent = t("blkTitle");
  timeEl.classList.remove("ready");
  labelEl.textContent = t("blkRemovableIn");
  messageEl.textContent = t("blkMessage");
  hintEl.textContent = t("blkHint");
  goLink.hidden = true;
  const total = until - added;
  const pct = total > 0 ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 0;
  barEl.style.width = pct + "%";
  timeEl.textContent = fmt(remaining);
}

function renderExpired() {
  document.title = t("blkTabTitle", domain);
  ringEl.textContent = "🔓";
  titleEl.textContent = t("blkExpiredTitle");
  labelEl.textContent = t("blkStatus");
  timeEl.textContent = t("blkRemovableNow");
  timeEl.classList.add("ready");
  barEl.style.width = "100%";
  messageEl.textContent = t("blkExpiredMessage", domain);
  hintEl.textContent = t("blkExpiredHint");
  goLink.hidden = true;
}

function renderRemoved() {
  clearTimeout(tickHandle);
  document.title = t("blkRemovedTitle");
  ringEl.textContent = "🔓";
  titleEl.textContent = t("blkRemovedTitle");
  labelEl.textContent = t("blkStatus");
  timeEl.textContent = t("blkNotBlocked");
  timeEl.classList.add("ready");
  barEl.style.width = "100%";
  messageEl.textContent = t("blkRemovedMessage", domain);
  hintEl.textContent = "";
  if (hasDomain) {
    goLink.href = "https://" + domain + "/";
    goLink.textContent = t("blkGoTo", domain);
    goLink.hidden = false;
  }
}

function tick() {
  clearTimeout(tickHandle);
  const remaining = until - Date.now();
  if (!until || remaining <= 0) {
    renderExpired();
    return;
  }
  renderLocked(remaining);
  tickHandle = setTimeout(tick, 1000);
}

function applyEntry(entry) {
  if (!entry) {
    renderRemoved();
    return;
  }
  if (entry.lockUntil) {
    until = entry.lockUntil;
    added = entry.addedAt || added;
  }
  tick();
}

// Prefer live data from storage over the (possibly stale) redirect URL params.
function loadLiveEntry() {
  if (!(chrome && chrome.storage && chrome.storage.local)) {
    tick();
    return;
  }
  chrome.storage.local.get("blocklist", ({ blocklist }) => {
    const list = Array.isArray(blocklist) ? blocklist : [];
    applyEntry(list.find((e) => e.domain === domain));
  });
}

// If the user extends, re-locks, or removes this site from the popup while
// this tab stays open, pick that change up immediately.
if (chrome && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.blocklist) return;
    const list = changes.blocklist.newValue || [];
    applyEntry(list.find((e) => e.domain === domain));
  });
}

loadLiveEntry();
