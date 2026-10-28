// background.js — service worker entry point.
// Single Responsibility: wire chrome events to siteActions. No business
// logic lives here — see lockModel.js (rules), storage.js (persistence),
// rules.js (enforcement), siteActions.js (the actual operations) and
// contextMenu.js (the right-click menu). This file is only the adapter
// between chrome's event system and that service layer.
//
// Open/Closed: adding a new message type means adding one line to the
// `handlers` table below — the dispatcher itself never needs to change.
import {
  addSite,
  removeSite,
  extendSite,
  relockSite,
  listSites,
  tabSiteStatus,
  blockTab,
  quickBlockTab,
} from "./siteActions.js";
import { syncRules } from "./rules.js";
import { createMenus, durationForMenuItem } from "./contextMenu.js";
import { DEFAULT_DURATION_MS } from "./lockModel.js";

const BLOCK_COMMAND = "block-current-site"; // must match "commands" in manifest.json

const handlers = {
  add: (msg) => addSite(msg.value, msg.durationMs),
  remove: (msg) => removeSite(msg.domain),
  extend: (msg) => extendSite(msg.domain, msg.durationMs),
  relock: (msg) => relockSite(msg.domain, msg.durationMs),
  list: () => listSites(),
  tabSite: (msg) => tabSiteStatus(msg.tabId),
  blockTab: (msg) => blockTab(msg.tabId, msg.durationMs),
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
// Chrome's rules match what's in storage. The right-click menu is rebuilt
// at the same moments for the same reason.
function setup() {
  resync();
  createMenus().catch((e) => console.error("Couldn't create the right-click menu:", e));
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

// Users can narrow or widen the extension's site access from Chrome's puzzle
// menu at any time. Redirect rules depend on that access, so rebuild the
// rules whenever it changes — rules.js falls back to a plain block for any
// site the extension can no longer redirect.
chrome.permissions.onAdded.addListener(resync);
chrome.permissions.onRemoved.addListener(resync);

// Right-click → "Block this site" → a duration.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const durationMs = durationForMenuItem(info.menuItemId);
  if (durationMs) quickBlockTab(tab, durationMs, info.pageUrl);
});

// Keyboard shortcut (Alt+Shift+L unless the user changed it) — blocks the
// site in the current tab for the default 24 hours.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === BLOCK_COMMAND) quickBlockTab(tab, DEFAULT_DURATION_MS);
});
