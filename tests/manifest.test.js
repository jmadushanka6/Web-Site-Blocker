import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(read("manifest.json"));

test("name and summary come from the message files", () => {
  // Their length limits are checked per language in i18n.test.js.
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.name, "__MSG_extName__");
  assert.equal(manifest.description, "__MSG_extDescription__");
});

test("Alt+Shift+L opens the popup rather than blocking anything by itself", () => {
  assert.deepEqual(Object.keys(manifest.commands), ["_execute_action"]);
  assert.equal(manifest.commands._execute_action.suggested_key.default, "Alt+Shift+L");
});

test("the package script ships the message files", () => {
  assert.match(read("scripts/package.sh"), /_locales\/\*\/messages\.json/);
});

test("every file the manifest points at exists", () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.web_accessible_resources.flatMap((r) => r.resources),
  ];
  for (const file of files) assert.ok(existsSync(new URL(file, root)), file);
});

test("every requested API permission is actually used", () => {
  const code = readdirSync(root)
    .filter((f) => f.endsWith(".js"))
    .map(read)
    .join("\n");
  for (const permission of manifest.permissions) {
    assert.ok(code.includes("chrome." + permission), `"${permission}" is requested but never used`);
  }
});

test("browsingData is only ever used to remove service workers", () => {
  // The privacy policies and the store's permission justification promise
  // this, so nothing else may creep in.
  const uses = readdirSync(root)
    .filter((f) => f.endsWith(".js"))
    .flatMap((f) => read(f).match(/chrome\.browsingData\.[^\n]*/g) || []);
  assert.deepEqual(uses, ["chrome.browsingData.remove({ origins }, { serviceWorkers: true });"]);
});

test("the store icon is a 128x128 PNG", () => {
  const png = readFileSync(new URL(manifest.icons["128"], root));
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  assert.equal(png.readUInt32BE(16), 128); // width
  assert.equal(png.readUInt32BE(20), 128); // height
});
