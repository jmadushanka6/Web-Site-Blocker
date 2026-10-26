// popupRender.js
// Single Responsibility: turn blocklist entries into DOM nodes and keep them
// current. Pure view logic — it has no idea how to talk to the background
// worker; callers pass in the callbacks to run when a button is clicked
// (Dependency Inversion: this module depends on a small callback
// "interface", not on the concrete popupApi module).
import { formatRemaining } from "./lockModel.js";

export function populateSelect(sel, options) {
  sel.innerHTML = "";
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.ms;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
}

export function buildEmptyState() {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = "No sites blocked yet — add one above to get started.";
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

// Builds one list row and returns { el, refresh(now) }.
//
// refresh() updates the countdown, the progress bar and the extend choices
// in place, leaving whatever the user has picked in the dropdown alone. It
// returns false when the row can't be updated in place (its lock has just
// run out), telling the caller to rebuild the list.
//
// options: { durationOptions, extendOptions }
// callbacks: { onExtend(domain, durationMs), onRelock(domain, durationMs), onRemove(domain) }
export function buildItem(entry, now, options, callbacks) {
  const locked = entry.lockUntil > now;

  const li = document.createElement("li");
  li.className = "item " + (locked ? "active" : "expired");

  const top = document.createElement("div");
  top.className = "item-top";
  const dom = document.createElement("span");
  dom.className = "dom";
  dom.textContent = entry.domain;
  const badge = document.createElement("span");
  badge.className = "badge " + (locked ? "locked" : "unlocked");
  badge.textContent = "✓ Unlocked";
  top.appendChild(dom);
  top.appendChild(badge);
  li.appendChild(top);

  let track = null;
  let bar = null;
  if (locked) {
    track = document.createElement("div");
    track.className = "progress";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Lock progress for " + entry.domain);
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
    sel.setAttribute("aria-label", (locked ? "New lock length for " : "Lock length for ") + entry.domain);
    populateSelect(sel, choices);
    shownChoices = choiceKey(choices);

    const actBtn = document.createElement("button");
    actBtn.className = "btn-action";
    actBtn.textContent = locked ? "Extend" : "Block again";
    actBtn.setAttribute("aria-label", (locked ? "Extend " : "Block again ") + entry.domain);
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
    note.textContent = "Already at the longest available lock";
    actions.appendChild(note);
  }

  // Remove is only ever shown once a site is actually unlocked — while
  // locked there is no removal affordance at all, not even a disabled one.
  if (!locked) {
    const rm = document.createElement("button");
    rm.className = "btn-remove";
    rm.textContent = "Remove";
    rm.setAttribute("aria-label", "Remove " + entry.domain);
    rm.addEventListener("click", () => callbacks.onRemove(entry.domain));
    actions.appendChild(rm);
  }

  li.appendChild(actions);

  // The popup explains restricted site access once, above the list; each
  // affected row just carries this short marker.
  if (entry.siteAccess === false) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Shows Chrome's plain block page";
    li.appendChild(note);
  }

  function refresh(nowMs) {
    if (!locked) return true; // nothing on an unlocked row changes with time
    const remaining = entry.lockUntil - nowMs;
    if (remaining <= 0) return false; // the lock just ran out: rebuild

    badge.textContent = "🔒 " + formatRemaining(remaining) + " left";
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
      populateSelect(sel, next);
      if (next.some((o) => String(o.ms) === picked)) sel.value = picked;
      shownChoices = key;
    }
    return true;
  }

  refresh(now);
  return { el: li, refresh };
}
