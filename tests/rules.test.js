import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRules, originPatternFor } from "../rules.js";

const list = [
  { domain: "facebook.com", addedAt: 1000, lockUntil: 2000 },
  { domain: "xn--mnchen-3ya.de", addedAt: 3000, lockUntil: 4000 },
];

test("each site gets one top-level-page rule covering it and its subdomains", () => {
  const rules = buildRules(list);
  assert.deepEqual(rules.map((r) => r.id), [1, 2]);
  rules.forEach((rule, i) => {
    assert.deepEqual(rule.condition, { requestDomains: [list[i].domain], resourceTypes: ["main_frame"] });
  });
});

test("sites the extension can act on redirect to the countdown page", () => {
  const [rule] = buildRules(list.slice(0, 1), () => true);
  assert.equal(rule.action.type, "redirect");
  assert.equal(rule.action.redirect.extensionPath, "/blocked.html?d=facebook.com&until=2000&added=1000");
});

test("sites without host access fall back to a plain block", () => {
  const rules = buildRules(list, (domain) => domain === "facebook.com");
  assert.equal(rules[0].action.type, "redirect");
  assert.deepEqual(rules[1].action, { type: "block" });
});

test("originPatternFor matches the site and every subdomain", () => {
  assert.equal(originPatternFor("example.org"), "*://*.example.org/*");
});
