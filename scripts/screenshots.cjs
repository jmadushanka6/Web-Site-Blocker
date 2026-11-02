// Captures the store screenshots (1280×800) in each language, with sample
// data: the popup on a branded backdrop, and the blocked page.
//
//   npm install && npx playwright install chromium   # once
//   node scripts/screenshots.cjs            # all languages
//   node scripts/screenshots.cjs de         # just German
//
// Writes store/screenshots/<lang>/1-popup.png and 2-blocked-page.png.
// Headless Chromium on Linux, so fonts can differ a little from a real
// Windows or Mac browser.
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Headline and subline for the popup shot, per language.
const COPY = {
  en: {
    headline: "Blocks you can't<br>undo on impulse",
    sub: "Lock a site for 24 hours up to 30 days. Until the timer runs out, there's no Remove button. You can only extend it.",
  },
  de: {
    headline: "Sperren, die du nicht<br>spontan aufhebst",
    sub: "Sperre eine Website für 24 Stunden bis 30 Tage. Bis der Timer abläuft, gibt es keinen Entfernen-Knopf – du kannst nur verlängern.",
  },
};

function buildExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsb-shots-ext-"));
  for (const f of fs.readdirSync(ROOT)) {
    if (f === "manifest.json" || f.endsWith(".html") || f.endsWith(".js")) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.cpSync(path.join(ROOT, "icons"), path.join(dir, "icons"), { recursive: true });
  fs.cpSync(path.join(ROOT, "_locales"), path.join(dir, "_locales"), { recursive: true });
  return dir;
}

async function shoot(lang) {
  const ext = buildExtension();
  const outDir = path.join(ROOT, "store", "screenshots", lang);
  fs.mkdirSync(outDir, { recursive: true });
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lsb-shots-")), {
    channel: "chromium",
    headless: true,
    locale: lang,
    env: { ...process.env, LANGUAGE: lang, LANG: lang + ".UTF-8" },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${lang}`],
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  const id = new URL(sw.url()).host;

  // Sample list: three locked sites at different points, one unlocked.
  const now = Date.now();
  await sw.evaluate(
    async ({ now, HOUR, DAY }) => {
      const blocklist = [
        { domain: "reddit.com", addedAt: now - 20 * HOUR, lockUntil: now + 28 * HOUR + 5 * 60000 },
        { domain: "x.com", addedAt: now - 2 * DAY, lockUntil: now + 27 * DAY + 19 * HOUR },
        { domain: "youtube.com", addedAt: now - DAY, lockUntil: now + 5 * DAY + 22 * HOUR },
        { domain: "instagram.com", addedAt: now - 3 * DAY, lockUntil: now - HOUR },
      ];
      await chrome.storage.local.set({ blocklist });
    },
    { now, HOUR, DAY }
  );

  // 1. The popup, captured at 2× and placed on the backdrop.
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 700 });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForSelector("li.item");
  await popup.evaluate(() => {
    document.getElementById("incognito").hidden = true;
    document.getElementById("url").blur();
    document.getElementById("list").style.maxHeight = "none"; // show every row
    document.body.style.maxHeight = "none";
  });
  const popupPng = await popup.locator("body").screenshot({ scale: "device" });
  const copy = COPY[lang] || COPY.en;
  const icon = fs.readFileSync(path.join(ROOT, "icons", "icon128.png")).toString("base64");
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1280px;height:800px;overflow:hidden}
    body{font-family:Inter,-apple-system,sans-serif;color:#eef0f4;
      background:radial-gradient(circle at 15% 20%,rgba(91,140,255,.18),transparent 45%),
        radial-gradient(circle at 85% 90%,rgba(139,92,246,.16),transparent 45%),linear-gradient(180deg,#171a22,#0e0f14);
      display:flex;align-items:center;justify-content:space-between;padding:0 150px 0 118px;box-sizing:border-box}
    .brand{display:flex;align-items:center;gap:16px;font-size:24px;color:#c9cedb;margin-bottom:40px}
    .brand img{width:56px;height:56px}
    h1{font-size:56px;line-height:1.2;margin:0 0 24px;font-weight:700;letter-spacing:-.5px}
    p{font-size:22px;line-height:1.65;color:#9aa0ac;margin:0;max-width:470px}
    .shot{width:348px;border-radius:14px;border:1px solid #333a48;box-shadow:0 30px 80px rgba(0,0,0,.5)}
  </style></head><body>
    <div><div class="brand"><img src="data:image/png;base64,${icon}">Locked Site Blocker</div>
    <h1>${copy.headline}</h1><p>${copy.sub}</p></div>
    <img class="shot" src="data:image/png;base64,${popupPng.toString("base64")}">
  </body></html>`);
  await page.waitForLoadState("load");
  await page.screenshot({ path: path.join(outDir, "1-popup.png") });

  // 2. The blocked page for youtube.com (it reads the live lock from storage).
  const blocked = await context.newPage();
  await blocked.goto(`chrome-extension://${id}/blocked.html?d=youtube.com`);
  await blocked.waitForFunction(() => /\d/.test(document.querySelector("#statusTime").textContent));
  await blocked.waitForTimeout(1200); // let the progress bar's transition finish
  await blocked.screenshot({ path: path.join(outDir, "2-blocked-page.png") });

  await context.close();
  console.log("Wrote", path.relative(ROOT, outDir));
}

(async () => {
  const langs = process.argv.slice(2);
  for (const lang of langs.length ? langs : fs.readdirSync(path.join(ROOT, "_locales"))) await shoot(lang);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
