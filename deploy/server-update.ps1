# ============================================================
# Mingsheng ERP-MES Server Update Script (Run on Server)
# Usage: .\deploy\server-update.ps1
#        .\deploy\server-update.ps1 --build   (force rebuild frontend)
# ============================================================

$ErrorActionPreference = "Stop"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_DIR = Split-Path -Parent $SCRIPT_DIR

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ERP-MES Server Update" -ForegroundColor Cyan
Write-Host "  Path: $PROJECT_DIR" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Backend deps ---
Write-Host "[1/3] Installing backend deps..." -ForegroundColor Yellow
Push-Location "$PROJECT_DIR\backend"
npm install --production
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Backend deps install failed!" -ForegroundColor Red
    Pop-Location
    Read-Host "Press Enter to exit"
    exit 1
}
Pop-Location
Write-Host "[OK] Backend deps ready" -ForegroundColor Green

# --- Frontend build ---
Write-Host ""
$distPath = "$PROJECT_DIR\frontend\dist"
$needBuild = $args -contains "--build"

if ($needBuild -or -not (Test-Path $distPath)) {
    Write-Host "[2/3] Building frontend..." -ForegroundColor Yellow
    Push-Location "$PROJECT_DIR\frontend"
    npm install
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] Frontend build failed!" -ForegroundColor Red
        Pop-Location
        Read-Host "Press Enter to exit"
        exit 1
    }
    Pop-Location
    Write-Host "[OK] Frontend build done" -ForegroundColor Green
} else {
    Write-Host "[2/3] Frontend dist exists, skipped (use --build to force)" -ForegroundColor Gray
}

# --- Restart ---
Write-Host ""
Write-Host "[3/3] Restarting service..." -ForegroundColor Yellow

$pm2Exists = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2Exists) {
    Push-Location "$PROJECT_DIR\backend"
    $pm2List = pm2 jlist 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
    $erpProcess = $pm2List | Where-Object { $_.name -eq 'erp' }

    if ($erpProcess) {
        pm2 restart erp
        Write-Host "[OK] PM2 restarted" -ForegroundColor Green
    } else {
        pm2 start server.js --name erp
        Write-Host "[OK] PM2 first start done" -ForegroundColor Green
    }
    pm2 save
    Pop-Location
} else {
    Write-Host "[!] PM2 not found" -ForegroundColor Yellow
    Write-Host "    Install: npm install -g pm2" -ForegroundColor Gray
    Write-Host ""

    $startNow = Read-Host "Start directly now? (y/N)"
    if ($startNow -eq 'y' -or $startNow -eq 'Y') {
        Start-Process -NoNewWindow -FilePath "node" -ArgumentList "server.js" -WorkingDirectory "$PROJECT_DIR\backend"
        Write-Host "[OK] Service started" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  UPDATE DONE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
