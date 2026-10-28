// lockModel.js
// Pure, framework-free rules for how a block's commitment timer behaves.
// Nothing in this file touches chrome.* — Single Responsibility: this
// module only knows the *rules* of locking, never how entries are stored
// or enforced. Because it's pure, it's unit-tested directly with Node's
// built-in test runner (see tests/) without mocking any chrome API.

// Every duration a user can pick when adding a new site, or re-locking one
// whose timer already ran out.
export const DURATION_OPTIONS = [
  { key: "24h", label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "48h", label: "48 hours", ms: 48 * 60 * 60 * 1000 },
  { key: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

// Durations offered when EXTENDING a site that is still locked. Extending
// sets the lock to run out `durationMs` FROM NOW (see computeExtendedLockUntil)
// — a plain replacement, not additive — so the option picked must always be
// bigger than the time currently left, or it would shorten the lock.
// isValidExtension() enforces that; the popup additionally only lists the
// options that currently qualify, so a shortening choice is never even
// selectable. Note the biggest preset (30d) is a fixed value being compared
// against a number that only ever ticks downward from at most 30d, so it is
// always > the remaining time and therefore always available — there is no
// dead end where every option is filtered out.
export const EXTEND_OPTIONS = DURATION_OPTIONS.filter((o) => o.key !== "24h");

export const DEFAULT_DURATION_MS = DURATION_OPTIONS[0].ms; // 24h, used for new sites

export function isValidDuration(ms) {
  return DURATION_OPTIONS.some((o) => o.ms === ms);
}

export function isValidExtendDuration(ms) {
  return EXTEND_OPTIONS.some((o) => o.ms === ms);
}

// A site is locked (un-removable) exactly while its timer hasn't run out.
export function isLocked(entry, now = Date.now()) {
  return !!entry.lockUntil && entry.lockUntil > now;
}

// Turns whatever the user typed or pasted ("facebook.com",
// "https://twitter.com/home", "WWW.Example.org:443/path") into the bare
// hostname to block, or null if it isn't a website address.
export function normalizeDomain(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  // The URL parser strips scheme, credentials, port, path, query and hash,
  // lowercases the host, and converts internationalised names to punycode
  // (münchen.de → xn--mnchen-3ya.de) — the form declarativeNetRequest needs.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "http://" + s;
  let host;
  try {
    host = new URL(s).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.+$/, "").replace(/^www\./, "");
  // Must look like name.tld: dot-separated labels of letters, digits and
  // hyphens, ending in an alphabetic or punycode top-level domain. This
  // rules out IP addresses, localhost and internal pages like
  // chrome://extensions.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.([a-z]{2,}|xn--[a-z0-9-]+)$/.test(host)) return null;
  return host;
}

// True for country "domain endings" such as co.uk, com.au or or.at, which
// people sometimes type by mistake. Blocking one would block every site
// registered under it, so addSite refuses them. This is a deliberately
// simple pattern (a common second-level label under a two-letter country
// code) rather than the full Public Suffix List.
export function isBroadSuffix(domain) {
  return /^(co|com|org|net|ac|edu|gov|gob|go|or|ne|ltd|plc|nic|mil)\.[a-z]{2}$/.test(domain);
}

// Older entries only had { domain, addedAt }. Give them a lockUntil so the
// rest of the logic can treat every entry uniformly.
export function migrateEntry(entry) {
  if (entry && !entry.lockUntil && entry.addedAt) {
    entry.lockUntil = entry.addedAt + DEFAULT_DURATION_MS;
  }
  return entry;
}

// A fresh lock — used both for brand-new sites and for re-locking a site
// whose previous timer already expired.
export function computeNewLock(durationMs, now = Date.now()) {
  return { addedAt: now, lockUntil: now + durationMs };
}

// Extending sets the lock to expire `durationMs` from now. Combined with
// isValidExtension() below, this is how "you can only extend to a longer
// lock, never a shorter one" is enforced.
export function computeExtendedLockUntil(durationMs, now = Date.now()) {
  return now + durationMs;
}

// True only if extending by durationMs would leave MORE time on the lock
// than there currently is — i.e. it's a genuine increase, not a reduction.
export function isValidExtension(entry, durationMs, now = Date.now()) {
  return now + durationMs > entry.lockUntil;
}

export function formatRemaining(ms) {
  if (!(ms > 0)) return "0m";
  const totalMin = Math.ceil(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}
