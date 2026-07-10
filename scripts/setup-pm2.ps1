# setup-pm2.ps1
# Run this ONCE on the office machine to install PM2 and register the sync daemon.
# It will auto-start on every Windows reboot, no manual steps needed after this.
#
# How to run:
#   Right-click PowerShell -> "Run as Administrator", then:
#   cd C:\path\to\Ebrigth_OSC_fresh
#   .\scripts\setup-pm2.ps1

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

$ProjectDir = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Ebright Scanner Sync — PM2 Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Node is available ────────────────────────────────────────────────
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVer = node --version
    Write-Host "      Node.js $nodeVer found." -ForegroundColor Green
} catch {
    Write-Host "      ERROR: Node.js not found. Install it from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# ── 2. Install PM2 globally ───────────────────────────────────────────────────
Write-Host "[2/5] Installing PM2 globally..." -ForegroundColor Yellow
npm install -g pm2
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERROR: npm install -g pm2 failed." -ForegroundColor Red
    exit 1
}
Write-Host "      PM2 installed." -ForegroundColor Green

# ── 3. Stop any existing instance (safe to fail if not running) ───────────────
Write-Host "[3/5] Removing any existing ebright-sync process..." -ForegroundColor Yellow
pm2 delete ebright-sync 2>$null
Write-Host "      Done (ignore 'not found' errors above)." -ForegroundColor Green

# ── 4. Start the daemon ───────────────────────────────────────────────────────
Write-Host "[4/5] Starting sync daemon..." -ForegroundColor Yellow
Set-Location $ProjectDir
pm2 start "npx tsx scripts/sync-daemon.ts" --name ebright-sync --interpreter none
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERROR: pm2 start failed." -ForegroundColor Red
    exit 1
}
pm2 save
Write-Host "      Daemon started and saved." -ForegroundColor Green

# ── 5. Register PM2 for auto-start on Windows reboot ─────────────────────────
Write-Host "[5/5] Registering auto-start on Windows boot..." -ForegroundColor Yellow
$startupOutput = pm2 startup | Out-String
Write-Host $startupOutput

# PM2 on Windows outputs a command to run — try to run it automatically
$autoCmd = ($startupOutput -split "`n") | Where-Object { $_ -match 'pm2-startup' -or $_ -match 'Set-ExecutionPolicy' } | Select-Object -First 1
if ($autoCmd) {
    Write-Host "      Running: $autoCmd" -ForegroundColor Yellow
    Invoke-Expression $autoCmd.Trim()
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  The scanner sync daemon is now running" -ForegroundColor White
Write-Host "  and will restart automatically on reboot." -ForegroundColor White
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor White
Write-Host "    pm2 status           - check if daemon is running" -ForegroundColor Gray
Write-Host "    pm2 logs ebright-sync - view live logs" -ForegroundColor Gray
Write-Host "    pm2 restart ebright-sync - restart after code changes" -ForegroundColor Gray
Write-Host "    pm2 stop ebright-sync    - stop temporarily" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
