// review.js
// Pure rules for the popup's review step: when a new block gets a second
// look before its timer starts, and what that review warns about. No
// chrome.* and no DOM here, so it's unit-tested directly
// (tests/review.test.js).
//
// Blocks that skip the review can still be undone for 30 seconds (UNDO_MS
// in lockModel.js), so the review is kept for the cases where a mistake is
// likely or costly.
import { DURATION_OPTIONS } from "./lockModel.js";

const LONGEST_MS = Math.max(...DURATION_OPTIONS.map((o) => o.ms));

// Sites people need for other things on their subdomains. Blocking one also
// blocks those, so the review says what else goes with it (message key).
const BROAD_SITES = {
  "google.com": "reviewGoogle", // Gmail, Drive, Docs, Google sign-in
  "amazon.com": "reviewAmazon", // the AWS console
};

// The message key for what else blocking `domain` takes down, or null.
export function broadWarningKey(domain) {
  return Object.prototype.hasOwnProperty.call(BROAD_SITES, domain) ? BROAD_SITES[domain] : null;
}

// The page part of what the user typed: "/r/politics" for
// "reddit.com/r/politics", or null when they typed just a site. Shortened
// when long, since it's shown in a sentence.
export function typedPath(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "http://" + s;
  let path;
  try {
    path = new URL(s).pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
  if (!path) return null;
  try {
    path = decodeURI(path);
  } catch {
    // Keep the encoded form if it isn't valid UTF-8.
  }
  return path.length > 40 ? path.slice(0, 39) + "…" : path;
}

// Why a new block should be reviewed before it starts; empty means it can
// start straight away.
//   "first"   nothing is blocked yet, so the user hasn't seen how timers work
//   "longest" the longest timer (30 days)
//   "path"    they typed a page, but the whole site gets blocked
//   "broad"   a site whose subdomains people need for other things
export function reviewReasons({ domain, input = null, durationMs, listLength }) {
  const reasons = [];
  if (!listLength) reasons.push("first");
  if (durationMs >= LONGEST_MS) reasons.push("longest");
  if (typedPath(input)) reasons.push("path");
  if (broadWarningKey(domain)) reasons.push("broad");
  return reasons;
}
