// Windows counterpart of MacActionClient.
// Keeps the exact same method contract (execute / preflight / getContext) so the
// group/private workers and the subscription prompt builder need zero changes.
//
// Design: data is the source of truth in a local JSON store (src/automation/local-store.js).
// PowerShell (scripts/win32-actions.ps1) is used only for the *notification* side effects
// (native Windows toast + a one-time scheduled reminder at the due time). Keeping file writes
// in Node avoids PowerShell encoding/locking issues and makes the store unit-testable on any OS.

import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { LocalActionStore } from "./local-store.js";

const defaultExecFile = promisify(execFileCallback);
const defaultPsScript = fileURLToPath(new URL("../../scripts/win32-actions.ps1", import.meta.url));

export class WindowsActionClient {
  constructor({
    storePath = null,
    psScript = defaultPsScript,
    powershell = "powershell.exe",
    execFileImpl = defaultExecFile,
    timeoutMs = 180_000,
    store = null
  } = {}) {
    this.psScript = psScript;
    this.powershell = powershell;
    this.execFileImpl = execFileImpl;
    this.timeoutMs = timeoutMs;
    this.store = store || new LocalActionStore(storePath);
  }

  async execute(action, { sourceGroupId, sourceGroupName } = {}) {
    const marker = `[WBAutomation:${action.actionId}]`;
    const sourceGroupNameStr = String(sourceGroupName || "学校通知群");
    const sourceGroupIdStr = String(sourceGroupId || "");

    let record;
    if (action.type === "reminder") {
      record = this.store.upsertReminder({
        title: action.title,
        due: action.due || null,
        notes: action.notes || "",
        marker,
        sourceGroupId: sourceGroupIdStr,
        sourceGroupName: sourceGroupNameStr
      });
    } else if (action.type === "calendar") {
      record = this.store.upsertCalendarEvent({
        title: action.title,
        calendarName: action.calendarName,
        start: action.start,
        end: action.end,
        allDay: action.allDay,
        location: action.location,
        notes: action.notes,
        marker,
        sourceGroupId: sourceGroupIdStr,
        sourceGroupName: sourceGroupNameStr
      });
    } else {
      throw new Error("不支持的自动化类型");
    }

    // Notification is best-effort: store write above already succeeded.
    await this._notify({ action, record, sourceGroupName: sourceGroupNameStr });

    return {
      externalItemId: record.id,
      result: action.type === "calendar"
        ? `已写入或更新“${action.calendarName}”日历`
        : "已写入或更新“待办”列表",
      targetList: action.type === "calendar" ? action.calendarName : "待办"
    };
  }

  async _notify({ action, record, sourceGroupName }) {
    const payload = {
      type: "notify",
      title: String(action.title || record.title || ""),
      body: String(action.notes || ""),
      due: action.type === "reminder" ? (action.due || null) : (action.start || null),
      calendarName: action.calendarName || null,
      sourceGroupName: String(sourceGroupName || "学校通知群")
    };
    try {
      await this.execFileImpl(
        this.powershell,
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", this.psScript, JSON.stringify(payload)],
        { timeout: this.timeoutMs, maxBuffer: 1024 * 1024 }
      );
    } catch {
      // Toast/scheduled-reminder failure must not break the turn; the item is already stored.
    }
  }

  async preflight() {
    try {
      const { stdout = "" } = await this.execFileImpl(
        this.powershell,
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", this.psScript, JSON.stringify({ type: "preflight" })],
        { timeout: this.timeoutMs, maxBuffer: 1024 * 1024 }
      );
      const parsed = JSON.parse(String(stdout || "{}").trim() || "{}");
      // Confirm the store path itself is readable/writable.
      this.store.raw();
      return {
        ready: Boolean(parsed.ready),
        burntToast: Boolean(parsed.burntToast),
        storePath: this.store.storePath,
        reminder: parsed.reminder || (parsed.burntToast ? "ok" : "missing")
      };
    } catch (error) {
      return {
        ready: false,
        burntToast: false,
        storePath: this.store.storePath,
        error: String(error?.message || error)
      };
    }
  }

  async getContext(opts) {
    return this.store.getContext(opts);
  }

  async completeReminder(id) {
    return this.store.markComplete(id);
  }
}
