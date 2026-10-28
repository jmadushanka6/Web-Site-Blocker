// siteActions.js
// The service layer: each export is one user-facing action, composing
// lockModel (rules) + storage (persistence) + rules.js (enforcement) +
// tabs.js, offTracker.js and badge.js without any of those modules needing
// to know about each other.
// Dependency Inversion: this is the only file that wires the pieces
// together, so each piece can change independently (swap storage,
// change enforcement, tweak lock rules) without touching the others.
import {
  normalizeDomain,
  siteFromUrl,
  findLockedCover,
  isBroadSuffix,
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
import { reloadTabsOn, getTab, getActiveTab, reloadTab } from "./tabs.js";
import { getUnseenOffPeriods, acknowledgeOffPeriods } from "./offTracker.js";
import { showAttention, flashBadge } from "./badge.js";

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
    // Times the extension was switched off that the user hasn't dismissed yet.
    offPeriods: await getUnseenOffPeriods(),
  };
}

export async function addSite(rawInput, durationMs) {
  const domain = normalizeDomain(rawInput);
  if (!domain) return { ok: false, error: "Invalid link. Try something like facebook.com" };
  if (isBroadSuffix(domain)) {
    return { ok: false, error: domain + " is a domain ending shared by many sites. Enter a specific site, like bbc.co.uk." };
  }
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

// Which site a tab is showing, and whether a lock already covers it — what
// the popup needs to decide whether to offer its one-click "Block" button.
export async function tabSiteStatus(tabId) {
  const tab = await getTab(tabId);
  const domain = siteFromUrl(tab && tab.url);
  if (!domain) return { ok: true, domain: null, blockedBy: null };
  const cover = findLockedCover(await getBlocklist(), domain);
  return { ok: true, domain, blockedBy: cover ? cover.domain : null };
}

// Block whatever site a tab is showing — no typing involved — and make sure
// that tab switches to the block straight away. `pageUrl` is a fallback for
// when Chrome hides the tab's URL (a right-click passes the page's URL).
export async function blockTab(tabId, durationMs, pageUrl) {
  const tab = await getTab(tabId);
  if (!tab) return { ok: false, error: "That tab isn't open any more." };
  const domain = siteFromUrl(tab.url || pageUrl);
  if (!domain) return { ok: false, error: "This page isn't a website that can be blocked." };
  const list = await getBlocklist();
  const cover = findLockedCover(list, domain);
  if (cover) {
    // Already blocked: the tab was opened before the block existed (or while
    // the extension couldn't act on it), so a reload brings up the block.
    await reloadTab(tabId);
    return { ok: true, domain: cover.domain, alreadyBlocked: true };
  }
  const wasListed = list.some((e) => e.domain === domain);
  const r = await addSite(domain, durationMs);
  if (!r.ok) return r;
  // addSite reloads the open tabs of a site that's new to the list, but it
  // can only find them with site access, and it leaves a re-locked site's
  // tabs alone. Make sure this tab shows the block either way.
  if (wasListed || !(await hasSiteAccess(domain))) await reloadTab(tabId);
  return { ok: true, domain, alreadyBlocked: false };
}

// blockTab for the right-click menu and the keyboard shortcut. No popup is
// open there to show an error in, so a failure flashes the toolbar badge
// (hovering the icon shows why).
export async function quickBlockTab(tab, durationMs, pageUrl) {
  const target = tab && tab.id >= 0 ? tab : await getActiveTab();
  const r = target
    ? await blockTab(target.id, durationMs, pageUrl)
    : { ok: false, error: "There's no tab to block." };
  if (!r.ok) await flashBadge("×", "#ff7a7a", "Couldn't block: " + r.error, refreshBadge);
  return r;
}

// Keep the toolbar badge in step with the "it was switched off" notice.
export async function refreshBadge() {
  await showAttention((await getUnseenOffPeriods()).length > 0);
}

// The user has read the "it was switched off" notice in the popup.
export async function dismissOffNotice() {
  await acknowledgeOffPeriods();
  await refreshBadge();
  return { ok: true };
}
