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

let durationOptions = [];
let extendOptions = [];
let msgTimer = null;

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

async function render() {
  const res = await api.list();
  if (!res.ok) { showMsg(res.error || "Something went wrong.", "err"); return; }
  durationOptions = res.durations || durationOptions;
  extendOptions = res.extendOptions || extendOptions;

  const now = Date.now();
  const list = (res.list || []).slice().sort((a, b) => {
    const aLocked = a.lockUntil > now;
    const bLocked = b.lockUntil > now;
    if (aLocked !== bLocked) return aLocked ? -1 : 1; // locked sites first
    return a.domain.localeCompare(b.domain);
  });

  renderCount(list.length);
  listEl.innerHTML = "";

  if (list.length === 0) {
    listEl.appendChild(buildEmptyState());
    return;
  }

  const opts = { durationOptions, extendOptions };
  const callbacks = { onExtend: handleExtend, onRelock: handleRelock, onRemove: handleRemove };
  for (const entry of list) {
    listEl.appendChild(buildItem(entry, now, opts, callbacks));
  }
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

addBtn.addEventListener("click", add);
urlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });

(async function init() {
  const res = await api.list();
  if (res.ok) {
    durationOptions = res.durations || [];
    extendOptions = res.extendOptions || [];
    populateSelect(addDur, durationOptions);
  }
  render();
})();

// Live-update the countdowns while the popup is open.
setInterval(render, 15000);
