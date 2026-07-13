# Modelo de dados

Fonte de verdade: `apps/api/prisma/schema.prisma`.

## Diagrama lógico

```text
organizations
  ├── clients
  ├── users          (unique: organizationId + email)
  ├── tickets        (unique: organizationId + key)
  ├── invites
  ├── tags
  ├── sla_policies
  ├── approval_requests
  └── time_entries

tickets
  ├── comments       (visibility: public | internal)
  ├── attachments
  ├── ticket_tags
  ├── ticket_status_history
  ├── approval_requests
  └── time_entries
```

## Entidades

### Organization — `organizations`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `name` | string | |
| `createdAt`, `updatedAt` | datetime | |

### Client — `clients`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `organizationId` | uuid | FK → organizations |
| `name` | string | |
| `code` | string? | Código curto opcional |
| `createdAt`, `updatedAt` | datetime | |

### User — `users`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `organizationId` | uuid | FK |
| `email` | string | Único por org |
| `name` | string | |
| `passwordHash` | string | Hash; auth completa depois |
| `role` | enum | `gestor` \| `consultor` \| `cliente` |
| `clientId` | uuid? | Obrigatório semanticamente para role `cliente` |
| `createdAt`, `updatedAt` | datetime | |

**Índice único:** `(organizationId, email)`.

### Ticket — `tickets`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `organizationId` | uuid | FK |
| `clientId` | uuid | FK |
| `key` | string | Padrão `^[A-Z][A-Z0-9]+-\d+$` |
| `title` | string | |
| `description` | string? | |
| `status` | enum | ver abaixo |
| `priority` | string? | |
| `assigneeId` | uuid? | FK → users |
| `estimateMinutes` | int? | |
| `hourLimitMinutes` | int? | Limite de horas (workflows) |
| `slaDueAt` | datetime? | Prazo SLA resolução |
| `firstResponseAt` | datetime? | Primeira saída de backlog |
| `resolvedAt` | datetime? | Conclusão/cancelamento |
| `createdAt`, `updatedAt` | datetime | |

**Índice único:** `(organizationId, key)`.

**Status:** `backlog` \| `em_andamento` \| `aguardando_cliente` \| `em_teste` \| `concluido` \| `cancelado`.

### Tag — `tags` (Fase E)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `organizationId` | uuid | FK |
| `name` | string | único por org |
| `color` | string? | |
| `createdAt`, `updatedAt` | datetime | |

### TicketTag — `ticket_tags`

| Campo | Tipo | Notas |
|-------|------|-------|
| `ticketId`, `tagId` | uuid | PK composta |
| `createdAt` | datetime | |

### TicketStatusHistory — `ticket_status_history` (Fase E)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `ticketId` | uuid | FK |
| `fromStatus` | enum? | null na criação |
| `toStatus` | enum | |
| `changedById` | uuid | FK → users |
| `note` | string? | |
| `createdAt` | datetime | |

### SlaPolicy — `sla_policies` (Fase E)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `organizationId` | uuid | FK |
| `clientId` | uuid | FK — SLA por projeto/cliente |
| `name` | string | |
| `priorityMatch` | string | `""` = default; senão match `ticket.priority` |
| `responseMinutes` | int | Meta 1ª resposta (horas úteis) |
| `resolutionMinutes` | int | Meta resolução (horas úteis) |
| `businessHourStart` / `businessHourEnd` | int | Janela útil (ex. 9–18) |
| `weekdays` | string | ISO 1=seg…7=dom, CSV |
| `createdAt`, `updatedAt` | datetime | |

**Único:** `(clientId, priorityMatch)`.

### Comment — `comments`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `ticketId` | uuid | FK |
| `authorId` | uuid | FK → users |
| `body` | string | |
| `visibility` | enum | `public` \| `internal` |
| `createdAt` | datetime | |

### Attachment — `attachments`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `ticketId` | uuid | FK |
| `storageKey` | string | Chave no storage (S3 etc. depois) |
| `fileName` | string | |
| `mimeType` | string? | |
| `sizeBytes` | int? | |
| `createdAt` | datetime | |

### Invite — `invites`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `organizationId` | uuid | FK |
| `email` | string | |
| `role` | enum | UserRole |
| `clientId` | uuid? | |
| `token` | string | único |
| `expiresAt` | datetime | |
| `acceptedAt` | datetime? | preenchido no aceite |
| `createdAt` | datetime | |

### TimeEntry — `time_entries` (stub)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `organizationId` | uuid | FK |
| `ticketId` | uuid | FK |
| `userId` | uuid | FK |
| `startedAt` | datetime | |
| `endedAt` | datetime? | |
| `seconds` | int? | |
| `note` | string? | |
| `createdAt` | datetime | |

## Contratos TypeScript

Tipos e Zod espelhados em `@specdriven/shared` (`packages/shared`).
