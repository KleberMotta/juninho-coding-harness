import { writeFileSync } from "fs"
import path from "path"

export function writeCommands(projectDir: string): void {
  const commandsDir = path.join(projectDir, ".opencode", "commands")

  writeFileSync(path.join(commandsDir, "j.plan.md"), PLAN)
  writeFileSync(path.join(commandsDir, "j.spec.md"), SPEC)
  writeFileSync(path.join(commandsDir, "j.implement.md"), IMPLEMENT)
  writeFileSync(path.join(commandsDir, "j.sync-docs.md"), SYNC_DOCS)
  writeFileSync(path.join(commandsDir, "j.start-work.md"), START_WORK)
  writeFileSync(path.join(commandsDir, "j.handoff.md"), HANDOFF)
  writeFileSync(path.join(commandsDir, "j.ulw-loop.md"), ULW_LOOP)
  writeFileSync(path.join(commandsDir, "j.check.md"), CHECK)
  writeFileSync(path.join(commandsDir, "j.lint.md"), LINT)
  writeFileSync(path.join(commandsDir, "j.test.md"), TEST)
  writeFileSync(path.join(commandsDir, "j.pr-review.md"), PR_REVIEW)
  writeFileSync(path.join(commandsDir, "j.status.md"), STATUS)
  writeFileSync(path.join(commandsDir, "j.unify.md"), UNIFY_CMD)
  writeFileSync(path.join(commandsDir, "j.finish-setup.md"), FINISH_SETUP)
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
2. Reads \`.opencode/juninho-config.json\` (\`workflow\` section) to understand handoff and UNIFY behavior
3. Reads feature-local execution context from \`docs/specs/{feature-slug}/state/\`, especially \`implementer-work.md\` plus dependency task state under \`state/tasks/task-{id}/\` when running a specific task
4. Optionally reads \`spec.md\` if it exists (spec is NOT required — plan-only flow is supported)
5. Executes in waves:
    - Wave 1: Foundation (schema, types, migrations)
    - Wave 2: Core logic (services, API routes)
    - Wave 3: Integration (wire-up, tests)
6. Parallel waves are capped at **2 concurrent task subagents** to reduce silent provider/OpenCode stream stalls
7. Each task writes and refreshes its own execution lease in \`docs/specs/{feature-slug}/state/tasks/task-{id}/execution-state.md\`
8. If a spawned task never writes state or its heartbeat goes stale, the watchdog/orchestrator may launch **one retry attempt in the same stalled session** for that task in the same wave
9. Uses the fast pre-commit path while implementing:
    - \`.opencode/scripts/lint-structure.sh\`
    - \`.opencode/scripts/test-related.sh\`
    - focused test execution is routed through \`.opencode/scripts/run-test-scope.sh\`
10. Spawns \`@j.validator\` for compliance (validates against spec if present, otherwise against plan \`<done>\` criteria)
11. **State is written to canonical repo root**, never inside worktrees:
    - Per-task state: \`docs/specs/{feature-slug}/state/tasks/task-{id}/execution-state.md\`
    - Validator results: \`docs/specs/{feature-slug}/state/tasks/task-{id}/validator-work.md\`
    - Implementer log: \`docs/specs/{feature-slug}/state/implementer-work.md\` (append-only)
    - Retry budget/state: \`docs/specs/{feature-slug}/state/tasks/task-{id}/retry-state.json\`
    - Runtime metadata: \`docs/specs/{feature-slug}/state/tasks/task-{id}/runtime.json\` and \`docs/specs/{feature-slug}/state/sessions/{sessionID}-runtime.json\`
12. Canonical feature integration is tracked in \`docs/specs/{feature-slug}/state/integration-state.json\`
13. Each APPROVED task records its exact \`validatedCommit\` and is integrated immediately into \`feature/{feature-slug}\` as a single feature-branch commit for that task
14. A watchdog notification fires when a session appears stalled, but notifications never block the run
15. If cleanup is ever needed for a retry, it applies only to the failed task's worktree — never to unrelated worktrees in the same feature
16. Exits when code changes and task-level tests are complete and already integrated into \`feature/{feature-slug}\`
17. The caller then runs \`.opencode/scripts/check-all.sh\` or \`/j.check\`, which validate the canonical integrated feature branch
18. If the repo-wide check fails, delegate back to \`@j.implementer\` with the failing output

## History Rules

- A task branch must never cherry-pick or merge another task's commit by hand.
- If a task needs earlier task code to exist, that relationship must be expressed via \`depends\` in \`plan.md\`.
- The final feature branch should read like \`one implemented task -> one feature-branch commit\`, with no synthetic \`integrate task\` merge commits.
- Closeout docs that should land in git history must be explicit plan tasks, not post-hoc UNIFY-only commits.

## Delegation Rule (MANDATORY)

You MUST delegate this task to \`@j.implementer\` using the \`task()\` tool.
Do NOT implement code yourself — you are the orchestrator, not the executor.

The first delegated \`@j.implementer\` session is the workflow owner.
It must not immediately delegate the same whole implementation workflow to another generic \`@j.implementer\`.
Only explicit task-worker prompts such as \`Execute task {id} ...\` may create child \`@j.implementer\` sessions.

When ANY sub-agent returns output:
- NEVER dismiss it as "incomplete" or "the agent didn't do what was asked"
- NEVER say "I'll continue myself" and take over the sub-agent's job
- Sub-agent unknowns/ambiguities are VALUABLE DATA — forward them to the user via \`question\` tool
- If the sub-agent's report has gaps, pass those gaps to the user as questions — do NOT fill them yourself

## After implementation

Run \`/j.check\` for repo-wide verification.
If \`/j.check\` fails, invoke \`/j.implement\` again with the failing output.
Run \`/j.unify\` only after the full check passes and \`juninho-config.json\` enables UNIFY.
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

1. Read \`.opencode/juninho-config.json\` to understand documentation-related workflow defaults
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

1. Reads global session summary from \`.opencode/state/execution-state.md\`
2. Reads per-task state from \`docs/specs/{feature-slug}/state/tasks/task-*/execution-state.md\`
3. Reads the feature-local implementer log from \`docs/specs/{feature-slug}/state/implementer-work.md\`
4. Reads \`docs/specs/{feature-slug}/state/integration-state.json\` for validated SHAs and integration/cleanup status
5. Reads session runtime metadata from \`docs/specs/{feature-slug}/state/sessions/\` when session ownership/context is relevant
5. Summarizes:
   - What was completed this session
   - What is in progress (with file names, attempt number, and last heartbeat)
   - What is blocked and why
   - What was retried and why
   - What is already integrated into \`feature/{feature-slug}\` and which feature-branch commit represents each task
   - What still needs integration or cleanup
   - Exact next step to continue

6. Updates local execution state with handoff notes

7. Optionally commits the state files:
    \`git add .opencode/state/ docs/specs/*/state/ && git commit -m "chore: session handoff"\`

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

Activate high-throughput mode — work until all tasks in the plan are complete.

## Usage

\`\`\`
/j.ulw-loop
/j.ulw-loop <task or goal>
\`\`\`

## What happens

1. Reads task list from the active \`plan.md\` (auto-loaded by plan-autoload plugin)
2. Reads \`.opencode/state/execution-state.md\` for the active plan path and session summary
3. Reads feature-local state from \`docs/specs/{feature-slug}/state/\`, especially \`implementer-work.md\` and prior task execution files
4. Identifies tasks that can run in parallel (no dependencies)
5. Spins up \`@j.implementer\` agents in parallel via worktrees with a hard cap of **2 concurrent task subagents** per batch:
   - Each worktree works on independent files
   - No merge conflicts by design
   - **All state is written to canonical repo root** (\`docs/specs/{feature-slug}/state/\`), never inside worktrees
   - Each task reads dependency execution/validator state before coding
6. Each task maintains a heartbeat in \`tasks/task-{id}/execution-state.md\`
   - Retry budget is tracked per task in \`tasks/task-{id}/retry-state.json\`
7. If a task never starts or its heartbeat goes stale, the loop may launch **one retry attempt in the same stalled session** for that task in the same wave
8. A watchdog notification surfaces stalled sessions without blocking the run
9. \`@j.validator\` runs after each wave, writing results to \`docs/specs/{feature-slug}/state/tasks/task-{id}/validator-work.md\`
10. Loop continues until all tasks are marked complete
11. Integrate each APPROVED task commit into the canonical branch \`feature/{feature-slug}\` as one resulting feature-branch commit per task, and keep \`docs/specs/{feature-slug}/state/integration-state.json\` current
12. Run \`/j.check\` once task-level work is done; this must validate the canonical integrated feature branch, not a task worktree
13. \`@j.unify\` runs only if closeout is enabled in \`.opencode/juninho-config.json\` under \`workflow.unify.enabled\` and should only do closeout/cleanup/PR work

## When to use

- Many independent tasks in the backlog
- Large feature that can be parallelized
- When you want the highest safe throughput

## Parallel execution model

\`\`\`
Wave 1 (parallel):
  worktree-a: implement service layer   → state at docs/specs/{slug}/state/task-1-*
  worktree-b: implement API routes      → state at docs/specs/{slug}/state/task-2-*
  batch boundary
  worktree-c: implement UI components   → state at docs/specs/{slug}/state/task-3-*

Wave 2 (sequential):
  main: wire everything together

Wave 3 (parallel):
  test: unit tests
  test: integration tests
\`\`\`

## Safety

- Each worktree is isolated — no cross-contamination
- All state files go to repo root, so the orchestrator always has visibility
- Parallel execution is capped at 2 tasks to reduce silent stream loss
- Each task carries its own lease and heartbeat in feature-local state
- Stale tasks can be retried once without allowing two attempts to commit concurrently
- Any worktree cleanup is targeted to the failed task only, never all worktrees in the feature
- Code integration happens during implementation, task by task, into the canonical feature branch using \`ff-only\` or \`cherry-pick -x\`, not synthetic merge commits
- UNIFY performs cleanup only; it must not be responsible for first-time code integration
- If any wave fails, the loop pauses and reports blockers — read \`docs/specs/{slug}/state/\` for details
`

// ─── /check ───────────────────────────────────────────────────────────────────

const CHECK = `# /check — Run All Quality Gates

Run the full repository verification after \`@j.implementer\` exits, then perform a detailed PR-style review pass.

## Usage

\`\`\`
/j.check
\`\`\`

## What runs

1. \`.opencode/scripts/check-all.sh\`
2. A detailed read-only review via \`@j.reviewer\`

This script is expected to run the repository-wide checks for the current stack.
Typical examples:
- \`npm run typecheck && npm run lint && npm test\`
- \`./gradlew test\`
- \`./mvnw test\`

The review pass must inspect the resulting integrated branch like a real PR review and look for:
- bugs and missed edge cases
- spec or plan intent drift
- business-rule/domain-rule violations
- project pattern or AGENTS violations
- maintainability or safety concerns worth correcting before closeout

If a feature slug is active, persist the report to:
- \`docs/specs/{feature-slug}/state/check-review.md\`

Operational rule:
- delegate the review to \`@j.reviewer\`
- then write the returned markdown review to \`docs/specs/{feature-slug}/state/check-review.md\`
- then summarize whether the repository is blocked by failing checks, review findings, or both

The report should contain Critical / Important / Minor findings plus intent-coverage and domain-risk sections.

If \`check-all.sh\` fails, still produce the review report when enough context exists. The report should mention whether failures came from verification, code review findings, or both.

## When to use

- After \`/j.implement\` returns control to the caller
- Before \`/j.unify\`
- After a refactor that touched many files or workflows

## Notes

This is intentionally broader than the pre-commit hook.
The pre-commit hook stays fast and only runs structure lint plus tests related to staged files.

If the check script fails or the review report contains Critical or Important findings, invoke \`/j.implement\` again with:
- the failing verification output
- the path to \`docs/specs/{feature-slug}/state/check-review.md\`

\`@j.implementer\` must treat that review report as actionable correction input for the next pass.
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
2. Reviews for: bugs, edge cases, intent drift, business-rule risk, clarity, security, performance, maintainability
3. Returns a structured report: Critical / Important / Minor / Positive Notes / Intent Coverage / Domain Rule Risks
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

Display session summary and per-task state — tasks, progress, and blockers.

## Usage

\`\`\`
/j.status
/j.status <feature-slug>
\`\`\`

## What shows

- Current goal and active plan path (from global session state)
- Task table: ID / description / agent / status / attempt
- Integration table details from \`integration-state.json\`: validated commit, resulting feature commit, and integration method/status
- In-progress items with last known state and heartbeat
- Blocked items with blocker descriptions
- Retried or stale items visible from per-task execution state
- Session log (recent actions)

## When to use

- At the start of a session to orient yourself
- After resuming work to see what's left
- To check if all tasks are complete before running \`/j.unify\`

## Source

Reads state from **two locations** (in order):

1. **Global session summary**: \`.opencode/state/execution-state.md\` — high-level session info (goal, plan path, session log)
2. **Per-task state**: \`docs/specs/{feature-slug}/state/tasks/task-{id}/execution-state.md\` — detailed task progress, attempts, heartbeats, blockers, and validated commit
3. **Integration manifest**: \`docs/specs/{feature-slug}/state/integration-state.json\` — canonical feature branch, task validated SHAs, resulting feature SHAs, and integration/cleanup status

If a \`<feature-slug>\` argument is provided, only show per-task state for that feature.
If omitted, infer the slug from the active plan path in the active execution-state file.

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

1. Read \`.opencode/juninho-config.json\` (\`workflow\` section)
2. Reconcile \`plan.md\` vs actual git diff — mark tasks DONE/PARTIAL/SKIPPED
3. Run only the enabled closeout steps, such as:
   - reconcile \`persistent-context.md\`
   - reconcile \`docs/domain/\` or \`docs/domain/INDEX.md\`
   - cleanup integrated task worktrees/branches using \`integration-state.json\`
   - create a PR
4. If PR creation is enabled, draft a rich PR body with purpose, problem, solution, changed files, and validation steps

## When to use

After \`@j.implementer\` exits, \`/j.check\` passes, and \`@j.validator\` has approved the required work.
By this point, code must already be integrated into \`feature/{feature-slug}\`.

## Prerequisites

- All tasks in \`execution-state.md\` should be marked complete
- All validator passes should return APPROVED or APPROVED_WITH_NOTES
- \`gh\` CLI must be authenticated (\`gh auth login\`)

## Note

UNIFY behavior is controlled by \`.opencode/juninho-config.json\` under \`workflow\`.
If PR creation or doc updates are disabled there, \`@j.unify\` should skip those steps and report what was intentionally not executed.
UNIFY is no longer responsible for first-time code integration.
UNIFY should also avoid creating a final synthetic git commit; history should already reflect the planned task commits by the time \`/j.unify\` runs.
`

// ─── /finish-setup ───────────────────────────────────────────────────────────

const FINISH_SETUP = `# /finish-setup — Bootstrap Repository Knowledge

This is the canonical repository bootstrap command after installing the harness.

Scan the entire codebase, generate hierarchical AGENTS.md files, discover recurring file patterns, generate dynamic skills, and populate domain/principles documentation.

## Usage

\`\`\`
/j.finish-setup
\`\`\`

## What happens

### Phase 1 — Structural Scan (via @j.explore)

1. Invoke \`@j.explore\` to scan the entire codebase
2. Identify significant directory boundaries for local instructions:
   - root project context for the main \`AGENTS.md\`
   - source-tree boundaries such as \`src/\`, \`app/\`, \`internal/\`, \`pkg/\`, \`services/\`, \`modules/\`
   - major domain/module directories that deserve their own local \`AGENTS.md\`
3. Identify recurring file patterns by suffix/convention:
   - \`*Repository.ts\`, \`*Repository.java\`, \`*Repository.kt\`, \`*_repository.py\` → pattern "repository"
   - \`*Service.ts\`, \`*Service.java\`, \`*Service.kt\`, \`*_service.py\` → pattern "service"
   - \`*Controller.ts\`, \`*Controller.java\`, \`*Controller.kt\` → pattern "controller"
   - \`*Handler.go\`, \`*handler.go\` → pattern "handler"
   - \`*Middleware.*\` → pattern "middleware"
   - \`*Schema.*\`, \`*Model.*\` → pattern "model/schema"
   - \`*DTO.*\`, \`*Request.*\`, \`*Response.*\` → pattern "dto"
   - \`*Factory.*\`, \`*Builder.*\` → pattern "factory/builder"
   - Any other recurring naming pattern (\`*Hook.ts\`, \`*Composable.ts\`, \`*Store.ts\`, etc.)
4. For each pattern found, read 2-3 exemplar files and extract:
   - Common structure (imports, exports, class vs function)
   - Naming conventions
   - Dependency patterns (what it injects, what it returns)
   - Error handling patterns
   - Validation patterns

### Phase 2 — Generate Hierarchical AGENTS.md

5. Generate or refresh hierarchical \`AGENTS.md\` files:
   - Root \`AGENTS.md\`: stack summary, real build/test commands, directory layout, critical repo rules
   - Directory-level \`AGENTS.md\`: local architecture, invariants, module boundaries, integration contracts
6. Keep each generated \`AGENTS.md\` scoped to its directory only:
   - no copy-pasting the entire root file into child directories
   - no business-domain detail that belongs in \`docs/domain/*\`
   - commands must match the actual repository scripts and build tools

### Phase 3 — Generate Dynamic Skills

7. For each discovered pattern, create a skill in \`.opencode/skills/j.{pattern}-writing/SKILL.md\`:
   - Frontmatter with \`name\`, \`description\`
   - "When this skill activates" with the glob patterns from the project
   - "Required Steps" extracted from the exemplar file analysis
   - "Anti-patterns to avoid" based on what the exemplars do NOT do
   - Canonical example copied/adapted from a real project file
8. Update \`.opencode/skill-map.json\` with new regex patterns for each skill

### Phase 4 — Generate Documentation

9. Generate initial docs in \`docs/domain/\` (subdirectories by discovered domain)
10. Generate initial docs in \`docs/principles/\` based on patterns found
11. Populate \`docs/principles/manifest\` with real keywords
12. Populate \`docs/domain/INDEX.md\` with real entries and CARL keywords

### Phase 5 — Refresh Local Automation Stubs

13. Validate \`.opencode/scripts/lint-structure.sh\`
14. Validate \`.opencode/scripts/test-related.sh\`
15. Validate \`.opencode/scripts/check-all.sh\`
16. Align commands documented in generated \`AGENTS.md\` files with the actual repository scripts

## Delegation Rule (MANDATORY)

You MUST use \`@j.explore\` for Phase 1. Do NOT try to scan the codebase yourself.

When \`@j.explore\` returns its report:
- Read the FULL report
- Extract all file patterns and structural findings
- Use them to generate AGENTS, skills, and docs

## When to use

- Right after \`juninho setup\` on an existing project
- After major structural refactors that introduce new file patterns
- When onboarding a new project to the framework
- After \`/j.finish-setup\` generates files, review and augment them with non-obvious domain knowledge

## Result

After completion, the project will have:
- Hierarchical \`AGENTS.md\` files aligned to the real directory structure
- Custom skills that match its specific file patterns and conventions
- Domain documentation populated with real business domains
- Principles documentation reflecting actual codebase patterns
- Updated local automation stubs and command references
`
