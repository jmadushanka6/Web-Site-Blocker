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
  newEntry,
  canUndo,
  computeExtendedLockUntil,
  DEFAULT_DURATION_MS,
  DURATION_OPTIONS,
  EXTEND_OPTIONS,
} from "./lockModel.js";
import { getBlocklist, setBlocklist } from "./storage.js";
import { t, remainingText } from "./i18n.js";
import { syncRules, hasSiteAccess } from "./rules.js";
import { reloadTabsOn, getTab, getActiveTab, reloadTab } from "./tabs.js";
import { getUnseenOffPeriods, acknowledgeOffPeriods } from "./offTracker.js";
import { showAttention, flashBadge } from "./badge.js";
import { shouldCount, logAttempt, startCounting, forgetAttempts } from "./attempts.js";

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
  if (!domain) return { ok: false, error: t("errInvalid") };
  if (isBroadSuffix(domain)) {
    return { ok: false, error: t("errPublicSuffix", domain) };
  }
  const dur = isValidDuration(durationMs) ? durationMs : DEFAULT_DURATION_MS;
  const list = await getBlocklist();
  const existing = list.find((e) => e.domain === domain);
  if (existing) {
    if (isLocked(existing)) {
      return { ok: false, error: t("errAlready", domain) };
    }
    // Already in the list but its timer had run out — treat this as a re-lock.
    Object.assign(existing, computeNewLock(dur));
  } else {
    list.push(newEntry(domain, dur));
  }
  await setBlocklist(list);
  await syncRules();
  if (!existing) await startCounting(domain);
  // A site that's new to the list may be open in tabs right now; reload
  // them so the block shows immediately. (A re-locked site was never
  // unblocked, so its tabs are already on the blocked page.)
  if (!existing) await reloadTabsOn(domain);
  // isNew: only a new block can be undone (see undoBlock).
  return { ok: true, domain, isNew: !existing };
}

// Takes back a block made moments ago, in case it was the wrong site: the
// one removal allowed while a timer runs. It only works in a NEW block's
// first 30 seconds (UNDO_MS in lockModel.js); a restarted timer, or any
// block after that, keeps the usual rules.
export async function undoBlock(domain) {
  const list = await getBlocklist();
  const entry = list.find((e) => e.domain === domain);
  if (!entry) return { ok: false, error: t("errNotFound") };
  if (!canUndo(entry)) return { ok: false, error: t("errUndoLate") };
  await setBlocklist(list.filter((e) => e.domain !== domain));
  await syncRules();
  await forgetAttempts(domain);
  return { ok: true };
}

// Removal is the one action gated by the lock: it is flatly refused while
// isLocked() is true, with no override. The UI additionally hides the
// Remove control entirely until a site is unlocked (belt and suspenders).
export async function removeSite(domain) {
  const list = await getBlocklist();
  const entry = list.find((e) => e.domain === domain);
  if (!entry) return { ok: false, error: t("errNotFound") };
  if (isLocked(entry)) {
    const remaining = entry.lockUntil - Date.now();
    return {
      ok: false,
      locked: true,
      remainingMs: remaining,
      error: t("errLocked", remainingText(remaining)),
    };
  }
  await setBlocklist(list.filter((e) => e.domain !== domain));
  await syncRules();
  await forgetAttempts(domain);
  return { ok: true };
}

// Extend a STILL-LOCKED entry. The chosen duration sets the lock to expire
// that far from now — but ONLY if that's later than the current lockUntil,
// so remaining time can only grow, never shrink. The popup already limits
// the dropdown to options that satisfy this, so this check is the
// server-side backstop against a stale UI ever sending a bad value.
export async function extendSite(domain, durationMs) {
  if (!isValidExtendDuration(durationMs)) return { ok: false, error: t("errDuration") };
  const list = await getBlocklist();
  const entry = list.find((e) => e.domain === domain);
  if (!entry) return { ok: false, error: t("errNotFound") };
  if (!isLocked(entry)) {
    return { ok: false, error: t("errTimerEnded") };
  }
  if (!isValidExtension(entry, durationMs)) {
    return {
      ok: false,
      error: t("errShorter"),
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
  if (!isValidDuration(durationMs)) return { ok: false, error: t("errDuration") };
  const list = await getBlocklist();
  const entry = list.find((e) => e.domain === domain);
  if (!entry) return { ok: false, error: t("errNotFound") };
  if (isLocked(entry)) {
    return { ok: false, error: t("errTimerRunning") };
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
  if (!tab) return { ok: false, error: t("errTabGone") };
  const domain = siteFromUrl(tab.url || pageUrl);
  if (!domain) return { ok: false, error: t("errNotWebsite") };
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

// blockTab for the right-click menu. No popup is open there to show an
// error in, so a failure flashes the toolbar badge (hovering the icon shows
// why). A mistake is undone from the countdown page the tab switches to.
export async function quickBlockTab(tab, durationMs, pageUrl) {
  const target = tab && tab.id >= 0 ? tab : await getActiveTab();
  const r = target
    ? await blockTab(target.id, durationMs, pageUrl)
    : { ok: false, error: t("errNoTab") };
  if (!r.ok) await flashBadge("×", "#ff7a7a", t("badgeCouldnt", r.error), refreshBadge);
  return r;
}

// The blocked page has just been shown for `domain`. Count it as a try
// unless it was only a reload, a step back, or the tab switching over as
// the block began (see shouldCount in attempts.js). Only sites on the list
// are counted, so a stray message can't invent counts for anything else.
export async function recordAttempt(domain, navType) {
  const entry = (await getBlocklist()).find((e) => e.domain === domain);
  if (!shouldCount(entry, navType)) return { ok: true, counted: false };
  await logAttempt(domain);
  return { ok: true, counted: true };
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
