import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalActionStore } from "../src/automation/local-store.js";
import { WindowsActionClient } from "../src/automation/windows-actions.js";

function makeStore() {
  const dir = mkdtempSync(join(tmpdir(), "wb-auto-"));
  return new LocalActionStore(join(dir, "win32-actions.json"));
}

test("reminder upsert is idempotent by marker", () => {
  const store = makeStore();
  const a = store.upsertReminder({ title: "交作业", due: "2026-10-10T09:00:00.000Z", notes: "数学", marker: "M1", sourceGroupId: "g1" });
  const b = store.upsertReminder({ title: "交作业(改)", due: "2026-10-10T09:00:00.000Z", notes: "数学", marker: "M1", sourceGroupId: "g1" });
  assert.equal(a.id, b.id);
  assert.equal(store.raw().reminders.length, 1);
  assert.equal(store.raw().reminders[0].title, "交作业(改)");
});

test("markComplete hides reminder from pending and rejects unknown id", () => {
  const store = makeStore();
  const r = store.upsertReminder({ title: "买菜", marker: "M2" });
  assert.equal(store.listPendingReminders().length, 1);
  assert.equal(store.markComplete(r.id), true);
  assert.equal(store.listPendingReminders().length, 0);
  assert.equal(store.markComplete("nope"), false);
});

test("calendar list filters to upcoming within horizon", () => {
  const store = makeStore();
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  store.upsertCalendarEvent({ title: "明日会议", calendarName: "社团", start: future, marker: "C1" });
  store.upsertCalendarEvent({ title: "昨日会议", calendarName: "社团", start: past, marker: "C2" });
  const upcoming = store.listUpcomingCalendar({ horizonDays: 60, limit: 80 });
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].title, "明日会议");
});

test("getContext returns calendar + reminders with ids", () => {
  const store = makeStore();
  store.upsertCalendarEvent({ title: "课", calendarName: "学习", start: new Date(Date.now() + 3600000).toISOString(), marker: "C3" });
  store.upsertReminder({ title: "待办1", marker: "M3" });
  const ctx = store.getContext({ horizonDays: 60, limit: 80 });
  assert.equal(ctx.calendar.length, 1);
  assert.equal(ctx.reminders.length, 1);
  assert.ok(ctx.reminders[0].id);
  assert.ok(ctx.calendar[0].id);
});

test("WindowsActionClient.execute writes to store and tolerates missing PowerShell", async () => {
  const store = makeStore();
  const client = new WindowsActionClient({ store, powershell: "this-powershell-does-not-exist" });
  const res = await client.execute(
    { actionId: "A1", type: "reminder", title: "提醒", due: "2026-10-10T09:00:00.000Z", notes: "x" },
    { sourceGroupId: "g1", sourceGroupName: "群" }
  );
  assert.equal(res.targetList, "待办");
  assert.ok(res.externalItemId);
  assert.equal(store.listPendingReminders().length, 1);
});

test("WindowsActionClient.preflight degrades gracefully off Windows", async () => {
  const store = makeStore();
  const client = new WindowsActionClient({ store, powershell: "this-powershell-does-not-exist" });
  const status = await client.preflight();
  assert.equal(status.ready, false);
});
