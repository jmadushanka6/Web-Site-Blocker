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
// The page has three states: locked (counting down), expired (the timer
// has ended but the site is STILL blocked until it's removed) and removed
// (no longer on the list at all). For the first 30 seconds of a new block,
// the locked state also offers "Wrong site? Undo".
//
// While the site is blocked, the page also shows how often it was tried
// ("Visits blocked", see attempts.js and triesView.js). Each showing of the
// page asks the background to count one; the background decides whether
// it was a real try, and the panel follows the counts in storage.

import { t, applyI18n, fmtDateTime } from "./i18n.js";
import { undoMsLeft } from "./lockModel.js";
import { ATTEMPTS } from "./attempts.js";
import { renderTries } from "./triesView.js";

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
const undoEl = document.getElementById("undo");
const undoAskEl = document.getElementById("undoAsk");
const undoBtn = document.getElementById("undoBtn");

const tries = {
  panel: document.getElementById("tries"),
  total: document.getElementById("triesTotal"),
  sub: document.getElementById("triesSub"),
  soon: document.getElementById("triesSoon"),
  chart: document.getElementById("chart"),
  svg: document.getElementById("chartSvg"),
  tip: document.getElementById("chartTip"),
  table: document.getElementById("chartTable"),
};

domEl.textContent = domain;

let tickHandle = null;
let liveEntry = null; // the site's entry as stored, once it has been read
let undoError = ""; // why an undo failed, shown in place of the button
let triesRecord = null; // this site's attempt counts, once read
let blocked = true; // false once the site is off the list

// "Wrong site? Undo · 28 s" while a new block can still be taken back.
function renderUndo(now) {
  if (undoError) {
    undoAskEl.textContent = undoError;
    undoBtn.hidden = true;
    undoEl.hidden = false;
    return;
  }
  const left = hasDomain ? undoMsLeft(liveEntry, now) : 0;
  undoEl.hidden = left <= 0;
  if (left > 0) undoBtn.textContent = t("undoButton", Math.ceil(left / 1000));
}

undoBtn.addEventListener("click", () => {
  undoBtn.disabled = true;
  chrome.runtime.sendMessage({ type: "undo", domain }, (r) => {
    undoBtn.disabled = false;
    if (chrome.runtime.lastError || !r || !r.ok) {
      undoError = (r && r.error) || t("errGeneric");
      renderUndo(Date.now());
    }
    // On success the storage listener below switches to "No longer blocked".
  });
});

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
  ringEl.classList.remove("open", "quiet");
  titleEl.textContent = t("blkTitle");
  timeEl.classList.remove("ready", "ended");
  labelEl.textContent = t("blkRemovableIn");
  messageEl.textContent = t("blkMessage");
  hintEl.textContent = t("blkHint");
  goLink.hidden = true;
  const total = until - added;
  const pct = total > 0 ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 0;
  barEl.style.width = pct + "%";
  timeEl.textContent = fmt(remaining);
  renderUndo(Date.now());
}

function showTries() {
  if (blocked && hasDomain) renderTries(tries, triesRecord);
  else tries.panel.hidden = true;
}

// The timer has run out, but the site stays blocked until it's removed, so
// this keeps a closed lock and never reads as "unlocked".
function renderExpired() {
  undoEl.hidden = true;
  document.title = t("blkTabTitle", domain);
  ringEl.classList.remove("open");
  ringEl.classList.add("quiet");
  titleEl.textContent = t("blkExpiredTitle");
  labelEl.textContent = t("blkTimer");
  timeEl.textContent = until ? t("blkEndedAt", fmtDateTime(until)) : t("badgeEnded");
  timeEl.classList.remove("ready");
  timeEl.classList.add("ended");
  barEl.style.width = "100%";
  messageEl.textContent = t("blkExpiredMessage");
  hintEl.textContent = t("blkExpiredHint");
  goLink.hidden = true;
}

function renderRemoved() {
  clearTimeout(tickHandle);
  undoEl.hidden = true;
  blocked = false;
  tries.panel.hidden = true;
  document.title = t("blkRemovedTitle");
  ringEl.classList.remove("quiet");
  ringEl.classList.add("open");
  titleEl.textContent = t("blkRemovedTitle");
  labelEl.textContent = t("blkStatus");
  timeEl.textContent = t("blkNotBlocked");
  timeEl.classList.remove("ended");
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
  liveEntry = entry || null;
  if (!entry) {
    renderRemoved();
    return;
  }
  blocked = true;
  if (entry.lockUntil) {
    until = entry.lockUntil;
    added = entry.addedAt || added;
  }
  tick();
  showTries();
}

// Prefer live data from storage over the (possibly stale) redirect URL params.
function loadLiveEntry() {
  if (!(chrome && chrome.storage && chrome.storage.local)) {
    tick();
    return;
  }
  chrome.storage.local.get(["blocklist", ATTEMPTS], ({ blocklist, [ATTEMPTS]: attempts }) => {
    triesRecord = (attempts && attempts[domain]) || null;
    const list = Array.isArray(blocklist) ? blocklist : [];
    applyEntry(list.find((e) => e.domain === domain));
  });
}

// If the user extends, re-locks, or removes this site from the popup while
// this tab stays open, pick that change up immediately.
if (chrome && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[ATTEMPTS]) {
      const attempts = changes[ATTEMPTS].newValue || {};
      triesRecord = attempts[domain] || null;
      showTries();
    }
    if (changes.blocklist) {
      const list = changes.blocklist.newValue || [];
      applyEntry(list.find((e) => e.domain === domain));
    }
  });
}

// Ask the background to count this showing of the page. It's told how the
// page was reached, so a reload or a step back isn't counted as a try. A
// page Chrome loads ahead of time (prerendering) counts only once it's
// actually shown.
function reportAttempt() {
  if (!hasDomain || !(chrome && chrome.runtime && chrome.runtime.sendMessage)) return;
  const nav = performance.getEntriesByType("navigation")[0];
  const navType = (nav && nav.type) || "navigate";
  chrome.runtime.sendMessage({ type: "attempt", domain, navType }, () => {
    void chrome.runtime.lastError; // nothing to show; the panel follows storage
  });
}

loadLiveEntry();
if (document.prerendering) {
  document.addEventListener("prerenderingchange", reportAttempt, { once: true });
} else {
  reportAttempt();
}
