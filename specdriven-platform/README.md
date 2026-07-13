# SpecDriven Platform

MVP bootstrap da plataforma cloud SpecDriven — monorepo com API Fastify, portais React (cliente e consultoria), tipos compartilhados e Postgres.

## Stack

| Peça | Tecnologia |
|------|------------|
| Monorepo | npm workspaces |
| API | Node.js + TypeScript + Fastify (`apps/api`) |
| Portal cliente | React + Vite (`apps/web-client`) — Fase B |
| Portal consultoria | React + Vite (`apps/web-staff`) — Fase C |
| Shared | Zod + TypeScript (`packages/shared`) |
| Persistência | Postgres 16 + Prisma |
| Local DB | Docker Compose |

## Pré-requisitos

- Node.js ≥ 20
- npm ≥ 10
- Docker Desktop (para Postgres local)

## Setup rápido

```powershell
# 1. Dependências
npm install

# 2. Variáveis de ambiente
Copy-Item .env.example .env

# 3. Postgres local (credenciais locais apenas: specdriven/specdriven/specdriven)
docker compose up -d

# 4. Schema Prisma + seed local
npm run db:generate
npm run db:push
npm run db:seed

# 5. API + portais
#    Opção A — um duplo clique / comando:
.\dev-all.bat
#    Opção B — terminais separados:
npm run dev:api
npm run dev:web-client
npm run dev:web-staff
```

O `dev-all.bat` abre **três janelas** (`dev:api`, `dev:web-client`, `dev:web-staff`). Feche cada janela para parar o serviço.

- API: `http://localhost:3000`
- Portal cliente: `http://localhost:5173` (`VITE_API_URL` em `apps/web-client/.env.example`)
- Portal consultoria: `http://localhost:5174` (`VITE_API_URL` em `apps/web-staff/.env.example`) — login seed `gestor@specdriven.local` / `changeme`
- Mailpit (opcional): `http://localhost:8025` — SMTP `127.0.0.1:1025` com `MAIL_PROVIDER=smtp` (ver `.env.example`)

Rotas API principais:

- `GET /health` → `{ "status": "ok" }`
- `POST /auth/login` / `GET /auth/me`
- `GET|POST /clients`
- `GET|POST /tickets`, `GET /tickets/:key`
- `GET|POST /tickets/:key/comments`
- `GET|POST /tickets/:key/attachments` (metadados)

Smoke sem Postgres: defina `DEV_AUTH_BYPASS=true` no `.env` e use o token `dev-token`.

### Seed local (somente desenvolvimento)

| Role | Email | Senha | Notas |
|------|-------|-------|-------|
| gestor | `gestor@specdriven.local` | `changeme` | portal web-staff |
| consultor | `consultor@specdriven.local` | `changeme` | portal web-staff |
| cliente | `cliente@specdriven.local` | `changeme` | portal web-client |
| ticket | `DEMO-1` | — | chamado demo |

### Sem Docker (auth stub)

No `.env`, defina `DEV_AUTH_BYPASS=true`. Login devolve `dev-token` sem Postgres. Rotas de tickets respondem **503** até o DB estar disponível.

## Workspaces

```text
apps/api          # Fastify + Prisma
apps/web-client   # Portal React do cliente (Fase B)
apps/web-staff    # Portal React da consultoria (Fase C)
packages/shared   # tipos, Zod schemas, constantes de domínio
docs/             # arquitetura, modelo de dados, API
```

## Scripts raiz

| Script | Descrição |
|--------|-----------|
| `npm run build:shared` | Compila `@specdriven/shared` |
| `npm run typecheck` | `tsc` em shared + api + web-client + web-staff |
| `npm run build` | Build shared + api + web-client + web-staff |
| `npm run dev:api` | API com tsx watch |
| `npm run dev:web-client` | Vite portal cliente (porta 5173) |
| `npm run dev:web-staff` | Vite portal consultoria (porta 5174) |
| `npm run db:generate` | Prisma client |
| `npm run db:push` | Aplica schema no Postgres |
| `npm run db:seed` | Seed local (org, gestor, cliente, DEMO-1) |

## Documentação

- **Uso (portais, seed, sync):** [docs/guia-de-uso.md](docs/guia-de-uso.md)
- Índice técnico: [docs/README.md](docs/README.md)

## Segurança local

As credenciais do `docker-compose.yml` são **somente para desenvolvimento local**. Não use em produção e não versionar `.env` com secrets reais.

OpenAPI: `http://localhost:3000/docs` · CI: `.github/workflows/ci.yml` · Sync desktop: [docs/sync-desktop.md](docs/sync-desktop.md).
