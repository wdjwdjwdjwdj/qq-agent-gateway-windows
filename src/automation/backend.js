// Platform selector for the calendar/reminder automation backend.
// The gateway's workers only depend on the execute/preflight/getContext contract, so swapping
// the macOS implementation for Windows (or a no-op on unsupported platforms) is a single switch.

import { MacActionClient } from "./macos-actions.js";
import { WindowsActionClient } from "./windows-actions.js";

class NullActionClient {
  async execute() {
    throw new Error("日历/提醒自动化在本平台不可用（仅支持 macOS 与 Windows）。");
  }
  async preflight() {
    return { ready: false, platform: process.platform, error: "unsupported platform" };
  }
  async getContext() {
    return { calendar: [], reminders: [] };
  }

  async completeReminder() {
    return false;
  }
}

export function createActionBackend(options = {}) {
  if (process.platform === "darwin") return new MacActionClient(options);
  if (process.platform === "win32" || process.platform === "cygwin") return new WindowsActionClient(options);
  return new NullActionClient();
}

export { MacActionClient, WindowsActionClient, NullActionClient };
