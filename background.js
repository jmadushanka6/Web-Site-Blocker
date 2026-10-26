// background.js — service worker entry point.
// Single Responsibility: wire chrome events to siteActions. No business
// logic lives here — see lockModel.js (rules), storage.js (persistence),
// rules.js (enforcement), siteActions.js (the actual operations). This file
// is only the adapter between chrome's event system and that service layer.
//
// Open/Closed: adding a new message type means adding one line to the
// `handlers` table below — the dispatcher itself never needs to change.
import { addSite, removeSite, extendSite, relockSite, listSites } from "./siteActions.js";
import { syncRules } from "./rules.js";

const handlers = {
  add: (msg) => addSite(msg.value, msg.durationMs),
  remove: (msg) => removeSite(msg.domain),
  extend: (msg) => extendSite(msg.domain, msg.durationMs),
  relock: (msg) => relockSite(msg.domain, msg.durationMs),
  list: () => listSites(),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const handler = handlers[msg && msg.type];
      sendResponse(handler ? await handler(msg) : { ok: false, error: "Unknown command" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // async response
});

function resync() {
  syncRules().catch((e) => console.error("Couldn't sync blocking rules:", e));
}

// Dynamic rules already survive browser restarts and extension updates, and
// they don't depend on time, so there's nothing to refresh on a schedule.
// Re-syncing on install/update and on startup is just cheap insurance that
// Chrome's rules match what's in storage.
chrome.runtime.onInstalled.addListener(resync);
chrome.runtime.onStartup.addListener(resync);
