# Sync desktop ↔ núcleo (Fase D)

O app **SpecDriven** (Tauri) continua local-first. Em **Configurações → Modo Local | Cloud**:

1. Escolha **Cloud** e a URL da API (`http://127.0.0.1:3000` local).
2. Login com usuário staff seed (`consultor@specdriven.local` / `changeme`).
3. **Sincronizar agora** chama `GET /sync/pull`, materializa no disco via `apply_cloud_pull_cmd`, depois `POST /sync/push` (vazio no botão; timer faz push no stop).
4. No **stop do timer**, a última entrada de horas sobe via `POST /sync/push` (best-effort).

## Materialização no disco (pull)

Para cada ticket do pull:

- Pasta `{root}/{client.name}/{KEY}/` (cria cliente se precisar)
- `meta.json` (upsert: título/status/prioridade/autor/estimativa; preserva tags/docs locais)
- Árvore `drafts/`, `docs/`, `testes/`, `anexos/`, `checklist.json`, `notas.md`

Também:

- Comentários → append idempotente em `notas.md` (`<!-- cloud-comment:{id} -->`)
- Time entries → merge por `id` em `horas.json` (`source: manual`)

## API

| Rota | Uso |
|------|-----|
| `GET /sync/pull?since=` | Pull incremental de tickets, comentários e time entries |
| `POST /sync/push` | Body `{ timeEntries?, comments? }` |
| `POST /tickets/:key/attachments` (multipart) | Upload `.docx` gerado no desktop (`cloudUploadDocx`; wizard dispara após gerar em modo Cloud) |

## Código desktop

- `src/shared/cloud.ts` — cliente HTTP (`cloudUploadDocx`)
- `src/features/documents/DocumentWizardPage.tsx` — após gerar, upload cloud best-effort
- `src-tauri` `read_workspace_file_base64` — lê `.docx` sob a raiz do workspace
- `src/features/settings/SettingsPage.tsx` — UI modo/login/sync
- `src-tauri/src/domain/cloud_sync.rs` + `apply_cloud_pull_cmd` — grava pull no workspace
- `src/features/timer/TimerOverlay.tsx` — push no stop
- Config persistida em `AppConfig.cloud` (Rust + `update_config`)

## Smoke / validação manual

Pré-requisitos: API + Postgres seed (`DEMO-1` em Cliente Demo); desktop com pasta raiz.

1. Configurações → modo **Cloud** → URL `http://127.0.0.1:3000`
2. Login `consultor@specdriven.local` / `changeme`
3. **Sincronizar agora**
4. Conferir pasta `{raiz}/Cliente Demo/DEMO-1/meta.json` e mensagem com “criados/atualizados”
5. Home/clientes deve listar o ticket após refresh (já disparado pelo sync)
6. Segundo sync sem mudanças: 0 criados, atualizados conforme `since` (ou 0 se nada mudou)
7. Wizard EF/ET/TU → Gerar: mensagem deve incluir “enviado à cloud” (MinIO/S3 configurado)

## Limitações conhecidas (MVP)

- Upload `.docx` no wizard exige modo Cloud + login; multipart precisa MinIO/S3 (`S3_ENDPOINT`). Falha = aviso best-effort (arquivo local já gerado).
- Aprovações de horas / SMTP / users picker: outros workstreams.
- Comentários cloud vão para `notas.md` (não há modelo local de threads).
