// popupApi.js
// Single Responsibility: talk to the background service worker. Nothing
// else in the popup calls chrome.runtime directly, so the messaging
// contract only has to be understood in one place.
//
// The background worker wakes up on demand, so a failed or empty reply is
// rare in normal use (it can happen for a moment while Chrome updates the
// extension). Show users something they can act on, and keep the
// developer-oriented hint in the console: during development, Chrome keeps
// running the OLD service worker until the extension is reloaded from
// chrome://extensions, so messages can come back unrecognized or not at all.
const RETRY_HINT = "Close this popup and open it again.";

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "Background worker unreachable:",
          chrome.runtime.lastError.message,
          "— if you just edited the files, reload the extension from chrome://extensions."
        );
        resolve({ ok: false, error: "Couldn't reach the extension. " + RETRY_HINT });
        return;
      }
      resolve(response || { ok: false, error: "The extension didn't respond. " + RETRY_HINT });
    });
  });
}

export const api = {
  list: () => send({ type: "list" }),
  add: (value, durationMs) => send({ type: "add", value, durationMs }),
  remove: (domain) => send({ type: "remove", domain }),
  extend: (domain, durationMs) => send({ type: "extend", domain, durationMs }),
  relock: (domain, durationMs) => send({ type: "relock", domain, durationMs }),
  tabSite: (tabId) => send({ type: "tabSite", tabId }),
  blockTab: (tabId, durationMs) => send({ type: "blockTab", tabId, durationMs }),

  // The tab the popup was opened over, or null.
  activeTabId: async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab ? tab.id : null;
    } catch {
      return null;
    }
  },

  // The keyboard shortcut currently assigned to "block the site I'm on"
  // (users can change it at chrome://extensions/shortcuts), or "".
  blockShortcut: async () => {
    try {
      const commands = await chrome.commands.getAll();
      const cmd = commands.find((c) => c.name === "block-current-site");
      return (cmd && cmd.shortcut) || "";
    } catch {
      return "";
    }
  },
};
