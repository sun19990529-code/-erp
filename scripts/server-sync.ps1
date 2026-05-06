# server-sync.ps1 - ERP Server Sync Script (PostgreSQL 鐗?
# 鍦ㄦ湇鍔℃満涓婅繍琛岋細鍏?git pull 鏈€鏂颁唬鐮?鈫?鏋勫缓鍓嶇 鈫?鏇存柊鍚庣渚濊禆 鈫?閲嶅惎鏈嶅姟

# Auto-elevate to admin if not already
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$ErrorActionPreference = "Stop"
$projectRoot = "F:\erp-mes-system"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   閾櫉ERP v1.9.4 - 鏈嶅姟鍣ㄤ竴閿悓姝? -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $projectRoot

# ========== (1/6) 鎷夊彇鏈€鏂颁唬鐮?==========
Write-Host "[1/6] 姝ｅ湪鎷夊彇鏈€鏂颁唬鐮?.." -ForegroundColor Yellow
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "[閿欒] Git pull 澶辫触锛佽妫€鏌ョ綉缁滄垨鏈湴鍐茬獊" -ForegroundColor Red
    Read-Host "鎸夊洖杞﹂€€鍑?
    exit 1
}
Write-Host "[鈭歖 浠ｇ爜鎷夊彇瀹屾垚" -ForegroundColor Green

# ========== (2/6) 妫€鏌?.env 閰嶇疆 ==========
Write-Host "[2/6] 妫€鏌?.env 閰嶇疆..." -ForegroundColor Yellow
$envPath = Join-Path $projectRoot "backend\.env"
if (-not (Test-Path $envPath)) {
    Write-Host "[璀﹀憡] 鏈壘鍒?backend\.env 鏂囦欢锛? -ForegroundColor Red
    Write-Host "璇锋牴鎹?backend\.env.example 鍒涘缓 .env 骞堕厤缃?PostgreSQL 杩炴帴淇℃伅" -ForegroundColor Red
    Read-Host "鎸夊洖杞﹂€€鍑?
    exit 1
}
# 妫€鏌ユ槸鍚﹂厤缃簡 PG 瀵嗙爜
$envContent = Get-Content $envPath -Raw
if ($envContent -notmatch "DB_PASSWORD=.+") {
    Write-Host "[璀﹀憡] .env 涓湭閰嶇疆 DB_PASSWORD锛岃琛ュ厖锛? -ForegroundColor Red
    Read-Host "鎸夊洖杞﹂€€鍑?
    exit 1
}
Write-Host "[鈭歖 .env 閰嶇疆妫€鏌ラ€氳繃" -ForegroundColor Green

# ========== (3/6) 瀹夎鍓嶇渚濊禆 ==========
Write-Host "[3/6] 瀹夎鍓嶇渚濊禆..." -ForegroundColor Yellow
Set-Location (Join-Path $projectRoot "frontend")
npm install

# ========== (4/6) 鏋勫缓鍓嶇 ==========
Write-Host "[4/6] 鏋勫缓鍓嶇..." -ForegroundColor Yellow
npm run build
Set-Location $projectRoot

# ========== (5/6) 鏇存柊鍚庣渚濊禆 ==========
Write-Host "[5/6] 鏇存柊鍚庣渚濊禆..." -ForegroundColor Yellow
Set-Location (Join-Path $projectRoot "backend")
npm install --production
Set-Location $projectRoot

# ========== (6/6) 閲嶅惎鏈嶅姟 ==========
Write-Host "[6/6] 閲嶅惎鏈嶅姟..." -ForegroundColor Yellow
pm2 restart erp 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[鎻愮ず] PM2 杩涚▼涓嶅瓨鍦紝姝ｅ湪鍒涘缓..." -ForegroundColor Yellow
    Set-Location (Join-Path $projectRoot "backend")
    pm2 start server.js --name erp
    pm2 save
    Set-Location $projectRoot
} else {
    pm2 save 2>$null
}

# ========== 瀹屾垚 ==========
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   鍚屾瀹屾垚锛? -ForegroundColor Green
Write-Host "   璁块棶鍦板潃: http://localhost:3198" -ForegroundColor Green
Write-Host "   鏌ョ湅鐘舵€? pm2 status" -ForegroundColor Green
Write-Host "   鏌ョ湅鏃ュ織: pm2 logs erp" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Read-Host "鎸夊洖杞﹀叧闂?


# fixed encoding
