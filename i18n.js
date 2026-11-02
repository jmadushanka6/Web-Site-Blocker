// i18n.js
// Single Responsibility: the one place that asks Chrome for text in the
// user's language. Every string the user sees lives in
// _locales/<lang>/messages.json (English and German so far); Chrome picks
// the browser's language and falls back to English ("default_locale" in
// manifest.json). Works in extension pages and in the service worker.
//
// Unit tests run in Node, where there's no chrome.i18n: they install a stub
// that reads the English messages (tests/i18nStub.js).
import { remainingParts } from "./lockModel.js";

// The text for `key`, with $1, $2… filled in from `subs`. A missing key
// comes back as the key itself, so it shows up rather than disappearing.
export function t(key, ...subs) {
  const i18n = globalThis.chrome && globalThis.chrome.i18n;
  const text = i18n && i18n.getMessage ? i18n.getMessage(key, subs.map(String)) : "";
  return text || key;
}

// The locale to format dates in. It follows the language of the messages
// (not just the browser's), so a date never comes out in a different
// language from the sentence around it — but in the user's own variant of
// that language when their browser names one: an Austrian browser
// ("de-AT") gets "Jän." where the German messages' default (de-DE) would
// write "Jan.".
export function dateLocale() {
  const tag = t("dateLocale");
  const fallback = tag === "dateLocale" ? "en-GB" : tag;
  const lang = fallback.split("-")[0].toLowerCase();
  const nav = globalThis.navigator;
  const wanted = (nav && (nav.languages && nav.languages.length ? nav.languages : [nav.language])) || [];
  const own = wanted.find((l) => typeof l === "string" && l.toLowerCase().startsWith(lang + "-"));
  if (own) {
    try {
      new Date(0).toLocaleDateString(own);
      return own;
    } catch {
      // Not a tag this browser can format with; use the messages' default.
    }
  }
  return fallback;
}

// "Tue 3 Nov, 11:40" / "Di., 3. Nov., 11:40": a moment a timer ends at.
export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString(dateLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "Mon 9 Nov" / "Mo., 9. Nov.": the day a timer ends on.
export function fmtDay(ts) {
  return new Date(ts).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" });
}

// Fills in a page's static text from data attributes:
//   data-i18n="<key>"              → textContent
//   data-i18n-placeholder="<key>"  → placeholder
//   data-i18n-aria-label="<key>"   → aria-label
//   data-i18n-title="<key>"        → title
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll("[data-i18n-aria-label]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  }
  for (const el of root.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);
  const lang = dateLocale().split("-")[0];
  if (root.documentElement) root.documentElement.lang = lang;
}

// A lock duration's name ("24 hours", "7 Tage"), by its key in lockModel.js.
export function durationLabel(option) {
  return t("dur_" + option.key);
}

// Time left on a lock in the user's language: "1d 2h" / "1 Tg. 2 Std.".
export function remainingText(ms) {
  const { d, h, m } = remainingParts(ms);
  if (d > 0) return t("remDH", d, h);
  if (h > 0) return t("remHM", h, m);
  return t("remM", m);
}
