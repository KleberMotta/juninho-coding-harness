# juninho

Bootstrap the **Agentic Coding Framework** (framework.md) into any [OpenCode](https://opencode.ai) project in a single command.

## Install

```bash
npm install -g @kleber.mottajr/juninho
```

## Usage

```bash
# Navigate to your project
cd my-opencode-project

# Run setup — one command, everything configured
juninho setup

# Output:
# [juninho] Installing Agentic Coding Framework...
# [juninho] ✓ Framework installed successfully!
# [juninho] Open OpenCode — /j.plan, /j.spec and /j.implement are ready.
```

## What it does

`juninho setup` automatically creates:

- **9 agents** in `.opencode/agents/` (j.planner, j.spec-writer, j.implementer, j.validator, j.reviewer, j.plan-reviewer, j.unify, j.explore, j.librarian)
- **9 skills** in `.opencode/skills/` (j.test-writing, j.page-creation, j.api-route-creation, j.server-action-creation, j.schema-migration, j.agents-md-writing, j.domain-doc-writing, j.principle-doc-writing, j.shell-script-writing)
- **11 plugins** in `.opencode/plugins/` (auto-discovered by OpenCode)
- **4 tools** in `.opencode/tools/` (find-pattern, next-version, lsp, ast-grep)
- **14 slash commands** in `.opencode/commands/` (/j.plan, /j.spec, /j.implement, /j.sync-docs, /j.init-deep, /j.start-work, /j.handoff, /j.ulw-loop, /j.check, /j.lint, /j.test, /j.pr-review, /j.status, /j.unify)
- **State files** for persistent context and execution tracking
- **Docs scaffold** with AGENTS.md, domain index, principles docs, and manifest
- **Support scripts** in `.opencode/scripts/` for pre-commit, related tests, structure lint, and full checks

Then patches `opencode.json` with agent definitions and Context7 MCP.

## Idempotency

Running `juninho setup` twice is safe — it detects `.opencode/.juninho-installed` and skips if already configured. Use `--force` to reinstall.

## Re-install

```bash
juninho setup --force
```

## License

MIT
