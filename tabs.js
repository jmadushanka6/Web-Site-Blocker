// tabs.js
// Single Responsibility: everything the extension does with browser tabs.
// declarativeNetRequest only acts on new page loads, so a newly blocked
// site has to be reloaded in the tabs that already show it — without that,
// an open tab (especially a single-page app like X or Facebook, which
// navigates without reloading) would keep working until it was refreshed.
// It also looks up a single tab for "block the site I'm on".
import { originPatternFor } from "./rules.js";

export async function reloadTabsOn(domain) {
  try {
    // Matching tabs by URL relies on the extension's host access. If the
    // user has restricted it, nothing matches and the block simply applies
    // the next time those tabs load a page.
    const tabs = await chrome.tabs.query({ url: originPatternFor(domain) });
    await Promise.all(tabs.map((tab) => chrome.tabs.reload(tab.id).catch(() => {})));
  } catch (e) {
    console.warn("Couldn't reload open tabs for " + domain, e);
  }
}

// A tab by id, or null if it's closed (or never existed).
export async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

// The tab the user is looking at, or null.
export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

export async function reloadTab(tabId) {
  try {
    await chrome.tabs.reload(tabId);
  } catch {
    // The tab was closed in the meantime — nothing left to reload.
  }
}
