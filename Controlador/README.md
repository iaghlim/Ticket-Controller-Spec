# Controlador

Aplicativo Windows local para consultores registrarem tempo por chamado, fazerem anotações e manterem uma documentação progressiva do atendimento.

Não há integração com Jira, SAP, nuvem ou login corporativo. Cada consultor controla somente seu próprio repositório local.

## Funcionalidades

- Digitar um chamado e iniciar o contador.
- Trocar de chamado sem perder o período anterior.
- Pausar, retomar e finalizar o dia.
- Corrigir sessões encerradas.
- Consultar apontamentos por Hoje, Esta semana (segunda a domingo), Este mês ou intervalo personalizado.
- Visualizar horas, chamados e sessões do período selecionado.
- Registrar anotações e documentação por chamado.
- Exibir os documentos esperados: Estimativa, Especificação Funcional, Especificação Técnica e Testes Unitários.
- Anexar vários arquivos por categoria, ou como anexo geral.
- Exportar e importar um backup portátil com os dados e anexos.

## Dados locais

Os dados ficam em `%LocalAppData%\Controlador\controlador.db`, um banco SQLite local. Os apontamentos, notas, documentação e a configuração do último chamado são armazenados nesse arquivo.

Os anexos são copiados para `%LocalAppData%\Controlador\attachments\<chamado>`. Assim, o repositório do chamado não depende do local original do arquivo. Remover um anexo pelo aplicativo apaga somente essa cópia local; o arquivo original permanece intacto.

O aplicativo salva checkpoints enquanto o contador está ativo. Se o Windows ou o aplicativo for fechado inesperadamente, uma sessão em aberto é encerrada no último checkpoint conhecido para evitar o registro indevido de horas fora do expediente. Toda sessão encerrada pode ser corrigida pela tela principal.

> A versão atual inicia um banco SQLite novo. O arquivo JSON usado nas versões experimentais anteriores não é migrado automaticamente.

## Trocar de computador

1. No computador antigo, use **Exportar backup** e guarde o arquivo `.zip` em local seguro.
2. No computador novo, abra o aplicativo e use **Importar backup**.
3. O backup contém `controlador.db` e toda a pasta de anexos.

Antes de importar, o aplicativo cria automaticamente uma cópia dos dados locais existentes. A importação pede confirmação e valida a estrutura do backup antes de substituir os dados.

## Executar em desenvolvimento

```powershell
dotnet run --project .\Controlador.csproj
```

## Publicar um executável Windows

```powershell
dotnet publish .\Controlador.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o .\publish
```

O executável será gerado em `publish` e não exigirá instalação prévia do .NET. Para distribuição, copie a pasta `publish` inteira: o WPF mantém algumas bibliotecas nativas ao lado do `Controlador.exe`.
