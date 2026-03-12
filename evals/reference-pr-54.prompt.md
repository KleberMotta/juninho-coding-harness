# Prompt: Reference PR Review Artifact

Use this prompt with `opencode run` to evaluate whether the generated harness instructions can produce a PR artifact comparable to the reference PR.

## Prompt

You are validating the Juninho harness quality.

Produce a pull request title and body for a change with the following facts:

- Goal: persist a distributed trace id on the audit log table
- Problem:
  - the gateway already propagates or generates `X-B3-TraceId`
  - that trace id is not persisted in a dedicated audit table column
  - when the gateway generates a new trace id, reviewers cannot query it directly in audit storage
- Solution:
  - add `trace_id` column plus index in the audit log table
  - persist the trace id on the entity and in the audit service
  - cache the trace id in request exchange attributes so downstream audit code can read it
  - add unit tests for the filter behavior
  - add a local helper script for generating OAuth credentials used in functional validation
- Changed files:
  - migration file adding `trace_id`
  - audit entity
  - exchange constants
  - trace id filter
  - audit service
  - filter test
  - audit service test adjustments
  - make target and helper script for local validation
  - `.gitignore` update for generated credentials

Requirements:

- Write a title plus a reviewer-friendly PR body
- Include sections for task or issue, purpose, problem, solution, changed files, and functional validation
- Use concrete command examples in validation whenever a command is implied by the scenario; avoid placeholders like "project's standard command" or "<local-url>"
- Validation steps must be runnable and include expected outcomes
- Avoid generic filler
- Keep the tone close to a strong human-authored engineering PR

Output only the PR title and body.
