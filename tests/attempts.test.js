// Counting tries on a blocked site: what counts, and how the days add up.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKey,
  addDays,
  daysBetween,
  shouldCount,
  newRecord,
  addAttempt,
  todayCount,
  showsChart,
  dailySeries,
  GRACE_MS,
  KEEP_DAYS,
  CHART_MAX_DAYS,
} from "../attempts.js";

// Local times, so the tests mean the same in any time zone.
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 11, 3, 15, 8);

test("dayKey is the local calendar day", () => {
  assert.equal(dayKey(at(2026, 11, 3, 0, 0)), "2026-11-03");
  assert.equal(dayKey(at(2026, 11, 3, 23, 59)), "2026-11-03");
  assert.equal(dayKey(at(2026, 1, 9)), "2026-01-09");
});

test("addDays and daysBetween step by calendar day, across month ends and clock changes", () => {
  assert.equal(dayKey(addDays(at(2026, 10, 31), 1)), "2026-11-01");
  assert.equal(dayKey(addDays(at(2026, 3, 1), -1)), "2026-02-28");
  // Europe's clocks go back on 25 Oct 2026 and forward on 29 Mar 2026.
  assert.equal(daysBetween(at(2026, 10, 24, 23, 0), at(2026, 10, 26, 0, 30)), 2);
  assert.equal(daysBetween(at(2026, 3, 28, 1, 0), at(2026, 3, 30, 23, 0)), 2);
  assert.equal(daysBetween(NOW, NOW), 0);
  assert.equal(daysBetween(at(2026, 11, 3, 0, 1), at(2026, 11, 3, 23, 59)), 0);
});

test("a fresh visit to a blocked site counts", () => {
  const entry = { domain: "x.com", addedAt: NOW - 60 * 60 * 1000 };
  assert.equal(shouldCount(entry, "navigate", NOW), true);
  assert.equal(shouldCount(entry, "prerender", NOW), true);
  assert.equal(shouldCount(entry, undefined, NOW), true);
});

test("reloads, steps back and sites off the list don't count", () => {
  const entry = { domain: "x.com", addedAt: NOW - 60 * 60 * 1000 };
  assert.equal(shouldCount(entry, "reload", NOW), false);
  assert.equal(shouldCount(entry, "back_forward", NOW), false);
  assert.equal(shouldCount(null, "navigate", NOW), false);
  assert.equal(shouldCount(undefined, "navigate", NOW), false);
});

test("the tab switching over as a block starts doesn't count", () => {
  const entry = { domain: "x.com", addedAt: NOW - 2000, createdAt: NOW - 2000 };
  assert.equal(shouldCount(entry, "navigate", NOW), false);
  assert.equal(shouldCount(entry, "navigate", NOW - 2000 + GRACE_MS), true);
  // A clock set back can't keep the grace window open.
  assert.equal(shouldCount({ addedAt: NOW + 60000 }, "navigate", NOW), true);
});

test("addAttempt counts today and the total, without changing the record it's given", () => {
  const start = newRecord(at(2026, 11, 1, 9));
  const one = addAttempt(start, at(2026, 11, 1, 10));
  const two = addAttempt(one, at(2026, 11, 1, 22));
  const three = addAttempt(two, at(2026, 11, 2, 8));
  assert.deepEqual(start, { since: at(2026, 11, 1, 9), total: 0, days: {} });
  assert.deepEqual(three, { since: at(2026, 11, 1, 9), total: 3, days: { "2026-11-01": 2, "2026-11-02": 1 } });
  assert.equal(todayCount(three, at(2026, 11, 2, 20)), 1);
  assert.equal(todayCount(three, at(2026, 11, 3, 9)), 0);
  assert.equal(todayCount(null, NOW), 0);
});

test("addAttempt starts a record when there is none", () => {
  assert.deepEqual(addAttempt(undefined, NOW), { since: NOW, total: 1, days: { "2026-11-03": 1 } });
  assert.deepEqual(addAttempt({ junk: true }, NOW), { since: NOW, total: 1, days: { "2026-11-03": 1 } });
});

test("addAttempt drops day counts older than KEEP_DAYS but keeps them in the total", () => {
  const old = dayKey(addDays(NOW, -KEEP_DAYS));
  const kept = dayKey(addDays(NOW, -(KEEP_DAYS - 1)));
  const record = { since: addDays(NOW, -100), total: 9, days: { [old]: 5, [kept]: 4 } };
  const next = addAttempt(record, NOW);
  assert.deepEqual(next.days, { [kept]: 4, "2026-11-03": 1 });
  assert.equal(next.total, 10);
});

test("the chart shows once counting has run for a week", () => {
  assert.equal(showsChart(newRecord(at(2026, 10, 28, 23)), NOW), false); // 6 days
  assert.equal(showsChart(newRecord(at(2026, 10, 27, 23)), NOW), true); // 7 days
  assert.equal(showsChart(newRecord(NOW), NOW), false);
  assert.equal(showsChart(null, NOW), false);
});

test("dailySeries has every day from the start to today, quiet ones as 0", () => {
  const record = { since: at(2026, 10, 27, 18), total: 5, days: { "2026-10-27": 2, "2026-10-30": 1, "2026-11-03": 2 } };
  const series = dailySeries(record, NOW);
  assert.equal(series.length, 8);
  assert.deepEqual(
    series.map((d) => [d.day, d.count]),
    [
      ["2026-10-27", 2],
      ["2026-10-28", 0],
      ["2026-10-29", 0],
      ["2026-10-30", 1],
      ["2026-10-31", 0],
      ["2026-11-01", 0],
      ["2026-11-02", 0],
      ["2026-11-03", 2],
    ]
  );
});

test("dailySeries shows at most the last CHART_MAX_DAYS days", () => {
  const series = dailySeries(newRecord(addDays(NOW, -90)), NOW);
  assert.equal(series.length, CHART_MAX_DAYS);
  assert.equal(series[series.length - 1].day, "2026-11-03");
  assert.equal(series[0].day, dayKey(addDays(NOW, -(CHART_MAX_DAYS - 1))));
  assert.deepEqual(dailySeries(null, NOW), []);
});
