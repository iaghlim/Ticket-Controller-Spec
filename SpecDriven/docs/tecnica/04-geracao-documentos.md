# Geração de documentos (EF / ET / TU)

## Visão técnica

1. Usuário preenche o wizard → `save_draft` grava JSON em `drafts/`.  
2. `generate_document` carrega o template embutido, substitui `{{placeholders}}`, grava versão + latest e atualiza `meta.documents`.  
3. Em modo **Cloud** (login ativo), o wizard faz upload best-effort do `.docx` via `cloudUploadDocx` (`read_workspace_file_base64` + `POST /tickets/:key/attachments`). 
3. UI pode abrir o arquivo, anexar externo ou ativar outra entrada do histórico.

## Templates

Embutidos em `src-tauri/templates/` e empacotados via `tauri.conf.json` → `bundle.resources: ["templates/*"]`:

| Arquivo | Tipo |
|---------|------|
| `EF.docx` | Especificação Funcional |
| `ET.docx` | Especificação Técnica |
| `TestesUnitarios.docx` | Testes Unitários |

## Engine (`src-tauri/src/docx/mod.rs`)

1. Descompacta o `.docx` (ZIP).  
2. Substitui placeholders em `word/document.xml` e headers/footers se existirem.  
3. Quebras de linha do valor → `<w:br/>` no Word.  
4. Campo vazio → `emptyPlaceholder` da config (default `—`).  
5. Recompacta o ZIP.

### Invariante crítico

No Microsoft Word, cada `{{campo}}` deve permanecer em **um único text run**. Se o Word fragmentar o placeholder em vários runs, a substituição **não ocorre**. Os templates oficiais do app já vêm válidos; edições manuais no Word podem quebrar isso.

## Tipos e campos

Campos comuns a todos: `cliente`, `chave`, `titulo`, `autor`, `data`, `versao`, `jira_url` (opcional).

### EF — obrigatórios de negócio

`objetivo`, `escopo`, `regras_negocio`  
(+ comuns acima)

### ET — obrigatórios

`resumo_solucao`, `arquitetura`, `componentes`  
(+ comuns)

Opcionais: `modelo_dados`, `endpoints`, `rollback`, `dependencias`

### TU — obrigatórios

`objetivo_testes`, `cenarios`  
(+ comuns)

Opcionais: `cobertura`, `evidencias`

Validação de obrigatórios no backend: `docx::required_fields`.

Prints anexados no wizard ficam em `drafts/{ef|et|testes-unitarios}-prints/` (`prints.json` + imagens) e são embutidos no final do `.docx` na geração (seção **Prints**, sem placeholder `{{}}`). Formatos: png/jpg/jpeg. Limite: 10 por documento.

## Saídas em disco

| Tipo | Latest | Histórico |
|------|--------|-----------|
| EF | `docs/EF.docx` | `docs/EF_vN.docx` … |
| ET | `docs/ET.docx` | `docs/ET_vN.docx` … |
| TU | `testes/TestesUnitarios.docx` | `testes/TestesUnitarios_vN.docx` … |

Cada geração:

- Incrementa versão no histórico (`source: generated`)
- Atualiza o ponteiro latest
- Atualiza `DocumentInfo` em `meta.json`

Documentos externos entram via `attach_document` (`source: attached`).  
`set_active_document_history` escolhe qual versão é a ativa.

Legacy: se existir latest sem history, o app pode semear `_v1` na leitura.

## Drafts

| Arquivo | DocType |
|---------|---------|
| `drafts/ef.json` | `ef` |
| `drafts/et.json` | `et` |
| `drafts/testes-unitarios.json` | `testes_unitarios` |

Schema: `docType`, `version`, `data`, `updatedAt`. Salvar draft também atualiza `updatedAt` do chamado.

## Snippets

Inserção nos campos multiline do wizard. Persistidos em `.specdriven/snippets.json` (escopo workspace).

## Limitações

- Templates atuais são shells mínimos (não layouts corporativos ricos).  
- Não há preview WYSIWYG dentro do app.  
- Geração sempre versiona (append no history); não há overwrite.
