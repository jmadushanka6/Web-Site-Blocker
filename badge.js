// badge.js
// Single Responsibility: the small badge on the extension's toolbar icon.
// It shows "!" while there's an unread "it was switched off" notice, and can
// briefly flash a problem (e.g. the right-click block failed — there's no
// popup open to show the error in). It doesn't decide WHEN to show either;
// callers tell it.

const TITLE = "Locked Site Blocker";
const ATTENTION = {
  text: "!",
  color: "#f5b545",
  // Chrome already shows the extension's name above this in the hover card.
  title: "It was switched off for a while. Click to see when.",
};

let flashTimer = null;

async function paint(text, color, title) {
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: "#14161c" });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title });
}

export async function showAttention(on) {
  if (flashTimer) return; // a flash is on screen; it restores the badge when it ends
  if (on) await paint(ATTENTION.text, ATTENTION.color, ATTENTION.title);
  else await paint("", null, TITLE);
}

// Show `text` for a few seconds (hovering the icon shows `title`), then call
// `restore()` to put the normal badge back.
export async function flashBadge(text, color, title, restore, ms = 4000) {
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashTimer = null;
    restore();
  }, ms);
  await paint(text, color, title);
}
