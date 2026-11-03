// When a new block gets the popup's review step, and what it warns about.
import { test } from "node:test";
import assert from "node:assert/strict";
import { typedPath, broadWarningKey, reviewReasons } from "../review.js";
import { DURATION_OPTIONS } from "../lockModel.js";
import { loadMessages } from "./i18nStub.js";

const DAY = 24 * 60 * 60 * 1000;

test("typedPath finds the page part of what was typed", () => {
  assert.equal(typedPath("reddit.com/r/politics"), "/r/politics");
  assert.equal(typedPath("https://twitter.com/home?x=1#top"), "/home");
  assert.equal(typedPath("https://www.youtube.com/watch?v=abc"), "/watch");
  assert.equal(typedPath("reddit.com/r/politics/"), "/r/politics");
  assert.equal(typedPath("example.org/caf%C3%A9"), "/café");
});

test("typedPath is null for a bare site", () => {
  for (const input of ["reddit.com", "reddit.com/", "https://reddit.com", "https://reddit.com/?q=1", " ", "", null]) {
    assert.equal(typedPath(input), null, JSON.stringify(input));
  }
});

test("typedPath shortens a long page", () => {
  const p = typedPath("example.org/" + "a".repeat(80));
  assert.equal(p.length, 40);
  assert.ok(p.endsWith("…"));
});

test("google.com and amazon.com carry a warning; their country sites and subdomains don't", () => {
  assert.equal(broadWarningKey("google.com"), "reviewGoogle");
  assert.equal(broadWarningKey("amazon.com"), "reviewAmazon");
  for (const d of ["google.de", "amazon.de", "mail.google.com", "youtube.com", "toString", "__proto__"]) {
    assert.equal(broadWarningKey(d), null, d);
  }
});

test("the warnings exist in every language", () => {
  for (const lang of ["en", "de"]) {
    const messages = loadMessages(lang);
    for (const d of ["google.com", "amazon.com"]) assert.ok(messages[broadWarningKey(d)], `${lang} ${d}`);
  }
});

test("a first block, the 30-day timer, a typed page or a broad site get a review", () => {
  const base = { domain: "youtube.com", input: "youtube.com", durationMs: DAY, listLength: 2 };
  assert.deepEqual(reviewReasons(base), []);
  assert.deepEqual(reviewReasons({ ...base, listLength: 0 }), ["first"]);
  assert.deepEqual(reviewReasons({ ...base, durationMs: 30 * DAY }), ["longest"]);
  assert.deepEqual(reviewReasons({ ...base, domain: "reddit.com", input: "reddit.com/r/politics" }), ["path"]);
  assert.deepEqual(reviewReasons({ ...base, domain: "google.com", input: "www.google.com" }), ["broad"]);
  assert.deepEqual(
    reviewReasons({ domain: "google.com", input: "google.com/maps", durationMs: 30 * DAY, listLength: 0 }),
    ["first", "longest", "path", "broad"]
  );
});

test("the one-click button (nothing typed) and the other timers skip it", () => {
  for (const o of DURATION_OPTIONS.filter((o) => o.key !== "30d")) {
    assert.deepEqual(reviewReasons({ domain: "x.com", durationMs: o.ms, listLength: 1 }), [], o.key);
  }
  assert.deepEqual(reviewReasons({ domain: "x.com", durationMs: undefined, listLength: 1 }), []);
});
