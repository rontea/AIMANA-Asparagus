param(
    [string]$ServiceName = "AIMANA",
    [string]$DisplayName = "AIMANA Service",
    [string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$NodeExe = "node.exe",
    [string]$NssmPath = "nssm.exe",
    [string]$AppPort = "3001"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command $NssmPath -ErrorAction SilentlyContinue)) {
    throw "nssm.exe was not found. Install NSSM first or pass -NssmPath with the full path."
}

Write-Host "Installing AIMANA Windows service '$ServiceName' from $AppRoot"

& $NssmPath install $ServiceName $NodeExe "index.js"
& $NssmPath set $ServiceName AppDirectory $AppRoot
& $NssmPath set $ServiceName DisplayName $DisplayName
& $NssmPath set $ServiceName Description "AIMANA Node.js backend and production frontend host"
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppEnvironmentExtra "PORT=$AppPort"

Write-Host "Service registered. Start it with: Start-Service $ServiceName"
