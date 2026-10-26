// rules.js
// Single Responsibility: translate the blocklist into declarativeNetRequest
// rules and keep Chrome's enforcement in sync with it.
//
// Every entry is blocked regardless of lock status — locking only ever
// governs whether an entry can be REMOVED (see lockModel.js / siteActions.js),
// never whether it's enforced. That boundary intentionally lives outside
// this file so enforcement logic never has to know about lock timers.
//
// Each site gets one of two rule shapes:
//   - "redirect" to blocked.html, the countdown page. Chrome only applies a
//     redirect on sites the extension has host access to, and users can
//     narrow that access at any time from the puzzle menu ("On click",
//     "On specific sites").
//   - "block", which needs no host access and shows Chrome's own
//     "blocked" page instead.
// A site gets the redirect only while the extension can act on it and
// falls back to a plain block otherwise, so restricting site access can
// never quietly unblock anything.
import { getBlocklist } from "./storage.js";

// Match pattern for a domain and all of its subdomains (in Chrome match
// patterns, "*.example.com" also matches example.com itself).
export function originPatternFor(domain) {
  return "*://*." + domain + "/*";
}

// True if the extension can currently act on `domain` and every subdomain.
export async function hasSiteAccess(domain) {
  try {
    return await chrome.permissions.contains({ origins: [originPatternFor(domain)] });
  } catch {
    return false;
  }
}

function redirectAction(entry) {
  return {
    type: "redirect",
    redirect: {
      // "until"/"added" are passed along purely so blocked.html has an
      // initial value to render before it looks up the live entry itself.
      extensionPath:
        "/blocked.html?d=" +
        encodeURIComponent(entry.domain) +
        "&until=" +
        entry.lockUntil +
        "&added=" +
        entry.addedAt,
    },
  };
}

// Pure, so it can be unit-tested: canRedirect(domain) says whether that
// site can use the countdown-page redirect or needs the plain block.
export function buildRules(list, canRedirect = () => true) {
  return list.map((entry, i) => ({
    id: i + 1,
    priority: 1,
    action: canRedirect(entry.domain) ? redirectAction(entry) : { type: "block" },
    condition: {
      requestDomains: [entry.domain],
      resourceTypes: ["main_frame"],
    },
  }));
}

async function replaceAllRules() {
  const list = await getBlocklist();
  const access = await Promise.all(list.map((e) => hasSiteAccess(e.domain)));
  const redirectable = new Set(list.filter((_, i) => access[i]).map((e) => e.domain));
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: buildRules(list, (domain) => redirectable.has(domain)),
  });
}

// Replace ALL dynamic rules with the current blocklist. Idempotent, so it's
// safe to call on install, on startup, after every change and whenever the
// extension's site access changes. Calls are queued so two syncs can never
// interleave and try to add the same rule IDs twice.
let syncQueue = Promise.resolve();
export function syncRules() {
  const run = syncQueue.then(replaceAllRules, replaceAllRules);
  syncQueue = run.catch(() => {});
  return run;
}
