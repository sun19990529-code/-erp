# server-sync.ps1 - ERP Server Sync Script
# Run this on the server after code is pushed to GitHub

# Auto-elevate to admin if not already
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

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

# Stop any running node server
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Try PM2 first
$pm2OK = $true
try {
    Remove-Item -Recurse -Force "$env:USERPROFILE\.pm2" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Set-Location F:\erp-mes-system\backend
    pm2 start server.js --name erp 2>$null
    if ($LASTEXITCODE -ne 0) { $pm2OK = $false }
    else { pm2 save 2>$null }
    Set-Location ..
} catch {
    $pm2OK = $false
}

# Fallback: start node directly
if (-not $pm2OK) {
    Write-Host "  PM2 unavailable, starting node directly..." -ForegroundColor Yellow
    Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory "F:\erp-mes-system\backend" -WindowStyle Hidden
}

Write-Host ""
Write-Host "Sync complete! http://localhost:3198" -ForegroundColor Green
Read-Host "Press Enter to close"
