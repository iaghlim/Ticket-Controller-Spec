# Timer e apontamento de horas

## Modelo

- **Um** timer ativo por processo/app.  
- Estado em memória + persistência em `{app_config_dir}/active_timer.json`.  
- Apontamentos finalizados em `{Cliente}/{KEY}/horas.json`.

## Overlay

- Janela `timer-overlay`: sem moldura, always-on-top.  
- Abertura: sidebar (**Overlay timer**), detalhe do chamado, ou seção Horas.  
- `close_timer_overlay` **esconde** a janela; **não** para o cronômetro.  
- Controles: busca por chave, ▶ / ⏸ / ■, nota da sessão.

## Regras de sessão

| Ação | Efeito |
|------|--------|
| Start no mesmo chamado | Resume / continua |
| Start em outro com timer rodando | Erro `CONFLICT` até confirmar; então finaliza o anterior e inicia o novo |
| Pause | Congela segmentos |
| Stop | Consolida segundos; se `seconds > 0`, append em `horas.json` (`source: timer`); se 0, descarta |
| Restart do app | Restaura timer ativo do arquivo |

## Horas no chamado

`list_hours` devolve:

- Totais: **hoje**, **semana** (segunda–domingo local), **total**
- Lista de entradas

Também há:

- `add_manual_entry` (`source: manual`, `seconds > 0`)
- `delete_hours_entry`
- Comparação com `estimativaHoras` na UI de detalhe

## Relatório workspace

`get_workspace_hours_report` — totais de hoje/semana agregados por cliente/chamado (Dashboard).

## Export CSV

| Origem | Escopo | Comando |
|--------|--------|---------|
| Detalhe → Horas | Todas as entradas do chamado | `export_hours_csv` |
| Dashboard | Semana atual, todos os chamados | `export_week_hours_csv` |

Colunas:

```text
client,key,startedAt,endedAt,minutes,note,source
```

- `minutes`: decimal (`90` segundos → `1.50`)  
- `source`: `timer` | `manual`

## Formato `horas.json`

Ver [Modelo de dados](02-modelo-dados.md#hours--horasjson).

## Observações de implementação

- Duplicar chamado **não** copia `horas.json`.  
- Semana calendário: segunda a domingo no fuso local.  
- Dependência `chrono-tz` foi removida; o fluxo usa tempo local via chrono.
