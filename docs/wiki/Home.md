# juninho Wiki

Documentação completa do **Agentic Coding Framework** para OpenCode.

> **Alpha notice:** versão `1.0.0-alpha.x` — API pode mudar entre versões.

---

## Navegação

| Página | Conteúdo |
|--------|----------|
| [Getting Started](./getting-started.md) | Instalação, primeiro uso, teste local |
| [Workflow](./workflow.md) | Casos de uso dia a dia — do bug ao PR |
| [Agentes](./agents.md) | Referência completa dos 9 agentes |
| [Plugins](./plugins.md) | Referência dos 11 plugins e seus hooks |
| [Comandos](./commands.md) | Referência dos 14 slash commands |

---

## O que é o juninho?

`juninho` é um CLI que instala o **Agentic Coding Framework** em projetos OpenCode com um único comando:

```bash
npm install -g juninho
cd meu-projeto
juninho setup
```

Depois disso, o OpenCode no seu projeto terá:
- **9 agentes especializados** com protocolos definidos (j.planner, j.spec-writer, j.implementer, j.validator, j.reviewer, j.plan-reviewer, j.unify, j.explore, j.librarian)
- **12 plugins** que rodam automaticamente como hooks (j.env-protection, j.auto-format, j.carl-inject, j.skill-inject, j.memory, j.hashline-read/edit, j.directory-agents-injector, ...)
- **9 skills** que injetam instruções por tipo de arquivo (tests, pages, API routes, actions, migrations, docs e scripts)
- **4 ferramentas** (lsp, ast-grep, find-pattern, next-version)
- **14 slash commands** (/j.plan, /j.spec, /j.implement, /j.sync-docs, /j.init-deep, /j.start-work, /j.handoff, /j.ulw-loop, /j.check, /j.lint, /j.test, /j.pr-review, /j.status, /j.unify)

---

## Fluxo resumido

```
/j.plan objetivo    →  plan.md aprovado
/j.implement        →  wave 1 → wave 2 → wave 3 → @j.validator
/j.check            →  verificação ampla do repositório
/j.unify            →  closeout configurável + PR
```

Para features complexas:
```
/j.spec feature     →  docs/specs/feature.md
/j.plan             →  plan.md baseado na spec
/j.implement        →  execução com validação automática contra a spec
```

---

## Conceitos-chave

**CARL (Context-Aware Retrieval Layer)**
O plugin `j.carl-inject` analisa o conteúdo dos arquivos lidos, o path e o contexto de task antes de injetar docs relevantes do `docs/principles/manifest` e `docs/domain/INDEX.md`. Rode `/j.init-deep` uma vez para popular esses arquivos e use `/j.sync-docs` para mantê-los alinhados ao código.

**Hashlines**
Sistema de referência estável a linhas de código: `NNN#XX:` onde `XX` é um hash da linha. Permite edits precisos sem ambiguidade, mesmo em arquivos grandes. O plugin `j.hashline-read` adiciona os prefixos; `j.hashline-edit` valida que referências não estão stale.

**Wave-based execution**
O `@implementer` divide trabalho em waves: Foundation (sequencial) → Core (paralela via worktrees) → Integration (sequencial). Permite paralelismo seguro sem conflitos de merge.

**Idempotência**
`juninho setup` pode ser rodado múltiplas vezes com segurança. O marker `.opencode/.juninho-installed` previne re-instalação acidental. Use `--force` para reinstalar.

---

## Links

- [GitHub](https://github.com/seu-usuario/juninho)
- [npm](https://npmjs.com/package/juninho)
- [Issues](https://github.com/seu-usuario/juninho/issues)
- [Contributing](../../CONTRIBUTING.md)
