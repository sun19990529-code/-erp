# server-sync.ps1 - ERP Server Sync Script (PostgreSQL 版)
# 在服务机上运行：先 git pull 最新代码 → 构建前端 → 更新后端依赖 → 重启服务

# Auto-elevate to admin if not already
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$ErrorActionPreference = "Stop"
$projectRoot = "F:\erp-mes-system"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   铭晟ERP v1.9.0 - 服务器一键同步" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $projectRoot

# ========== (1/6) 拉取最新代码 ==========
Write-Host "[1/6] 正在拉取最新代码..." -ForegroundColor Yellow
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] Git pull 失败！请检查网络或本地冲突" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}
Write-Host "[√] 代码拉取完成" -ForegroundColor Green

# ========== (2/6) 检查 .env 配置 ==========
Write-Host "[2/6] 检查 .env 配置..." -ForegroundColor Yellow
$envPath = Join-Path $projectRoot "backend\.env"
if (-not (Test-Path $envPath)) {
    Write-Host "[警告] 未找到 backend\.env 文件！" -ForegroundColor Red
    Write-Host "请根据 backend\.env.example 创建 .env 并配置 PostgreSQL 连接信息" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}
# 检查是否配置了 PG 密码
$envContent = Get-Content $envPath -Raw
if ($envContent -notmatch "DB_PASSWORD=.+") {
    Write-Host "[警告] .env 中未配置 DB_PASSWORD，请补充！" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}
Write-Host "[√] .env 配置检查通过" -ForegroundColor Green

# ========== (3/6) 安装前端依赖 ==========
Write-Host "[3/6] 安装前端依赖..." -ForegroundColor Yellow
Set-Location (Join-Path $projectRoot "frontend")
npm install

# ========== (4/6) 构建前端 ==========
Write-Host "[4/6] 构建前端..." -ForegroundColor Yellow
npm run build
Set-Location $projectRoot

# ========== (5/6) 更新后端依赖 ==========
Write-Host "[5/6] 更新后端依赖..." -ForegroundColor Yellow
Set-Location (Join-Path $projectRoot "backend")
npm install --production
Set-Location $projectRoot

# ========== (6/6) 重启服务 ==========
Write-Host "[6/6] 重启服务..." -ForegroundColor Yellow
pm2 restart erp 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[提示] PM2 进程不存在，正在创建..." -ForegroundColor Yellow
    Set-Location (Join-Path $projectRoot "backend")
    pm2 start server.js --name erp
    pm2 save
    Set-Location $projectRoot
} else {
    pm2 save 2>$null
}

# ========== 完成 ==========
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   同步完成！" -ForegroundColor Green
Write-Host "   访问地址: http://localhost:3198" -ForegroundColor Green
Write-Host "   查看状态: pm2 status" -ForegroundColor Green
Write-Host "   查看日志: pm2 logs erp" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Read-Host "按回车关闭"


# fixed encoding
