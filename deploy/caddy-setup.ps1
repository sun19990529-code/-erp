# caddy-setup.ps1 - Caddy reverse proxy setup (Windows Server)
# Run as Administrator on the server

# Auto-elevate
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$CaddyDir = "C:\Caddy"
$CaddyExe = "$CaddyDir\caddy.exe"
$CaddyfileSource = "$PSScriptRoot\Caddyfile"
$CaddyfileDest = "$CaddyDir\Caddyfile"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Caddy Reverse Proxy Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create directory
Write-Host "[1/5] Creating Caddy directory..." -ForegroundColor Yellow
if (-not (Test-Path $CaddyDir)) {
    New-Item -ItemType Directory -Path $CaddyDir -Force | Out-Null
}

# Step 2: Download Caddy
if (-not (Test-Path $CaddyExe)) {
    Write-Host "[2/5] Downloading Caddy..." -ForegroundColor Yellow
    $url = "https://caddyserver.com/api/download?os=windows&arch=amd64"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $CaddyExe -UseBasicParsing
        Write-Host "       Download complete!" -ForegroundColor Green
    } catch {
        Write-Host "       Auto download failed. Please download manually:" -ForegroundColor Red
        Write-Host "       https://caddyserver.com/download" -ForegroundColor Yellow
        Write-Host "       Get Windows amd64, rename to caddy.exe, put in $CaddyDir" -ForegroundColor Yellow
        Read-Host "Press Enter after done"
    }
} else {
    Write-Host "[2/5] Caddy already exists, skip download" -ForegroundColor Green
}

# Verify
if (-not (Test-Path $CaddyExe)) {
    Write-Host "[ERROR] caddy.exe not found, cannot continue" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$version = & $CaddyExe version 2>$null
Write-Host "       Caddy version: $version" -ForegroundColor Cyan

# Step 3: Copy Caddyfile
Write-Host "[3/5] Configuring Caddyfile..." -ForegroundColor Yellow
if (Test-Path $CaddyfileSource) {
    Copy-Item $CaddyfileSource $CaddyfileDest -Force
    Write-Host "       Copied Caddyfile to $CaddyfileDest" -ForegroundColor Green
} else {
    Write-Host "       $CaddyfileSource not found" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "       Current config:" -ForegroundColor Cyan
Get-Content $CaddyfileDest | ForEach-Object { Write-Host "       $_" -ForegroundColor Gray }

# Step 4: Firewall rules
Write-Host "[4/5] Configuring firewall..." -ForegroundColor Yellow
$rules = @(
    @{ Name = "Caddy HTTP (80)"; Port = 80 },
    @{ Name = "Caddy HTTPS (443)"; Port = 443 }
)
foreach ($rule in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Protocol TCP -LocalPort $rule.Port -Action Allow | Out-Null
        Write-Host "       Port $($rule.Port) opened" -ForegroundColor Green
    } else {
        Write-Host "       Port $($rule.Port) already open" -ForegroundColor Green
    }
}

# Step 5: Register Windows service
Write-Host "[5/5] Registering Windows service..." -ForegroundColor Yellow

$svc = Get-Service -Name caddy -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "       Stopping old service..." -ForegroundColor Yellow
    Stop-Service caddy -Force -ErrorAction SilentlyContinue
    & sc.exe delete caddy 2>$null
    Start-Sleep -Seconds 2
}

& sc.exe create caddy start= auto binPath= "`"$CaddyExe`" run --config `"$CaddyfileDest`" --adapter caddyfile" displayname= "Caddy Web Server"
& sc.exe description caddy "Caddy reverse proxy for ERP system"

Start-Service caddy -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

$svc = Get-Service -Name caddy -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   Setup complete!" -ForegroundColor Green
    Write-Host "   Caddy is running as Windows service" -ForegroundColor Green
    Write-Host "" -ForegroundColor Green
    Write-Host "   HTTP:  http://erp.msgy.asia" -ForegroundColor Green
    Write-Host "   HTTPS: https://erp.msgy.asia (auto SSL)" -ForegroundColor Green
    Write-Host "" -ForegroundColor Green
    Write-Host "   Commands:" -ForegroundColor Cyan
    Write-Host "     Restart: Restart-Service caddy" -ForegroundColor Gray
    Write-Host "     Stop:    Stop-Service caddy" -ForegroundColor Gray
    Write-Host "     Status:  Get-Service caddy" -ForegroundColor Gray
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[WARN] Service may have failed. Try running manually:" -ForegroundColor Yellow
    Write-Host "  cd $CaddyDir" -ForegroundColor Cyan
    Write-Host "  .\caddy.exe run --config Caddyfile --adapter caddyfile" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Common causes:" -ForegroundColor Yellow
    Write-Host "  1. Port 80/443 occupied by IIS or other apps" -ForegroundColor Gray
    Write-Host "  2. DNS for erp.msgy.asia not pointing to this server" -ForegroundColor Gray
    Write-Host "  3. ERP backend (port 3198) not running" -ForegroundColor Gray
}

Write-Host ""
Read-Host "Press Enter to close"
