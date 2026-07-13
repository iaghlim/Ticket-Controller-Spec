# Arquitetura — SpecDriven Platform

## Visão

Plataforma cloud SpecDriven para organizar atendimentos (Cliente → Chamado) com tenancy preparado desde o bootstrap.

## Tenancy

| Conceito | Papel |
|----------|--------|
| **Organization** | Contêiner raiz (single-org por tenant lógico) |
| **Client** | N clientes sob a organização |
| **User** | Pertence à org; role `gestor` \| `consultor` \| `cliente`; `clientId` opcional |
| **Ticket** | Sempre com `organizationId` + `clientId` |

Todas as entidades de negócio relevantes carregam **`organizationId`** para isolamento e consultas filtradas.

```text
Organization (1)
 └── Client (N)
      ├── User (cliente role, opcional)
      └── Ticket (N)
           ├── Comment
           ├── Attachment
           └── TimeEntry (stub)
 └── User (gestor / consultor)
 └── Invite
```

## Superfícies

| Superfície | Público | Notas |
|------------|---------|-------|
| API HTTP (`apps/api`) | Backend | Fastify + JWT + Postgres |
| Portal cliente (`apps/web-client`) | Externo | Fase B — escopo ao `clientId` |
| Portal gestor/consultor | Interno | Fase C |
| Desktop SpecDriven | Local | Sync cloud na Fase D |

## Stack (Phase A + B + C API)

| Camada | Tecnologia |
|--------|------------|
| API | Fastify + TypeScript |
| Portal cliente | React + Vite |
| Contratos | `@specdriven/shared` (Zod + tipos) |
| Persistência | Postgres 16 + Prisma |
| Object storage | MinIO (S3-compatible) local |
| E-mail | Provider configurável (`log` stub; SMTP depois) |
| Local | Docker Compose (Postgres + MinIO) |

## Organização do código

```text
apps/api/
  src/index.ts          # rotas
  src/invites.ts        # convites + aceite
  src/mail.ts           # e-mail (log stub | SMTP/nodemailer)
  src/storage.ts        # S3/MinIO
  src/reports.ts        # relatórios básicos staff
  prisma/schema.prisma  # modelo

apps/web-client/
  src/                  # portal React (login, tickets)

apps/web-staff/         # portal consultoria (Fase C UI)

packages/shared/
  src/schemas.ts        # statuses, roles, entidades

docs/                   # esta pasta
```

## Princípios

- **organizationId first:** todo dado de negócio é escopado à org.
- **Auth stub + DB:** login JWT com seed local; `DEV_AUTH_BYPASS` para smoke sem Postgres.
- **Staff vs cliente:** `PATCH /tickets/:key` e convites são staff; cliente só no próprio escopo.
- **Credenciais Docker só para local** (`specdriven` / `specdriven`; MinIO `minioadmin` / `minioadmin`).
