// Local, dependency-free store for calendar events and reminders on Windows.
// Mirrors the data model the macOS backend keeps in the native Calendar / Reminders apps,
// but persists to a single JSON file so the gateway needs no production npm dependencies
// (the project intentionally ships Node services with zero production deps).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const EMPTY = { calendar: [], reminders: [] };

export function defaultStorePath() {
  return resolve(process.cwd(), "runtime", "win32-actions.json");
}

export class LocalActionStore {
  constructor(storePath) {
    this.storePath = storePath || defaultStorePath();
  }

  _load() {
    try {
      if (!existsSync(this.storePath)) return structuredClone(EMPTY);
      const data = JSON.parse(readFileSync(this.storePath, "utf8") || "{}");
      return {
        calendar: Array.isArray(data.calendar) ? data.calendar : [],
        reminders: Array.isArray(data.reminders) ? data.reminders : []
      };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  _save(data) {
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.storePath, JSON.stringify(data, null, 2), "utf8");
  }

  upsertCalendarEvent({
    title, calendarName, start, end, allDay, location, notes, marker,
    sourceGroupId = "", sourceGroupName = ""
  }) {
    const data = this._load();
    const existing = data.calendar.find((e) => e.marker === marker);
    const record = existing || { id: randomUUID(), createdAt: new Date().toISOString() };
    record.title = String(title || "");
    record.calendarName = calendarName || null;
    record.start = start || null;
    record.end = end || null;
    record.allDay = Boolean(allDay);
    record.location = String(location || "");
    record.notes = String(notes || "");
    record.marker = marker;
    record.sourceGroupId = String(sourceGroupId || "");
    record.sourceGroupName = String(sourceGroupName || "");
    record.updatedAt = new Date().toISOString();
    if (!existing) data.calendar.push(record);
    this._save(data);
    return record;
  }

  upsertReminder({
    title, due = null, notes, marker, sourceGroupId = "", sourceGroupName = ""
  }) {
    const data = this._load();
    const existing = data.reminders.find((r) => r.marker === marker);
    const record = existing || { id: randomUUID(), createdAt: new Date().toISOString(), completed: false };
    record.title = String(title || "");
    record.due = due || null;
    record.notes = String(notes || "");
    record.marker = marker;
    record.sourceGroupId = String(sourceGroupId || "");
    record.sourceGroupName = String(sourceGroupName || "");
    record.completed = Boolean(record.completed);
    record.updatedAt = new Date().toISOString();
    if (!existing) data.reminders.push(record);
    this._save(data);
    return record;
  }

  markComplete(id) {
    const data = this._load();
    const reminder = data.reminders.find((r) => r.id === id);
    if (!reminder) return false;
    reminder.completed = true;
    reminder.completedAt = new Date().toISOString();
    this._save(data);
    return true;
  }

  listUpcomingCalendar({ horizonDays = 60, limit = 80, now = new Date() } = {}) {
    const until = new Date(now.getTime() + Number(horizonDays) * 86400000);
    return this._load().calendar
      .filter((e) => {
        const s = new Date(e.start);
        return !Number.isNaN(s.getTime()) && s >= now && s <= until;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, limit)
      .map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, location: e.location || "", calendarName: e.calendarName }));
  }

  listPendingReminders({ limit = 80, now = new Date() } = {}) {
    const far = new Date(8640000000000000);
    return this._load().reminders
      .filter((r) => !r.completed)
      .filter((r) => {
        if (!r.due) return true;
        const d = new Date(r.due);
        return Number.isNaN(d.getTime()) ? true : d >= now;
      })
      .sort((a, b) => (a.due ? new Date(a.due) : far) - (b.due ? new Date(b.due) : far))
      .slice(0, limit)
      .map((r) => ({ title: r.title, due: r.due || null, id: r.id, notes: r.notes || "" }));
  }

  getContext(opts) {
    return {
      calendar: this.listUpcomingCalendar(opts),
      reminders: this.listPendingReminders(opts)
    };
  }

  raw() {
    return this._load();
  }
}

export { EMPTY as EMPTY_STORE };
