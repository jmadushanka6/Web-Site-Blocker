# Locked Site Blocker

A Chrome extension that blocks websites (and all their subdomains). A site you block **stays blocked and can't be removed until its timer runs out** — and you can only ever extend that timer, never shorten it.

## Install

- **From the Chrome Web Store:** [link once published]
- **From Microsoft Edge Add-ons:** [link once published]
- **From source:** download or clone this repo, open `chrome://extensions`, turn on **Developer mode** (top-right toggle), click **Load unpacked** and select the repo folder. Keep the folder in place afterwards; if you move or delete it, the extension stops.

No accounts, no config. The interface is in English and German; it follows your browser's language.

## Use

- Click the extension icon.
- Type a link (e.g. `facebook.com`, `https://twitter.com/home`), pick a timer (24 hours by default), and click **Block**.
- Some blocks get a quick review first: your very first one, any 30-day timer, a typed page (`reddit.com/r/politics` blocks all of reddit.com) and google.com or amazon.com (which also take Gmail, Google sign-in or the AWS console with them). The review says when the site can first be removed, lets you change the timer, and starts with **Cancel** selected.
- A new block can be undone for 30 seconds, in case you picked the wrong site: **Wrong site? Undo** shows under it in the popup and on its countdown page. After that, the timer applies.
- Blocking is instant, including in tabs you already have open. `facebook.com` also blocks `m.facebook.com`, `business.facebook.com`, etc. Internationalised names such as `münchen.de` work too (they're stored in their `xn--` form). Domain endings like `co.uk` are refused, since they'd block every site under them.
- Each site shows when it can be removed ("Removable in 5d 2h"). There is no Remove option at all while its timer runs — it only appears once the timer ends.
- While the timer runs, you can **Extend** it to 48 hours, 7 days or 30 days from now; each choice shows the day it would end ("7 days from now · Mon 9 Nov"). The dropdown only lists choices longer than the time left, so picking one can never shorten the timer — with 7 days left, only "30 days" is offered.
- When the timer ends ("Timer ended"), the site **stays blocked** until you remove it. Then you can **Remove** it for good, or **Restart timer** with a freshly chosen length.
- Visiting a blocked site shows a status page with a live countdown to when it becomes removable.
- That page also shows **Visits blocked**: how many times the site has been opened and stopped since you blocked it, and how many of those were today. Reloading the page or going back to it doesn't count, and neither does a tab switching over as a block starts. Once a block has been running for a week, a bar chart shows the count for each day (the last 30 days at most; hover a bar for its number). The counts stay on your device and are deleted when you remove the site.

### Block the site you're on, without typing

- **Right-click** anywhere on the page → **Block this site** → pick 24 hours, 48 hours, 7 days or 30 days. The same menu is on the extension's toolbar icon (right-click it).
- Or open the popup while you're on the site and click **Block ‹site›** at the top. It uses the timer picked in the dropdown below it. **Alt+Shift+L** (Option+Shift+L on a Mac) opens the popup; you can change the shortcut at `chrome://extensions/shortcuts`.

The page switches to the blocked screen straight away, where **Undo** takes the block back for the first 30 seconds. On a page that isn't a website (a `chrome://` page, the new-tab page), nothing is blocked and the toolbar icon briefly shows a red ×; hover it to see why.

### If the blocker is switched off

While the extension is turned off in `chrome://extensions` (this includes switching **Developer mode** off, which turns off extensions loaded from source), Chrome enforces none of the blocks. When it's switched back on, the popup opens with a notice at the very top saying when it was off and for how long, and the toolbar icon shows an amber **!** until you click **Got it**. If it was switched off more than once, the notice gives the count, the total time off and the most recent period.

## Limits

This tool discourages impulse browsing; it isn't tamper-proof security.

- **Incognito:** Chrome doesn't run extensions in Incognito windows unless you allow it (`chrome://extensions` → Details → **Allow in Incognito**). The popup shows a reminder until you do or dismiss it.
- **Site access:** if you limit the extension's site access from Chrome's puzzle menu, blocked sites stay blocked but show Chrome's standard "blocked" page instead of the countdown.
- **Embedded content:** only full page loads are blocked. Content from a blocked site embedded in another page (say, a YouTube video on a news site) still loads.
- **Bypasses:** turning the extension off gets around the lock for as long as it's off, though the popup reports it afterwards. Removing the extension (which deletes its record too), using another browser or Chrome profile, or moving the computer's clock forward get around it without a trace.

## FAQ

**I blocked the wrong site. What now?**
Click **Undo** within 30 seconds: it's under the new block in the popup and on the site's countdown page. After that, the block can't be removed until its timer ends; that's the point of the extension. If you need the site before then (say you blocked google.com and need Gmail), the only way around it is removing the extension, which deletes your whole block list with it.

**Can I unblock a site early?**
No. While a timer runs you can only make it longer. When it ends, the site stays blocked until you remove it.

**Can't I just switch the extension off?**
Yes. Like any extension it can be switched off or removed in `chrome://extensions`, and while it's off nothing is blocked. It's built to stop impulse browsing, not to be impossible to remove. If you switch it off and on again, the popup tells you when, and for how long, it was off.

**Does it block in Incognito windows, or on my phone?**
In Incognito only if you allow it (`chrome://extensions` → Details → **Allow in Incognito**). On phones, no: Chrome on Android and iOS doesn't run extensions.

**Does it see what I browse?**
No. Your block list stays in your browser and the extension never reads the pages you visit. See [PRIVACY.md](PRIVACY.md).

**Something doesn't work.**
Open an issue at https://github.com/jmadushanka6/Web-Site-Blocker/issues.

## Rating and support prompt

After a week of use, the popup asks once whether the blocker is helping, with a button to rate it in the store it was installed from (Chrome Web Store or Edge Add-ons) and, if `SUPPORT_URL` in `support.js` is set, one to support it. Answering or dismissing it hides it for good. Copies loaded from source have no store page, so they only show the support button (or nothing).

## Privacy

Your list lives in local extension storage — nothing leaves your machine. See [PRIVACY.md](PRIVACY.md).

## How it works

- Uses Chrome's `declarativeNetRequest` to redirect blocked pages to a local "blocked" screen. Where the extension's site access has been restricted, it falls back to a plain block rule, which needs no site access.
- Blocking rules are rebuilt on install, on browser startup, after every change, and whenever the extension's site access changes.
- Chrome gives an extension no event for being switched off or on, so the notice is worked out instead: Chrome wipes the extension's session storage whenever it's switched off, updated or the browser restarts. A browser restart and an update each announce themselves (`runtime.onStartup` / `runtime.onInstalled`), so a wiped session that neither of them explains means the extension was switched off and back on. A once-a-minute heartbeat (an alarm), and anything you do with the extension, records when it was last running, which gives the "off from about…" time. If it's switched off a while after you last used it, that time can be up to about a minute early.
- The code is split by responsibility: `lockModel.js` (pure lock rules, including the 30-second undo), `review.js` (which new blocks get a review), `i18n.js` (text in the user's language), `support.js` (when to ask for a rating), `storage.js` (persistence), `rules.js` (enforcement), `tabs.js` (applying new blocks to open tabs, finding the current tab), `contextMenu.js` (the right-click menu), `offTracker.js` (noticing the extension was switched off), `attempts.js` (counting tries on blocked sites), `triesView.js` (the blocked page's counts and chart), `badge.js` (the toolbar badge), `siteActions.js` (the actual add/remove/extend/relock/block-this-tab operations), and `background.js` (thin event wiring). The popup follows the same split (`popupApi.js` / `popupRender.js` / `popupReview.js` / `popupAsk.js` / `popup.js`).

## Website

`docs/` is the project website, a static site for GitHub Pages (Settings → Pages → Deploy from a branch → `main`, folder `/docs`). It has no build step and loads nothing from third parties.

| Page | Path |
| --- | --- |
| Homepage, English / German | `docs/index.html`, `docs/de/index.html` |
| Privacy policy, English / German | `docs/privacy/`, `docs/de/datenschutz/` (keep in step with `PRIVACY.md`) |
| Goodbye page, opened after an uninstall | `docs/goodbye/` (`?lang=de`, `?store=edge`) |
| Impressum | `docs/impressum/` |

Before it goes live:

- Buy the domain, add it under Settings → Pages (this creates `docs/CNAME`) and turn on Enforce HTTPS. The pages assume `lockedsiteblocker.com`; search `docs/` for it if the domain differs.
- Set up `support@` forwarding for the address the pages use.
- Fill in the Impressum placeholders.
- After publishing, replace the store links (marked `TODO` in the homepages and the goodbye page).
- Before turning on the goodbye survey, set `FORM_ENDPOINT` in `docs/goodbye/index.html` and name the form service in both privacy pages.

## Development

- **Unit tests:** `npm test` (Node 18 or later, no dependencies to install).
- **End-to-end tests:** `npm install`, then `npx playwright install chromium` once, then `npm run test:e2e`. They load the extension into Chromium and exercise blocking, the review step and undo, the popup, the blocked page, the restricted-site-access fallback, the one-click block of the current site, the German interface, and the switched-off notice (switching the extension off and on in `chrome://extensions`, then restarting the browser). They take about three minutes because they wait for real timers; set `HEADED=1` to watch. To run some of them, name the sections: `node e2e/extension.e2e.cjs quickblock offnotice`. The right-click menu and the keyboard shortcut belong to the browser itself, so the tests only check that they're registered.
- **Reloading:** after editing files, reload the extension from `chrome://extensions`. Chrome keeps running the old service worker until you do.
- **Icons:** `python3 scripts/make-icons.py` redraws `icons/` (needs Pillow).
- **Translations:** every string the user sees is in `_locales/en/messages.json` and `_locales/de/messages.json`; code asks for them through `t()` in `i18n.js`, and HTML through `data-i18n` attributes. `npm test` checks both languages have the same messages and placeholders, and that every message the code uses exists. To add a language, copy `_locales/en` to `_locales/<code>`, translate the `message` values (keep `$P1$`-style placeholders), set `dateLocale`, and add it to the store listing.
- **Screenshots:** `node scripts/screenshots.cjs` recaptures the store screenshots in every language into `store/screenshots/<lang>/`.
- **Packaging:** `npm run package` builds `dist/locked-site-blocker-<version>.zip` with only the files the extension needs. It uses the `zip` command; on Windows, zip `manifest.json`, the `.html` and `.js` files and the `icons` folder yourself.
- **Publishing:** [store/listing.md](store/listing.md) has the store listing text, permission justifications, data-usage answers and a submission checklist.
