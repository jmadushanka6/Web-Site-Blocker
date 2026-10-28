// End-to-end checks: loads the extension into Playwright's Chromium and
// exercises it the way a user would.
//
//   npm install                    # once: installs Playwright
//   npx playwright install chromium
//   npm run test:e2e               # or: node e2e/extension.e2e.cjs [section...]
//
// Sections: popup, blocked, parsing, fallback (default: all of them).
// Set HEADED=1 to watch the browser. Takes about two minutes, mostly
// waiting for real timers (the popup's 15-second refresh, a lock expiring).
// No network access is needed: blocked sites are redirected before any
// request leaves the browser.
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DAY = 24 * 60 * 60 * 1000;
const sections = process.argv.slice(2);
const want = (s) => sections.length === 0 || sections.includes(s);
const tempDirs = [];

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

// Copies the same runtime files scripts/package.sh puts in the store zip.
// `restricted` turns the host permission into an optional, never-granted
// one — the same state as a user setting site access to "On click", which
// can't be produced through the API (required permissions can't be removed).
function buildExtension({ restricted = false } = {}) {
  const dir = tempDir(restricted ? "lsb-ext-restricted-" : "lsb-ext-");
  for (const f of fs.readdirSync(ROOT)) {
    if (f === "manifest.json" || f.endsWith(".html") || f.endsWith(".js")) {
      fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    }
  }
  fs.mkdirSync(path.join(dir, "icons"));
  for (const f of fs.readdirSync(path.join(ROOT, "icons")).filter((f) => f.endsWith(".png"))) {
    fs.copyFileSync(path.join(ROOT, "icons", f), path.join(dir, "icons", f));
  }
  if (restricted) {
    const manifestPath = path.join(dir, "manifest.json");
    const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    m.optional_host_permissions = m.host_permissions;
    delete m.host_permissions;
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
  }
  return dir;
}

async function launch(extDir) {
  const context = await chromium.launchPersistentContext(tempDir("lsb-profile-"), {
    channel: "chromium",
    headless: !process.env.HEADED,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  const id = new URL(sw.url()).host;
  const errors = [];
  context.on("weberror", (e) => errors.push(String(e.error())));
  return { context, sw, id, errors };
}

async function openPopup(context, id, errors) {
  const popup = await context.newPage();
  popup.on("pageerror", (e) => errors.push("popup: " + e.message));
  popup.on("console", (m) => { if (m.type() === "error") errors.push("popup console: " + m.text()); });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForSelector("#addDur option", { state: "attached" });
  return popup;
}

async function addSite(popup, value, durationMs) {
  await popup.fill("#url", value);
  if (durationMs) await popup.selectOption("#addDur", String(durationMs));
  await popup.click("#addBtn");
  await popup.waitForFunction(() => document.querySelector("#msg").classList.contains("show"));
  const text = (await popup.textContent("#msg")).trim();
  // Clear the message so the next check sees a fresh one.
  await popup.evaluate(() => { document.querySelector("#msg").className = ""; });
  return text;
}

const storage = (sw) => sw.evaluate(() => chrome.storage.local.get("blocklist").then((r) => r.blocklist || []));
const rules = (sw) => sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());

async function popupSection() {
  console.log("\n== popup");
  const { context, sw, id, errors } = await launch(buildExtension());
  const popup = await openPopup(context, id, errors);

  check("Incognito notice hidden while the list is empty", await popup.isHidden("#incognito"));
  const sites = ["example.org", "example.net", "example.com", "test-one.com", "test-two.com", "test-three.com"];
  for (const s of sites) {
    const m = await addSite(popup, s, 7 * DAY);
    if (m !== "Blocked.") check("block " + s, false, m);
  }
  await popup.waitForFunction((n) => document.querySelectorAll("li.item").length === n, sites.length);
  check("all sites listed", (await popup.$$("li.item")).length === sites.length);
  check("Incognito notice shown once something is blocked", await popup.isVisible("#incognito"));
  check("count reads '6 sites'", (await popup.textContent("#count")) === "6 sites");
  check("no site-access notice with full access", await popup.isHidden("#accessNotice"));
  check("no rows marked with full access", (await popup.locator("li.item .note").count()) === 0);

  // Pick 30 days in the last row and scroll the list down, then let a
  // 15-second refresh pass: neither the pick nor the scroll may reset.
  const thirty = String(30 * DAY);
  const lastSel = popup.locator("li.item").last().locator("select.dur");
  await lastSel.selectOption(thirty);
  await popup.evaluate(() => { const ul = document.querySelector("#list"); ul.scrollTop = ul.scrollHeight; });
  const scrollBefore = await popup.evaluate(() => document.querySelector("#list").scrollTop);
  check("list is scrollable", scrollBefore > 0, "scrollTop=" + scrollBefore);
  await sleep(16000);
  check("picked duration survives the 15s refresh", (await lastSel.inputValue()) === thirty);
  const scrollAfter = await popup.evaluate(() => document.querySelector("#list").scrollTop);
  check("scroll position survives the 15s refresh", scrollAfter === scrollBefore, `${scrollBefore} → ${scrollAfter}`);

  const lastDomain = (await popup.locator("li.item").last().locator(".dom").textContent()).trim();
  await popup.locator("li.item").last().locator(".btn-action").click();
  await popup.waitForFunction(() => document.querySelector("#msg").classList.contains("show"));
  check("extend message", (await popup.textContent("#msg")).trim() === lastDomain + " extended.");
  const after = (await storage(sw)).find((e) => e.domain === lastDomain);
  check("extend set the lock ~30 days out", Math.abs(after.lockUntil - (Date.now() + 30 * DAY)) < 60000);

  check("input has a label", await popup.evaluate(() => !!document.querySelector('label[for="url"]')));
  check("rows' dropdowns are labelled", await popup.evaluate(() =>
    [...document.querySelectorAll("select.dur")].every((s) => s.getAttribute("aria-label"))));
  check("status messages are announced", (await popup.getAttribute("#msg", "aria-live")) === "polite");

  // A lock that runs out while the popup is open turns into an unlocked row.
  await sw.evaluate(async () => {
    const { blocklist } = await chrome.storage.local.get("blocklist");
    const now = Date.now();
    blocklist.push({ domain: "soon.example", addedAt: now - 1000, lockUntil: now + 16000 });
    await chrome.storage.local.set({ blocklist });
  });
  await popup.reload();
  await popup.waitForSelector("li.item");
  const soonRow = popup.locator("li.item", { hasText: "soon.example" });
  check("soon.example starts locked", (await soonRow.getAttribute("class")).includes("active"));
  check("no Remove button while locked", (await soonRow.locator(".btn-remove").count()) === 0);
  await sleep(31000);
  const soonRow2 = popup.locator("li.item", { hasText: "soon.example" });
  check("row flips to unlocked after the timer ends", (await soonRow2.getAttribute("class")).includes("expired"));
  check("unlocked badge", (await soonRow2.locator(".badge").textContent()).includes("Unlocked"));
  check("Remove appears once unlocked", (await soonRow2.locator(".btn-remove").count()) === 1);
  await soonRow2.locator(".btn-remove").click();
  await popup.waitForFunction(() => document.querySelector("#msg").textContent.includes("removed"));
  check("removed from storage", !(await storage(sw)).some((e) => e.domain === "soon.example"));

  await popup.click("#incognitoDismiss");
  await popup.reload();
  await popup.waitForSelector("li.item");
  await sleep(300);
  check("dismissed Incognito notice stays hidden", await popup.isHidden("#incognito"));

  check("no page errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

async function blockedSection() {
  console.log("\n== blocked page");
  const { context, sw, id, errors } = await launch(buildExtension());
  const popup = await openPopup(context, id, errors);

  // A tab already open on the site is moved to the blocked page.
  const pre = await context.newPage();
  await pre.goto("https://www.example.org/feed", { waitUntil: "commit" }).catch(() => {});
  check("block example.org", (await addSite(popup, "example.org", DAY)) === "Blocked.");
  const moved = await pre.waitForURL(/blocked\.html/, { timeout: 5000 }).then(() => true, () => false);
  check("open tab is moved to the blocked page", moved, pre.url());

  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push("blocked: " + e.message));
  await page.goto("https://m.example.org/some/path").catch(() => {});
  check("subdomain redirects to the blocked page", page.url().includes("/blocked.html?d=example.org"));
  check("locked title", (await page.textContent("#title")) === "This site is blocked");
  const hint = (await page.textContent("#hint")).trim();
  check("locked hint offers extending, removal later", /longer/i.test(hint) && /timer ends/i.test(hint), hint);
  check("tab title names the site", (await page.title()).includes("example.org"));

  await sw.evaluate(async () => {
    const { blocklist } = await chrome.storage.local.get("blocklist");
    blocklist[0].lockUntil = Date.now() - 1000;
    await chrome.storage.local.set({ blocklist });
  });
  await page.waitForFunction(() => document.querySelector("#title").textContent === "This block has expired");
  check("expired state shown live", true);
  const hint2 = (await page.textContent("#hint")).trim();
  check("expired hint offers remove or block again", /remove/i.test(hint2) && /block it again/i.test(hint2), hint2);

  await popup.reload();
  await popup.waitForSelector("li.item .btn-remove");
  await popup.click("li.item .btn-remove");
  await page.waitForFunction(() => document.querySelector("#title").textContent === "No longer blocked");
  check("removed state shown live", true);
  check("go-to-site link points at the site", (await page.getAttribute("#goLink", "href")) === "https://example.org/");
  check("go-to-site link visible", await page.isVisible("#goLink"));

  const stale = await context.newPage();
  await stale.goto(`chrome-extension://${id}/blocked.html?d=gone.example&until=${Date.now() + DAY}&added=${Date.now()}`);
  await stale.waitForFunction(() => document.querySelector("#title").textContent === "No longer blocked");
  check("stale blocked page says it's no longer blocked", true);

  check("no page errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

async function parsingSection() {
  console.log("\n== domain input");
  const { context, sw, id, errors } = await launch(buildExtension());
  const popup = await openPopup(context, id, errors);
  check("full URL accepted", (await addSite(popup, "https://Twitter.com/home?x=1")) === "Blocked.");
  check("internationalised domain accepted", (await addSite(popup, "münchen.de")) === "Blocked.");
  const co = await addSite(popup, "co.uk");
  check("domain ending refused", /domain ending/i.test(co), co);
  const bad = await addSite(popup, "not a site");
  check("junk refused", /invalid/i.test(bad), bad);
  const dup = await addSite(popup, "www.twitter.com");
  check("duplicate of a locked site refused", /already blocked/i.test(dup), dup);
  const stored = (await storage(sw)).map((e) => e.domain).sort();
  check("stored as hostnames / punycode", JSON.stringify(stored) === JSON.stringify(["twitter.com", "xn--mnchen-3ya.de"]), JSON.stringify(stored));
  const page = await context.newPage();
  await page.goto("https://xn--mnchen-3ya.de/").catch(() => {});
  check("punycode site is blocked", page.url().includes("blocked.html"));
  check("no page errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

async function fallbackSection() {
  console.log("\n== restricted site access");
  const { context, sw, id, errors } = await launch(buildExtension({ restricted: true }));
  const popup = await openPopup(context, id, errors);
  check("block example.org without host access", (await addSite(popup, "example.org")) === "Blocked.");
  const r = await rules(sw);
  check("falls back to a plain block rule", r.length === 1 && r[0].action.type === "block", JSON.stringify(r));
  const page = await context.newPage();
  let navError = "";
  await page.goto("https://www.example.org/").catch((e) => { navError = e.message; });
  check("site is still blocked (ERR_BLOCKED_BY_CLIENT)", /ERR_BLOCKED_BY_CLIENT/.test(navError), navError.split("\n")[0]);
  await popup.reload();
  await popup.waitForSelector("li.item");
  check("popup explains limited site access once", await popup.isVisible("#accessNotice"));
  check("affected row is marked", (await popup.locator("li.item .note").count()) === 1);
  check("no page errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

(async () => {
  try {
    if (want("popup")) await popupSection();
    if (want("blocked")) await blockedSection();
    if (want("parsing")) await parsingSection();
    if (want("fallback")) await fallbackSection();
  } finally {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
