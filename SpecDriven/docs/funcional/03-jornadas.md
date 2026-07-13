# Jornadas do usuário

Fluxos ponta a ponta mais importantes do SpecDriven.

## 1. Configurar workspace

1. Abrir o app sem raiz configurada → tela de Setup.  
2. Escolher pasta raiz.  
3. App cria `.specdriven/workspace.json` e grava `rootPath` na config local.  
4. Nas próximas aberturas, carrega o mesmo workspace (e lista recentes em Configurações).

**Resultado:** pasta pronta para clientes/chamados.

---

## 2. Criar cliente e chamado

1. Ir em **Clientes** → criar cliente.  
2. Abrir o cliente → criar chamado (chave + título; opcional tags, prioridade, status, estimativa, Jira URL).  
3. App cria a árvore: `meta.json`, `checklist.json`, `notas.md`, `drafts/`, `docs/`, `testes/`, `anexos/`.

**Resultado:** chamado operacional no disco e na UI.

---

## 3. Operar o chamado

No detalhe:

1. Atualizar status/prioridade/tags/estimativa/Jira.  
2. Preencher notas (`notas.md`).  
3. Marcar checklist.  
4. Adicionar/abrir/remover anexos.  
5. Registrar horas (timer ou lançamento manual).  
6. Abrir pasta do chamado no explorador.

**Resultado:** histórico operacional local do atendimento.

---

## 4. Gerar EF / ET / TU

1. No detalhe, abrir o wizard do documento desejado.  
2. Preencher campos (obrigatórios + opcionais); usar snippets se quiser.  
3. **Salvar draft** → `drafts/*.json`.  
4. **Gerar** → novo arquivo versionado + cópia “latest” (`docs/EF.docx`, etc.).  
5. Abrir no Word; se necessário, anexar doc externo ou ativar outra versão do histórico.

**Resultado:** `.docx` gerado a partir do template oficial.

---

## 5. Apontar horas

1. Abrir overlay (sidebar / detalhe / seção Horas) ou usar controles no detalhe.  
2. Buscar chave → ▶ iniciar → ⏸ pausar → ■ finalizar.  
3. Entrada gravada em `horas.json` (`source: timer`).  
4. Alternativa: lançamento manual.  
5. Exportar CSV do chamado ou da semana no Dashboard.

**Resultado:** apontamentos auditáveis e exportáveis.

---

## 6. Buscar e navegar

1. Ctrl+K → digitar chave, título, tag, cliente ou status.  
2. Selecionar hit → ir ao detalhe.

---

## 7. Duplicar / mover dados

**Duplicar:** novo key no mesmo cliente; copia drafts, notas, checklist; anexos opcionais; **não** copia docs gerados nem horas.

**ZIP:** exportar pasta do chamado; importar em outro cliente (com validações de path).

**Trocar raiz:** em Configurações, apontar outro workspace — scan recarrega a árvore.

---

## 8. Recuperar chamado órfão

1. Scan encontra pasta sem `meta.json` (flag órfão).  
2. Usuário aciona **Reparar meta**.  
3. App recria `meta.json` (e checklist/notas se faltarem).

---

## Diagrama resumido

```text
Setup raiz
   → Clientes
      → Chamados
         → Detalhe (meta / notas / checklist / anexos / horas)
         → Wizard docs (draft → gerar → Word)
         → Timer overlay
         → Duplicar / ZIP
   → Dashboard / Relatórios / Busca / Configurações
```
