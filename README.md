# Locked Site Blocker

A Chrome extension that blocks websites (and all their subdomains). A site you block **stays blocked and can't be removed until its timer runs out** — and you can only ever extend that timer, never shorten it.

## Install

- **From the Chrome Web Store:** [link once published]
- **From source:** download or clone this repo, open `chrome://extensions`, turn on **Developer mode** (top-right toggle), click **Load unpacked** and select the repo folder. Keep the folder in place afterwards; if you move or delete it, the extension stops.

No accounts, no config.

## Use

- Click the extension icon.
- Type a link (e.g. `facebook.com`, `https://twitter.com/home`), pick a lock length (24h by default), and click **Block**.
- Blocking is instant, including in tabs you already have open. `facebook.com` also blocks `m.facebook.com`, `business.facebook.com`, etc. Internationalised names such as `münchen.de` work too (they're stored in their `xn--` form). Domain endings like `co.uk` are refused, since they'd block every site under them.
- Each site shows a 🔒 countdown to when it becomes removable. There is no Remove option at all while it's locked — it only appears once the timer runs out.
- While a site is still locked, you can **Extend** it to 48 hours, 7 days, or 30 days from now. The dropdown only ever lists options that are longer than the time currently left, so picking one can never shorten the lock — e.g. with 7 days left, only "30 days" is offered, not 48 hours.
- Once the timer runs out, the site is still blocked but becomes removable. At that point you can either **Remove** it for good, or **Block again** to restart the timer with a freshly chosen duration.
- Visiting a blocked site shows a status page with a live countdown to when it becomes removable.

## Limits

This tool discourages impulse browsing; it isn't tamper-proof security.

- **Incognito:** Chrome doesn't run extensions in Incognito windows unless you allow it (`chrome://extensions` → Details → **Allow in Incognito**). The popup shows a reminder until you do or dismiss it.
- **Site access:** if you limit the extension's site access from Chrome's puzzle menu, blocked sites stay blocked but show Chrome's standard "blocked" page instead of the countdown.
- **Embedded content:** only full page loads are blocked. Content from a blocked site embedded in another page (say, a YouTube video on a news site) still loads.
- **Bypasses:** turning off or removing the extension, using another browser or Chrome profile, or moving the computer's clock forward all get around the lock.

## Privacy

Your list lives in local extension storage — nothing leaves your machine. See [PRIVACY.md](PRIVACY.md).

## How it works

- Uses Chrome's `declarativeNetRequest` to redirect blocked pages to a local "blocked" screen. Where the extension's site access has been restricted, it falls back to a plain block rule, which needs no site access.
- Blocking rules are rebuilt on install, on browser startup, after every change, and whenever the extension's site access changes.
- The code is split by responsibility: `lockModel.js` (pure lock rules), `storage.js` (persistence), `rules.js` (enforcement), `tabs.js` (applying new blocks to open tabs), `siteActions.js` (the actual add/remove/extend/relock operations), and `background.js` (thin event wiring). The popup follows the same split (`popupApi.js` / `popupRender.js` / `popup.js`).

## Development

- **Unit tests:** `npm test` (Node 18 or later, no dependencies to install).
- **End-to-end tests:** `npm install`, then `npx playwright install chromium` once, then `npm run test:e2e`. They load the extension into Chromium and exercise blocking, the popup, the blocked page and the restricted-site-access fallback. They take about two minutes because they wait for real timers; set `HEADED=1` to watch.
- **Reloading:** after editing files, reload the extension from `chrome://extensions`. Chrome keeps running the old service worker until you do.
- **Icons:** `python3 scripts/make-icons.py` redraws `icons/` (needs Pillow).
- **Packaging:** `npm run package` builds `dist/locked-site-blocker-<version>.zip` with only the files the extension needs. It uses the `zip` command; on Windows, zip `manifest.json`, the `.html` and `.js` files and the `icons` folder yourself.
- **Publishing:** [store/listing.md](store/listing.md) has the store listing text, permission justifications, data-usage answers and a submission checklist.
