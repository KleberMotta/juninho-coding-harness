# Gap Analysis: `trp-financial-api` Harness vs `juninho-coding-harness`

## Objetivo

Levantar, com alta confiança, quais melhorias e customizacoes existentes no harness de `~/repos/olxbr/trp-financial-api` ainda nao estao refletidas no scaffold gerado por `~/repos/KleberMotta/juninho-coding-harness`, para orientar um backport futuro no gerador.

Este documento e apenas analitico. Nenhuma mudanca no scaffold foi aplicada como parte deste trabalho.

## Escopo Comparado

### Harness evoluido analisado

- `~/repos/olxbr/trp-financial-api/.opencode/**`
- `~/repos/olxbr/trp-financial-api/opencode.json`

### Fonte do scaffold original

- `src/templates/agents.ts`
- `src/templates/commands.ts`
- `src/templates/plugins.ts`
- `src/templates/tools.ts`
- `src/templates/support-scripts.ts`
- `src/templates/state.ts`
- `src/templates/docs.ts`
- `src/installer.ts`
- `src/cli.ts`
- `src/config.ts`
- `src/rewriter.ts`

### Docs/testes do gerador com drift relevante

- `README.md`
- `docs/wiki/Home.md`
- `docs/wiki/agents.md`
- `docs/wiki/plugins.md`
- `docs/wiki/commands.md`
- `docs/wiki/getting-started.md`
- `docs/wiki/workflow.md`
- `scripts/validate.ts`
- `.gitignore`

## Resumo Executivo

O harness do `trp-financial-api` evoluiu materialmente em cinco frentes:

1. Arquitetura de configuracao/state migrada de arquivos Markdown globais para configuracao tipada em JSON e state local por feature.
2. Fluxo de implementacao reescrito para operar com branch canonico por feature, manifest de integracao, ownership por tarefa, heartbeat e retry.
3. Plugins novos para centralizar resolucao de paths, config e runtime de tarefas.
4. Comandos/agentes atualizados para usar state por feature em `docs/specs/{slug}/state/**` em vez de depender de `.opencode/state/**` como area principal do workflow.
5. Suporte a scaffolding de state por spec e cleanup orientado por manifest, em vez de merge/descoberta implicita de worktrees.

O scaffold atual ainda representa o workflow anterior. O delta nao e cosmetico; ele afeta contratos de arquivo, orquestracao, comportamento de plugins, scripts, docs e validacao do proprio gerador.

## Inventario Estrutural

### `trp-financial-api/.opencode`

- Agents: 11
- Commands: 15
- Plugins: 18
- Scripts: 7
- Tools: 4
- Templates: 1 (`spec-state-readme.md`)
- Config/state adicionais:
  - `.opencode/juninho-config.json`
  - `.opencode/skill-map.json`
  - `.opencode/.plan-ready`
  - `.opencode/state/README.md`

### Scaffold atual do gerador

O gerador instala a base classica do framework, mas ainda:

- grava `skill-map.json` em `.opencode/state/skill-map.json`
- grava `.plan-ready` em `.opencode/state/.plan-ready`
- gera `workflow-config.md` em `.opencode/state/workflow-config.md`
- trata `validator-work.md` e `implementer-work.md` globais como area principal do workflow
- nao gera os plugins novos de path/config/runtime
- nao gera `scaffold-spec-state.sh` nem `harness-feature-integration.sh`
- documenta UNIFY como etapa baseada em config antiga e merge de worktrees

## Deltas Funcionais por Area

### 1. Configuracao e state

#### Estado atual no scaffold

Em `src/templates/state.ts`, o gerador ainda cria:

- `.opencode/state/persistent-context.md`
- `.opencode/state/execution-state.md`
- `.opencode/state/validator-work.md`
- `.opencode/state/implementer-work.md`
- `.opencode/state/workflow-config.md`

Esse modelo pressupoe configuracao operacional em Markdown global e logs globais como fonte principal para validator/implementer.

#### Estado atual no financial

No harness evoluido, a configuracao operacional foi movida para:

- `.opencode/juninho-config.json`

E o state de feature/tarefa foi movido para:

- `docs/specs/{slug}/state/README.md`
- `docs/specs/{slug}/state/implementer-work.md`
- `docs/specs/{slug}/state/integration-state.json`
- `docs/specs/{slug}/state/tasks/task-{id}/execution-state.md`
- `docs/specs/{slug}/state/tasks/task-{id}/validator-work.md`
- `docs/specs/{slug}/state/tasks/task-{id}/retry-state.json`
- `docs/specs/{slug}/state/tasks/task-{id}/runtime.json`
- `docs/specs/{slug}/state/sessions/{sessionID}-runtime.json`

`.opencode/state/` continua existindo, mas com papel de state global/sessao, nao como area principal de execucao por feature.

#### Impacto no backport

O gerador precisa migrar de um contrato de state global para um contrato hibrido:

- global em `.opencode/state/**` apenas para memoria/sessao/persistent context
- feature-local em `docs/specs/{slug}/state/**` para implementacao, validacao, runtime e integracao
- configuracao tipada em `.opencode/juninho-config.json`

### 2. Plugins

#### Drift confirmado no scaffold

Em `src/templates/plugins.ts`:

- `j.plan-autoload` usa `.opencode/state/.plan-ready` e apaga o marker apos primeira injecao.
- `j.skill-inject` e bootstrap escrevem/leem `.opencode/state/skill-map.json`.
- `j.intent-gate` e `j.todo-enforcer` foram desenhados para o modelo de state global.

#### Modelo evoluido no financial

Plugins novos ou materialmente alterados:

- `j.state-paths.ts`
- `j.feature-state-paths.ts`
- `j.juninho-config.ts`
- `j.task-runtime.ts`
- `j.task-board.ts`
- `j.notify.ts`
- `j.plan-autoload.ts`
- `j.intent-gate.ts`
- `j.todo-enforcer.ts`
- `j.carl-inject.ts`
- `j.skill-inject.ts`

Mudancas relevantes:

- `j.plan-autoload.ts` le `.opencode/.plan-ready`, injeta via `chat.message` e `tool.execute.after`, e nao remove o marker.
- `j.intent-gate.ts` usa `.opencode/.plan-ready` com fallback em `execution-state.md` via `resolveStateFile`.
- `j.todo-enforcer.ts` combina tarefas pendentes do state global com `docs/specs/{slug}/state/tasks/**`.
- `j.feature-state-paths.ts` concentra helpers para a arvore `docs/specs/{slug}/state/**`.
- `j.juninho-config.ts` centraliza leitura e defaults de `.opencode/juninho-config.json`.

#### Impacto no backport

O gerador precisa passar a emitir esses plugins e refatorar os existentes para usar helpers compartilhados de path/config. Sem isso, planner, implementer e unify continuarao acoplados ao layout antigo.

### 3. Implementacao e integracao

#### Scaffold atual

Em `src/templates/agents.ts` e `src/templates/commands.ts`, o fluxo ainda assume:

- leitura de `.opencode/state/workflow-config.md`
- logs globais em `.opencode/state/validator-work.md` e `.opencode/state/implementer-work.md`
- UNIFY orientado por merge/closeout do modelo antigo

#### Harness evoluido

`trp-financial-api/.opencode/agents/j.implementer.md` introduz:

- canonical repo root para todos os writes de state
- branch canonico `feature/{slug}`
- task branches `feature/{slug}-task-{id}`
- task ownership por lease file
- heartbeat obrigatorio
- takeover/retry seguro
- cap de 2 subagentes paralelos por wave
- registro de commit validado por tarefa
- integracao imediata no branch canonico, sem merge sintetico ad hoc

`trp-financial-api/.opencode/scripts/harness-feature-integration.sh` implementa os primitives operacionais desse fluxo:

- `ensure`
- `print-task-base`
- `prepare-task-branch`
- `record-task`
- `integrate-task`
- `switch`
- `cleanup`

`trp-financial-api/.opencode/agents/j.unify.md` tambem mudou o contrato:

- le `.opencode/juninho-config.json`
- usa `docs/specs/{slug}/state/integration-state.json` como fonte unica para cleanup
- nao descobre merges por scanning de filesystem/worktrees
- nao cria synthetic closeout commit

#### Impacto no backport

O gerador precisa atualizar fortemente:

- `src/templates/agents.ts`
- `src/templates/commands.ts`
- `src/templates/support-scripts.ts`
- `src/templates/state.ts`
- `src/templates/docs.ts`

Sem esse backport, o scaffold continua semanticamente divergente do fluxo ja provado no financial.

### 4. Scaffolding de state por spec

#### Financial

Arquivos novos:

- `.opencode/templates/spec-state-readme.md`
- `.opencode/scripts/scaffold-spec-state.sh`

O script cria:

- `docs/specs/{slug}/state/tasks`
- `docs/specs/{slug}/state/sessions`
- `docs/specs/{slug}/state/README.md` a partir de template

#### Scaffold atual

Nao existe template nem script equivalente.

#### Impacto no backport

Backport necessario para permitir que planner/spec-writer/implementer/unify trabalhem com um contrato padrao de state por feature.

### 5. Commands e wrappers

#### Financial

Existe ajuste material em:

- `.opencode/commands/j.implement.md`
- `.opencode/commands/j.unify.md`
- `.opencode/commands/j.status.md`
- `.opencode/commands/j.handoff.md`
- `.opencode/commands/j.ulw-loop.md`
- `.opencode/commands/j.start-work.md`
- `.opencode/commands/j.sync-docs.md`
- `.opencode/commands/j.finish-setup.md`
- `.opencode/agents/j.plan.md`
- `.opencode/agents/j.spec.md`

#### Scaffold atual

Em `src/templates/commands.ts`, os comandos ainda referenciam:

- `.opencode/state/workflow-config.md`
- fluxo antigo de `/j.unify`
- state global como area primaria

O scaffold tambem nao gera wrappers de agente `j.plan.md` e `j.spec.md` dentro de `.opencode/agents/`.

#### Impacto no backport

Backport recomendado para alinhar entrypoints, handoff e UX do fluxo novo.

## Mapeamento Financial -> Scaffold

### MUST_BACKPORT

#### A. Arquitetura de state/config

Financial:

- `.opencode/juninho-config.json`
- `.opencode/.plan-ready`
- `.opencode/skill-map.json`
- `.opencode/plugins/j.state-paths.ts`
- `.opencode/plugins/j.feature-state-paths.ts`
- `.opencode/plugins/j.juninho-config.ts`

Scaffold a atualizar:

- `src/templates/state.ts`
- `src/templates/plugins.ts`
- `src/templates/agents.ts`
- `src/templates/commands.ts`
- `src/templates/docs.ts`
- possivelmente `src/installer.ts`

Motivo:

- muda o contrato-base de configuracao, resolucao de paths e localizacao de markers/skill-map

#### B. Feature-local state por spec/task/session

Financial:

- `.opencode/templates/spec-state-readme.md`
- `.opencode/scripts/scaffold-spec-state.sh`
- `docs/specs/{slug}/state/**`

Scaffold a atualizar:

- `src/templates/support-scripts.ts`
- `src/templates/state.ts`
- `src/templates/agents.ts`
- `src/templates/commands.ts`
- `src/templates/docs.ts`

Motivo:

- planner/spec-writer/implementer/unify passam a depender de uma estrutura de state por feature inexistente no scaffold

#### C. Workflow de implementacao/integracao

Financial:

- `.opencode/scripts/harness-feature-integration.sh`
- `.opencode/agents/j.implementer.md`
- `.opencode/agents/j.unify.md`
- `.opencode/commands/j.implement.md`
- `.opencode/commands/j.unify.md`
- `.opencode/commands/j.ulw-loop.md`
- `.opencode/commands/j.status.md`
- `.opencode/commands/j.handoff.md`

Scaffold a atualizar:

- `src/templates/support-scripts.ts`
- `src/templates/agents.ts`
- `src/templates/commands.ts`
- `src/templates/docs.ts`

Motivo:

- o fluxo antigo nao representa branch canonico, manifest, takeover/retry, heartbeat nem cleanup orientado por integracao-state

#### D. Plugins de runtime/task board/config

Financial:

- `.opencode/plugins/j.task-runtime.ts`
- `.opencode/plugins/j.task-board.ts`
- `.opencode/plugins/j.notify.ts`
- updates em `j.plan-autoload.ts`, `j.intent-gate.ts`, `j.todo-enforcer.ts`, `j.carl-inject.ts`, `j.skill-inject.ts`

Scaffold a atualizar:

- `src/templates/plugins.ts`
- possivelmente `src/templates/docs.ts`

Motivo:

- o scaffold nao gera a instrumentacao e os contratos que sustentam observabilidade e controle do workflow novo

### SHOULD_BACKPORT

Financial:

- `.opencode/agents/j.plan.md`
- `.opencode/agents/j.spec.md`
- `.opencode/plugins/j.notify.ts`
- `.opencode/plugins/j.task-board.ts`

Scaffold a atualizar:

- `src/templates/agents.ts`
- `src/templates/plugins.ts`
- docs do gerador

Motivo:

- melhora UX, discoverability e observabilidade, mas nao e o nucleo minimo do novo contrato de state

### OPTIONAL_PROJECT_SPECIFIC

Financial:

- `.opencode/scripts/run-test-scope.sh`
- `.opencode/scripts/test-related.sh` customizado ao stack
- `.opencode/scripts/check-all.sh` customizado ao projeto
- skills de dominio financeiro/Kotlin
- `.opencode/node_modules/**`
- `.opencode/package-lock.json`
- `.opencode/bun.lock`

Scaffold a atualizar:

- nenhum backport direto por default

Motivo:

- parecem customizacoes de stack/projeto, nao melhorias universalmente validas do harness

## Drift Concreto Confirmado no Gerador

### `src/templates/plugins.ts`

- escreve `skill-map.json` em `.opencode/state/skill-map.json`
- `j.plan-autoload` le `.opencode/state/.plan-ready`
- `j.plan-autoload` deleta o marker apos primeira injecao

### `src/templates/agents.ts`

- planner escreve `.opencode/state/.plan-ready`
- implementer e unify dependem de `.opencode/state/workflow-config.md`
- exemplos e contratos de validacao ainda apontam para logs globais em `.opencode/state`

### `src/templates/commands.ts`

- `/j.implement` instrui leitura de `.opencode/state/workflow-config.md`
- `/j.sync-docs` tambem referencia `workflow-config.md`
- `/j.unify` e demais comandos ainda carregam o fluxo anterior

### `src/templates/state.ts`

- ainda gera `workflow-config.md`
- ainda gera `validator-work.md` e `implementer-work.md` globais como principal area de trabalho

### `src/templates/docs.ts`

- `AGENTS.md` gerado ainda documenta `workflow-config` e o path antigo do fluxo de ready/unify

## Docs e Validacao do Gerador Que Tambem Precisam Atualizar

Mesmo apos backport nos templates, ainda sera necessario alinhar:

- `README.md`
- `docs/wiki/Home.md`
- `docs/wiki/agents.md`
- `docs/wiki/plugins.md`
- `docs/wiki/commands.md`
- `docs/wiki/getting-started.md`
- `docs/wiki/workflow.md`
- `scripts/validate.ts`
- `.gitignore`

Risco: sem atualizar esses artefatos, o gerador pode passar a emitir scaffold novo enquanto continua documentando e validando o modelo antigo.

## Observacao Importante: `hashline` vs `apply_patch`

Este levantamento precisa preservar uma conclusao importante de validacao anterior:

- nao ha base para afirmar que `hashline` e melhor que `apply_patch` de forma global
- `hashline` e melhor como mecanismo de identidade/precisao/stale-check
- `apply_patch` continua superior em tolerancia a drift benigno de contexto
- a recomendacao correta e tratar `hashline` como mecanismo complementar ou modo estrito, nao como substituto universal

Isso importa para o backport porque o scaffold atual ja inclui `j.hashline-read.ts` e `j.hashline-edit.ts`, mas a documentacao e o posicionamento do recurso nao devem evoluir para uma narrativa de substituicao total do `apply_patch`.

## Recomendacao de Backport em Fases

### Fase 1

- migrar config para `.opencode/juninho-config.json`
- mover `.plan-ready` para `.opencode/.plan-ready`
- mover `skill-map.json` para `.opencode/skill-map.json`
- adicionar `j.state-paths.ts`, `j.feature-state-paths.ts`, `j.juninho-config.ts`
- atualizar plugins dependentes desses paths

### Fase 2

- adicionar `spec-state-readme.md`
- adicionar `scaffold-spec-state.sh`
- adaptar planner/spec-writer/implementer/unify para `docs/specs/{slug}/state/**`

### Fase 3

- backport de `harness-feature-integration.sh`
- reescrever `j.implementer` e `j.unify` para branch canonico + manifest + cleanup orientado por `integration-state.json`
- atualizar `/j.status`, `/j.handoff`, `/j.ulw-loop`

### Fase 4

- atualizar docs/wiki/README/validacoes internas do gerador
- revisar como `hashline` e apresentado na documentacao

## Conclusao

O harness do `trp-financial-api` nao e apenas uma instancia customizada do scaffold atual. Ele representa uma evolucao real do contrato operacional do framework.

Os deltas prioritarios para backport estao concentrados em:

- state/config
- orquestracao de implementacao/integracao
- plugins de resolucao/config/runtime
- commands/agentes alinhados ao novo contrato
- docs/validacao do proprio gerador

Se o objetivo for fazer o scaffold original refletir o estado mais maduro do framework, o backport deve ser tratado como uma atualizacao arquitetural do gerador, nao como um ajuste pontual.
