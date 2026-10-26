// popupRender.js
// Single Responsibility: turn blocklist entries into DOM nodes. Pure view
// logic — it has no idea how to talk to the background worker; callers
// pass in the callbacks to run when a button is clicked (Dependency
// Inversion: this module depends on a small callback "interface", not on
// the concrete popupApi module).

export function fmtRemaining(ms) {
  if (ms <= 0) return "0m";
  const totalMin = Math.ceil(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

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

// options: { durationOptions, extendOptions }
// callbacks: { onExtend(domain, durationMs), onRelock(domain, durationMs), onRemove(domain) }
export function buildItem(entry, now, options, callbacks) {
  const remaining = entry.lockUntil - now;
  const locked = remaining > 0;
  const total = entry.lockUntil - entry.addedAt;
  const elapsedPct = total > 0 ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 100;

  const li = document.createElement("li");
  li.className = "item " + (locked ? "active" : "expired");

  const top = document.createElement("div");
  top.className = "item-top";
  const dom = document.createElement("span");
  dom.className = "dom";
  dom.textContent = entry.domain;
  const badge = document.createElement("span");
  badge.className = "badge " + (locked ? "locked" : "unlocked");
  badge.textContent = locked ? "🔒 " + fmtRemaining(remaining) + " left" : "✓ Unlocked";
  top.appendChild(dom);
  top.appendChild(badge);
  li.appendChild(top);

  if (locked) {
    const track = document.createElement("div");
    track.className = "progress";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = elapsedPct + "%";
    track.appendChild(bar);
    li.appendChild(track);
  }

  const actions = document.createElement("div");
  actions.className = "item-actions";

  // Extending can only ever lengthen a lock: the dropdown only lists
  // options that would land LATER than the time currently left, so
  // picking one can never shorten it. (The 30-day option is a fixed value
  // being compared against a number that only ticks downward from at most
  // 30 days, so it always qualifies — there's always at least one choice.)
  const durOptions = locked
    ? options.extendOptions.filter((o) => o.ms > remaining)
    : options.durationOptions;

  if (durOptions.length > 0) {
    const sel = document.createElement("select");
    sel.className = "dur";
    populateSelect(sel, durOptions);

    const actBtn = document.createElement("button");
    actBtn.className = "btn-action";
    actBtn.textContent = locked ? "Extend" : "Block again";
    actBtn.addEventListener("click", () => {
      const durationMs = Number(sel.value);
      if (locked) callbacks.onExtend(entry.domain, durationMs);
      else callbacks.onRelock(entry.domain, durationMs);
    });

    actions.appendChild(sel);
    actions.appendChild(actBtn);
  } else {
    // Not expected to happen with the current option set (see note above),
    // kept only as a defensive fallback.
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
    rm.addEventListener("click", () => callbacks.onRemove(entry.domain));
    actions.appendChild(rm);
  }

  li.appendChild(actions);
  return li;
}
