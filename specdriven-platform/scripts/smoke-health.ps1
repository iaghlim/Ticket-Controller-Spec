# Smoke health + storage (API local ou prod).
# Uso: .\scripts\smoke-health.ps1 [-ApiUrl http://localhost:3000]

param(
  [string]$ApiUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

try {
  $res = Invoke-RestMethod -Uri "$ApiUrl/health" -Method Get -TimeoutSec 15
} catch {
  Write-Host "Falha ao chamar $ApiUrl/health — API está rodando?" -ForegroundColor Red
  exit 1
}

Write-Host "status: $($res.status)"
Write-Host "checks: $($res.checks | ConvertTo-Json -Compress)"

if ($res.status -eq "error") { exit 1 }
if ($res.checks.database -ne "ok") { exit 1 }

Write-Host "Smoke health OK." -ForegroundColor Green
