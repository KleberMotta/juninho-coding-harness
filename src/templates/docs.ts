import { writeFileSync, readFileSync, existsSync } from "fs"
import path from "path"
import { DEFAULT_MODELS } from "../models.js"

export interface OpencodeModels {
  strong: string
  medium: string
  weak: string
}

export function writeDocs(projectDir: string): void {
  writeFileSync(path.join(projectDir, "AGENTS.md"), AGENTS_MD)
  writeFileSync(path.join(projectDir, "docs", "domain", "INDEX.md"), DOMAIN_INDEX)
  writeFileSync(path.join(projectDir, "docs", "principles", "manifest"), MANIFEST)
  writeFileSync(path.join(projectDir, "docs", "principles", "auth-patterns.md"), AUTH_PATTERNS)
  writeFileSync(path.join(projectDir, "docs", "principles", "error-handling.md"), ERROR_HANDLING)
  writeFileSync(path.join(projectDir, "docs", "principles", "api-patterns.md"), API_PATTERNS)
  writeFileSync(path.join(projectDir, "docs", "principles", "data-patterns.md"), DATA_PATTERNS)
  writeFileSync(path.join(projectDir, "docs", "principles", "test-patterns.md"), TEST_PATTERNS)
}

export function patchOpencodeJson(projectDir: string, models?: OpencodeModels): void {
  const m = models ?? { ...DEFAULT_MODELS }
  const jsonPath = path.join(projectDir, "opencode.json")

  let existing: Record<string, unknown> = {}
  if (existsSync(jsonPath)) {
    try {
      existing = JSON.parse(readFileSync(jsonPath, "utf-8"))
    } catch {
      // Malformed JSON — start fresh but warn
      console.warn("[juninho] Warning: existing opencode.json could not be parsed — overwriting.")
    }
  }

  const frameworkConfig = {
    mcp: {
      // Context7 is global — available to all agents for live library documentation.
      // Low context cost, high utility across implementer, planner, and validator.
      context7: {
        type: "local",
        command: ["npx", "-y", "@upstash/context7-mcp@latest"],
      },
    },
    agent: {
      // Permission model from framework Section 27.
      // Platform-level enforcement — more reliable than prompt-level instructions.
      "j.planner": {
        model: m.strong,
        permission: {
          write: "allow",   // restricted to docs/specs/ in prompt
          bash: "allow",    // restricted to git log, git diff, ls in prompt
          task: "allow",    // spawns explore, librarian, plan-reviewer
          edit: "deny",
          question: "allow",
        },
      },
      "j.plan-reviewer": {
        model: m.medium,
        permission: {
          task: "deny",
          bash: "deny",
          write: "deny",
          edit: "deny",
          question: "deny",
        },
      },
      "j.spec-writer": {
        model: m.strong,
        permission: {
          bash: "deny",
          write: "allow",  // restricted to docs/specs/ in prompt
          edit: "deny",
          task: "allow",   // Phase 0: spawns explore for pre-research
          question: "allow",
        },
      },
      "j.implementer": {
        model: m.medium,
        permission: {
          bash: "allow",
          write: "allow",
          edit: "allow",
          task: "allow",   // spawns validator subagent
          question: "deny",
        },
      },
      "j.validator": {
        model: m.medium,
        permission: {
          bash: "allow",   // restricted to typecheck, test, lint in prompt
          write: "allow",  // for FIX-tier direct fixes
          edit: "allow",
          task: "deny",
          question: "deny",
        },
      },
      "j.reviewer": {
        model: m.medium,
        permission: {
          bash: "deny",
          write: "deny",
          edit: "deny",
          task: "deny",
          question: "deny",
        },
      },
      "j.unify": {
        model: m.medium,
        permission: {
          bash: "allow",
          write: "allow",
          edit: "allow",
          task: "allow",
          question: "deny",
        },
      },
      "j.explore": {
        model: m.weak,
        permission: {
          bash: "deny",
          write: "deny",
          edit: "deny",
          task: "deny",
          question: "deny",
        },
      },
      "j.librarian": {
        model: m.weak,
        permission: {
          bash: "deny",
          write: "deny",
          edit: "deny",
          task: "deny",
          question: "deny",
        },
      },
    },
  }

  // Deep merge: framework config fills in missing keys, never overwrites existing user config
  const merged = deepMerge(frameworkConfig, existing)

  writeFileSync(jsonPath, JSON.stringify(merged, null, 2) + "\n")
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }

  for (const key of Object.keys(override)) {
    const baseVal = base[key]
    const overrideVal = override[key]

    if (
      overrideVal !== null &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>
      )
    } else {
      // Override value takes precedence (user config wins)
      result[key] = overrideVal
    }
  }

  return result
}

// ─── AGENTS.md ────────────────────────────────────────────────────────────────

const AGENTS_MD = `# AGENTS.md

This project uses the **Agentic Coding Framework** v2.1 — installed by [juninho](https://github.com/KleberMotta/juninho).

## Workflows

**Path A — Spec-driven (formal features):**
\`\`\`
/j.spec → docs/specs/{slug}/spec.md (approved)
  → /j.plan → docs/specs/{slug}/plan.md (approved)
  → /j.implement → @j.validator gates task work
  → /j.check → /j.unify (if enabled by workflow-config)
\`\`\`

**Path B — Plan-driven (lightweight tasks):**
\`\`\`
/j.plan → plan.md (approved) → plan-autoload injects on next session
  → /j.implement → @j.validator gates task work
  → /j.check → /j.unify (if enabled by workflow-config)
\`\`\`

## Commands

| Command | Purpose |
|---------|---------|
| \`/j.spec <feature>\` | 5-phase interview → \`docs/specs/{slug}/spec.md\` |
| \`/j.plan <goal>\` | 3-phase pipeline (Metis→Prometheus→Momus) → \`plan.md\` approved |
| \`/j.implement\` | Execute active plan until code + task-level tests are green |
| \`/j.check\` | Run repo-wide verification after implementation exits |
| \`/j.lint\` | Run structure lint used by the pre-commit path |
| \`/j.test\` | Run change-scoped tests used by the pre-commit path |
| \`/j.sync-docs\` | Refresh AGENTS, domain docs, and principle docs from code |
| \`/j.pr-review\` | Advisory review of current branch diff |
| \`/j.status\` | Show \`execution-state.md\` summary |
| \`/j.unify\` | Reconcile, update docs, merge worktrees, create PR |
| \`/j.start-work <task>\` | Initialize a focused work session |
| \`/j.handoff\` | Prepare end-of-session handoff doc |
| \`/j.init-deep\` | Generate hierarchical AGENTS.md + populate domain docs |
| \`/j.ulw-loop\` | Maximum parallelism mode |

## Agent Roster

### @j.planner
Three-phase pipeline orchestrated internally:
- **Phase 1 (Metis)**: Spawns \`@j.explore\` + \`@j.librarian\` in parallel, classifies intent
- **Phase 2 (Prometheus)**: Interviews developer (proportional to complexity), writes \`CONTEXT.md\` + \`plan.md\`
- **Phase 3 (Momus)**: Loops with \`@j.plan-reviewer\` until OKAY

### @j.plan-reviewer
Internal to planner. Executability gate — approval bias, max 3 issues.

### @j.spec-writer
5-phase interview: Discovery → Requirements → Contract → Data → Review.
Writes to \`docs/specs/{feature-slug}/spec.md\`.

### @j.implementer
READ→ACT→COMMIT→VALIDATE loop. Wave-based with git worktrees for parallel tasks.
Pre-commit stays fast: structure lint + related tests. Hashline-aware editing.
Repo-wide checks happen after implementer exits.

### @j.validator
Reads spec BEFORE code. BLOCK / FIX / NOTE / APPROVED.
Can fix FIX-tier issues directly. Writes audit trail to \`validator-work.md\`.

### @j.reviewer
Post-PR advisory review. Read-only, never blocks. Use via \`/j.pr-review\`.

### @j.unify
Closes the loop according to \`.opencode/state/workflow-config.md\`.
Can update docs, merge worktrees, and create PRs when those steps are enabled.

### @j.explore
Fast read-only codebase research. Spawned by planner Phase 1.
Maps files, patterns, and constraints before the developer interview.

### @j.librarian
External docs and OSS research. Spawned by planner Phase 1.
Fetches official API docs via Context7 MCP.

## Context Tiers

| Tier | Mechanism | When |
|------|-----------|------|
| 1 | Hierarchical \`AGENTS.md\` + \`j.directory-agents-injector\` | Always — per directory when files are read |
| 2 | \`j.carl-inject\` — content-aware principles + domain docs | Read time + compaction survival |
| 3 | \`j.skill-inject\` — file pattern → SKILL.md | Read/Write around matching files |
| 4 | \`<skills>\` declaration in \`plan.md\` task | Explicit per-task requirement |
| 5 | State files in \`.opencode/state/\` | Runtime, inter-session |

## Plugins (auto-discovered by OpenCode)

| Plugin | Hook | Purpose |
|--------|------|---------|
| \`j.directory-agents-injector\` | Read | Inject directory-scoped AGENTS.md files (Tier 1) |
| \`j.env-protection\` | Any tool | Block sensitive file reads/writes |
| \`j.auto-format\` | Write/Edit | Auto-format after file changes |
| \`j.plan-autoload\` | Read + compaction | Inject active plan into context |
| \`j.carl-inject\` | Read + compaction | Inject principles + domain docs from file/task context |
| \`j.skill-inject\` | Read/Write | Inject skill by file pattern |
| \`j.intent-gate\` | Write/Edit | Warn when edits drift outside the plan |
| \`j.todo-enforcer\` | Write/Edit + compaction | Re-inject incomplete tasks |
| \`j.comment-checker\` | Write/Edit | Flag obvious/redundant comments |
| \`j.hashline-read\` | Read | Tag lines with content hashes |
| \`j.hashline-edit\` | Edit | Validate hash references before editing |
| \`j.memory\` | First tool call + compaction | Inject persistent project memory |

## Custom Tools

| Tool | Purpose |
|------|---------|
| \`find_pattern\` | Curated canonical examples for a given pattern type |
| \`next_version\` | Next migration/schema version filename |
| \`lsp_diagnostics\` | Workspace errors and warnings |
| \`lsp_goto_definition\` | Jump to symbol definition |
| \`lsp_find_references\` | All usages of a symbol across the codebase |
| \`lsp_prepare_rename\` | Validate rename safety |
| \`lsp_rename\` | Rename symbol atomically across workspace |
| \`lsp_symbols\` | File outline or workspace symbol search |
| \`ast_grep_search\` | Structural code pattern search |
| \`ast_grep_replace\` | Structural pattern replacement (with dryRun) |

## Skills (injected automatically by file pattern)

| Skill | Activates on | Notes |
|-------|-------------|-------|
| \`j.test-writing\` | \`*.test.ts\`, \`*.spec.ts\` | Optional: uncomment Playwright MCP in frontmatter for E2E |
| \`j.page-creation\` | \`app/**/page.tsx\` | Stack-specific; use only on Next.js App Router repos |
| \`j.api-route-creation\` | \`app/api/**/*.ts\` | |
| \`j.server-action-creation\` | \`**/actions.ts\` | Stack-specific; use only on Next.js Server Actions repos |
| \`j.schema-migration\` | \`schema.prisma\` | |
| \`j.agents-md-writing\` | \`**/AGENTS.md\` | Directory-local agent guidance |
| \`j.domain-doc-writing\` | \`docs/domain/**/*.md\` | Business behavior and sync markers |
| \`j.principle-doc-writing\` | \`docs/principles/**\` | Cross-cutting technical rules |
| \`j.shell-script-writing\` | \`.opencode/scripts/**/*.sh\`, \`scripts/**/*.sh\`, hooks | Fast, safe automation scripts |

## State Files

| File | Purpose |
|------|---------|
| \`.opencode/state/persistent-context.md\` | Long-term project knowledge — updated by UNIFY |
| \`.opencode/state/execution-state.md\` | Per-feature task table — updated by implementer and UNIFY |
| \`.opencode/state/validator-work.md\` | Validator audit trail — BLOCK/FIX/NOTE per pass |
| \`.opencode/state/implementer-work.md\` | Implementer decisions and blockers log |
| \`.opencode/state/workflow-config.md\` | Controls handoff, doc sync, and configurable UNIFY behavior |
| \`.opencode/state/.plan-ready\` | Transient IPC flag — plan path, consumed by plan-autoload |

## Conventions

- Specs: \`docs/specs/{feature-slug}/spec.md\` + \`CONTEXT.md\` + \`plan.md\`
- Domain docs: \`docs/domain/{domain}/*.md\` — indexed in \`docs/domain/INDEX.md\`
- Principles: \`docs/principles/{topic}.md\` — registered in \`docs/principles/manifest\`
- Sync markers: \`<!-- juninho:sync source=... hash=... -->\` to track doc↔code alignment
- Worktrees: \`worktrees/{feature}-{task}/\` — created by implementer, removed by UNIFY
- Hierarchical \`AGENTS.md\`: root + \`src/\` + \`src/{module}/\` — generated by \`/j.init-deep\`
`

// ─── Domain INDEX.md ──────────────────────────────────────────────────────────

const DOMAIN_INDEX = `# Domain Index

Global index of business domain documentation.

Serves two purposes:
1. **CARL lookup table** — \`j.carl-inject.ts\` reads \`Keywords:\` lines to match prompt words and inject the listed \`Files:\`
2. **Planner orientation** — \`@j.planner\` reads this before interviewing to know what domain knowledge exists

Run \`/j.init-deep\` to auto-populate from the codebase.
Update manually as you document business domains.

---

## Format

Each entry:
\`\`\`
## {domain}
Keywords: keyword1, keyword2, keyword3
Files:
  - {domain}/rules.md — Core business rules
  - {domain}/limits.md — Limits, thresholds, quotas
  - {domain}/edge-cases.md — Known edge cases and expected behavior
\`\`\`

---

## (no domains yet)

Run \`/j.init-deep\` to scan the codebase and generate initial domain entries.

Add entries manually as you document business rules:

\`\`\`
## payments
Keywords: payment, stripe, checkout, invoice, subscription, billing, charge
Files:
  - payments/rules.md — Core payment processing rules
  - payments/edge-cases.md — Failed payments, retries, refunds
\`\`\`

---

*Planner reads this index before interviewing to know what domain knowledge exists.*
*carl-inject reads \`Keywords:\` lines to match prompt words and inject \`Files:\` entries.*
*UNIFY updates this file after each feature that touches a documented domain.*
`

// ─── Manifest ─────────────────────────────────────────────────────────────────

const MANIFEST = `# Principles Manifest
# CARL lookup table — maps keywords to architectural principle files.
# Read by j.carl-inject.ts plugin on every UserPromptSubmit.
#
# Format:
#   {KEY}_STATE=active|inactive
#   {KEY}_RECALL=comma, separated, keywords
#   {KEY}_FILE=docs/principles/{file}.md
#
# When a prompt word matches any keyword in _RECALL, the corresponding _FILE
# is injected into the agent's context before it processes the prompt.
# Add entries as /j.init-deep discovers patterns, or manually as you codify decisions.

AUTH_STATE=active
AUTH_RECALL=auth, authentication, login, logout, session, token, jwt, oauth, clerk, middleware
AUTH_FILE=docs/principles/auth-patterns.md

ERROR_STATE=active
ERROR_RECALL=error, exception, try, catch, throw, failure, handle, boundary
ERROR_FILE=docs/principles/error-handling.md

API_STATE=active
API_RECALL=api, route, endpoint, handler, request, response, next, http, rest
API_FILE=docs/principles/api-patterns.md

DATA_STATE=active
DATA_RECALL=database, prisma, query, schema, migration, model, repository, orm
DATA_FILE=docs/principles/data-patterns.md

TEST_STATE=active
TEST_RECALL=test, spec, jest, mock, fixture, coverage, unit, integration, e2e
TEST_FILE=docs/principles/test-patterns.md

# ── Add project-specific entries below ──────────────────────────────────────
# Example:
# PAYMENT_STATE=active
# PAYMENT_RECALL=payment, stripe, checkout, invoice, subscription, billing
# PAYMENT_FILE=docs/principles/payment-patterns.md
`

const AUTH_PATTERNS = `# Authentication Patterns

Use the repository's established authentication entrypoints before business logic.

## Rules

- Authenticate early and fail closed
- Keep token parsing and authorization checks close to the request boundary
- Do not mix credential handling with domain logic

## Verify

- Protected routes reject missing or invalid credentials
- Auth context is passed through typed interfaces or request-scoped state
`

const ERROR_HANDLING = `# Error Handling

Keep error handling explicit, typed when possible, and consistent with user-visible behavior.

## Rules

- Validate inputs before side effects
- Return stable error shapes for expected failures
- Log unexpected failures with enough context for debugging
- Do not leak internal implementation details to external callers
`

const API_PATTERNS = `# API Patterns

Keep request handling thin and move business decisions into reusable services.

## Rules

- Parse and validate request input at the boundary
- Normalize success and error responses
- Keep transport concerns out of domain services
- Document authentication and failure modes for each endpoint
`

const DATA_PATTERNS = `# Data Patterns

Prefer safe, explicit data changes with a clear migration and rollback story.

## Rules

- Favor additive changes first when existing data may be present
- Update dependent types, serializers, and fixtures with schema changes
- Index fields based on concrete query needs
- Keep persistence models aligned with the database schema
`

const TEST_PATTERNS = `# Test Patterns

Tests should prove behavior, not mirror implementation details.

## Rules

- Prefer focused tests near the changed code while implementing
- Cover happy path, failure path, and important edge cases
- Mock external boundaries, not the unit under test
- Run broader suites after task-level implementation is complete
`
