# Documentação SpecDriven Platform

Documentação da plataforma cloud **SpecDriven** — tenancy multi-cliente, API e modelo de dados Postgres.

Complementa (não substitui) a documentação do app desktop local em SpecDriven.

## Comece por aqui

| Doc | Conteúdo |
|-----|----------|
| **[Guia de uso](guia-de-uso.md)** | Como subir o ambiente e usar portais, aprovações e sync desktop |

## Índice técnico

| Doc | Conteúdo |
|-----|----------|
| [Arquitetura](arquitetura.md) | Tenancy (1 org + N clients), superfícies, `organizationId` |
| [Modelo de dados](modelo-dados.md) | Entidades Prisma / Postgres |
| [API](api.md) | Endpoints (auth, tickets, sync, billing, OpenAPI `/docs`) |
| [Portal cliente](portal-cliente.md) | `apps/web-client` (notas técnicas) |
| [Portal staff](portal-staff.md) | `apps/web-staff` (notas técnicas) |
| [Aprovações](aprovacoes.md) | Workflows ticket / limite / horas |
| [Sync desktop](sync-desktop.md) | SpecDriven Local\|Cloud + `/sync/*` |

## Referência rápida

- **Stack:** Node.js · TypeScript · Fastify · Prisma · Postgres 16
- **Monorepo:** npm workspaces (`apps/api`, `apps/web-client`, `packages/shared`)
- **Tenancy:** uma organização por instalação lógica; N clientes sob a org
- **README raiz:** setup operacional (Docker, `npm run dev:api`, `npm run dev:web-client`)

## Como contribuir nesta pasta

- Manter linguagem alinhada ao produto (PT-BR).
- Ao mudar schema Prisma ou rotas HTTP, atualizar o doc correspondente.
- Não documentar secrets reais — apenas defaults locais.
