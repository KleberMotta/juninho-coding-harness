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
2. Explores the codebase for context across all involved repositories
3. Uses project rules, domain docs, and principle docs relevant to the goal before fixing the plan
4. Classifies repositories into **write targets** (repos with code changes) and **reference projects** (read-only context)
5. Interviews you (proportional to complexity)
6. Writes \`plan.md\` and \`CONTEXT.md\` into each write target project's \`\$REPO_ROOT/docs/specs/{feature-slug}/\`
7. Writes \`active-plan.json\` with all \`writeTargets\` and their \`targetRepoRoot\` paths
8. Spawns \`@j.plan-reviewer\` for automated quality check
9. **Presents the plan to you for explicit approval**
10. Marks plan as ready for \`/j.implement\` (only after your approval)
11. If a later \`/j.check\` pass finds required changes after a task is already COMPLETE, the planner should express that work as a new follow-up task instead of reopening the completed one

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
2. Uses explore findings plus relevant project/domain/principle context to inform a 5-phase interview:
   - Discovery: problem and users
   - Requirements: functional and non-functional
   - Contract: API and interface definitions
   - Data: schema and migration strategy
   - Review: **presents spec for your explicit approval**
3. Classifies repositories into **write targets** (repos with code changes) and **reference projects** (read-only context)
4. Writes spec to each write target project's \`\$REPO_ROOT/docs/specs/{feature-slug}/spec.md\` (only after your approval)
5. Never creates \`docs/specs/\` artifacts in reference projects unless explicitly stated

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

1. \`@j.implementer\` reads the active \`plan.md\` (auto-loaded by plan-autoload plugin).
2. Reads \`.opencode/juninho-config.json\` (\`workflow\` section) to understand implement, watchdog, handoff, and UNIFY behavior.
3. If \`/j.implement\` receives no specific task/file, it executes against the whole active plan. For multi-project plans, it must iterate all \`writeTargets\`, using each target project's own \`docs/specs/{feature-slug}/plan.md\` plus local state artifacts.
4. If a specific task/file is provided, it narrows scope to that target while still respecting dependencies and the latest \`check-review.md\` findings.
5. Creates or switches to a single canonical plan branch \`feature/{feature-slug}\` for the entire run.
6. Delegates each implementation task to its own task-scoped \`@j.implementer\` subagent so every task starts with a fresh context window.
7. Because all commits land on the same plan branch, task workers commit sequentially even when the plan has multiple tasks in the same wave.
8. Each task writes and refreshes its own execution lease in \`docs/specs/{feature-slug}/state/tasks/task-{id}/execution-state.md\`.
9. If \`workflow.implement.watchdogSessionStale\` is enabled and a spawned task never writes state or its heartbeat goes stale, the watchdog/orchestrator may launch one retry attempt for that task.
10. Uses the fast pre-commit path while implementing:
    - \`.opencode/scripts/lint-structure.sh\`
    - \`.opencode/scripts/build-verify.sh\`
    - \`.opencode/scripts/test-related.sh\`
    - focused test execution is routed through \`.opencode/scripts/run-test-scope.sh\`
11. Spawns \`@j.validator\` after each task commit to validate the just-implemented task against spec/plan intent, QA expectations, and code quality expectations within task scope.
12. Task state, validator state, implementer log, retry budget, and runtime metadata all live under \`docs/specs/{feature-slug}/state/\` in each task's target project repo root. Multi-project runs must keep state isolated per write target.
13. Canonical task commit bookkeeping is tracked in \`docs/specs/{feature-slug}/state/integration-state.json\`.
14. A task is only marked COMPLETE after its commit succeeds, validator approval is written, and the task bookkeeping for that commit is recorded successfully.
15. The task commit must include the task's updated state files when those files change as part of the successful loop.
16. If \`workflow.implement.watchdogSessionStale\` is enabled, watchdog notifications may surface stalled sessions, but notifications never block the run.
17. Before final exit on a successful whole-feature run, request a feature-level validator pass for each write target to write that target project's \`docs/specs/{feature-slug}/state/functional-validation-plan.md\`.
18. Exit only when code changes, task-level tests, and target-local functional validation plans are complete for every write target on \`feature/{feature-slug}\`.
19. The caller then runs \`.opencode/scripts/check-all.sh\` or \`/j.check\`, which validate the canonical plan branch using \`check-review.md\` plus \`functional-validation-plan.md\`.
20. If the repo-wide check fails, delegate back to \`@j.implementer\` with the failing output and those generated artifacts.
21. If that reentry requires changing work from a task that is already COMPLETE, the harness should create a new follow-up task instead of reopening the completed one.

## History Rules

- A task must commit directly on the canonical plan branch \`feature/{feature-slug}\`.
- The preferred history is one commit per task; one commit per wave is acceptable only when the workflow owner explicitly decides to bundle a wave.
- If a task needs earlier task code to exist, that relationship must be expressed via \`depends\` in \`plan.md\`.
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
If \`/j.check\` fails, invoke \`/j.implement\` again with the failing output, \`check-review.md\`, and \`functional-validation-plan.md\`.
Treat the \`## Reentry Contract\` section inside \`check-review.md\` as the authoritative next-action contract when it is present.
If the correction applies to already completed work, create a new follow-up task first and implement that task forward-only.
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
2. Read \`.opencode/state/active-plan.json\` to discover write targets (if active)
3. Resolve the target project:
   - If a path/domain argument is provided, resolve the containing project root
   - If an active plan exists, operate on all write target projects
   - Otherwise, operate on the single discovered project or ask the user
4. For each target project (\`\$PROJECT_ROOT\`):
   - Identify key files for the requested scope
   - Update \`\$PROJECT_ROOT/AGENTS.md\` and directory-level \`AGENTS.md\` files
   - Update \`\$PROJECT_ROOT/docs/domain/*\` for business behavior and invariants
   - Update \`\$PROJECT_ROOT/docs/principles/*\` for cross-cutting technical patterns
   - Add or refresh sync markers such as:
     - \`<!-- juninho:sync source=src/payments/service.ts hash=abc123 -->\`
   - Update \`\$PROJECT_ROOT/docs/domain/INDEX.md\` and \`\$PROJECT_ROOT/docs/principles/manifest\` when new docs are added or renamed

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

1. Reads \`.opencode/state/active-plan.json\` to discover write targets
2. For each write target project, loads \`docs/domain/INDEX.md\` for domain context
3. Checks per-target \`docs/specs/{feature-slug}/state/\` for any in-progress work
4. If a \`plan.md\` exists in any target: loads it and presents next steps
5. If no plan: asks whether to \`/j.plan\` first or jump straight to \`/j.implement\`
6. Sets up execution state for the current task

In multi-repo mode, shows status across all write targets so you can see which projects have pending work.

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

1. Reads \`.opencode/state/active-plan.json\` to discover all write targets
2. For each write target project (\`\$REPO_ROOT\`):
   - Reads per-task state from \`\$REPO_ROOT/docs/specs/{feature-slug}/state/tasks/task-*/execution-state.md\`
   - Reads the feature-local implementer log from \`\$REPO_ROOT/docs/specs/{feature-slug}/state/implementer-work.md\`
   - Reads \`\$REPO_ROOT/docs/specs/{feature-slug}/state/integration-state.json\` for validated SHAs and commit bookkeeping/cleanup status
   - Reads session runtime metadata from \`\$REPO_ROOT/docs/specs/{feature-slug}/state/sessions/\` when session ownership/context is relevant
3. Summarizes (across all write targets):
   - What was completed this session
   - What is in progress (with file names, attempt number, and last heartbeat)
   - What is blocked and why
   - What was retried and why
   - What is already committed into \`feature/{feature-slug}\` and which commit represents each task
   - What still needs bookkeeping or cleanup
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

1. Reads task list from the active \`plan.md\` (auto-loaded by plan-autoload plugin for all write targets)
2. Reads \`.opencode/state/active-plan.json\` to discover all write targets
3. For multi-project plans, iterates all write targets — each target has its own \`plan.md\` and \`docs/specs/{feature-slug}/state/\` tree
4. Reads feature-local state from each target's \`docs/specs/{feature-slug}/state/\`, especially \`implementer-work.md\` and prior task execution files
5. Identifies tasks that can run in parallel (no dependencies)
6. Creates or switches to the shared implementation branch \`feature/{feature-slug}\` in each target repo
7. Delegates each task to its own task-scoped \`@j.implementer\` subagent with the task's \`targetRepoRoot\` so every task gets a fresh context window scoped to its target project
8. Executes those task workers sequentially on the shared branch
9. Each task reads dependency execution/validator state before coding and writes state to its target repo root (\`\$REPO_ROOT/docs/specs/{feature-slug}/state/\`)
10. Each task maintains a heartbeat in \`tasks/task-{id}/execution-state.md\`
    - Retry budget is tracked per task in \`tasks/task-{id}/retry-state.json\`
11. If \`workflow.implement.watchdogSessionStale\` is enabled and a task never starts or its heartbeat goes stale, the loop may launch one retry attempt for that task
12. If \`workflow.implement.watchdogSessionStale\` is enabled, a watchdog notification may surface stalled sessions without blocking the run
13. \`@j.validator\` runs after each task, writing results to the target's \`docs/specs/{feature-slug}/state/tasks/task-{id}/validator-work.md\`
14. Loop continues until all tasks across all write targets are marked complete
15. Record each APPROVED task commit in the target's \`docs/specs/{feature-slug}/state/integration-state.json\`
16. Run \`/j.check\` once task-level work is done; this must validate the canonical plan branch in every target repo
17. \`@j.unify\` runs only if closeout is enabled in \`.opencode/juninho-config.json\` under \`workflow.unify.enabled\` and should only do closeout/cleanup/PR work

## When to use

- Many independent tasks in the backlog
- Large feature that can be parallelized
- When you want the highest safe throughput

## Execution model

\`\`\`
Wave 1:
  task-worker-1: implement service layer     → commit on feature/{slug}
  task-worker-2: implement API routes        → commit on feature/{slug}
  task-worker-3: implement UI components     → commit on feature/{slug}

Wave 2:
  task-worker-4: wire everything together    → commit on feature/{slug}

Wave 3:
  task-worker-5: unit tests                  → commit on feature/{slug}
  task-worker-6: integration tests           → commit on feature/{slug}
\`\`\`

## Safety

- Each task gets a fresh task-scoped subagent session
- All state files go to repo root, so the orchestrator always has visibility
- Shared-branch execution keeps commit history linear and predictable
- Each task carries its own lease and heartbeat in feature-local state
- Stale tasks can be retried once without allowing two attempts to commit concurrently
- Cleanup applies only to harness bookkeeping artifacts, not task worktrees
- Code integration happens immediately because each task commits directly into the canonical feature branch
- UNIFY performs cleanup only; it must not be responsible for first-time code integration
- If any wave fails, the loop pauses and reports blockers — read \`docs/specs/{slug}/state/\` for details
`

// ─── /check ───────────────────────────────────────────────────────────────────

const CHECK = `# /check — Run All Quality Gates

Invoke the \`@j.checker\` agent to run the full repository verification after \`@j.implementer\` exits, then perform a detailed PR-style review pass.

## Usage

\`\`\`
/j.check
\`\`\`

## What runs

1. \`@j.checker\` reads \`.opencode/state/active-plan.json\` to discover all write targets
2. \`@j.checker\` runs \`.opencode/scripts/check-all.sh\`, which iterates every target repo from the active multi-project plan
3. For each write target (\`\$REPO_ROOT\`), \`@j.checker\` reads \`\$REPO_ROOT/docs/specs/{feature-slug}/state/functional-validation-plan.md\` when it exists
4. \`@j.checker\` delegates a detailed read-only multi-pass review to \`@j.reviewer\` covering all write targets

This script is expected to run the repository-wide checks for the current stack.
Typical examples:
- \`npm run typecheck && npm run lint && npm test\`
- \`./gradlew ktlintCheck && ./gradlew compileKotlin compileTestKotlin && ./gradlew test\`
- \`./mvnw spotless:check && ./mvnw -DskipTests compile test-compile && ./mvnw test\`

The review pass must inspect the resulting integrated branch like a real PR review and look for:
- bugs and missed edge cases
- spec or plan intent drift
- business-rule/domain-rule violations
- project pattern or AGENTS violations
- unnecessary complexity, over-engineering, abstraction inflation, or code bloat
- maintainability or safety concerns worth correcting before closeout

The review must be performed in multiple passes, not one shallow pass:
- Pass 1: correctness, bugs, edge cases, failure paths
- Pass 2: spec/plan/domain/rule alignment and runtime blind spots
- Pass 3: project patterns, simplicity, bloat, and maintainability

If a feature slug is active, persist the report to each write target:
- \`\$REPO_ROOT/docs/specs/{feature-slug}/state/check-review.md\`

Operational rule:
- delegate the review to \`@j.reviewer\`
- provide \`functional-validation-plan.md\` to the reviewer when it exists
- persist the full verification transcript to \`docs/specs/{feature-slug}/state/check-all-output.txt\`
- then write the returned markdown review to \`docs/specs/{feature-slug}/state/check-review.md\`
- then summarize whether the repository is blocked by failing checks, review findings, or both

The report should contain Critical / Important / Minor findings plus intent-coverage and domain-risk sections.
The persisted \`check-review.md\` must also contain a \`## Reentry Contract\` section with exact artifact paths and the expected next action for \`/j.implement\`.

If \`check-all.sh\` fails, still produce the review report when enough context exists. The report should mention whether failures came from verification, code review findings, or both.
If \`functional-validation-plan.md\` exists, the review must also call out runtime or integration risks that remain unproven or unsupported by the current implementation.

## When to use

- After \`/j.implement\` returns control to the caller
- Before \`/j.unify\`
- After a refactor that touched many files or workflows

## Notes

This is intentionally broader than the pre-commit hook.
The pre-commit hook stays fast and runs synchronous, blocking gates for structure lint, build verification, and tests related to staged files.

If the check script fails or the review report contains Critical or Important findings, invoke \`/j.implement\` again with:
- the failing verification output
- the path to \`docs/specs/{feature-slug}/state/check-review.md\`
- the path to \`docs/specs/{feature-slug}/state/check-all-output.txt\`
- the path to \`docs/specs/{feature-slug}/state/functional-validation-plan.md\` when it exists

Forward-only correction rule:
- if a required correction targets work from a task already marked COMPLETE, create a new follow-up task instead of reopening the completed task
- \`check-review.md\` should make that explicit when it applies

\`@j.implementer\` must treat that review report as actionable correction input for the next pass.
\`@j.implementer\` must also treat \`functional-validation-plan.md\` as the validation contract for the next \`/j.check\` pass.

## Delegation Rule (MANDATORY)

You MUST delegate this command to \`@j.checker\` using the \`task()\` tool.
Do NOT run the full \`/j.check\` logic yourself — you are the orchestrator, not the checker.

\`@j.checker\` is responsible for running \`.opencode/scripts/check-all.sh\`, invoking \`@j.reviewer\`, and persisting \`check-review.md\`.

When ANY sub-agent returns output:
- NEVER dismiss it as "incomplete" or "the agent didn't do what was asked"
- NEVER say "I'll continue myself" and take over the sub-agent's job
- If the checker or reviewer needs more context, provide that context and re-delegate
- If checks or review findings block progress, route the result back into \`/j.implement\` with the generated artifacts
`

// ─── /lint ────────────────────────────────────────────────────────────────────

const LINT = `# /lint — Run Linter

Run the structure lint used by the pre-commit path.

This command is only the lint gate. The pre-commit hook then runs \`.opencode/scripts/build-verify.sh\` and \`.opencode/scripts/test-related.sh\`, waiting for each one to succeed before continuing.

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

Run fast, change-scoped tests during implementation after lint/build gates are green.

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
- After \`.opencode/scripts/build-verify.sh\` passes when you need the same local gating order as pre-commit
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
- Integration table details from \`integration-state.json\`: validated commit on the shared feature branch and bookkeeping status
- In-progress items with last known state and heartbeat
- Blocked items with blocker descriptions
- Retried or stale items visible from per-task execution state
- Session log (recent actions)

## When to use

- At the start of a session to orient yourself
- After resuming work to see what's left
- To check if all tasks are complete before running \`/j.unify\`

## Source

Reads state from \`.opencode/state/active-plan.json\` to discover all write targets, then reads per-target artifacts:

1. **Active plan**: \`.opencode/state/active-plan.json\` — identifies write targets and their \`targetRepoRoot\` paths
2. **Per-target task state**: \`{targetRepoRoot}/docs/specs/{feature-slug}/state/tasks/task-{id}/execution-state.md\` — detailed task progress, attempts, heartbeats, blockers, and validated commit
3. **Per-target integration manifest**: \`{targetRepoRoot}/docs/specs/{feature-slug}/state/integration-state.json\` — canonical feature branch, task validated SHAs, and commit bookkeeping/cleanup status

In multi-repo mode, show a section for each write target project so it's clear which tasks belong to which repo.

If a \`<feature-slug>\` argument is provided, only show per-task state for that feature.
If omitted, infer the slug from the active plan.

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
2. Read \`.opencode/state/active-plan.json\` to discover all write targets
3. For each write target (\`\$REPO_ROOT\`), reconcile \`\$REPO_ROOT/docs/specs/{feature-slug}/plan.md\` vs actual git diff — mark tasks DONE/PARTIAL/SKIPPED
4. Run only the enabled closeout steps per target, such as:
   - reconcile \`persistent-context.md\`
   - reconcile \`\$REPO_ROOT/docs/domain/\` or \`\$REPO_ROOT/docs/domain/INDEX.md\`
   - cleanup integration bookkeeping using \`\$REPO_ROOT/docs/specs/{feature-slug}/state/integration-state.json\`
   - create a PR (per target repo when applicable)
4. If PR creation is enabled, draft a rich PR body with purpose, problem, solution, changed files, and validation steps
5. Treat forward-only follow-up tasks created after \`/j.check\` as first-class delivery units when reconciling plan vs delivery
6. Use the latest \`check-review.md\` reentry contract, when present, to explain what was corrected before closeout

## When to use

After \`@j.implementer\` exits, \`/j.check\` passes, and \`@j.validator\` has approved the required work.
By this point, code must already be committed into \`feature/{feature-slug}\`.

## Prerequisites

- All tasks in \`execution-state.md\` should be marked complete
- All validator passes should return APPROVED or APPROVED_WITH_NOTES
- \`gh\` CLI must be authenticated (\`gh auth login\`)

## Note

UNIFY behavior is controlled by \`.opencode/juninho-config.json\` under \`workflow\`.
If PR creation or doc updates are disabled there, \`@j.unify\` should skip those steps and report what was intentionally not executed.
UNIFY is no longer responsible for first-time code integration.
UNIFY should also avoid creating a final synthetic git commit; history should already reflect the planned task commits by the time \`/j.unify\` runs.
If review-driven follow-up tasks were added after completed work, UNIFY should report them as forward-only corrections, not reopened task ownership.
`

// ─── /finish-setup ───────────────────────────────────────────────────────────

const FINISH_SETUP = `# /finish-setup — Bootstrap Repository Knowledge

This is the canonical repository bootstrap command after installing the harness.

Scan a project codebase, generate hierarchical AGENTS.md files, discover recurring file patterns, generate dynamic skills, and populate domain/principles documentation.

## Usage

\`\`\`
/j.finish-setup
/j.finish-setup <project-path-or-name>
\`\`\`

When a project argument is provided, all artifacts are generated **inside that project's root**, not at the workspace root.
When no argument is provided and the harness runs from a workspace root with multiple discovered projects, ask which project to bootstrap.

## Multi-Repo Behavior

The harness can run from a workspace root (e.g., \`~/repos/\`) that contains multiple project repositories.
In this mode, \`/j.finish-setup\` must resolve the **target project root** before starting any phase.

**Target resolution order:**
1. Explicit argument: \`/j.finish-setup olxbr/trp-partner-api\` or \`/j.finish-setup /absolute/path/to/repo\`
2. Single project in workspace: use it automatically
3. Active plan target: if \`active-plan.json\` exists, offer to bootstrap each write target that lacks docs
4. Multiple projects, no argument: list discovered projects and ask the user to choose

**All generated paths below are relative to the resolved \`\$PROJECT_ROOT\`, not the workspace root.**

## What happens

### Phase 1 — Structural Scan (via @j.explore)

1. Invoke \`@j.explore\` to scan the **target project codebase** at \`\$PROJECT_ROOT\`
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

5. Generate or refresh hierarchical \`AGENTS.md\` files inside \`\$PROJECT_ROOT\`:
   - Root \`\$PROJECT_ROOT/AGENTS.md\`: stack summary, real build/test commands, directory layout, critical repo rules
   - Directory-level \`AGENTS.md\`: local architecture, invariants, module boundaries, integration contracts
6. Keep each generated \`AGENTS.md\` scoped to its directory only:
   - no copy-pasting the entire root file into child directories
   - no business-domain detail that belongs in \`docs/domain/*\`
   - commands must match the actual repository scripts and build tools

### Phase 3 — Generate Dynamic Skills

7. For each discovered pattern, create a skill in \`.opencode/skills/j.{pattern}-writing/SKILL.md\` (at the **harness root**, not the project root — skills are shared across projects):
    - Frontmatter with \`name\`, \`description\`
    - "When this skill activates" with the glob patterns from the project
    - "Required Steps" extracted from the exemplar file analysis
    - "Anti-patterns to avoid" based on what the exemplars do NOT do
    - Canonical example copied/adapted from a real project file
   - Before finalizing or revising any skill, load and apply the local \`skill-creator\` skill so the description, trigger criteria, and eval hooks are explicit
8. Update \`.opencode/skill-map.json\` (at the harness root) with new regex patterns for each skill
9. For every created or changed skill, add intelligent eval coverage that proves:
   - the skill triggers under realistic prompts
   - near-miss prompts do not trigger it
   - the skill changes agent behavior on at least one implementation task

### Phase 4 — Generate Documentation

10. Generate initial docs in \`\$PROJECT_ROOT/docs/domain/\` (subdirectories by discovered domain)
11. Generate initial docs in \`\$PROJECT_ROOT/docs/principles/\` based on patterns found
12. Populate \`\$PROJECT_ROOT/docs/principles/manifest\` with real keywords
13. Populate \`\$PROJECT_ROOT/docs/domain/INDEX.md\` with real entries and CARL keywords

### Phase 5 — Refresh Local Automation Stubs

14. Validate \`.opencode/scripts/lint-structure.sh\` (at harness root)
15. Validate \`.opencode/scripts/test-related.sh\` (at harness root)
16. Validate \`.opencode/scripts/check-all.sh\` (at harness root)
17. Align commands documented in generated \`AGENTS.md\` files with the actual repository scripts and build tools found in \`\$PROJECT_ROOT\`

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
- In multi-repo workspaces, to bootstrap a target project that lacks context artifacts (AGENTS.md, docs/domain, docs/principles)
- After \`/j.finish-setup\` generates files, review and augment them with non-obvious domain knowledge

## Result

After completion, the target project will have:
- Hierarchical \`AGENTS.md\` files aligned to the real directory structure
- Custom skills registered in the harness that match the project's file patterns and conventions
- Domain documentation populated with real business domains at \`\$PROJECT_ROOT/docs/domain/\`
- Principles documentation reflecting actual codebase patterns at \`\$PROJECT_ROOT/docs/principles/\`
- Updated local automation stubs and command references
`
