// Gives the unit tests a chrome.i18n that answers from the English
// messages, the way Chrome does: named placeholders ($P1$) are filled from
// their "$1" content, case-insensitively. Import it before the code under test.
import { readFileSync } from "node:fs";

export function loadMessages(lang) {
  return JSON.parse(readFileSync(new URL(`../_locales/${lang}/messages.json`, import.meta.url), "utf8"));
}

export function makeGetMessage(messages) {
  return (key, subs = []) => {
    const entry = messages[key];
    if (!entry) return "";
    const list = Array.isArray(subs) ? subs : [subs];
    const placeholders = entry.placeholders || {};
    return entry.message.replace(/\$([A-Za-z0-9_@]+)\$/g, (whole, name) => {
      const p = placeholders[name.toLowerCase()];
      if (!p) return whole;
      return p.content.replace(/\$(\d)/g, (_, n) => list[Number(n) - 1] ?? "");
    });
  };
}

globalThis.chrome = globalThis.chrome || {};
globalThis.chrome.i18n = { getMessage: makeGetMessage(loadMessages("en")) };
