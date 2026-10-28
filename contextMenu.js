// contextMenu.js
// Single Responsibility: define the right-click "Block this site" menu —
// both on web pages and on the extension's toolbar icon — and translate a
// click on it back into a lock duration. What happens after the click (the
// actual blocking) lives in siteActions.js.
import { DURATION_OPTIONS } from "./lockModel.js";

const PAGE_ROOT = "block-page";
const ACTION_ROOT = "block-action";
const SEP = "::";

const ROOTS = [
  {
    // Right-clicking anywhere on a page (background, a link, an image,
    // selected text...). Only offered on ordinary websites, so it never
    // appears on chrome:// pages, the new-tab page or the blocked page.
    id: PAGE_ROOT,
    contexts: ["page", "frame", "link", "selection", "image", "video", "audio"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  },
  {
    // Right-clicking the extension's toolbar icon. Chrome doesn't filter this
    // menu by page, so on a page that isn't a website the click just flashes
    // an error badge instead.
    id: ACTION_ROOT,
    contexts: ["action"],
  },
];

function create(props) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(props, () => {
      void chrome.runtime.lastError; // e.g. a duplicate id from an overlapping rebuild
      resolve();
    });
  });
}

function removeAll() {
  return new Promise((resolve) => chrome.contextMenus.removeAll(() => resolve()));
}

async function build() {
  await removeAll();
  for (const root of ROOTS) {
    const shared = { contexts: root.contexts };
    if (root.documentUrlPatterns) shared.documentUrlPatterns = root.documentUrlPatterns;
    await create({ ...shared, id: root.id, title: "Block this site" });
    for (const o of DURATION_OPTIONS) {
      await create({ ...shared, id: root.id + SEP + o.key, parentId: root.id, title: "For " + o.label });
    }
  }
}

let building = Promise.resolve();

// (Re)create the menu from scratch. Safe to call any number of times —
// rebuilds are queued so two of them can never interleave.
export function createMenus() {
  building = building.then(build, build);
  return building;
}

// The lock duration a clicked menu item stands for, or null if the click
// wasn't on one of this menu's duration items.
export function durationForMenuItem(menuItemId) {
  const [root, key] = String(menuItemId).split(SEP);
  if (root !== PAGE_ROOT && root !== ACTION_ROOT) return null;
  const option = DURATION_OPTIONS.find((o) => o.key === key);
  return option ? option.ms : null;
}
