#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROMPT_FILE="$ROOT_DIR/evals/reference-pr-54.prompt.md"
OUTPUT_DIR="$ROOT_DIR/evals/output"
OUTPUT_FILE="$OUTPUT_DIR/reference-pr-54.txt"

mkdir -p "$OUTPUT_DIR"

opencode run --dir "$ROOT_DIR" --format json -f "$PROMPT_FILE" -- "Use the attached prompt exactly." | python3 -c '
import json
import sys

output_file = sys.argv[1]
chunks = []

for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        continue

    if event.get("type") != "text":
        continue

    text = event.get("part", {}).get("text", "").strip()
    if text:
        chunks.append(text)

if not chunks:
    raise SystemExit("No text output captured from opencode run")

content = "\n\n".join(chunks).strip() + "\n"

with open(output_file, "w", encoding="utf-8") as handle:
    handle.write(content)

sys.stdout.write(content)
' "$OUTPUT_FILE"

echo
echo "Saved generated title/body to: $OUTPUT_FILE"
echo "Score it with: $ROOT_DIR/evals/reference-pr-quality.md"
