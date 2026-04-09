#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SUMMARY_PATH="$1"
BASELINE_PATH="$2"

[ -n "$SUMMARY_PATH" ] || { echo "Usage: $0 <summary.json> [baseline.json]" >&2; exit 1; }

if [ -z "$BASELINE_PATH" ] || [ ! -f "$BASELINE_PATH" ]; then
  echo "keep"
  exit 0
fi

SUMMARY_SCORE="$(node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(j.score));' -- "$SUMMARY_PATH")"
BASELINE_SCORE="$(node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(j.score));' -- "$BASELINE_PATH")"

node -e 'const current=Number(process.argv[1]); const baseline=Number(process.argv[2]); process.stdout.write(current >= baseline ? "keep" : "discard");' -- "$SUMMARY_SCORE" "$BASELINE_SCORE"
