# Register a logon-triggered scheduled task that launches the gateway.
# Windows equivalent of modules/chat-hub-start.command (macOS launchd).
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectDir = (Resolve-Path (Join-Path $scriptDir "..")).Path
$runScript = Join-Path $projectDir "modules/run-qq-only.ps1"
$taskName = "WorkBuddyQQGateway"

$nodeBin = $env:CODEX_REMOTE_CONTACT_NODE_PATH
if (-not $nodeBin -or -not (Test-Path $nodeBin)) {
  $nodeBin = (Get-Command node -ErrorAction SilentlyContinue).Source
}
if (-not $nodeBin) {
  Write-Error "Node.js was not found; install Node.js 20.6+ before scheduling the task."
  exit 1
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force
Write-Host "已创建登录触发任务：$taskName（可在任务计划程序中查看/禁用）"
