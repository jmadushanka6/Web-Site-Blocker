// badge.js
// Single Responsibility: the small badge on the extension's toolbar icon.
// It can briefly flash a problem — e.g. the right-click block failed, and
// there's no popup open to show the error in. It doesn't decide WHEN to
// show anything; callers tell it.

const TITLE = "Locked Site Blocker";

let flashTimer = null;

async function paint(text, color, title) {
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: "#14161c" });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title });
}

// Show `text` for a few seconds (hovering the icon shows `title`), then
// clear the badge again.
export async function flashBadge(text, color, title, ms = 4000) {
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashTimer = null;
    paint("", null, TITLE);
  }, ms);
  await paint(text, color, title);
}
