// siteActions.js
// The service layer: each export is one user-facing action, composing
// lockModel (rules) + storage (persistence) + rules.js (enforcement)
// without any of those modules needing to know about each other.
// Dependency Inversion: this is the only file that wires the pieces
// together, so each piece can change independently (swap storage,
// change enforcement, tweak lock rules) without touching the others.
import {
  normalizeDomain,
  isLocked,
  isValidDuration,
  isValidExtendDuration,
  isValidExtension,
  computeNewLock,
  computeExtendedLockUntil,
  formatRemaining,
  DEFAULT_DURATION_MS,
  DURATION_OPTIONS,
  EXTEND_OPTIONS,
} from "./lockModel.js";
import { getBlocklist, setBlocklist } from "./storage.js";
import { syncRules, hasSiteAccess } from "./rules.js";
import { reloadTabsOn } from "./tabs.js";

export async function listSites() {
  const list = await getBlocklist();
  const access = await Promise.all(list.map((e) => hasSiteAccess(e.domain)));
  return {
    ok: true,
    // siteAccess is for display only and never stored: false means the
    // user has restricted the extension's access to that site, so it's
    // enforced with Chrome's plain block page instead of the countdown page.
    list: list.map((e, i) => ({ ...e, siteAccess: access[i] })),
    durations: DURATION_OPTIONS,
    extendOptions: EXTEND_OPTIONS,
    defaultDurationMs: DEFAULT_DURATION_MS,
  };
}

export async function addSite(rawInput, durationMs) {
  const domain = normalizeDomain(rawInput);
  if (!domain) return { ok: false, error: "Invalid link. Try something like facebook.com" };
  const dur = isValidDuration(durationMs) ? durationMs : DEFAULT_DURATION_MS;
  const list = await getBlocklist();
  const existing = list.find((e) => e.domain === domain);
  if (existing) {
    if (isLocked(existing)) {
      return { ok: false, error: domain + " is already blocked." };
    }
    // Already in the list but its timer had run out — treat this as a re-lock.
    Object.assign(existing, computeNewLock(dur));
  } else {
    list.push({ domain, ...computeNewLock(dur) });
  }
  await setBlocklist(list);
  await syncRules();
  // A site that's new to the list may be open in tabs right now; reload
  // them so the block shows immediately. (A re-locked site was never
  // unblocked, so its tabs are already on the blocked page.)
  if (!existing) await reloadTabsOn(domain);
  return { ok: true };
}

// Removal is the one action gated by the lock: it is flatly refused while
// isLocked() is true, with no override. The UI additionally hides the
// Remove control entirely until a site is unlocked (belt and suspenders).
export async function removeSite(domain) {
  const list = await getBlocklist();
  const entry = list.find((e) => e.domain === domain);
  if (!entry) return { ok: false, error: "Not found." };
  if (isLocked(entry)) {
    const remaining = entry.lockUntil - Date.now();
    return {
      ok: false,
      locked: true,
      remainingMs: remaining,
      error: "Locked. You can remove this in " + formatRemaining(remaining) + ".",
    };
  }
  await setBlocklist(list.filter((e) => e.domain !== domain));
  await syncRules();
  return { ok: true };
}

// Extend a STILL-LOCKED entry. The chosen duration sets the lock to expire
// that far from now — but ONLY if that's later than the current lockUntil,
// so remaining time can only grow, never shrink. The popup already limits
// the dropdown to options that satisfy this, so this check is the
// server-side backstop against a stale UI ever sending a bad value.
export async function extendSite(domain, durationMs) {
  if (!isValidExtendDuration(durationMs)) return { ok: false, error: "Pick a valid duration." };
  const list = await getBlocklist();
  const entry = list.find((e) => e.domain === domain);
  if (!entry) return { ok: false, error: "Not found." };
  if (!isLocked(entry)) {
    return { ok: false, error: 'This site is already unlocked — use "Block again" instead.' };
  }
  if (!isValidExtension(entry, durationMs)) {
    return {
      ok: false,
      error: "You can only extend to a longer lock than what's left — pick a bigger option.",
    };
  }
  entry.lockUntil = computeExtendedLockUntil(durationMs);
  await setBlocklist(list);
  await syncRules(); // refresh the redirect URL's "until" param immediately
  return { ok: true };
}

// Re-lock an entry whose timer already ran out. Restarts the commitment
// timer with a freshly chosen duration. The site was never actually
// unblocked, so this simply re-establishes the "can't remove" guarantee.
export async function relockSite(domain, durationMs) {
  if (!isValidDuration(durationMs)) return { ok: false, error: "Pick a valid duration." };
  const list = await getBlocklist();
  const entry = list.find((e) => e.domain === domain);
  if (!entry) return { ok: false, error: "Not found." };
  if (isLocked(entry)) {
    return { ok: false, error: 'This site is still locked — use "Extend" instead.' };
  }
  Object.assign(entry, computeNewLock(durationMs));
  await setBlocklist(list);
  await syncRules(); // refresh the redirect URL's "until" param immediately
  return { ok: true };
}
