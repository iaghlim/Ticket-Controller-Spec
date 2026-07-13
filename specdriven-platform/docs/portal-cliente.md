# Portal cliente — SpecDriven Platform

App React (`apps/web-client`) — superfície do usuário do cliente final.

**Como usar no dia a dia:** [guia-de-uso.md](guia-de-uso.md) (seção Portal cliente).

## Escopo

- Login contra `POST /auth/login` (JWT no `localStorage`)
- Lista de chamados com filtro de status no server (`GET /tickets?status=…`)
- Criar chamado (`POST /tickets`) — chave gerada automaticamente
- Detalhe + comentários públicos + anexos (metadados / upload conforme storage)

## Como rodar

```powershell
npm run db:seed
npm run dev:api
npm run dev:web-client
```

Abra `http://localhost:5173`:

| Campo | Valor |
|-------|-------|
| E-mail | `cliente@specdriven.local` |
| Senha | `changeme` (**local only**) |

API base: `VITE_API_URL` (default `http://localhost:3000`).

## Rotas UI

| Rota | Função |
|------|--------|
| `/login` | Login |
| `/tickets` | Lista + filtro status |
| `/tickets/new` | Criar chamado (key automática) |
| `/tickets/:key` | Detalhe, comentários, anexos |

## Notas

- Role `cliente` só vê tickets do próprio `clientId`.
- Comentários internos não aparecem neste portal.
- Key: prefixo = `client.code` do seed (`DEMO`), sequência `DEMO-n`.
