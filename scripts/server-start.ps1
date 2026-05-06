# server-start.ps1 - ERP Server Start (Admin)

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$Host.UI.RawUI.WindowTitle = "MingSheng ERP v1.9.4"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   MingSheng ERP v1.9.4 - Server Start" -ForegroundColor Cyan
Write-Host "   Admin Mode | PostgreSQL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot
Set-Location ..

if (-not (Test-Path "frontend\dist")) {
    Write-Host "[ERROR] Frontend not built! Run npm run build in frontend/ first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path "backend\.env")) {
    Write-Host "[ERROR] backend\.env not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[Starting] Launching service..." -ForegroundColor Yellow

$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    pm2 stop erp 2>$null
    Set-Location backend
    pm2 start server.js --name erp
    pm2 save 2>$null
    Set-Location ..
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   Service started (PM2)" -ForegroundColor Green
    Write-Host "   URL: https://msgy.asia:3198" -ForegroundColor Green
    Write-Host "   Commands: pm2 status / pm2 logs erp" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "[INFO] PM2 not found, starting directly..." -ForegroundColor Yellow
    Write-Host "Press Ctrl+C to stop" -ForegroundColor Cyan
    Set-Location backend
    node server.js
    Set-Location ..
}

Read-Host "Press Enter to close"
