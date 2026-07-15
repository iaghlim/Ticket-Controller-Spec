#!/usr/bin/env bash
# Deploy produção — VPS Linux. Execute na pasta specdriven-platform.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Erro: copie .env.production.example para .env e preencha secrets."
  exit 1
fi

echo "==> npm ci"
npm ci

echo "==> prisma migrate deploy"
npm run db:migrate:deploy

# Nota: Em uma primeira implantação em banco limpo, execute 'npm run db:bootstrap' 
# para provisionar o usuário master administrador inicial da plataforma.

echo "==> docker build + up (com storage)"
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml --profile storage up -d

echo "==> health"
sleep 5
curl -sf "http://127.0.0.1:${API_PORT:-3000}/health" | head -c 500
echo ""
echo "Deploy concluído. Configure Caddy (docker/Caddyfile) para TLS."
