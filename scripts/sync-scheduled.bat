@echo off
REM ==============================================================
REM sync-scheduled.bat — Windows Task Scheduler wrapper
REM
REM Runs the master sync and logs output.
REM Schedule this via Task Scheduler at 11:00 PM UAE time daily.
REM ==============================================================

cd /d C:\Users\rahul\Documents\adnoc-fm-monitor
"C:\Program Files\Git\bin\bash.exe" -c "bash scripts/master-sync.sh 2>&1 | tee sync-log-master.txt"
