// End-to-end checks: loads the extension into Playwright's Chromium and
// exercises it the way a user would.
//
//   npm install                    # once: installs Playwright
//   npx playwright install chromium
//   npm run test:e2e               # or: node e2e/extension.e2e.cjs [section...]
//
// Sections: popup, blocked, parsing, fallback, quickblock, offnotice
// (default: all of them). Set HEADED=1 to watch the browser. Takes about
// three minutes, mostly waiting for real timers (the popup's 15-second
// refresh, a lock expiring, the switched-off check's grace period).
// No network access is needed: blocked sites are redirected before any
// request leaves the browser, and the one site that has to load first
// (in "quickblock") is served by this script on 127.0.0.1.
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DAY = 24 * 60 * 60 * 1000;
// How long offTracker.js waits before deciding a wiped session means the
// extension was switched off (its GRACE_MS).
const OFF_CHECK_GRACE = 5000;
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

// `profile` reuses a browser profile (to restart the browser); `args` are
// extra command-line switches.
async function launch(extDir, { profile = tempDir("lsb-profile-"), args = [] } = {}) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: !process.env.HEADED,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, ...args],
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

// Polls `fn` until it returns something truthy, or gives up after `ms`.
async function eventually(fn, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value || Date.now() > end) return value;
    await sleep(200);
  }
}

// The popup as it is when the toolbar icon is clicked over the current tab:
// it's opened in a background tab, so the tab that was in front stays the
// active one (that's the tab its one-click button offers to block). Brought
// to the front once it has set itself up — the last thing it does is fill
// in the shortcut tip — because hidden tabs don't run animation frames,
// which Playwright's clicks wait for.
async function openPopupOver(context, sw, id, errors) {
  const opened = context.waitForEvent("page");
  await sw.evaluate((url) => chrome.tabs.create({ url, active: false }), `chrome-extension://${id}/popup.html`);
  const popup = await opened;
  popup.on("pageerror", (e) => errors.push("popup: " + e.message));
  popup.on("console", (m) => { if (m.type() === "error") errors.push("popup console: " + m.text()); });
  await popup.waitForFunction(() => /Alt\+Shift\+L/.test(document.querySelector("#tip").textContent), null, { polling: 100 });
  await popup.bringToFront();
  return popup;
}

// Serves one plain page for any *.test host (see LOCAL_SITE_ARGS), so a site
// can be open in a tab before it's blocked.
function startSiteServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><title>Some site</title><h1>Some site</h1>");
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const LOCAL_SITE_ARGS = [
  "--host-resolver-rules=MAP *.test 127.0.0.1",
  "--no-proxy-server",
  "--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable",
];

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

async function quickBlockSection() {
  console.log("\n== block the site you're on");
  const server = await startSiteServer();
  const site = (host, p = "/") => `http://${host}:${server.address().port}${p}`;
  try {
    const { context, sw, id, errors } = await launch(buildExtension(), { args: LOCAL_SITE_ARGS });

    // The native right-click menu and browser shortcuts can't be driven
    // from here, so check they're registered; what they run (blockTab) is
    // what the popup's button runs, tested below.
    const menuItem = (itemId) =>
      sw.evaluate((i) => new Promise((r) => chrome.contextMenus.update(i, {}, () => r(!chrome.runtime.lastError))), itemId);
    check("right-click menu on web pages", await eventually(() => menuItem("block-page::24h")));
    check("right-click menu on the toolbar icon", await menuItem("block-action::30d"));
    const cmd = (await sw.evaluate(() => chrome.commands.getAll())).find((c) => c.name === "block-current-site");
    check("Alt+Shift+L shortcut registered", !!cmd && cmd.shortcut === "Alt+Shift+L", JSON.stringify(cmd));

    const page = await context.newPage();
    await page.goto(site("quick.test", "/feed"));
    check("test site loads", (await page.title()) === "Some site");

    const popup = await openPopupOver(context, sw, id, errors);
    const quick = popup.locator("#quickAdd .quick-add");
    check("one-click button offers the tab's site", (await quick.count()) === 1 && (await quick.textContent()).includes("quick.test"));
    check("button shows the default lock length", (await quick.locator(".qa-dur").textContent()) === "24 hours");
    check("shortcut tip names the shortcut", (await popup.textContent("#tip")).includes("Alt+Shift+L"));
    await popup.selectOption("#addDur", String(2 * DAY));
    check("button follows the lock-length dropdown", (await quick.locator(".qa-dur").textContent()) === "48 hours");

    await quick.click();
    const moved = await page.waitForURL(/blocked\.html\?d=quick\.test/, { timeout: 5000 }).then(() => true, () => false);
    check("the tab switches to the blocked page straight away", moved, page.url());
    await popup.waitForFunction(() => document.querySelector("#msg").classList.contains("show"));
    check("popup confirms", (await popup.textContent("#msg")).trim() === "quick.test blocked.");
    check("button goes away once blocked", await popup.isHidden("#quickAdd"));
    const entry = (await storage(sw)).find((e) => e.domain === "quick.test");
    check("blocked for the chosen 48 hours", !!entry && entry.lockUntil - entry.addedAt === 2 * DAY, JSON.stringify(entry));
    check("listed in the popup", (await popup.locator("li.item .dom", { hasText: "quick.test" }).count()) === 1);
    await popup.close();

    // No button over the blocked page itself...
    await page.bringToFront();
    const overBlocked = await openPopupOver(context, sw, id, errors);
    check("no button over the blocked page", await overBlocked.isHidden("#quickAdd"));
    await overBlocked.close();

    // ...nor over a page that isn't a website, and asking anyway is refused.
    const blank = await context.newPage();
    await blank.goto("about:blank");
    const blankTabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
    const overBlank = await openPopupOver(context, sw, id, errors);
    check("no button over a page that isn't a website", await overBlank.isHidden("#quickAdd"));
    const refused = await overBlank.evaluate((tabId) => chrome.runtime.sendMessage({ type: "blockTab", tabId }), blankTabId);
    check("blocking a non-website is refused", refused && refused.ok === false && /isn't a website/.test(refused.error), JSON.stringify(refused));

    // A site a lock already covers (here through its parent domain) isn't
    // added again; blockTab only reloads the tab so the existing block shows.
    // The lock is stored without syncing the rules, so the tab can still
    // open the site first, as a tab opened before the block would have.
    await sw.evaluate(async () => {
      const { blocklist } = await chrome.storage.local.get("blocklist");
      const now = Date.now();
      blocklist.push({ domain: "parent.test", addedAt: now, lockUntil: now + 86400000 });
      await chrome.storage.local.set({ blocklist });
    });
    const sub = await context.newPage();
    await sub.goto(site("www.sub.parent.test"));
    const covered = await overBlank.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: "*://*.parent.test/*" });
      return chrome.runtime.sendMessage({ type: "blockTab", tabId: tab.id });
    });
    check("an already-covered site is recognised", covered && covered.ok && covered.alreadyBlocked && covered.domain === "parent.test", JSON.stringify(covered));
    check("…and not added twice", (await storage(sw)).filter((e) => e.domain.endsWith("parent.test")).length === 1);

    check("no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  } finally {
    server.close();
  }
}

async function offNoticeSection() {
  console.log("\n== switched-off notice");
  const extDir = buildExtension();
  const profile = tempDir("lsb-profile-");
  let { context, id, errors } = await launch(extDir, { profile });
  await sleep(OFF_CHECK_GRACE + 1500); // let the start-up check finish

  let popup = await openPopup(context, id, errors);
  check("no notice after a fresh install", (await popup.locator(".off-notice").count()) === 0);
  const badge = () => popup.evaluate(() => chrome.action.getBadgeText({}));
  check("no badge after a fresh install", (await badge()) === "");
  await popup.close();

  // Switch it off and on again from chrome://extensions, like a user would.
  const ext = await context.newPage();
  await ext.goto("chrome://extensions");
  const toggle = ext.locator(`extensions-item#${id} #enableToggle`);
  const isOn = () => toggle.evaluate((e) => e.checked);
  await toggle.click();
  check("switched off", await eventually(async () => !(await isOn())));
  await sleep(2000);
  await toggle.click();
  check("switched back on", await eventually(isOn));
  await sleep(1000); // give Chrome a moment to load it again

  // Opening the popup wakes the extension; the notice appears once its
  // check has run (within the grace period), without reopening the popup.
  popup = await openPopup(context, id, errors);
  const shown = await popup.waitForSelector(".off-notice", { timeout: OFF_CHECK_GRACE + 10000 }).then(() => true, () => false);
  check("notice appears at the top of the popup", shown && (await popup.evaluate(() => document.body.firstElementChild.id)) === "offNotice");
  if (shown) {
    check("notice title", (await popup.textContent(".off-notice .on-title")) === "The blocker was switched off");
    const body = await popup.textContent(".off-notice .on-body");
    check("notice says when and for how long", /^It was off (around|from about) .+ today \(less than a minute\), so your blocked sites could be opened during that time\.$/.test(body), body);
    check("toolbar badge shows !", await eventually(async () => (await badge()) === "!"));
    await popup.click(".off-notice .on-dismiss");
    check("Got it hides the notice", await eventually(async () => (await popup.locator(".off-notice").count()) === 0));
    check("…and clears the badge", await eventually(async () => (await badge()) === ""));
  }
  const log = await popup.evaluate(() => chrome.storage.local.get("offLog").then((r) => r.offLog || []));
  check("one switched-off period logged, marked seen", log.length === 1 && log[0].seen === true && log[0].onAt > log[0].offAt, JSON.stringify(log));
  check("no page errors", errors.length === 0, errors.join(" | "));
  await context.close();

  // Restarting the browser also starts a fresh session, but isn't reported.
  ({ context, id, errors } = await launch(extDir, { profile }));
  await sleep(OFF_CHECK_GRACE + 1500);
  popup = await openPopup(context, id, errors);
  await sleep(500);
  check("no notice after a browser restart", (await popup.locator(".off-notice").count()) === 0);
  const log2 = await popup.evaluate(() => chrome.storage.local.get("offLog").then((r) => r.offLog || []));
  check("nothing new logged by the restart", log2.length === 1, JSON.stringify(log2));
  check("no page errors after the restart", errors.length === 0, errors.join(" | "));
  await context.close();
}

(async () => {
  try {
    if (want("popup")) await popupSection();
    if (want("blocked")) await blockedSection();
    if (want("parsing")) await parsingSection();
    if (want("fallback")) await fallbackSection();
    if (want("quickblock")) await quickBlockSection();
    if (want("offnotice")) await offNoticeSection();
  } finally {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
