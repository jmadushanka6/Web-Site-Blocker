// The line beside "Visits blocked" on the blocked page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMessages, makeGetMessage } from "./i18nStub.js";
import { triesLine } from "../triesView.js";

// Local times, so the tests mean the same in any time zone.
const at = (d, h = 12) => new Date(2026, 10, d, h).getTime();
const NOW = at(5);
const record = (total, today) => ({ since: at(1), total, days: today ? { "2026-11-05": today } : {} });

test("triesLine: nothing yet, none today, once, many", () => {
  assert.equal(triesLine(record(0, 0), NOW), "Not one try yet — keep it that way.");
  assert.equal(triesLine(record(9, 0), NOW), "None today — keep it that way.");
  assert.equal(triesLine(record(9, 1), NOW), "1 today — and it held firm.");
  assert.equal(triesLine(record(9, 4), NOW), "4 today — it held firm every time.");
});

test("triesLine: German", () => {
  const original = globalThis.chrome.i18n.getMessage;
  globalThis.chrome.i18n.getMessage = makeGetMessage(loadMessages("de"));
  try {
    assert.equal(triesLine(record(0, 0), NOW), "Noch kein einziger Versuch – weiter so.");
    assert.equal(triesLine(record(9, 0), NOW), "Heute noch keiner – weiter so.");
    assert.equal(triesLine(record(9, 1), NOW), "Heute 1 – die Sperre hat standgehalten.");
    assert.equal(triesLine(record(9, 4), NOW), "Heute 4 – die Sperre hat jedes Mal standgehalten.");
  } finally {
    globalThis.chrome.i18n.getMessage = original;
  }
});
