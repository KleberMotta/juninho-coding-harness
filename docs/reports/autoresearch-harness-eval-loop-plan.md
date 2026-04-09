# Plano: AutoResearch para Evolucao Continua do Harness

## Objetivo

Adaptar o padrao do `karpathy/autoresearch` para evoluir o harness gerado por `juninho-coding-harness` em um loop continuo do tipo `eval -> improve -> validate -> keep-or-revert`, com foco em melhorias reais de comportamento, nao apenas em diffs cosmeticos no scaffold.

## Tese Central

No `autoresearch`, o artefato editavel e pequeno, o harness de avaliacao e fixo, a metrica e unica, e cada iteracao decide entre manter ou reverter a mudanca.

Para o nosso caso, a adaptacao natural e:

- artefato editavel: o gerador e seus templates
- harness fixo: uma suite pequena de tasks e repos fixture reproduziveis
- metrica: um score escalar composto por qualidade, sucesso, custo e estabilidade
- decisao: promover apenas mudancas que melhorem o score e nao criem regressao estrutural

## Bootstrap Canonico do Repo

Hoje existe sobreposicao funcional entre `/j.init-deep` e `/j.finish-setup`. Para o loop de evolucao do harness, isso precisa ser consolidado em um unico bootstrap canonico do repositorio.

### Decisao recomendada

Manter apenas `/j.finish-setup` como comando canonico de bootstrap e absorver nele toda a responsabilidade hoje espalhada entre os dois comandos.

### Responsabilidades do bootstrap unico

- fazer levantamento estrutural do repositorio
- gerar ou atualizar `AGENTS.md` hierarquicos
- popular `docs/domain/**` e `docs/principles/**`
- gerar ou atualizar skills dinamicas e `.opencode/skill-map.json`
- alinhar scripts locais e comandos relevantes do projeto

### Consequencias praticas

- `/j.init-deep` vira candidato a remocao/deprecacao
- instalacao do harness passa a sugerir apenas `/j.finish-setup`
- docs, validacoes e benchmark passam a tratar `/j.finish-setup` como passo obrigatorio de bootstrap
- toda avaliacao end-to-end deve medir tambem a qualidade e a robustez desse bootstrap

## Unidade de Otimizacao

O sistema nao deve tentar otimizar todo o repositorio de uma vez. A unidade de otimizacao precisa ser pequena e rastreavel.

### Superficie editavel inicial

Na fase 1, limitar a mutacao automatica a:

- `src/templates/agents.ts`
- `src/templates/commands.ts`
- `src/templates/plugins.ts`
- `src/templates/support-scripts.ts`
- `src/templates/state.ts`
- `src/templates/docs.ts`
- `src/config.ts`

Opcionalmente incluir depois:

- `src/installer.ts`
- `scripts/validate.ts`

### Superficie explicitamente congelada na fase 1

- infra de benchmark
- fixtures de avaliacao
- calculo de score
- regras de promote/revert
- colecao de transcripts/logs

Isso replica a ideia do `prepare.py` do `autoresearch`: o agente mexe no sistema alvo, nao no juiz.

## Harness de Avaliacao Fixo

O loop precisa avaliar o harness em uso real: instalar o harness em repos de teste, executar o bootstrap canonico e depois rodar o fluxo operacional completo do OpenCode. Nao basta verificar se o gerador compila.

### Camadas do eval

1. `Generator Integrity`
- `npm run build`
- `npm run validate`

2. `Harness Install + Bootstrap`
- instalar o harness no repo alvo
- executar `/j.finish-setup`
- verificar se a estrutura esperada existe
- verificar se arquivos-chave do harness existem e batem com o contrato esperado
- verificar se `AGENTS.md`, docs e skills foram gerados de forma coerente

3. `Workflow Execution`
- executar o fluxo `/j.spec -> /j.plan -> /j.implement -> /j.check -> /j.unify`
- medir se o harness ajuda o agente a chegar ao resultado esperado com menos regressao

4. `Stability`
- repetir trials das mesmas tasks para capturar variancia estocastica

## Benchmark Inicial Recomendado

Comecar pequeno. O benchmark deve ser barato o bastante para rodar varias vezes por dia.

### Benchmark v0

Quatro grupos de casos:

1. `Install smoke`
- gerar projeto vazio com tipo de projeto principal
- validar presenca de `.opencode/juninho-config.json`
- validar presenca de `.opencode/state/active-plan.json`
- validar presenca dos plugins obrigatorios
- validar presenca dos scripts obrigatorios
- validar presenca da arvore `docs/specs/{slug}/state/**` apos scaffold de spec

2. `Bootstrap knowledge lift`
- rodar `/j.finish-setup` no repo de teste
- verificar geracao de `AGENTS.md` relevantes
- verificar populacao minima de `docs/domain/**` e `docs/principles/**`
- verificar extensao coerente de `.opencode/skill-map.json`
- verificar alinhamento entre docs/comandos/scripts produzidos

3. `Workflow contract`
- executar `/j.spec -> /j.plan -> /j.implement -> /j.check -> /j.unify` em uma tarefa simples
- verificar criacao de `integration-state.json`, `runtime.json`, `retry-state.json` e arquivos de work por task
- verificar que paths e markers usados pelos plugins batem com o contrato novo

4. `Agent task benchmark`
- instalar o harness em repos reais pequenos e pedir ao agente para executar tarefas representativas via fluxo completo
- exemplos:
  - adicionar endpoint pequeno
  - alterar regra de dominio pequena
  - incluir teste unitario focado
  - atualizar config tipada simples

### Repos da suite inicial

- repos fixture pequenos e controlados para feedback rapido
- 1 ou 2 repos reais internos ou publicos com stack proxima do uso esperado
- um subconjunto curado de exemplos do SWE-bench, pequeno o bastante para rodar com frequencia, mas diverso o bastante para expor fragilidades reais de agente+harness

### Suite minima sugerida

- 2 tasks de install/bootstrap
- 2 tasks de workflow/state
- 2 tasks end-to-end em repos pequenos
- 1 ou 2 tasks derivadas de exemplos curados do SWE-bench

Total inicial: 7 a 8 tasks.

Isso e suficiente para detectar regressao sem tornar cada iteracao lenta demais.

## Metrica Escalar Unica

O loop precisa de uma unica metrica para decidir `keep` ou `revert`, mas sem esconder sinais secundarios.

### Requisitos da metrica

- comparavel entre iteracoes
- sensivel a regressao real
- penalizar falhas duras
- tolerar alguma variancia
- incorporar custo/latencia sem dominar tudo

### Score composto proposto

`score = 1000 * success_rate + 200 * quality_rate - 80 * regression_rate - 40 * normalized_time - 20 * normalized_cost - 30 * flake_rate`

Onde:

- `success_rate`: proporcao de tasks concluidas corretamente
- `quality_rate`: proporcao de asserts secundarios satisfeitos
- `regression_rate`: proporcao de tasks antes verdes que ficaram vermelhas
- `normalized_time`: tempo medio por task normalizado contra baseline
- `normalized_cost`: custo/tokens/steps normalizado contra baseline
- `flake_rate`: divergencia entre trials da mesma task

### Regras de decisao

- falha em `build` ou `validate`: descarte automatico
- regressao em contrato estrutural obrigatorio: descarte automatico
- score inferior ao baseline atual: reverter
- score igual dentro de banda de ruido: preferir a versao mais simples
- score superior com aumento pequeno de custo: manter

### Banda de ruido inicial

Usar uma banda conservadora de indiferenca, por exemplo `delta < 1.5%`, ate haver historico suficiente para ajustar por desvio padrao observado.

## Controle de Variancia

Como o agente e o proprio harness podem ser estocasticos, cada task relevante deve ter repeticao.

### Politica inicial

- tasks de install/bootstrap: 1 trial
- tasks de scaffold/contrato: 1 trial
- tasks end-to-end com agente: 3 trials
- promover mudanca apenas se a media melhorar e nao houver degradacao severa no pior caso

### Regra simples de robustez

Uma mudanca so pode ser promovida se:

- melhorar a media do score total
- nao piorar o pior-trial acima de um limite critico
- nao introduzir nova falha deterministica

## Adaptacao do Pattern do `program.md`

O paralelo com `autoresearch` pode ser expresso assim:

- `prepare.py` do mundo original -> nosso benchmark runner fixo
- `train.py` editavel -> templates/config/plugins/scripts do gerador
- `val_bpb` -> score composto do harness
- `results.tsv` -> ledger de experimentos do harness
- branch de pesquisa -> branch dedicada `autoresearch/harness-<tag>`

## Loop Operacional Proposto

### Setup de uma run

1. criar branch dedicada de experimento
2. congelar benchmark e fixtures da run
3. registrar baseline executando o benchmark na versao inicial
4. criar ledger de resultados da run

### Loop por iteracao

1. selecionar uma hipotese de melhoria do harness
2. editar apenas a superficie permitida
3. instalar o harness nos repos da suite
4. executar `/j.finish-setup` como bootstrap unico
5. rodar o fluxo `/j.spec -> /j.plan -> /j.implement -> /j.check -> /j.unify`
6. calcular score e anexar artefatos
7. comparar com baseline atual
8. manter ou reverter
9. registrar descricao curta da hipotese e do resultado

### Ledger minimo por experimento

Arquivo sugerido: `eval/results.tsv`

Colunas:

- `commit`
- `score`
- `success_rate`
- `quality_rate`
- `regression_rate`
- `avg_time_s`
- `avg_cost`
- `flake_rate`
- `status`
- `description`

`status`:

- `keep`
- `discard`
- `crash`

## Conhecimento Acumulado

Para evitar que cada iteracao reaprenda tudo do zero, a run deve manter uma knowledge base curta e cumulativa, inspirada no papel do `program.md`.

### Artefatos sugeridos

- `docs/reports/harness-autoresearch-program.md`
  - regras da run
  - superficie editavel
  - benchmark ativo
  - metrica oficial
  - criterios de promote/revert

- `docs/reports/harness-autoresearch-notes.md`
  - achados compactos de experimentos anteriores
  - padroes que pioraram
  - padroes que melhoraram
  - ideias prioritarias para a proxima rodada

Esses arquivos devem ser curtos e operacionais, nao um diario longo.

Toda mudanca promovida pelo loop deve tambem atualizar a documentacao do proprio harness quando houver aprendizado reutilizavel. O objetivo nao e apenas achar uma versao melhor, mas deixar codificado no harness o que funcionou para que rodadas futuras recomecem de um patamar mais alto.

## Estrutura de PoC Recomendada

Criar uma area dedicada dentro do gerador:

- `eval/benchmarks/`
- `eval/fixtures/`
- `eval/runners/`
- `eval/results.tsv`
- `eval/baselines/`

### Componentes da PoC

1. `eval/runners/generate-fixture.sh`
- instala o harness em um repo fixture ou repo alvo da suite

2. `eval/runners/run-benchmark.sh`
- executa a suite fixa da run
- salva logs por task sem floodar stdout principal

3. `eval/runners/run-opencode-flow.sh`
- executa o bootstrap canonico e depois o fluxo `/j.spec -> /j.plan -> /j.implement -> /j.check -> /j.unify`
- registra transcripts, tempos, saidas e artefatos por repo/task

4. `eval/runners/score-run.js`
- consolida resultados e calcula o score unico

5. `eval/runners/promote-or-revert.sh`
- compara candidato contra baseline
- decide `keep` ou `discard`

6. `eval/benchmarks/benchmark-v0.json`
- descreve tasks, pesos e numero de trials

## Hipoteses de Melhoria Inicial

As primeiras iteracoes nao devem ser arbitrarias. Sugestao de ordem:

1. unificacao de `/j.init-deep` e `/j.finish-setup` em um bootstrap unico
2. clareza e timing de injecao dos plugins
3. robustez de path resolution e state discovery
4. qualidade das instrucoes de handoff e status
5. lembretes de validacao antes de concluir task
6. reducao de ambiguidades em planner/spec/implementer/unify
7. melhoria de scripts que reduzem flakiness operacional

Essas areas tendem a mexer no comportamento do agente sem exigir redesign completo do framework.

## Guardrails

Para evitar overfitting no benchmark pequeno:

- manter um conjunto oculto de regressao leve fora da suite de tuning principal
- revisar transcripts/amostras de runs promovidas
- exigir que melhorias de prompt nao quebrem contrato estrutural do scaffold
- periodicamente trocar ou expandir uma task da suite publica
- nao depender apenas de repos sinteticos; manter exemplos reais e subset curado de SWE-bench na avaliacao

## Fases de Implementacao

### Fase 1

Objetivo: tornar o loop executavel.

- criar estrutura `eval/`
- consolidar bootstrap canonico em um unico comando
- definir `benchmark-v0`
- implementar runner de install/bootstrap
- implementar runner de benchmark
- implementar score composto
- registrar baseline inicial

### Fase 2

Objetivo: rodar melhoria semi-automatica.

- permitir uma iteracao por vez com keep/revert automatizado
- armazenar logs e transcripts por task
- produzir `results.tsv`

### Fase 3

Objetivo: aproximar do modelo `autoresearch` de longa duracao.

- rodadas multiplas autonomas
- fila de hipoteses
- compressao automatica de learnings em `program.md` da run
- conjunto oculto de verificacao antes de promocao final

## Decisoes Praticas Recomendadas Agora

1. Nao comecar com benchmark grande.
2. Nao otimizar custo/token antes de medir sucesso e regressao com confianca.
3. Nao deixar o proprio agente editar o benchmark na mesma fase em que tenta melhorar score.
4. Nao tentar usar toda a superficie do gerador como alvo mutavel na primeira versao.
5. Tratar `/j.finish-setup` como unico bootstrap canonico e medir explicitamente sua qualidade.

## Proximo Incremento Concreto

O passo mais util agora e implementar a PoC de Fase 1:

1. consolidar `/j.init-deep` e `/j.finish-setup` em um bootstrap unico no gerador
2. criar `eval/benchmarks/benchmark-v0.json`
3. criar runners minimos para instalar o harness, executar o fluxo completo e calcular score
4. montar uma suite com fixtures pequenos e um subset curado de exemplos do SWE-bench
5. registrar um baseline oficial do harness atual
6. escolher 2 ou 3 hipoteses de melhoria e rodar a primeira rodada manual de keep/revert

Esse caminho preserva o espirito do `autoresearch`, mas o adapta para um contexto em que o artefato otimizado e um harness de coding agents e o sinal de qualidade depende de tasks reproduziveis, contratos estruturais e comportamento emergente do agente.
