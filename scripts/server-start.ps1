# server-start.ps1 - 閾櫉ERP鏈嶅姟鍣ㄥ惎鍔紙绠＄悊鍛橈級

# 鑷姩鎻愭潈涓虹鐞嗗憳
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$Host.UI.RawUI.WindowTitle = "閾櫉ERP绠＄悊绯荤粺 v1.9.4"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   閾櫉ERP绠＄悊绯荤粺 v1.9.4 - 鏈嶅姟鍣ㄥ惎鍔? -ForegroundColor Cyan
Write-Host "   绠＄悊鍛樻ā寮?| PostgreSQL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

# 妫€鏌ュ墠绔槸鍚﹀凡鏋勫缓
if (-not (Test-Path "frontend\dist")) {
    Write-Host "[鎻愮ず] 鍓嶇鏈瀯寤猴紝璇峰厛杩愯 install.bat 鎴栨墜鍔ㄦ墽琛?npm run build" -ForegroundColor Red
    Read-Host "鎸夊洖杞﹂€€鍑?
    exit 1
}

# 妫€鏌?.env 鏄惁瀛樺湪
if (-not (Test-Path "backend\.env")) {
    Write-Host "[鎻愮ず] 鏈壘鍒?backend\.env 閰嶇疆鏂囦欢锛? -ForegroundColor Red
    Write-Host "璇峰弬鑰?backend\.env.example 鍒涘缓 .env 骞堕厤缃?PostgreSQL 杩炴帴淇℃伅" -ForegroundColor Red
    Read-Host "鎸夊洖杞﹂€€鍑?
    exit 1
}

# 鍚姩鏈嶅姟
Write-Host "[鍚姩] 姝ｅ湪鍚姩鏈嶅姟..." -ForegroundColor Yellow

$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    pm2 stop erp 2>$null
    Set-Location backend
    pm2 start server.js --name erp
    pm2 save 2>$null
    Set-Location ..
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   鏈嶅姟宸插惎鍔紙PM2 鎵樼锛? -ForegroundColor Green
    Write-Host "   璁块棶鍦板潃: http://localhost:3198" -ForegroundColor Green
    Write-Host "   绠＄悊鍛戒护: pm2 status / pm2 logs erp" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "[鎻愮ず] 鏈娴嬪埌PM2锛屼娇鐢ㄧ洿鎺ュ惎鍔ㄦā寮? -ForegroundColor Yellow
    Write-Host "[鎻愮ず] 寤鸿瀹夎PM2: npm install -g pm2" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "鍚姩鏈嶅姟: http://localhost:3198" -ForegroundColor Cyan
    Write-Host "鎸?Ctrl+C 鍋滄鏈嶅姟" -ForegroundColor Cyan
    Start-Process "http://localhost:3198"
    Set-Location backend
    node server.js
    Set-Location ..
}

Read-Host "鎸夊洖杞﹀叧闂?
# fixed encoding
