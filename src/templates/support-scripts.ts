import { chmodSync, writeFileSync } from "fs"
import path from "path"

export function writeSupportScripts(projectDir: string): void {
  const scriptsDir = path.join(projectDir, ".opencode", "scripts")

  writeExecutable(path.join(scriptsDir, "pre-commit.sh"), PRE_COMMIT)
  writeExecutable(path.join(scriptsDir, "lint-structure.sh"), LINT_STRUCTURE)
  writeExecutable(path.join(scriptsDir, "test-related.sh"), TEST_RELATED)
  writeExecutable(path.join(scriptsDir, "check-all.sh"), CHECK_ALL)
}

function writeExecutable(filePath: string, content: string): void {
  writeFileSync(filePath, content)

  try {
    chmodSync(filePath, 0o755)
  } catch {
    // Ignore chmod errors on platforms that do not support it.
  }
}

const PRE_COMMIT = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

JUNINHO_STAGED_FILES="$(git diff --cached --name-only --diff-filter=ACMR)"
export JUNINHO_STAGED_FILES

if [ -z "$JUNINHO_STAGED_FILES" ]; then
  echo "[juninho:pre-commit] No staged files. Skipping."
  exit 0
fi

echo "[juninho:pre-commit] Running structure lint..."
"$ROOT_DIR/.opencode/scripts/lint-structure.sh"

echo "[juninho:pre-commit] Running related tests..."
"$ROOT_DIR/.opencode/scripts/test-related.sh"

echo "[juninho:pre-commit] Local checks passed"
`

const LINT_STRUCTURE = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

staged_files_as_args() {
  printf '%s\n' "$JUNINHO_STAGED_FILES" | sed '/^$/d' | tr '\n' ' '
}

has_package_script() {
  [ -f package.json ] || return 1
  node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); process.exit(pkg.scripts && pkg.scripts[process.argv[1]] ? 0 : 1)" "$1" >/dev/null 2>&1
}

FILES="$(staged_files_as_args)"

if [ -z "$FILES" ]; then
  echo "[juninho:lint-structure] No staged files. Skipping."
  exit 0
fi

if has_package_script "lint:structure"; then
  npm run lint:structure -- $FILES
  exit 0
fi

if has_package_script "lint"; then
  npm run lint -- --max-warnings=0 $FILES
  exit 0
fi

if command -v npx >/dev/null 2>&1 && npx --yes eslint --version >/dev/null 2>&1; then
  npx eslint --max-warnings=0 $FILES
  exit 0
fi

echo "[juninho:lint-structure] No structure lint configured."
echo "[juninho:lint-structure] Customize .opencode/scripts/lint-structure.sh or run /j.init-deep."
`

const TEST_RELATED = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

staged_files_as_args() {
  printf '%s\n' "$JUNINHO_STAGED_FILES" | sed '/^$/d' | tr '\n' ' '
}

has_package_script() {
  [ -f package.json ] || return 1
  node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); process.exit(pkg.scripts && pkg.scripts[process.argv[1]] ? 0 : 1)" "$1" >/dev/null 2>&1
}

FILES="$(staged_files_as_args)"

if [ -z "$FILES" ]; then
  echo "[juninho:test-related] No staged files. Skipping."
  exit 0
fi

if has_package_script "test:related"; then
  npm run test:related -- $FILES
  exit 0
fi

if command -v npx >/dev/null 2>&1 && npx --yes jest --version >/dev/null 2>&1; then
  npx jest --findRelatedTests --passWithNoTests $FILES
  exit 0
fi

if command -v npx >/dev/null 2>&1 && npx --yes vitest --version >/dev/null 2>&1; then
  npx vitest related $FILES --run
  exit 0
fi

echo "[juninho:test-related] No related-test command configured."
echo "[juninho:test-related] Customize .opencode/scripts/test-related.sh or run /j.init-deep."
`

const CHECK_ALL = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

has_package_script() {
  [ -f package.json ] || return 1
  node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); process.exit(pkg.scripts && pkg.scripts[process.argv[1]] ? 0 : 1)" "$1" >/dev/null 2>&1
}

if has_package_script "check:all"; then
  npm run check:all
  exit 0
fi

if [ -f package.json ]; then
  if has_package_script "typecheck"; then
    npm run typecheck
  fi

  if has_package_script "lint"; then
    npm run lint
  fi

  if has_package_script "test"; then
    npm test -- --runInBand
  fi

  exit 0
fi

if [ -x "./gradlew" ]; then
  ./gradlew test
  exit 0
fi

if [ -x "./mvnw" ]; then
  ./mvnw test
  exit 0
fi

echo "[juninho:check-all] No full verification command configured."
echo "[juninho:check-all] Customize .opencode/scripts/check-all.sh or run /j.init-deep."
`
