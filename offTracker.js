// offTracker.js
// Single Responsibility: notice when the extension itself was switched off
// (disabled in chrome://extensions) and later switched back on, and keep a
// short log of those periods. While it's off Chrome enforces none of the
// blocks, so this log is the honest record of when the blocker wasn't
// working. It knows nothing about the blocklist, the popup or the badge.
//
// Chrome sends an extension no event for being disabled or re-enabled, so
// this works it out from two facts instead:
//   1. chrome.storage.session is wiped whenever the extension is disabled,
//      reloaded/updated, or the browser restarts.
//   2. A browser restart fires runtime.onStartup and a reload/update fires
//      runtime.onInstalled — both call markSessionStart(), which puts a
//      marker straight back into session storage.
// So when a check finds the marker missing and neither event turns up to
// claim it, the only thing left that wipes session storage is a
// disable → enable. A once-a-minute heartbeat keeps `lastSeen` fresh, which
// says roughly when it went off; the check that notices it's back says
// when it came back on.

const SESSION_MARKER = "sessionMarker"; // chrome.storage.session
const LAST_SEEN = "lastSeen"; // chrome.storage.local — last heartbeat time
export const OFF_LOG = "offLog"; // chrome.storage.local — [{ offAt, onAt, seen }]
const MAX_LOG = 20;

// At browser start-up another event (an overdue alarm, say) can wake the
// worker a moment before onStartup is delivered. A missing marker is only
// treated as "it was switched off" if it's still missing after this long.
const GRACE_MS = 5000;

export const HEARTBEAT_ALARM = "heartbeat";
export const HEARTBEAT_MINUTES = 1;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function hasMarker() {
  const got = await chrome.storage.session.get(SESSION_MARKER);
  return !!got[SESSION_MARKER];
}

function setMarker(reason, at) {
  return chrome.storage.session.set({ [SESSION_MARKER]: { reason, at } });
}

async function readLog() {
  const { [OFF_LOG]: log } = await chrome.storage.local.get(OFF_LOG);
  return Array.isArray(log) ? log : [];
}

async function appendOffPeriod(period) {
  const log = await readLog();
  log.push({ ...period, seen: false });
  await chrome.storage.local.set({ [OFF_LOG]: log.slice(-MAX_LOG) });
}

// A legitimate fresh session: browser start-up, or install/update/reload.
export async function markSessionStart(reason) {
  const now = Date.now();
  await setMarker(reason, now);
  await chrome.storage.local.set({ [LAST_SEEN]: now });
}

async function runCheck() {
  let recorded = false;
  if (!(await hasMarker())) {
    const backAt = Date.now();
    const { [LAST_SEEN]: lastSeen } = await chrome.storage.local.get(LAST_SEEN);
    await sleep(GRACE_MS);
    if (!(await hasMarker())) {
      await setMarker("re-enabled", backAt);
      await appendOffPeriod({ offAt: lastSeen || null, onAt: backAt });
      recorded = true;
    }
  }
  await chrome.storage.local.set({ [LAST_SEEN]: Date.now() });
  return recorded;
}

let pending = null;

// Run on every heartbeat and every time the worker starts up. Resolves to
// true when it has just recorded a new switched-off period. Overlapping
// calls share one check, so a period is never recorded twice.
export function checkIn() {
  if (!pending) pending = runCheck().finally(() => { pending = null; });
  return pending;
}

// Anything the user does with the extension (opening its popup, its
// right-click menu or shortcut) shows it's running right now, which dates a
// switch-off soon afterwards more closely than the last heartbeat would. A
// check already under way goes first: it may be about to log the last-seen
// time from before a switch-off, which this mustn't overwrite.
export async function noteAlive() {
  if (pending) await pending.catch(() => {});
  await chrome.storage.local.set({ [LAST_SEEN]: Date.now() });
}

export async function getUnseenOffPeriods() {
  return (await readLog()).filter((p) => !p.seen);
}

export async function acknowledgeOffPeriods() {
  const log = await readLog();
  if (!log.some((p) => !p.seen)) return;
  await chrome.storage.local.set({ [OFF_LOG]: log.map((p) => ({ ...p, seen: true })) });
}
