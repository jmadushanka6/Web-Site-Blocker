// tabs.js
// Single Responsibility: make a newly blocked site take effect in tabs that
// are already open on it. declarativeNetRequest only acts on new page loads,
// so without this an open tab — especially a single-page app like X or
// Facebook, which navigates without reloading — would keep working until
// it was refreshed.
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
