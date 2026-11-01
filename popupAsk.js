// popupAsk.js
// The popup's one-time "Is the blocker helping you stay focused?" prompt
// (rate it / support it) and the footer's support link. The rules for when
// it appears live in support.js; this file only wires them to the page.
//
// It keeps two small values in the popup's own localStorage, on this device
// only: when the popup was first opened, and whether the prompt has been
// answered or dismissed.
import { SUPPORT_URL, shouldAsk, reviewUrl } from "./support.js";

const FIRST_SEEN_KEY = "firstSeen";
const DISMISSED_KEY = "askDismissed";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the prompt may just come back next time.
  }
}

function open(url) {
  chrome.tabs.create({ url });
}

// Returns { update(siteCount, otherNotice) }, called after each list render.
export function setUpAsk() {
  const box = document.getElementById("ask");
  const rateBtn = document.getElementById("askRate");
  const supportBtn = document.getElementById("askSupport");
  const dismissBtn = document.getElementById("askDismiss");
  const supportLink = document.getElementById("supportLink");

  if (read(FIRST_SEEN_KEY) == null) write(FIRST_SEEN_KEY, String(Date.now()));
  const firstSeen = Number(read(FIRST_SEEN_KEY));

  const manifest = chrome.runtime.getManifest();
  const rateUrl = reviewUrl(manifest.update_url, chrome.runtime.id);

  rateBtn.hidden = !rateUrl;
  supportBtn.hidden = !SUPPORT_URL;
  supportLink.hidden = !SUPPORT_URL;

  function done() {
    write(DISMISSED_KEY, "1");
    box.hidden = true;
  }

  rateBtn.addEventListener("click", () => { done(); open(rateUrl); });
  supportBtn.addEventListener("click", () => { done(); open(SUPPORT_URL); });
  dismissBtn.addEventListener("click", done);
  supportLink.addEventListener("click", (e) => { e.preventDefault(); open(SUPPORT_URL); });

  return {
    update(siteCount, otherNotice) {
      box.hidden = !shouldAsk({
        firstSeen,
        now: Date.now(),
        dismissed: read(DISMISSED_KEY) === "1",
        siteCount,
        otherNotice,
        canRate: !!rateUrl,
        canSupport: !!SUPPORT_URL,
      });
    },
  };
}
