// popupRender.js
// Single Responsibility: turn blocklist entries into DOM nodes and keep them
// current. Pure view logic — it has no idea how to talk to the background
// worker; callers pass in the callbacks to run when a button is clicked
// (Dependency Inversion: this module depends on a small callback
// "interface", not on the concrete popupApi module).
import { t, durationLabel, remainingText, fmtDay } from "./i18n.js";
import { undoMsLeft } from "./lockModel.js";

// `label(option)` names each choice; by default just its length ("7 days").
export function populateSelect(sel, options, label = durationLabel) {
  sel.innerHTML = "";
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.ms;
    opt.textContent = label(o);
    sel.appendChild(opt);
  }
}

// The padlock from the extension's icon, drawn in the badge's own colour.
// (An emoji would look different on every system.)
const SVG_NS = "http://www.w3.org/2000/svg";
function lockIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "lock-icon");
  const shackle = document.createElementNS(SVG_NS, "path");
  shackle.setAttribute("d", "M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10");
  shackle.setAttribute("fill", "none");
  shackle.setAttribute("stroke", "currentColor");
  shackle.setAttribute("stroke-width", "2.6");
  shackle.setAttribute("stroke-linecap", "round");
  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", "5");
  body.setAttribute("y", "10");
  body.setAttribute("width", "14");
  body.setAttribute("height", "11");
  body.setAttribute("rx", "2.5");
  body.setAttribute("fill", "currentColor");
  svg.append(shackle, body);
  return svg;
}

// An Extend choice says where it would land: "7 days from now · Mon 9 Nov".
export function extendLabel(option, now) {
  return t("extendOption", durationLabel(option), fmtDay(now + option.ms));
}

export function buildEmptyState() {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = t("emptyState");
  return li;
}

function elapsedPercent(entry, remaining) {
  const total = entry.lockUntil - entry.addedAt;
  return total > 0 ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 100;
}

// Extending can only ever lengthen a lock: while a site is locked, the
// dropdown only lists options that would land LATER than the time currently
// left, so picking one can never shorten it. (The 30-day option is a fixed
// value compared against a number that only ticks downward from at most
// 30 days, so it always qualifies — there's always at least one choice.)
function choicesFor(entry, locked, now, options) {
  return locked
    ? options.extendOptions.filter((o) => o.ms > entry.lockUntil - now)
    : options.durationOptions;
}

function choiceKey(choices) {
  return choices.map((o) => o.ms).join(",");
}

// Builds one list row and returns { el, refresh(now), refreshUndo(now) }.
//
// refresh() updates the countdown, the progress bar and the extend choices
// in place, leaving whatever the user has picked in the dropdown alone. It
// returns false when the row can't be updated in place (its lock has just
// run out), telling the caller to rebuild the list. refreshUndo() counts
// down a new block's "Wrong site? Undo" line once a second and removes it
// when its 30 seconds are over.
//
// options: { durationOptions, extendOptions }
// callbacks: { onExtend(domain, durationMs), onRelock(domain, durationMs),
//              onRemove(domain), onUndo(domain) }
export function buildItem(entry, now, options, callbacks) {
  const locked = entry.lockUntil > now;

  const li = document.createElement("li");
  li.className = "item " + (locked ? "active" : "expired");

  const top = document.createElement("div");
  top.className = "item-top";
  const dom = document.createElement("span");
  dom.className = "dom";
  dom.textContent = entry.domain;
  // While the timer runs: "Removable in 5d 2h" (filled in by refresh). Once
  // it has run out the site is STILL blocked, so the badge says so plainly.
  const badge = document.createElement("span");
  badge.className = "badge " + (locked ? "locked" : "ended");
  const badgeText = document.createElement("span");
  badgeText.textContent = t("badgeEnded");
  badge.append(lockIcon(), badgeText);
  top.appendChild(dom);
  top.appendChild(badge);
  li.appendChild(top);

  let track = null;
  let bar = null;
  if (locked) {
    track = document.createElement("div");
    track.className = "progress";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", t("ariaProgress", entry.domain));
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    bar = document.createElement("div");
    bar.className = "bar";
    track.appendChild(bar);
    li.appendChild(track);
  }

  const actions = document.createElement("div");
  actions.className = "item-actions";

  let sel = null;
  let shownChoices = "";
  const choices = choicesFor(entry, locked, now, options);
  if (choices.length > 0) {
    sel = document.createElement("select");
    sel.className = "dur";
    sel.setAttribute("aria-label", t(locked ? "ariaNewLength" : "ariaLength", entry.domain));
    populateSelect(sel, choices, locked ? (o) => extendLabel(o, now) : durationLabel);
    shownChoices = choiceKey(choices);

    const actBtn = document.createElement("button");
    actBtn.className = "btn-action";
    actBtn.textContent = t(locked ? "extend" : "restartTimer");
    actBtn.setAttribute("aria-label", t(locked ? "ariaExtend" : "ariaRestart", entry.domain));
    actBtn.addEventListener("click", () => {
      const durationMs = Number(sel.value);
      if (locked) callbacks.onExtend(entry.domain, durationMs);
      else callbacks.onRelock(entry.domain, durationMs);
    });

    actions.appendChild(sel);
    actions.appendChild(actBtn);
  } else {
    // Not expected with the current option set (see choicesFor), kept only
    // as a defensive fallback.
    const note = document.createElement("span");
    note.className = "maxed";
    note.textContent = t("maxed");
    actions.appendChild(note);
  }

  // Remove is only ever shown once a site is actually unlocked — while
  // locked there is no removal affordance at all, not even a disabled one.
  if (!locked) {
    const rm = document.createElement("button");
    rm.className = "btn-remove";
    rm.textContent = t("remove");
    rm.setAttribute("aria-label", t("ariaRemove", entry.domain));
    rm.addEventListener("click", () => callbacks.onRemove(entry.domain));
    actions.appendChild(rm);
  }

  li.appendChild(actions);

  // A block made moments ago can be taken back for 30 seconds.
  let undoRow = null;
  let undoBtn = null;
  if (locked && callbacks.onUndo && undoMsLeft(entry, now) > 0) {
    undoRow = document.createElement("div");
    undoRow.className = "undo-row";
    const ask = document.createElement("span");
    ask.textContent = t("undoAsk");
    undoBtn = document.createElement("button");
    undoBtn.className = "btn-undo";
    undoBtn.setAttribute("aria-label", t("ariaUndo", entry.domain));
    undoBtn.addEventListener("click", () => {
      undoBtn.disabled = true;
      callbacks.onUndo(entry.domain);
    });
    undoRow.append(ask, undoBtn);
    li.appendChild(undoRow);
  }

  // The popup explains restricted site access once, above the list; each
  // affected row just carries this short marker.
  if (entry.siteAccess === false) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = t("plainBlockNote");
    li.appendChild(note);
  }

  function refreshUndo(nowMs) {
    if (!undoRow) return;
    const left = undoMsLeft(entry, nowMs);
    if (left <= 0) {
      undoRow.remove();
      undoRow = null;
      return;
    }
    undoBtn.textContent = t("undoButton", Math.ceil(left / 1000));
  }

  function refresh(nowMs) {
    if (!locked) return true; // nothing on an unlocked row changes with time
    const remaining = entry.lockUntil - nowMs;
    if (remaining <= 0) return false; // the lock just ran out: rebuild

    badgeText.textContent = t("badgeRemovableIn", remainingText(remaining));
    const pct = elapsedPercent(entry, remaining);
    bar.style.width = pct + "%";
    track.setAttribute("aria-valuenow", String(Math.round(pct)));

    // As time passes, shorter extend options start to qualify. Add them
    // without changing what the user has currently picked.
    const next = choicesFor(entry, locked, nowMs, options);
    if (!sel) return next.length === 0; // fallback row: rebuild once a choice exists
    const key = choiceKey(next);
    if (key !== shownChoices) {
      const picked = sel.value;
      populateSelect(sel, next, (o) => extendLabel(o, nowMs));
      if (next.some((o) => String(o.ms) === picked)) sel.value = picked;
      shownChoices = key;
    } else {
      // Same choices; keep the days they'd end on current (past midnight).
      for (const opt of sel.options) {
        const o = next.find((x) => String(x.ms) === opt.value);
        if (o) opt.textContent = extendLabel(o, nowMs);
      }
    }
    return true;
  }

  refresh(now);
  refreshUndo(now);
  return { el: li, refresh, refreshUndo };
}

// One-click "Block <site in this tab>" button, plus the divider above the
// text field. durationLabel mirrors the lock-length dropdown it shares.
export function buildQuickAdd(domain, durationText, onBlock) {
  const frag = document.createDocumentFragment();

  const btn = document.createElement("button");
  btn.className = "quick-add";
  btn.setAttribute("aria-label", t("quickAria", domain, durationText));
  const icon = document.createElement("span");
  icon.className = "qa-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "＋";
  const text = document.createElement("span");
  text.className = "qa-text";
  const name = document.createElement("b");
  name.textContent = domain;
  // The site's name sits in bold inside a translated sentence ("Block x" /
  // "x sperren"), so split the sentence around it.
  const [before, after = ""] = t("quickBlock", "\uE000").split("\uE000");
  text.append(before, name, after);
  const dur = document.createElement("span");
  dur.className = "qa-dur";
  dur.textContent = durationText;
  btn.append(icon, text, dur);
  btn.addEventListener("click", () => {
    btn.disabled = true; // one block per click, even on a double-click
    onBlock();
  });

  const or = document.createElement("div");
  or.className = "or";
  or.setAttribute("aria-hidden", "true");
  or.textContent = t("orType");

  frag.append(btn, or);
  return frag;
}

// ---------------------------------------------------------------------------
// "The blocker was switched off" notice. The wording helpers are pure (no
// DOM), so they're unit-tested directly (tests/popupRender.test.js).

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// "today", "yesterday" or "on Mon 26 Oct" ("heute", "gestern", "am Mo., 26. Okt.").
export function dayPhrase(ts, now = Date.now()) {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (daysAgo === 0) return t("today");
  if (daysAgo === 1) return t("yesterday");
  return t("onDate", fmtDay(ts));
}

// "10:02 to 10:40 today", or "22:15 yesterday to 08:10 today". (Other
// languages may order the parts differently; see _locales.)
export function fmtRange(from, to, now = Date.now()) {
  if (startOfDay(from) === startOfDay(to)) {
    return t("rangeSameDay", timeLabel(from), timeLabel(to), dayPhrase(to, now));
  }
  return t("rangeTwoDays", timeLabel(from), dayPhrase(from, now), timeLabel(to), dayPhrase(to, now));
}

// "less than a minute", "38 min", "2 hr 5 min", "1 day 3 hr".
export function fmtDuration(ms) {
  const totalMin = Math.round(Math.max(0, ms) / 60000);
  if (totalMin < 1) return t("durLess");
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return (d === 1 ? t("durDay1") : t("durDays", d)) + (h ? " " + t("durHr", h) : "");
  if (h > 0) return t("durHr", h) + (m ? " " + t("durMin", m) : "");
  return t("durMin", m);
}

// When one off period happened: "from about 10:02 to 10:40 today",
// "around 10:36 today" (started and ended in the same minute), or
// "until 10:40 today" (start unknown).
function spanPhrase(p, now) {
  if (!p.offAt) return t("spanUntil", timeLabel(p.onAt), dayPhrase(p.onAt, now));
  if (startOfDay(p.offAt) === startOfDay(p.onAt) && timeLabel(p.offAt) === timeLabel(p.onAt)) {
    return t("spanAround", timeLabel(p.onAt), dayPhrase(p.onAt, now));
  }
  return t("spanFrom", fmtRange(p.offAt, p.onAt, now));
}

// periods: [{ offAt (ms, or null if unknown), onAt (ms) }], oldest first.
export function describeOffPeriods(periods, now = Date.now()) {
  const latest = periods[periods.length - 1];
  const when = spanPhrase(latest, now);

  if (periods.length === 1) {
    const length = latest.offAt ? ` (${fmtDuration(latest.onAt - latest.offAt)})` : "";
    return { title: t("offTitle1"), body: t("offBody1", when, length) };
  }

  const totalMs = periods.reduce((sum, p) => sum + (p.offAt ? Math.max(0, p.onAt - p.offAt) : 0), 0);
  const totalText = Math.round(totalMs / 60000) < 1 ? t("offTotalLess") : t("offTotalAbout", fmtDuration(totalMs));
  return {
    title: periods.length === 2 ? t("offTitle2") : t("offTitleN", periods.length),
    body: t("offBodyN", totalText, when),
  };
}

export function buildOffNotice(periods, now, onDismiss) {
  const { title, body } = describeOffPeriods(periods, now);

  const box = document.createElement("div");
  box.className = "off-notice";
  box.setAttribute("role", "alert");

  const icon = document.createElement("div");
  icon.className = "on-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "⚠️";

  const content = document.createElement("div");
  content.className = "on-content";
  const head = document.createElement("p");
  head.className = "on-title";
  head.textContent = title;
  const b = document.createElement("p");
  b.className = "on-body";
  b.textContent = body;
  const btn = document.createElement("button");
  btn.className = "on-dismiss";
  btn.textContent = t("gotIt");
  btn.addEventListener("click", () => {
    btn.disabled = true;
    onDismiss();
  });
  content.append(head, b, btn);

  box.append(icon, content);
  return box;
}
