// offTracker.js works out "the extension was switched off and back on" from
// chrome.storage.session being wiped without a browser start-up or update to
// explain it. These tests run it against an in-memory stand-in for
// chrome.storage, with Node's mock timers standing in for the clock and the
// grace period.
import { test } from "node:test";
import assert from "node:assert/strict";

function fakeStorageArea() {
  let data = {};
  return {
    async get(key) {
      const keys = key == null ? Object.keys(data) : [].concat(key);
      const out = {};
      for (const k of keys) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(items) {
      data = { ...data, ...structuredClone(items) };
    },
    wipe() {
      data = {};
    },
    peek(k) {
      return data[k];
    },
  };
}

const local = fakeStorageArea();
const session = fakeStorageArea();
globalThis.chrome = { storage: { local, session } };
const tracker = await import("../offTracker.js");

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 28, 9, 0);
const GRACE = 5000;

// Let pending storage calls settle (setImmediate isn't mocked).
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

function freshInstall(t) {
  local.wipe();
  session.wipe();
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
  return tracker.markSessionStart("installed");
}

// Runs a check-in that will hit the grace period, letting the clock pass it.
async function checkInPastGrace(t, duringGrace = () => {}) {
  const result = tracker.checkIn();
  await settle();
  await duringGrace();
  t.mock.timers.tick(GRACE);
  return result;
}

test("normal heartbeats record nothing and keep lastSeen fresh", async (t) => {
  await freshInstall(t);
  t.mock.timers.tick(MIN);
  assert.equal(await tracker.checkIn(), false);
  assert.equal(local.peek("lastSeen"), T0 + MIN);
  assert.deepEqual(await tracker.getUnseenOffPeriods(), []);
});

test("a wiped session nothing explains is logged as a switch-off, from the last heartbeat", async (t) => {
  await freshInstall(t);
  t.mock.timers.tick(MIN);
  await tracker.checkIn(); // last heartbeat before it goes off

  session.wipe(); // switched off...
  t.mock.timers.tick(10 * MIN); // ...for ten minutes, then back on
  assert.equal(await checkInPastGrace(t), true);

  assert.deepEqual(await tracker.getUnseenOffPeriods(), [
    { offAt: T0 + MIN, onAt: T0 + 11 * MIN, seen: false },
  ]);
  assert.equal(session.peek("sessionMarker").reason, "re-enabled");
  assert.equal(await tracker.checkIn(), false, "the next heartbeat is normal again");
});

test("a browser start-up or update arriving during the grace period isn't a switch-off", async (t) => {
  for (const reason of ["startup", "installed"]) {
    await freshInstall(t);
    session.wipe(); // the browser restarted (or the extension was updated)
    t.mock.timers.tick(60 * MIN);
    const recorded = await checkInPastGrace(t, () => tracker.markSessionStart(reason));
    assert.equal(recorded, false, reason);
    assert.deepEqual(await tracker.getUnseenOffPeriods(), [], reason);
    t.mock.timers.reset();
  }
});

test("overlapping check-ins log one period, not two", async (t) => {
  await freshInstall(t);
  session.wipe();
  t.mock.timers.tick(5 * MIN);
  const first = tracker.checkIn();
  const second = tracker.checkIn();
  await settle();
  t.mock.timers.tick(GRACE);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal((await tracker.getUnseenOffPeriods()).length, 1);
});

test("dismissing marks every period seen; new ones show up again", async (t) => {
  await freshInstall(t);
  session.wipe();
  await checkInPastGrace(t);
  await tracker.acknowledgeOffPeriods();
  assert.deepEqual(await tracker.getUnseenOffPeriods(), []);
  assert.equal(local.peek("offLog").length, 1, "the period itself is kept");

  session.wipe();
  await checkInPastGrace(t);
  assert.equal((await tracker.getUnseenOffPeriods()).length, 1);
});

test("using the extension refreshes lastSeen, but not under a check about to log the old one", async (t) => {
  await freshInstall(t);
  t.mock.timers.tick(MIN);
  await tracker.noteAlive(); // say, the popup was opened
  assert.equal(local.peek("lastSeen"), T0 + MIN);

  session.wipe(); // switched off soon after...
  t.mock.timers.tick(10 * MIN); // ...and back on ten minutes later,
  let noted;
  // ...with the popup opened straight away, while the check is still waiting.
  const recorded = await checkInPastGrace(t, () => { noted = tracker.noteAlive(); });
  await noted;
  assert.equal(recorded, true);
  assert.deepEqual(await tracker.getUnseenOffPeriods(), [
    { offAt: T0 + MIN, onAt: T0 + 11 * MIN, seen: false },
  ]);
  assert.equal(local.peek("lastSeen"), Date.now(), "noted once the check was done");
});

test("the log keeps only the 20 most recent periods", async (t) => {
  await freshInstall(t);
  for (let i = 0; i < 23; i++) {
    session.wipe();
    t.mock.timers.tick(MIN);
    await checkInPastGrace(t);
  }
  const log = local.peek("offLog");
  assert.equal(log.length, 20);
  assert.equal(log[19].onAt, Date.now() - GRACE, "newest last");
});
