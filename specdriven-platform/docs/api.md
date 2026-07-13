# API — SpecDriven Platform

Base URL local: `http://localhost:3000`

## Endpoints implementados

### `GET /health`

**200** `{ "status": "ok" }`

### `GET /` e `GET /hello`

Mensagem de identificação da API SpecDriven.

### `POST /auth/login`

Body: `{ "email": string, "password": string }`

- Com `DEV_AUTH_BYPASS=true`: retorna `{ token: "dev-token", user, mode: "dev_bypass" }` sem DB.
- Com DB + seed: valida usuários seed (`gestor@specdriven.local`, `consultor@specdriven.local` ou `cliente@specdriven.local` / `changeme`, somente local) e devolve JWT HMAC.

### `GET /auth/me`

Header: `Authorization: Bearer <token>`

Retorna o usuário autenticado ou **401**.

### `GET /clients`

Lista clientes da organização (requer auth).  
Role `cliente`: só o próprio `clientId`.

### `POST /clients`

Body: `{ name, code? }` — staff (`gestor` | `consultor`) + DB.

### `GET /invites` / `POST /invites` (Fase C)

- **GET** — lista convites da org (staff).
- **POST** body: `{ email, role, clientId?, expiresInDays? }`
  - `gestor`: qualquer role
  - `consultor`: só `role: "cliente"` (exige `clientId`)
  - Dispara e-mail via `MAIL_PROVIDER` (`log` = stub stdout; `smtp` = nodemailer)
  - Resposta inclui `token` uma vez (smoke local)

### `POST /invites/accept`

Público (sem auth). Body: `{ token, name, password }` (senha ≥ 8).  
Cria usuário, marca `acceptedAt`. Depois: `POST /auth/login`.

### `GET /users` (Fase C)

Staff only (`gestor` | `consultor`). Lista usuários da org (sem `passwordHash`).  
Query opcional: `?role=gestor,consultor` (filtro por papéis, CSV).  
Usado pelo portal staff no picker de assignee.

### `GET /tickets`

Lista tickets da organização do usuário (requer auth).  
Query opcional: `?status=<TicketStatus>`.  
Role `cliente`: filtrado pelo `clientId`.  
Sem Postgres: **503** (em bypass pode devolver lista vazia).

### `POST /tickets`

Body: `{ title, clientId, key?, description?, status?, priority?, estimateMinutes? }`  
`key` opcional — auto-gerada a partir do `code` do cliente (role `cliente` nunca escolhe key).  
Se informada, deve casar `^[A-Z][A-Z0-9]+-\d+$`.  
Role `cliente`: `clientId` deve ser o do próprio usuário (**403** `forbidden_client_scope` se divergir).

### `GET /tickets/:key`

Detalhe por chave (requer auth).

### `PATCH /tickets/:key` (Fase C)

Staff only (`gestor` | `consultor`).  
Body: `{ status?, assigneeId? }` (pelo menos um; `assigneeId: null` remove atribuição).  
`assigneeId` deve ser usuário staff da mesma org.  
Mudança de status dispara e-mail stub para um usuário `cliente` do client (se existir).

### `GET|POST /tickets/:key/comments`

- Listar: cliente só vê `visibility: public`.
- Criar body: `{ body, visibility? }` — `internal` bloqueado para role `cliente`.

### `GET|POST /tickets/:key/attachments`

- **JSON** body `{ fileName, mimeType?, sizeBytes? }` → metadados (`local://…`).
- **multipart** field `file` → upload real no MinIO/S3 quando `S3_ENDPOINT` está definido.
- `GET /tickets/:key/attachments/:id/download` → URL pré-assinada (só objetos `s3://…`).

### `GET /reports/tickets` (Fase C)

Staff only. Contagens: `byStatus`, `byAssignee`, `unassigned`, `total`.

### Aprovações / horas (Fase C)

Ver também [aprovacoes.md](./aprovacoes.md).

| Método | Rota | Quem | Notas |
|--------|------|------|-------|
| `GET` | `/approvals` | staff | Query: `status`, `kind`, `ticketKey` |
| `POST` | `/approvals` | staff | `kind`: `ticket` \| `hour_limit` \| `time_entry` |
| `POST` | `/approvals/:id/approve` | **gestor** | Aplica efeito (status / limite / time entry) |
| `POST` | `/approvals/:id/reject` | **gestor** | |
| `PATCH` | `/tickets/:key/hour-limit` | **gestor** | Body `{ hourLimitMinutes }` |
| `GET\|POST` | `/tickets/:key/time-entries` | staff | POST excede limite → pending + approval |

UI staff: `/approvals`.

### Tags (Fase E)

#### `GET /tags` / `POST /tags` / `PATCH /tags/:id` / `DELETE /tags/:id`

Catálogo por organização. Create/update/delete: staff.

#### `GET /tickets/:key/tags`

Lista tags do ticket (cliente só do próprio client).

#### `PUT /tickets/:key/tags` / `POST /tickets/:key/tags` / `DELETE /tickets/:key/tags/:tagId`

Staff. `PUT` body `{ tagIds: uuid[] }` substitui o conjunto; `POST` `{ tagId }` adiciona.

### Histórico de status (Fase E)

#### `GET /tickets/:key/status-history`

Lista cronológica `{ history: [{ fromStatus, toStatus, changedBy, createdAt, note }] }`.  
`PATCH /tickets/:key` com mudança de status **grava** automaticamente uma entrada (e `POST /tickets` grava criação).

### SLA (Fase E)

#### `GET /sla-policies` / `POST /sla-policies` / `PATCH /sla-policies/:id` / `DELETE /sla-policies/:id`

Política por cliente (horas úteis). Create/update/delete: **gestor**.  
Body create: `{ clientId, responseMinutes, resolutionMinutes, name?, priorityMatch?, businessHourStart?, businessHourEnd?, weekdays? }`.  
`priorityMatch: ""` = default do cliente; valor = match de `ticket.priority`.

#### `GET /tickets/:key/sla`

Estado calculado: `{ sla: { state: ok|breached|paused|done, dueAt, policy, elapsedBusinessMinutes, remainingBusinessMinutes, … } }`.  
`slaDueAt` preenchido na criação do ticket quando há política.

### `GET /_meta/routes`

Inventário de rotas + flags (`DEV_AUTH_BYPASS`, `storageConfigured`, `mailProvider`).

## Exemplos (PowerShell)

```powershell
# smoke sem DB
$env:DEV_AUTH_BYPASS="true"
# (reinicie a API com essa env)

Invoke-RestMethod http://localhost:3000/health
$login = Invoke-RestMethod -Method Post http://localhost:3000/auth/login -ContentType application/json -Body '{"email":"dev@local","password":"x"}'
Invoke-RestMethod http://localhost:3000/auth/me -Headers @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod http://localhost:3000/tickets -Headers @{ Authorization = "Bearer $($login.token)" }
```

Com Docker + seed (Fase C):

```powershell
docker compose up -d
npm run db:push
npm run db:seed -w @specdriven/api
# DEV_AUTH_BYPASS=false (ou unset)
$login = Invoke-RestMethod -Method Post http://localhost:3000/auth/login -ContentType application/json -Body '{"email":"gestor@specdriven.local","password":"changeme"}'
$h = @{ Authorization = "Bearer $($login.token)" }

# PATCH status / assignee
Invoke-RestMethod -Method Patch http://localhost:3000/tickets/DEMO-1 -Headers $h -ContentType application/json -Body '{"status":"em_andamento"}'

# Users (picker assignee)
$users = Invoke-RestMethod http://localhost:3000/users?role=gestor,consultor -Headers $h
$consultor = $users.users | Where-Object { $_.email -eq "consultor@specdriven.local" }
Invoke-RestMethod -Method Patch http://localhost:3000/tickets/DEMO-1 -Headers $h -ContentType application/json -Body (@{ assigneeId = $consultor.id } | ConvertTo-Json)

# Convite
$inv = Invoke-RestMethod -Method Post http://localhost:3000/invites -Headers $h -ContentType application/json -Body '{"email":"novo@example.com","role":"cliente","clientId":"00000000-0000-4000-8000-000000000002"}'
Invoke-RestMethod -Method Post http://localhost:3000/invites/accept -ContentType application/json -Body (@{ token = $inv.invite.token; name = "Novo"; password = "changeme1" } | ConvertTo-Json)

# Relatório
Invoke-RestMethod http://localhost:3000/reports/tickets -Headers $h

# Tags / SLA / histórico (Fase E)
$tag = Invoke-RestMethod -Method Post http://localhost:3000/tags -Headers $h -ContentType application/json -Body '{"name":"smoke","color":"#333"}'
Invoke-RestMethod -Method Put "http://localhost:3000/tickets/DEMO-1/tags" -Headers $h -ContentType application/json -Body (@{ tagIds = @($tag.tag.id) } | ConvertTo-Json)
Invoke-RestMethod -Method Patch http://localhost:3000/tickets/DEMO-1 -Headers $h -ContentType application/json -Body '{"status":"em_andamento"}'
Invoke-RestMethod http://localhost:3000/tickets/DEMO-1/status-history -Headers $h
Invoke-RestMethod http://localhost:3000/tickets/DEMO-1/sla -Headers $h
Invoke-RestMethod http://localhost:3000/sla-policies -Headers $h

# Aprovações (chamados / horas)
$loginC = Invoke-RestMethod -Method Post http://localhost:3000/auth/login -ContentType application/json -Body '{"email":"consultor@specdriven.local","password":"changeme"}'
$hc = @{ Authorization = "Bearer $($loginC.token)" }
$req = Invoke-RestMethod -Method Post http://localhost:3000/approvals -Headers $hc -ContentType application/json -Body '{"kind":"ticket","ticketKey":"DEMO-1","targetStatus":"em_teste","reason":"smoke"}'
Invoke-RestMethod -Method Post "http://localhost:3000/approvals/$($req.approval.id)/approve" -Headers $h -ContentType application/json -Body '{}'
Invoke-RestMethod -Method Patch http://localhost:3000/tickets/DEMO-1/hour-limit -Headers $h -ContentType application/json -Body '{"hourLimitMinutes":30}'
$over = Invoke-RestMethod -Method Post http://localhost:3000/tickets/DEMO-1/time-entries -Headers $hc -ContentType application/json -Body '{"seconds":3600,"note":"excede limite"}'
# se requiresApproval=true → approve/reject via /approvals/:id

# Upload binário (MinIO)
curl.exe -X POST "http://localhost:3000/tickets/DEMO-1/attachments" -H "Authorization: Bearer $($login.token)" -F "file=@README.md"
```

## Como subir

Ver [README raiz](../README.md).

## Env (Fase C)

| Variável | Default | Uso |
|----------|---------|-----|
| `MAIL_PROVIDER` | `log` | `log` = stub stdout; `smtp` = nodemailer |
| `MAIL_FROM` | `noreply@specdriven.local` | Remetente SMTP |
| `SMTP_HOST` | — | Host SMTP (obrigatório se `smtp`) |
| `SMTP_PORT` | `587` | Porta SMTP (Mailpit local: `1025`) |
| `SMTP_SECURE` | `false` | TLS implícito (`true` = porta 465) |
| `SMTP_USER` / `SMTP_PASS` | — | Auth opcional (Mailpit não exige) |
| `APP_PUBLIC_URL` | `http://localhost:5173` | Link no e-mail de convite / status |
| `S3_ENDPOINT` | (vazio = sem storage) | MinIO `http://127.0.0.1:9000` |
| `S3_BUCKET` | `specdriven` | Bucket |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | `minioadmin` | Credenciais locais |

### E-mail local (Mailpit)

```powershell
docker compose up -d mailpit
```

No `.env`: `MAIL_PROVIDER=smtp`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`.  
UI: `http://localhost:8025`. Eventos: convite (`POST /invites`) e mudança de status (`PATCH /tickets/:key`).

Se SMTP falhar (host down / misconfig), a API faz fallback para o stub `log` e o fluxo HTTP segue.

## Próximas rotas / gaps

- UI staff para tags/SLA (API pronta; plano não exige UI nesta fatia)
- Filtro fila consultor (atribuídos + não atribuídos) se UI exigir query extra
- E-mail em criação de chamado / novo comentário (roadmap; SMTP workstream)

## Catch-all (OpenAPI / sync / billing / notif / LGPD)

| Método | Rota | Notas |
|--------|------|-------|
| UI | `GET /docs` | OpenAPI Swagger UI |
| GET | `/sync/pull?since=` | Desktop Fase D — tickets/comments/timeEntries |
| POST | `/sync/push` | Push horas/comentários do desktop |
| GET | `/search?q=` | Busca full-text substring em key/title/description |
| GET\|POST | `/tickets/:key/time-entries` | Horas multi-user por ticket |
| GET | `/time-entries?from=&to=&format=csv` | Intervalo + CSV |
| GET | `/notifications` | In-app; `POST …/read` e `…/read-all` |
| PATCH | `/clients/:id/billing` | baselineHoursMonth + hourlyRateCents (gestor) |
| PATCH | `/users/:id/billing` | hourRateFactor (gestor) |
| GET | `/billing/summary?clientId=&from=&to=` | Consumo baseline + custo interno |
| DELETE | `/tickets/:key` | Soft-delete; `POST …/restore` (gestor) |
| GET | `/privacy/export` | Export LGPD do usuário |
| POST | `/privacy/delete` | Anonimização LGPD |
| GET | `/audit` | Audit log (gestor) |

Ticket também aceita `ticketType` (`melhoria`\|`incidente`\|`duvida`\|`problema`) e `countsTowardBaseline` no create/PATCH.