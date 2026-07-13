# Configurações da consultoria (Settings)

Documentação funcional do hub **Configurações** no portal staff (`/settings`), implementado nos sprints 1–4. Descreve o que o gestor/admin configura, o que o consultor pode apenas visualizar e o que o portal cliente consome via `GET /portal/settings`.

**Onde configurar:** portal staff → menu **Configurações** → http://localhost:5174/settings (ambiente local).

---

## Visão geral do hub

O hub unifica parâmetros operacionais e de apresentação ao cliente. A rota raiz `/settings` exibe um **painel de completude** com quatro indicadores:

| Indicador | Completo quando | Atalho |
|-----------|-----------------|--------|
| **Perfil** | Nome da org (≥ 2 caracteres) **e** e-mail de suporte preenchido | `/settings/organization` |
| **SLA** | Existe ao menos uma política SLA cadastrada | `/settings/sla` |
| **Catálogo** | Ao menos um tipo de chamado habilitado **e** um módulo ativo | `/settings/catalog` |
| **Comunicação** | Nome do remetente de e-mail **e** reply-to preenchidos | `/settings/email` |

Cards incompletos aparecem em destaque âmbar; completos em verde.

### Seções do menu lateral

| Rota | Seção | Conteúdo |
|------|-------|----------|
| `/settings` | Visão geral | Dashboard de completude |
| `/settings/organization` | Perfil da organização | Nome exibido, e-mail de suporte, texto de política de atendimento |
| `/settings/sla` | SLA | Template de horário comercial, feriados, meta %, políticas por cliente/prioridade |
| `/settings/billing` | Baseline | Horas/mês e taxa por cliente; fator hora consultor (**staff only**) |
| `/settings/catalog` | Catálogo | Tipos ITIL habilitados, módulos/áreas, tags da organização |
| `/settings/email` | E-mail | Nome do remetente, reply-to, rodapé, teste de envio |
| `/settings/notifications` | Notificações | Matriz evento × canal (cliente e staff) |
| `/settings/portal` | Portal cliente | Base de conhecimento (toggle + URL externa) |

### Rotas legadas (redirect)

| Rota antiga | Redireciona para |
|-------------|------------------|
| `/sla-policies` | `/settings/sla` |
| `/billing` | `/settings/billing` |
| `/tags` | `/settings/catalog` (aba Tags) |

---

## Permissões

| Papel | Nome UX | Acesso ao hub | Editar configurações |
|-------|---------|---------------|----------------------|
| **master** (contexto plataforma) | Master Plataforma | Não — usa `/master` | Não |
| **master** (dentro de consultoria) | Master Plataforma | Sim | Sim |
| **admin** | Master Consultoria | Sim | Sim |
| **gestor** | Gestor | Sim (modo leitura) | Não — campos desabilitados, sem botão Salvar; API retorna `403` em PATCH |
| **consultor** | Consultor | Sim (modo leitura) | Não |
| **cliente** | Cliente final | Não — usa `GET /portal/settings` | Não |

A função `canManageSettings` na API restringe todos os endpoints `PATCH`/`POST`/`DELETE` de settings a **master** (em contexto consultoria), **admin** e **gestor**. Endpoints `GET` de leitura exigem papel staff.

**Contexto master:** `POST /auth/switch-org` e `POST /auth/exit-org` alternam entre console plataforma e operação de uma consultoria. Provisionamento de orgs (`/organizations`) só no contexto plataforma.

> **Requisito de banco:** configurações exigem Postgres e login real (`DEV_AUTH_BYPASS=false`). Com `dev-org` a API retorna `503 database_required`.

---

## API staff (`/settings/*`)

| Método | Rota | Quem edita | Descrição |
|--------|------|------------|-----------|
| `GET` | `/settings` | — (staff) | Snapshot completo + `completeness` + `canEdit` |
| `PATCH` | `/settings/organization` | gestor, admin, master (em consultoria) | Nome da org, `supportEmail`, `supportPolicyText` |
| `PATCH` | `/settings/portal` | gestor, admin | `enabledTicketTypes`, KB toggle/URL |
| `PATCH` | `/settings/email` | gestor, admin | `fromName`, `replyTo`, `footerText` |
| `POST` | `/settings/email/test` | gestor, admin | E-mail de teste para o usuário logado |
| `PATCH` | `/settings/notifications` | gestor, admin | Matriz `notificationPrefs` |
| `PATCH` | `/settings/sla` | gestor, admin | `slaTargetPct`, `defaultBusinessHours` |
| `GET` | `/settings/holidays` | staff (leitura) | Lista feriados + `canEdit` |
| `POST` | `/settings/holidays` | gestor, admin | Criar feriado (data + nome opcional) |
| `DELETE` | `/settings/holidays/:id` | gestor, admin | Remover feriado |
| `GET` | `/settings/modules` | staff (leitura) | Catálogo de módulos |
| `POST` | `/settings/modules` | gestor, admin | Criar módulo |
| `PATCH` | `/settings/modules/:id` | gestor, admin | Editar rótulo, ordem, ativo |
| `DELETE` | `/settings/modules/:id` | gestor, admin | Excluir (bloqueado se módulo em uso) |

Alterações relevantes geram entrada no **audit log** (`settings.organization.update`, `settings.portal.update`, etc.).

---

## O que o portal cliente vê (`GET /portal/settings`)

Endpoint exclusivo para usuários com role `cliente`. Resposta pública (subset seguro):

| Campo | Origem | Onde aparece no cliente |
|-------|--------|-------------------------|
| `organizationName` | `Organization.name` | Header, home, rótulos |
| `supportEmail` | Settings | Footer `mailto:` |
| `supportPolicyText` | Settings | Footer (2–3 linhas) |
| `logoUrl` | — | Sempre `null` (P2: upload S3) |
| `enabledTicketTypes` | Settings | Home (grid categorias), formulário novo chamado |
| `enabledModules` | `TicketModuleCatalog` (ativos) | Select de módulo na abertura |
| `slaTargetPct` | Settings (default 90) | Card “SLA do mês” na home |
| `businessHoursSummary` | Template de horário comercial | Tooltip/texto na home e detalhe do chamado |
| `knowledgeBaseEnabled` + `knowledgeBaseUrl` | Settings | Link na sidebar (se ativo e URL válida) |

### O que **não** vai para o portal cliente

- Políticas SLA por cliente/prioridade (detalhe interno)
- Baseline, taxa horária, fator consultor
- Tags do catálogo (P2: visibilidade ao cliente)
- Matriz de notificações (afeta comportamento, não é exibida)
- Feriados (afetam cálculo de prazo, não listados ao cliente)
- Credenciais de e-mail / SMTP

O cliente consome settings via hook `usePortalSettings()` nas páginas home, novo chamado, detalhe e `AppShell`.

---

## Seções em detalhe

### Perfil da organização (`/settings/organization`)

- **Nome exibido** — obrigatório, mín. 2 caracteres; atualiza `Organization.name` e reflete no cliente após refresh de sessão.
- **E-mail de suporte** — opcional, validado; recomendado para completude do perfil.
- **Política de atendimento** — texto curto (até 500 caracteres) no footer do portal.

### Catálogo (`/settings/catalog`)

**Tipos de chamado (ITIL):** Melhoria, Incidente, Dúvida, Problema. Pelo menos um deve permanecer habilitado. Tipos desabilitados somem da home e do formulário de abertura; chamados legados mantêm o valor original (somente leitura).

**Módulos / áreas:** CRUD com chave (`financeiro`), rótulo, ordem e ativo/inativo. Pelo menos um módulo ativo é obrigatório. Chave em uso em tickets existentes não pode ser excluída — desative em vez de excluir.

**Tags:** mesma gestão da antiga rota `/tags`, embutida na aba Tags do catálogo.

Defaults para org nova: os 4 tipos + módulo **Geral** (`geral`).

### SLA (`/settings/sla`)

Três blocos na mesma página:

1. **Calendário e meta da organização**
   - **Horário comercial padrão** — início/fim (0–23) e dias da semana (`1–7`, seg–dom). Template pré-preenchido ao criar nova política SLA.
   - **Feriados** — datas (nacionais ou da consultoria); não contam como hora útil no cálculo de `slaDueAt`.
   - **Meta SLA %** (`slaTargetPct`, default 90) — usada no overview staff e no card “SLA do mês” do cliente.

2. **Políticas por cliente e prioridade** — CRUD existente (prazos em horas úteis, horário por política).

**Regras importantes:**

- Feriados empurram prazos de tickets **novos** (e recálculo em mudança de prioridade); **não** há recálculo em massa de tickets abertos ao alterar feriados (P2).
- O resumo público `businessHoursSummary` é derivado do template (ex.: “Horário comercial: seg–sex, 9h–18h”) — sem expor políticas internas por cliente.

### Baseline (`/settings/billing`)

Sem mudança funcional de escopo: baseline horas/mês e taxa por cliente permanecem **apenas no staff**. Não refletem em `GET /portal/settings`.

### E-mail (`/settings/email`) — Fase 1

Sem SMTP por organização (P2). Usa infra global da plataforma (`mail.ts`) com overrides:

- **Nome do remetente** (`emailFromName`) — aparece no `From:` junto à caixa da plataforma.
- **Reply-To** (`emailReplyTo`) — respostas do cliente vão para a consultoria.
- **Rodapé** (`emailFooterText`) — texto opcional nos templates.
- **Enviar e-mail de teste** — dispara para o e-mail do gestor/admin logado.

### Notificações (`/settings/notifications`)

Matriz **evento × canal** (in-app / e-mail). Comentários **internos** nunca notificam cliente.

#### Usuários cliente

| Evento | Descrição | Default in-app | Default e-mail |
|--------|-----------|----------------|----------------|
| `ticket.status_changed` | Status alterado pela consultoria | Sim | Sim |
| `ticket.comment_public` | Consultor respondeu publicamente | Sim | Sim |
| `ticket.created` | Cliente abriu chamado (confirmação) | Não | Não |
| `ticket.sla_warning` | SLA perto de vencer | — | **P2** (não implementado) |
| `ticket.sla_breached` | SLA violado | — | **P2** (não implementado) |

#### Usuários staff

| Evento | Descrição | Default in-app | Default e-mail | Destinatários default |
|--------|-----------|----------------|----------------|------------------------|
| `ticket.comment_public` | Cliente comentou publicamente | Sim | Não | assignee + gestores |
| `approval.pending` | Aprovação pendente | Sim | Não | gestores |

Desligar e-mail de um evento não afeta in-app (e vice-versa), desde que o canal respectivo permaneça habilitado.

### Portal cliente (`/settings/portal`)

- **Base de conhecimento** — toggle ativo/inativo + URL externa (Confluence, Notion, site da consultoria).
- URL obrigatória quando o toggle está ativo.
- Preview na própria tela: “Como o cliente verá o menu”.
- Link na sidebar do cliente só aparece com toggle **on** e URL preenchida.

---

## Matriz resumo: setting → quem edita → cliente vê?

| Configuração | Edita | Cliente vê? |
|--------------|-------|-------------|
| Nome / suporte / política | gestor, admin | Sim (`/portal/settings` + footer) |
| Tipos / módulos de chamado | gestor, admin | Sim (home + abertura) |
| Tags | gestor, admin | Não (P2 parcial) |
| Políticas SLA | gestor, admin | Indireto (prazos nos tickets) |
| Feriados / meta SLA % | gestor, admin | Indireto (% mês + texto horário) |
| Baseline / taxa | gestor, admin | **Não** |
| E-mail from / reply-to | gestor, admin | Nos e-mails transacionais |
| Matriz notificações | gestor, admin | Comportamento (sino/e-mail) |
| Base de conhecimento | gestor, admin | Link na nav |
| Usuários / convites | fluxos em Clientes | Não |

---

## Migrations (Prisma)

Pasta: `specdriven-platform/apps/api/prisma/migrations/`

Executar na ordem (via `npm run db:push` ou `prisma migrate deploy`):

| Migration | Relação com Settings |
|-----------|----------------------|
| `20260713143000_add_master_admin_roles_and_projects` | Infra de papéis (admin, master) |
| `20260713152200_add_ticket_company_name_and_module` | Campo `module` em tickets |
| `20260713160000_add_organization_settings` | **Sprint 1** — tabela `organization_settings` |
| `20260713170000_add_catalog_settings` | **Sprint 2** — `enabledTicketTypes`, `ticket_module_catalog` |
| `20260713180000_add_sla_advanced_settings` | **Sprint 4** — `slaTargetPct`, `defaultBusinessHoursJson`, `organization_holidays` |

Colunas do **Sprint 3** (`emailFromName`, `emailReplyTo`, `emailFooterText`, `knowledgeBaseEnabled`, `knowledgeBaseUrl`, `notificationPrefsJson`) estão no `schema.prisma` e são sincronizadas com:

```powershell
cd D:\Aceleradores\specdriven-platform
npm run db:push
```

Recomendado após migrations: `npm run db:seed` (popula settings de demonstração, inclusive e-mail “Blend IT Suporte”).

---

## P2 — Backlog funcional

| Item | Valor | Dependência |
|------|-------|-------------|
| Logo upload (S3) | Branding no header cliente | Storage produção |
| SMTP por org | E-mail `@dominio-consultoria.com.br` | Secrets + UI credenciais |
| Tags visíveis ao cliente | Transparência no detalhe do chamado | Flag em Tag |
| `/settings/users` dedicado | Gestão de usuários sem misturar com clientes | — |
| UI LGPD completa | Conformidade | `privacy.ts` |
| Textos hero customizáveis | White-label do portal | — |
| SLA warning/breach (e-mail) | Proatividade | Job scheduler |
| Recalcular SLA em massa | Feriado retroativo | Job + confirmação gestor |

---

## Glossário

| Termo | Significado |
|-------|-------------|
| **Hub Settings** | Área `/settings` no portal staff |
| **Catálogo** | Tipos ITIL + módulos habilitados para o cliente |
| **Template de horário** | Horário comercial padrão da org, base para novas políticas SLA |
| **Meta SLA %** | Percentual alvo de cumprimento exibido em dashboards |
| **Portal settings** | Payload público `GET /portal/settings` para o app cliente |
| **Completude** | Indicadores automáticos de prontidão para o portal |

---

## Referências técnicas

- API: `apps/api/src/settings.ts`, rotas em `apps/api/src/index.ts`
- UI staff: `apps/web-staff/src/pages/settings/`
- UI cliente: `apps/web-client/src/lib/usePortalSettings.ts`
- Schemas compartilhados: `packages/shared/src/schemas.ts`
- Permissões: `apps/api/src/permissions.ts` (`canManageSettings`)
- Cálculo SLA: `apps/api/src/sla-calc.ts`
