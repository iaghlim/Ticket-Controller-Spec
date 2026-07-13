# SpecDriven

App desktop **local** (Tauri 2 + React + TypeScript) para organizar atendimentos por **Cliente → Chamado** e gerar documentos Word (**EF**, **ET**, **Testes Unitários**) a partir de formulários + templates com placeholders `{{campo}}`.

**Sem Jira API, sem rede obrigatória, sem cloud.** O campo `jiraUrl` é apenas texto/link opcional no `meta.json`.

> **Instalação:** para subir o app desktop (Rust, dependências, primeiro uso), veja o [Guia de instalação](../docs/guia-instalacao.md#parte-3--app-desktop-specdriven). Para a plataforma cloud, veja a [Parte 2](../docs/guia-instalacao.md#parte-2--plataforma-cloud-specdriven-platform).

## Pré-requisitos (Windows)

1. **Node.js** 20+ (`node -v`)
2. **Rust** estável via [rustup](https://rustup.rs/) (`rustc --version`)
3. **Visual Studio Build Tools 2022** com workload **Desktop development with C++** (MSVC + Windows SDK)
4. **WebView2** (já incluso no Windows 10/11 recentes)

## Como rodar

```bash
npm install
npm run tauri dev
```

Build de produção:

```bash
npm run tauri build
```

## Estrutura na pasta raiz (workspace)

Ao escolher a raiz, o app cria `.specdriven/workspace.json` e passa a gerenciar:

```text
{raiz}/
  .specdriven/
    workspace.json
  {Cliente}/
    {KEY-123}/
      meta.json
      checklist.json
      notas.md
      horas.json
      drafts/
        ef.json
        et.json
        testes-unitarios.json
      docs/
        EF.docx
        ET.docx
      testes/
        TestesUnitarios.docx
      anexos/
```

## Timer / apontamento de horas

Overlay flutuante (always-on-top, sem moldura) para cronometrar atendimento:

- Abra pelo botão **Overlay timer** na sidebar, **Timer** no detalhe do chamado, ou a seção **Horas**.
- Busque a chave (ex.: `PROJ-123`), use ▶ / ⏸ / ■.
- Só um timer ativo por vez; ao trocar de chamado com timer rodando, o app pede confirmação, finaliza o anterior e inicia o novo.
- Fechar (ocultar) o overlay **não** perde a sessão — o estado fica no processo Rust (+ `active_timer.json` no app data).
- Apontamentos ficam em `{Cliente}/{KEY}/horas.json`.
- No detalhe do chamado: totais de hoje/semana/total, lançamento manual, export CSV e lista de entradas.
- No **Dashboard**: totais de hoje e da semana (segunda–domingo), breakdown por cliente/chamado e **Exportar CSV da semana**.

### Exportar CSV

| Origem | Escopo | Colunas |
|--------|--------|---------|
| Detalhe do chamado → **Horas** → Exportar CSV | Todas as entradas do chamado | `client`, `key`, `startedAt`, `endedAt`, `minutes`, `note`, `source` |
| Dashboard → **Exportar CSV da semana** | Entradas da semana atual em todos os chamados | mesmas colunas |

`minutes` é decimal (ex.: `90` segundos → `1.50`). `source`: `timer` ou `manual`.

Formato de `horas.json`:

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "uuid",
      "startedAt": "2026-07-12T22:00:00-03:00",
      "endedAt": "2026-07-12T23:00:00-03:00",
      "seconds": 3600,
      "note": "",
      "source": "timer"
    }
  ]
}
```

## Templates Word

Embutidos em `src-tauri/templates/`:

- `EF.docx`
- `ET.docx`
- `TestesUnitarios.docx`

Placeholders no formato `{{snake_case}}` (ex.: `{{objetivo}}`, `{{resumo_solucao}}`).

**Importante:** no Microsoft Word, cada placeholder deve permanecer em **um único run de texto**. Se o Word quebrar `{{campo}}` em vários runs, a substituição não ocorre. Os templates oficiais do app já vêm válidos.

Campos vazios viram `—` (configurável em Configurações).

## Funcionalidades v1.0 (F01–F14)

| ID | Capacidade |
|----|------------|
| F01 | Configurar/persistir pasta raiz |
| F02 | CRUD de clientes |
| F03 | CRUD de chamados + `meta.json` |
| F04 | Scan da árvore existente |
| F05 | Detalhe do chamado |
| F06 | Geração EF/ET/TU em `.docx` |
| F07 | Drafts JSON + regeneração |
| F08 | Abrir pasta / arquivo no SO |
| F09 | Notas em `notas.md` |
| F10 | Anexos (listar/adicionar/remover/abrir) |
| F11 | Busca local (Ctrl+K) |
| F12 | Checklist operacional |
| F13 | Duplicar chamado |
| F14 | Exportar/importar ZIP |

## Checklist de aceite manual

- [ ] Setup de raiz e persistência entre sessões
- [ ] Criar cliente e chamado com árvore completa
- [ ] Editar meta (status/tags) e ver na listagem
- [ ] Salvar drafts EF/ET/TU e regenerar sobrescrevendo com confirmação
- [ ] Abrir `.docx` no Word com campos preenchidos e layout íntegro
- [ ] Notas e anexos persistem após reinício
- [ ] Busca encontra por chave e tag (Ctrl+K)
- [ ] Checklist marca e persiste
- [ ] Duplicar cria novo chamado com drafts
- [ ] Export ZIP e import em outro cliente
- [ ] Trocar raiz carrega outro workspace
- [ ] Erro de chave inválida / duplicada é claro em PT-BR

## Documentação

Documentação funcional e técnica: [`docs/`](docs/README.md).

## Stack

- Tauri 2, React 19, TypeScript, Vite, React Router
- Plugins: `dialog`, `fs`, `opener`
- Engine docx: ZIP/XML replace em `word/document.xml` (+ headers/footers se existirem)

## Licença

Proprietary — All Rights Reserved. See [LICENSE](../LICENSE).
