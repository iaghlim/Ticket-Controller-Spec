# Visão geral do produto

## O que é

SpecDriven é um aplicativo **desktop local** para organizar o trabalho de atendimento/suporte no modelo **Cliente → Chamado** e gerar documentos Word padronizados:

- **EF** — Especificação Funcional  
- **ET** — Especificação Técnica  
- **TU** — Testes Unitários  

A geração usa formulários (drafts JSON) + templates `.docx` com placeholders `{{campo}}`.

## Princípios

| Princípio | Significado |
|-----------|-------------|
| Local-first | Tudo vive em arquivos na pasta escolhida pelo usuário |
| Sem cloud | Não há backend remoto nem sync |
| Sem Jira API | `jiraUrl` é só texto/link opcional no `meta.json` |
| Portátil | Workspace = árvore de pastas; dá para copiar, ZIP e versionar fora do app |
| Offline | Rede não é requisito para operar |

## Persona / contexto de uso

Profissional que registra atendimentos por cliente, mantém notas/checklist/anexos, aponta horas e produz EF/ET/TU sem depender de ferramenta SaaS.

## Escopo da v1 (produto)

- Configurar pasta raiz (workspace)
- CRUD de clientes e chamados
- Detalhe operacional do chamado (meta, notas, checklist, anexos)
- Drafts + geração/regeneração de documentos
- Busca local (Ctrl+K)
- Duplicar chamado e export/import ZIP
- Timer / apontamento de horas + CSV
- Snippets reutilizáveis nos formulários
- Histórico de versões de documentos gerados/anexados
- Relatório de chamados e dashboard de horas

## Fora de escopo

- Integração bidirecional com Jira / ServiceNow / etc.
- Multiusuário concorrente na mesma pasta (não há locking distribuído)
- Autenticação / permissões por usuário
- Edição rica WYSIWYG do Word dentro do app
- Armazenamento em nuvem gerenciado pelo produto

## Critérios de sucesso (produto)

1. Usuário configura a raiz uma vez e reabre o app no mesmo workspace.  
2. Consegue criar cliente → chamado e ver a árvore completa no disco.  
3. Gera EF/ET/TU no Word com campos preenchidos e layout do template íntegro.  
4. Notas, anexos, checklist e horas persistem após reinício.  
5. Busca encontra por chave/tag; ZIP exporta/importa entre clientes.
