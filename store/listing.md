# Chrome Web Store submission — Locked Site Blocker 1.4.0

Everything to fill in on the Chrome Web Store Developer Dashboard, in the
order the dashboard asks for it. Text in `[brackets]` is yours to fill in.

## 0. Before you start

- [ ] Developer account registered (one-time US$5 fee).
- [ ] 2-Step Verification turned on for that Google account — required before you can publish.
- [ ] Trader / non-trader status declared on the account page (EU consumer rules). Traders' verified contact details are shown to users.
- [ ] This branch merged into `main`, so the privacy policy is live at its public URL (see section 3).
- [ ] Contact line in `PRIVACY.md` filled in.
- [ ] Package built: `npm run package` → `dist/locked-site-blocker-1.4.0.zip`.

## 1. Package

Upload `dist/locked-site-blocker-1.4.0.zip`. It contains only the files the
extension needs at runtime. Each later upload needs a higher `version` in
`manifest.json`.

## 2. Store listing tab

**Name** (from the manifest): Locked Site Blocker

**Summary** (from the manifest description, 129 of 132 characters):

> Block distracting sites and their subdomains behind a timer lock. Extend it anytime; remove a site only after its timer runs out.

**Category:** Productivity. If the dashboard asks for a subcategory, pick the
closest fit (for example Workflow & Planning or Tools).

**Language:** English

**Detailed description** (plain text — paste as is):

```
Locked Site Blocker keeps you away from distracting websites with blocks you can't undo on impulse.

Block a site and choose how long the lock lasts: 24 hours, 48 hours, 7 days or 30 days. Until the timer runs out, the site can't be removed from your list. There's no Remove button at all, so a moment of weakness can't undo a decision you made with a clear head.

HOW IT WORKS
• Type or paste any link, such as facebook.com or https://twitter.com/home, and click Block. The site and all of its subdomains are blocked straight away, including tabs you already have open.
• Or block the site you're on without typing: right-click the page (or the extension's icon) and choose Block this site, press Alt+Shift+L, or click the one-click button in the popup.
• Visiting a blocked site shows a calm countdown page instead.
• While a site is locked, you can make the lock longer (48 hours, 7 days or 30 days from now), but never shorter.
• When the timer runs out, the site stays blocked until you decide: remove it, or block it again for another stretch.

PRIVATE BY DESIGN
• Your block list is stored only in your browser. Nothing is collected, sent anywhere or shared.
• No account, no ads, no tracking, no analytics.
• The extension never reads the content of the pages you visit.

GOOD TO KNOW
• Chrome doesn't run extensions in Incognito windows unless you allow it. To block sites there too, open chrome://extensions, choose Details for Locked Site Blocker and turn on "Allow in Incognito". The extension reminds you about this.
• If you limit the extension's site access in Chrome, blocked sites stay blocked but show Chrome's standard "blocked" page instead of the countdown.
• Like any extension, it can be turned off or removed from chrome://extensions. It's built to stop impulse browsing, not to be impossible to remove. If it's switched off and on again, the popup tells you when it was off and for how long.

WHY "ACCESS TO ALL WEBSITES"?
Chrome only lets an extension redirect a site it has access to, and you can block any site you like. Locked Site Blocker uses this access only to show its countdown page in place of the sites on your list.
```

**Store icon:** `icons/icon128.png` (128×128, artwork within 96×96 and 16 px of
transparent padding).

**Screenshots** (1280×800, at least one, up to five). Drafts are in
`store/screenshots/`. They were captured in headless Chromium with sample data,
so recapturing on your own machine will look closer to what users see.

1. `1-popup.png` — the popup with a few locked sites and their countdowns.
2. `2-blocked-page.png` — the countdown page shown on a blocked site.

Other shots worth adding: the Extend dropdown open (only longer options
offered), an expired site with Remove / Block again, and the right-click
"Block this site" menu.

**Small promo tile** (440×280, optional but listings without one are shown
after those that have one): `store/promo-tile-440x280.png`.

**Marquee promo tile** (1400×560): optional, only needed to be considered for
featuring.

**Homepage URL:** https://github.com/jmadushanka6/Web-Site-Blocker

**Support URL:** https://github.com/jmadushanka6/Web-Site-Blocker/issues (this
field must be a web page; there's a separate field for a support email)

## 3. Privacy practices tab

**Single purpose description:**

> Locked Site Blocker blocks the websites the user chooses, with a timer that prevents removing a block until it runs out.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `declarativeNetRequest` | Blocks the websites the user adds to their block list. For each site, the extension adds a rule that shows the extension's own countdown page instead of the site (or a plain block, if site access is restricted). Rules are built only from the user's list. |
| `storage` | Saves the user's block list (each site's domain, when it was added and when its lock ends) locally on the device, so blocks persist across browser restarts. It also keeps, on the device, the time the extension was last running and a short log of times it was switched off, so the popup can tell the user about them. |
| `contextMenus` | Adds a "Block this site" item to the right-click menu on web pages and on the extension's toolbar icon, so the user can block the site they're on without typing its address. Choosing a lock length from it blocks that site; the menu does nothing else. |
| `alarms` | A once-a-minute heartbeat that records, on the device, that the extension is running. While the extension is switched off, none of the user's blocks apply; when it's switched back on, the last heartbeat tells the popup roughly when it went off, so it can show the user when and for how long their blocks weren't working. |
| Host permission `<all_urls>` | Chrome only lets a redirect rule act on sites the extension has host access to, and users can block any website they choose, so access can't be limited to a fixed list. It is used only to show the extension's countdown page in place of sites on the user's block list, to reload tabs already open on a site when the user blocks it, and to see which site the current tab is on when the user asks to block it (from the popup, the right-click menu or the keyboard shortcut). The extension has no content scripts, never reads or changes page content, and makes no network requests. |

**Remote code:** No, I am not using remote code.

**Data usage:** leave every data type unticked. The only data the extension
handles is the user's own block list and a short log of when the extension
itself was switched off, both of which stay on their device and are never
collected or transmitted. (It also looks at the current tab's address when the
user asks to block the site they're on, but doesn't keep or send it; only the
site's name goes on the list, and only if the user blocks it.) Tick the three certifications (no selling or
transferring user data to third parties outside the approved use cases; no use
or transfer for purposes unrelated to the single purpose; no use or transfer to
determine creditworthiness or for lending).

**Privacy policy URL:** https://github.com/jmadushanka6/Web-Site-Blocker/blob/main/PRIVACY.md

The repo is public, so this link works for reviewers and users as soon as this
branch is merged into `main`. Fill in the contact line in `PRIVACY.md` first.

The dashboard answers, the privacy policy and what the code does must match.
If you change what the extension stores or which permissions it uses, update
all three.

## 4. Distribution tab

- **Visibility:** consider **Private** first, with a few trusted testers added
  in your account settings. It goes through the same review as a public
  listing, so switch to **Public** once testers are happy.
- **Regions:** all regions.

## 5. Review

Most reviews finish within a few days. Broad host access, a new developer
account and a new extension all draw a closer look, so the first review may
take longer. Keep the justifications above in sync with the code if reviewers
ask questions.

## 6. After publishing

- Add the store link to `README.md`.
- Bump `version` in `manifest.json` for every update, then `npm test` and
  `npm run package`.
