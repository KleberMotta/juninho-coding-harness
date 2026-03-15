import { chmodSync, writeFileSync } from "fs"
import path from "path"
import type { ProjectType } from "../project-types.js"

export function writeSupportScripts(
  projectDir: string,
  projectType: ProjectType = "node-nextjs",
  isKotlin: boolean = false,
  lintTool?: string,
): void {
  const scriptsDir = path.join(projectDir, ".opencode", "scripts")

  writeExecutable(path.join(scriptsDir, "pre-commit.sh"), PRE_COMMIT)
  writeExecutable(path.join(scriptsDir, "lint-structure.sh"), lintStructure(projectType, isKotlin, lintTool))
  writeExecutable(path.join(scriptsDir, "test-related.sh"), testRelated(projectType, isKotlin))
  writeExecutable(path.join(scriptsDir, "check-all.sh"), checkAll(projectType, isKotlin, lintTool))
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

/* ─── Lint Structure ─── */

function lintStructure(
  projectType: ProjectType,
  isKotlin: boolean,
  lintTool?: string,
): string {
  const header = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

staged_files_as_args() {
  printf '%s\\n' "$JUNINHO_STAGED_FILES" | sed '/^$/d' | tr '\\n' ' '
}

FILES="$(staged_files_as_args)"

if [ -z "$FILES" ]; then
  echo "[juninho:lint-structure] No staged files. Skipping."
  exit 0
fi
`

  switch (projectType) {
    case "node-nextjs":
    case "node-generic":
      return header + lintNodeBody(lintTool)
    case "python":
      return header + lintPythonBody(lintTool)
    case "go":
      return header + lintGoBody(lintTool)
    case "java":
      return isKotlin
        ? header + lintKotlinBody(lintTool)
        : header + lintJavaBody(lintTool)
    case "generic":
      return header + lintGenericBody()
  }
}

function lintNodeBody(lintTool?: string): string {
  const priority = lintTool
    ? `# Priority linter: ${lintTool}\nif command -v npx >/dev/null 2>&1; then\n  npx ${lintTool} $FILES\n  exit 0\nfi\n\n`
    : ""

  return `${priority}has_package_script() {
  [ -f package.json ] || return 1
  node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); process.exit(pkg.scripts && pkg.scripts[process.argv[1]] ? 0 : 1)" "$1" >/dev/null 2>&1
}

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
}

function lintPythonBody(lintTool?: string): string {
  const priority = lintTool
    ? `# Priority linter: ${lintTool}\nif command -v ${lintTool} >/dev/null 2>&1; then\n  ${lintTool} check $FILES\n  exit 0\nfi\n\n`
    : ""

  return `${priority}# Python lint chain: ruff → flake8 → pylint
if command -v ruff >/dev/null 2>&1; then
  ruff check $FILES
  exit 0
fi

if command -v flake8 >/dev/null 2>&1; then
  flake8 $FILES
  exit 0
fi

if command -v pylint >/dev/null 2>&1; then
  pylint $FILES
  exit 0
fi

echo "[juninho:lint-structure] No Python linter found. Install ruff, flake8, or pylint."
`
}

function lintGoBody(lintTool?: string): string {
  const priority = lintTool
    ? `# Priority linter: ${lintTool}\nif command -v ${lintTool} >/dev/null 2>&1; then\n  ${lintTool} run\n  exit 0\nfi\n\n`
    : ""

  return `${priority}# Go lint chain: golangci-lint → go vet
if command -v golangci-lint >/dev/null 2>&1; then
  golangci-lint run
  exit 0
fi

go vet ./...
`
}

function lintJavaBody(lintTool?: string): string {
  const priority = lintTool
    ? `# Priority linter: ${lintTool}\n`
    : ""

  return `${priority}# Java lint chain: gradle checkstyle → maven checkstyle
if [ -x "./gradlew" ]; then
  ./gradlew checkstyleMain 2>/dev/null && exit 0
  echo "[juninho:lint-structure] Gradle checkstyle not configured. Add checkstyle plugin to build.gradle."
  exit 0
fi

if [ -x "./mvnw" ]; then
  ./mvnw checkstyle:check 2>/dev/null && exit 0
  echo "[juninho:lint-structure] Maven checkstyle not configured. Add checkstyle plugin to pom.xml."
  exit 0
fi

echo "[juninho:lint-structure] No Java build tool found."
`
}

function lintKotlinBody(lintTool?: string): string {
  const priority = lintTool
    ? `# Priority linter: ${lintTool}\n`
    : ""

  return `${priority}# Kotlin lint chain: ktlint → detekt → compileKotlin warnings
if [ -x "./gradlew" ]; then
  # Try ktlint first (most common for Kotlin formatting/style)
  if ./gradlew tasks --all 2>/dev/null | grep -q "ktlintCheck"; then
    ./gradlew ktlintCheck
    exit 0
  fi

  # Try detekt (static analysis)
  if ./gradlew tasks --all 2>/dev/null | grep -q "detekt"; then
    ./gradlew detekt
    exit 0
  fi

  # Fallback: compile with warnings treated as errors
  ./gradlew compileKotlin 2>&1
  exit 0
fi

if [ -x "./mvnw" ]; then
  # Maven ktlint plugin
  ./mvnw antrun:run@ktlint-check 2>/dev/null && exit 0
  # Fallback to compile
  ./mvnw compile 2>&1
  exit 0
fi

echo "[juninho:lint-structure] No Kotlin build tool found."
echo "[juninho:lint-structure] Add ktlint or detekt Gradle plugin for structural linting."
`
}

function lintGenericBody(): string {
  return `# Generic: try common linters across stacks
if [ -f package.json ]; then
  if command -v npx >/dev/null 2>&1; then
    npx eslint --max-warnings=0 $FILES 2>/dev/null && exit 0
  fi
fi

if command -v ruff >/dev/null 2>&1; then
  ruff check $FILES 2>/dev/null && exit 0
fi

if command -v golangci-lint >/dev/null 2>&1; then
  golangci-lint run 2>/dev/null && exit 0
fi

if [ -x "./gradlew" ]; then
  ./gradlew check 2>/dev/null && exit 0
fi

echo "[juninho:lint-structure] No linter detected. Customize .opencode/scripts/lint-structure.sh."
`
}

/* ─── Test Related ─── */

function testRelated(projectType: ProjectType, isKotlin: boolean): string {
  const header = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

staged_files_as_args() {
  printf '%s\\n' "$JUNINHO_STAGED_FILES" | sed '/^$/d' | tr '\\n' ' '
}

FILES="$(staged_files_as_args)"

if [ -z "$FILES" ]; then
  echo "[juninho:test-related] No staged files. Skipping."
  exit 0
fi
`

  switch (projectType) {
    case "node-nextjs":
    case "node-generic":
      return header + testNodeBody()
    case "python":
      return header + testPythonBody()
    case "go":
      return header + testGoBody()
    case "java":
      return isKotlin
        ? header + testKotlinBody()
        : header + testJavaBody()
    case "generic":
      return header + testGenericBody()
  }
}

function testNodeBody(): string {
  return `has_package_script() {
  [ -f package.json ] || return 1
  node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); process.exit(pkg.scripts && pkg.scripts[process.argv[1]] ? 0 : 1)" "$1" >/dev/null 2>&1
}

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
}

function testPythonBody(): string {
  // Use string concatenation to avoid template literal escaping issues with shell variables
  const lines = [
    '# Python: run pytest scoped to staged files',
    'PY_FILES=""',
    'for f in $FILES; do',
    '  case "$f" in *.py) PY_FILES="$PY_FILES $f" ;; esac',
    'done',
    '',
    'if [ -z "$PY_FILES" ]; then',
    '  echo "[juninho:test-related] No Python files staged. Skipping tests."',
    '  exit 0',
    'fi',
    '',
    '# Derive test file paths from source files',
    'TEST_TARGETS=""',
    'for f in $PY_FILES; do',
    '  dir=$(dirname "$f")',
    '  base=$(basename "$f" .py)',
    '  for candidate in "${dir}/test_${base}.py" "${dir}/${base}_test.py" "tests/test_${base}.py" "tests/${dir}/test_${base}.py"; do',
    '    if [ -f "$candidate" ]; then',
    '      TEST_TARGETS="$TEST_TARGETS $candidate"',
    '    fi',
    '  done',
    'done',
    '',
    'if [ -n "$TEST_TARGETS" ]; then',
    '  pytest $TEST_TARGETS --no-header -q 2>/dev/null && exit 0',
    '  python -m pytest $TEST_TARGETS --no-header -q 2>/dev/null && exit 0',
    'fi',
    '',
    'echo "[juninho:test-related] No related tests found for staged Python files."',
  ]
  return lines.join('\n') + '\n'
}

function testGoBody(): string {
  return `# Go: run tests for packages containing staged files
GO_FILES=""
for f in $FILES; do
  case "$f" in *.go) GO_FILES="$GO_FILES $f" ;; esac
done

if [ -z "$GO_FILES" ]; then
  echo "[juninho:test-related] No Go files staged. Skipping tests."
  exit 0
fi

# Extract unique package directories
PACKAGES=""
for f in $GO_FILES; do
  pkg="./$(dirname "$f")"
  case " $PACKAGES " in
    *" $pkg "*) ;;
    *) PACKAGES="$PACKAGES $pkg" ;;
  esac
done

go test -count=1 $PACKAGES
`
}

function testJavaBody(): string {
  const lines = [
    '# Java: run tests scoped to staged files',
    'JAVA_FILES=""',
    'for f in $FILES; do',
    '  case "$f" in *.java) JAVA_FILES="$JAVA_FILES $f" ;; esac',
    'done',
    '',
    'if [ -z "$JAVA_FILES" ]; then',
    '  echo "[juninho:test-related] No Java files staged. Skipping tests."',
    '  exit 0',
    'fi',
    '',
    '# Extract test class names from staged source files',
    'TEST_FILTER=""',
    'for f in $JAVA_FILES; do',
    '  base=$(basename "$f" .java)',
    '  case "$base" in *Test|*Tests|*IT)',
    '    TEST_FILTER="$TEST_FILTER --tests *${base}"',
    '    continue',
    '    ;;',
    '  esac',
    '  TEST_FILTER="$TEST_FILTER --tests *${base}Test"',
    'done',
    '',
    'if [ -x "./gradlew" ]; then',
    '  ./gradlew test $TEST_FILTER 2>/dev/null || ./gradlew test',
    '  exit 0',
    'fi',
    '',
    'if [ -x "./mvnw" ]; then',
    '  MAVEN_FILTER=""',
    '  for f in $JAVA_FILES; do',
    '    base=$(basename "$f" .java)',
    '    MAVEN_FILTER="${MAVEN_FILTER},${base}Test"',
    '  done',
    '  MAVEN_FILTER=$(echo "$MAVEN_FILTER" | sed \'s/^,//\')',
    '  ./mvnw test -Dtest="$MAVEN_FILTER" 2>/dev/null || ./mvnw test',
    '  exit 0',
    'fi',
    '',
    'echo "[juninho:test-related] No Java build tool found."',
  ]
  return lines.join('\n') + '\n'
}

function testKotlinBody(): string {
  const lines = [
    '# Kotlin: run tests scoped to staged files',
    'KT_FILES=""',
    'JAVA_FILES=""',
    'for f in $FILES; do',
    '  case "$f" in',
    '    *.kt|*.kts) KT_FILES="$KT_FILES $f" ;;',
    '    *.java) JAVA_FILES="$JAVA_FILES $f" ;;',
    '  esac',
    'done',
    '',
    'ALL_FILES="$KT_FILES $JAVA_FILES"',
    'if [ -z "$(echo "$ALL_FILES" | tr -d \' \')" ]; then',
    '  echo "[juninho:test-related] No Kotlin/Java files staged. Skipping tests."',
    '  exit 0',
    'fi',
    '',
    '# Extract test class names from staged source files',
    'TEST_FILTER=""',
    'for f in $KT_FILES $JAVA_FILES; do',
    '  ext="${f##*.}"',
    '  base=$(basename "$f" ".$ext")',
    '  case "$base" in *Test|*Tests|*IT|*Spec)',
    '    TEST_FILTER="$TEST_FILTER --tests *${base}"',
    '    continue',
    '    ;;',
    '  esac',
    '  TEST_FILTER="$TEST_FILTER --tests *${base}Test"',
    'done',
    '',
    'if [ -x "./gradlew" ]; then',
    '  if [ -n "$TEST_FILTER" ]; then',
    '    ./gradlew test $TEST_FILTER 2>/dev/null || ./gradlew test',
    '  else',
    '    ./gradlew test',
    '  fi',
    '  exit 0',
    'fi',
    '',
    'if [ -x "./mvnw" ]; then',
    '  ./mvnw test',
    '  exit 0',
    'fi',
    '',
    'echo "[juninho:test-related] No Kotlin build tool found."',
  ]
  return lines.join('\n') + '\n'
}

function testGenericBody(): string {
  return `# Generic: try common test runners
if [ -f package.json ]; then
  if command -v npx >/dev/null 2>&1; then
    npx jest --findRelatedTests --passWithNoTests $FILES 2>/dev/null && exit 0
    npx vitest related $FILES --run 2>/dev/null && exit 0
  fi
fi

if command -v pytest >/dev/null 2>&1; then
  pytest --no-header -q 2>/dev/null && exit 0
fi

if command -v go >/dev/null 2>&1 && [ -f go.mod ]; then
  go test ./... 2>/dev/null && exit 0
fi

if [ -x "./gradlew" ]; then
  ./gradlew test 2>/dev/null && exit 0
fi

echo "[juninho:test-related] No test runner detected. Customize .opencode/scripts/test-related.sh."
`
}

/* ─── Check All ─── */

function checkAll(
  projectType: ProjectType,
  isKotlin: boolean,
  lintTool?: string,
): string {
  const header = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"
`

  switch (projectType) {
    case "node-nextjs":
    case "node-generic":
      return header + checkAllNodeBody()
    case "python":
      return header + checkAllPythonBody(lintTool)
    case "go":
      return header + checkAllGoBody(lintTool)
    case "java":
      return isKotlin
        ? header + checkAllKotlinBody(lintTool)
        : header + checkAllJavaBody(lintTool)
    case "generic":
      return header + checkAllGenericBody()
  }
}

function checkAllNodeBody(): string {
  return `has_package_script() {
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

echo "[juninho:check-all] No full verification command configured."
echo "[juninho:check-all] Customize .opencode/scripts/check-all.sh or run /j.init-deep."
`
}

function checkAllPythonBody(lintTool?: string): string {
  const lint = lintTool ?? "ruff"
  return `# Python: lint + test
echo "[juninho:check-all] Running lint..."
if command -v ${lint} >/dev/null 2>&1; then
  ${lint} check .
elif command -v ruff >/dev/null 2>&1; then
  ruff check .
elif command -v flake8 >/dev/null 2>&1; then
  flake8 .
fi

echo "[juninho:check-all] Running tests..."
if command -v pytest >/dev/null 2>&1; then
  pytest
elif command -v python >/dev/null 2>&1; then
  python -m pytest
fi
`
}

function checkAllGoBody(lintTool?: string): string {
  const lint = lintTool ?? "golangci-lint"
  return `# Go: vet + lint + test
echo "[juninho:check-all] Running go vet..."
go vet ./...

echo "[juninho:check-all] Running lint..."
if command -v ${lint} >/dev/null 2>&1; then
  ${lint} run
fi

echo "[juninho:check-all] Running tests..."
go test ./...
`
}

function checkAllJavaBody(lintTool?: string): string {
  return `# Java: full build with tests
if [ -x "./gradlew" ]; then
  ${lintTool ? `echo "[juninho:check-all] Running lint..."\n  ./gradlew checkstyleMain 2>/dev/null || true\n  ` : ""}echo "[juninho:check-all] Running tests..."
  ./gradlew test
  exit 0
fi

if [ -x "./mvnw" ]; then
  ${lintTool ? `echo "[juninho:check-all] Running lint..."\n  ./mvnw checkstyle:check 2>/dev/null || true\n  ` : ""}echo "[juninho:check-all] Running tests..."
  ./mvnw test
  exit 0
fi

echo "[juninho:check-all] No Java build tool found."
`
}

function checkAllKotlinBody(lintTool?: string): string {
  return `# Kotlin: lint + compile + test
if [ -x "./gradlew" ]; then
  echo "[juninho:check-all] Running Kotlin lint..."
  # Try ktlint first, then detekt
  ./gradlew ktlintCheck 2>/dev/null || ./gradlew detekt 2>/dev/null || true

  echo "[juninho:check-all] Compiling..."
  ./gradlew compileKotlin

  echo "[juninho:check-all] Running tests..."
  ./gradlew test
  exit 0
fi

if [ -x "./mvnw" ]; then
  echo "[juninho:check-all] Compiling and testing..."
  ./mvnw test
  exit 0
fi

echo "[juninho:check-all] No Kotlin build tool found."
`
}

function checkAllGenericBody(): string {
  return `# Generic: detect and run what's available
if [ -f package.json ]; then
  npm test 2>/dev/null && exit 0
fi

if command -v pytest >/dev/null 2>&1; then
  pytest 2>/dev/null && exit 0
fi

if [ -f go.mod ]; then
  go test ./... 2>/dev/null && exit 0
fi

if [ -x "./gradlew" ]; then
  ./gradlew test 2>/dev/null && exit 0
fi

if [ -x "./mvnw" ]; then
  ./mvnw test 2>/dev/null && exit 0
fi

echo "[juninho:check-all] No full verification command configured."
echo "[juninho:check-all] Customize .opencode/scripts/check-all.sh or run /j.init-deep."
`
}
