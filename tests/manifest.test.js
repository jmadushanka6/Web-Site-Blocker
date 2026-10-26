import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(read("manifest.json"));

test("description fits the Chrome Web Store's 132-character limit", () => {
  assert.ok(manifest.description.length <= 132, `${manifest.description.length} characters`);
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

test("the store icon is a 128x128 PNG", () => {
  const png = readFileSync(new URL(manifest.icons["128"], root));
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  assert.equal(png.readUInt32BE(16), 128); // width
  assert.equal(png.readUInt32BE(20), 128); // height
});
