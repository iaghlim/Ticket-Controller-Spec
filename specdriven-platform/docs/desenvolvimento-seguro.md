# Desenvolvimento Seguro & Prevenção de Quebras (Release Safety)

Este documento estabelece as diretrizes e boas práticas para evoluir a plataforma **SpecDriven** de forma contínua, **minimizando riscos de regressão, mantendo a compatibilidade de contratos e garantindo a estabilidade** de todos os componentes do monorepo (`apps/api`, `apps/web-staff`, `apps/web-client`, `packages/shared`) e do aplicativo **SpecDriven Local (Desktop)**.

---

## 🎯 Princípios Fundamentais

1. **Monorepo Consistente:** Nenhuma alteração em um pacote ou aplicação deve quebrar o build ou a tipagem de outro.
2. **Banco de Dados Incremental:** Migrações de banco nunca devem destruir dados em ambientes compartilhados ou de produção.
3. **Retrocompatibilidade de Contratos:** Alterações na API devem respeitar clientes legados, portais web e a sincronização desktop (`/sync/*`).
4. **Quality Gates Obrigatórios:** Nenhum código deve ser enviado sem passar pela bateria de verificação local (`typecheck`, `test`, `build`).

---

## 📦 1. Contrato Unificado (`@specdriven/shared`)

O pacote `@specdriven/shared` centraliza tipos, DTOs, enums e validações compartilhadas entre o backend e os portais frontend.

### Regras para alterar o `@specdriven/shared`:

- **Adição de propriedades:** Sempre adicione novas propriedades em DTOs/Interfaces como **opcionais (`?`)** a menos que todos os chamadores já estejam preparados para enviá-las.
- **Renomeação ou remoção de campos:** 
  1. Adicione a nova propriedade mantendo a antiga marcada como `@deprecated`.
  2. Atualize o backend (`apps/api`) e os frontends (`apps/web-staff`, `apps/web-client`).
  3. Remova a propriedade antiga somente após confirmar que nenhum ponto do código ou cliente desktop a consome.
- **Validação de impacto:** Após modificar o `@specdriven/shared`, execute obrigatoriamente na raiz do monorepo:
  ```powershell
  npm run build:shared
  npm run typecheck
  ```

---

## 🗄️ 2. Evolução Segura do Banco de Dados (Prisma & Postgres)

Alterações no esquema do banco (`packages/shared` ou `apps/api/prisma/schema.prisma`) exigem atenção rigorosa para evitar indisponibilidade ou perda de dados.

### Uso dos Comandos de Banco:

| Comando | Onde Usar | Descrição |
|---------|-----------|-----------|
| `npm run db:push` | **Apenas dev local individual** | Sincroniza o schema diretamente sem criar arquivo de migração. **NUNCA use em staging ou produção.** |
| `npm run db:generate` | Dev local | Atualiza o cliente do Prisma após mudanças no `schema.prisma`. |
| `npm run db:migrate:deploy` | Staging e Produção | Aplica migrações versionadas pendentes sem alterar dados existentes. |

### Estratégia de Migração Sem Indisponibilidade (*Expand & Contract*):

Ao renomear uma coluna ou alterar o tipo de um dado existente:
1. **Fase 1 (Expand):** Crie a nova coluna no schema Prisma via migração, mantendo a antiga. O backend deve gravar em ambas ou preencher a nova por fallback.
2. **Fase 2 (Migrar dados):** Execute um script/query para popular a nova coluna com dados da antiga.
3. **Fase 3 (Contract):** Atualize a aplicação para ler apenas da nova coluna e, em um release futuro, remova a coluna antiga.

---

## 🔄 3. Retrocompatibilidade de APIs & Sync Desktop

A `apps/api` atende três clientes distintos:
- Portal Staff (`apps/web-staff`)
- Portal Cliente (`apps/web-client`)
- **SpecDriven Local (App Desktop)** via rotas `/sync/*`

### Cuidados com Endpoints HTTP:

- **Não altere estruturas de resposta existentes:** Se a rota `GET /tickets/:id` devolvia `{ id, title, status }`, ela não pode subitamente mudar `title` para `subject` sem quebrar portais e sync desktop.
- **Novos parâmetros em rotas `/sync/*`:** Devem ser sempre opcionais no payload de requisição e possuir valores padrão no backend.
- **Tratamento de Erros:** Respostas de erro devem manter o formato padrão da API (`{ error: string, statusCode: number }`) para não quebrar os tratadores de exceção no frontend.

---

## 🛡️ 4. Quality Gates Locais (Pre-Commit Checklist)

Antes de realizar um `git push` ou abrir um Pull Request, execute o fluxo de verificação abaixo a partir da raiz de `specdriven-platform`:

```powershell
# 1. Validação de Tipagem estática em todos os pacotes e apps
npm run typecheck

# 2. Testes de unidade e integrados da API
npm run test

# 3. Build de produção completo de todas as aplicações
npm run build

# 4. Testes E2E (opcional/recomendado para alterações em fluxos críticos de UI)
npm run test:e2e
```

> ⚠️ **Atenção:** Se qualquer um dos passos acima falhar, o código **não está pronto** para integração.

---

## ⚙️ 5. Variáveis de Ambiente e Configurações

Ao adicionar uma nova variável de ambiente (ex.: nova chave de integração ou flag):

1. Adicione a variável com um valor seguro de desenvolvimento em `.env.example`.
2. Adicione a variável documentada com valor de produção em `.env.production.example`.
3. Garanta que a aplicação tenha **fallback gracioso** ou validação clara no boot (`apps/api/src/config.ts`) se a variável não estiver presente, evitando *crashes* silenciosos em runtime.

---

## 📋 Resumo do Checklist de Segurança para PRs

Antes de aprovar ou fundir uma alteração, certifique-se:

- [ ] `npm run typecheck` passa sem nenhum erro.
- [ ] `npm run build` executa com sucesso para todos os pacotes (`shared`, `api`, `web-client`, `web-staff`).
- [ ] Novas colunas no banco possuem valor padrão ou são nulas (não quebram registros existentes).
- [ ] Nenhum arquivo `.env` com senhas/tokens reais foi commitado.
- [ ] Contratos de rotas existentes e rotas `/sync/*` permanecem retrocompatíveis.
