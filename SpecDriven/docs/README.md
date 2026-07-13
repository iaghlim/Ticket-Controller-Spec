# Documentação SpecDriven

Documentação funcional e técnica do produto **SpecDriven** — app desktop local para organizar atendimentos (Cliente → Chamado) e gerar documentos Word (EF / ET / TU).

## Índice

### Funcional

| Doc | Conteúdo |
|-----|----------|
| [Visão geral](funcional/01-visao-geral.md) | Propósito, princípios, escopo e fora de escopo |
| [Funcionalidades](funcional/02-funcionalidades.md) | Capacidades F01–F14 e extensões (timer, horas, snippets, histórico) |
| [Jornadas](funcional/03-jornadas.md) | Fluxos principais do usuário |

### Técnica

| Doc | Conteúdo |
|-----|----------|
| [Arquitetura](tecnica/01-arquitetura.md) | Stack, camadas, janelas, plugins |
| [Modelo de dados](tecnica/02-modelo-dados.md) | Persistência em disco, schemas JSON |
| [API de comandos](tecnica/03-api-comandos.md) | Inventário dos `invoke` Tauri |
| [Geração de documentos](tecnica/04-geracao-documentos.md) | Templates, placeholders, drafts, histórico |
| [Timer e horas](tecnica/05-timer-horas.md) | Overlay, `horas.json`, CSV |
| [Desenvolvimento](tecnica/06-desenvolvimento.md) | Setup, build, estrutura de pastas |

## Referência rápida

- **Stack:** Tauri 2 · React 19 · TypeScript · Vite
- **Dados:** 100% local (pasta raiz + `config.json` do app)
- **Sem:** API Jira, rede obrigatória, cloud
- **README raiz:** visão operacional e checklist de aceite

## Como contribuir nesta pasta

- Manter linguagem alinhada ao produto (PT-BR).
- Separar **o que o usuário faz** (`funcional/`) de **como o sistema faz** (`tecnica/`).
- Ao mudar comandos, schemas ou rotas, atualizar o doc correspondente nesta pasta.
