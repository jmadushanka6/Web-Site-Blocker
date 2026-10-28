// The wording of the "it was switched off" notice. Times are shown in the
// browser's own format, so the checks accept both "10:02" and "10:02 AM".
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayPhrase, fmtRange, fmtDuration, describeOffPeriods } from "../popupRender.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
// Local times on Wed 28 Oct 2026, so the checks hold in any time zone.
const at = (day, h, m, s = 0) => new Date(2026, 9, day, h, m, s).getTime();
const NOW = at(28, 11, 0);

test("fmtDuration reads naturally", () => {
  assert.equal(fmtDuration(0), "less than a minute");
  assert.equal(fmtDuration(20 * 1000), "less than a minute");
  assert.equal(fmtDuration(-5 * MIN), "less than a minute");
  assert.equal(fmtDuration(MIN), "1 min");
  assert.equal(fmtDuration(38 * MIN), "38 min");
  assert.equal(fmtDuration(HOUR), "1 hr");
  assert.equal(fmtDuration(125 * MIN), "2 hr 5 min");
  assert.equal(fmtDuration(24 * HOUR), "1 day");
  assert.equal(fmtDuration(27 * HOUR + 10 * MIN), "1 day 3 hr");
  assert.equal(fmtDuration(50 * HOUR), "2 days 2 hr");
});

test("dayPhrase says today, yesterday, or the date", () => {
  assert.equal(dayPhrase(at(28, 8, 0), NOW), "today");
  assert.equal(dayPhrase(at(27, 23, 59), NOW), "yesterday");
  assert.equal(dayPhrase(at(26, 10, 2), NOW), "on Mon 26 Oct");
});

test("fmtRange names the day once when the period stays within it", () => {
  assert.match(fmtRange(at(28, 10, 2), at(28, 10, 40), NOW), /^10:02( AM)? to 10:40( AM)? today$/);
  assert.match(fmtRange(at(27, 22, 15), at(28, 8, 10), NOW), /^(22:15|10:15 PM) yesterday to 0?8:10( AM)? today$/);
});

test("one period: when, and for how long", () => {
  const d = describeOffPeriods([{ offAt: at(28, 10, 2), onAt: at(28, 10, 40) }], NOW);
  assert.equal(d.title, "The blocker was switched off");
  assert.match(
    d.body,
    /^It was off from about 10:02( AM)? to 10:40( AM)? today \(38 min\), so your blocked sites could be opened during that time\.$/
  );
});

test("one period whose start isn't known", () => {
  const d = describeOffPeriods([{ offAt: null, onAt: at(28, 10, 40) }], NOW);
  assert.match(d.body, /^It was off until 10:40( AM)? today, so your blocked sites/);
});

test("off and back on within the same minute", () => {
  const one = describeOffPeriods([{ offAt: at(28, 10, 36, 1), onAt: at(28, 10, 36, 28) }], NOW);
  assert.match(one.body, /^It was off around 10:36( AM)? today \(less than a minute\), so /);
  const two = describeOffPeriods(
    [{ offAt: at(28, 10, 36, 1), onAt: at(28, 10, 36, 10) }, { offAt: at(28, 10, 36, 20), onAt: at(28, 10, 36, 28) }],
    NOW
  );
  assert.match(two.body, /^Less than a minute off in total — most recently around 10:36( AM)? today\. /);
});

test("several periods: the count, the total and the latest", () => {
  const periods = [
    { offAt: at(26, 20, 0), onAt: at(26, 20, 30) }, // 30 min
    { offAt: at(28, 10, 0), onAt: at(28, 10, 42) }, // 42 min
  ];
  const d = describeOffPeriods(periods, NOW);
  assert.equal(d.title, "The blocker was switched off twice");
  assert.match(d.body, /^About 1 hr 12 min off in total — most recently from about 10:00( AM)? to 10:42( AM)? today\. /);
  const three = describeOffPeriods([...periods, { offAt: at(28, 10, 50), onAt: at(28, 10, 51) }], NOW);
  assert.equal(three.title, "The blocker was switched off 3 times");
});

test("overnight", () => {
  const d = describeOffPeriods([{ offAt: at(27, 22, 15), onAt: at(28, 8, 10) }], NOW);
  assert.match(d.body, /^It was off from about (22:15|10:15 PM) yesterday to 0?8:10( AM)? today \(9 hr 55 min\)/);
});
