# Eval Loop

This directory contains the outer evaluation loop that scores the generated harness on real OpenCode workflow runs.

## Goal

Optimize `juninho-coding-harness` by repeatedly:

1. building the generator
2. installing the harness in benchmark repos
3. running the canonical flow
4. scoring the outcome
5. keeping or reverting changes externally

## Canonical flow under evaluation

1. `j.finish-setup`
2. `j.spec`
3. `j.plan`
4. `j.implement`
5. `j.check`
6. `j.unify`

## Layout

- `benchmarks/benchmark-v0.json` — benchmark definition and scoring weights
- `fixtures/` — local repos used as benchmark targets
- `runners/` — automation entrypoints for install, flow execution, scoring, and loop orchestration
- `results/` — JSON artifacts and logs from benchmark runs
- `results.tsv` — append-only experiment ledger

## Notes

- The benchmark enables non-interactive artifact approval through `.opencode/juninho-config.json` automation flags.
- This is the outer loop. The harness itself remains the system under test.
