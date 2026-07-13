# Valida pre-requisitos go-live P0 (local).
# Uso: .\scripts\validate-go-live.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$fail = 0

function Check {
  param([string]$Name, [bool]$Ok, [string]$Hint = "")
  if ($Ok) {
    Write-Host "[ok] $Name" -ForegroundColor Green
  } else {
    Write-Host "[!!] $Name - $Hint" -ForegroundColor Yellow
    $script:fail++
  }
}

$gitignoreOk = $false
if (Test-Path ".gitignore") {
  $lines = Get-Content ".gitignore"
  $gitignoreOk = $lines -contains ".env"
}
Check ".gitignore bloqueia .env" $gitignoreOk "adicione .env ao .gitignore"

Check ".env.production.example existe" (Test-Path ".env.production.example") ""

if (Test-Path ".env") {
  $envText = Get-Content ".env" -Raw
  Check "JWT_SECRET definido" ($envText -match 'JWT_SECRET=.{8,}') "gere JWT_SECRET com 32+ chars"
  Check "MAIL_PROVIDER=smtp" ($envText -match 'MAIL_PROVIDER=smtp') "configure Brevo SMTP"
  Check "SMTP_HOST definido" ($envText -match 'SMTP_HOST=\S+') "smtp-relay.brevo.com"
} else {
  Check ".env local presente" $false "cp .env.example .env"
}

Check "docker-compose.prod.yml" (Test-Path "docker-compose.prod.yml") ""
Check "deploy-prod.sh" (Test-Path "scripts/deploy-prod.sh") ""
Check "minio-init.sh" (Test-Path "docker/minio-init.sh") ""
Check "go-live-checklist.md" (Test-Path "../docs/go-live-checklist.md") ""

Write-Host ""
if ($fail -eq 0) {
  Write-Host "Validacao P0 OK." -ForegroundColor Green
} else {
  Write-Host "$fail item(ns) pendente(s). Ver docs/go-live-checklist.md" -ForegroundColor Yellow
  exit 1
}
