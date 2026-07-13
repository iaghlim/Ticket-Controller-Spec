# Guia de instalação — passo a passo

Este manual explica **como colocar o projeto para rodar no seu computador**, do zero.  
Foi escrito para pessoas com conhecimento técnico básico — não é necessário ser programador, mas é preciso seguir os passos na ordem e copiar os comandos com atenção.

**Sistema operacional:** Windows 10 ou 11 (64 bits).  
**Tempo estimado (primeira vez):** 45–90 minutos (inclui downloads).

---

## O que você vai subir

O repositório tem três partes. Na maioria dos casos, comece pela **plataforma cloud**:

| Parte | Pasta | O que é | Precisa de Docker? |
|-------|-------|---------|-------------------|
| **Plataforma cloud** | `specdriven-platform/` | API + portais web (cliente e consultoria) | **Sim** (banco de dados) |
| **App desktop** | `SpecDriven/` | Programa Windows para uso local | Não |
| **Mock de UI** | `Mock_FIGMA/` | Protótipo visual (opcional) | Não |

Este guia cobre as três. Se você só precisa dos portais web, siga até a **Parte 2** e pule a Parte 3.

---

## Parte 1 — Instalar as ferramentas base

Instale **nesta ordem**. Ao terminar cada item, rode o comando de verificação no **PowerShell** ou **Prompt de Comando**.

### 1.1 Git

Necessário para clonar e atualizar o repositório.

1. Baixe em: https://git-scm.com/download/win  
2. Na instalação, aceite as opções padrão (Next, Next…).  
3. Abra um **novo** PowerShell e verifique:

```powershell
git --version
```

Deve aparecer algo como `git version 2.x.x`.

### 1.2 Node.js (versão 20 ou superior)

Node executa a API e os portais web.

1. Baixe a versão **LTS** em: https://nodejs.org/  
2. Instale marcando a opção **“Automatically install the necessary tools”** se aparecer.  
3. Feche e abra o PowerShell de novo. Verifique:

```powershell
node -v
npm -v
```

- `node -v` deve mostrar `v20.x.x` ou superior.  
- `npm -v` deve mostrar `10.x.x` ou superior.

### 1.3 Docker Desktop

O banco de dados Postgres (e serviços auxiliares) rodam dentro de containers Docker.

1. Baixe em: https://www.docker.com/products/docker-desktop/  
2. Instale e **reinicie o computador** se o instalador pedir.  
3. Abra o **Docker Desktop** e aguarde até o ícone na bandeja ficar estável (pode levar 1–2 minutos na primeira vez).  
4. No PowerShell:

```powershell
docker --version
docker compose version
```

Ambos devem responder com números de versão, sem erro.

> **Se o Docker não iniciar:** verifique se a virtualização está habilitada na BIOS/UEFI e se o WSL 2 está instalado (o próprio Docker Desktop costuma orientar).

### 1.4 (Opcional) App desktop — Rust e compilador C++

Só necessário se for rodar o app **SpecDriven** (Parte 3).

| Ferramenta | Link | Verificação |
|------------|------|-------------|
| Rust (rustup) | https://rustup.rs/ | `rustc --version` e `cargo --version` |
| Visual Studio Build Tools 2022 | https://visualstudio.microsoft.com/downloads/ → “Build Tools” | Na instalação, marque **“Desenvolvimento para desktop com C++”** |

WebView2 já vem no Windows 10/11 recente.

---

## Parte 2 — Plataforma cloud (`specdriven-platform`)

### 2.1 Obter o código

Se ainda não tiver a pasta do projeto:

```powershell
git clone https://github.com/iaghlim/Ticket-Controller-Spec.git
cd Ticket-Controller-Spec
```

Se você já clonou antes, entre na pasta e atualize:

```powershell
cd caminho\para\Ticket-Controller-Spec
git pull
```

### 2.2 Entrar na pasta da plataforma

```powershell
cd specdriven-platform
```

Todos os comandos desta Parte 2 devem ser executados **dentro de `specdriven-platform`**, salvo indicação contrária.

### 2.3 Instalar dependências do Node

```powershell
npm install
```

- Pode demorar alguns minutos.  
- É normal ver muitas linhas de download.  
- **Erro comum:** `npm ERR!` por falta de internet ou proxy — verifique a conexão e tente de novo.

### 2.4 Criar arquivo de configuração (`.env`)

O projeto usa um arquivo `.env` com senhas e URLs **apenas para desenvolvimento local**. Ele **não** vai para o Git.

**Raiz do monorepo** (`specdriven-platform/.env`):

```powershell
Copy-Item .env.example .env
```

**Portais web** (opcional — se não existir `.env`, o padrão `http://localhost:3000` já funciona):

```powershell
Copy-Item apps\web-client\.env.example apps\web-client\.env
Copy-Item apps\web-staff\.env.example apps\web-staff\.env
```

Não é necessário editar esses arquivos na primeira execução.

### 2.5 Subir o Docker (banco de dados e serviços)

Certifique-se de que o **Docker Desktop está aberto** (ícone verde/estável).

```powershell
docker compose up -d
```

Isso sobe:

| Serviço | Função | Porta |
|---------|--------|-------|
| Postgres | Banco de dados | 5432 |
| MinIO | Armazenamento de arquivos (anexos) | 9000 (API), 9001 (console) |
| Mailpit | Caixa de e-mail de teste | 8025 (interface web) |

Verifique se os containers estão rodando:

```powershell
docker compose ps
```

A coluna **STATUS** deve mostrar `running` ou `healthy` para `specdriven-postgres`, `specdriven-minio` e `specdriven-mailpit`.

**Erro comum — porta 5432 em uso:** outro Postgres já está instalado na máquina. Pare o outro serviço ou altere a porta no `docker-compose.yml` e no `DATABASE_URL` do `.env`.

### 2.6 Preparar o banco de dados

Ainda em `specdriven-platform`:

```powershell
npm run db:generate
npm run db:push
npm run db:seed
```

| Comando | O que faz |
|---------|-----------|
| `db:generate` | Gera o cliente Prisma (código que fala com o Postgres) |
| `db:push` | Cria as tabelas no banco |
| `db:seed` | Insere usuários e dados de demonstração |

Se `db:push` falhar com erro de conexão, volte ao passo 2.5 e confirme que o Postgres está `healthy`.

### 2.7 Iniciar API e portais

Você precisa de **três processos** ao mesmo tempo. Duas formas:

#### Opção A — Um clique (recomendado no Windows)

```powershell
.\dev-all.bat
```

Abre **três janelas** de terminal:

- API → http://localhost:3000  
- Portal cliente → http://localhost:5173  
- Portal consultoria (staff) → http://localhost:5174  

Para parar: feche cada janela.

#### Opção B — Três terminais separados

Abra três PowerShell na pasta `specdriven-platform` e rode um comando em cada:

```powershell
# Terminal 1
npm run dev:api

# Terminal 2
npm run dev:web-client

# Terminal 3
npm run dev:web-staff
```

Aguarde mensagens como `Server listening` (API) e `Local: http://localhost:5173` (Vite).

### 2.8 Confirmar que está funcionando

| Teste | Como | Resultado esperado |
|-------|------|-------------------|
| API viva | Abra no navegador: http://localhost:3000/health | `{"status":"ok"}` |
| Documentação da API | http://localhost:3000/docs | Página Swagger/OpenAPI |
| Portal cliente | http://localhost:5173 | Tela de login |
| Portal staff | http://localhost:5174 | Tela de login |
| Mailpit (e-mails) | http://localhost:8025 | Interface de e-mails de teste |

**Login de teste (somente desenvolvimento):**

| Papel | E-mail | Senha | Onde usar |
|-------|--------|-------|-----------|
| Gestor | `gestor@specdriven.local` | `changeme` | Portal staff (:5174) |
| Consultor | `consultor@specdriven.local` | `changeme` | Portal staff |
| Cliente | `cliente@specdriven.local` | `changeme` | Portal cliente (:5173) |

Chamado de demonstração: **DEMO-1**.

### 2.9 Uso diário (depois da primeira instalação)

Sempre que for trabalhar de novo:

1. Abrir **Docker Desktop** e aguardar ficar pronto.  
2. No PowerShell:

```powershell
cd specdriven-platform
docker compose up -d
.\dev-all.bat
```

Não precisa rodar `npm install` nem `db:seed` de novo, a menos que o código ou o banco tenham mudado (após `git pull`, rode `npm install` e, se houver migrations novas, `npm run db:push`).

### 2.10 Problemas comuns — plataforma

| Sintoma | Causa provável | O que fazer |
|---------|----------------|-------------|
| `ECONNREFUSED` na API | Postgres não está no ar | `docker compose up -d` e `docker compose ps` |
| Portal em branco / erro de rede | API não está rodando | Confirme terminal da API sem erro; teste `/health` |
| `port 3000 already in use` | Outro programa na porta 3000 | Feche o outro processo ou mude `PORT` no `.env` |
| `npm install` muito lento | Rede ou antivírus | Tente de novo; exclua `node_modules` e rode `npm install` outra vez |
| Login não funciona | Seed não rodou | `npm run db:seed` de novo |
| Anexos falham | MinIO parado | `docker compose up -d minio` |

Para mais detalhes de uso dos portais, veja [guia-de-uso.md](../specdriven-platform/docs/guia-de-uso.md).

---

## Parte 3 — App desktop (`SpecDriven`)

O app desktop **não precisa de Docker**. Funciona offline; a sincronização com a cloud é opcional (com a plataforma da Parte 2 no ar).

### 3.1 Pré-requisitos

Conclua a **Parte 1** (Git + Node). Instale também Rust e Build Tools (seção 1.4).

### 3.2 Instalar e rodar

```powershell
cd SpecDriven
npm install
npm run tauri dev
```

- Na **primeira execução**, o Rust pode compilar por **10–30 minutos**. Isso é normal.  
- Uma janela do aplicativo deve abrir quando terminar.  
- O frontend de desenvolvimento usa a porta **1420** internamente.

### 3.3 Primeiro uso no app

1. Na tela inicial, escolha ou crie uma **pasta raiz** no disco (ex.: `Documentos\SpecDrivenWorkspace`).  
2. O app cria a estrutura `Cliente/Chamado/` automaticamente.  
3. Para sync com a cloud: a API da Parte 2 deve estar rodando; configure login cloud nas configurações do app (veja [sync-desktop.md](../specdriven-platform/docs/sync-desktop.md)).

### 3.4 Build de produção (instalador)

```powershell
npm run tauri build
```

O instalador sai em `src-tauri\target\release\bundle\`.

### 3.5 Problemas comuns — desktop

| Sintoma | O que fazer |
|---------|-------------|
| `link.exe` not found | Instale Visual Studio Build Tools com C++ |
| Compilação Rust muito lenta | Primeira vez é normal; próximas são mais rápidas |
| Erro após mover pasta do projeto | `cd src-tauri` → `cargo clean` → tente de novo |
| App não abre | Verifique WebView2; atualize o Windows |

Documentação técnica adicional: [SpecDriven/docs](../SpecDriven/docs/README.md).

---

## Parte 4 — Mock de UI (`Mock_FIGMA`) — opcional

Protótipo visual exportado do Figma. Não depende da API nem do Docker.

```powershell
cd Mock_FIGMA
npm install
npm run dev
```

Abra a URL que o terminal mostrar (geralmente http://localhost:5173 — feche o portal cliente antes se estiver usando a mesma porta).

---

## Resumo visual do fluxo (plataforma)

```text
[Docker Desktop]
       │
       ▼
docker compose up -d  ──►  Postgres + MinIO + Mailpit
       │
       ▼
npm run db:push/seed  ──►  Tabelas + usuários de teste
       │
       ▼
dev-all.bat           ──►  API :3000 + Cliente :5173 + Staff :5174
       │
       ▼
Navegador             ──►  Login com contas seed
```

---

## Checklist para repassar a outra pessoa

Copie e marque cada item:

- [ ] Git instalado (`git --version`)
- [ ] Node 20+ instalado (`node -v`, `npm -v`)
- [ ] Docker Desktop instalado e aberto (`docker compose version`)
- [ ] Repositório clonado
- [ ] `cd specdriven-platform` → `npm install`
- [ ] `.env` criado (`Copy-Item .env.example .env`)
- [ ] `docker compose up -d` → containers `running`
- [ ] `npm run db:generate` → `db:push` → `db:seed`
- [ ] `.\dev-all.bat` ou três `npm run dev:*`
- [ ] http://localhost:3000/health retorna OK
- [ ] Login no portal com `gestor@specdriven.local` / `changeme`

---

## Onde pedir ajuda

1. Confira a tabela de **problemas comuns** acima.  
2. Leia o [guia de uso](../specdriven-platform/docs/guia-de-uso.md) para fluxos de negócio.  
3. Para arquitetura e API: [docs da plataforma](../specdriven-platform/docs/README.md).
