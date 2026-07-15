# Diagnóstico ITIL v5 — SpecDriven ITSM

> **Versão:** 1.0 · **Data:** 13/07/2026 · **Escopo:** monorepo `specdriven-platform` (API + 2 portais web) + app desktop `SpecDriven` (Tauri).
> **Maturidade-alvo:** tática (processo visível + métricas, sem peso de auditoria formal).
> **Versão visual:** [`docs/itil-v5-diagnostico.html`](./itil-v5-diagnostico.html).

---

## TL;DR

O produto já implementa, na camada de código e no fluxo de UI, um subconjunto expressivo das práticas de gestão de serviços do **ITIL v5** — em particular toda a família de suporte a usuário (Incidente, Requisição de Serviço, SLA, Service Desk) e o esqueleto de Service Request Fulfillment. Há também um embrião maduro de **Change Enablement via aprovações** e de **catálogo de serviços** já parametrizável pelo gestor.

O gap real para maturidade tática (visível + métricas) **não é reescrever nada**: é (a) rotular o que já existe com o vocabulário ITIL v5, (b) expor métricas calculadas em dashboard, (c) fechar três práticas que estão semi-prontas mas não-acionáveis (Problem Management, Change Enablement formal, Knowledge Management) e (d) introduzir um Catálogo de Serviços com SLA por oferta — não só por cliente.

---

## Sumário

1. [Resumo executivo](#1-resumo-executivo)
2. [Mapa de cobertura — 34 práticas ITIL v5](#2-mapa-de-cobertura--34-práticas-itil-v5)
3. [Práticas fortes (com prova em código)](#3-práticas-fortes-com-prova-em-código)
4. [Gaps por severidade](#4-gaps-por-severidade)
5. [Roadmap priorizado — 4 ondas](#5-roadmap-priorizado--4-ondas)
6. [Métricas táticas — o que medir e como](#6-métricas-táticas--o-que-medir-e-como)
7. [Mapa de mudanças arquiteturais sugeridas](#7-mapa-de-mudanças-arquiteturais-sugeridas)
8. [Glossário ITIL v5 → nomenclatura atual](#8-glossário-itil-v5--nomenclatura-atual)
9. [Riscos e anti-padrões a evitar](#9-riscos-e-anti-padrões-a-evitar)
10. [Apêndice — arquivos auditados](#10-apêndice--arquivos-auditados)

---

## 1. Resumo executivo

| Indicador | Valor |
|-----------|-------|
| Práticas com cobertura sólida | 9 / 34 |
| Práticas semi-prontas (gap tático) | 8 / 34 |
| Práticas ausentes | 17 / 34 |

**Práticas fortes:** Incident, Service Request, SLA, Service Desk, Monitoring (parcial), Change (parcial), Catalog (parcial), Config (parcial), Audit, Continuity (parcial).

**Práticas semi-prontas:** Problem, Change formal, Release, Validation, Knowledge, Improvement, Service Level, Portfolio.

> **Achado central:** o produto é forte em *Service Operation* (dia-a-dia) e fraco em *Service Strategy / Design / Transition* (governança). Isso é coerente com o estágio de uma consultoria B2B2C provando operação antes de virar PMO formal. Não é bug — é a hora certa de cada coisa.

---

## 2. Mapa de cobertura — 34 práticas ITIL v5

**Legenda:** `Pronto` ponta a ponta · `Parcial` peças existem, falta amarração tática · `Esboço` modelo de dados e/ou intent existe, mas não é acionável · `Ausente` não encontrado.

### 2.1 Cadeia de valor de serviço (SVC)

| Prática | Status | Como o produto atende hoje | Gap tático |
|---------|--------|----------------------------|------------|
| **Service Desk** (Ponto único de contato) | Pronto | Dois portais, AppShell com sino, busca, notificações, comentários public/internal, matriz evento×canal configurável. | — |
| **Incident Management** | Pronto | Tipo ITIL `incidente`, status `em_andamento / aguardando_cliente / em_teste / concluido / cancelado`, `firstResponseAt` e `resolvedAt` automáticos. | Sem Major Incident formal nem árvore de classificação. |
| **Problem Management** | Esboço | Tipo `problema` no enum `TicketType`, mas é só label. | Sem entidade Problem, sem Known Errors, sem KEDB. |
| **Service Request Management** | Pronto | Catálogo de tipos ITIL (`melhoria/duvida/problema/incidente`) habilitável por consultoria, módulos por área. | Faltam "service offerings" formais com SLA por oferta. |
| **Service Level Management** | Pronto | `SlaPolicy` por (cliente, prioridade), cálculo de horas úteis com feriados, `slaDueAt`, badge `badge-sla-{ok|breached|paused|done}`, recalcular em massa, `slaTargetPct`. | Sem catálogo de ofertas com SLA; sem SLA distinto para "service request fulfillment" vs "incident". |
| **Service Catalog Management** | Parcial | `enabledTicketTypes` + `TicketModuleCatalog`, exibido em `GET /portal/settings` e no formulário de novo ticket. | Falta entidade Service Offering com versionamento e aprovação. |
| **Monitoring & Event Management** | Parcial | `/health`, log de auditoria, audit log UI, notificações in-app e e-mail cobrem "eventos de serviço" manuais. | Sem métrica/evento automático; sem observabilidade sintética. SLA warning está em P2. |
| **Change Enablement** | Parcial | Workflow de approvals (3 kinds: `ticket | hour_limit | time_entry`), com `targetStatus` e `decisionNote`. | Sem entidade Change (RFC) com risco, plano de rollback, janela, CAB. |
| **Release Management** | Ausente | — | Sem release train, deploy calendar, release notes. |
| **Service Validation & Testing** | Ausente | Há smoke API + E2E Playwright login, mas não no conceito ITIL. | — |
| **Knowledge Management** | Esboço | `knowledgeBaseEnabled` + `knowledgeBaseUrl` (link externo). `Tag.visibleToClient`. | Sem base interna de artigos; sem KEDB. |
| **Continuity Management** | Parcial | Backup Postgres, P0.x no go-live. | Sem plano formal, sem BIA, sem testes. |
| **Information Security Management** | Parcial | JWT em `Authorization: Bearer`, RBAC, audit log, privacy settings (LGPD UI), SMTP por consultoria. | JWT em `localStorage` (risco XSS, documentado). Sem rotação, MFA, threat model. |
| **Availability Management** | Ausente | — | Sem SLO de disponibilidade, sem medição de uptime. |
| **Capacity & Performance Management** | Ausente | — | — |
| **Software Development & Management** | Parcial | `Project` (id, name, clientId), app desktop Tauri, sync com cloud. | Project sem milestones, status, orçamento. Não é PMO. |

### 2.2 Práticas organizacionais e de gestão (gerais)

| Prática | Status | Observação |
|---------|--------|------------|
| **Service Strategy** | Ausente | Sem service portfolio, value stream, market analysis. |
| **Service Value System (SVS)** | Parcial | O fluxo "ticket → comentário → hora → aprovação → conclusão" é uma cadeia de valor informal. |
| **Relationship Management** | Esboço | `Client` com baseline, hourly rate, code. `Project` por cliente. `supportEmail` + `supportPolicyText`. |
| **Supplier Management** | Ausente | Fornecedor SMTP (Brevo) é só config. |
| **Demand Management** | Parcial | Baseline de horas/mês, `baselineRemaining` no overview, `countsTowardBaseline`. |
| **Portfolio Management** | Esboço | `Project` + `Client` + Settings. |
| **Workforce & Talent Management** | Ausente | — |
| **Risk Management** | Ausente | — |
| **Finance Management** | Parcial | `baselineHoursMonth`, `hourlyRateCents`, `hourRateFactor`, billing summary API. |
| **Sustainability Management** | Ausente | — |
| **Architectural Management** | Ausente | — |
| **Improvement (CSI)** | Esboço | `TicketsReport`, `computePeriodSlaPct`, `slaAtRisk`. Sem Action Plan formal. |
| **Measurement & Reporting** | Parcial | `ticketsReport`, SLA %, baseline, horas pendentes. Faltam MTTR, MTTA, FCR, change success rate, CSAT, NPS, backlog aging. Sem exportação CSV/Excel. |
| **Change Control** (não-enabling) | Parcial | `ApprovalRequest` funciona como gatekeeping leve. |
| **Incident Categorization** | Parcial | `module`, `priority`, `ticketType`. Falta "service" como primeira dimensão. |
| **Service Configuration Management** | Esboço | `OrganizationSettings`, `SlaPolicy`, `Tag`, `Client`, `Project` — sem CI formal. |
| **Audit & Assurance** | Pronto | `AuditEvent` cobre actions sensíveis; UI em `/settings/audit`. Falta retenção/expurgo, trilha de read. |
| **Compliance & Policy** | Parcial | LGPD UI, política de atendimento. Sem "policy" versionada, sem aceite por cliente. |
| **Strategy & Portfolio (criação de valor)** | Ausente | — |
| **User Experience** | Parcial | Portal cliente com hero, KB link, info-strip. Sem CSAT, NPS, UX research. |

---

## 3. Práticas fortes (com prova em código)

### 3.1 Incident Management — fluxo completo, com cálculo de SLA

Tipo ITIL `incidente` tem ciclo de vida próprio. O primeiro atendimento é automático:

```ts
// apps/api/src/tickets.ts (linhas ~340-350)
if (statusChanging && nextStatus) {
  if (!ticket.firstResponseAt &&
      previousStatus === "backlog" &&
      nextStatus !== "backlog" &&
      nextStatus !== "cancelado") {
    slaExtras.firstResponseAt = new Date();
  }
  if (nextStatus === "concluido" || nextStatus === "cancelado") {
    slaExtras.resolvedAt = new Date();
  } else if (previousStatus === "concluido" || previousStatus === "cancelado") {
    slaExtras.resolvedAt = null;
    slaExtras.slaDueAt = await computeSlaDueAt({ ... from: ticket.createdAt });
  }
}
```

E o cálculo de SLA é um motor de horas úteis completo (`apps/api/src/sla-calc.ts`), com suporte a horário comercial por política, feriados por organização, e janela `[start, end)` por dia da semana ISO (1=Seg…7=Dom).

### 3.2 Service Level Management — alvo de 90% no overview

`packages/shared/src/sla-helpers.ts` já entrega três períodos de análise (mês atual, mês anterior, trimestre) e a função `computePeriodSlaPct` é puro, testável, e usada tanto no overview staff quanto na home do cliente.

### 3.3 Service Desk — dois portais, sino, busca, comentários, visibilidade

Modelo de comentário carrega `visibility: public | internal` (essencial ITIL). Notificações usam matriz evento×canal configurável por consultoria (`defaultNotificationPrefs()` em `schemas.ts`).

### 3.4 Service Catalog — habilitação por consultoria

Catálogo configurável em `/settings/catalog`: quatro tipos ITIL + módulos customizáveis (`TicketModuleCatalog` com chave, label, sortOrder, enabled). O portal cliente consome via `GET /portal/settings`.

### 3.5 Audit trail — base sólida para conformidade

`AuditEvent` é append-only e cobre **todas** as ações sensíveis. O handler de escrita é fail-safe:

```ts
// apps/api/src/audit.ts
try {
  await prisma.auditEvent.create({ ... });
} catch {
  // Audit must not break primary flows.
}
```

### 3.6 Change Enablement (parcial) — workflow de aprovação reutilizável

`ApprovalRequest` já cobre três tipos: `ticket` (ex. concluir), `hour_limit` (ampliar), `time_entry` (lançamento). Aprovações são transacionais, idempotentes, e com *decision note*. É a base certa para evoluir pra RFC formal.

### 3.7 Demand & Capacity (parcial) — baseline por cliente

`Client.baselineHoursMonth`, flag `countsTowardBaseline` por ticket, e endpoint `getBillingSummary(clientId, from, to)` que retorna `baselineRemaining` — exibido no overview (KPI "Baseline restante").

---

## 4. Gaps por severidade

Severidade considera (a) impacto operacional se não-resolvido, (b) frequência de uso, (c) o que o mercado B2B2C exige como barreira de entrada.

### 🔴 Critical — bloqueia maturidade tática

- **C1.** Sem dashboard de CSI / métricas táticas (MTTR, MTTA, FCR, change success, baseline burn, backlog aging).
- **C2.** Change Enablement é só "aprovar para concluir" — não é RFC.
- **C3.** Problem Management é só um label — não há entidade Problem nem Known Error.
- **C4.** Knowledge Management é só "link externo" — não há base interna.

### 🟠 High — entra no próximo trimestre

- **H1.** Service Catalog precisa virar "Service Offering" (entidade).
- **H2.** Sem Major Incident process.
- **H3.** Backlog aging visível.
- **H4.** Sem workflow "Problem → Change".
- **H5.** Visibilidade ITIL pros consultores (dashboard Health + Change Calendar).

### 🟡 Medium — polish tático

- **M1.** CSAT pós-resolução.
- **M2.** Exportação CSV/Excel dos relatórios.
- **M3.** SLA warning por e-mail (já no P2 do docs).
- **M4.** Audit do recálculo de SLA em massa.
- **M5.** SLA "por service offering" (não só por cliente).

### ⚪ Low — nice-to-have

- **L1.** Risk register.
- **L2.** NPS trimestral.
- **L3.** Capacidade (Capacity & Performance).
- **L4.** Uptime do próprio portal.
- **L5.** Migrar JWT para `httpOnly` cookie (security blocker).

---

## 5. Roadmap priorizado — 4 ondas

Cada onda é um ciclo autônomo, com entregável claro. Esforço em **dias-pessoa (DP)** considerando o time atual (1-2 pessoas).

### Onda 0 — Quick wins táticos (1-2 semanas · 4-6 DP)

Sem mudança de schema. Toca em UI + endpoints já existentes.

- **QW1.** Endpoint `GET /reports/service-health` com MTTA, MTTR, FCR, change success, baseline burn, aging (3-4 DP)
- **QW2.** Nova página staff `/reports/health` consumindo QW1 (2 DP)
- **QW3.** CSAT pós-resolução: e-mail + endpoint + campo `csatScore` (1-2 DP)
- **QW4.** Aging widget no OverviewPage com drill-down (1 DP)

**Entregável:** dashboard "Saúde do Serviço" + CSAT ao vivo.

### Onda 1 — Problem + Change (4-6 semanas · 12-18 DP)

Schema novo. Modelagem cuidadosa. Fundação ITIL v5 madura.

- **W1.1.** Modelo `Problem` + migração + `Incident.problemId` (3 DP)
- **W1.2.** API REST `/problems` + UI staff `/problems` (3 DP)
- **W1.3.** Modelo `Change` (RFC) com risk, window, rollback, CAB (3 DP)
- **W1.4.** API REST `/changes` + UI + Change Calendar widget (4 DP)
- **W1.5.** Workflow "Problem → Change" (2 DP)

**Entregável:** Problem Management e Change Enablement vivos, com linkage Problem↔Change↔Incident.

### Onda 2 — Knowledge + Service Offering (4-6 semanas · 10-15 DP)

Substitui a enum `TicketType` por entidade. Cuidado com migração.

- **W2.1.** Modelo `Article` (markdown) + estado `draft / published` (3 DP)
- **W2.2.** UI staff `/knowledge` + UI cliente embutida no detalhe do ticket (3 DP)
- **W2.3.** Modelo `ServiceOffering` + migração (3 DP)
- **W2.4.** UI staff `/settings/catalog` reformulada: Service Offerings (3 DP)
- **W2.5.** Portal cliente renderiza catálogo público de offerings (2 DP)

**Entregável:** KEDB interna + catálogo de serviços formal com SLA por oferta.

### Onda 3 — Maturidade tática contínua (ongoing · 2-3 DP/mês)

Não é projeto, é prática. CSI + security + compliance.

- **W3.1.** SLA warning/breach por e-mail (2 DP)
- **W3.2.** Export CSV/Excel (1 DP)
- **W3.3.** Migrar JWT para `httpOnly` cookie (1-2 DP)
- **W3.4.** Risk register (entidade `Risk`) (2 DP)
- **W3.5.** Revisão trimestral de CSI (processo, não código)

**Entregável:** cadência tática ITIL v5 mantida.

> **Recomendação de início:** Onda 0 (quick wins) traz visibilidade imediata com baixíssimo risco — é onde o ROI aparece em 1-2 semanas. Onda 1 é o "salto de maturidade" que diferencia SaaS amador de ITSM sério. Onda 2 é o que transforma vocês em plataforma, não só ferramenta.

---

## 6. Métricas táticas — o que medir e como

Quatro famílias. Todas já podem ser calculadas com dados existentes no banco. Faltam só o endpoint e a UI (Onda 0).

### 6.1 Indicadores de suporte (Incident & Request)

| Métrica | Fórmula (resumo) | Origem dos dados |
|---------|------------------|------------------|
| **MTTA** (Mean Time To Acknowledge) | mediana(`firstResponseAt − createdAt`) em horas úteis | `Ticket.firstResponseAt`, `createdAt` |
| **MTTR** (Mean Time To Resolve) | mediana(`resolvedAt − createdAt`) em horas úteis | `Ticket.resolvedAt` |
| **FCR** (First Call Resolution) | % de tickets que saíram de `backlog` → `concluido` sem voltar a `em_andamento` | `TicketStatusHistory` |
| **% SLA cumprido** | tickets resolvidos dentro do prazo / total | `sla-helpers.computePeriodSlaPct` (já existe) |
| **Backlog aging** | bucket de `now − createdAt` para tickets abertos | `Ticket.createdAt` |

### 6.2 Indicadores de mudança (Change Enablement)

| Métrica | Fórmula | Origem |
|---------|---------|--------|
| **Change success rate** | approvals `approved` ÷ (`approved` + `rejected`) por `kind` | `ApprovalRequest.status` |
| **Unauthorized change** | tickets que mudaram de `concluido` → outro status | `TicketStatusHistory` |
| **Tempo médio de aprovação** | `decidedAt − createdAt` por `ApprovalRequest` | `ApprovalRequest` |

### 6.3 Indicadores de capacidade e demanda

| Métrica | Fórmula | Origem |
|---------|---------|--------|
| **Baseline burn** | soma de `TimeEntry.seconds` *aprovados* ÷ `Client.baselineHoursMonth` por cliente/mês | `TimeEntry`, `Client` |
| **Esforço por cliente** | agrupado por `clientId` + tipo de ticket | `TimeEntry` × `Ticket` |
| **Esforço por consultor** | agrupado por `userId` + `hourRateFactor` | `TimeEntry`, `User.hourRateFactor` |

### 6.4 Indicadores de cliente (Relationship)

| Métrica | Fórmula | Origem |
|---------|---------|--------|
| **CSAT** | média de `Ticket.csatScore` por período (QW3) | `Ticket.csatScore` (a criar) |
| **Tickets por cliente** | contagem agrupada por `clientId` + status | `Ticket.clientId` |
| **Top clientes por demanda** | top-10 por `count(ticket)` no período | `Ticket` |

> **Dica de produto:** já que vocês têm *dois* portais (cliente e staff) com auth segregada, é natural que a UI cliente mostre um subconjunto de métricas (CSAT, %SLA do mês, chamados abertos) e a UI staff mostre tudo. Não misturem os endpoints — `GET /reports/*` é staff, `GET /portal/*` é cliente.

---

## 7. Mapa de mudanças arquiteturais sugeridas

### 7.1 Mudanças no `schema.prisma` (resumo)

```prisma
// Novos modelos propostos (resumo)

model Problem {
  id              String   @id @default(uuid())
  organizationId  String
  title           String
  status          ProblemStatus  // investigating | identified | known_error | closed
  rootCause       String?
  workAround      String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  organization    Organization @relation(...)
  incidents       IncidentLink[]
  changes         Change[]
  articles        Article[]      @relation("ProblemArticles")
}

model Change {
  id              String   @id @default(uuid())
  organizationId  String
  title           String
  status          ChangeStatus  // draft | pending_cab | approved | rejected | implementing | completed | failed
  riskScore       Int      // 1..5
  rollbackPlan    String?
  windowStart     DateTime?
  windowEnd       DateTime?
  cabDecision     String?
  cabDecisionAt   DateTime?
  problemId       String?
  organization    Organization @relation(...)
  problem         Problem? @relation(fields: [problemId], references: [id])
  ticketKeys      String[]      // denormalized; ou M:N via ChangeTicket
  approvals       ApprovalRequest[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Article {
  id              String   @id @default(uuid())
  organizationId  String
  title           String
  body            String
  category        ArticleCategory
  status          ArticleStatus  // draft | published | archived
  visibleToClient Boolean  @default(false)
  problemId       String?
  organization    Organization @relation(...)
  problem         Problem? @relation("ProblemArticles", fields: [problemId], references: [id])
  ticketKeys      String[]      // M:N via ArticleTicket
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model ServiceOffering {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  description     String
  slaPolicyId     String?
  requiresApproval Boolean @default(false)
  status          OfferingStatus  // active | draft | retired
  version         Int      @default(1)
  organization    Organization @relation(...)
  slaPolicy       SlaPolicy? @relation(...)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### 7.2 Endpoints novos propostos

| Método | Rota | Função |
|--------|------|--------|
| GET | `/reports/service-health?period=current_month` | MTTA, MTTR, FCR, change success, baseline burn, aging |
| GET | `/reports/service-health.csv` | Export CSV |
| POST | `/tickets/:key/feedback` | CSAT (cliente) |
| GET/POST/PATCH | `/problems` e `/problems/:id` | Problem CRUD |
| POST | `/problems/:id/incidents` | Vincular incidente |
| GET/POST/PATCH | `/changes` e `/changes/:id` | Change CRUD |
| POST | `/changes/:id/cab` | Decisão CAB |
| GET/POST/PATCH | `/knowledge` e `/knowledge/:id` | Article CRUD |
| GET | `/portal/knowledge?category=...` | Lista pública (cliente) |
| GET/POST/PATCH | `/settings/catalog/offerings` | Service Offering CRUD |

### 7.3 Páginas novas na UI staff

- `/reports/health` — dashboard de CSI
- `/problems` e `/problems/:id` — lista e detalhe
- `/changes` e `/changes/:id` — change calendar e detalhe
- `/knowledge` — editor de artigos
- `/settings/catalog` reformulada: lista de Service Offerings

---

## 8. Glossário ITIL v5 → nomenclatura atual

| ITIL v5 | Vocabulário atual do produto | Arquivo/rota |
|---------|------------------------------|--------------|
| Service consumer | Cliente (do `Client`), usuário cliente | `apps/api/src/clients.ts` |
| Service provider | Consultoria (do `Organization`) | `schema.prisma:Organization` |
| Service Desk | Portal cliente + portal staff | `apps/web-client/`, `apps/web-staff/` |
| Incident | `Ticket` com `ticketType: "incidente"` | `schema.prisma:TicketType` |
| Service request | `Ticket` com `ticketType: "duvida" \| "melhoria" \| "problema"` | `schema.prisma:TicketType` |
| Problem | *a criar* (modelo Problem) | — |
| Known Error | *a criar* (Article status `published`, vinculado a Problem) | — |
| Change (RFC) | *a criar* (modelo Change) | — |
| Approval | `ApprovalRequest` (gate de change/release) | `apps/api/src/approvals.ts` |
| Service catalog | `OrganizationSettings.enabledTicketTypes` + `TicketModuleCatalog` → *evoluir para* `ServiceOffering` | `apps/api/src/settings.ts` |
| Service level agreement | `SlaPolicy` por (cliente, prioridade) | `apps/api/src/sla.ts` |
| Configuration Item (CI) | Implícito em `Client`, `Project`, `Tag` — *evoluir para* entidade CI | — |
| CMDB | *a criar* | — |
| Workaround | *a criar* (campo em Problem) | — |
| Major Incident | *a criar* (flag em Ticket + workflow) | — |
| Knowledge article | *a criar* (modelo Article + KEDB) | — |
| Baseline | `Client.baselineHoursMonth` | `schema.prisma:Client` |
| Time entry | `TimeEntry` (lançamento de horas) | `schema.prisma:TimeEntry` |
| SLA target | `OrganizationSettings.slaTargetPct` | `schema.prisma:OrganizationSettings` |
| Holiday | `OrganizationHoliday` | `schema.prisma:OrganizationHoliday` |
| Audit event | `AuditEvent` | `schema.prisma:AuditEvent` |
| Internal note | `Comment.visibility = "internal"` | `schema.prisma:CommentVisibility` |
| Notification preference | `OrganizationSettings.notificationPrefsJson` + `defaultNotificationPrefs()` | `packages/shared/src/schemas.ts` |
| Public comment | `Comment.visibility = "public"` | `schema.prisma:CommentVisibility` |

> **Ação recomendada:** adicionar uma coluna *"Equivalente ITIL v5"* em `docs/settings.md` e criar `docs/itil-glossary.md` com a tabela acima. Custa 1h e padroniza conversa com cliente enterprise.

---

## 9. Riscos e anti-padrões a evitar

- **R1.** Implementar Problem Management sem Change Enablement (vice-versa). Os dois precisam nascer juntos.
- **R2.** Migrar enum `TicketType` para `ServiceOffering` sem faseamento. Tem cliente com 200 tickets legados.
- **R3.** Knowledge com edição livre pelos consultores sem curadoria. KEDB sem workflow vira wiki abandonada.
- **R4.** Excesso de métricas (vanity metrics). Resista a adicionar "ticket médio por hora do dia" — não leva a ação.
- **R5.** "Mudar pra virar ITIL" sem onboarding do cliente. ITIL é promessa de transparência, mas a UX precisa continuar simples.
- **R6.** Esquecer de auditar as novas entidades. Toda escrita em `Problem`, `Change`, `Article` deve gerar `AuditEvent`.

---

## 10. Apêndice — arquivos auditados

### Backend (API)
- `apps/api/prisma/schema.prisma` — 13 modelos + 4 enums ITIL-friendly
- `apps/api/src/index.ts`, `auth.ts`, `permissions.ts`
- `apps/api/src/tickets.ts` — fluxo de criação/PATCH com SLA
- `apps/api/src/sla.ts` — motor de SLA + policies + recalcular em massa
- `apps/api/src/sla-calc.ts` — cálculo puro de horas úteis
- `apps/api/src/approvals.ts` — 3 kinds de aprovação
- `apps/api/src/projects.ts` — CRUD simples
- `apps/api/src/settings.ts` — 11 endpoints de settings
- `apps/api/src/audit.ts` — write audit fail-safe
- `apps/api/src/reports.ts` — `ticketsReport`
- `apps/api/src/ticket-history.ts` — registro de mudanças de status
- `apps/api/src/ticket-notifications.ts`
- `attachments.ts`, `billing.ts`, `clients.ts`, `comments.ts`, `db.ts`, `hardening.ts`, `invites.ts`, `mail.ts`, `notifications.ts`, `openapi.ts`, `organizations.ts`, `password-reset.ts`, `privacy.ts`, `search.ts`, `storage.ts`, `sync.ts`, `tags.ts`, `time-entries.ts`, `users.ts`

### Shared
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas.ts` — 16 schemas Zod, base ITIL
- `packages/shared/src/sla-helpers.ts` — funções puras de cálculo de SLA por período

### UI staff
- `apps/web-staff/src/pages/OverviewPage.tsx` — 4 KPIs ITIL
- `apps/web-staff/src/pages/SlaPoliciesPage.tsx` — 480 linhas: políticas + holidays + recálculo
- `apps/web-staff/src/pages/ApprovalsPage.tsx` — fila + criação de solicitações
- `apps/web-staff/src/pages/ReportsPage.tsx` — relatório por status/assignee
- `apps/web-staff/src/pages/MasterPage.tsx` — console plataforma
- `apps/web-staff/src/pages/TicketDetailPage.tsx` — SLA badge, tags, horas, anexos, comments
- `apps/web-staff/src/pages/settings/*` — 9 páginas de settings

### UI cliente
- `apps/web-client/src/pages/ClientHomePage.tsx` — hero, "Acompanhamento" (SLA do mês), categorias ITIL
- `apps/web-client/src/pages/TicketDetailPage.tsx` — cliente vê SLA badge, business hours
- `apps/web-client/src/lib/usePortalSettings.ts` — consome `GET /portal/settings`

### App desktop (Tauri/Rust)
- `SpecDriven/src/features/tickets/TicketDetailPage.tsx` — offline, checklist, EF/ET/TU docs, timer
- `SpecDriven/src/features/dashboard/DashboardPage.tsx` — overview local
- `SpecDriven/src/features/reports/TicketsReportPage.tsx` — relatório local
- `SpecDriven/src-tauri/src/commands/*` — `tickets`, `hours_report`, `notes`, `timer`, `checklist`, `attachments`, `documents`, `cloud_sync`

### Documentação institucional
- `docs/README.md`, `docs/go-live-checklist.md`, `docs/settings.md`, `docs/security.md`, `docs/guia-instalacao.md`

### Migrations relevantes
- `20260713143000_add_master_admin_roles_and_projects`
- `20260713152200_add_ticket_company_name_and_module`
- `20260713160000_add_organization_settings` (Sprint 1)
- `20260713170000_add_catalog_settings` (Sprint 2)
- `20260713180000_add_sla_advanced_settings` (Sprint 4)
- `20260713200000_go_live_extras`
- `20260713210000_portal_smtp_hero`

---

**Próximos passos sugeridos:** validar este diagnóstico contigo, escolher a Onda 0 (quick wins) para começar, e abrir uma issue por item *Critical* no repositório.
