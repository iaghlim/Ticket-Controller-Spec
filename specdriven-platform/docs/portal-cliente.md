# Portal cliente — SpecDriven Platform

App React (`apps/web-client`) — superfície do usuário do cliente final.

**Como usar no dia a dia:** [guia-de-uso.md](guia-de-uso.md) (seção Portal cliente).

**O que a consultoria configura para este portal:** [Configurações da consultoria](../../docs/settings.md).

## Escopo

- Login contra `POST /auth/login` (JWT no `localStorage`)
- Lista de chamados com filtro de status no server (`GET /tickets?status=…`)
- Criar chamado (`POST /tickets`) — chave gerada automaticamente
- Detalhe + comentários públicos + anexos (metadados / upload conforme storage)
- Configurações públicas da consultoria via `GET /portal/settings` (hook `usePortalSettings`)

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
| `/` | Home — categorias, SLA do mês, chamados recentes |
| `/tickets` | Lista + filtro status |
| `/tickets/new` | Criar chamado (key automática) |
| `/tickets/:key` | Detalhe, comentários, anexos |

## Configurável vs fixo

O portal cliente **não** tem tela de administração. Tudo que varia por consultoria vem de `GET /portal/settings` (configurado no staff em `/settings`).

### Configurável pela consultoria (reflete no cliente)

| Item | Efeito no portal |
|------|------------------|
| Nome da organização | Header, home, rótulos |
| E-mail de suporte | Footer com link `mailto:` |
| Texto de política de atendimento | Footer |
| Tipos de chamado habilitados | Grid de categorias na home; select na abertura |
| Módulos / áreas ativos | Select de módulo na abertura |
| Meta SLA % (`slaTargetPct`) | Card “SLA do mês” na home (ex.: “87% — meta 90%”) |
| Resumo de horário comercial | Texto/tooltip na home e detalhe do chamado |
| Base de conhecimento (toggle + URL) | Item na sidebar quando ativo |

Comportamento de **notificações** (sino in-app e e-mails) também é definido no staff, mas a matriz não é exibida ao cliente.

### Fixo ou interno (não exposto ao cliente)

| Item | Observação |
|------|------------|
| Logo da consultoria | `logoUrl` sempre `null` — upload previsto para P2 |
| Políticas SLA por cliente/prioridade | Afetam prazos nos tickets, sem tela de gestão no cliente |
| Feriados da organização | Entram no cálculo de `slaDueAt`, sem listagem no portal |
| Baseline / taxa horária / fator consultor | Staff only — decisão de produto |
| Tags do catálogo | Não exibidas no detalhe (P2: flag “visível ao cliente”) |
| Textos hero (“Como podemos ajudar?”) | Fixos no app — customização P2 |
| Gestão de usuários, convites, aprovações | Fluxos staff ou convite por e-mail |
| Comentários internos da consultoria | Nunca renderizados neste portal |
| Mudança de status / assignee | Apenas staff |

### Chamados legados

Se a consultoria desabilitar um tipo ou módulo depois da abertura, tickets antigos **mantêm** o valor original em modo somente leitura. Novos chamados só aceitam tipos/módulos ativos no catálogo (validação na API).

## Notas

- Role `cliente` só vê tickets do próprio `clientId`.
- Comentários internos não aparecem neste portal.
- Key: prefixo = `client.code` do seed (`DEMO`), sequência `DEMO-n`.
- Fallback local: se `/portal/settings` falhar, tipos e módulo “Geral” usam defaults de `packages/shared` até a API responder.
