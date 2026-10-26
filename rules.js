// rules.js
// Single Responsibility: translate the blocklist into declarativeNetRequest
// rules and keep Chrome's enforcement in sync with it.
//
// Every entry is blocked regardless of lock status — locking only ever
// governs whether an entry can be REMOVED (see lockModel.js / siteActions.js),
// never whether it's enforced. That boundary intentionally lives outside
// this file so enforcement logic never has to know about lock timers.
import { getBlocklist } from "./storage.js";

function buildRules(list) {
  return list.map((entry, i) => ({
    id: i + 1,
    priority: 1,
    action: {
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
    },
    condition: {
      requestDomains: [entry.domain],
      resourceTypes: ["main_frame"],
    },
  }));
}

// Replace ALL dynamic rules with the current blocklist. This is idempotent,
// so calling it on install, on change, and periodically keeps enforcement fresh.
export async function syncRules() {
  const list = await getBlocklist();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map((r) => r.id);
  const addRules = buildRules(list);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules,
  });
}
