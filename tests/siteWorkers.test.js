import { test } from "node:test";
import assert from "node:assert/strict";
import { workerOriginsFor, clearSiteWorkers } from "../siteWorkers.js";

test("a site's usual addresses are cleared, with and without www, over https and http", () => {
  assert.deepEqual(workerOriginsFor("mawbima.lk"), [
    "https://mawbima.lk",
    "http://mawbima.lk",
    "https://www.mawbima.lk",
    "http://www.mawbima.lk",
  ]);
});

test("open tabs add the exact addresses they're on, subdomains and ports included", () => {
  const origins = workerOriginsFor("facebook.com", [
    "https://m.facebook.com/home.php",
    "https://business.facebook.com:8443/x",
    "https://www.facebook.com/", // already one of the usual addresses
  ]);
  assert.ok(origins.includes("https://m.facebook.com"));
  assert.ok(origins.includes("https://business.facebook.com:8443"));
  assert.equal(origins.filter((o) => o === "https://www.facebook.com").length, 1);
});

test("tabs on other sites, look-alike names and non-web pages are ignored", () => {
  const origins = workerOriginsFor("facebook.com", [
    "https://notfacebook.com/",
    "https://facebook.com.evil.example/",
    "chrome://extensions/",
    "chrome-extension://abc/blocked.html?d=facebook.com",
    "not a url",
  ]);
  assert.deepEqual(origins, workerOriginsFor("facebook.com"));
});

test("clearSiteWorkers removes only service workers, for every listed site at once", async () => {
  const calls = [];
  globalThis.chrome = { browsingData: { remove: async (...args) => calls.push(args) } };
  try {
    await clearSiteWorkers(["a.com", "b.org"], ["https://m.a.com/feed"]);
    assert.equal(calls.length, 1);
    const [options, dataTypes] = calls[0];
    assert.deepEqual(dataTypes, { serviceWorkers: true });
    assert.deepEqual(options.origins.sort(), [
      ...workerOriginsFor("a.com", ["https://m.a.com/feed"]),
      ...workerOriginsFor("b.org"),
    ].sort());
    assert.equal(options.since, undefined); // all time
  } finally {
    delete globalThis.chrome;
  }
});

test("clearSiteWorkers does nothing when no site is blocked", async () => {
  let called = false;
  globalThis.chrome = { browsingData: { remove: async () => { called = true; } } };
  try {
    await clearSiteWorkers([]);
    assert.equal(called, false);
  } finally {
    delete globalThis.chrome;
  }
});
