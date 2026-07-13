# Guia de uso — SpecDriven Platform

Documentação orientada a **quem usa** o produto (cliente, consultor, gestor) e a **quem sobe o ambiente local**.  
Para contratos HTTP e arquitetura, veja [API](api.md) e [Arquitetura](arquitetura.md).

---

## 1. Visão rápida

| Superfície | Para quem | URL local |
|------------|-----------|-----------|
| Portal cliente | Usuário do cliente final | http://localhost:5173 |
| Portal consultoria (staff) | Gestor / consultor | http://localhost:5174 |
| API + OpenAPI | Integração / debug | http://localhost:3000 · docs em `/docs` |
| App desktop SpecDriven | Operação local + sync cloud | app Tauri (repo `SpecDriven`) |
| Mailpit (e-mail de dev) | Ver e-mails enviados | http://localhost:8025 |

### Contas seed (somente desenvolvimento)

| Papel | E-mail | Senha | Onde entrar |
|-------|--------|-------|-------------|
| Gestor | `gestor@specdriven.local` | `changeme` | Portal staff |
| Consultor | `consultor@specdriven.local` | `changeme` | Portal staff / desktop cloud |
| Cliente | `cliente@specdriven.local` | `changeme` | Portal cliente |

Chamado de demonstração: **DEMO-1** (cliente **Cliente Demo**).

---

## 2. Subir o ambiente local

> **Instalação detalhada (primeira vez):** siga o [Guia de instalação](../../docs/guia-instalacao.md) na raiz do repositório — inclui instalação de Node, Docker, `.env`, banco e verificação passo a passo.

Resumo para quem já tem tudo instalado:

```powershell
cd D:\Aceleradores\specdriven-platform
npm install
Copy-Item .env.example .env
docker compose up -d
npm run db:generate
npm run db:push
npm run db:seed
```

Em terminais separados (ou use `.\dev-all.bat` na raiz do monorepo):

```powershell
npm run dev:api
npm run dev:web-client
npm run dev:web-staff
```

O `dev-all.bat` abre os três processos em janelas próprias.
Opcional — e-mail real via Mailpit:

```powershell
docker compose up -d mailpit
# no .env: MAIL_PROVIDER=smtp, SMTP_HOST=127.0.0.1, SMTP_PORT=1025
```

Checklist rápido:

1. `GET http://localhost:3000/health` → `{ "status": "ok" }`
2. Abrir portal cliente ou staff e fazer login com a seed correspondente
3. OpenAPI: http://localhost:3000/docs

Detalhes de scripts e variáveis: [README raiz](../README.md) · instalação completa: [Guia de instalação](../../docs/guia-instalacao.md).

---

## 3. Portal cliente

App: `apps/web-client` · porta **5173**.

### 3.1 Login

1. Abra http://localhost:5173  
2. Entre com `cliente@specdriven.local` / `changeme`  
3. A sessão JWT fica no navegador; ao sair, o token é removido  

Só vê chamados do **próprio cliente** (`clientId`). Comentários **internos** da consultoria não aparecem.

### 3.2 Lista de chamados

1. Menu / rota **Chamados** (`/tickets`)  
2. Use o filtro de **status** (aplicado no servidor)  
3. Clique em um item para abrir o detalhe  

### 3.3 Abrir um chamado

1. **Novo chamado** (`/tickets/new`)  
2. Informe título e demais campos pedidos  
3. **Não** informe a chave — a API gera automaticamente no formato `{código-do-cliente}-{n}` (ex.: `DEMO-12`)  
4. Confirme → você cai no detalhe do chamado criado  

### 3.4 Acompanhar, comentar e anexar

No detalhe (`/tickets/:key`):

- Veja status e dados do chamado  
- Envie **comentários públicos** (visíveis para a consultoria)  
- Anexe arquivos: escolha o arquivo → **Enviar anexo** (sobe para MinIO/S3). Use **Baixar** nos itens com binário.  

### O que o cliente **não** faz neste portal

- Mudar status / assignee  
- Ver fila de outros clientes  
- Aprovar horas ou limites  
- Gerenciar convites  

---

## 4. Portal consultoria (staff)

App: `apps/web-staff` · porta **5174**.

### 4.1 Login

1. Abra http://localhost:5174  
2. Entre como gestor ou consultor (seed acima)  
3. Contas com role `cliente` são **bloqueadas** neste portal  

### 4.2 Fila de chamados

1. Abra a fila (`/tickets`)  
2. Filtre por status, cliente ou assignee conforme os controles da tela  
3. Abra um chamado ou use **Novo** para criar  

### 4.2.1 Busca global

No cabeçalho de qualquer página autenticada:

1. Digite no campo **Buscar chamados…** (chave, título ou trecho da descrição)  
2. Aguarde os resultados (`GET /search?q=`)  
3. Clique em um hit para abrir `/tickets/:key`  

### 4.3 Operar um chamado

No detalhe:

| Ação | Como |
|------|------|
| Mudar status | Seletor / PATCH de status |
| Atribuir responsável | Picker de usuários staff (`GET /users`) — ou limpar assignee |
| Comentar | Público (cliente vê) ou **interno** (só staff) |
| Anexos | Seletor de arquivo → upload MinIO + **Baixar** |
| Ver SLA | Painel com estado, prazo e minutos restantes/decorridos (`GET /tickets/:key/sla`) |
| Lançar horas | Seção **Horas** — minutos + nota opcional → `POST /tickets/:key/time-entries` |
| Menu **Ações** | Ao lado do status: **Registrar horas** (foca o form) ou **Pedir aprovação de horas** (limite) |
| Categoria ITIL | Seletor `ticketType` (melhoria, incidente, dúvida, problema) → `PATCH` |
| Prioridade | Seletor (`baixa`, `media`, `alta`, `critica`) → `PATCH` |
| Tags | Chips do catálogo da organização → `PUT /tickets/:key/tags` |
| Limite de horas | Gestor define teto do chamado (ver [Aprovações](aprovacoes.md)) |

### 4.4 Clientes e convites

Na área de **Clientes**:

1. Liste clientes da organização  
2. Crie cliente quando necessário  
3. **Convide** usuários (e-mail + role) — o convidado aceita via fluxo de aceite (`POST /invites/accept`)  
4. Consulte usuários staff para atribuição  

E-mails de convite: com `MAIL_PROVIDER=log` vão para o log da API; com `smtp` + Mailpit, abra http://localhost:8025.

### 4.5 Aprovações

Rota `/approvals` — detalhes em [aprovacoes.md](aprovacoes.md).

Fluxos típicos:

1. **Status de chamado** — consultor solicita mudança; gestor aprova ou rejeita  
2. **Limite de horas** — pedido para subir o teto; gestor decide  
3. **Lançamento de horas** — se o apontamento estoura o limite, fica pendente até o gestor aprovar  

Só o **gestor** aprova/rejeita.

### 4.6 Relatórios

Abra **Relatórios** para contagens por status / assignee (visão operacional básica).

### 4.7 Configurar a consultoria

Hub unificado em **Configurações** (`/settings`). Documentação completa: **[Configurações da consultoria](../../docs/settings.md)**.

**Quem edita:** gestor ou admin. Consultor entra em modo leitura.

Passos rápidos (primeira configuração):

1. Abra **Configurações** na sidebar do portal staff.
2. Em **Perfil da organização**, defina nome exibido e e-mail de suporte.
3. Em **Catálogo**, confira tipos ITIL habilitados e módulos/áreas do cliente.
4. Em **SLA**, cadastre ao menos uma política; opcionalmente feriados, horário comercial padrão e meta %.
5. Em **E-mail** e **Notificações**, ajuste identidade de envio e avisos ao cliente.
6. Em **Portal cliente**, ative a base de conhecimento se houver URL externa.
7. Na **Visão geral**, confira os indicadores de completude (Perfil, SLA, Catálogo, Comunicação).

O portal cliente reflete nome, suporte, catálogo, meta SLA e KB via `GET /portal/settings` — sem redeploy. Baseline e políticas SLA detalhadas permanecem só no staff.

---

## 5. App desktop + modo Cloud

O desktop (**SpecDriven**) continua **local-first**. O modo Cloud liga o workspace ao núcleo.

Guia técnico completo: [sync-desktop.md](sync-desktop.md).  
Jornadas locais (sem cloud): pasta `SpecDriven/docs/funcional/`.

### 5.1 Ativar Cloud

1. Abra o SpecDriven e configure a pasta raiz do workspace (se ainda não houver)  
2. **Configurações → Modo Local | Cloud** → escolha **Cloud**  
3. URL da API local: `http://127.0.0.1:3000`  
4. Login staff, ex.: `consultor@specdriven.local` / `changeme`  

### 5.2 Sincronizar

1. Clique em **Sincronizar agora**  
2. O app faz pull na API, **grava tickets no disco** (`{raiz}/{Cliente}/{KEY}/meta.json`, notas, horas…) e em seguida push  
3. Confira na Home/clientes o chamado (ex.: `Cliente Demo/DEMO-1`)  

### 5.3 Horas e documentos

- Ao **parar o timer**, a última entrada de horas sobe para a cloud (best-effort)  
- No wizard EF / ET / TU, em modo Cloud com login: após **Gerar**, o `.docx` tenta upload para a API/storage  

Se o upload falhar (MinIO/S3 ausente), o arquivo **local** já foi gerado; só a cópia cloud fica pendente.

---

## 6. Fluxos ponta a ponta (receitas)

### 6.1 Cliente abre chamado → consultoria responde

1. Cliente: login → **Novo chamado** → comenta  
2. Staff: fila → abre o key gerado → comenta (público) e/ou interno → atualiza status / assignee  
3. Cliente: detalhe → vê status e comentários públicos  

### 6.2 Convidar usuário cliente

1. Gestor/consultor (conforme permissão): **Clientes** → convite role `cliente`  
2. Convidado aceita com token + nome + senha (fluxo de aceite da API)  
3. Novo usuário entra no portal cliente  

### 6.3 Horas com limite e aprovação

1. Gestor define limite no chamado (ex.: seed DEMO-1 = 60 min)  
2. Consultor lança horas além do teto → fica pendente  
3. Gestor em **/approvals** aprova ou rejeita  

### 6.4 Desktop alinhado à cloud

1. API + seed no ar  
2. Desktop Cloud → login → **Sincronizar agora**  
3. Pasta local espelha DEMO-1; timer stop envia horas  

---

## 7. Papéis e permissões (resumo)

| Capacidade | Cliente | Consultor | Gestor |
|------------|---------|-----------|--------|
| Ver só próprios chamados | sim | — | — |
| Ver fila / todos os clientes | não | sim | sim |
| Criar chamado | sim | sim | sim |
| Comentário público | sim | sim | sim |
| Comentário interno | não | sim | sim |
| PATCH status / assignee | não | sim* | sim |
| Aprovar / rejeitar | não | não | sim |
| Definir limite de horas | não | não | sim |
| Convites | não | limitado | sim |
| Sync desktop cloud | não | sim | sim |

\*Algumas mudanças de status podem passar por **aprovação** conforme política do chamado — ver [aprovacoes.md](aprovacoes.md).

---

## 8. Problemas comuns

| Sintoma | O que checar |
|---------|----------------|
| Login falha | `npm run db:seed`; `DEV_AUTH_BYPASS=false` se quiser auth real; Postgres no ar |
| Portal não fala com API | `VITE_API_URL` nos `.env` dos apps web (default `http://localhost:3000`) |
| Cliente vê 403 / lista vazia | Usuário sem `clientId` ou ticket de outro cliente |
| Anexo sem arquivo | MinIO no `docker compose` + vars `S3_*` |
| E-mail não chega | `MAIL_PROVIDER=smtp` + Mailpit; senão só log na API |
| Sync não cria pasta | Modo Cloud + login OK; depois **Sincronizar agora**; API com seed |
| Staff bloqueia login cliente | Esperado — use o portal **5173** |

---

## 9. Onde aprofundar

| Doc | Quando usar |
|-----|-------------|
| [portal-cliente.md](portal-cliente.md) | Escopo técnico do app cliente |
| [Configurações da consultoria](../../docs/settings.md) | Hub `/settings` e reflexo no portal cliente |
| [portal-staff.md](portal-staff.md) | Escopo técnico do app staff |
| [aprovacoes.md](aprovacoes.md) | Regras de approve/reject |
| [sync-desktop.md](sync-desktop.md) | Detalhe do pull/push e materialização |
| [api.md](api.md) | Contratos HTTP |
| OpenAPI `/docs` | Experimentar endpoints |
| `SpecDriven/docs/funcional/` | Uso do desktop local (sem cloud) |
