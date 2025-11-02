# Helper script to run multiple Electron dev instances with different ports and data directories
#
# Usage:
#   .\dev-instance.ps1 instance1 4927
#   .\dev-instance.ps1 instance2 4928

param(
    [string]$InstanceName = "default",
    [int]$Port = 4927
)

$UserDataDir = "$env:USERPROFILE\.superset-dev-$InstanceName"

Write-Host "🚀 Starting Superset instance: $InstanceName" -ForegroundColor Green
Write-Host "   Port: $Port" -ForegroundColor Cyan
Write-Host "   User Data: $UserDataDir" -ForegroundColor Cyan
Write-Host ""

$env:VITE_DEV_SERVER_PORT = $Port

# Pass user data directory to electron
bun dev -- --user-data-dir="$UserDataDir"
