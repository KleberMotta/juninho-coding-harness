import { writeFileSync, mkdirSync, chmodSync } from "fs"
import path from "path"

export function writeState(projectDir: string): void {
  const opencodeDir = path.join(projectDir, ".opencode")
  const stateDir = path.join(opencodeDir, "state")
  const templatesDir = path.join(opencodeDir, "templates")
  const hooksDir = path.join(opencodeDir, "hooks")

  mkdirSync(hooksDir, { recursive: true })

  writeFileSync(path.join(stateDir, "persistent-context.md"), PERSISTENT_CONTEXT)
  writeFileSync(path.join(stateDir, "execution-state.md"), EXECUTION_STATE)
  writeFileSync(path.join(stateDir, "README.md"), STATE_README)
  writeFileSync(path.join(opencodeDir, ".gitignore"), OPENCODE_GITIGNORE)
  writeFileSync(path.join(templatesDir, "spec-state-readme.md"), SPEC_STATE_README_TEMPLATE)
  writeFileSync(path.join(hooksDir, "pre-commit"), HOOKS_PRE_COMMIT)
  try { chmodSync(path.join(hooksDir, "pre-commit"), 0o755) } catch { /* skip */ }
}

const PERSISTENT_CONTEXT = `# Persistent Context

This file persists important context across sessions. Update it when you learn something
that should be remembered long-term about this project.

## Project Identity

- **Name**: (fill in)
- **Purpose**: (fill in)
- **Tech stack**: (fill in)
- **Team size**: (fill in)

## Architectural Decisions

<!-- Record significant architectural decisions here -->
<!-- Format: ## Decision: <title> / Date: YYYY-MM-DD / Status: ACCEPTED|DEPRECATED -->

## Known Constraints

<!-- Hard constraints that affect all decisions -->
<!-- Examples: "Must support IE11", "Max 200ms response time", "No new dependencies without approval" -->

## Recurring Patterns

<!-- Patterns that appear repeatedly in this codebase -->
<!-- Update after /j.finish-setup or when you discover a strong pattern -->

## Anti-Patterns Found

<!-- Things that have been tried and caused problems -->
<!-- Format: - <pattern>: <why it's bad in this codebase> -->

## External Systems

<!-- APIs, services, databases this project depends on -->
<!-- Format: - **Name**: purpose, auth method, rate limits -->

## Glossary

<!-- Domain-specific terms and their meanings -->
<!-- Format: - **Term**: definition -->
`

const EXECUTION_STATE = `# Execution State

Tracks the local session summary. Feature-local task state lives under
docs/specs/{feature-slug}/state/.

## Current Session

- **Started**: (auto-filled by /j.start-work)
- **Goal**: (auto-filled)
- **Plan**: (path to plan.md if active)
- **Feature slug**: (auto-filled when a spec/plan is active)

## Task List

<!-- High-level session checklist only. Detailed task execution belongs under docs/specs/{slug}/state/tasks/. -->
<!-- Format: - [ ] task description (agent: @j.agentname) -->

## In Progress

<!-- Currently active work items -->

## Completed This Session

<!-- Finished items — move here from Task List when done -->

## Blocked

<!-- Items that can't proceed — include blocker description -->
<!-- Format: - [ ] task (BLOCKED: reason) -->

## Session Log

<!-- Brief log of what happened — helps with /j.handoff -->
<!-- Format: HH:MM - action taken -->

---

*Last updated: (auto-filled)*
*Next action: (fill in at end of session for /j.handoff)*
`

const STATE_README = `# OpenCode State

This directory is local-only session state. It should never be shared through git.

What belongs here:
- \`execution-state.md\` — local session summary
- \`persistent-context.md\` — local persistent memory used by the harness in this workspace
- \`active-plan.json\` — session-level pointer to the currently active spec/plan bundle

What does not belong here:
- repository config (\`.opencode/juninho-config.json\`)
- skill map (\`.opencode/skill-map.json\`)
- per-feature task state (\`docs/specs/{feature-slug}/state/\`)

Per-feature task state continues to live in \`docs/specs/{feature-slug}/state/\`.
`

const OPENCODE_GITIGNORE = `node_modules
bun.lock
package-lock.json
state/
state/**
`

const SPEC_STATE_README_TEMPLATE = `# Feature State

This directory stores canonical harness state for \`docs/specs/{feature-slug}/\`.

## Layout

- \`README.md\`
  - this file
- \`implementer-work.md\`
  - append-only feature log for cross-task decisions, retries, and deviations
- \`check-review.md\`
  - latest repo-wide verification + detailed review report used to drive follow-up corrections
- \`integration-state.json\`
  - source of truth for validated task commits, feature-branch commits, and cleanup status
- \`tasks/\`
  - one directory per task: \`task-{id}/\`
- \`sessions/\`
  - one runtime metadata file per spawned session: \`{sessionID}-runtime.json\`

## Task Directory

Each task lives under \`tasks/task-{id}/\`.

Files used by the harness:
- \`execution-state.md\`
- \`validator-work.md\`
- \`retry-state.json\`
- \`runtime.json\`

## Session Runtime

\`sessions/{sessionID}-runtime.json\` maps a live OpenCode session back to its task runtime metadata.
These files are operational metadata only.

## Rules

- The harness writes feature state only in this directory tree.
- Task-specific files must live under \`tasks/task-{id}/\`.
- Session runtime files must live under \`sessions/\`.
- \`integration-state.json\` and \`implementer-work.md\` stay at the root of this feature state directory.
- \`check-review.md\` stays at the root of this feature state directory and is overwritten by the latest full-check pass.
- When \`check-review.md\` identifies required changes after a task is already COMPLETE, create a new follow-up task instead of reopening the completed task.
`

const HOOKS_PRE_COMMIT = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCRIPT_PATH="$ROOT_DIR/.opencode/scripts/pre-commit.sh"

if [ ! -x "$SCRIPT_PATH" ]; then
  echo "[juninho:pre-commit] Missing executable script: $SCRIPT_PATH" >&2
  exit 1
fi

exec "$SCRIPT_PATH"
`
