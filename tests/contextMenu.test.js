import { test } from "node:test";
import assert from "node:assert/strict";
import { durationForMenuItem } from "../contextMenu.js";
import { DURATION_OPTIONS } from "../lockModel.js";

test("each duration item, on the page menu and the toolbar-icon menu, maps to its lock length", () => {
  for (const o of DURATION_OPTIONS) {
    assert.equal(durationForMenuItem("block-page::" + o.key), o.ms, "page " + o.key);
    assert.equal(durationForMenuItem("block-action::" + o.key), o.ms, "action " + o.key);
  }
});

test("anything else isn't a duration", () => {
  for (const id of ["block-page", "block-action", "block-page::99y", "other::24h", "", undefined]) {
    assert.equal(durationForMenuItem(id), null, JSON.stringify(id));
  }
});
