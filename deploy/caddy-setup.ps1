# caddy-setup.ps1 - Caddy 反向代理一键安装（Windows服务器）
# 在服务器上以管理员身份运行

# 自动提权
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$CaddyDir = "C:\Caddy"
$CaddyExe = "$CaddyDir\caddy.exe"
$CaddyfileSource = "$PSScriptRoot\Caddyfile"
$CaddyfileDest = "$CaddyDir\Caddyfile"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Caddy 反向代理安装程序" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ========================================
# 步骤1: 创建目录
# ========================================
Write-Host "[1/5] 创建 Caddy 目录..." -ForegroundColor Yellow
if (-not (Test-Path $CaddyDir)) {
    New-Item -ItemType Directory -Path $CaddyDir -Force | Out-Null
}

# ========================================
# 步骤2: 下载 Caddy
# ========================================
if (-not (Test-Path $CaddyExe)) {
    Write-Host "[2/5] 下载 Caddy..." -ForegroundColor Yellow
    $url = "https://caddyserver.com/api/download?os=windows&arch=amd64"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $CaddyExe -UseBasicParsing
        Write-Host "       下载完成!" -ForegroundColor Green
    } catch {
        Write-Host "       自动下载失败，请手动下载:" -ForegroundColor Red
        Write-Host "       https://caddyserver.com/download" -ForegroundColor Yellow
        Write-Host "       下载 Windows amd64 版本，重命名为 caddy.exe 放到 $CaddyDir" -ForegroundColor Yellow
        Read-Host "放好后按回车继续"
    }
} else {
    Write-Host "[2/5] Caddy 已存在，跳过下载 √" -ForegroundColor Green
}

# 验证
if (-not (Test-Path $CaddyExe)) {
    Write-Host "[错误] caddy.exe 不存在，无法继续" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

$version = & $CaddyExe version 2>$null
Write-Host "       Caddy 版本: $version" -ForegroundColor Cyan

# ========================================
# 步骤3: 复制 Caddyfile
# ========================================
Write-Host "[3/5] 配置 Caddyfile..." -ForegroundColor Yellow
if (Test-Path $CaddyfileSource) {
    Copy-Item $CaddyfileSource $CaddyfileDest -Force
    Write-Host "       已复制 Caddyfile 到 $CaddyfileDest" -ForegroundColor Green
} else {
    Write-Host "       未找到 $CaddyfileSource" -ForegroundColor Red
    Write-Host "       请手动创建 $CaddyfileDest" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
}

Write-Host "       当前配置内容:" -ForegroundColor Cyan
Get-Content $CaddyfileDest | ForEach-Object { Write-Host "       $_" -ForegroundColor Gray }

# ========================================
# 步骤4: 防火墙放行 80/443
# ========================================
Write-Host "[4/5] 配置防火墙..." -ForegroundColor Yellow
$rules = @(
    @{ Name = "Caddy HTTP (80)"; Port = 80 },
    @{ Name = "Caddy HTTPS (443)"; Port = 443 }
)
foreach ($rule in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Protocol TCP -LocalPort $rule.Port -Action Allow | Out-Null
        Write-Host "       已放行端口 $($rule.Port)" -ForegroundColor Green
    } else {
        Write-Host "       端口 $($rule.Port) 已放行 √" -ForegroundColor Green
    }
}

# ========================================
# 步骤5: 注册为 Windows 服务
# ========================================
Write-Host "[5/5] 注册 Windows 服务..." -ForegroundColor Yellow

# 先停止和删除旧服务
$svc = Get-Service -Name caddy -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "       停止旧服务..." -ForegroundColor Yellow
    Stop-Service caddy -Force -ErrorAction SilentlyContinue
    & sc.exe delete caddy 2>$null
    Start-Sleep -Seconds 2
}

# 用 sc.exe 创建服务
& sc.exe create caddy start= auto binPath= "`"$CaddyExe`" run --config `"$CaddyfileDest`" --adapter caddyfile" displayname= "Caddy Web Server"
& sc.exe description caddy "Caddy reverse proxy for ERP system"

# 启动服务
Start-Service caddy -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

$svc = Get-Service -Name caddy -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   安装完成!" -ForegroundColor Green
    Write-Host "   Caddy 已作为 Windows 服务运行" -ForegroundColor Green
    Write-Host "" -ForegroundColor Green
    Write-Host "   HTTP:  http://erp.msgy.asia" -ForegroundColor Green
    Write-Host "   HTTPS: https://erp.msgy.asia (自动申请证书)" -ForegroundColor Green
    Write-Host "" -ForegroundColor Green
    Write-Host "   管理命令:" -ForegroundColor Cyan
    Write-Host "     重启: Restart-Service caddy" -ForegroundColor Gray
    Write-Host "     停止: Stop-Service caddy" -ForegroundColor Gray
    Write-Host "     状态: Get-Service caddy" -ForegroundColor Gray
    Write-Host "     日志: caddy.exe log --config $CaddyfileDest" -ForegroundColor Gray
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[警告] 服务启动可能失败，尝试前台运行诊断:" -ForegroundColor Yellow
    Write-Host "  cd $CaddyDir" -ForegroundColor Cyan
    Write-Host "  .\caddy.exe run --config Caddyfile --adapter caddyfile" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "常见原因:" -ForegroundColor Yellow
    Write-Host "  1. 80/443 端口被 IIS 或其他程序占用" -ForegroundColor Gray
    Write-Host "  2. 域名 DNS 未指向本服务器 IP" -ForegroundColor Gray
    Write-Host "  3. ERP 后端服务(3198)未启动" -ForegroundColor Gray
}

Write-Host ""
Read-Host "按回车关闭"
