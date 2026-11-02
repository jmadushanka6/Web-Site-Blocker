// support.js
// Pure rules for the popup's "Is the blocker helping you?" prompt: when to
// show it, and where its buttons lead. No chrome.* or DOM here, so it's
// unit-tested directly (tests/support.test.js).

// Your donation page (e.g. "https://ko-fi.com/yourname"). Leave it empty
// and the extension shows no support button or link at all. Changing it
// needs a new version in the store.
export const SUPPORT_URL = "";

// Ask only after the extension has been in use for a while…
export const ASK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// …and only once: answering or dismissing it hides it for good.
export function shouldAsk({ firstSeen, now, dismissed, siteCount, otherNotice, canRate, canSupport }) {
  if (dismissed || otherNotice || !(siteCount > 0)) return false;
  if (!canRate && !canSupport) return false;
  return typeof firstSeen === "number" && now - firstSeen >= ASK_AFTER_MS;
}

// Where to leave a rating, worked out from the update_url that a store adds
// to the installed copy's manifest. Unpacked copies (no update_url) and
// unknown stores get null: there's no listing to send them to.
export function reviewUrl(updateUrl, id) {
  if (!updateUrl || !id) return null;
  if (/^https:\/\/clients2\.google\.com\//.test(updateUrl)) {
    return `https://chromewebstore.google.com/detail/${id}/reviews`;
  }
  if (/^https:\/\/edge\.microsoft\.com\//.test(updateUrl)) {
    return `https://microsoftedge.microsoft.com/addons/detail/${id}`;
  }
  return null;
}
