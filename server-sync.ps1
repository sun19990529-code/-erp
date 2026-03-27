# server-sync.ps1 - ERP Server Sync Script
# Run this on the server after code is pushed to GitHub

Write-Host "========== ERP Server Sync ==========" -ForegroundColor Cyan

Set-Location F:\erp-mes-system

Write-Host "(1/5) Pulling latest code..." -ForegroundColor Yellow
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Pull failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "(2/5) Installing frontend deps..." -ForegroundColor Yellow
Set-Location frontend
npm install

Write-Host "(3/5) Building frontend..." -ForegroundColor Yellow
npm run build
Set-Location ..

Write-Host "(4/5) Updating backend deps..." -ForegroundColor Yellow
Set-Location backend
npm install --production
Set-Location ..

Write-Host "(5/5) Restarting service..." -ForegroundColor Yellow

# Stop old node processes running server.js
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cmdLine -match "server\.js") {
        Write-Host "  Stopping old process (PID: $($_.Id))..." -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force
    }
}
Start-Sleep -Seconds 1

# Start node in background (no PM2 needed)
Set-Location F:\erp-mes-system\backend
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory "F:\erp-mes-system\backend" -WindowStyle Hidden
Set-Location ..

Write-Host ""
Write-Host "Sync complete! http://localhost:3198" -ForegroundColor Green
Read-Host "Press Enter to close"
