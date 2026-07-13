# Zera Docker local (Postgres + MinIO + Mailpit) e cria só usuário master.
# Uso: .\scripts\reset-local.ps1
# Opcional no .env: MASTER_EMAIL, MASTER_PASSWORD, MASTER_NAME, ORG_NAME

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> Parando containers e removendo volumes..." -ForegroundColor Cyan
docker compose down -v --remove-orphans

Write-Host "==> Subindo stack limpa..." -ForegroundColor Cyan
docker compose up -d

Write-Host "==> Aguardando Postgres..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(60)
do {
  $ok = docker compose exec -T postgres pg_isready -U specdriven -d specdriven 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  if ((Get-Date) -gt $deadline) {
    Write-Host "Postgres nao ficou pronto a tempo." -ForegroundColor Red
    exit 1
  }
  Start-Sleep -Seconds 2
} while ($true)

Write-Host "==> Schema (db push — banco local limpo)..." -ForegroundColor Cyan
npm run db:push

Write-Host "==> MinIO bucket..." -ForegroundColor Cyan
docker run --rm --network specdriven-platform_default `
  -e S3_ENDPOINT=http://minio:9000 `
  -e S3_ACCESS_KEY_ID=minioadmin `
  -e S3_SECRET_ACCESS_KEY=minioadmin `
  -e S3_BUCKET=specdriven `
  -v "${PWD}/docker/minio-init.sh:/scripts/minio-init.sh:ro" `
  --entrypoint /bin/sh minio/mc:latest /scripts/minio-init.sh | Out-Null

Write-Host "==> Bootstrap master (sem seed demo)..." -ForegroundColor Cyan
npm run db:bootstrap

Write-Host ""
Write-Host "Pronto. Suba a API e portais: .\dev-all.bat" -ForegroundColor Green
