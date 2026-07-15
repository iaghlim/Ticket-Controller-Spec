# Funcionalidades

Capacidades do produto, alinhadas ao README (F01–F14) e às extensões já presentes no código.

## Núcleo (F01–F14)

| ID | Capacidade | Comportamento esperado |
|----|------------|------------------------|
| **F01** | Pasta raiz | Escolher/alterar raiz; criar `.specdriven/workspace.json`; persistir em config do app; recentes |
| **F02** | Clientes | Criar, renomear, excluir (com confirmação do nome) |
| **F03** | Chamados | Criar/editar/excluir; `meta.json` (status, prioridade, tags, autor, jiraUrl, estimativa) |
| **F04** | Scan | Ler árvore existente e montar visão Cliente → Chamados |
| **F05** | Detalhe | Tela única com meta, docs, checklist, notas, anexos, horas, ações |
| **F06** | Geração docx | EF / ET / TU a partir de template + draft |
| **F07** | Drafts | Salvar JSON em `drafts/`; regenerar documento |
| **F08** | Abrir no SO | Abrir pasta/arquivo com o app padrão do sistema |
| **F09** | Notas | Editar `notas.md` (Markdown) |
| **F10** | Anexos | Listar / adicionar / remover / abrir em `anexos/` |
| **F11** | Busca | Ctrl+K por chave, título, cliente, status, tags |
| **F12** | Checklist | Itens padrão + custom; marcar e persistir |
| **F13** | Duplicar | Novo chamado com drafts/notas/checklist (opcional anexos); sem docs gerados nem horas |
| **F14** | ZIP | Exportar chamado inteiro; importar em outro cliente |

## Extensões (além da tabela F01–F14)

| Capacidade | Descrição |
|------------|-----------|
| **Timer overlay** | Janela flutuante always-on-top; play/pause/stop; um timer ativo por vez |
| **Horas** | Lançamentos em `horas.json` (timer ou manual); totais hoje/semana/total |
| **CSV** | Export do chamado ou da semana (dashboard) |
| **Estimativa** | Campo `estimativaHoras` vs horas reais no detalhe |
| **Snippets** | Textos reutilizáveis no workspace (inserção em campos multiline do wizard) |
| **Histórico de docs** | Versões geradas + documentos anexados; ativar versão “corrente” |
| **Orphan repair** | Pasta de chamado sem `meta.json` → reparar meta |
| **Tema** | system / light / dark nas configurações |
| **Relatório de chamados** | Lista filtrável (abertos, status, cliente) |
| **Dashboard** | Contagens, recentes, breakdown de horas da semana |
| **Modo Cloud (Sync)** | Configuração de login na cloud, sincronização incremental pull/push e upload automático de documentos gerados (Fase D) |

## Status e prioridade

**Status:** `backlog` · `em_andamento` · `aguardando_cliente` · `em_teste` · `concluido` · `cancelado`  

**Prioridade:** `baixa` · `media` · `alta` · `critica`  

**“Abertos”** (dashboard/relatório): todos exceto `concluido` e `cancelado`.

## Regras de negócio relevantes (UX)

- Chave do chamado: formato tipo Jira `PROJ-123` (`^[A-Z][A-Z0-9]+-\d+$`).
- Exclusão de cliente exige digitar o nome; exclusão de chamado exige confirmação explícita.
- Trocar de chamado com timer rodando exige confirmação (finaliza o anterior e inicia o novo).
- Fechar/ocultar o overlay **não** encerra o timer.
- Campos vazios na geração viram o placeholder configurável (padrão `—`).
- Nome de cliente não pode ser `.specdriven` nem conter caracteres inválidos de pasta.

## Telas / rotas (mapa funcional)

| Rota | Função |
|------|--------|
| Setup (sem raiz) | Escolher pasta workspace |
| `/` | Dashboard |
| `/clientes` | Lista/CRUD de clientes |
| `/clientes/:cliente` | Chamados do cliente |
| `/chamados/:cliente/:chave` | Detalhe do chamado |
| `/chamados/.../docs/:tipo` | Wizard EF/ET/TU |
| `/relatorios/chamados` | Relatório filtrável |
| `/configuracoes` | Autor, placeholder, tema, trocar raiz |
| Overlay timer | Cronômetro flutuante |
