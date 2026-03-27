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
pm2 restart erp 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  PM2 restart failed, cleaning up..." -ForegroundColor Yellow
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force "$env:USERPROFILE\.pm2" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Set-Location F:\erp-mes-system\backend
    pm2 start server.js --name erp
    pm2 save
    Set-Location ..
}

Write-Host ""
Write-Host "Sync complete! http://localhost:3198" -ForegroundColor Green
Read-Host "Press Enter to close"
