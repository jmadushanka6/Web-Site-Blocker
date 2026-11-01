// When the popup asks "Is the blocker helping you?", and where it leads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldAsk, reviewUrl, ASK_AFTER_MS, SUPPORT_URL } from "../support.js";

const base = {
  firstSeen: 0,
  now: ASK_AFTER_MS,
  dismissed: false,
  siteCount: 1,
  otherNotice: false,
  canRate: true,
  canSupport: false,
};

test("asks once the extension has been in use for a week", () => {
  assert.equal(shouldAsk(base), true);
  assert.equal(shouldAsk({ ...base, now: ASK_AFTER_MS - 1 }), false);
});

test("doesn't ask when dismissed, with nothing blocked, beside another notice, or with nowhere to send people", () => {
  assert.equal(shouldAsk({ ...base, dismissed: true }), false);
  assert.equal(shouldAsk({ ...base, siteCount: 0 }), false);
  assert.equal(shouldAsk({ ...base, otherNotice: true }), false);
  assert.equal(shouldAsk({ ...base, canRate: false, canSupport: false }), false);
  assert.equal(shouldAsk({ ...base, canRate: false, canSupport: true }), true);
  assert.equal(shouldAsk({ ...base, firstSeen: undefined }), false);
});

test("the rating link follows the store the extension came from", () => {
  assert.equal(
    reviewUrl("https://clients2.google.com/service/update2/crx", "abc"),
    "https://chromewebstore.google.com/detail/abc/reviews"
  );
  assert.equal(
    reviewUrl("https://edge.microsoft.com/extensionwebstorebase/v1/crx", "xyz"),
    "https://microsoftedge.microsoft.com/addons/detail/xyz"
  );
  assert.equal(reviewUrl(undefined, "abc"), null); // loaded unpacked
  assert.equal(reviewUrl("https://example.com/updates.xml", "abc"), null);
});

test("the support link, when set, is an https page", () => {
  if (SUPPORT_URL) assert.match(SUPPORT_URL, /^https:\/\/[^\s]+$/);
});
