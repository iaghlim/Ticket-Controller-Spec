# Arquitetura — SpecDriven Platform

## Visão

Plataforma cloud SpecDriven para organizar atendimentos (Cliente → Chamado) com tenancy multi-consultoria.

**Modelo de negócio:**

```text
Nós (operador SpecDriven)
  └── Consultoria (cliente da plataforma)
        └── Cliente da consultoria (usuário final do portal cliente)
```

## Tenancy

| Conceito | Papel |
|----------|--------|
| **Organization** | Uma consultoria na plataforma (N orgs no Postgres) |
| **Client** | N clientes finais sob a consultoria |
| **User** | Pertence à org; papéis `master` \| `admin` \| `gestor` \| `consultor` \| `cliente` |
| **Ticket** | Sempre com `organizationId` + `clientId` |

Todas as entidades de negócio relevantes carregam **`organizationId`** para isolamento e consultas filtradas.

```text
Organization (N)
 └── Client (N)
      ├── User (cliente role, opcional)
      └── Ticket (N)
           ├── Comment
           ├── Attachment
           └── TimeEntry
 └── User (master / admin / gestor / consultor)
 └── Invite
```

## Papéis e contexto de sessão

| Papel DB | Nome UX | Escopo |
|----------|---------|--------|
| `master` | Master Plataforma | Console `/master`: CRUD consultorias, criar users em qualquer org |
| `admin` | Master Consultoria | Configuração e operação da própria org (`/settings`, clientes, projetos) |
| `gestor` / `consultor` | Operação | Fila, aprovações, atendimento |
| `cliente` | Cliente final | Portal cliente (`apps/web-client`) |

O **master** inicia no **console plataforma** (`isPlatformContext: true`). Para operar uma consultoria, usa **Entrar** na lista → `POST /auth/switch-org` → JWT com `organizationId` da consultoria alvo. **Sair para console** → `POST /auth/exit-org`.

Rotas de provisionamento (`GET|POST /organizations`, `POST /organizations/:id/users`) exigem master em contexto plataforma.

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
