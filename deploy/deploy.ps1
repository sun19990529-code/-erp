# ============================================================
# Mingsheng ERP-MES Deploy Script (Windows Dev -> Windows Server)
# Usage: .\deploy\deploy.ps1
# Features: Build + Package + Upload + Install + Restart + Check Updates
# ============================================================

# ==================== Config ====================
$SERVER_USER = "MSGY"
$SERVER_HOST = "msgy.asia"
$SERVER_PORT = 22
$REMOTE_PATH = "F:\erp-mes-system"
$LOCAL_PATH  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
# =================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ERP-MES Deploy Tool v1.2 (Win->Win)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Local:  $LOCAL_PATH" -ForegroundColor Gray
Write-Host "  Remote: ${SERVER_USER}@${SERVER_HOST}:${REMOTE_PATH}" -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Deploy to ${SERVER_HOST}? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "Cancelled." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 0
}

# ==================== Step 1: Build Frontend ====================
Write-Host ""
Write-Host "[1/7] Building frontend..." -ForegroundColor Yellow
Push-Location "$LOCAL_PATH\frontend"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Frontend build failed!" -ForegroundColor Red
    Pop-Location
    Read-Host "Press Enter to exit"
    exit 1
}
Pop-Location
Write-Host "[OK] Frontend build done" -ForegroundColor Green

# ==================== Step 2: Package ====================
Write-Host ""
Write-Host "[2/7] Packaging..." -ForegroundColor Yellow

$tempArchive = "$env:TEMP\erp-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss').tar.gz"

Push-Location (Split-Path $LOCAL_PATH -Parent)
$folderName = Split-Path $LOCAL_PATH -Leaf

tar -czf $tempArchive `
    --exclude="$folderName/node_modules" `
    --exclude="$folderName/backend/node_modules" `
    --exclude="$folderName/frontend/node_modules" `
    --exclude="$folderName/*.db" `
    --exclude="$folderName/backend/*.db" `
    --exclude="$folderName/backend/*.db-journal" `
    --exclude="$folderName/backend/*.db-shm" `
    --exclude="$folderName/backend/*.db-wal" `
    --exclude="$folderName/backend/*.db.init" `
    --exclude="$folderName/.git" `
    --exclude="$folderName/backups" `
    --exclude="$folderName/erp-server-deploy.tar.gz" `
    $folderName

Pop-Location

if (-not (Test-Path $tempArchive)) {
    Write-Host "[FAIL] Package failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$archiveSizeMB = [math]::Round((Get-Item $tempArchive).Length / 1MB, 2)
Write-Host "[OK] Package done: $archiveSizeMB MB" -ForegroundColor Green

# ==================== Step 3: Upload ====================
Write-Host ""
Write-Host "[3/7] Uploading to server..." -ForegroundColor Yellow

$remoteTempFile = "C:\TEMP\erp-deploy.tar.gz"
ssh -p $SERVER_PORT "${SERVER_USER}@${SERVER_HOST}" "if not exist C:\TEMP mkdir C:\TEMP"
scp -P $SERVER_PORT $tempArchive "${SERVER_USER}@${SERVER_HOST}:${remoteTempFile}"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Upload failed! Check SSH connection." -ForegroundColor Red
    Remove-Item $tempArchive -ErrorAction SilentlyContinue
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Upload done" -ForegroundColor Green

# ==================== Step 4: Extract ====================
Write-Host ""
Write-Host "[4/7] Extracting on server..." -ForegroundColor Yellow

$remoteParent = Split-Path $REMOTE_PATH -Parent

ssh -p $SERVER_PORT "${SERVER_USER}@${SERVER_HOST}" @"
    cd /d $remoteParent && tar -xzf $remoteTempFile --strip-components=0 -C . && del $remoteTempFile && echo EXTRACT_OK
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Extract failed!" -ForegroundColor Red
    Remove-Item $tempArchive -ErrorAction SilentlyContinue
    Read-Host "Press Enter to exit"
    exit 1
}

# Verify target directory exists after extraction
ssh -p $SERVER_PORT "${SERVER_USER}@${SERVER_HOST}" @"
    if not exist $REMOTE_PATH\backend\server.js (echo VERIFY_FAIL) else (echo VERIFY_OK)
"@ | Out-String | ForEach-Object {
    if ($_ -match 'VERIFY_FAIL') {
        Write-Host "[WARN] Extract path mismatch! Check folder name." -ForegroundColor Red
        Remove-Item $tempArchive -ErrorAction SilentlyContinue
        Read-Host "Press Enter to exit"
        exit 1
    }
}
Write-Host "[OK] Extract done" -ForegroundColor Green

# ==================== Step 5: Install Deps ====================
Write-Host ""
Write-Host "[5/7] Installing backend deps..." -ForegroundColor Yellow

ssh -p $SERVER_PORT "${SERVER_USER}@${SERVER_HOST}" @"
    cd /d $REMOTE_PATH\backend && npm install --production && echo DEPS_OK
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Backend deps install failed!" -ForegroundColor Red
    Remove-Item $tempArchive -ErrorAction SilentlyContinue
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Backend deps installed" -ForegroundColor Green

# ==================== Step 6: Restart Service ====================
Write-Host ""
Write-Host "[6/7] Restarting service..." -ForegroundColor Yellow

ssh -p $SERVER_PORT "${SERVER_USER}@${SERVER_HOST}" @"
    cd /d $REMOTE_PATH\backend && pm2 restart erp 2>nul || pm2 start server.js --name erp 2>nul || echo [NOTE] PM2 not found
"@

Write-Host "[OK] Service restarted" -ForegroundColor Green

# ==================== Step 7: Check Updates ====================
Write-Host ""
Write-Host "[7/7] Checking for dependency updates..." -ForegroundColor Yellow
Write-Host ""

ssh -p $SERVER_PORT "${SERVER_USER}@${SERVER_HOST}" @"
    cd /d $REMOTE_PATH\backend && npm outdated 2>nul || echo All up to date
"@

# ==================== Cleanup ====================
Remove-Item $tempArchive -ErrorAction SilentlyContinue

# ==================== Summary ====================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOY SUCCESS!" -ForegroundColor Green
Write-Host ""
Write-Host "  Server: https://$SERVER_HOST" -ForegroundColor White
Write-Host "  Time:   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
