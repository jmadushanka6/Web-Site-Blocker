// popup.js
// Glue: wires DOM events to popupApi, and popupApi results to popupRender.
// No messaging details and no DOM-building details live here — this file
// only coordinates the two.
import { api } from "./popupApi.js";
import { buildItem, buildEmptyState, populateSelect, buildQuickAdd, buildOffNotice } from "./popupRender.js";
import { t, applyI18n } from "./i18n.js";
import { setUpAsk } from "./popupAsk.js";
import { setUpReview } from "./popupReview.js";
import { reviewReasons } from "./review.js";
import { normalizeDomain, isBroadSuffix, isLocked } from "./lockModel.js";

applyI18n();

const addCard = document.getElementById("addCard");
const urlInput = document.getElementById("url");
const addDur = document.getElementById("addDur");
const addBtn = document.getElementById("addBtn");
const listEl = document.getElementById("list");
const msgEl = document.getElementById("msg");
const countEl = document.getElementById("count");
const incognitoEl = document.getElementById("incognito");
const accessNoticeEl = document.getElementById("accessNotice");
const quickEl = document.getElementById("quickAdd");
const tipEl = document.getElementById("tip");
const offNoticeEl = document.getElementById("offNotice");

let durationOptions = [];
let extendOptions = [];
let msgTimer = null;
let listCache = []; // the block list as last shown
let rows = []; // one { el, refresh(now), refreshUndo(now) } per site currently on screen
let renderSeq = 0; // only the newest render() is allowed to touch the DOM
let incognitoBlocked = false; // true when blocks don't reach Incognito windows
let activeTabId = null; // the tab the popup was opened over
let quickDomain = null; // that tab's site, when it can be blocked in one click
let offNoticeKey = ""; // what the "switched off" notice currently shows

function showMsg(text, kind) {
  clearTimeout(msgTimer);
  msgEl.textContent = text || "";
  msgEl.className = text ? "show " + (kind || "") : "";
  if (text) msgTimer = setTimeout(() => { msgEl.className = ""; }, 4000);
}

function renderCount(n) {
  countEl.textContent = n ? (n === 1 ? t("countOne") : t("countMany", n)) : "";
}

async function handleExtend(domain, durationMs) {
  const r = await api.extend(domain, durationMs);
  if (r.ok) { showMsg(t("msgExtended", domain), "ok"); render(); }
  else showMsg(r.error, "err");
}

async function handleRelock(domain, durationMs) {
  const r = await api.relock(domain, durationMs);
  if (r.ok) { showMsg(t("msgRelocked", domain), "ok"); render(); }
  else showMsg(r.error, "err");
}

async function handleRemove(domain) {
  const r = await api.remove(domain);
  if (r.ok) { showMsg(t("msgRemoved", domain), "ok"); render(); }
  else showMsg(r.error, "err");
}

async function handleUndo(domain) {
  const r = await api.undo(domain);
  if (r.ok) { showMsg(t("msgUndone", domain), "ok"); refreshQuickAdd(); }
  else showMsg(r.error, "err");
  render();
}

// The review takes the add form's place while it's up.
const review = setUpReview({
  onShow: () => {
    showMsg("");
    addCard.hidden = true;
    listEl.classList.add("dimmed");
    listEl.inert = true;
  },
  onHide: () => {
    addCard.hidden = false;
    listEl.classList.remove("dimmed");
    listEl.inert = false;
    renderQuickAdd(); // its button was disabled by the click that opened the review
    urlInput.focus();
  },
});

// Every new block from the popup starts here: straight away, or after the
// review when review.js finds a reason for a second look. Either way, the
// block can then be undone for 30 seconds.
async function startBlock({ domain, input = null, durationMs, perform }) {
  if (!durationOptions.length) await render(); // clicked before the popup had loaded
  const reasons = reviewReasons({ domain, input, durationMs, listLength: listCache.length });
  if (reasons.length === 0) {
    perform(durationMs);
    return;
  }
  review.show({ domain, input, durationMs, options: durationOptions, confirm: perform });
}

// Rebuilt only when what it says changes, so it isn't re-announced to
// screen readers (or re-animated) on every list refresh.
function renderOffNotice(periods) {
  const key = JSON.stringify(periods || []);
  if (key === offNoticeKey) return;
  offNoticeKey = key;
  offNoticeEl.innerHTML = "";
  if (periods && periods.length) {
    offNoticeEl.appendChild(buildOffNotice(periods, Date.now(), handleDismissOffNotice));
  }
}

async function handleDismissOffNotice() {
  const r = await api.dismissOffNotice();
  if (r.ok) render();
  else showMsg(r.error, "err");
}

function selectedDurationLabel() {
  const opt = addDur.options[addDur.selectedIndex];
  return opt ? opt.textContent : "";
}

function renderQuickAdd() {
  quickEl.innerHTML = "";
  quickEl.hidden = !quickDomain;
  if (quickDomain) quickEl.appendChild(buildQuickAdd(quickDomain, selectedDurationLabel(), handleQuickBlock));
}

// Offer the one-click button only when the tab is a normal website that
// isn't already locked.
async function refreshQuickAdd() {
  const r = activeTabId == null ? null : await api.tabSite(activeTabId);
  quickDomain = r && r.ok && r.domain && !r.blockedBy ? r.domain : null;
  renderQuickAdd();
}

function handleQuickBlock() {
  startBlock({ domain: quickDomain, durationMs: Number(addDur.value) || undefined, perform: quickBlock });
}

async function quickBlock(durationMs) {
  const r = await api.blockTab(activeTabId, durationMs);
  if (r.ok) {
    showMsg(t("msgBlockedSite", r.domain), "ok");
    quickDomain = null;
    renderQuickAdd();
    render();
  } else {
    showMsg(r.error, "err");
    renderQuickAdd();
  }
}

// Full rebuild of the list. Used on open and after every change; the
// 15-second countdown tick below updates rows in place instead.
async function render() {
  const seq = ++renderSeq;
  const res = await api.list();
  if (seq !== renderSeq) return; // a newer render is already on its way
  if (!res.ok) { showMsg(res.error || t("errGeneric"), "err"); return; }
  listCache = res.list || [];
  durationOptions = res.durations || durationOptions;
  extendOptions = res.extendOptions || extendOptions;
  if (!addDur.options.length) populateSelect(addDur, durationOptions);
  renderOffNotice(res.offPeriods);

  const now = Date.now();
  const list = (res.list || []).slice().sort((a, b) => {
    const aLocked = a.lockUntil > now;
    const bLocked = b.lockUntil > now;
    if (aLocked !== bLocked) return aLocked ? -1 : 1; // locked sites first
    return a.domain.localeCompare(b.domain);
  });

  renderCount(list.length);
  updateIncognitoNotice(list.length);
  ask.update(list.length, !!(res.offPeriods && res.offPeriods.length) || !incognitoEl.hidden);
  // Restricted site access: those sites fall back to a plain block page.
  accessNoticeEl.hidden = !list.some((e) => e.siteAccess === false);

  const scrollTop = listEl.scrollTop; // keep the user's place in a long list
  listEl.innerHTML = "";
  rows = [];

  if (list.length === 0) {
    listEl.appendChild(buildEmptyState());
    return;
  }

  const opts = { durationOptions, extendOptions };
  const callbacks = { onExtend: handleExtend, onRelock: handleRelock, onRemove: handleRemove, onUndo: handleUndo };
  for (const entry of list) {
    const row = buildItem(entry, now, opts, callbacks);
    rows.push(row);
    listEl.appendChild(row.el);
  }
  listEl.scrollTop = scrollTop;
}

// Countdown tick: update rows in place, so a duration the user has picked
// in a dropdown and the list's scroll position both survive. Rebuild only
// when a row can't be updated in place (a lock just ran out).
function tick() {
  const now = Date.now();
  if (rows.some((row) => !row.refresh(now))) render();
}

// A new block's 30-second "Undo" counts down every second.
function tickUndo() {
  const now = Date.now();
  for (const row of rows) row.refreshUndo(now);
}

async function add() {
  const val = urlInput.value.trim();
  if (!val) return;
  const durationMs = Number(addDur.value) || undefined;
  const domain = normalizeDomain(val);
  const listed = domain && listCache.find((e) => e.domain === domain);
  // Input the background will turn down goes straight to it, for its message.
  if (!domain || isBroadSuffix(domain) || (listed && isLocked(listed))) {
    finishAdd(await api.add(val, durationMs));
    return;
  }
  startBlock({ domain, input: val, durationMs, perform: async (ms) => finishAdd(await api.add(val, ms)) });
}

function finishAdd(r) {
  if (r.ok) { showMsg(t("msgBlocked"), "ok"); urlInput.value = ""; render(); refreshQuickAdd(); }
  else showMsg(r.error, "err");
  urlInput.focus();
}

// Chrome doesn't run extensions in Incognito windows unless the user allows
// it, so blocks don't apply there by default. Say so (once there's something
// blocked), with a shortcut to the switch and a way to dismiss the notice.
const INCOGNITO_DISMISSED_KEY = "incognitoNoticeDismissed";

function incognitoDismissed() {
  try {
    return localStorage.getItem(INCOGNITO_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function updateIncognitoNotice(siteCount) {
  incognitoEl.hidden = !(incognitoBlocked && siteCount > 0 && !incognitoDismissed());
}

function checkIncognitoAccess() {
  if (!(chrome.extension && chrome.extension.isAllowedIncognitoAccess)) return;
  chrome.extension.isAllowedIncognitoAccess((allowed) => {
    incognitoBlocked = !allowed;
    updateIncognitoNotice(rows.length);
  });
}

document.getElementById("incognitoOpen").addEventListener("click", () => {
  // The extension's details page holds the "Allow in Incognito" switch.
  chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });
});

document.getElementById("incognitoDismiss").addEventListener("click", () => {
  try {
    localStorage.setItem(INCOGNITO_DISMISSED_KEY, "1");
  } catch {
    // Storage unavailable: the notice just comes back next time.
  }
  incognitoEl.hidden = true;
});

addBtn.addEventListener("click", add);
urlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
addDur.addEventListener("change", renderQuickAdd); // keep the one-click button's duration in step

const ask = setUpAsk();

checkIncognitoAccess();
(async () => {
  await render(); // also fills the lock-length dropdown the one-click button uses
  activeTabId = await api.activeTabId();
  await refreshQuickAdd();
  const shortcut = await api.popupShortcut();
  if (shortcut) tipEl.textContent = t("tipShortcut", shortcut);
})();

// Show the "it was switched off" notice the moment the background logs one
// (it can notice a moment after the popup opens).
api.onOffLogChange(render);

// Keep the countdowns live while the popup is open.
setInterval(tick, 15000);
setInterval(tickUndo, 1000);
