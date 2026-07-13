# Portal consultoria (staff)

App: `apps/web-staff` (Vite/React, porta **5174**).

**Como usar no dia a dia:** [guia-de-uso.md](guia-de-uso.md) (seção Portal consultoria).  
Aprovações: [aprovacoes.md](aprovacoes.md).

## Escopo

- Login staff (`gestor` / `consultor`) — role `cliente` bloqueada
- Fila de tickets + detalhe (status, assignee via `GET /users`, comentários internos/públicos)
- **Busca global** no cabeçalho (`GET /search?q=`) — chave, título ou descrição → link para `/tickets/:key`
- Detalhe do chamado:
  - **SLA** — painel com estado (`ok` / `breached` / `paused` / `done`), prazo e minutos (`GET /tickets/:key/sla`)
  - **Horas** — lista de apontamentos, totais e formulário de lançamento (`GET|POST /tickets/:key/time-entries`)
  - **Menu Ações** — registrar horas (foca o form) e pedir aprovação de limite (`POST /approvals` `kind: hour_limit`)
  - **Categoria ITIL** — `ticketType` (`melhoria` \| `incidente` \| `duvida` \| `problema`) editável via `PATCH`
  - **Prioridade** — `baixa` \| `media` \| `alta` \| `critica` editável via `PATCH`
  - **Tags** — atribuição a partir do catálogo (`GET|PUT /tickets/:key/tags`, `GET /tags`)
- Clientes + convites + lista de usuários
- Aprovações (`/approvals`)
- Relatórios básicos (`GET /reports/tickets`)

**Fora deste portal (ficam no desktop):** wizard Word, timer overlay, checklist/notas em arquivo, ZIP/duplicar, abrir pasta no SO.

## Seeds

| Role | Email | Senha |
|------|-------|-------|
| gestor | `gestor@specdriven.local` | `changeme` |
| consultor | `consultor@specdriven.local` | `changeme` |

## Como rodar

```powershell
npm run dev:api
npm run dev:web-staff
```

→ http://localhost:5174

OpenAPI da API: `http://localhost:3000/docs`
