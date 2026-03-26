# ============================================================
# Mingsheng ERP-MES Server Init Script (Run as Administrator)
# ============================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ERP-MES Server Init" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Please run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# --- 1. Install OpenSSH Server ---
Write-Host "[1/4] Installing OpenSSH Server..." -ForegroundColor Yellow
$sshCapability = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
if ($sshCapability.State -eq 'Installed') {
    Write-Host "[OK] OpenSSH Server already installed" -ForegroundColor Green
} else {
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
    Write-Host "[OK] OpenSSH Server installed" -ForegroundColor Green
}

# --- 2. Start SSH Service ---
Write-Host "[2/4] Starting SSH service..." -ForegroundColor Yellow
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
Write-Host "[OK] SSH service started (auto-start enabled)" -ForegroundColor Green

# --- 3. Firewall ---
Write-Host "[3/4] Configuring firewall..." -ForegroundColor Yellow
$existingRule = Get-NetFirewallRule -Name sshd -ErrorAction SilentlyContinue
if ($existingRule) {
    Write-Host "[OK] Firewall rule already exists" -ForegroundColor Green
} else {
    New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
    Write-Host "[OK] Firewall port 22 opened" -ForegroundColor Green
}

# --- 4. Install PM2 ---
Write-Host "[4/4] Installing PM2..." -ForegroundColor Yellow
$pm2Exists = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2Exists) {
    Write-Host "[OK] PM2 already installed" -ForegroundColor Green
} else {
    npm install -g pm2
    Write-Host "[OK] PM2 installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ALL DONE!" -ForegroundColor Green
Write-Host ""
Write-Host "  Test SSH from dev machine:" -ForegroundColor Gray
Write-Host "  ssh MSGY@msgy.asia ""echo OK""" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
