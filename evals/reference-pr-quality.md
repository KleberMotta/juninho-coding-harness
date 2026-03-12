# Eval: Reference PR Quality

Goal: make the harness produce PR artifacts with the same level of clarity and completeness as `https://github.com/olxbr/trp-api-gateway/pull/54/changes`.

## Reference qualities to match

- Clear task or issue reference when available
- Purpose written in business terms, not just file diffs
- Problem statement explaining the gap in the current behavior
- Solution summary broken into understandable steps
- Explicit list of changed files and why they changed
- Functional or validation steps that a reviewer can actually execute
- Commit history that shows feature work, review fixes, and refactors separately when useful

## Pass criteria

The harness output passes when it contains all of the following:

1. A PR title aligned with the main delivered change
2. A PR body with these sections or equivalent:
   - task or issue
   - purpose
   - problem
   - solution
   - changed files
   - validation steps
3. Validation steps that are runnable and include expected outcomes
4. Changed files grouped by responsibility instead of dumped as a flat diff summary
5. No generic filler such as "updated some files" or "fixed issues"

## Scoring rubric

Score each category from 0 to 2.

- Context
  - 0: missing task, purpose, or problem
  - 1: partial context
  - 2: clear task, purpose, and problem

- Solution clarity
  - 0: only diff narration
  - 1: some rationale but incomplete
  - 2: concise stepwise solution with why

- File mapping
  - 0: no explicit file mapping
  - 1: files listed without roles
  - 2: files listed with responsibilities

- Validation quality
  - 0: no validation steps
  - 1: vague or incomplete steps
  - 2: runnable steps with expected result

- Delivery polish
  - 0: generic or sloppy wording
  - 1: understandable but uneven
  - 2: reviewer-friendly and professional

Total score: 0 to 10.

Target:
- 8 to 10 = match
- 6 to 7 = close, still needs improvement
- 0 to 5 = below target
