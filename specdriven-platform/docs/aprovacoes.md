# Workflows de aprovação

Fase C do roadmap: aprovação de **chamados**, **limite de horas** e **lançamentos** que excedem o limite.

## Papéis

| Ação | Consultor | Gestor | Cliente |
|------|-----------|--------|---------|
| Solicitar aprovação | sim | sim | não |
| Aprovar / rejeitar | não | sim | não |
| Definir `hourLimitMinutes` | não | sim | não |
| Lançar horas | sim | sim | não |

## Fluxos

1. **Chamado** — staff `POST /approvals` `{ kind: "ticket", ticketKey, targetStatus }` → gestor approve aplica o status.
2. **Limite** — gestor `PATCH /tickets/:key/hour-limit` ou consultor pede `hour_limit` → approve sobe o teto.
3. **Horas** — `POST /tickets/:key/time-entries`; se `approvedSeconds + novo > hourLimitMinutes * 60`, cria entry `pending` + approval `time_entry`.

## UI

Portal staff: `/approvals` (`ApprovalsPage.tsx`).

## Seed

`DEMO-1` com `hourLimitMinutes: 60` e pedidos pending `ticket` + `hour_limit` (requester = consultor).
