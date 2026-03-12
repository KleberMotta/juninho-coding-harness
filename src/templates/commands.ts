import { writeFileSync } from "fs"
import path from "path"

export function writeCommands(projectDir: string): void {
  const commandsDir = path.join(projectDir, ".opencode", "commands")

  writeFileSync(path.join(commandsDir, "j.plan.md"), PLAN)
  writeFileSync(path.join(commandsDir, "j.spec.md"), SPEC)
  writeFileSync(path.join(commandsDir, "j.implement.md"), IMPLEMENT)
  writeFileSync(path.join(commandsDir, "j.sync-docs.md"), SYNC_DOCS)
  writeFileSync(path.join(commandsDir, "j.init-deep.md"), INIT_DEEP)
  writeFileSync(path.join(commandsDir, "j.start-work.md"), START_WORK)
  writeFileSync(path.join(commandsDir, "j.handoff.md"), HANDOFF)
  writeFileSync(path.join(commandsDir, "j.ulw-loop.md"), ULW_LOOP)
  writeFileSync(path.join(commandsDir, "j.check.md"), CHECK)
  writeFileSync(path.join(commandsDir, "j.lint.md"), LINT)
  writeFileSync(path.join(commandsDir, "j.test.md"), TEST)
  writeFileSync(path.join(commandsDir, "j.pr-review.md"), PR_REVIEW)
  writeFileSync(path.join(commandsDir, "j.status.md"), STATUS)
  writeFileSync(path.join(commandsDir, "j.unify.md"), UNIFY_CMD)
}

// ─── /plan ────────────────────────────────────────────────────────────────────

const PLAN = `# /plan — Strategic Planning

Invoke the \`@j.planner\` agent to create an actionable plan from a goal.

## Usage

\`\`\`
/j.plan <goal or task description>
\`\`\`

## Examples

\`\`\`
/j.plan add user authentication with email and Google OAuth
/j.plan fix the N+1 query bug in the appointments list
/j.plan refactor the service layer to use the repository pattern
\`\`\`

## What happens

1. \`@j.planner\` classifies your intent
2. Explores the codebase for context
3. Interviews you (proportional to complexity)
4. Writes \`plan.md\` and \`CONTEXT.md\`
5. Spawns \`@j.plan-reviewer\` for automated quality check
6. **Presents the plan to you for explicit approval**
7. Marks plan as ready for \`/j.implement\` (only after your approval)

## Delegation Rule (MANDATORY)

You MUST delegate this task to \`@j.planner\` using the \`task()\` tool.
Do NOT perform the planning yourself — you are the orchestrator, not the executor.

When ANY sub-agent returns output:
- NEVER dismiss it as "incomplete" or "the agent didn't do what was asked"
- NEVER say "I'll continue myself" and take over the sub-agent's job
- Sub-agent unknowns/ambiguities are VALUABLE DATA — forward them to the user via \`question\` tool
- If the sub-agent's report has gaps, pass those gaps to the user as questions — do NOT fill them yourself

## After planning

Run \`/j.implement\` to execute the plan, or \`/j.spec\` first for complex features.
`

// ─── /spec ────────────────────────────────────────────────────────────────────

const SPEC = `# /spec — Feature Specification

Invoke the \`@j.spec-writer\` agent to create a detailed spec before implementation.

## Usage

\`\`\`
/j.spec <feature name or description>
\`\`\`

## Examples

\`\`\`
/j.spec user profile with avatar upload
/j.spec appointment booking flow
/j.spec payment integration with Stripe
\`\`\`

## What happens

1. \`@j.spec-writer\` spawns \`@j.explore\` for codebase pre-research
2. Uses explore findings to inform a 5-phase interview:
   - Discovery: problem and users
   - Requirements: functional and non-functional
   - Contract: API and interface definitions
   - Data: schema and migration strategy
   - Review: **presents spec for your explicit approval**
3. Writes spec to \`docs/specs/{feature-name}.md\` (only after your approval)

The session does NOT need to call \`@j.explore\` separately — \`@j.spec-writer\` handles its own research internally.

## Delegation Rule (MANDATORY)

You MUST delegate this task to \`@j.spec-writer\` using the \`task()\` tool.
Do NOT perform the spec writing yourself — you are the orchestrator, not the executor.

When ANY sub-agent returns output:
- NEVER dismiss it as "incomplete" or "the agent didn't do what was asked"
- NEVER say "I'll continue myself" and take over the sub-agent's job
- Sub-agent unknowns/ambiguities are VALUABLE DATA — forward them to the user via \`question\` tool
- If the sub-agent's report has gaps, pass those gaps to the user as questions — do NOT fill them yourself

## After spec

Run \`/j.plan\` to create an execution plan, then \`/j.implement\` to build.
`

// ─── /implement ───────────────────────────────────────────────────────────────

const IMPLEMENT = `# /implement — Execute Plan or Spec

Invoke the \`@j.implementer\` agent to build what was planned or specified.

## Usage

\`\`\`
/j.implement
/j.implement <specific task or file>
\`\`\`

## Examples

\`\`\`
/j.implement
/j.implement the authentication middleware
/j.implement docs/specs/user-profile.md
\`\`\`

## What happens

1. \`@j.implementer\` reads the active \`plan.md\` (auto-loaded by plan-autoload plugin)
2. Reads \`.opencode/state/workflow-config.md\` to understand handoff and UNIFY behavior
3. Or reads the specified spec file
4. Executes in waves:
   - Wave 1: Foundation (schema, types, migrations)
   - Wave 2: Core logic (services, API routes)
   - Wave 3: Integration (wire-up, tests)
5. Uses the fast pre-commit path while implementing:
   - \`.opencode/scripts/lint-structure.sh\`
   - \`.opencode/scripts/test-related.sh\`
6. Spawns \`@j.validator\` for spec compliance
7. Exits when code changes and task-level tests are complete
8. The caller then runs \`.opencode/scripts/check-all.sh\` or \`/j.check\`
9. If the repo-wide check fails, delegate back to \`@j.implementer\` with the failing output

## Delegation Rule (MANDATORY)

You MUST delegate this task to \`@j.implementer\` using the \`task()\` tool.
Do NOT implement code yourself — you are the orchestrator, not the executor.

When ANY sub-agent returns output:
- NEVER dismiss it as "incomplete" or "the agent didn't do what was asked"
- NEVER say "I'll continue myself" and take over the sub-agent's job
- Sub-agent unknowns/ambiguities are VALUABLE DATA — forward them to the user via \`question\` tool
- If the sub-agent's report has gaps, pass those gaps to the user as questions — do NOT fill them yourself

## After implementation

Run \`/j.check\` for repo-wide verification.
If \`/j.check\` fails, invoke \`/j.implement\` again with the failing output.
Run \`/j.unify\` only after the full check passes and \`workflow-config.md\` enables UNIFY.
`

// ─── /sync-docs ───────────────────────────────────────────────────────────────

const SYNC_DOCS = `# /sync-docs — Refresh AGENTS and Documentation

Generate or update \`AGENTS.md\`, domain docs, and principle docs using the current code as source of truth.

## Usage

\`\`\`
/j.sync-docs
/j.sync-docs <path or domain>
\`\`\`

## What happens

1. Read \`.opencode/state/workflow-config.md\`
2. Identify key files for the requested scope
3. Update the right doc surface for each kind of knowledge:
   - \`AGENTS.md\` for directory-local working rules and commands
   - \`docs/domain/*\` for business behavior and invariants
   - \`docs/principles/*\` for cross-cutting technical patterns
4. Add or refresh sync markers such as:
   - \`<!-- juninho:sync source=src/payments/service.ts hash=abc123 -->\`
5. Update \`docs/domain/INDEX.md\` and \`docs/principles/manifest\` when new docs are added or renamed

## Rules

- Prefer small, high-signal \`AGENTS.md\` files close to the code they describe
- Keep business behavior out of \`AGENTS.md\`; put it in \`docs/domain/*\`
- Keep technical principles reusable; do not bury them in a module-specific doc
- Use key-file sync markers so doc drift is visible during later updates

## Delegation Rule (MANDATORY)

You MUST delegate this task to \`@j.implementer\` using the \`task()\` tool.
Do NOT rewrite the docs yourself when the harness workflow asks for agent execution.

## When to use

- After finishing a feature before human review
- After major refactors that changed local rules or business behavior
- When CARL recall quality degrades because docs or manifests are stale
`

// ─── /init-deep ───────────────────────────────────────────────────────────────

const INIT_DEEP = `# /init-deep — Deep Codebase Initialization

Perform a deep scan of the codebase and generate hierarchical AGENTS.md files, domain documentation, and local quality-gate scripts.

## Usage

\`\`\`
/j.init-deep
\`\`\`

## What happens

### 1. Generate hierarchical AGENTS.md files

Scans the directory tree and generates \`AGENTS.md\` files at each significant level:

- **Root \`AGENTS.md\`** (already exists): stack summary, build/test commands, critical rules — keep under 200 lines
- **\`src/AGENTS.md\`**: source-tree architecture, directory layout, barrel export conventions, import rules
- **\`src/{module}/AGENTS.md\`**: module-specific rules, business invariants, known pitfalls, integration contracts

Each file contains only context relevant to its directory — no duplication.
The \`directory-agents-injector\` plugin automatically injects the relevant levels when an agent reads any file.

### 2. Populate domain documentation

Writes to \`docs/domain/INDEX.md\`:
- Domain entity catalog with CARL Keywords and Files entries
- API route inventory
- Service layer patterns

### 3. Update principles manifest

Adds entries to \`docs/principles/manifest\` (KEY=VALUE format):
- Canonical code patterns discovered
- Architectural directives
- Technology decisions

### 4. Refresh local automation stubs

- Validate \`.opencode/scripts/lint-structure.sh\`
- Validate \`.opencode/scripts/test-related.sh\`
- Validate \`.opencode/scripts/check-all.sh\`
- Align commands in \`AGENTS.md\` with the actual repository scripts

## When to use

- First time setting up the framework on an existing project
- After major refactors that change module structure
- When onboarding agents to a new area of the codebase
- After \`/j.init-deep\` generates files, review and augment them with non-obvious domain knowledge

## Result

\`\`\`
project/
├── AGENTS.md               # Updated with stack summary
├── src/
│   ├── AGENTS.md           # Generated: src-level architecture context
│   └── payments/
│       └── AGENTS.md       # Generated: payments-specific context
└── docs/domain/INDEX.md    # Populated with CARL entries
\`\`\`

The CARL plugin uses \`INDEX.md\` to inject domain context automatically.
The \`directory-agents-injector\` plugin injects the right \`AGENTS.md\` layers per file read.
`

// ─── /start-work ─────────────────────────────────────────────────────────────

const START_WORK = `# /start-work — Begin a Work Session

Initialize context for a focused work session on a specific task.

## Usage

\`\`\`
/j.start-work <task description or issue number>
\`\`\`

## Examples

\`\`\`
/j.start-work issue #42 — fix login redirect loop
/j.start-work implement the dashboard analytics widget
/j.start-work #123
\`\`\`

## What happens

1. Loads \`docs/domain/INDEX.md\` for domain context
2. Checks \`execution-state.md\` for any in-progress work
3. If a \`plan.md\` exists: loads it and presents next steps
4. If no plan: asks whether to \`/j.plan\` first or jump straight to \`/j.implement\`
5. Sets up \`execution-state.md\` with the current task

## After starting work

The session is now focused. Use \`/j.implement\` to build, \`@j.validator\` to check, \`/j.handoff\` when done.
`

// ─── /handoff ─────────────────────────────────────────────────────────────────

const HANDOFF = `# /handoff — End-of-Session Handoff

Prepare a handoff document for the next session or team member.

## Usage

\`\`\`
/j.handoff
\`\`\`

## What happens

1. Reads current \`execution-state.md\`
2. Summarizes:
   - What was completed this session
   - What is in progress (with file names and last known state)
   - What is blocked and why
   - Exact next step to continue

3. Updates \`execution-state.md\` with handoff notes

4. Optionally commits the state files:
   \`git add .opencode/state/ && git commit -m "chore: session handoff"\`

## Output format

\`\`\`markdown
# Session Handoff — {date}

## Completed
- [x] Task description

## In Progress
- [ ] Task description
  - Last state: {what was done}
  - Next step: {exactly what to do next}
  - Files: {relevant files}

## Blocked
- [ ] Task description
  - Blocker: {what's blocking}
  - Resolution needed: {what needs to happen}

## Next Session: Start with
{single, clear action to take first}
\`\`\`
`

// ─── /ulw-loop ────────────────────────────────────────────────────────────────

const ULW_LOOP = `# /ulw-loop — Ultra Work Loop

Activate maximum parallelism mode — work until all tasks in execution-state.md are complete.

## Usage

\`\`\`
/j.ulw-loop
/j.ulw-loop <task or goal>
\`\`\`

## What happens

1. Reads \`execution-state.md\` for task list
2. Identifies tasks that can run in parallel (no dependencies)
3. Spins up multiple \`@j.implementer\` agents in parallel via worktrees:
   - Each worktree works on independent files
   - No merge conflicts by design
4. \`@j.validator\` runs after each wave
5. Loop continues until all tasks are marked complete
6. Run \`/j.check\` once task-level work is done
7. \`@j.unify\` runs only if closeout is enabled in \`workflow-config.md\`

## When to use

- Many independent tasks in the backlog
- Large feature that can be parallelized
- When you want maximum throughput

## Parallel execution model

\`\`\`
Wave 1 (parallel):
  worktree-a: implement service layer
  worktree-b: implement API routes
  worktree-c: implement UI components

Wave 2 (sequential):
  main: wire everything together

Wave 3 (parallel):
  test: unit tests
  test: integration tests
\`\`\`

## Safety

- Each worktree is isolated — no cross-contamination
- Merge happens only after all waves pass validation and the repo-wide check passes
- If any wave fails, the loop pauses and reports blockers
`

// ─── /check ───────────────────────────────────────────────────────────────────

const CHECK = `# /check — Run All Quality Gates

Run the full repository verification after \`@j.implementer\` exits.

## Usage

\`\`\`
/j.check
\`\`\`

## What runs

\`.opencode/scripts/check-all.sh\`

This script is expected to run the repository-wide checks for the current stack.
Typical examples:
- \`npm run typecheck && npm run lint && npm test\`
- \`./gradlew test\`
- \`./mvnw test\`

## When to use

- After \`/j.implement\` returns control to the caller
- Before \`/j.unify\`
- After a refactor that touched many files or workflows

## Notes

This is intentionally broader than the pre-commit hook.
The pre-commit hook stays fast and only runs structure lint plus tests related to staged files.
`

// ─── /lint ────────────────────────────────────────────────────────────────────

const LINT = `# /lint — Run Linter

Run the structure lint used by the pre-commit path.

## Usage

\`\`\`
/j.lint
\`\`\`

## What runs

\`.opencode/scripts/lint-structure.sh\`

## When to use

- During active implementation, to catch structural issues quickly
- When the pre-commit hook fails on lint and you want the same check on demand
- After editing docs, scripts, or config files that need non-test validation
`

// ─── /test ────────────────────────────────────────────────────────────────────

const TEST = `# /test — Run Test Suite

Run fast, change-scoped tests during implementation.

## Usage

\`\`\`
/j.test
/j.test <pattern>
\`\`\`

## Examples

\`\`\`
/j.test
/j.test src/payments
/j.test --watch
\`\`\`

## What runs

\`.opencode/scripts/test-related.sh\`

If the repository defines \`test:related\`, that script is preferred.
Otherwise the default fallback tries tools such as \`jest --findRelatedTests\` or \`vitest related\`.

## When to use

- During implementation, before leaving \`@j.implementer\`
- When the pre-commit hook fails on related tests and you want to rerun the same scope
- Use \`/j.check\` for the full repository suite after implementation
`

// ─── /pr-review ───────────────────────────────────────────────────────────────

const PR_REVIEW = `# /pr-review — Advisory PR Review

Launch the \`@j.reviewer\` agent to perform an advisory code review on the current branch diff.

## Usage

\`\`\`
/j.pr-review
\`\`\`

## What happens

1. \`@j.reviewer\` reads all files changed in the current branch (vs main)
2. Reviews for: logic correctness, clarity, security, performance, maintainability
3. Returns a structured report: Critical / Important / Minor / Positive Notes
4. Report is **advisory only** — does not block any merge or pipeline step

## When to use

- After \`/j.unify\` creates the PR, before human review
- When you want a second opinion on the implementation quality
- For pre-merge quality assurance

## Distinction from @j.validator

| \`@j.reviewer\` | \`@j.validator\` |
|---|---|
| Post-PR, advisory | During implementation loop |
| "Is this good code?" | "Does this satisfy the spec?" |
| Never blocks | Gates the pipeline |
| Read-only | Can fix issues directly |

## Quality target

Aim for PR artifacts with the same quality bar as a strong human-authored engineering PR:
- state the purpose and problem clearly
- summarize the solution in reviewer-friendly steps
- map changed files to responsibilities
- provide runnable validation steps with expected outcomes
`

// ─── /status ──────────────────────────────────────────────────────────────────

const STATUS = `# /status — Show Current Work Status

Display the current \`execution-state.md\` summary — tasks, progress, and blockers.

## Usage

\`\`\`
/j.status
\`\`\`

## What shows

- Current goal and active plan path
- Task table: ID / description / agent / status
- In-progress items with last known state
- Blocked items with blocker descriptions
- Session log (recent actions)

## When to use

- At the start of a session to orient yourself
- After resuming work to see what's left
- To check if all tasks are complete before running \`/j.unify\`

## Source

Reads \`.opencode/state/execution-state.md\` directly.
No agent needed — this is a direct state file read.
`

// ─── /unify ───────────────────────────────────────────────────────────────────

const UNIFY_CMD = `# /unify — Close the Loop

Invoke the \`@j.unify\` agent to reconcile plan vs delivery and execute only the enabled closeout steps.

## Usage

\`\`\`
/j.unify
\`\`\`

## What happens

1. Read \`.opencode/state/workflow-config.md\`
2. Reconcile \`plan.md\` vs actual git diff — mark tasks DONE/PARTIAL/SKIPPED
3. Run only the enabled closeout steps, such as:
   - update \`persistent-context.md\`
   - refresh \`docs/domain/\` or \`docs/domain/INDEX.md\`
   - merge worktrees
   - create a PR
4. If PR creation is enabled, draft a rich PR body with purpose, problem, solution, changed files, and validation steps

## When to use

After \`@j.implementer\` exits, \`/j.check\` passes, and \`@j.validator\` has approved the required work.

## Prerequisites

- All tasks in \`execution-state.md\` should be marked complete
- All validator passes should return APPROVED or APPROVED_WITH_NOTES
- \`gh\` CLI must be authenticated (\`gh auth login\`)

## Note

UNIFY behavior is controlled by \`.opencode/state/workflow-config.md\`.
If PR creation or doc updates are disabled there, \`@j.unify\` should skip those steps and report what was intentionally not executed.
`
