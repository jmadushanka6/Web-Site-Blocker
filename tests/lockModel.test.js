import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DURATION_OPTIONS,
  EXTEND_OPTIONS,
  DEFAULT_DURATION_MS,
  isValidDuration,
  isValidExtendDuration,
  isLocked,
  normalizeDomain,
  isBroadSuffix,
  migrateEntry,
  computeNewLock,
  computeExtendedLockUntil,
  isValidExtension,
  formatRemaining,
} from "../lockModel.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 26, 12);

test("normalizeDomain reduces a link to the bare site", () => {
  const cases = {
    "facebook.com": "facebook.com",
    "https://twitter.com/home": "twitter.com",
    "  WWW.Facebook.com:443/path?x=1#top ": "facebook.com",
    "http://user:secret@example.org/": "example.org",
    "user:secret@example.org": "example.org",
    "m.facebook.com": "m.facebook.com",
    "example.com.": "example.com",
    "bbc.co.uk/news": "bbc.co.uk",
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(normalizeDomain(input), expected, JSON.stringify(input));
  }
});

test("normalizeDomain turns internationalised names into punycode", () => {
  assert.equal(normalizeDomain("münchen.de"), "xn--mnchen-3ya.de");
  assert.equal(normalizeDomain("https://пример.рф/путь"), "xn--e1afmkfd.xn--p1ai");
});

test("normalizeDomain rejects input that isn't a website", () => {
  const rejected = [
    null, undefined, "", "   ", "localhost", "192.168.1.1", "http://[::1]/",
    "chrome://extensions", "file:///etc/hosts", "not a site", "foo..com", "nodot",
  ];
  for (const input of rejected) {
    assert.equal(normalizeDomain(input), null, JSON.stringify(input));
  }
});

test("isBroadSuffix flags country domain endings, not real sites", () => {
  for (const s of ["co.uk", "com.au", "or.at", "co.jp", "com.lk", "gov.uk"]) {
    assert.equal(isBroadSuffix(s), true, s);
  }
  for (const s of ["bbc.co.uk", "facebook.com", "co.com", "github.io", "example.de"]) {
    assert.equal(isBroadSuffix(s), false, s);
  }
});

test("only the preset durations are accepted", () => {
  for (const o of DURATION_OPTIONS) assert.equal(isValidDuration(o.ms), true, o.key);
  assert.equal(isValidDuration(12345), false);
  assert.equal(isValidDuration(undefined), false);
});

test("extending offers 48 hours, 7 days and 30 days — never 24 hours", () => {
  assert.deepEqual(EXTEND_OPTIONS.map((o) => o.key), ["48h", "7d", "30d"]);
  assert.equal(isValidExtendDuration(DAY), false);
  assert.equal(isValidExtendDuration(2 * DAY), true);
});

test("a site is locked exactly until its timer runs out", () => {
  const entry = { domain: "x.com", ...computeNewLock(DEFAULT_DURATION_MS, NOW) };
  assert.equal(entry.addedAt, NOW);
  assert.equal(entry.lockUntil, NOW + DAY);
  assert.equal(isLocked(entry, NOW), true);
  assert.equal(isLocked(entry, NOW + DAY - 1), true);
  assert.equal(isLocked(entry, NOW + DAY), false);
  assert.equal(isLocked({ domain: "y.com" }, NOW), false);
});

test("a lock can only be extended to end later, never sooner", () => {
  const entry = { domain: "x.com", ...computeNewLock(3 * DAY, NOW) }; // 3 days left
  assert.equal(isValidExtension(entry, 2 * DAY, NOW), false);
  assert.equal(isValidExtension(entry, 7 * DAY, NOW), true);
  assert.equal(computeExtendedLockUntil(7 * DAY, NOW), NOW + 7 * DAY);
});

test("the 30-day option stays available for the whole life of any lock", () => {
  const entry = computeNewLock(30 * DAY, NOW);
  for (const elapsed of [1, MIN, DAY, 15 * DAY, 30 * DAY - 1]) {
    const offered = EXTEND_OPTIONS.filter((o) => isValidExtension(entry, o.ms, NOW + elapsed));
    assert.ok(offered.some((o) => o.key === "30d"), `after ${elapsed} ms`);
  }
});

test("old entries without a timer get a 24-hour lock from when they were added", () => {
  const addedAt = Date.UTC(2026, 0, 1);
  assert.deepEqual(migrateEntry({ domain: "x.com", addedAt }), { domain: "x.com", addedAt, lockUntil: addedAt + DAY });
  const current = { domain: "y.com", addedAt, lockUntil: addedAt + 7 * DAY };
  assert.deepEqual(migrateEntry({ ...current }), current);
});

test("formatRemaining rounds up to the minute", () => {
  assert.equal(formatRemaining(0), "0m");
  assert.equal(formatRemaining(-5000), "0m");
  assert.equal(formatRemaining(1), "1m");
  assert.equal(formatRemaining(59 * MIN + 1), "1h 0m");
  assert.equal(formatRemaining(90 * MIN), "1h 30m");
  assert.equal(formatRemaining(DAY + 2 * HOUR), "1d 2h");
});
