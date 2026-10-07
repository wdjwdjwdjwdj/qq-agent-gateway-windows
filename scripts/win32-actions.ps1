# Windows notification helper for the WorkBuddy QQ Agent Gateway automation backend.
# Invoked by WindowsActionClient (src/automation/windows-actions.js). The JSON data of
# calendar events / reminders lives in a local store managed by Node; this script only
# produces the *notification* side effects: a native Windows toast and, for future-due
# items, a one-time scheduled reminder via Task Scheduler.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File win32-actions.ps1 "<json payload>"
# Payload: { "type": "preflight" } | { "type": "notify", title, body, due, calendarName, sourceGroupName }

param()

$ErrorActionPreference = "Stop"

function Test-BurntToast {
  return [bool](Get-Module -ListAvailable -Name BurntToast)
}

function Send-Toast {
  param($Title, $Body, $DueIso)
  if (-not (Test-BurntToast)) { return }
  Import-Module BurntToast
  $text = @($Title, ($Body -join "`n"))

  $due = $null
  if ($DueIso -and $DueIso -ne "") {
    try { $due = [datetime]::Parse($DueIso) } catch { $due = $null }
  }

  if ($due -and $due -gt (Get-Date)) {
    # Schedule a one-time toast at the due time; fall back to an immediate toast on any failure.
    try {
      Register-ScheduledToast -Title $Title -Body ($Body -join " ") -Due $due
    } catch {
      New-BurntToastNotification -Text $text
    }
  } else {
    New-BurntToastNotification -Text $text
  }
}

function Register-ScheduledToast {
  param($Title, $Body, $Due)
  $taskName = "WBReminder-" + [guid]::NewGuid().ToString("N").Substring(0, 12)
  $safeTitle = $Title -replace "'", "''"
  $safeBody = $Body -replace "'", "''"
  $action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command `"Import-Module BurntToast; New-BurntToastNotification -Text '$($safeTitle)','$($safeBody)'`""
  $st = $Due.ToString("HH:mm")
  $sd = $Due.ToString("MM/dd/yyyy")
  schtasks.exe /create /tn $taskName /tr $action /sc once /st $st /sd $sd /f | Out-Null
}

try {
  $payload = $args[0] | ConvertFrom-Json
} catch {
  Write-Error "无效的 JSON 负载"
  exit 1
}

if ($payload.type -eq "preflight") {
  $has = Test-BurntToast
  $out = [ordered]@{
    ready       = $has
    burntToast  = $has
    reminder    = if ($has) { "ok" } else { "missing" }
  }
  $out | ConvertTo-Json -Compress
  exit 0
}

if ($payload.type -eq "notify") {
  $title = if ($payload.title) { $payload.title } else { "提醒" }
  $body = @()
  if ($payload.sourceGroupName) { $body += "来源：$($payload.sourceGroupName)" }
  if ($payload.calendarName) { $body += "日历：$($payload.calendarName)" }
  if ($payload.body) { $body += $payload.body }
  Send-Toast -Title $title -Body $body -DueIso $payload.due
  exit 0
}

Write-Error "不支持的类型: $($payload.type)"
exit 1
