// attempts.js
// Single Responsibility: count how often a blocked site was tried — each
// time someone opened it and got the blocked page instead — per site and
// per day, so the blocked page can show "Visits blocked: 12" and, once a
// block has been running for a week, a chart of the daily counts.
//
// The top half is pure (no chrome.*) and unit-tested in tests/attempts.test.js.
// The bottom half keeps the counts in chrome.storage.local under ATTEMPTS:
//   { "<domain>": { since, total, days: { "2026-11-03": 4, ... } } }
// `since` is when counting started for that site, `total` every attempt
// since then, and `days` the per-day counts (local calendar days), trimmed
// to the last KEEP_DAYS. Only the background service worker writes here, so
// two blocked tabs opening at once can't overwrite each other's count. The
// counts never leave the device, and they're deleted with the site.

export const ATTEMPTS = "attempts";

// Per-day counts older than this are dropped (the total keeps them).
export const KEEP_DAYS = 60;

// The chart appears once counting has been going for this many days...
export const CHART_AFTER_DAYS = 7;
// ...and shows at most this many of the most recent days.
export const CHART_MAX_DAYS = 30;

// Opening the blocked page doesn't always mean someone tried the site:
// blocking a site reloads its open tabs onto the blocked page, and
// reloading or going back to the page shows it again. Neither counts.
export const GRACE_MS = 15 * 1000;

// The local calendar day of a moment, as "YYYY-MM-DD".
export function dayKey(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Local midnight `n` calendar days after the day of `ts` (n may be negative).
// Steps by calendar date, not by 24 hours, so daylight-saving changes don't
// skip or repeat a day.
export function addDays(ts, n) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

// Whole calendar days from the day of `from` to the day of `to`.
// (Midnight to midnight is 23 or 25 hours across a daylight-saving change,
// which the rounding absorbs.)
export function daysBetween(from, to) {
  return Math.round((addDays(to, 0) - addDays(from, 0)) / (24 * 60 * 60 * 1000));
}

// Whether this showing of the blocked page counts as an attempt.
//   entry:   the site's blocklist entry (null when it isn't blocked)
//   navType: how the page was reached — performance's navigation type
//            ("navigate", "reload", "back_forward", "prerender")
export function shouldCount(entry, navType, now = Date.now()) {
  if (!entry) return false;
  if (navType === "reload" || navType === "back_forward") return false;
  const startedAt = entry.addedAt || entry.createdAt || 0;
  if (now >= startedAt && now - startedAt < GRACE_MS) return false;
  return true;
}

// A record for a site counting starts on now.
export function newRecord(now = Date.now()) {
  return { since: now, total: 0, days: {} };
}

// `record` with one more attempt today, and per-day counts older than
// KEEP_DAYS dropped. Doesn't change the record it's given.
export function addAttempt(record, now = Date.now()) {
  const base = record && typeof record.since === "number" ? record : newRecord(now);
  const today = dayKey(now);
  const oldest = dayKey(addDays(now, -(KEEP_DAYS - 1)));
  const days = {};
  for (const [day, count] of Object.entries(base.days || {})) {
    if (day >= oldest && day <= today) days[day] = count;
  }
  days[today] = (days[today] || 0) + 1;
  return { since: base.since, total: (base.total || 0) + 1, days };
}

export function todayCount(record, now = Date.now()) {
  return (record && record.days && record.days[dayKey(now)]) || 0;
}

// True once counting has gone on long enough for a daily chart to say
// something: CHART_AFTER_DAYS calendar days or more.
export function showsChart(record, now = Date.now()) {
  return !!record && typeof record.since === "number" && daysBetween(record.since, now) >= CHART_AFTER_DAYS;
}

// One { day, ts, count } per calendar day from the day counting started (at
// most CHART_MAX_DAYS back) to today, oldest first, with 0 for quiet days.
export function dailySeries(record, now = Date.now(), maxDays = CHART_MAX_DAYS) {
  if (!record || typeof record.since !== "number") return [];
  const span = Math.min(daysBetween(record.since, now) + 1, maxDays);
  const series = [];
  for (let i = span - 1; i >= 0; i--) {
    const ts = addDays(now, -i);
    const day = dayKey(ts);
    series.push({ day, ts, count: (record.days && record.days[day]) || 0 });
  }
  return series;
}

// ---------------------------------------------------------------------------
// Storage. Writes are queued so two can never interleave.

async function readAll() {
  const { [ATTEMPTS]: all } = await chrome.storage.local.get(ATTEMPTS);
  return all && typeof all === "object" ? all : {};
}

let queue = Promise.resolve();
function update(change) {
  const run = queue.then(async () => {
    const all = await readAll();
    const result = change(all);
    await chrome.storage.local.set({ [ATTEMPTS]: all });
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

// Start counting for a site that has just gone on the list, so a week of
// quiet still shows as a week (counts it already has are kept).
export function startCounting(domain, now = Date.now()) {
  return update((all) => {
    if (!all[domain]) all[domain] = newRecord(now);
  });
}

// One more attempt on `domain`; resolves to the updated record.
export function logAttempt(domain, now = Date.now()) {
  return update((all) => {
    all[domain] = addAttempt(all[domain], now);
    return all[domain];
  });
}

// The site came off the list (removed, or undone): its counts go with it.
export function forgetAttempts(domain) {
  return update((all) => {
    delete all[domain];
  });
}
