# Guia de desenvolvimento

## Pré-requisitos (Windows)

1. Node.js 20+  
2. Rust estável (`rustup`) — `cargo` no PATH  
3. Visual Studio Build Tools 2022 com **Desktop development with C++** (`link.exe`)  
4. WebView2 (padrão no Windows 10/11 recente)

## Comandos

```bash
npm install
npm run tauri dev      # Vite :1420 + cargo run
npm run tauri build    # instalador / binário
```

Frontend isolado (sem shell Tauri):

```bash
npm run dev
```

## Estrutura relevante

```text
SpecDriven/
  docs/                 # esta documentação
  src/                  # React
  src-tauri/            # Rust + templates + capabilities
  package.json
  vite.config.ts        # porta 1420; ignora watch de src-tauri
```

## Convenções

- Novos comandos Tauri: handler em `commands/`, lógica em `domain/`, tipagem em `shared/types.ts`, wrapper em `shared/api.ts`, registro em `lib.rs`.  
- Erros de domínio → código + mensagem PT-BR.  
- Persistência preferencialmente em arquivos do workspace (transparência/portabilidade).  
- Não commitar `node_modules`, `dist`, `src-tauri/target`, `.env*` (ver `.gitignore`).

## Build cache (Windows)

Se o projeto mudar de drive/caminho (ex.: `C:\` → `D:\`), limpe o target antes de compilar:

```bash
cd src-tauri
cargo clean
```

Caso contrário, manifests de permissions do Tauri podem apontar paths absolutos antigos.

## Testes / qualidade

### Unitários (Rust)

Lógica pura de domínio (chaves Jira, sanitização de nomes, mapeamento de tipos de documento) em `src-tauri/src/domain/`.

```bash
cd src-tauri
cargo test
```

Filtrar por módulo:

```bash
cargo test -- domain::paths
cargo test -- domain::workspace
```

Não exige runtime Tauri. Aceite manual da UI: ver checklist no `README.md` da raiz.

## Empacotamento

- `tauri.conf.json`: `productName` SpecDriven, resources `templates/*`.  
- Release Windows: `windows_subsystem = "windows"` (sem console).

## Leitura sugerida

1. [Arquitetura](01-arquitetura.md)  
2. [Modelo de dados](02-modelo-dados.md)  
3. [API de comandos](03-api-comandos.md)  
4. README raiz do repositório (setup + aceite)
