# Windows launcher for the QQ-only gateway (equivalent of modules/run-qq-only.command).
# Loads config/qq-only.env, resolves Node, refuses to start if port 3789 is taken, then runs src/server.js.
$ErrorActionPreference = "Stop"

$projectDir = if ($env:CODEX_REMOTE_CONTACT_PROJECT_DIR) {
  $env:CODEX_REMOTE_CONTACT_PROJECT_DIR
} else {
  (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$envFile = Join-Path $projectDir "config/qq-only.env"

if (Test-Path $envFile) {
  foreach ($line in (Get-Content $envFile)) {
    $line = $line.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { continue }
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $name = $matches[1]
      $value = $matches[2].Trim('"').Trim("'")
      if (-not (Test-Path "env:$name")) { Set-Item "env:$name" $value }
    }
  }
}

$env:CODEX_REMOTE_CONTACT_DATA_DIR = if ($env:CODEX_REMOTE_CONTACT_DATA_DIR) { $env:CODEX_REMOTE_CONTACT_DATA_DIR } else { Join-Path $projectDir "runtime/qq-only-data" }
$env:CODEX_REMOTE_CONTACT_QQ_ENABLED = if ($env:CODEX_REMOTE_CONTACT_QQ_ENABLED) { $env:CODEX_REMOTE_CONTACT_QQ_ENABLED } else { "1" }
$env:ONEBOT_API_BASE = if ($env:ONEBOT_API_BASE) { $env:ONEBOT_API_BASE } else { "http://127.0.0.1:3000" }

$nodeBin = $env:CODEX_REMOTE_CONTACT_NODE_PATH
if (-not $nodeBin -or -not (Test-Path $nodeBin)) {
  $nodeBin = (Get-Command node -ErrorAction SilentlyContinue).Source
}
if (-not $nodeBin -or -not (Test-Path $nodeBin)) {
  Write-Error "Node.js was not found. Set CODEX_REMOTE_CONTACT_NODE_PATH in config/qq-only.env."
  exit 1
}

# Refuse to start if port 3789 is already in use.
try {
  $inUse = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
    Where-Object { $_.Port -eq 3789 }
  if ($inUse) {
    Write-Error "Port 3789 is already in use; refusing to replace an existing process."
    exit 1
  }
} catch { }

Set-Location $projectDir
& $nodeBin src/server.js
