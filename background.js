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

function ensureEnforced() {
  syncRules();
  chrome.alarms.create("dailyRefresh", { periodInMinutes: 60 * 24 });
}

chrome.runtime.onInstalled.addListener(ensureEnforced);
chrome.runtime.onStartup.addListener(ensureEnforced);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyRefresh") syncRules();
});
