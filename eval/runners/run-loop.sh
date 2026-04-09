#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BENCHMARK_PATH="${1:-$ROOT_DIR/eval/benchmarks/benchmark-v0.json}"
RUN_LABEL="${2:-$(date +%Y%m%d-%H%M%S)}"

cd "$ROOT_DIR"

node "$ROOT_DIR/eval/runners/run-benchmark.js" "$ROOT_DIR" "$BENCHMARK_PATH" "$RUN_LABEL"
