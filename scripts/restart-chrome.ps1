# Kill ALL chrome processes
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Confirm they're dead
$procs = Get-Process chrome -ErrorAction SilentlyContinue
if ($procs) {
    Write-Output "Still $($procs.Count) processes, killing harder..."
    $procs | Stop-Process -Force
    Start-Sleep -Seconds 2
}

Write-Output "All Chrome killed. Launching with debugging..."

# Launch with debugging flag
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --remote-debugging-port=9222 --restore-last-session &
Start-Sleep -Seconds 6

# Check
$result = netstat -an | Select-String "9222" | Select-String "LISTENING"
if ($result) {
    Write-Output "SUCCESS: Port 9222 is listening"
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json/version' -UseBasicParsing
    Write-Output $resp.Content
} else {
    Write-Output "FAILED: Port 9222 not listening"
    netstat -an | Select-String "922"
}
