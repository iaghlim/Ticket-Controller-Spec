# API de comandos Tauri

Todos os comandos são invocados via `invoke` (`src/shared/api.ts`). Erros estruturados: `{ code, message }` (PT-BR).

## Config / workspace

| Comando | Função |
|---------|--------|
| `get_config` | Lê config do app |
| `set_root_path` | Define raiz, garante marker, atualiza recentes |
| `update_config` | Atualiza autor / emptyPlaceholder / theme |
| `scan_workspace_cmd` | Scan Cliente → Chamados |
| `open_path` | Abre path no SO (`opener`) |

## Clientes

| Comando | Função |
|---------|--------|
| `create_client` | Cria pasta do cliente |
| `rename_client` | Renomeia pasta e atualiza `meta.client` dos chamados |
| `delete_client` | Remove se `confirmName` bater |

## Chamados

| Comando | Função |
|---------|--------|
| `create_ticket` | Valida e cria árvore completa |
| `get_ticket` | Detalhe (+ órfão, sync histórico docs) |
| `update_ticket_meta` | Patch de campos de meta |
| `delete_ticket` | Exige `confirm: true`; `remove_dir_all` |
| `repair_ticket_meta` | Recria meta (e artefatos mínimos) |
| `duplicate_ticket` | Nova chave; copia drafts/notas/checklist; anexos opcionais |

## Checklist / notas / anexos

| Comando | Função |
|---------|--------|
| `get_checklist` / `save_checklist` | Persistência do checklist |
| `read_notes_cmd` / `write_notes_cmd` | `notas.md` |
| `list_attachments` | Lista `anexos/` |
| `add_attachment` | Copia arquivo (nome único se colidir) |
| `remove_attachment` | Remove com guard de path |

## Documentos

| Comando | Função |
|---------|--------|
| `read_draft` / `save_draft` | Draft JSON; bump `updatedAt` do chamado |
| `list_draft_prints` / `add_draft_print` / `add_draft_print_bytes` / `remove_draft_print` | Prints do wizard (png/jpg) |
| `generate_document` | Template → versionado + latest + prints embutidos (sempre nova versão) |
| `read_workspace_file_base64` | Lê arquivo sob a raiz do workspace → base64 (upload cloud do .docx) |
| `attach_document` | Anexa arquivo ao histórico |
| `set_active_document_history` | Define versão ativa |

## Busca / snippets / ZIP

| Comando | Função |
|---------|--------|
| `search` | Match substring (chave/título/cliente/status/tags) |
| `get_snippets` / `save_snippets` | Snippets do workspace |
| `export_ticket_zip` | ZIP da pasta do chamado |
| `import_ticket_zip` | Importa para um cliente |

## Timer / horas

| Comando | Função |
|---------|--------|
| `get_active_timer` | Estado atual do timer |
| `start_timer` | Start/resume; `CONFLICT` se trocar sem confirm |
| `pause_timer` / `stop_timer` | Pausa; stop grava em `horas.json` |
| `set_timer_note` | Nota da sessão ativa |
| `list_hours` | Resumo hoje/semana/total + entradas |
| `add_manual_entry` | Entrada manual (`seconds > 0`) |
| `delete_hours_entry` | Remove por id |
| `export_hours_csv` | CSV do chamado |
| `get_workspace_hours_report` | Totais do workspace |
| `export_week_hours_csv` | CSV da semana |
| `show_timer_overlay` | Cria/exibe overlay |
| `set_timer_overlay_compact` | Alterna modo compacto (faixa) / expandido |
| `focus_main_window` | Foca `main` |
| `close_timer_overlay` | **Oculta** overlay (estado permanece) |

## Códigos de erro (exemplos)

| Code | Situação típica |
|------|-----------------|
| `ROOT_NOT_SET` | Operação sem pasta raiz |
| `INVALID_KEY` | Chave fora do padrão |
| `CONFLICT` | Timer em outro chamado sem confirmação; duplicidade |
| (outros) | I/O, validação de nome, confirmação de delete, etc. |

Mensagens são sempre legíveis em PT-BR para exibição direta na UI.
