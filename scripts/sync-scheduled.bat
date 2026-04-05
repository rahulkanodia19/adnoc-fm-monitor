@echo off
REM ==============================================================
REM sync-scheduled.bat — Windows Task Scheduler wrapper
REM
REM Runs the master sync and logs output.
REM Schedule this via Task Scheduler at 12:00 AM local machine time daily.
REM Register with: powershell.exe -File scripts\register-task.ps1
REM ==============================================================

cd /d C:\Users\rahul\Documents\adnoc-fm-monitor
"C:\Program Files\Git\bin\bash.exe" -c "bash scripts/master-sync.sh 2>&1 | tee sync-log-master.txt"
