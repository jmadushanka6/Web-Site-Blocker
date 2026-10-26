# Locked Site Blocker

A plug-and-play Chrome extension that blocks websites (and all their subdomains). A site you block **stays blocked and can't be removed until its timer runs out** — and you can only ever extend that timer, never shorten it.

## Install (one time, ~30 seconds)

1. Unzip `site-blocker.zip` somewhere permanent (don't delete the folder afterwards).
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped `site-blocker` folder.
5. Pin the extension (puzzle icon → pin) so you can reach it easily.

That's it. No accounts, no config.

## Use

- Click the extension icon.
- Type a link (e.g. `facebook.com`, `https://twitter.com/home`), pick a lock length (24h by default), and click **Block**.
- Blocking is instant. `facebook.com` also blocks `m.facebook.com`, `business.facebook.com`, etc.
- Each site shows a 🔒 countdown to when it becomes removable. There is no Remove option at all while it's locked — it only appears once the timer runs out.
- While a site is still locked, you can **Extend** it to 48 hours, 7 days, or 30 days from now. The dropdown only ever lists options that are longer than the time currently left, so picking one can never shorten the lock — e.g. with 7 days left, only "30 days" is offered, not 48 hours.
- Once the timer runs out, the site is still blocked but becomes removable. At that point you can either **Remove** it for good, or **Block again** to restart the timer with a freshly chosen duration.
- Visiting a blocked site shows a status page with a live countdown to when it becomes removable.

## How it works

- Uses Chrome's `declarativeNetRequest` to redirect blocked pages to a local "blocked" screen.
- Your list lives in local extension storage — nothing leaves your machine.
- Blocking rules are rebuilt on every change and refreshed daily to keep enforcement in sync.
- The code is split by responsibility: `lockModel.js` (pure lock rules), `storage.js` (persistence), `rules.js` (enforcement), `siteActions.js` (the actual add/remove/extend/relock operations), and `background.js` (thin message wiring). The popup follows the same split (`popupApi.js` / `popupRender.js` / `popup.js`).

## Notes

- Because it's loaded unpacked, keep the folder in place. If you move/delete it, the extension stops.
- Removing the extension from `chrome://extensions` bypasses the lock — this tool discourages impulse browsing, it isn't tamper-proof security.
