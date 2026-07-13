# Infraestrutura de produção

Guia para implantar a SpecDriven Platform com Docker em ambiente de produção.

## Visão geral

| Componente | Imagem / artefato | Porta padrão |
|------------|-------------------|--------------|
| API | `apps/api/Dockerfile` | 3000 |
| Portal cliente | `docker/Dockerfile.vite-spa` (`APP_DIR=web-client`) | 8080 |
| Portal consultoria | `docker/Dockerfile.vite-spa` (`APP_DIR=web-staff`) | 8081 |
| Postgres | `postgres:16` | 5432 (interno) |
| MinIO (opcional) | `minio/minio` (profile `storage`) | 9000 (interno) |

Arquivos principais:

- `docker-compose.prod.yml` — orquestração
- `.env.production.example` — variáveis obrigatórias
- `npm run db:migrate:deploy` — aplica migrations Prisma

## Pré-requisitos

- Docker Engine ≥ 24 e Docker Compose v2
- Domínios ou IPs públicos para API e portais (HTTPS recomendado via reverse proxy)
- Secrets gerados fora do repositório (`JWT_SECRET`, senhas Postgres, chaves S3)

## Passo a passo

### 1. Configurar variáveis de ambiente

```bash
cp .env.production.example .env
```

Preencha **todos** os campos em `.env`. Em produção são obrigatórios:

- `DATABASE_URL` — conexão Postgres
- `JWT_SECRET` — mínimo 32 caracteres
- `CORS_ORIGINS` — URLs dos portais (vírgula)
- `APP_PUBLIC_URL` — URL pública do portal cliente
- `VITE_API_URL_CLIENT` e `VITE_API_URL_STAFF` — URL da API usada no build dos frontends

Para Postgres gerenciado externo, defina apenas `DATABASE_URL` e remova ou não suba o serviço `postgres` do compose (ajuste `depends_on` conforme necessário).

### 2. Aplicar migrations

Com Postgres acessível (local ou remoto):

```bash
npm ci
npm run db:migrate:deploy
```

Em deploy Docker, execute o comando acima **antes** de subir a API pela primeira vez, ou rode em um job/init container com a mesma `DATABASE_URL`.

### 3. Build e subida

Stack completa (API + portais + Postgres):

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

Com object storage MinIO embutido:

```bash
docker compose -f docker-compose.prod.yml --profile storage up -d
```

Atalho no VPS Linux: `bash scripts/deploy-prod.sh` (migrate + build + up com storage).

Defina no `.env`:

- `S3_ENDPOINT=http://minio:9000`
- `S3_FORCE_PATH_STYLE=true`
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` alinhados com `MINIO_ROOT_*` do compose

### 4. Verificação

```bash
curl -s http://localhost:3000/health
```

Resposta esperada (exemplo):

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "storage": "skipped"
  }
}
```

- `storage: "skipped"` — sem `S3_ENDPOINT` (upload binário desabilitado)
- `storage: "ok"` — bucket acessível
- HTTP `503` — banco indisponível

Portais:

- Cliente: `http://localhost:8080` (ou `WEB_CLIENT_PORT`)
- Consultoria: `http://localhost:8081` (ou `WEB_STAFF_PORT`)

### 5. Reverse proxy e TLS

O compose expõe portas HTTP simples. Em produção, coloque **nginx**, **Caddy** ou load balancer na frente com TLS:

- `api.exemplo.com` → serviço `api:3000`
- `portal.exemplo.com` → `web-client:80`
- `staff.exemplo.com` → `web-staff:80`

Atualize `CORS_ORIGINS`, `APP_PUBLIC_URL` e `VITE_API_URL_*` com as URLs HTTPS finais e **rebuild** dos portais se a URL da API mudar.

## CI

O workflow `.github/workflows/ci.yml`:

1. Sobe Postgres como service
2. Valida que existem migrations em `apps/api/prisma/migrations/`
3. Executa `npm run db:migrate:deploy`
4. Roda typecheck e build

## Operação

### Atualizar versão

```bash
git pull
npm run db:migrate:deploy
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### Logs

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

### Backup Postgres

Use `pg_dump` no volume ou no serviço gerenciado — fora do escopo deste repositório.

## Segurança

- Não versione `.env` com secrets reais
- `DEV_AUTH_BYPASS` e `JWT_SECRET=dev-only-change-me` são bloqueados em `NODE_ENV=production`
- `CORS_ORIGINS` vazio em produção impede subida da API (validação em `hardening.ts`)
- Credenciais do `docker-compose.yml` de desenvolvimento **não** devem ser usadas em produção

## Build isolado (sem compose)

API:

```bash
docker build -f apps/api/Dockerfile -t specdriven-api .
```

Portal cliente:

```bash
docker build -f docker/Dockerfile.vite-spa \
  --build-arg APP_DIR=web-client \
  --build-arg VITE_API_URL=https://api.exemplo.com \
  -t specdriven-web-client .
```
