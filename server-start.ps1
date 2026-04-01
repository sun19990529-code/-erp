# server-start.ps1 - 铭晟ERP服务器启动（管理员）

# 自动提权为管理员
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$Host.UI.RawUI.WindowTitle = "铭晟ERP管理系统 v1.8.1"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   铭晟ERP管理系统 v1.8.1 - 服务器启动" -ForegroundColor Cyan
Write-Host "   管理员模式 | PostgreSQL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

# 检查前端是否已构建
if (-not (Test-Path "frontend\dist")) {
    Write-Host "[提示] 前端未构建，请先运行 install.bat 或手动执行 npm run build" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

# 检查 .env 是否存在
if (-not (Test-Path "backend\.env")) {
    Write-Host "[提示] 未找到 backend\.env 配置文件！" -ForegroundColor Red
    Write-Host "请参考 backend\.env.example 创建 .env 并配置 PostgreSQL 连接信息" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

# 启动服务
Write-Host "[启动] 正在启动服务..." -ForegroundColor Yellow

$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    pm2 stop erp 2>$null
    Set-Location backend
    pm2 start server.js --name erp
    pm2 save 2>$null
    Set-Location ..
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   服务已启动（PM2 托管）" -ForegroundColor Green
    Write-Host "   访问地址: http://localhost:3198" -ForegroundColor Green
    Write-Host "   管理命令: pm2 status / pm2 logs erp" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "[提示] 未检测到PM2，使用直接启动模式" -ForegroundColor Yellow
    Write-Host "[提示] 建议安装PM2: npm install -g pm2" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "启动服务: http://localhost:3198" -ForegroundColor Cyan
    Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Cyan
    Start-Process "http://localhost:3198"
    Set-Location backend
    node server.js
    Set-Location ..
}

Read-Host "按回车关闭"