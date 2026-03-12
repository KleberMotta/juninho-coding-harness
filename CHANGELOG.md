# Changelog

Todas as mudanças notáveis neste projeto são documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [Unreleased]

### Changed
- Pre-commit do framework agora roda lint estrutural e testes relacionados aos arquivos staged por padrão, deixando checks gerais para a etapa pós-implementação
- `@j.implementer` agora encerra após código + testes de tarefa; o fluxo prevê `/j.check` e reentrada no implementer quando o check amplo falhar
- `@j.unify` agora segue `.opencode/state/workflow-config.md`, permitindo configurar merge, PR e atualização de docs
- O scaffold ganhou skills para `AGENTS.md`, docs de domínio, docs de princípios e scripts shell, reduzindo viés para frontend/Next.js
- Novo comando `/j.sync-docs` e marcadores `juninho:sync` para alinhar documentação com arquivos-chave do código

### Added
- `.opencode/scripts/pre-commit.sh`, `.opencode/scripts/lint-structure.sh`, `.opencode/scripts/test-related.sh` e `.opencode/scripts/check-all.sh`
- `.opencode/state/workflow-config.md` para controlar handoff, checks pós-implementação e comportamento do UNIFY
- Evals em `evals/` para medir a qualidade do harness contra um PR de referência

### Planejado para 1.0.0-beta.1
- [ ] Suporte a `juninho update` para atualizar arquivos gerados mantendo customizações
- [ ] Comando `juninho status` para mostrar o que está instalado e versões
- [ ] Agente `@j.memory-manager` para gerenciar `persistent-context.md` ativamente
- [ ] Template de agente para projetos Python/FastAPI
- [ ] Testes automatizados com Jest

---

## [1.0.0-alpha.2] — 2026-02-22

### Fixed
- Adicionado `repository.url` no `package.json` para validação de provenance
- Workflow de publish: Node 24 para suporte OIDC nativo (npm ≥11.5.1)
- Workflow de publish: removido `registry-url` que conflitava com Trusted Publisher
- Workflow de publish: `--tag alpha/beta/rc` automático para prereleases

## [1.0.0-alpha.1] — 2026-02-22

### Adicionado

**CLI**
- `juninho setup [dir] [--force]` — instala o framework completo em um projeto
- `juninho --help` — exibe uso e opções
- Idempotência via marker `.opencode/.juninho-installed`
- Flag `--force` para reinstalação

**Agentes instalados (9)**
- `@j.planner` — protocolo Metis→Prometheus→Momus para planejamento goal-backward
- `@j.plan-reviewer` — porta de qualidade com viés de aprovação
- `@j.spec-writer` — entrevista de 5 fases (Discovery→Requirements→Contract→Data→Review)
- `@j.implementer` — loop READ→ACT→COMMIT→VALIDATE com execução em waves
- `@j.validator` — validação contra spec com tiers APPROVED/NOTE/FIX/BLOCK
- `@j.reviewer` — revisor advisory read-only
- `@j.unify` — reconciliação, atualização de docs, merge de worktrees, criação de PR
- `@j.explore` — agente de pesquisa do codebase, exploração paralela read-only
- `@j.librarian` — agente de pesquisa externa via Context7 MCP

**Plugins instalados (11)**
- `j.env-protection` — bloqueia acesso a arquivos sensíveis
- `j.auto-format` — formata arquivos após Write/Edit (prettier, black, gofmt, rustfmt)
- `j.plan-autoload` — injeta plano ativo quando sessão fica idle
- `j.carl-inject` — injeta contexto de domínio baseado em keywords do prompt
- `j.skill-inject` — injeta skill instructions por padrão de path de arquivo
- `j.intent-gate` — classifica intent do prompt para melhor roteamento de agente
- `j.todo-enforcer` — re-injeta tasks incompletas quando sessão fica idle
- `j.comment-checker` — detecta e sinaliza comentários óbvios/redundantes
- `j.hashline-read` — adiciona prefixo `NNN#XX:` ao output do Read
- `j.hashline-edit` — valida referências hashline antes de executar edits

**Skills instaladas (5)**
- `j.test-writing` — padrões AAA, cobertura, mocking, naming conventions
- `j.page-creation` — Next.js App Router, Server vs Client Components, loading/error states
- `j.api-route-creation` — route handlers, auth check, validação Zod, error handling
- `j.server-action-creation` — `"use server"`, ActionResult type, revalidação
- `j.schema-migration` — Prisma schema seguro, additive changes, migration naming

**Ferramentas instaladas (4)**
- `find_pattern` — busca padrões canônicos no codebase ou no manifest
- `next_version` — incrementa versão de migrations automaticamente
- `lsp_*` — 6 ferramentas LSP (diagnostics, goto-definition, references, symbols, rename)
- `ast_grep_search` / `ast_grep_replace` — busca e substituição estrutural por AST

**Slash commands (13)**
- `/j.plan` — invoca @j.planner
- `/j.spec` — invoca @j.spec-writer
- `/j.implement` — invoca @j.implementer
- `/j.init-deep` — exploração profunda do codebase para popular docs de domínio
- `/j.start-work` — inicializa contexto de sessão focada
- `/j.handoff` — prepara documentação de handoff fim de sessão
- `/j.ulw-loop` — modo ultra work, máximo paralelismo
- `/j.check` — quality gates completos (tsc + eslint + jest)
- `/j.lint` — apenas o linter
- `/j.test` — apenas a suite de testes
- `/j.pr-review` — invoca @j.reviewer para revisão advisory
- `/j.status` — resumo do execution-state.md
- `/j.unify` — invoca @j.unify para fechar o loop

**Docs scaffold**
- `AGENTS.md` — referência rápida na raiz do projeto
- `docs/domain/INDEX.md` — template de índice de domínio para CARL
- `docs/principles/manifest` — lookup table de keywords para CARL
- `docs/specs/` — diretório para specs geradas por @j.spec-writer
- `worktrees/` — diretório para paralelização com git worktrees

**opencode.json patching**
- Merge inteligente: configuração existente do usuário tem prioridade
- Registra os 9 agentes com modelo, modo e permissões
- Adiciona MCP Context7 (`@upstash/context7-mcp@latest`)

**GitHub infra (no repositório do juninho)**
- CI workflow: build + typecheck + smoke test em Node 18/20/22
- Publish workflow: publicação automática no npm ao criar tag `v*`
- PR template em português
- CODEOWNERS
- CONTRIBUTING.md completo
- Wiki em `docs/wiki/` (Home, Getting Started, Workflow, Agents, Plugins, Commands)

---

[Unreleased]: https://github.com/seu-usuario/juninho/compare/v1.0.0-alpha.1...HEAD
[1.0.0-alpha.1]: https://github.com/seu-usuario/juninho/releases/tag/v1.0.0-alpha.1
