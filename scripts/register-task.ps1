# ==============================================================
# register-task.ps1 -- Register/update the ADNOC FM Monitor
# daily sync task in Windows Task Scheduler.
#
# Default schedule: 12:00 AM local machine time, daily.
#
# Usage (from any shell):
#   powershell.exe -File scripts/register-task.ps1
#   powershell.exe -File scripts/register-task.ps1 -Time "23:30"
#   powershell.exe -File scripts/register-task.ps1 -Unregister
#
# Notes:
#   - Self-elevates if not running as admin.
#   - Default "run only when user is logged in" (no password prompt).
#   - Uses schtasks.exe (stable, no module dependency).
# ==============================================================
param(
    [string]$Time = "00:00",
    [switch]$Unregister
)

$TaskName = "ADNOC FM Monitor Daily Sync"

# --- Self-elevate if not admin ---
$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requires admin privileges -- relaunching with elevation..."
    $argsList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath)
    if ($Time -ne "00:00") { $argsList += @("-Time", $Time) }
    if ($Unregister)        { $argsList += "-Unregister" }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argsList
    exit
}

# --- Unregister path ---
if ($Unregister) {
    Write-Host "Removing scheduled task: $TaskName"
    & schtasks.exe /Delete /TN $TaskName /F
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nTask removed successfully." -ForegroundColor Green
    } else {
        Write-Host "`nTask removal failed (task may not exist)." -ForegroundColor Yellow
    }
    Read-Host "`nPress Enter to close"
    exit
}

# --- Validate time format ---
if ($Time -notmatch '^\d{2}:\d{2}$') {
    Write-Host "ERROR: -Time must be HH:MM format (e.g., 00:00)" -ForegroundColor Red
    exit 1
}

# --- Resolve path to sync-scheduled.bat ---
$ScriptDir = Split-Path -Parent $PSCommandPath
$BatFile = Join-Path $ScriptDir "sync-scheduled.bat"
if (-not (Test-Path $BatFile)) {
    Write-Host "ERROR: sync-scheduled.bat not found at $BatFile" -ForegroundColor Red
    exit 1
}

Write-Host "============================================================"
Write-Host "  Registering: $TaskName"
Write-Host "  Command:     $BatFile"
Write-Host "  Schedule:    Daily at $Time (local machine time)"
Write-Host "============================================================"

# --- Create/update the task (via ScheduledTasks module) ---
# Uses PowerShell cmdlets (not schtasks.exe) because schtasks lacks flags
# for battery/wake settings. Without these overrides, the default
# "DisallowStartIfOnBatteries=true" prevents the task from firing on
# a laptop running on battery at midnight.
try {
    $action    = New-ScheduledTaskAction -Execute $BatFile
    $trigger   = New-ScheduledTaskTrigger -Daily -At $Time
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME `
                    -LogonType Interactive -RunLevel Highest
    $settings  = New-ScheduledTaskSettingsSet `
                    -AllowStartIfOnBatteries `
                    -DontStopIfGoingOnBatteries `
                    -WakeToRun `
                    -StartWhenAvailable `
                    -ExecutionTimeLimit (New-TimeSpan -Hours 4)

    Register-ScheduledTask -TaskName $TaskName `
                    -Action $action -Trigger $trigger `
                    -Principal $principal -Settings $settings `
                    -Force | Out-Null
} catch {
    Write-Host "`nTask registration FAILED: $_" -ForegroundColor Red
    Read-Host "`nPress Enter to close"
    exit 1
}

Write-Host "`nTask registered successfully." -ForegroundColor Green
Write-Host "  Battery-safe:   allows start on battery, continues on unplug" -ForegroundColor Gray
Write-Host "  Wake-capable:   wakes laptop from sleep at scheduled time" -ForegroundColor Gray
Write-Host "  Catch-up:       runs ASAP if missed (e.g., laptop was off)" -ForegroundColor Gray

# --- Verify ---
Write-Host "`n--- Verification ---"
& schtasks.exe /Query /TN $TaskName /V /FO LIST | Select-String -Pattern "TaskName|Next Run Time|Start Time|Schedule:|Run As User|Status"

Write-Host "`nTo trigger manually:  schtasks /Run /TN `"$TaskName`""
Write-Host "To unregister:        powershell -File scripts/register-task.ps1 -Unregister"

Read-Host "`nPress Enter to close"
