// The message files: every language has the same messages with the same
// placeholders, and the store fields fit the Chrome Web Store's limits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { loadMessages, makeGetMessage } from "./i18nStub.js";
import { t, remainingText, durationLabel, dateLocale } from "../i18n.js";
import { DURATION_OPTIONS } from "../lockModel.js";

const langs = readdirSync(new URL("../_locales/", import.meta.url));
const en = loadMessages("en");

test("English and German are both there", () => {
  assert.deepEqual(langs.sort(), ["de", "en"]);
});

for (const lang of langs) {
  const messages = loadMessages(lang);

  test(`${lang}: same messages as English`, () => {
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort());
  });

  test(`${lang}: same placeholders as English, and each one used`, () => {
    for (const [key, entry] of Object.entries(messages)) {
      const names = Object.keys(entry.placeholders || {}).sort();
      assert.deepEqual(names, Object.keys(en[key].placeholders || {}).sort(), key);
      for (const name of names) {
        assert.ok(entry.message.toLowerCase().includes(`$${name}$`), `${lang} ${key} doesn't use $${name}$`);
      }
    }
  });

  test(`${lang}: store name and summary fit the store's limits`, () => {
    assert.ok(messages.extName.message.length <= 75, `name: ${messages.extName.message.length}`);
    assert.ok(messages.extDescription.message.length <= 132, `summary: ${messages.extDescription.message.length}`);
  });

  test(`${lang}: date locale is a usable BCP 47 tag`, () => {
    assert.doesNotThrow(() => new Date().toLocaleDateString(messages.dateLocale.message));
  });

  test(`${lang}: every message the code asks for exists`, () => {
    const code = readdirSync(new URL("../", import.meta.url))
      .filter((f) => /\.(js|html)$/.test(f))
      .map((f) => readFileSync(new URL("../" + f, import.meta.url), "utf8"))
      .join("\n");
    const used = new Set();
    for (const m of code.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"\s*[,)]/g)) used.add(m[1]);
    // t(locked ? "extend" : "blockAgain", …)
    for (const m of code.matchAll(/\bt\([^"()]*\?\s*"(\w+)"\s*:\s*"(\w+)"/g)) used.add(m[1]).add(m[2]);
    for (const m of code.matchAll(/data-i18n(?:-[a-z-]+)?="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
    for (const m of code.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(m[1]);
    for (const key of used) assert.ok(messages[key], `${lang} is missing "${key}"`);
    for (const o of DURATION_OPTIONS) assert.ok(messages["dur_" + o.key], `${lang} is missing dur_${o.key}`);
  });
}

test("t fills in placeholders, and shows the key when a message is missing", () => {
  assert.equal(t("msgExtended", "x.com"), "x.com extended.");
  assert.equal(t("noSuchMessage"), "noSuchMessage");
});

test("time left and durations, in English", () => {
  const MIN = 60000;
  assert.equal(remainingText(0), "0m");
  assert.equal(remainingText(90 * MIN), "1h 30m");
  assert.equal(remainingText(26 * 60 * MIN), "1d 2h");
  assert.equal(durationLabel(DURATION_OPTIONS[2]), "7 days");
  assert.equal(dateLocale(), "en-GB");
});

test("German reads naturally", () => {
  const de = makeGetMessage(loadMessages("de"));
  assert.equal(de("timeLeft", ["1 Tg. 2 Std."]), "🔒 noch 1 Tg. 2 Std.");
  assert.equal(de("offTitleN", ["3"]), "Der Blocker war 3-mal ausgeschaltet");
  assert.equal(de("quickBlock", ["x.com"]), "x.com sperren");
  assert.equal(
    de("offBody1", [de("spanFrom", [de("rangeSameDay", ["10:02", "10:40", "heute"])]), " (38 Min.)"]),
    "Er war heute von etwa 10:02 bis 10:40 Uhr ausgeschaltet (38 Min.). In dieser Zeit ließen sich deine gesperrten Websites öffnen."
  );
});
