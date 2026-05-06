# server-sync.ps1 - ERP Server Sync Script (PostgreSQL)

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$ErrorActionPreference = "Stop"
$projectRoot = "F:\erp-mes-system"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   MingSheng ERP v1.9.4 - Server Sync" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $projectRoot

# ========== (1/6) Git Pull ==========
Write-Host "[1/6] Pulling latest code..." -ForegroundColor Yellow
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Git pull failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Code pulled" -ForegroundColor Green

# ========== (2/6) Check .env ==========
Write-Host "[2/6] Checking .env..." -ForegroundColor Yellow
$envPath = Join-Path $projectRoot "backend\.env"
if (-not (Test-Path $envPath)) {
    Write-Host "[ERROR] backend\.env not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
$envContent = Get-Content $envPath -Raw
if ($envContent -notmatch "DB_PASSWORD=.+") {
    Write-Host "[ERROR] DB_PASSWORD not set in .env!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] .env check passed" -ForegroundColor Green

# ========== (3/6) Frontend deps ==========
Write-Host "[3/6] Installing frontend deps..." -ForegroundColor Yellow
Set-Location (Join-Path $projectRoot "frontend")
npm install

# ========== (4/6) Build frontend ==========
Write-Host "[4/6] Building frontend..." -ForegroundColor Yellow
npm run build
Set-Location $projectRoot

# ========== (5/6) Backend deps ==========
Write-Host "[5/6] Installing backend deps..." -ForegroundColor Yellow
Set-Location (Join-Path $projectRoot "backend")
npm install --production
Set-Location $projectRoot

# ========== (6/6) Restart ==========
Write-Host "[6/6] Restarting service..." -ForegroundColor Yellow
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    pm2 restart erp 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[INFO] PM2 process not found, creating..." -ForegroundColor Yellow
        Set-Location (Join-Path $projectRoot "backend")
        pm2 start server.js --name erp
        pm2 save
        Set-Location $projectRoot
    } else {
        pm2 save 2>$null
    }
} else {
    Write-Host "[INFO] PM2 not found, starting directly..." -ForegroundColor Yellow
    taskkill /F /IM node.exe 2>$null
    Set-Location (Join-Path $projectRoot "backend")
    Start-Process node -ArgumentList "server.js" -NoNewWindow
    Set-Location $projectRoot
}

# ========== Done ==========
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Sync Complete!" -ForegroundColor Green
Write-Host "   URL: https://msgy.asia:3198" -ForegroundColor Green
Write-Host "   Status: pm2 status" -ForegroundColor Green
Write-Host "   Logs: pm2 logs erp" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Read-Host "Press Enter to close"
