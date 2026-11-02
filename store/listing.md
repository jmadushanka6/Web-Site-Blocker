# Store submission — Locked Site Blocker 1.5.0

Everything to fill in on the Chrome Web Store Developer Dashboard (and the
Microsoft Edge Add-ons dashboard), in the order the dashboards ask for it.
Text in `[brackets]` is yours to fill in.

Version 1.5.0 is the first public release. It is the 1.4.0 branch plus:
an English and German interface (`_locales/`), a German store listing, a
one-time "rate it / support it" prompt after a week of use, German
screenshots, a review before risky blocks, a 30-second undo for new blocks,
and one set of timer words ("Removable in", "Timer ended", "Restart timer").

## 0. Before you start

- [ ] Developer account registered (one-time US$5 fee) with an email you'll
      keep — it can't be changed later.
- [ ] 2-Step Verification turned on for that Google account — required to publish.
- [ ] Trader / non-trader status declared on the account page (EU consumer
      law). If you declare yourself a trader, your name, address, phone and
      email are shown publicly on the listing. Decide before publishing; see
      "Money" below.
- [ ] Contact line filled in at the bottom of both halves of `PRIVACY.md`.
- [ ] `SUPPORT_URL` in `support.js` set to your Ko-fi page, or left empty
      (then no support button or link appears at all).
- [ ] This branch merged into `main`, so the privacy policy is live at its public URL.
- [ ] `npm test` passes; `npm run package` → `dist/locked-site-blocker-1.5.0.zip`.

## 1. Package

Upload `dist/locked-site-blocker-1.5.0.zip`. It contains only the files the
extension needs at runtime, including `_locales/`. Every later upload needs a
higher `version` in `manifest.json`.

## 2. Store listing tab

The name and summary come from `_locales/<lang>/messages.json`
(`extName`, `extDescription`), so the store shows them in the visitor's
language. Pick each language from the dropdown at the top of the tab and
paste its detailed description and screenshots.

**Category:** Productivity → Workflow & Planning (or the closest subcategory offered).

### English (default)

**Name:** Locked Site Blocker – Block Websites with a Timer

**Summary** (119 of 132 characters):

> Block distracting websites with a timer of 24 hours to 30 days. Until it ends, a block can't be removed, only extended.

**Detailed description** (plain text — paste as is):

```
Holds firm when you don't. Block a distracting site and pick a timer of up to 30 days: until it ends, the block can't be removed. You can only extend it.

Against procrastination, for more focus: exam season, working from home, or less time on social media.

HOW IT WORKS
• Type or paste any link, such as facebook.com or https://twitter.com/home, pick a timer (24 hours, 48 hours, 7 days or 30 days) and click Block. The site and all of its subdomains are blocked straight away, including tabs you already have open.
• Or block the site you're on without typing: right-click the page (or the extension's icon) and choose Block this site, or click the one-click button in the popup (Alt+Shift+L opens it).
• Visiting a blocked site shows a calm countdown page instead.
• While the timer runs, there's no Remove button at all. You can make the timer longer, never shorter.
• When the timer ends, the site stays blocked until you remove it, or until you restart the timer for another stretch.
• New blocks can be undone for 30 seconds, in case you picked the wrong site. Your first block, 30-day timers and sites like google.com get a quick review before they start.
• Switch it off, and it tells you when and for how long: the popup shows when the blocker was off and your blocked sites could be opened.

FREE FOR GOOD
• Blocking and timers are free for good. If paid extras come later, nothing free will be taken away.

PRIVATE BY DESIGN
• Your block list is stored only in your browser. Nothing is collected, sent anywhere or shared.
• No account, no ads, no tracking, no analytics. Open source.
• The extension never reads the content of the pages you visit.

GOOD TO KNOW
• Available in English and German.
• Chrome doesn't run extensions in Incognito windows unless you allow it. To block sites there too, open chrome://extensions, choose Details for Locked Site Blocker and turn on "Allow in Incognito". The extension reminds you about this.
• If you limit the extension's site access in Chrome, blocked sites stay blocked but show Chrome's standard "blocked" page instead of the countdown.
• Like any extension, it can be turned off or removed from chrome://extensions. It's built to stop impulse browsing, not to be impossible to remove.

WHY "ACCESS TO ALL WEBSITES"?
Chrome only lets an extension redirect a site it has access to, and you can block any site you like. Locked Site Blocker uses this access only to show its countdown page in place of the sites on your list.
```

**Screenshots:** `store/screenshots/en/1-popup.png`, `store/screenshots/en/2-blocked-page.png`

### Deutsch

**Name:** Locked Site Blocker – Websites sperren mit Timer

**Kurzbeschreibung** (122 von 132 Zeichen):

> Blockiert ablenkende Websites samt Subdomains mit Timer. Verlängern geht jederzeit, Entfernen erst nach Ablauf des Timers.

**Ausführliche Beschreibung** (reiner Text — so einfügen):

```
Hält stand, wenn du schwach wirst. Sperre eine ablenkende Website und wähle einen Timer bis zu 30 Tagen: Vorher lässt sich die Sperre nicht entfernen, nur der Timer verlängern.

Gegen Prokrastination, für mehr Fokus: ideal für Lern- und Prüfungsphasen (Abi, Matura, Uni), fürs Homeoffice – oder wenn du weniger Zeit auf Social Media verbringen willst.

SO FUNKTIONIERT ES
• Link eintippen oder einfügen, z. B. instagram.com oder https://www.youtube.com, einen Timer wählen (24 Stunden, 48 Stunden, 7 Tage oder 30 Tage) und auf „Sperren“ klicken. Die Website und alle Subdomains sind sofort blockiert – auch in Tabs, die schon offen sind.
• Oder sperre die Webseite, auf der du gerade bist, ohne zu tippen: Rechtsklick auf die Seite (oder das Erweiterungssymbol) → „Diese Website sperren“ oder den Ein-Klick-Button im Erweiterungsfenster nutzen (Alt+Umschalttaste+L öffnet es).
• Rufst du eine gesperrte Website auf, siehst du stattdessen eine ruhige Countdown-Seite.
• Solange der Timer läuft, gibt es keinen Entfernen-Button. Den Timer kannst du verlängern, aber nie verkürzen.
• Ist der Timer abgelaufen, bleibt die Website gesperrt, bis du sie entfernst – oder du startest den Timer neu.
• Neue Sperren lassen sich 30 Sekunden lang rückgängig machen, falls du die falsche Website erwischt hast. Deine erste Sperre, 30-Tage-Timer und Webseiten wie google.com zeigt dir die Erweiterung vorher noch einmal zur Kontrolle.
• Schaltest du den Blocker aus und wieder ein, zeigt er dir, wann und wie lange er aus war und deine gesperrten Websites offen waren.

FÜR IMMER KOSTENLOS
• Sperren und Timer bleiben kostenlos. Falls später kostenpflichtige Extras dazukommen, fällt nichts Kostenloses weg.

DATENSCHUTZ AUS PRINZIP
• Deine Sperrliste wird nur in deinem Browser gespeichert. Es wird nichts erhoben, übertragen oder weitergegeben.
• Kein Konto, keine Werbung, kein Tracking, keine Analyse. Open Source.
• Die Erweiterung liest nie die Inhalte der Seiten, die du besuchst.

GUT ZU WISSEN
• Komplett auf Deutsch (und Englisch).
• Chrome führt Erweiterungen in Inkognito-Fenstern nur aus, wenn du es erlaubst. Damit Sperren auch dort gelten: chrome://extensions öffnen, bei Locked Site Blocker auf „Details“ klicken und „Im Inkognitomodus zulassen“ einschalten. Die Erweiterung erinnert dich daran.
• Wenn du den Websitezugriff der Erweiterung einschränkst, bleiben gesperrte Websites blockiert, zeigen aber Chromes einfache Sperrseite statt des Countdowns.
• Wie jede Erweiterung lässt sie sich unter chrome://extensions ausschalten oder entfernen. Sie soll spontanes Surfen verhindern, nicht unentfernbar sein.

WARUM „ZUGRIFF AUF ALLE WEBSITES“?
Chrome erlaubt einer Erweiterung nur dann, eine Website umzuleiten, wenn sie Zugriff darauf hat – und du kannst jede beliebige Webseite sperren. Locked Site Blocker nutzt diesen Zugriff ausschließlich, um statt der Websites auf deiner Liste die Countdown-Seite anzuzeigen.
```

**Screenshots:** `store/screenshots/de/1-popup.png`, `store/screenshots/de/2-blocked-page.png`

The search terms German users type — *Websites sperren*, *Webseiten sperren*,
*Website blockieren*, *Fokus*, *Prokrastination*, *lernen*, *Prüfungsphase*,
*Social Media* — appear naturally in the name and description above. Don't
add a keyword list; the store treats that as spam. The German text says
"Sperre" only for a block and "Timer" for the countdown, "Button" rather than
"Knopf", and "du" throughout; keep it that way when editing.

### Graphics (all languages)

- **Store icon:** `icons/icon128.png` (128×128).
- **Screenshots** (1280×800): per language as above. Recapture with
  `node scripts/screenshots.cjs` after UI changes.
- **Small promo tile** (440×280): `store/promo-tile-440x280.png`. Promo tiles
  can't be localised.
- **Marquee promo tile** (1400×560): optional, only for featuring.

**Homepage URL:** https://github.com/jmadushanka6/Web-Site-Blocker

**Support URL:** https://github.com/jmadushanka6/Web-Site-Blocker/issues

## 3. Privacy practices tab

**Single purpose description:**

> Locked Site Blocker blocks the websites the user chooses, with a timer that prevents removing a block until it runs out.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `declarativeNetRequest` | Blocks the websites the user adds to their block list. For each site, the extension adds a rule that shows the extension's own countdown page instead of the site (or a plain block, if site access is restricted). Rules are built only from the user's list. |
| `storage` | Saves the user's block list (each site's domain, when it was added, when its timer started and when it ends) locally on the device, so blocks persist across browser restarts. It also keeps, on the device, the time the extension was last running and a short log of times it was switched off, so the popup can tell the user about them. |
| `contextMenus` | Adds a "Block this site" item to the right-click menu on web pages and on the extension's toolbar icon, so the user can block the site they're on without typing its address. Choosing a timer from it blocks that site; the menu does nothing else. |
| `alarms` | A once-a-minute heartbeat that records, on the device, that the extension is running. While the extension is switched off, none of the user's blocks apply; when it's switched back on, the last heartbeat tells the popup roughly when it went off, so it can show the user when and for how long their blocks weren't working. |
| Host permission `<all_urls>` | Chrome only lets a redirect rule act on sites the extension has host access to, and users can block any website they choose, so access can't be limited to a fixed list. It is used only to show the extension's countdown page in place of sites on the user's block list, to reload tabs already open on a site when the user blocks it, and to see which site the current tab is on when the user asks to block it (from the popup, which the keyboard shortcut opens, or the right-click menu). The extension has no content scripts, never reads or changes page content, and makes no network requests. |

**Remote code:** No, I am not using remote code.

**Data usage:** leave every data type unticked. The only data the extension
handles is the user's own block list, a short log of when the extension itself
was switched off, and two popup settings (when the popup was first opened,
and whether its one-time rating prompt was dismissed), all of which stay on
their device and are never collected or transmitted. (It also looks at the
current tab's address when the user asks to block the site they're on, but
doesn't keep or send it.) Tick the three certifications.

**Privacy policy URL:** https://github.com/jmadushanka6/Web-Site-Blocker/blob/main/PRIVACY.md
(English and German in one page.)

The dashboard answers, the privacy policy and what the code does must match.
If you change what the extension stores or which permissions it uses, update
all three.

## 4. Distribution tab

- **Visibility:** Public. (Optionally Unlisted for a day or two first, to
  install it from the store yourself and check everything.)
- **Regions:** all regions. The marketing targets Germany and Austria, but
  there's no reason to hide it elsewhere.

## 5. Review

Most reviews finish within a few days. Broad host access, a new developer
account and a new extension all draw a closer look, so the first review may
take longer. If a reviewer asks about `<all_urls>`, answer with the
justification above.

## 6. Microsoft Edge Add-ons (free, do it the same week)

Edge has a large share of desktop browsers in Germany and Austria, and its own
store lists extensions separately.

1. Register at Partner Center (Microsoft account, **Individual** account type,
   no fee).
2. Create a new extension, upload the same `dist/locked-site-blocker-1.5.0.zip`.
3. Availability: Public, all markets.
4. Properties: Productivity; privacy policy URL as above; website and support
   URLs as above.
5. Store listings: add **English** and **German** and paste the same
   descriptions and screenshots as for Chrome.
6. Submit. The rating button in the popup sends Edge users to the Edge listing
   automatically.

## 7. After publishing

- Put the store links into `README.md` (Install section).
- Bump `version` in `manifest.json` for every update, then `npm test`,
  `npm run test:e2e` and `npm run package`.
- Reply to every review, in the reviewer's language.
