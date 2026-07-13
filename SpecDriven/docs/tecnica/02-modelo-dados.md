# Modelo de dados e layout em disco

## Árvore do workspace

```text
{raiz}/
  .specdriven/
    workspace.json          # marcador do workspace
    snippets.json           # criado na 1ª leitura de snippets
  {Cliente}/
    {KEY-123}/
      meta.json
      checklist.json
      notas.md
      horas.json            # lazy (1ª entrada de tempo)
      drafts/
        ef.json
        et.json
        testes-unitarios.json
      docs/
        EF.docx             # ponteiro “latest”
        ET.docx
        EF_vN.docx …        # histórico versionado / anexados
      testes/
        TestesUnitarios.docx
        TestesUnitarios_vN.docx
      anexos/
```

## Config do aplicativo (fora do workspace)

| Arquivo | Conteúdo |
|---------|----------|
| `{app_config_dir}/config.json` | `rootPath`, `authorDefault`, `recentRoots` (máx. 5), `ui.theme`, `emptyPlaceholder` |
| `{app_config_dir}/active_timer.json` | Sessão de timer (sobrevive a restart; overlay oculto não limpa) |

## Entidades

### WorkspaceMeta — `.specdriven/workspace.json`

- `schemaVersion`: `1`
- `createdAt`: ISO datetime

### AppConfig — `config.json`

- `rootPath`, `authorDefault`, `recentRoots[]`
- `ui.theme`: `system` | `light` | `dark`
- `emptyPlaceholder`: default `—`

### TicketMeta — `meta.json`

| Campo | Notas |
|-------|-------|
| `key`, `title`, `client` | Identidade |
| `status`, `priority`, `tags[]`, `author` | Operação |
| `createdAt`, `updatedAt` | Auditoria |
| `jiraUrl?` | Texto/link apenas |
| `estimativaHoras?` | Número ≥ 0 |
| `documents` | Bloco EF/ET/TU (`DocumentInfo`) |

### DocumentInfo (em `meta.documents`)

- `exists`, `path`, `generatedAt`, `draftVersion`
- `history[]`: `{ id, fileName, path, source, createdAt, label? }`
- `activeHistoryId`
- `source`: `generated` | `attached`

### Draft — `drafts/{tipo}.json`

- `docType`, `version`, `data` (mapa campo→string), `updatedAt`

### Checklist — `checklist.json`

- Itens padrão (7) + `custom` opcionais; estado checked persistido

### Hours — `horas.json`

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

`source`: `timer` | `manual`.

### Snippets — `.specdriven/snippets.json`

- `snippets[{ id, title, body }]` — título obrigatório ao salvar  
- Defaults criados na primeira carga (ex.: critérios, fora de escopo, riscos)

### ActiveTimer (memória + arquivo)

- Cliente/chave/título, segmentos, pause/resume, nota da sessão

## Validações de path / nome

| Recurso | Regra |
|---------|-------|
| Nome de cliente | Não vazio; ≠ `.specdriven`; sem `\ / : * ? " < > \|` |
| Chave | `^[A-Z][A-Z0-9]+-\d+$` |
| Título | Obrigatório |
| Estimativa | ≥ 0 |
| Anexos | Nome sanitizado; colisão → `nome-1.ext` |
| Remoção de anexo | Path deve permanecer sob `anexos/` (canonicalize) |
| ZIP import | Sem paths absolutos / `..` |
| Doc anexado | Extensões `docx\|doc\|odt\|rtf` |

## Orfãos

Pasta sob cliente **sem** `meta.json` → ticket órfão na UI; comando `repair_ticket_meta` recria meta (+ checklist/notas se faltarem).
