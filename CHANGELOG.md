# 变更记录

记录本仓库（WorkBuddy QQ Agent 网关的 Windows 优化版）对基线所做的优化与完善。基线与署名见 [代码来源](docs/PROVENANCE.md)。

## [未发布]

### 新增

- **动作后端抽象** `src/automation/backend.js`：`createActionBackend()` 按 `process.platform` 选择 `MacActionClient` / `WindowsActionClient` / 空实现，调用方（`src/server.js`、worker）无需感知平台。
- **Windows 动作后端** `src/automation/windows-actions.js` + **本地存储** `src/automation/local-store.js`：用单个 JSON 文件 `runtime/win32-actions.json` 替代 macOS 的 Calendar.app / Reminders.app，按 `actionId` 幂等去重，事件/提醒数据模型与 macOS 侧对齐。
- **PowerShell 通知脚本** `scripts/win32-actions.ps1`：BurntToast 原生通知；对未来到期提醒用 `schtasks.exe` 注册一次性任务到时弹窗；BurntToast 缺失时 best-effort 降级，不影响动作落盘。
- **Windows 启动脚本** `modules/run-qq-only.ps1`（前台启动）与 `modules/install-task-scheduler.ps1`（任务计划程序登录自启，等价 macOS `chat-hub-start.command`）。
- **Web 控制台「日历/待办」页**（`modules/web-console/public/client.html`、`client.js`）+ 路由 `GET /api/automation/preflight`、`GET /api/automation/items`、`POST /api/automation/reminders/:id/complete`。
- **单元测试** `test/windows-automation.test.js`（6 项：幂等去重、标记完成、时间窗过滤、上下文回读、PowerShell 容错、preflight 降级）。
- **文档**：README「本仓库的优化与完善」「Windows 适配（实验性）」；`docs/LOCAL_CUSTOMIZATION.md`「Windows 适配与动作后端切换」。

### 修复 / 完善

- **接通此前定义但从未调用的能力**：`preflight()`（写入前环境自检，未就绪时提示而不写入）与 `getContext()`（把已有日历/待办回读给模型做去重）接入群聊 / 私聊轮次与订阅提示词 `src/security/subscription-policy.js`。
- **统一日历 / 提醒写入的默认开关为「关闭」**：worker 由 `!== false` 改为 `=== true`，面板控制台默认值与复选框同步，消除与 README「默认关闭」的语义不一致。
- 每个动作执行加 try/catch，单个失败不再中断整轮；`MacActionClient` 补 `completeReminder()` 占位以对齐接口。
- 修复 `scripts/win32-actions.ps1` 与 `modules/install-task-scheduler.ps1` 的 PowerShell 引号 / 括号解析错误（三个 `.ps1` 均通过 Parser 校验）。

### 兼容性

- macOS 行为保持不变（`MacActionClient` 仅做接口对齐）；非 macOS / 非 Windows 平台走空实现，仅记录、不写任何外部状态。
- 全量测试：新增 6 项全过；平台相关集成用例在 Windows 上仍按预期失败（与基线一致，非本次改动引入）。
