// popupApi.js
// Single Responsibility: talk to the background service worker. Nothing
// else in the popup calls chrome.runtime directly, so the messaging
// contract only has to be understood in one place.
//
// If background.js was just edited on disk (e.g. during development) but
// the extension hasn't been reloaded from chrome://extensions yet, Chrome
// keeps running the OLD service worker — so messages can come back
// unrecognized or not at all. Surface that clearly instead of failing
// silently or throwing when code does `r.ok`.
function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: "Can't reach the extension's background worker — reload the extension from chrome://extensions and try again.",
        });
        return;
      }
      resolve(response || { ok: false, error: "No response from the extension — try reloading it from chrome://extensions." });
    });
  });
}

export const api = {
  list: () => send({ type: "list" }),
  add: (value, durationMs) => send({ type: "add", value, durationMs }),
  remove: (domain) => send({ type: "remove", domain }),
  extend: (domain, durationMs) => send({ type: "extend", domain, durationMs }),
  relock: (domain, durationMs) => send({ type: "relock", domain, durationMs }),
};
