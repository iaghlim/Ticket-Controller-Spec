# Playbook do Agent Cluster(ler antes de S2 / S5)

## Área de trabalho (.cluster/<taskId>/)
- plan.md: subtarefas, worker, arquivo esperado, dependências, revisão e entrega.
- worker_NN.md: resultado do worker. Formato: conclusão / evidências / análise / lacunas e riscos / posição sugerida no documento final.
- review.md: revisão com confiança High / Medium / Low / Conflict.
- brief.md: brief antes da entrega.
- DELIVERY/: arquivos finais. O sistema verifica esta pasta para confirmar entrega real.

## S2 Distribuição
- Regra base: uma subtarefa por worker. Consultas ou comandos pontuais podem ficar no fluxo principal.
- Em textos longos, divida por capítulos e use pelo menos tantos writers quanto dimensões de pesquisa.
- Desenhe dependências e coloque primeiro as tarefas que desbloqueiam outras.

## S3 Prompt do worker
Primeira frase fixa: "Você não está trabalhando sozinho; não altere artefatos fora da sua responsabilidade."
Sempre entregue: limites da tarefa, contexto necessário, arquivo worker_NN.md de destino e formato de retorno. Se não houver evidência, deve dizer isso; não transformar hipótese em conclusão.
Workers de pesquisa usam autoglm-websearch/open-link e citam apenas fontes lidas. Se um worker usa uma skill, dê o nome da skill e o limite da tarefa, não cole todo o conteúdo.

## S4 Revisão
Acione revisão se houver conclusões sintéticas, previsões, juízos de valor, código não trivial, ações irreversíveis ou decisões relevantes para o usuário. Revise fatos, lógica, números e código separadamente.

## S5 Entrega
- Respeite o formato pedido pelo usuário. Se não houver formato, respostas curtas podem ir em texto; o restante usa `docx` por padrão.
- Relatórios, planos, atas e pesquisas → `docx`; apresentações → `ppt`; tabelas/modelos de dados → `xlsx`; layout fixo → `pdf`; gráficos → `charts`.
- Para textos longos, use `write-skill` por capítulos e gere o arquivo final com `docx` ou outra skill de artefato.
- Mantenha UTF-8 estrito; não ignore erros de decodificação.
- Coloque os arquivos finais em DELIVERY/. Na resposta final, mostre progresso concluído, links clicáveis e limitações necessárias.