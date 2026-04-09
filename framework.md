# Agentic Coding Framework — Architecture Reference v2.1

> **Purpose:** Design reference for implementing a spec-driven, validator-gated, context-aware agentic coding framework on top of OpenCode (primary) and Claude Code (compatible). Intended to be read by developers setting up the framework in a new project and by agents operating within it.
>
> **Stack-agnostic by design.** Stack-specific callouts appear where relevant to illustrate how abstract patterns translate concretely (e.g., Next.js/TypeScript vs. Kotlin/Spring), but the framework itself makes no assumptions about language, runtime, or domain.
>
> **Scope:** Everything under `.opencode/`, `docs/`, `AGENTS.md`, `opencode.json`, and `.git/hooks/`. Pre-existing project source code is consumed by the framework but is not part of it.

---

## Table of Contents

1. [Philosophy and Goals](#1-philosophy-and-goals)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Context Architecture — Five Tiers](#4-context-architecture--five-tiers)
5. [Agent Architecture](#5-agent-architecture)
6. [The Three-Agent Planning Pipeline](#6-the-three-agent-planning-pipeline)
7. [The Dual Validation Loop](#7-the-dual-validation-loop)
8. [The Core Loop — Implementer](#8-the-core-loop--implementer)
9. [The Judge — Validator Agent](#9-the-judge--validator-agent)
10. [Reviewer vs. Validator — A Critical Distinction](#10-reviewer-vs-validator--a-critical-distinction)
11. [The UNIFY Step — Closing the Loop](#11-the-unify-step--closing-the-loop)
12. [Spec Production Pipeline](#12-spec-production-pipeline)
13. [Skills — Deterministic Knowledge Injection](#13-skills--deterministic-knowledge-injection)
14. [Context Injection — CARL Pattern](#14-context-injection--carl-pattern)
15. [Domain Documentation — docs/domain/](#15-domain-documentation--docsdomain)
16. [State System — Persistence and Agent Communication](#16-state-system--persistence-and-agent-communication)
17. [Git Worktree Parallelization](#17-git-worktree-parallelization)
18. [Command Interface](#18-command-interface)
19. [Plugins — Automation Hooks](#19-plugins--automation-hooks)
20. [Custom Tools — LLM-Callable Functions](#20-custom-tools--llm-callable-functions)
21. [LSP and AST-Grep Tools](#21-lsp-and-ast-grep-tools)
22. [Hash-Anchored Edit Tool — Hashline](#22-hash-anchored-edit-tool--hashline)
23. [IntentGate — Pre-Action Intent Classification](#23-intentgate--pre-action-intent-classification)
24. [Todo Enforcer — Idle Loop Prevention](#24-todo-enforcer--idle-loop-prevention)
25. [Comment Checker](#25-comment-checker)
26. [Hierarchical AGENTS.md — /init-deep Pattern](#26-hierarchical-agentsmd--init-deep-pattern)
27. [Permission Model](#27-permission-model)
28. [Global MCPs and GitHub CLI](#28-global-mcps-and-github-cli)
29. [Full Workflow — End to End](#29-full-workflow--end-to-end)
30. [Design Decisions and Rationale](#30-design-decisions-and-rationale)
31. [Summary Table — All Pieces](#31-summary-table--all-pieces)
32. [Changelog — v2.0 to v2.1](#32-changelog--v20-to-v21)

---

## 1. Philosophy and Goals

The framework is built on a central premise: **an LLM agent left unconstrained will write code that is locally coherent but globally inconsistent.** It will invent patterns, ignore project conventions, and produce code that passes tests but violates architectural intent — or worse, code that is technically correct but implements the wrong thing entirely.

Six failure modes are targeted:

1. **Pattern drift** — the agent generates generic code instead of code that follows project conventions.
2. **Semantic mismatch** — the implementation is internally correct but does not satisfy the spec's intent.
3. **Accumulated drift** — each task introduces small deviations that compound into architectural inconsistency across a multi-task feature.
4. **Context loss** — a session restart or context compaction causes the agent to lose track of what was done and what remains.
5. **Documentation rot** — the codebase evolves but domain documentation stays static, silently poisoning future agents with stale context.
6. **Edit corruption** — the agent attempts to modify a line that changed since the last read, producing corrupted output that looks valid but is not.

The framework addresses these through eight mechanisms:

1. **Five-tier context injection** — the right knowledge at the right depth, loaded at the right time, through the right mechanism.
2. **Spec-as-source-of-truth** — every implementation is grounded in a written specification that captures intent, not just requirements.
3. **Specialist agents with bounded authority** — different roles have different capabilities enforced at the platform level.
4. **A dual validation loop** — deterministic VCS-layer gate (pre-commit hook) plus semantic LLM gate (validator agent).
5. **Git worktrees for true parallelism** — independent tasks run in isolated working directories with their own branches.
6. **UNIFY as mandatory loop closure** — every plan is explicitly closed, decisions are persisted, domain docs are updated.
7. **Hash-anchored edits (Hashline)** — every file read tags lines with content hashes; every edit references those hashes rather than reproducing content, eliminating stale-line errors.
8. **Three-agent planning pipeline** — pre-planning analysis (Metis), interview-mode plan creation (Planner/Prometheus), and plan review (Momus) before a single line of implementation code is written.

The goal: a human describes a feature, approves a plan, and receives implementation-ready, tested, spec-compliant code with updated documentation — with minimal micro-management and a complete audit trail.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                             │
│  /plan  /spec  /implement  /lint  /test  /check  /pr-review         │
│  /init-deep  /start-work  /handoff  /ulw-loop                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                       PRIMARY AGENTS                                │
│         build (full access)        plan (read-only, cheap)          │
└──────────┬──────────────────────────────────────────────────────────┘
           │ spawns subagents via Task tool
┌──────────▼──────────────────────────────────────────────────────────┐
│              SPECIALIST SUBAGENTS                                   │
│                                                                     │
│  PLANNING PIPELINE (three agents, sequential)                       │
│  metis ──→ planner ──→ plan-reviewer                                │
│  (pre-analysis)  (interview+plan)  (executability gate)             │
│                                                                     │
│  EXECUTION PIPELINE                                                 │
│  spec-writer │ implementer │ validator │ reviewer │ unify            │
└──────────────┴──────┬──────┴───────────┴──────────┴─────────────────┘
                      │ creates worktrees for parallel tasks
┌─────────────────────▼───────────────────────────────────────────────┐
│                      GIT WORKTREE LAYER                             │
│  worktrees/{slug-task-1}/      worktrees/{slug-task-2}/   ...       │
│  ├─ isolated working dir       ├─ isolated working dir              │
│  ├─ own branch                 ├─ own branch                        │
│  └─ pre-commit hook ─────────► └─ pre-commit hook ──────────►      │
│       typecheck + lint + test        typecheck + lint + test        │
└─────────────────────────────────────────────────────────────────────┘
        │ UNIFY merges on completion
        │
┌───────▼────────────────────────────────────────────────────────────┐
│              CONTEXT INJECTION LAYER                               │
│                                                                    │
│  Tier 1: AGENTS.md (always-loaded, hierarchical per directory)     │
│  Tier 2: CARL keyword hook → principles + domain docs              │
│  Tier 3: PreToolUse hook → skills by file pattern                  │
│  Tier 4: PLAN.md explicit skill requirements                       │
│  Tier 5: Runtime state files                                       │
│                                                                    │
│  + IntentGate (UserPromptSubmit, before CARL)                      │
└────────────────────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────────────┐
│                       AUTOMATION LAYER                             │
│                                                                    │
│  .git/hooks/pre-commit (typecheck + lint + test)                   │
│                                                                    │
│  Plugins:                                                          │
│    env-protection.ts                                               │
│    auto-format.ts                                                  │
│    plan-autoload.ts                                                │
│    carl-inject.ts                                                  │
│    skill-inject.ts                                                 │
│    intent-gate.ts         ← new                                    │
│    todo-enforcer.ts       ← new                                    │
│    comment-checker.ts     ← new                                    │
│    hashline-read.ts       ← new (tags lines on read)              │
│    hashline-edit.ts       ← new (validates hash on edit)          │
│                                                                    │
│  Custom Tools (LLM-callable):                                      │
│    find-pattern                                                    │
│    next-version                                                    │
│    lsp_diagnostics         ← new                                   │
│    lsp_rename              ← new                                   │
│    lsp_prepare_rename      ← new                                   │
│    lsp_goto_definition     ← new                                   │
│    lsp_find_references     ← new                                   │
│    lsp_symbols             ← new                                   │
│    ast_grep_search         ← new                                   │
│    ast_grep_replace        ← new                                   │
│    edit (hashline-aware)   ← replaces native Edit                  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Directory Structure

```
project-root/
├── AGENTS.md                          # Tier 1: project-wide lean anchor
│
├── src/
│   ├── AGENTS.md                      # Tier 1: src-specific context (generated by /init-deep)
│   └── {module}/
│       └── AGENTS.md                  # Tier 1: module-specific context (generated by /init-deep)
│
├── docs/
│   ├── principles/                    # Technical patterns and architectural conventions
│   │   ├── error-handling.md
│   │   ├── auth-patterns.md
│   │   └── ...
│   ├── domain/                        # Business domain knowledge
│   │   ├── INDEX.md                   # Global index of all domain docs (CARL lookup + planner orientation)
│   │   ├── {domain}/
│   │   │   └── *.md
│   │   └── ...
│   └── specs/                         # Approved specs and plans
│       └── {feature-slug}/
│           ├── spec.md
│           ├── CONTEXT.md             # Human decisions captured before planning
│           └── plan.md
│
├── .opencode/
│   ├── agents/                        # Subagent definitions
│   │   ├── spec-writer.md
│   │   ├── metis.md                   # Pre-planning analyst
│   │   ├── planner.md                 # Interview-mode planner
│   │   ├── plan-reviewer.md           # Plan executability gate
│   │   ├── implementer.md
│   │   ├── validator.md
│   │   ├── reviewer.md
│   │   └── unify.md
│   ├── skills/                        # On-demand work instructions with optional embedded MCPs
│   │   ├── page-creation/
│   │   │   └── SKILL.md              # May include mcp: frontmatter for task-scoped MCP
│   │   ├── api-route-creation/SKILL.md
│   │   ├── test-writing/SKILL.md
│   │   ├── schema-migration/SKILL.md
│   │   └── ...
│   ├── plugins/                       # Hook implementations
│   │   ├── env-protection.ts
│   │   ├── auto-format.ts
│   │   ├── plan-autoload.ts
│   │   ├── carl-inject.ts
│   │   ├── skill-inject.ts
│   │   ├── intent-gate.ts
│   │   ├── todo-enforcer.ts
│   │   ├── comment-checker.ts
│   │   ├── hashline-read.ts
│   │   └── hashline-edit.ts
│   ├── tools/                         # LLM-callable custom tools
│   │   ├── find-pattern.ts
│   │   ├── next-version.ts
│   │   ├── lsp.ts                     # lsp_* tool suite
│   │   └── ast-grep.ts                # ast_grep_* tool suite
│   ├── state/                         # Runtime state files
│   │   ├── persistent-context.md
│   │   ├── execution-state.md
│   │   └── {agent}-work.md
│   └── commands/                      # Slash command definitions
│       ├── plan.md
│       ├── spec.md
│       ├── implement.md
│       ├── init-deep.md
│       ├── start-work.md
│       ├── handoff.md
│       └── ulw-loop.md
│
├── worktrees/                         # Git worktrees for parallel tasks (runtime)
│
└── .git/
    └── hooks/
        └── pre-commit                 # Deterministic quality gate
```

---

## 4. Context Architecture — Five Tiers

Context management is one of the most critical design decisions in an agentic framework. The framework manages context at five distinct levels, each with a different loading mechanism, purpose, and staleness profile.

### Tier 1: Always-Loaded — Hierarchical AGENTS.md

**Mechanism:** Root `AGENTS.md` auto-loaded at session start. Additional `AGENTS.md` files in subdirectories are auto-injected by the `directory-agents-injector` plugin whenever an agent reads a file — it walks from the file path to the project root, collecting all `AGENTS.md` files encountered, and injects them as layered context.

**Purpose:** Give every agent, in every session, foundational understanding of the project — without requiring anything to be requested. Sub-directory files provide module-specific context without polluting sessions that don't need it.

**Structure:**
- Root `AGENTS.md`: stack summary, build/test commands, critical rules, naming conventions. Keep under 200 lines.
- `src/AGENTS.md`: source-tree architecture, directory layout, barrel export conventions.
- `src/{module}/AGENTS.md`: module-specific rules, invariants, known pitfalls.

**Generated by `/init-deep`** — the command scans the project and generates appropriately-scoped `AGENTS.md` files throughout the directory tree.

**Design note:** Sub-directory files are additive. An agent reading `src/payments/service.ts` receives the root `AGENTS.md` + `src/AGENTS.md` + `src/payments/AGENTS.md` — all layered, in order from most general to most specific.

---

### Tier 2: CARL-Style Injection — Principles and Domain Knowledge

**Mechanism:** `carl-inject.ts` plugin runs on `tool.execute.after` (Read). It analyzes file content (stripped of code blocks) and path keywords, consults `docs/domain/INDEX.md` and the principles manifest, and injects matching docs into the Read output. On the first trigger per session, it also reads `execution-state.md` for task-awareness. A `ContextCollector` manages dedup and enforces a budget cap to prevent context overflow.

**Two categories of injected content:**

**Technical principles** (`docs/principles/`): Architectural patterns, conventions, anti-patterns. Mapped by keyword in the principles manifest.

**Business domain knowledge** (`docs/domain/`): Business rules, flows, edge cases. Mapped by keyword in `INDEX.md`.

**INDEX.md** serves as the CARL lookup table (keyword → files) and the planner's orientation document (which domain knowledge exists before deciding what to load).

---

### Tier 3: PreToolUse Hook — Skill Injection by File Pattern

**Mechanism:** `skill-inject.ts` plugin runs on `PreToolUse`, intercepting `Write` and `Edit` tool calls. It inspects the target file path and injects the corresponding skill.

**Purpose:** Ensure the agent has precise, step-by-step instructions for the artifact it is about to create — deterministically, without depending on the agent remembering to load anything.

| File pattern | Injected skill |
|---|---|
| `**/*.test.ts` | `test-writing/SKILL.md` |
| `app/**/page.tsx` | `page-creation/SKILL.md` |
| `app/api/**/route.ts` | `api-route-creation/SKILL.md` |
| `app/**/actions.ts` | `server-action-creation/SKILL.md` |
| `**/schema.prisma` | `schema-migration/SKILL.md` |

Patterns are configured per-project in `opencode.json`. The mechanism is universal.

---

### Tier 4: Declarative in PLAN.md — Explicit Skill Requirements

**Mechanism:** The planner lists required skills in the task XML. The implementer reads this as part of the task instruction.

```xml
<task>
  <n>Create withdrawal server action</n>
  <skills>server-action-creation, schema-migration</skills>
  <files>src/app/actions/withdrawal.ts</files>
  <action>...</action>
  <verify>POST to action returns 201</verify>
  <done>Action validates input, creates DB record, returns typed result</done>
</task>
```

---

### Tier 5: Runtime State — Dynamic Agent Memory

**Mechanism:** Agents read and write state files in `.opencode/state/` during execution.

**Purpose:** Cross-session persistence, inter-agent communication, task resumability.

Files: `persistent-context.md`, `execution-state.md`, `{agent}-work.md`. Detailed in Section 16.

---

## 5. Agent Architecture

The framework uses a minimal set of specialized agents. Specialization provides three concrete benefits: different permission profiles enforced at the platform level, different reasoning modes via different system prompts, and context isolation.

### Primary Agents (user-facing)

**`build`** — Full access, Sonnet model. Main interactive agent. Spawns subagents, orchestrates workflows.

**`plan`** — Read-only, cheaper model. Research and exploration. Cost-sensitive tasks that don't require write access.

### Planning Agent (Section 6 covers the internal pipeline in detail)

**`planner`** — Único agente de planning exposto ao `build`. Internamente orquestra três fases via `task` tool: pré-análise (Metis), interview-mode (Prometheus) e revisão de executabilidade (Momus). O `build` faz uma única chamada; o `planner` gerencia o ciclo completo e entrega o `plan.md` aprovado. Tem permissão para usar o `task` tool para spawnar `explore`, `librarian` e `plan-reviewer` como subagentes internos.

**`plan-reviewer`** — Subagente interno do `planner`. Valida executabilidade do plano. Nunca é chamado diretamente pelo `build`. Declarado como agente nomeado separado para que o planner possa referenciá-lo via `task(subagent_type="plan-reviewer")`.

### Execution Pipeline Agents

**`spec-writer`** — Produces structured specifications through a 5-phase interview. Write access to `docs/specs/` only.

**`implementer`** — Orchestrates execution within a worktree. Full bash access within the worktree. Runs READ→ACT→COMMIT→VALIDATE loop.

**`validator`** — The judge. Reads spec before code. Returns BLOCK/FIX/NOTE/APPROVED. Full read-write access to worktree.

**`reviewer`** — Advisory only. Read-only, bash disabled. Post-PR feedback. Never blocks the pipeline.

**`unify`** — Closes the loop. Reconciles plan vs. delivery, updates state and domain documentation, merges worktree.

### Research Agents (spawned on-demand)

**`explore`** — Fast codebase exploration and contextual grep. Cannot write or delegate. Used heavily by Metis and the planner during pre-planning research.

**`librarian`** — Official docs, OSS implementations, codebase deep-dive. Cannot write or delegate. Used for authoritative external references.

---

## 6. The Planning Pipeline — One Agent, Three Internal Phases

O pipeline de planning é executado por **um único agente `planner`** exposto ao `build`. Internamente, o `planner` orquestra três fases usando o `task` tool — o mesmo mecanismo que o Claude Code usa para spawnar subagentes. O `build` faz uma única chamada; o `planner` entrega o `plan.md` aprovado.

```
build
  └── task(subagent_type="planner")
        │
        ├── Phase 1 — Análise (estilo Metis)
        │     task(explore, run_in_background=true) ─→ padrões do codebase
        │     task(librarian, run_in_background=true) ─→ docs externos
        │     [sintetiza: intent type, ambiguidades, diretivas]
        │
        ├── Phase 2 — Interview + Plano (estilo Prometheus)
        │     question() ─→ perguntas ao desenvolvedor
        │     escreve CONTEXT.md com decisões capturadas
        │     escreve plan.md com tasks em XML
        │
        └── Phase 3 — Revisão + Aprovação (estilo Momus)
              task(subagent_type="plan-reviewer") ─→ OKAY ou REJECT
              se REJECT: revisa plan.md e chama plan-reviewer novamente
              loop até OKAY
              question() ─→ apresenta plan ao dev para aprovação explícita
              só escreve active-plan.json após dev aprovar
```

**Por que um agente em vez de três chamados sequencialmente pelo `build`?** Porque o estado flui naturalmente dentro de um único agente. A fase de análise descobre padrões e produz diretivas; a fase de interview usa essas diretivas para fazer perguntas targeted; a fase de revisão acessa o plan.md recém-escrito. Se fossem três agentes separados coordenados pelo `build`, o `build` teria que serializar o output de cada fase e repassar como input para a próxima — frágil e verboso. O `planner` gerencia esse estado internamente.

### Configuração de permissões no opencode.json

```jsonc
{
  "agents": {
    "planner": {
      "model": "claude-opus-4-6",
      "permission": {
        "write": "allow",     // restrito a docs/specs/ no prompt
        "bash": "allow",      // restrito a git log, git diff, ls no prompt
        "task": "allow",      // permite spawnar explore, librarian, plan-reviewer
        "edit": "deny",
        "question": "allow"   // interview mode com o desenvolvedor
      }
    },
    "plan-reviewer": {
      "model": "claude-sonnet-4-6",
      "permission": {
        "task": "deny",       // não pode re-delegar
        "write": "deny",
        "edit": "deny",
        "bash": "deny"
      }
    }
  }
}
```

### Phase 1 — Análise de Intenção (Metis pattern)

**Roda antes de qualquer pergunta ao usuário.** O planner classifica o tipo de request e faz pesquisa paralela antes de abrir o interview.

| Intent type | Estratégia de pesquisa |
|---|---|
| Trivial/Simple | Sem pesquisa pesada. Pergunta rápida → ação. |
| Refactoring | `lsp_find_references` scope, cobertura de testes, rollback |
| Build from Scratch | `explore` + `librarian` em paralelo antes do interview |
| Mid-sized Task | Limites exatos, exclusões explícitas, anti-slop |
| Architecture | Consulta oracle; análise de impacto de longo prazo |
| Research | Probes paralelos, critérios de saída |

**Leitura de estado cross-session:** O plugin `j.memory` injeta `persistent-context.md` automaticamente na primeira tool call da sessão. O planner recebe decisões arquiteturais anteriores, padrões estabelecidos e lições aprendidas sem precisar ler o arquivo explicitamente. Isso informa diretamente a classificação de intent e as diretivas passadas para o interview.

**Output da Phase 1:** classificação de intent, ambiguidades identificadas, diretivas para o interview (o que o plano DEVE e NÃO DEVE conter), padrões de AI slop a evitar para esse tipo específico.

**Prompt de referência:** [`src/agents/metis.ts`](https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/agents/metis.ts) — o `planner` incorpora essa lógica como Phase 1 do seu prompt, estendida com: path do spec, localização dos domain docs e awareness do CARL system. `persistent-context.md` é injetado pelo plugin `j.memory` automaticamente.

### Phase 2 — Interview e Geração do Plano (Prometheus pattern)

**Roda após a Phase 1.** O planner inicia o interview com o desenvolvedor usando as diretivas da análise.

**Interview é proporcional à complexidade:** request trivial → 1-2 perguntas rápidas; arquitetura complexa → consultation estruturada incluindo subagente oracle.

**Decisões capturadas em CONTEXT.md** durante o interview, antes de gerar o plano. O plano referencia o CONTEXT.md como fonte de decisões humanas — o implementer não precisa adivinhar nada que foi explicitamente resolvido no planning.

**Goal-backward planning:** em vez de "quais tasks fazer?", o planner pergunta "o que precisa ser VERDADEIRO para o objetivo estar atingido?" Deriva verdades observáveis pelo usuário → artefatos necessários → tasks.

**Cada task declara:** skills requeridas (`<skills>`), wave de execução, agente recomendado, critérios de done verificáveis por agente.

**Prompt de referência:** [`src/agents/prometheus/`](https://github.com/code-yeongyu/oh-my-opencode/tree/dev/src/agents/prometheus) — `interview-mode.ts`, `plan-generation.ts`, `plan-template.ts`, `system-prompt.ts`. O planner incorpora essas seções estendidas com o formato XML de tasks do framework e awareness do skill system.

### Phase 3 — Revisão de Executabilidade (Momus pattern)

**Roda após o plan.md ser escrito.** O planner spawna o `plan-reviewer` via `task` e aguarda o veredicto.

**A pergunta do revisor:** "Consegue um desenvolvedor capaz executar esse plano sem travar?"

**O que verifica:** referências a arquivos existem? cada task tem um ponto de partida claro? há contradições bloqueantes?

**O que explicitamente NÃO verifica:** escolhas arquiteturais, otimidade da abordagem, cobertura de edge cases, completude dos critérios. É um blocker-finder, não um perfeccionista.

**Veredicto:** `OKAY` (padrão quando em dúvida — approval bias explícito) ou `REJECT` com máximo 3 issues específicos e acionáveis.

**Loop:** REJECT → planner revisa plan.md → chama plan-reviewer novamente. Em prática, um ciclo de revisão resolve a grande maioria dos casos.

### Phase 3.5 — Aprovação do Desenvolvedor (OBRIGATÓRIA)

**Roda após o plan-reviewer retornar OKAY.** O planner apresenta um resumo do plano ao desenvolvedor via `question` tool e pede aprovação explícita.

**O que apresenta:** goal, total de tasks, waves, arquivos-chave, riscos.

**Possíveis respostas:**
- **Sim** → escreve `active-plan.json` e reporta ao dev
- **Não / mudanças** → aplica ajustes → re-roda plan-reviewer → pede aprovação novamente

> **NUNCA escreve `active-plan.json` sem aprovação do desenvolvedor.** O plan-reviewer é um gate de qualidade automatizado. A aprovação do dev é a decisão real de go/no-go.

**Prompt de referência:** [`src/agents/momus.ts`](https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/agents/momus.ts) — incluindo o princípio de approval bias e o anti-pattern de listar mais de 3 issues.

---

## 7. The Dual Validation Loop

Two complementary quality gates catch different classes of failure.

```
                    ┌─────────────────────────────┐
                    │     OUTER LOOP (VCS)         │
                    │  git pre-commit hook          │
                    │  typecheck + lint + tests     │
                    │  DETERMINISTIC — no bypass    │
                    └─────────────┬───────────────┘
                                  │ passes
                    ┌─────────────▼───────────────┐
                    │     INNER LOOP (SEMANTIC)    │
                    │  validator agent             │
                    │  reads spec BEFORE code      │
                    │  BLOCK / FIX / NOTE          │
                    └─────────────┬───────────────┘
                                  │ APPROVED
                    ┌─────────────▼───────────────┐
                    │         UNIFY                │
                    │  closes loop, updates docs   │
                    │  merges worktree             │
                    └─────────────────────────────┘
```

**Outer loop — VCS layer (deterministic):** `typecheck && lint && tests` enforced by a git pre-commit hook. The agent physically cannot commit code that breaks these.

**Inner loop — Validator agent (semantic):** Catches what tests cannot — correct code that implements the wrong thing, uncovered acceptance criteria, scope creep. The validator reads the spec *before* reading the code.

---

## 8. The Core Loop — Implementer

```
┌──────────────────────────────────────────────────────────────────┐
│ START: receive task from plan.md                                  │
│                                                                   │
│  1. READ (with hashline)                                          │
│     - Load spec for this feature                                  │
│     - Load execution-state.md (which task is next?)               │
│     - Load validator-work.md if exists (previous cycle's          │
│       NOTEs, FIXes, BLOCKs — avoid repeating same mistakes)      │
│     - Load implementer-work.md if exists (resume context          │
│       from previous wave — decisions, deviations, blockers)       │
│     - j.memory plugin auto-injects persistent-context.md          │
│     - Read relevant files — hashline plugin tags each line        │
│       with content hash (e.g., 11#VK: function hello() {)        │
│                                                                   │
│  2. ACT                                                           │
│     - Implement using hashline-aware edit tool                    │
│     - Edit references line hashes, not content reproduction       │
│     - Tier 3 skill injection fires automatically on each Write    │
│     - auto-format plugin fires after each Write/Edit              │
│     - comment-checker plugin fires after each Write/Edit          │
│                                                                   │
│  3. COMMIT                                                        │
│     - git add + git commit                                        │
│     - pre-commit hook fires: typecheck + lint + tests             │
│     - if hook FAILS → fix and repeat from ACT                     │
│     - if hook PASSES → commit succeeds                            │
│                                                                   │
│  4. VALIDATE                                                      │
│     - spawn validator subagent                                    │
│     - validator reads implementer-work.md (understand decisions)  │
│     - validator reads spec, then reads code diff                  │
│     - returns BLOCK / FIX / NOTE / APPROVED                       │
│     - validator writes findings to validator-work.md              │
│     - if BLOCK → fix and repeat from ACT                          │
│     - if FIX → validator fixes directly, re-validates             │
│     - if APPROVED (with NOTEs) → proceed                          │
│                                                                   │
│  5. UPDATE STATE + ENFORCE TODO                                   │
│     - mark task complete in execution-state.md                    │
│     - update implementer-work.md (decisions, deviations,          │
│       files modified, blockers encountered)                       │
│     - todo-enforcer plugin monitors for idle without completion   │
│     - if more tasks → next task from plan.md                      │
│     - if all tasks done → signal UNIFY                            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. The Judge — Validator Agent

### Intent-First Validation

The validator reads the spec before reading the code. It reframes the question from "is this code correct?" to "does this code satisfy the specification?"

### Context-Aware Validation

Before evaluating code, the validator reads `implementer-work.md` to understand the implementer's deliberate decisions and trade-offs. This prevents false BLOCKs on intentional deviations — if the implementer documented "used X instead of Y because Z", the validator evaluates the rationale rather than blindly flagging the deviation.

### BLOCK / FIX / NOTE Classification

**BLOCK** — Must be resolved before approval. Returned to implementer; loop continues.

**FIX** — Validator fixes directly. The validator has write access for this reason.

**NOTE** — Acceptable technical debt, documented for later. Written to `validator-work.md`.

All findings (BLOCK, FIX, NOTE) are appended to `validator-work.md` after each validation cycle. The implementer reads this file at the start of the next wave to avoid repeating flagged issues.

---

## 10. Reviewer vs. Validator — A Critical Distinction

| | Reviewer | Validator |
|---|---|---|
| **When** | Post-PR, async | During implementation loop |
| **Audience** | Human developer | Pipeline |
| **Access** | Read-only | Read + Write |
| **Effect** | Advisory, never blocks | Gates pipeline, can fix directly |
| **Question** | "Is this good code?" | "Does this satisfy the spec?" |

---

## 11. The UNIFY Step — Closing the Loop

UNIFY is the mandatory final step of every feature implementation. No feature is complete without it.

### UNIFY Responsibilities

1. **Read implementation audit trail** — read `implementer-work.md` (decisions, deviations, files modified) and `validator-work.md` (deferred NOTEs, resolved issues). These are the primary sources for understanding what actually happened during implementation.
2. **Reconcile planned vs. delivered** — compare `plan.md` against the actual git diff, cross-referenced with `implementer-work.md` deviations and `validator-work.md` deferred notes.
3. **Log decisions to `persistent-context.md`** — read existing content, then append: decisions from `implementer-work.md`, unresolved NOTEs from `validator-work.md`, lessons learned, patterns established. Avoid duplication with existing entries.
4. **Update `execution-state.md`** — mark all tasks complete.
5. **Update domain documentation** — read spec + diff, identify affected domains, update `docs/domain/{domain}/*.md` files.
6. **Update `docs/domain/INDEX.md`** — reflect any new/changed documentation files.
7. **Merge worktree** — merge feature branch into main.
8. **Final commit** — code + docs together, atomically.

---

## 12. Spec Production Pipeline

### The 5-Phase Spec Interview

The `spec-writer` agent produces specs through a structured interview:

**Phase 1 — Discovery.** Feature at high level. Problem, scope, boundary.

**Phase 2 — Requirements.** Functional requirements, non-functional requirements, acceptance criteria (Given/When/Then).

**Phase 3 — Contract.** API contract, server action signatures, component interfaces.

**Phase 4 — Data.** Schema changes, migrations, type definitions.

**Phase 5 — Review.** Full spec presented for human approval. Explicit out-of-scope list.

### Spec Template

```markdown
# Spec: {Feature Name}

## Context
{Why this feature exists and what problem it solves}

## Requirements

### Functional
- {requirement}

### Non-Functional
- {performance / security / constraint}

### Acceptance Criteria
- Given {precondition}, when {action}, then {outcome}

## API Contract
{Endpoints or server action signatures with request/response shapes}

## Data Model
{Schema changes, new tables/types, migration notes}

## Error Handling
{Error cases, codes, user-facing messages}

## Edge Cases
{Known edge cases and expected behavior}

## Out of Scope
{Explicitly excluded to prevent scope creep}

## Testing Strategy
{Unit, integration, e2e coverage expectations}
```

---

## 13. Skills — Deterministic Knowledge Injection

### What Skills Are

Skills are work instructions — step-by-step guides for producing a specific artifact. Distinct from principles (which explain *why* a pattern exists) and domain docs (which capture business knowledge). Skills explain *how to produce this file, right now*.

### Skill-Embedded MCPs

Skills can declare embedded MCP servers in their frontmatter. The MCP is launched when the skill is loaded and torn down when the skill is no longer active.

```yaml
---
name: playwright-testing
description: Browser automation via Playwright for E2E tests and verification
mcp:
  playwright:
    command: npx
    args: ["-y", "@playwright/mcp@latest"]
---

# Playwright Testing Skill
...
```

This keeps MCPs scoped to the task that needs them. A playwright MCP does not need to be running during backend work. A database MCP does not need to be running during frontend tests. Context window stays clean.

### Three Enforcement Layers

1. **PreToolUse hook** (Tier 3) — automatic by file pattern
2. **PLAN.md declaration** (Tier 4) — explicit per-task requirement
3. **`skill` tool** — fallback, called explicitly when needed

### Skill Format

```markdown
---
name: server-action-creation
description: Step-by-step guide for creating Next.js Server Actions
triggers: [actions.ts, action.ts, app/**/actions/**]
# Optional embedded MCP:
# mcp:
#   my-mcp:
#     command: npx
#     args: ["-y", "my-mcp-server"]
---

# Server Action Creation

## Prerequisites
- [ ] Schema changes complete and migrated
- [ ] Service layer exists for business logic

## Steps
1. Create at `src/app/actions/{name}.ts`
2. Add `"use server"` directive
3. Import zod and define input schema
4. Validate with safeParse
5. Call service layer — no business logic in actions
6. Return typed success or error response

## Validation
- [ ] `npx tsc --noEmit` passes
- [ ] Error path returns typed error, not thrown exception
```

---

## 14. Context Injection — CARL Pattern

CARL v2 — content-aware keyword detection inspired by oh-my-opencode. Instead of matching only file path fragments (v1), the plugin analyzes file content after stripping code blocks, plus extracts task context from `execution-state.md` on the first trigger. A `ContextCollector` manages dedup, priority, and an 8 KB budget cap to prevent context overflow. Two hooks: `tool.execute.after` (Read) for injection and `experimental.session.compacting` for compaction survival.

**Principles manifest format:**
```
docs/principles/manifest

AUTH_STATE=active
AUTH_RECALL=auth, authentication, login, session, token, jwt
AUTH_FILE=docs/principles/auth-patterns.md

ERROR_STATE=active
ERROR_RECALL=error, exception, try-catch, failure
ERROR_FILE=docs/principles/error-handling.md
```

**INDEX.md (domain docs):**
```markdown
## cashout
Keywords: cashout, saque, withdrawal, payout
Files:
  - cashout/rules.md — Core business rules
  - cashout/limits.md — Daily limits, thresholds, cooldown
  - cashout/edge-cases.md — Documented edge cases
```

---

## 15. Domain Documentation — docs/domain/

Domain documentation captures business knowledge: rules, flows, limits, edge cases. Distinct from technical principles.

**Structure:**
```
docs/domain/
├── INDEX.md                    # Global index — CARL lookup + planner orientation
├── {domain}/
│   └── *.md
```

**Lifecycle:** Initial creation is manual. Updates are automatic via UNIFY after each feature that touches the domain. UNIFY writes in present tense only — the docs describe the current state of implemented business rules, not historical intent.

---

## 16. State System — Persistence and Agent Communication

State files are the framework's inter-agent communication layer. Every agent that reads a state file is responsible for acting on its contents; every agent that writes one is responsible for keeping it accurate.

### persistent-context.md

Cross-session memory (like OpenClaw). Updated by UNIFY after each feature. Contains: last session summary, active specs, key architectural decisions with rationale, known unresolved issues.

**Written by:** UNIFY (step 2 — logs decisions, patterns, and lessons learned after each feature).

**Read by:**
- **j.memory plugin** — auto-injects on the first tool call of every session via `tool.execute.after`, and re-injects during compaction via `experimental.session.compacting`. This ensures all agents (including planner and implementer) receive repo memory without reading the file explicitly.
- **UNIFY** (step 2) — reads existing content before appending, to avoid duplication and maintain coherent history.

> **Note:** Sub-agents (planner, implementer, validator) do NOT read `persistent-context.md` directly. The `j.memory` plugin handles injection at the session level, ensuring memory is available to all agents from the very first tool call.

### execution-state.md

Per-feature shared state. Contains: current spec + plan paths, task table (ID/status/agent/validation/notes), files modified, agent messages.

**Written by:** Implementer (step 5 — marks tasks complete, updates files modified), UNIFY (step 3 — marks all tasks final).

**Read by:** Implementer (step 1 — which task to work on next), todo-enforcer plugin (detects idle sessions with incomplete tasks), UNIFY (step 1 — reconcile planned vs. delivered).

### validator-work.md

Validator's audit trail. Includes every issue found, its BLOCK/FIX/NOTE classification, and resolution status. NOTEs accumulate here as documented acceptable debt.

**Written by:** Validator — after each validation cycle, appends issues found and their classifications.

**Read by:**
- **Implementer** (step 1, before the next wave) — to understand what the validator flagged in the previous cycle. Prevents repeating the same mistakes and provides context on NOTEs (accepted debt) vs. BLOCKs (must fix).
- **UNIFY** (step 1) — to incorporate deferred NOTEs into the reconciliation and persist unresolved debt to `persistent-context.md`.

### implementer-work.md

Implementer's scratchpad and decision log. Contains: current task ID, wave number, decisions made during implementation, deviations from plan (with rationale), blockers encountered, files created/modified.

**Written by:** Implementer (step 5 — updates after each task with decisions, deviations, and files modified).

**Read by:**
- **Validator** — before validating code. Understanding the implementer's deliberate decisions prevents false BLOCKs on intentional trade-offs. If the implementer documented "used X instead of Y because of Z", the validator evaluates the rationale rather than blindly flagging the deviation.
- **UNIFY** (step 1) — to reconcile what was planned vs. what was actually done. Deviations logged here feed into the decision log persisted to `persistent-context.md`.

### active-plan.json (session routing pointer)

Session-level pointer written by the planner under `.opencode/state/active-plan.json`, consumed by `plan-autoload.ts` and write-time guards. Stores `slug`, `planPath`, and `specPath` so the active feature can be resumed without scanning `docs/specs/*` heuristically.

### State File Interaction Matrix

| State File | Planner | Implementer | Validator | UNIFY | j.memory (plugin) |
|---|---|---|---|---|---|
| `persistent-context.md` | — | — | — | **R/W** (step 2) | **R** (auto-inject) |
| `execution-state.md` | — | **R/W** (steps 1, 5) | — | **R/W** (steps 1, 3) | — |
| `validator-work.md` | — | **R** (step 1) | **W** (after validation) | **R** (step 1) | — |
| `implementer-work.md` | — | **W** (step 5) | **R** (before validation) | **R** (step 1) | — |
| `active-plan.json` | **W** | — | — | — | — |

---

## 17. Git Worktree Parallelization

### How It Works

```
main worktree (orchestrator)
├── reads plan.md — identifies waves
├── Wave 1 (independent tasks):
│   ├── git worktree add worktrees/{feature}-task-1 -b feature/task-1
│   ├── git worktree add worktrees/{feature}-task-2 -b feature/task-2
│   ├── spawn implementer subagent per worktree (parallel)
│   └── each runs READ→ACT→COMMIT→VALIDATE independently
├── Wave 2 (after Wave 1 complete):
│   ├── creates Wave 2 worktrees
│   └── repeat
└── all waves complete → signal UNIFY
```

### Shared State

`.opencode/state/` lives in the main worktree. All subagents coordinate through state files.

### Merge Strategy

UNIFY merges all feature branches. After merge, worktrees are cleaned: `git worktree remove`.

### When Not to Parallelize

Single-wave plans (all tasks sequential) don't benefit from worktrees. The planner identifies this during wave assignment; the implementer uses a single worktree with sequential execution.

---

## 18. Command Interface

| Command | Description |
|---|---|
| `/spec` | Launch spec-writer for a new feature |
| `/plan` | Launch planning pipeline (Metis → Planner → Plan Reviewer) |
| `/implement` | Launch implementer for an approved plan |
| `/check` | Run typecheck + lint + tests manually |
| `/lint` | Run linter only |
| `/test` | Run test suite only |
| `/pr-review` | Launch reviewer agent on current branch diff |
| `/status` | Show current execution-state.md summary |
| `/unify` | Manually trigger UNIFY for current feature |
| `/init-deep` | Generate hierarchical AGENTS.md files throughout the project |
| `/start-work` | Launch implementer from an approved plan (shortcut) |
| `/handoff` | Create context summary for continuation in a new session |
| `/ulw-loop` | Self-referential loop — continues until task is 100% complete |

**Two primary workflows:**

**Path A — Spec-driven:** `/spec` → approve → `/plan` (three-agent pipeline) → approve → `/implement` → validator gates → UNIFY.

**Path B — Plan-driven:** `/plan` → planner flag → `plan-autoload.ts` → implementer → validator gates → UNIFY.

---

## 19. Plugins — Automation Hooks

Plugins run deterministically in the host process, outside LLM context. Enforcement at execution layer, not prompt layer.

### env-protection.ts
**Hook:** `tool.execute.before`
Blocks reads of sensitive files (`.env*`, credentials, keys, secrets) for all agents.

### auto-format.ts
**Hook:** `tool.execute.after`
Auto-formats files after every Write/Edit. Eliminates formatting-related validator failures.

### plan-autoload.ts
**Hooks:** `tool.execute.after` (first Read, fire-once) + `experimental.session.compacting`
Detects `.opencode/state/active-plan.json`. On the first Read of a session, loads the plan and appends it to the Read output. Keeps the pointer on disk so later sessions and compaction resolve the same active plan consistently.

### carl-inject.ts
**Hooks:** `tool.execute.after` (Read) + `experimental.session.compacting`
CARL v2 — content-aware injection of principles and domain docs. Three keyword signals: (1) task-awareness from `execution-state.md` (fire-once per session), (2) file content analysis after `stripCodeBlocks` (primary), (3) path keywords (secondary). Word-boundary matching prevents false positives ("auth" ≠ "authorize"). `ContextCollector` manages dedup + 8 KB budget cap. Compaction hook re-injects all collected docs via `output.context.push`.

### skill-inject.ts
**Hook:** `tool.execute.after` (Read + Write/Edit)
Injects skill instructions contextually based on file path pattern:
- **Read:** full SKILL.md content appended to output — agent sees instructions before writing
- **Write/Edit:** short reminder if skill was never injected via Read

### intent-gate.ts
**Hook:** `tool.execute.after` (Write/Edit only)
Scope-guard. After any file modification, checks if the modified file is referenced in the current plan resolved from `active-plan.json` or `execution-state.md`. If the file is not in scope, appends a warning to the tool output alerting the agent about potential scope creep.

Example: agent writes `src/utils/random.ts` but the plan only mentions `src/components/`. The plugin appends: `[intent-gate] ⚠ SCOPE WARNING: "src/utils/random.ts" is not referenced in the current plan.`

### todo-enforcer.ts
**Hooks:** `experimental.session.compacting` + `tool.execute.after` (Write/Edit only)
Two-layer mechanism to prevent task drift:
1. **Compaction:** injects full pending task list via `output.context.push` — survives context window resets.
2. **Write/Edit:** appends lean pending count after each file modification — continuous nudge.

The agent cannot lose track of pending tasks, even across long sessions with compaction. This is the mechanism that ensures loop integrity without depending on the agent's own initiative.

### comment-checker.ts
**Hook:** `tool.execute.after` (Write/Edit only)
Inspects written code for excessive or obvious comments. Reminders injected when detected. Intelligently excludes: BDD comments, JSDoc/TSDoc blocks, TypeScript directive comments (`@ts-ignore`, `// eslint-disable`), license headers.

Goal: code generated by agents should be indistinguishable from code written by a senior developer. Obvious comments are one of the clearest signals of AI-generated output.

### hashline-read.ts
**Hook:** `tool.execute.after` (Read only)
After every file read, tags each line with a short content hash:

```
11#VK: function hello() {
22#XJ:   return "world";
33#MB: }
```

The agent reads the file with these tags. When it later edits the file, it references the tags rather than reproducing the original content.

### hashline-edit.ts
**Hook:** `tool.execute.before` (Edit only)
Before applying any edit, validates that the referenced line hashes still match the current file content. If the file changed since the last read, the hashes won't match and the edit is rejected before any corruption occurs.

This resolves one of the most persistent classes of agent failure: editing a line that was modified by a concurrent task, a previous failed edit, or auto-formatting. See Section 22 for full rationale.

### memory.ts
**Hooks:** `tool.execute.after` (first tool call, fire-once) + `experimental.session.compacting`
Injects `persistent-context.md` (cross-session repo memory, written by UNIFY) into the session:
1. On the first tool call of any session, reads `persistent-context.md` and appends to `output.output`.
2. During compaction, re-injects via `output.context.push` to survive context window resets.

This is the mechanism that makes `persistent-context.md` available to all agents — planner, implementer, and others — without each agent needing to read it explicitly.

---

## 20. Custom Tools — LLM-Callable Functions

### find-pattern

Returns curated canonical examples for a given pattern type. Encodes human judgment about which files represent the canonical pattern — preventing agents from imitating legacy or exceptional code found by naive search.

```typescript
// Input: pattern type (enum)
// Output: { files: string[], hint: string }
```

### next-version

Generates the next migration/schema version filename following project conventions. Reads existing migration directory, extracts version numbers, increments, returns correctly formatted name. Prevents version collisions during parallel worktree execution.

---

## 21. LSP and AST-Grep Tools

LSP and AST-Grep tools give agents IDE-level precision for code navigation and modification. These are the same capabilities a developer has in their editor — made callable by agents as standard tools.

### Why These Matter

Text-based grep finds strings. LSP and AST-Grep understand structure. The difference is the difference between "find all lines containing `login`" and "find all call sites of the `login` function, including aliased imports, and show how the return value is consumed at each call site." The latter is what's needed for safe refactoring.

### LSP Tool Suite

| Tool | Description |
|---|---|
| `lsp_diagnostics` | Get all errors and warnings in the workspace before building. Pre-commit quality check without running the full build. Especially useful for catching type errors introduced by refactoring before committing. |
| `lsp_prepare_rename` | Validate that a rename operation is safe before applying it. Returns whether the symbol at the given location can be renamed and what its current name is. |
| `lsp_rename` | Rename a symbol (function, variable, type, etc.) across the entire workspace. All references are updated atomically. This is the correct tool for any identifier rename — not find-and-replace. |
| `lsp_goto_definition` | Jump to the definition of a symbol. Essential for understanding a dependency before modifying it, and for navigating to the canonical implementation when the calling code is encountered. |
| `lsp_find_references` | Find all usages of a symbol across the entire workspace. Returns file path, line, column, and surrounding context for each reference. The correct tool for impact analysis before any change. |
| `lsp_symbols` | List all symbols defined in a file (outline view) or search for a symbol across the workspace by name. Returns type (function, class, variable, etc.) and location. |

**When to use LSP tools:**
- Before refactoring any shared symbol: `lsp_find_references` to map all call sites
- Before renaming: `lsp_prepare_rename` to validate, then `lsp_rename` to apply
- When encountering an unfamiliar type or function: `lsp_goto_definition`
- After a refactoring that may have introduced type errors: `lsp_diagnostics`
- When trying to understand a module's public API: `lsp_symbols`

### AST-Grep Tool Suite

| Tool | Description |
|---|---|
| `ast_grep_search` | Search for code patterns using structural AST matching rather than text matching. Understands the grammar of 25 languages. Can find "all arrow functions that return JSX" or "all calls to this method with more than 2 arguments" — queries that are impossible or error-prone with regex. |
| `ast_grep_replace` | Replace code patterns structurally. Accepts a `dryRun` parameter to preview transformations before applying. The correct tool for mechanical refactoring that follows a structural pattern (e.g., "replace all `foo.bar()` calls with `foo.baz()`"). |

**When to use AST-Grep:**
- When searching for a structural pattern, not a string: `ast_grep_search`
- Before mechanical refactoring: `ast_grep_search` to find all instances, then `ast_grep_replace(dryRun=true)` to preview, then `ast_grep_replace` to apply
- When grep would return too many false positives due to the pattern appearing in strings or comments

**LSP vs. AST-Grep — when to use which:**

| Need | Tool |
|---|---|
| Find all usages of a named symbol | `lsp_find_references` |
| Find code matching a structural pattern | `ast_grep_search` |
| Rename a symbol across the codebase | `lsp_rename` |
| Replace a structural pattern across the codebase | `ast_grep_replace` |
| Check if current code has type errors | `lsp_diagnostics` |
| Understand what a symbol's type or signature is | `lsp_goto_definition` |

---

## 22. Hash-Anchored Edit Tool — Hashline

### The Problem

Standard edit tools require the agent to reproduce the exact content of the lines it wants to change. This fails in several realistic scenarios:
- The file was auto-formatted after the agent last read it
- A concurrent task modified the file in the same worktree
- A previous failed edit partially modified the file
- The agent's context window has degraded and its recall of exact content is imperfect

The result: `"String to replace not found in file"` — one of the most common agent errors. The agent is blamed, but the failure is the harness.

**Benchmark evidence** (Can Bölük, *The Harness Problem*, Feb 2026): Testing 16 models with 3 edit tools across 180 tasks. Hashline matched or beat str_replace for all models. For Grok Code Fast 1, success rate went from **6.7% to 68.3%** — a tenfold improvement. This is not a model quality difference. It is purely a harness difference. Reference: [blog.can.ac/2026/02/12/the-harness-problem](https://blog.can.ac/2026/02/12/the-harness-problem/)

The oh-my-opencode implementation is at `src/hooks/hashline-read-enhancer/` and `src/hooks/hashline-edit-diff-enhancer/` in the oh-my-opencode repo, and serves as the reference implementation.

### How Hashline Works

**On read:** The `hashline-read.ts` plugin (PostToolUse on Read) tags each line with a 2-3 character content hash:

```
11#VK: function hello() {
22#XJ:   return "world";
33#MB: }
```

Line numbers and hashes are stable identifiers. The agent reads the file once and gets these identifiers.

**On edit:** The agent references line hashes instead of reproducing content:

```
Replace line 22#XJ with:
  return "universe";
```

or

```
Replace range 11#VK to 33#MB with:
  function hello() {
    return "universe";
  }
```

**Validation:** The `hashline-edit.ts` plugin (PreToolUse on Edit) verifies that the referenced hashes match the current file content. If the file changed since the last read — by formatting, by another agent, by anything — the hashes won't match and the edit is rejected cleanly before corruption.

**Result:** The agent no longer needs perfect recall of file content. It needs only to recall short, pseudo-random tags. This is a much more reliable memory task.

---

## 23. IntentGate — Scope Guard

### The Problem

Agents drift. Given a plan with defined scope, an agent may modify files outside that scope — refactoring utility functions, "improving" unrelated code, or fixing issues it discovers along the way. This scope creep is one of the most persistent sources of unexpected changes in agent-driven development.

### How IntentGate Works

`intent-gate.ts` runs on `tool.execute.after` for Write/Edit operations. It acts as a post-write scope guard.

**Process:**
1. On the first Write/Edit, lazy-load the set of files referenced in the plan pointed to by `active-plan.json`
2. After every Write/Edit, check if the modified file matches any file in the plan
3. If the file is NOT in the plan, append a scope-creep warning to the tool output

**Output:** The agent sees a clear warning after writing an out-of-scope file:

```
[intent-gate] ⚠ SCOPE WARNING: "src/utils/random.ts" is not referenced in the current plan.
Verify this change is necessary for the current task before continuing.
```

This warning is advisory, not blocking. The agent can proceed if the change is genuinely needed. But it surfaces scope creep immediately, preventing cascading out-of-scope modifications.

**Key scenarios:**
- Agent fixes an unrelated bug discovered during implementation → warning surfaces
- Agent refactors a utility function "while it's at it" → warning triggers review
- Agent creates a new file genuinely needed by the plan but with a different path → agent acknowledges and continues

---

## 24. Todo Enforcer — Loop Completion Guarantee

### The Problem

An agent can lose track of pending tasks for many reasons: context window compaction drops task state, degraded context after many interactions, or simply exiting the loop early. Without external enforcement, incomplete tasks stay incomplete.

### How the Todo Enforcer Works

`todo-enforcer.ts` uses two hooks:

**1. `experimental.session.compacting`** — When the context window is compacted, the enforcer reads `execution-state.md` and injects all pending tasks into `output.context.push`. This guarantees that tasks survive compaction — the most critical failure point for long-running sessions.

**2. `tool.execute.after` (Write/Edit)** — After every file modification, appends a lean pending task count. This is a continuous nudge, not the full list:

```
[todo-enforcer] 3 task(s) still pending. Continue working.
```

**Process:**
1. Read `execution-state.md` — check for incomplete tasks (lines with `- [ ]`)
2. During compaction: inject full list to `output.context` for survival
3. After Write/Edit: inject lean count to `output.output` for continuous nudge

**This is the mechanism that makes loops actually close.** Without it, the only guarantee that a plan completes is the agent's own initiative, which is probabilistic. With it, the system enforces completion from the outside — pending tasks persist through compaction and are visible after every modification.

**Interaction with UNIFY:** The Todo Enforcer ensures the implementer stays on track during execution. UNIFY closes the loop after all tasks are complete. They operate at different points: Todo Enforcer during execution, UNIFY after execution.

---

## 25. Comment Checker

Code generated by agents should be indistinguishable from code written by a senior developer. Excessive and obvious comments are one of the clearest signals of AI-generated output.

`comment-checker.ts` runs PostToolUse after Write/Edit operations.

**What it flags:**
- Obvious comments that restate what the code does (`// Initialize the variable`, `// Return the result`)
- Comments that explain standard language constructs
- Redundant inline documentation where the code is self-explanatory

**What it explicitly ignores:**
- BDD-style describe/it comments
- JSDoc/TSDoc documentation blocks
- TypeScript directive comments (`@ts-ignore`, `// eslint-disable-next-line`)
- License and copyright headers
- TODO/FIXME/HACK markers
- Comments that explain *why* something is done (non-obvious business logic)

**How it works:** Injects a reminder message into context when flagged content is detected. Not a hard block — the agent can justify keeping a comment. But it raises the bar for what gets committed.

---

## 26. Hierarchical AGENTS.md — /init-deep Pattern

### Problem

A single root `AGENTS.md` must either be too short (missing important module-specific context) or too long (polluting every session with irrelevant details).

### Solution

Generate a hierarchy of `AGENTS.md` files throughout the project directory tree, each containing context scoped to its directory. The `directory-agents-injector` plugin (Tier 1 mechanism) automatically collects and injects all relevant files when an agent reads any file.

```
project/
├── AGENTS.md              # Project-wide: stack, build commands, critical rules
├── src/
│   ├── AGENTS.md          # src-specific: directory layout, barrel conventions, import rules
│   └── payments/
│       └── AGENTS.md      # payments-specific: business invariants, integration contracts, known pitfalls
```

An agent reading `src/payments/service.ts` receives all three levels, layered from general to specific. An agent reading `src/ui/Button.tsx` receives root + `src/AGENTS.md` only — not the payments context.

### /init-deep Command

Scans the project and generates appropriate `AGENTS.md` files at each significant directory level. For each directory, it analyzes:
- What files are in this directory and what purpose they serve
- What conventions are specific to this directory
- What an agent should know before modifying files here that isn't already covered by parent files

The generated files are starting points. Developers should review and augment them with domain-specific knowledge, known pitfalls, and non-obvious constraints.

---

## 27. Permission Model

| Agent | Bash | File Write | Git | Task tool | Scope |
|---|---|---|---|---|---|
| `build` | Full | Full | Full | allow | Orchestration |
| `plan` | `git log`, `git diff`, `ls` only | None | Read only | allow | Research |
| `planner` | `git log`, `git diff`, `ls` only | `docs/specs/` only | Read only | **allow** — spawna explore, librarian, plan-reviewer | Planning pipeline completo |
| `plan-reviewer` | None | None | Read only | deny | Subagente interno do planner |
| `spec-writer` | None | `docs/specs/` only | Read only | deny | Spec production |
| `implementer` | Full (within worktree) | Full (within worktree) | Worktree only | allow | Implementation |
| `validator` | `typecheck`, `test`, `lint` only | Worktree only | Read only | deny | Validation + direct fixes |
| `reviewer` | None | None | Read only | deny | Advisory review |
| `unify` | Full (inclui `gh pr create`) | Full | Full | allow | Loop closure + doc updates + PR |
| `explore` | Read-only grep/glob | None | Read only | deny | Codebase research |
| `librarian` | Read-only | None | Read only | deny | Doc/OSS research |

---

## 28. Global MCPs and GitHub CLI

### Context7 — MCP padrão para todos os agentes

O MCP **Context7** fornece documentação atualizada de bibliotecas diretamente no contexto dos agentes. É declarado globalmente em `opencode.json` e fica disponível para todos os agentes sem necessidade de configuração por skill.

```jsonc
// opencode.json
{
  "mcp": {
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

**Por que global e não skill-embedded:** skills embedded são para MCPs de custo alto que só fazem sentido em contextos específicos (playwright para E2E, database schema para migrations). Context7 tem custo de contexto baixo e é útil em qualquer agente que escreve código — o implementer consulta docs de uma lib que está usando, o planner verifica a API de uma dependência antes de planejar, o validator confirma que o código usa a API corretamente. O benefício de ter disponível em todos supera o custo marginal de tokens.

**Uso pelos agentes:** os agentes chamam `resolve_library_id` para obter o ID correto da lib, depois `get_library_docs` para buscar a documentação. O planner pode instruir explicitamente no plan.md que o implementer consulte Context7 para libs específicas antes de implementar tasks que as usem.

### GitHub CLI — Abertura de PRs

O `unify` usa o GitHub CLI (`gh`) para abrir PRs ao final do loop. O `gh` já está disponível no bash do `unify` (permissão full). Não requer MCP — é uma ferramenta de linha de comando padrão.

**Fluxo no UNIFY:**

```bash
# Após merge da feature branch e commit final
gh pr create \
  --title "feat({scope}): {feature description}" \
  --body "$(cat docs/specs/{feature}/spec.md)" \
  --base main \
  --head feature/{feature-slug}
```

**O body do PR é preenchido automaticamente** com o conteúdo do `spec.md` — que já contém contexto, requisitos, critérios de aceitação e estratégia de testes. O revisor humano recebe um PR com toda a documentação necessária sem trabalho adicional.

**Configuração necessária:** `gh auth login` deve estar configurado no ambiente onde o OpenCode roda. Para CI/CD, usar `GH_TOKEN` env var.

**Integração com o reviewer agent:** após o PR ser aberto, o `reviewer` pode ser acionado explicitamente via `/pr-review` para análise advisory antes da revisão humana.

---

## 29. Full Workflow — End to End

### Path A — Spec-Driven (Formal)

```
1. SPEC PRODUCTION
   Developer: /spec "withdrawal request feature"
   spec-writer agent (5-phase interview):
     Phase 1-5: discovery → requirements → contract → data → review
   → docs/specs/{feature}/spec.md
   Developer approves spec

2. PLANNING (agente único — pipeline de 3 fases internas)
   Developer: /plan

   planner agent (fases internas via task tool):
     Phase 1 — Análise: classifica intent, spawna explore+librarian em paralelo
     Phase 2 — Interview: entrevista desenvolvedor, escreve CONTEXT.md
     Phase 3 — Revisão: spawna plan-reviewer; loop até OKAY
     Phase 3.5 — Aprovação: apresenta plan ao dev via question(); só prossegue com aprovação
   → docs/specs/{feature}/CONTEXT.md
   → docs/specs/{feature}/plan.md

   Developer approves final plan

3. IMPLEMENTATION
   implementer agent:
     for each wave (parallel via worktrees):
       git worktree add per task
       spawn implementer subagent per worktree
       each subagent loop:
         - READ: load spec, execution-state.md
         - READ: load validator-work.md (if exists — previous cycle findings)
         - READ: load implementer-work.md (if exists — resume context)
         - j.memory plugin auto-injects persistent-context.md
         - READ files (hashline tags lines with content hashes)
         - intent-gate active as scope-guard on Write/Edit
         - CARL injection fires on Read (principles + domain docs)
         - ACT: write code using hashline-aware edit tool
           * Tier 3 skill injection fires on each Read/Write
           * auto-format fires after each Write/Edit
           * comment-checker fires after each Write/Edit
         - COMMIT: pre-commit hook gates each commit
         - VALIDATE: validator reads implementer-work.md, then spec, then code
           * writes findings to validator-work.md
         - UPDATE STATE: execution-state.md + implementer-work.md
         - todo-enforcer injects pending tasks on compaction + after each Write
     wave N+1 starts after wave N complete

4. UNIFY
   unify agent:
     reads implementer-work.md (decisions, deviations)
     reads validator-work.md (deferred NOTEs, resolved issues)
     reconciles planned vs delivered (plan.md vs git diff + work files)
     logs decisions + deferred NOTEs to persistent-context.md
     updates execution-state.md (final)
     updates docs/domain/ affected by this feature
     updates docs/domain/INDEX.md
     merges all worktrees
     final commit: code + docs together
     gh pr create --title "feat(...)" --body "$(cat spec.md)" --base main
   Feature complete — PR aberto para revisão humana
```

### Path B — Plan-Driven (Lightweight)

```
1. PLANNING (lightweight, same three-agent pipeline)
   Developer: /plan "add rate limiting to withdrawal endpoint"
   Metis → Planner → Plan Reviewer → Developer Approval
   plan.md written → developer approves → active-plan.json created

2. AUTO-LOAD
   plan-autoload.ts detects flag
   New session with plan pre-loaded

3. IMPLEMENTATION + UNIFY
   Same as Path A steps 3-4
```

---

## 30. Design Decisions and Rationale

**D1 — Intent-first validation.** The validator reads the spec before the code. Catches correct code that implements the wrong thing.

**D2 — BLOCK/FIX/NOTE over binary pass/fail.** Three-tier classification reduces loop iterations by allowing the validator to fix trivial issues directly (FIX) without requiring a full agent round-trip.

**D3 — Reviewer is read-only; validator has write access.** A reviewer that can modify code cannot be an impartial observer. A validator that cannot modify code cannot efficiently fix trivial issues.

**D4 — Permissions enforced at platform level.** Platform-level constraints are more reliable than prompt-level instructions.

**D5 — Five-tier context over monolithic CLAUDE.md.** Each session has exactly the context it needs.

**D6 — Three-agent planning pipeline (Metis → Planner → Plan Reviewer).** Each agent catches a distinct class of planning failure. Metis catches intent misclassification and AI slop patterns before the interview wastes the developer's time. The Planner produces an executable plan through structured interview. The Plan Reviewer catches plans that cannot be executed — not plans that aren't optimal. The three agents are not redundant; they cover orthogonal failure modes.

**D7 — Plan Reviewer has approval bias.** The Plan Reviewer's job is to catch blockers, not to demand perfection. A plan that is 80% clear is good enough — developers resolve minor gaps during implementation. Demanding complete clarity before execution creates excessive review cycles. This is the explicit design in Momus (oh-my-opencode reference implementation).

**D8 — Metis fires research subagents before user interview.** For non-trivial requests, Metis runs parallel `explore` and `librarian` agents before asking the user a single question. When the interview begins, the planner already knows the codebase landscape. This makes interviews more efficient because the planner asks targeted questions rather than generic ones.

**D9 — Hashline addresses a harness problem, not a model problem.** Most edit failures blamed on the model are actually harness failures — the model knows what to change but cannot express it correctly because the edit tool requires perfect content reproduction. Hashline gives models a stable, verifiable identifier for every line, eliminating the reproduction requirement. The benchmark result (Grok Code Fast 1: 6.7% → 68.3%) demonstrates that the harness was hiding the model's actual coding ability behind mechanical failures.

**D10 — Todo Enforcer enforces loop integrity from outside the LLM.** Relying on the agent to continue its own loop is probabilistic. The Todo Enforcer makes continuation deterministic — it detects idle sessions with incomplete todos and forces resumption from the host process. This is the correct architectural location for this enforcement: outside the LLM, in the automation layer.

**D11 — Hierarchical AGENTS.md for precise context without bloat.** Sub-directory AGENTS.md files provide module-specific context that would bloat the root file if included there. The directory-agents-injector plugin ensures agents always get the relevant layers without getting irrelevant ones.

**D12 — Skill-Embedded MCPs scope tooling to tasks.** An MCP server's tools, schemas, and documentation consume context budget even when the MCP is not needed. Embedding MCPs in skills ensures they are present only when the skill is active. This extends the skill system from "knowledge on demand" to "tools on demand."

**D13 — LSP and AST-Grep for structural code navigation.** Text search is insufficient for safe refactoring. `lsp_find_references` finds all usages of a symbol including aliased imports. `lsp_rename` updates all references atomically. `ast_grep_search` finds structural patterns regardless of naming. These tools give agents the same precision a developer has in their editor — necessary for anything beyond file creation.

**D14 — IntentGate before all action.** The most common failure mode for ambiguous instructions is literal interpretation. Classifying intent before acting catches "delete this" (meaning "fix the problem") and "clean up" (meaning "refactor, not delete"). The classification is advisory — the agent can override — but it prevents the most obvious class of misinterpretation.

**D15 — Comment Checker as quality signal.** Excessive obvious comments are a reliable signal of AI-generated output. Enforcing their absence makes agent-written code harder to distinguish from senior developer code, which is the standard. The checker's intelligence about what to ignore (JSDoc, BDD, directives) prevents false positives that would interfere with legitimate documentation.

**D16 — UNIFY updates domain documentation automatically.** UNIFY is positioned at the only moment when all necessary information is simultaneously available: the approved spec (intent), the complete git diff (reality), and the previous domain docs (what needs updating). This is the correct and only reliable place for automatic documentation maintenance.

**D17 — Planner como agente único encapsulando três fases via task tool.** As três fases de planning (análise, interview, revisão) são gerenciadas internamente por um único agente `planner` em vez de serem coordenadas pelo `build`. Isso preserva o estado entre fases sem serialização externa, simplifica a interface do `build` (uma chamada → plano aprovado), e coloca a responsabilidade de loop de revisão onde ela pertence — dentro do agente que produziu o plano. O `task` tool do OpenCode é exatamente o mecanismo correto para isso: o mesmo que o Claude Code usa para subagentes.

**D18 — Context7 como MCP global em vez de skill-embedded.** MCPs de custo de contexto baixo e utilidade transversal devem ser globais. Context7 fornece documentação de libs e é útil ao implementer (saber a API certa), ao planner (verificar capacidades antes de planejar), e ao validator (confirmar uso correto da API). Skill-embedded MCPs são reservados para ferramentas de alto custo com uso restrito a contextos específicos (playwright para E2E, schema tools para migrations).

**D19 — GitHub CLI para PRs em vez de MCP ou API direta.** O `gh` CLI já está presente no bash do `unify` e é a interface mais simples e robusta para o GitHub disponível em ambiente de desenvolvimento. Não requer configuração de MCP adicional. O body do PR preenchido com `spec.md` garante que revisores humanos tenham contexto completo sem trabalho manual.

---

## 31. Summary Table — All Pieces

| Component | Type | Location | Purpose |
|---|---|---|---|
| `AGENTS.md` (hierarchical) | Context | project root + subdirs | Tier 1 always-loaded, layered by directory |
| `docs/principles/*.md` | Context | project | Technical architectural patterns |
| `docs/domain/INDEX.md` | Context | project | Global domain doc index for CARL + planner |
| `docs/domain/{domain}/*.md` | Context | project | Business rules and domain knowledge |
| `docs/specs/{feature}/spec.md` | Artifact | project | Feature specification (source of truth) |
| `docs/specs/{feature}/CONTEXT.md` | Artifact | project | Human decisions captured before planning |
| `docs/specs/{feature}/plan.md` | Artifact | project | Executable task plan with wave assignments |
| `opencode.json` | Config | project root | Agent definitions, models, permissions, MCPs globais |
| `.opencode/agents/planner.md` | Agent | `.opencode/` | Planning pipeline completo (3 fases internas) |
| `.opencode/agents/plan-reviewer.md` | Agent | `.opencode/` | Subagente interno do planner — executability gate |
| `.opencode/agents/spec-writer.md` | Agent | `.opencode/` | Spec producer |
| `.opencode/agents/implementer.md` | Agent | `.opencode/` | Implementation orchestrator |
| `.opencode/agents/validator.md` | Agent | `.opencode/` | Semantic validation judge |
| `.opencode/agents/reviewer.md` | Agent | `.opencode/` | Advisory post-PR reviewer |
| `.opencode/agents/unify.md` | Agent | `.opencode/` | Loop closure + doc updater |
| `.opencode/skills/*/SKILL.md` | Knowledge | `.opencode/` | Step-by-step work instructions (with optional embedded MCPs) |
| `.opencode/plugins/env-protection.ts` | Plugin | `.opencode/` | Block sensitive file reads |
| `.opencode/plugins/auto-format.ts` | Plugin | `.opencode/` | Format after every write |
| `.opencode/plugins/plan-autoload.ts` | Plugin | `.opencode/` | Auto-load plan on first Read + compaction |
| `.opencode/plugins/carl-inject.ts` | Plugin | `.opencode/` | Tier 2: content-aware principles + domain injection (Read + compaction) |
| `.opencode/plugins/skill-inject.ts` | Plugin | `.opencode/` | Tier 3: inject skills by file pattern on Read/Write |
| `.opencode/plugins/intent-gate.ts` | Plugin | `.opencode/` | Scope-guard: warn on out-of-plan Write/Edit |
| `.opencode/plugins/todo-enforcer.ts` | Plugin | `.opencode/` | Pending task persistence via compaction + Write |
| `.opencode/plugins/comment-checker.ts` | Plugin | `.opencode/` | Excessive comment detection |
| `.opencode/plugins/hashline-read.ts` | Plugin | `.opencode/` | Tag lines with content hashes on read |
| `.opencode/plugins/hashline-edit.ts` | Plugin | `.opencode/` | Validate hashes before applying edits |
| `.opencode/plugins/memory.ts` | Plugin | `.opencode/` | Auto-inject persistent-context.md at session start + compaction |
| `.opencode/tools/find-pattern.ts` | Tool | `.opencode/` | Return curated canonical examples |
| `.opencode/tools/next-version.ts` | Tool | `.opencode/` | Generate next migration filename |
| `.opencode/tools/lsp.ts` | Tool | `.opencode/` | LSP tool suite (6 tools) |
| `.opencode/tools/ast-grep.ts` | Tool | `.opencode/` | AST-aware search and replace (2 tools) |
| Context7 MCP (`@upstash/context7-mcp`) | MCP global | `opencode.json` | Documentação de libs em tempo real — disponível para todos os agentes |
| GitHub CLI (`gh`) | CLI tool | ambiente | Abertura de PRs pelo unify ao final do loop |
| `.opencode/state/persistent-context.md` | State | `.opencode/` | Cross-session memory |
| `.opencode/state/execution-state.md` | State | `.opencode/` | Per-feature shared task state |
| `.opencode/state/{agent}-work.md` | State | `.opencode/` | Per-agent scratch + audit trail |
| `.opencode/state/active-plan.json` | State | `.opencode/state/` | Session routing pointer |
| `.git/hooks/pre-commit` | Hook | `.git/` | Deterministic outer validation loop |
| `worktrees/{feature}-{task}/` | Runtime | project root | Isolated parallel execution environments |

---

## 32. Changelog — v2.0 to v2.1

### [ADDED] Three-agent planning pipeline (Metis → Planner → Plan Reviewer)

**v2.0:** Single planner agent. Produced a plan directly from spec + CONTEXT.md.

**v2.1:** Three sequential planning agents: Metis (pre-analysis), Planner (interview-mode), Plan Reviewer (executability gate).

**Motivation:** The v2.0 planner had no mechanism to catch intent misclassification or AI slop patterns before the interview began, and no external validation that the produced plan was actually executable. The three-agent pipeline separates these concerns: Metis classifies and researches before the developer's time is spent on an interview, the Planner interviews with full context and produces a structured plan, and the Plan Reviewer validates executability as a gate before implementation begins. The design and prompts are directly adapted from the Metis, Prometheus, and Momus agents in oh-my-opencode, with the framework's specific context (spec path, domain docs, CARL system, skill declarations) added. See agent source files: [`src/agents/metis.ts`](https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/agents/metis.ts), [`src/agents/prometheus/`](https://github.com/code-yeongyu/oh-my-opencode/tree/dev/src/agents/prometheus), [`src/agents/momus.ts`](https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/agents/momus.ts).

---

### [ADDED] Hash-Anchored Edit Tool (Hashline)

**v2.0:** Standard str_replace edit tool.

**v2.1:** Hashline — lines are tagged with content hashes on read; edits reference hashes rather than reproducing content; stale hashes are rejected before corruption.

**Motivation:** Edit failures blamed on model quality are frequently harness failures. The benchmark by Can Bölük (*The Harness Problem*, Feb 2026) tested 16 models and found that changing only the edit tool moved Grok Code Fast 1 from 6.7% to 68.3% success rate. The model's coding ability was hidden behind mechanical edit failures. Hashline eliminates the requirement for perfect content reproduction, which is the root cause of stale-line errors. Reference implementation: [`src/hooks/hashline-read-enhancer/`](https://github.com/code-yeongyu/oh-my-opencode/tree/dev/src/hooks) and `hashline-edit-diff-enhancer/` in oh-my-opencode. Blog post: [blog.can.ac/2026/02/12/the-harness-problem](https://blog.can.ac/2026/02/12/the-harness-problem/).

---

### [ADDED] LSP and AST-Grep Tool Suite

**v2.0:** `find-pattern` and `next-version` custom tools only.

**v2.1:** Full LSP tool suite (6 tools: `lsp_diagnostics`, `lsp_prepare_rename`, `lsp_rename`, `lsp_goto_definition`, `lsp_find_references`, `lsp_symbols`) plus AST-Grep suite (2 tools: `ast_grep_search`, `ast_grep_replace`).

**Motivation:** Text-based search is insufficient for safe refactoring. `lsp_find_references` finds all usages of a symbol including aliased imports that grep cannot detect. `lsp_rename` updates all references atomically. `ast_grep_search` finds structural patterns regardless of naming or whitespace. These tools give agents IDE-level precision — necessary for any work that goes beyond creating new files into modifying existing shared code.

---

### [ADDED] IntentGate — Scope Guard

**v2.0:** Not present. Agents could modify any file without scope awareness.

**v2.1:** `intent-gate.ts` plugin runs on `tool.execute.after` for Write/Edit operations. After any file modification, checks if the file is referenced in the current plan. If not, appends a scope-creep warning.

**Motivation:** Agents naturally drift — fixing unrelated bugs, refactoring utilities "while they're at it," or creating unnecessary abstractions. IntentGate acts as a post-write guardrail that surfaces scope drift immediately, before it cascades into a chain of out-of-scope changes.

---

### [ADDED] Todo Enforcer — Idle Loop Prevention

**v2.0:** Loops relied on the agent completing its own todos. Idle sessions with incomplete work stayed incomplete.

**v2.1:** `todo-enforcer.ts` plugin runs on `session.idle`. Detects incomplete tasks in `execution-state.md`, injects them back into context, forces continuation.

**Motivation:** Loop integrity cannot depend on the agent's initiative. The todo enforcer makes loop completion deterministic by enforcing it from the host process — the agent cannot go idle while todos are pending. This is the correct architectural location for this enforcement. Inspired by the `todo-continuation-enforcer` hook in oh-my-opencode.

---

### [ADDED] Comment Checker

**v2.0:** Not present. Comment quality was left to the agent's discretion.

**v2.1:** `comment-checker.ts` plugin runs PostToolUse after Write/Edit. Flags obvious and excessive comments. Ignores JSDoc, BDD, directives, TODO markers.

**Motivation:** Obvious comments are a reliable signal of AI-generated output. The goal is code that is indistinguishable from senior developer output. The comment checker raises the bar without blocking legitimate documentation. Directly adapted from oh-my-opencode's `comment-checker` package (`packages/comment-checker/`).

---

### [ADDED] Hierarchical AGENTS.md — /init-deep pattern

**v2.0:** Single root `AGENTS.md`. All agents in all sessions received the same context.

**v2.1:** `AGENTS.md` files throughout the directory tree. `directory-agents-injector` plugin collects all relevant levels when an agent reads a file. `/init-deep` command generates the initial hierarchy.

**Motivation:** A single root `AGENTS.md` cannot be both lean (for sessions that don't need module-specific context) and complete (for sessions that do). Hierarchical files let each directory carry its own context — module invariants, known pitfalls, integration contracts — without polluting other sessions. An agent reading a payments file gets payments-specific context. An agent reading a UI file does not. Directly adapted from the `/init-deep` command and `directory-agents-injector` hook in oh-my-opencode.

---

### [ADDED] Skill-Embedded MCPs

**v2.0:** MCPs were declared globally in `opencode.json`. All MCPs available in all sessions.

**v2.1:** Skills can declare embedded MCP servers in their frontmatter. MCP launches when the skill loads, tears down when the skill is no longer active.

**Motivation:** MCP servers consume context budget — their tools, schemas, and documentation are always present once declared. Skill-embedded MCPs scope this cost to the tasks that need specific tooling. A playwright MCP for browser automation doesn't need to be running during backend work. A database schema MCP doesn't need to be running during UI development. Context window stays clean.

---

### [MODIFIED] Planner — CONTEXT.md now produced by planning pipeline, not pre-planning

**v2.0:** CONTEXT.md was created before the planner ran, capturing developer preferences.

**v2.1:** CONTEXT.md is now produced *during* the Planner's interview phase. The Planner writes user decisions to CONTEXT.md as the interview progresses, and the resulting CONTEXT.md is referenced in the plan.

**Motivation:** In v2.0, CONTEXT.md was a separate step the developer had to complete before planning. In v2.1, it emerges naturally from the interview that the Planner conducts. The Planner owns both the interview and the CONTEXT.md — they are one integrated process, not two separate steps.

---

### [MODIFIED] Research subagents — formalized as `explore` and `librarian`

**v2.0:** Research subagents were used informally without standardized roles.

**v2.1:** `explore` (fast codebase grep, contextual search) and `librarian` (official docs, OSS implementations) are formalized as named roles with explicit permission scopes. Both are spawned by Metis during pre-planning and available to the planner during interview.

**Motivation:** Standardizing research agent roles enables the planning pipeline to spawn them predictably and reference them by name in prompts. The roles are directly adapted from oh-my-opencode's Explore and Librarian agents.
