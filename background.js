// background.js — service worker entry point.
// Single Responsibility: wire chrome events to siteActions. No business
// logic lives here — see lockModel.js (rules), storage.js (persistence),
// rules.js (enforcement), siteActions.js (the actual operations),
// contextMenu.js (the right-click menu) and offTracker.js (noticing that
// the extension was switched off). This file is only the adapter between
// chrome's event system and that service layer.
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
  refreshBadge,
  dismissOffNotice,
} from "./siteActions.js";
import { syncRules } from "./rules.js";
import { createMenus, durationForMenuItem } from "./contextMenu.js";
import { markSessionStart, checkIn, noteAlive, HEARTBEAT_ALARM, HEARTBEAT_MINUTES } from "./offTracker.js";
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
  dismissOffNotice: () => dismissOffNotice(),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  noteUse();
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

const logFailure = (what) => (e) => console.error(what, e);

// Using the extension shows it's running right now (see noteAlive).
function noteUse() {
  noteAlive().catch(logFailure("Couldn't note that the extension is running:"));
}

function resync() {
  syncRules().catch(logFailure("Couldn't sync blocking rules:"));
}

// The only scheduled work: a once-a-minute heartbeat, so offTracker.js can
// tell roughly when the extension was switched off. (Blocking itself needs
// no schedule — see setup() below.)
async function ensureHeartbeat() {
  if (!(await chrome.alarms.get(HEARTBEAT_ALARM))) {
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_MINUTES });
  }
}

// Dynamic rules already survive browser restarts and extension updates, and
// they don't depend on time, so there's nothing to refresh on a schedule.
// Re-syncing on install/update and on startup is just cheap insurance that
// Chrome's rules match what's in storage. The right-click menu, the
// heartbeat and the toolbar badge are put back in place at the same moments
// for the same reason — and again when the extension comes back from being
// switched off.
function setup() {
  resync();
  createMenus().catch(logFailure("Couldn't create the right-click menu:"));
  ensureHeartbeat().catch(logFailure("Couldn't schedule the heartbeat:"));
  refreshBadge().catch(logFailure("Couldn't update the toolbar badge:"));
}

// Browser start-up and install/update both begin a legitimate new session;
// offTracker.js needs to hear about them to tell them apart from the
// extension being switched off and on again.
function startSession(reason) {
  markSessionStart(reason).catch(logFailure("Couldn't record the session start:"));
  setup();
}

chrome.runtime.onInstalled.addListener(() => startSession("installed"));
chrome.runtime.onStartup.addListener(() => startSession("startup"));

// Users can narrow or widen the extension's site access from Chrome's puzzle
// menu at any time. Redirect rules depend on that access, so rebuild the
// rules whenever it changes — rules.js falls back to a plain block for any
// site the extension can no longer redirect.
chrome.permissions.onAdded.addListener(resync);
chrome.permissions.onRemoved.addListener(resync);

// If it turns out the extension was switched off and has just come back
// on, put everything back in place; setup() also raises the badge.
function heartbeat() {
  checkIn()
    .then((cameBackOn) => { if (cameBackOn) setup(); })
    .catch(logFailure("Heartbeat check failed:"));
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) heartbeat();
});

// Right-click → "Block this site" → a duration.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  noteUse();
  const durationMs = durationForMenuItem(info.menuItemId);
  if (durationMs) quickBlockTab(tab, durationMs, info.pageUrl);
});

// Keyboard shortcut (Alt+Shift+L unless the user changed it) — blocks the
// site in the current tab for the default 24 hours.
chrome.commands.onCommand.addListener((command, tab) => {
  noteUse();
  if (command === BLOCK_COMMAND) quickBlockTab(tab, DEFAULT_DURATION_MS);
});

// Runs every time the worker starts (Chrome stops it when idle and starts it
// again for the next event). The first start after the extension has been
// switched back on is how a disable → enable gets noticed.
heartbeat();
ensureHeartbeat().catch(logFailure("Couldn't schedule the heartbeat:"));
