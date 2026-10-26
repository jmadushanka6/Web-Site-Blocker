// popup.js
// Glue: wires DOM events to popupApi, and popupApi results to popupRender.
// No messaging details and no DOM-building details live here — this file
// only coordinates the two.
import { api } from "./popupApi.js";
import { buildItem, buildEmptyState, populateSelect } from "./popupRender.js";

const urlInput = document.getElementById("url");
const addDur = document.getElementById("addDur");
const addBtn = document.getElementById("addBtn");
const listEl = document.getElementById("list");
const msgEl = document.getElementById("msg");
const countEl = document.getElementById("count");
const incognitoEl = document.getElementById("incognito");
const accessNoticeEl = document.getElementById("accessNotice");

let durationOptions = [];
let extendOptions = [];
let msgTimer = null;
let rows = []; // one { el, refresh(now) } per site currently on screen
let renderSeq = 0; // only the newest render() is allowed to touch the DOM
let incognitoBlocked = false; // true when blocks don't reach Incognito windows

function showMsg(text, kind) {
  clearTimeout(msgTimer);
  msgEl.textContent = text || "";
  msgEl.className = text ? "show " + (kind || "") : "";
  if (text) msgTimer = setTimeout(() => { msgEl.className = ""; }, 4000);
}

function renderCount(n) {
  countEl.textContent = n ? `${n} site${n === 1 ? "" : "s"}` : "";
}

async function handleExtend(domain, durationMs) {
  const r = await api.extend(domain, durationMs);
  if (r.ok) { showMsg(domain + " extended.", "ok"); render(); }
  else showMsg(r.error, "err");
}

async function handleRelock(domain, durationMs) {
  const r = await api.relock(domain, durationMs);
  if (r.ok) { showMsg(domain + " locked again.", "ok"); render(); }
  else showMsg(r.error, "err");
}

async function handleRemove(domain) {
  const r = await api.remove(domain);
  if (r.ok) { showMsg(domain + " removed.", "ok"); render(); }
  else showMsg(r.error, "err");
}

// Full rebuild of the list. Used on open and after every change; the
// 15-second countdown tick below updates rows in place instead.
async function render() {
  const seq = ++renderSeq;
  const res = await api.list();
  if (seq !== renderSeq) return; // a newer render is already on its way
  if (!res.ok) { showMsg(res.error || "Something went wrong.", "err"); return; }
  durationOptions = res.durations || durationOptions;
  extendOptions = res.extendOptions || extendOptions;
  if (!addDur.options.length) populateSelect(addDur, durationOptions);

  const now = Date.now();
  const list = (res.list || []).slice().sort((a, b) => {
    const aLocked = a.lockUntil > now;
    const bLocked = b.lockUntil > now;
    if (aLocked !== bLocked) return aLocked ? -1 : 1; // locked sites first
    return a.domain.localeCompare(b.domain);
  });

  renderCount(list.length);
  updateIncognitoNotice(list.length);
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
  const callbacks = { onExtend: handleExtend, onRelock: handleRelock, onRemove: handleRemove };
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

async function add() {
  const val = urlInput.value.trim();
  if (!val) return;
  const durationMs = Number(addDur.value) || undefined;
  const r = await api.add(val, durationMs);
  if (r.ok) { showMsg("Blocked.", "ok"); urlInput.value = ""; render(); }
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

checkIncognitoAccess();
render();

// Keep the countdowns live while the popup is open.
setInterval(tick, 15000);
