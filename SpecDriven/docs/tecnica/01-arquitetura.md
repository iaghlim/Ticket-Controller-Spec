# Arquitetura técnica

## Stack

| Camada | Tecnologia |
|--------|------------|
| Shell desktop | Tauri 2 (`com.specdriven.desktop`) |
| UI | React 19 + React Router 7 + TypeScript |
| Bundler | Vite 7 (dev server porta **1420**) |
| Backend | Rust (edition 2021), crate `specdriven` / lib `specdriven_lib` |
| Plugins | `dialog`, `fs`, `opener` |
| Docs | Engine própria ZIP/XML (`docx` module) — não usa docx-rs |

## Diagrama de camadas

```text
┌─────────────────────────────────────────┐
│  React (src/)                           │
│  pages / workspace context / api.ts     │
└─────────────────┬───────────────────────┘
                  │ invoke("command", args)
┌─────────────────▼───────────────────────┐
│  Tauri commands (src-tauri/src/commands)│
│  adaptação IPC → domínio                │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  Domain (src-tauri/src/domain)          │
│  models, workspace FS, timer, hours,    │
│  config, paths, errors                  │
│  + docx/ (templates → .docx)            │
└─────────────────┬───────────────────────┘
                  │
         disco local + app config dir
```

## Janelas

| Label | Papel |
|-------|-------|
| `main` | SPA principal (1280×800, min 1024×640) |
| `timer-overlay` | Overlay frameless, always-on-top |

Ambas usam o **mesmo bundle** frontend. Em `main.tsx`, o ramo do overlay é escolhido pela label da janela ou `?window=timer-overlay`.

Capabilities (`src-tauri/capabilities/default.json`) liberam as duas janelas: core defaults + opener/dialog/fs + show/hide/focus/drag/always-on-top.

## Organização do código

```text
src/
  App.tsx, main.tsx
  app/AppLayout.tsx
  features/{setup,dashboard,clients,tickets,documents,timer,search,settings,reports}/
  shared/{api.ts,types.ts,workspace.tsx,components/ui.tsx}
  styles/global.css

src-tauri/
  src/
    lib.rs              # plugins + invoke_handler
    commands/           # handlers IPC
    domain/             # regras + FS
    docx/               # substituição de placeholders
  templates/            # EF.docx, ET.docx, TestesUnitarios.docx
  capabilities/
  tauri.conf.json
```

## Persistência (dois locais)

1. **Workspace (escolhido pelo usuário):** árvore Cliente/Chamado + `.specdriven/`.  
2. **App data (SO):** `config.json`, `active_timer.json` — não ficam na pasta do workspace.

I/O de domínio usa principalmente `std::fs`. O plugin `fs` existe na capability (e uso via frontend/dialogs); a lógica de negócio não depende de rede.

## Contratos IPC

- Frontend: `src/shared/api.ts` → `invoke`.  
- Erros: objeto `{ code, message }` em PT-BR (ex.: `ROOT_NOT_SET`, `INVALID_KEY`, `CONFLICT`).  
- Serde: Rust e TypeScript em **camelCase**.

## Segurança / trust model

- App local; CSP configurado como `null` (comum em Tauri).  
- Controles reais: allowlist de capabilities + validações de path (anexos, ZIP sem `..` / paths absolutos).  
- Não há autenticação multi-usuário.

## Pontos de atenção conhecidos

- `generate_document` sempre cria nova versão no histórico (sem overwrite).  
- Templates oficiais são shells mínimos (~1 KB); placeholders devem permanecer em **um único run** no Word.  
- `domain/validation.rs` é stub; regras vivem em `paths.rs` e nos commands.  
- Scan trata subpastas como chamados (sem filtrar formato de chave).
