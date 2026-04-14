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
  writeExecutable(path.join(scriptsDir, "run-test-scope.sh"), runTestScope(projectType, isKotlin))
  writeExecutable(path.join(scriptsDir, "check-all.sh"), checkAll(projectType, isKotlin, lintTool))
  writeExecutable(path.join(scriptsDir, "scaffold-spec-state.sh"), SCAFFOLD_SPEC_STATE)
  writeExecutable(path.join(scriptsDir, "harness-feature-integration.sh"), HARNESS_FEATURE_INTEGRATION)
  writeExecutable(path.join(scriptsDir, "build-verify.sh"), buildVerify(projectType, isKotlin))
  writeExecutable(path.join(scriptsDir, "install-git-hooks.sh"), INSTALL_GIT_HOOKS)
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
      return isKotlin ? header + lintKotlinBody(lintTool) : header + lintJavaBody(lintTool)
    case "generic":
      return header + lintGenericBody()
  }
}

function lintNodeBody(lintTool?: string): string {
  const priority = lintTool
    ? `if command -v npx >/dev/null 2>&1; then\n  npx ${lintTool} $FILES\n  exit 0\nfi\n\n`
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
echo "[juninho:lint-structure] Customize .opencode/scripts/lint-structure.sh or run /j.finish-setup."
`
}

function lintPythonBody(lintTool?: string): string {
  const priority = lintTool
    ? `if command -v ${lintTool} >/dev/null 2>&1; then\n  ${lintTool} check $FILES\n  exit 0\nfi\n\n`
    : ""

  return `${priority}if command -v ruff >/dev/null 2>&1; then
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
    ? `if command -v ${lintTool} >/dev/null 2>&1; then\n  ${lintTool} run\n  exit 0\nfi\n\n`
    : ""

  return `${priority}if command -v golangci-lint >/dev/null 2>&1; then
  golangci-lint run
  exit 0
fi

go vet ./...
`
}

function lintJavaBody(_lintTool?: string): string {
  return `if [ -x "./gradlew" ]; then
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

function lintKotlinBody(_lintTool?: string): string {
  return `if [ -x "./gradlew" ]; then
  if ./gradlew tasks --all 2>/dev/null | grep -q "ktlintCheck"; then
    ./gradlew ktlintCheck
    exit 0
  fi

  if ./gradlew tasks --all 2>/dev/null | grep -q "detekt"; then
    ./gradlew detekt
    exit 0
  fi

  ./gradlew compileKotlin 2>&1
  exit 0
fi

if [ -x "./mvnw" ]; then
  ./mvnw antrun:run@ktlint-check 2>/dev/null && exit 0
  ./mvnw compile 2>&1
  exit 0
fi

echo "[juninho:lint-structure] No Kotlin build tool found."
echo "[juninho:lint-structure] Add ktlint or detekt Gradle plugin for structural linting."
`
}

function lintGenericBody(): string {
  return `if [ -f package.json ]; then
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

function testRelated(projectType: ProjectType, isKotlin: boolean): string {
  switch (projectType) {
    case "node-nextjs":
    case "node-generic":
      return nodeTestRelated()
    case "python":
      return pythonTestRelated()
    case "go":
      return goTestRelated()
    case "java":
      return isKotlin ? kotlinTestRelated() : javaTestRelated()
    case "generic":
      return genericTestRelated()
  }
}

function nodeTestRelated(): string {
  return `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

FILES="\${JUNINHO_STAGED_FILES:-}"

if [ -z "$FILES" ]; then
  echo "[juninho:test-related] No staged files. Skipping."
  exit 0
fi

has_package_script() {
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
echo "[juninho:test-related] Customize .opencode/scripts/test-related.sh or run /j.finish-setup."
`
}

function pythonTestRelated(): string {
  return `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

FILES="\${JUNINHO_STAGED_FILES:-}"

if [ -z "$FILES" ]; then
  echo "[juninho:test-related] No staged files. Skipping."
  exit 0
fi

PY_FILES=""
for f in $FILES; do
  case "$f" in *.py) PY_FILES="$PY_FILES $f" ;; esac
done

if [ -z "$PY_FILES" ]; then
  echo "[juninho:test-related] No Python files staged. Skipping tests."
  exit 0
fi

TEST_TARGETS=""
for f in $PY_FILES; do
  dir=$(dirname "$f")
  base=$(basename "$f" .py)
  for candidate in "\${dir}/test_\${base}.py" "\${dir}/\${base}_test.py" "tests/test_\${base}.py" "tests/\${dir}/test_\${base}.py"; do
    if [ -f "$candidate" ]; then
      TEST_TARGETS="$TEST_TARGETS $candidate"
    fi
  done
done

if [ -n "$TEST_TARGETS" ]; then
  pytest $TEST_TARGETS --no-header -q 2>/dev/null && exit 0
  python -m pytest $TEST_TARGETS --no-header -q 2>/dev/null && exit 0
fi

echo "[juninho:test-related] No related tests found for staged Python files."
`
}

function goTestRelated(): string {
  return `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

FILES="\${JUNINHO_STAGED_FILES:-}"

if [ -z "$FILES" ]; then
  echo "[juninho:test-related] No staged files. Skipping."
  exit 0
fi

GO_FILES=""
for f in $FILES; do
  case "$f" in *.go) GO_FILES="$GO_FILES $f" ;; esac
done

if [ -z "$GO_FILES" ]; then
  echo "[juninho:test-related] No Go files staged. Skipping tests."
  exit 0
fi

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

function javaTestRelated(): string {
  return `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

FILES="\${JUNINHO_STAGED_FILES:-}"

if [ -z "$FILES" ]; then
  echo "[juninho:test-related] No staged files. Skipping."
  exit 0
fi

JAVA_FILES=""
for f in $FILES; do
  case "$f" in *.java) JAVA_FILES="$JAVA_FILES $f" ;; esac
done

if [ -z "$JAVA_FILES" ]; then
  echo "[juninho:test-related] No Java files staged. Skipping tests."
  exit 0
fi

TEST_FILTER=""
for f in $JAVA_FILES; do
  base=$(basename "$f" .java)
  case "$base" in *Test|*Tests|*IT)
    TEST_FILTER="$TEST_FILTER --tests *\${base}"
    continue
    ;;
  esac
  TEST_FILTER="$TEST_FILTER --tests *\${base}Test"
done

if [ -x "./gradlew" ]; then
  ./gradlew test $TEST_FILTER 2>/dev/null || ./gradlew test
  exit 0
fi

if [ -x "./mvnw" ]; then
  MAVEN_FILTER=""
  for f in $JAVA_FILES; do
    base=$(basename "$f" .java)
    MAVEN_FILTER="\${MAVEN_FILTER},\${base}Test"
  done
  MAVEN_FILTER=$(echo "$MAVEN_FILTER" | sed 's/^,//')
  ./mvnw test -Dtest="$MAVEN_FILTER" 2>/dev/null || ./mvnw test
  exit 0
fi

echo "[juninho:test-related] No Java build tool found."
`
}

function kotlinTestRelated(): string {
  return `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

FILES="\${JUNINHO_STAGED_FILES:-}"

if [ -z "$FILES" ]; then
  echo "[juninho:test-related] No staged files. Skipping."
  exit 0
fi

KT_FILES=""
JAVA_FILES=""
for f in $FILES; do
  case "$f" in
    *.kt|*.kts) KT_FILES="$KT_FILES $f" ;;
    *.java) JAVA_FILES="$JAVA_FILES $f" ;;
  esac
done

ALL_FILES="$KT_FILES $JAVA_FILES"
if [ -z "$(echo "$ALL_FILES" | tr -d ' ')" ]; then
  echo "[juninho:test-related] No Kotlin/Java files staged. Skipping tests."
  exit 0
fi

TEST_FILTER=""
for f in $KT_FILES $JAVA_FILES; do
  ext="\${f##*.}"
  base=$(basename "$f" ".$ext")
  case "$base" in *Test|*Tests|*IT|*Spec)
    TEST_FILTER="$TEST_FILTER --tests *\${base}"
    continue
    ;;
  esac
  TEST_FILTER="$TEST_FILTER --tests *\${base}Test"
done

if [ -x "./gradlew" ]; then
  if [ -n "$TEST_FILTER" ]; then
    ./gradlew test $TEST_FILTER 2>/dev/null || ./gradlew test
  else
    ./gradlew test
  fi
  exit 0
fi

if [ -x "./mvnw" ]; then
  ./mvnw test
  exit 0
fi

echo "[juninho:test-related] No Kotlin build tool found."
`
}

function genericTestRelated(): string {
  return `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

FILES="\${JUNINHO_STAGED_FILES:-}"

if [ -z "$FILES" ]; then
  echo "[juninho:test-related] No staged files. Skipping."
  exit 0
fi

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

function runTestScope(projectType: ProjectType, isKotlin: boolean): string {
  switch (projectType) {
    case "node-nextjs":
    case "node-generic":
      return RUN_TEST_SCOPE_GENERIC_NODE
    case "python":
      return RUN_TEST_SCOPE_PYTHON
    case "go":
      return RUN_TEST_SCOPE_GO
    case "java":
      return isKotlin ? RUN_TEST_SCOPE_KOTLIN : RUN_TEST_SCOPE_JAVA
    case "generic":
      return RUN_TEST_SCOPE_GENERIC
  }
}

function checkAll(
  projectType: ProjectType,
  isKotlin: boolean,
  lintTool?: string,
): string {
  const header = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

sh "$ROOT_DIR/.opencode/scripts/harness-feature-integration.sh" switch-active >/dev/null 2>&1 || true

CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [ -n "$CURRENT_BRANCH" ]; then
  echo "[juninho:check-all] Running on branch: $CURRENT_BRANCH"
fi
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
      return isKotlin ? header + checkAllKotlinBody(lintTool) : header + checkAllJavaBody(lintTool)
    case "generic":
      return header + checkAllGenericBody()
  }
}

function checkAllNodeBody(): string {
  return `has_package_script() {
  [ -f package.json ] || return 1
  node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); process.exit(pkg.scripts && pkg.scripts[process.argv[1]] ? 0 : 1)" "$1" >/dev/null 2>&1
}

echo "[juninho:check-all] Running formatting checks..."
if has_package_script "lint"; then
  npm run lint
elif has_package_script "check:all"; then
  npm run check:all
fi

echo "[juninho:check-all] Running repo-wide tests..."
if has_package_script "check:all"; then
  npm run check:all
  exit 0
fi

if has_package_script "typecheck"; then
  npm run typecheck
fi

if has_package_script "test"; then
  npm test
  exit 0
fi

echo "[juninho:check-all] No full verification command configured."
echo "[juninho:check-all] Customize .opencode/scripts/check-all.sh or run /j.finish-setup."
`
}

function checkAllPythonBody(lintTool?: string): string {
  const lint = lintTool ?? "ruff"
  return `echo "[juninho:check-all] Running formatting checks..."
if command -v ${lint} >/dev/null 2>&1; then
  ${lint} check .
elif command -v ruff >/dev/null 2>&1; then
  ruff check .
elif command -v flake8 >/dev/null 2>&1; then
  flake8 .
fi

echo "[juninho:check-all] Running repo-wide tests..."
sh "$ROOT_DIR/.opencode/scripts/run-test-scope.sh" full
`
}

function checkAllGoBody(lintTool?: string): string {
  const lint = lintTool ?? "golangci-lint"
  return `echo "[juninho:check-all] Running formatting checks..."
go vet ./...
if command -v ${lint} >/dev/null 2>&1; then
  ${lint} run
fi

echo "[juninho:check-all] Running repo-wide tests..."
sh "$ROOT_DIR/.opencode/scripts/run-test-scope.sh" full
`
}

function checkAllJavaBody(lintTool?: string): string {
  return `echo "[juninho:check-all] Running formatting checks..."
if [ -x "./gradlew" ]; then
  ${lintTool ? "./gradlew checkstyleMain 2>/dev/null || true\n" : ""}echo "[juninho:check-all] Running repo-wide tests..."
  sh "$ROOT_DIR/.opencode/scripts/run-test-scope.sh" full
  exit 0
fi

if [ -x "./mvnw" ]; then
  ${lintTool ? "./mvnw checkstyle:check 2>/dev/null || true\n" : ""}echo "[juninho:check-all] Running repo-wide tests..."
  sh "$ROOT_DIR/.opencode/scripts/run-test-scope.sh" full
  exit 0
fi

echo "[juninho:check-all] No Java build tool found."
`
}

function checkAllKotlinBody(_lintTool?: string): string {
  return `echo "[juninho:check-all] Running formatting checks..."
if [ -x "./gradlew" ]; then
  ./gradlew ktlintCheck 2>/dev/null || ./gradlew detekt 2>/dev/null || true
fi

echo "[juninho:check-all] Running repo-wide tests..."
sh "$ROOT_DIR/.opencode/scripts/run-test-scope.sh" full
`
}

function checkAllGenericBody(): string {
  return `echo "[juninho:check-all] Running repo-wide tests..."
sh "$ROOT_DIR/.opencode/scripts/run-test-scope.sh" full
`
}

const RUN_TEST_SCOPE_GENERIC_NODE = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TEST_SCOPE="\${1:-}"

if [ -z "$TEST_SCOPE" ]; then
  echo "[juninho:run-test-scope] Missing test scope. Pass related files or 'full'."
  exit 1
fi

has_package_script() {
  [ -f package.json ] || return 1
  node -e "const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); process.exit(pkg.scripts && pkg.scripts[process.argv[1]] ? 0 : 1)" "$1" >/dev/null 2>&1
}

if [ "$TEST_SCOPE" = "full" ]; then
  if has_package_script "check:all"; then
    npm run check:all
    exit 0
  fi
  if has_package_script "test"; then
    npm test -- --runInBand
    exit 0
  fi
fi

if has_package_script "test:related"; then
  npm run test:related -- $TEST_SCOPE
  exit 0
fi

echo "[juninho:run-test-scope] No test scope runner configured."
`

const RUN_TEST_SCOPE_PYTHON = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TEST_SCOPE="\${1:-}"

if [ -z "$TEST_SCOPE" ]; then
  echo "[juninho:run-test-scope] Missing test scope. Pass a file path, expression, or 'full'."
  exit 1
fi

if [ "$TEST_SCOPE" = "full" ]; then
  pytest 2>/dev/null || python -m pytest
  exit 0
fi

pytest $TEST_SCOPE 2>/dev/null || python -m pytest $TEST_SCOPE
`

const RUN_TEST_SCOPE_GO = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TEST_SCOPE="\${1:-}"

if [ -z "$TEST_SCOPE" ] || [ "$TEST_SCOPE" = "full" ]; then
  go test ./...
  exit 0
fi

go test -count=1 $TEST_SCOPE
`

const RUN_TEST_SCOPE_JAVA = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TEST_SCOPE="\${1:-}"

if [ -z "$TEST_SCOPE" ]; then
  echo "[juninho:run-test-scope] Missing test scope. Pass a Maven/Gradle test selector or 'full'."
  exit 1
fi

if [ -x "./gradlew" ]; then
  if [ "$TEST_SCOPE" = "full" ]; then
    ./gradlew test
  else
    ./gradlew test --tests "$TEST_SCOPE" 2>/dev/null || ./gradlew test
  fi
  exit 0
fi

if [ -x "./mvnw" ]; then
  if [ "$TEST_SCOPE" = "full" ]; then
    ./mvnw test
  else
    ./mvnw test -Dtest="$TEST_SCOPE" 2>/dev/null || ./mvnw test
  fi
  exit 0
fi

echo "[juninho:run-test-scope] No Java build tool found."
`

const RUN_TEST_SCOPE_KOTLIN = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TEST_SCOPE="\${1:-}"

if [ -z "$TEST_SCOPE" ]; then
  echo "[juninho:run-test-scope] Missing test scope. Pass a Maven/Gradle test selector or 'full'."
  exit 1
fi

if [ -x "./gradlew" ]; then
  if [ "$TEST_SCOPE" = "full" ]; then
    ./gradlew test
  else
    ./gradlew test --tests "$TEST_SCOPE" 2>/dev/null || ./gradlew test
  fi
  exit 0
fi

if [ -x "./mvnw" ]; then
  if [ "$TEST_SCOPE" = "full" ]; then
    ./mvnw test
  else
    ./mvnw test -Dtest="$TEST_SCOPE" 2>/dev/null || ./mvnw test
  fi
  exit 0
fi

echo "[juninho:run-test-scope] No Kotlin build tool found."
`

const RUN_TEST_SCOPE_GENERIC = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TEST_SCOPE="\${1:-}"

if [ -f package.json ] && [ "$TEST_SCOPE" = "full" ]; then
  npm test 2>/dev/null && exit 0
fi

if command -v pytest >/dev/null 2>&1; then
  if [ "$TEST_SCOPE" = "full" ] || [ -z "$TEST_SCOPE" ]; then
    pytest && exit 0
  fi
  pytest $TEST_SCOPE && exit 0
fi

if [ -f go.mod ]; then
  if [ "$TEST_SCOPE" = "full" ] || [ -z "$TEST_SCOPE" ]; then
    go test ./... && exit 0
  fi
  go test -count=1 $TEST_SCOPE && exit 0
fi

if [ -x "./gradlew" ]; then
  ./gradlew test 2>/dev/null && exit 0
fi

if [ -x "./mvnw" ]; then
  ./mvnw test 2>/dev/null && exit 0
fi

echo "[juninho:run-test-scope] No test scope runner detected."
`

const SCAFFOLD_SPEC_STATE = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
FEATURE_SLUG="\${1:-}"

[ -n "$FEATURE_SLUG" ] || {
  echo "Usage: $0 <feature-slug>" >&2
  exit 1
}

STATE_DIR="$ROOT_DIR/docs/specs/$FEATURE_SLUG/state"
TEMPLATE_PATH="$ROOT_DIR/.opencode/templates/spec-state-readme.md"

mkdir -p "$STATE_DIR/tasks" "$STATE_DIR/sessions"

if [ -f "$TEMPLATE_PATH" ] && [ ! -f "$STATE_DIR/README.md" ]; then
  sed "s/{feature-slug}/$FEATURE_SLUG/g" "$TEMPLATE_PATH" > "$STATE_DIR/README.md"
fi
`

const HARNESS_FEATURE_INTEGRATION = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"
TAB="$(printf '\t')"

if command -v node >/dev/null 2>&1; then
  JS_RUNTIME="node"
elif command -v bun >/dev/null 2>&1; then
  JS_RUNTIME="bun"
else
  echo "[juninho:feature-integration] Missing JavaScript runtime (node or bun)" >&2
  exit 1
fi

fail() {
  echo "[juninho:feature-integration] $*" >&2
  exit 1
}

current_branch() {
  git symbolic-ref --quiet --short HEAD 2>/dev/null || true
}

state_file_path() {
  local_name="$1"
  printf '%s/.opencode/state/%s\n' "$ROOT_DIR" "$local_name"
}

default_base_ref() {
  if git show-ref --verify --quiet "refs/remotes/origin/main"; then
    printf '%s\n' "refs/remotes/origin/main"
    return
  fi
  if git show-ref --verify --quiet "refs/remotes/origin/master"; then
    printf '%s\n' "refs/remotes/origin/master"
    return
  fi

  branch="$(current_branch)"
  [ -n "$branch" ] || fail "Detached HEAD. Provide an explicit base branch."
  printf '%s\n' "$branch"
}

normalize_base_branch() {
  input="$1"
  case "$input" in
    refs/remotes/origin/*)
      printf '%s\n' "\${input#refs/remotes/origin/}"
      ;;
    origin/*)
      printf '%s\n' "\${input#origin/}"
      ;;
    refs/heads/*)
      printf '%s\n' "\${input#refs/heads/}"
      ;;
    *)
      printf '%s\n' "$input"
      ;;
  esac
}

resolve_base_ref() {
  input="$1"
  if [ -z "$input" ]; then
    default_base_ref
    return
  fi

  case "$input" in
    refs/remotes/*|refs/heads/*)
      printf '%s\n' "$input"
      ;;
    origin/*)
      printf '%s\n' "refs/remotes/$input"
      ;;
    *)
      if git show-ref --verify --quiet "refs/remotes/origin/$input"; then
        printf '%s\n' "refs/remotes/origin/$input"
      else
        printf '%s\n' "$input"
      fi
      ;;
  esac
}

task_branch_name() {
  printf 'feature/%s-task-%s' "$1" "$2"
}

find_existing_feature_commit() {
  feature_branch="$1"
  validated_commit="$2"
  git log "$feature_branch" --format='%H' --grep="cherry picked from commit $validated_commit" -n 1 2>/dev/null || true
}

feature_branch_name() {
  printf 'feature/%s' "$1"
}

manifest_path() {
  printf '%s/docs/specs/%s/state/integration-state.json' "$ROOT_DIR" "$1"
}

ensure_manifest_dir() {
  sh "$ROOT_DIR/.opencode/scripts/scaffold-spec-state.sh" "$1"
}

json_read_field() {
  MANIFEST_PATH="$1" FIELD_PATH="$2" "$JS_RUNTIME" - <<'NODE'
const fs = require("fs")

const manifestPath = process.env.MANIFEST_PATH
const fieldPath = process.env.FIELD_PATH || ""

if (!manifestPath || !fs.existsSync(manifestPath)) process.exit(1)

const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
let value = data
for (const key of fieldPath.split(".").filter(Boolean)) {
  if (value == null || !(key in value)) process.exit(1)
  value = value[key]
}

if (value == null) process.exit(1)
if (typeof value === "string") {
  process.stdout.write(value)
  process.exit(0)
}

process.stdout.write(JSON.stringify(value))
NODE
}

parse_active_feature_slug() {
  execution_state="$(state_file_path execution-state.md)"
  [ -f "$execution_state" ] || return 0
  grep "Feature slug" "$execution_state" 2>/dev/null | head -n 1 | cut -d':' -f2 | tr -d ' '
}

cmd="\${1:-}"

case "$cmd" in
  ensure)
    feature_slug="\${2:-}"
    [ -n "$feature_slug" ] || fail "Usage: ensure <feature-slug> [base-branch]"

    base_ref="$(resolve_base_ref "\${3:-}")"
    base_branch="$(normalize_base_branch "$base_ref")"

    ensure_manifest_dir "$feature_slug"
    feature_branch="$(feature_branch_name "$feature_slug")"
    base_sha="$(git rev-parse "$base_ref" 2>/dev/null)" || fail "Unknown base branch/ref: $base_ref"

    if ! git show-ref --verify --quiet "refs/heads/$feature_branch"; then
      git branch "$feature_branch" "$base_sha" >/dev/null
    fi

    manifest="$(manifest_path "$feature_slug")"
    FEATURE_SLUG="$feature_slug" FEATURE_BRANCH="$feature_branch" BASE_BRANCH="$base_branch" BASE_REF="$base_ref" BASE_SHA="$base_sha" MANIFEST_PATH="$manifest" "$JS_RUNTIME" - <<'NODE'
const fs = require("fs")
const path = require("path")

const manifestPath = process.env.MANIFEST_PATH
const featureSlug = process.env.FEATURE_SLUG
const featureBranch = process.env.FEATURE_BRANCH
const baseBranch = process.env.BASE_BRANCH
const baseRef = process.env.BASE_REF
const baseSha = process.env.BASE_SHA

const now = new Date().toISOString()
const next = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {}

const manifest = {
  featureSlug,
  featureBranch,
  baseBranch,
  baseRef,
  baseStartPoint: next.baseStartPoint || baseSha,
  createdAt: next.createdAt || now,
  lastUpdatedAt: now,
  tasks: next.tasks || {},
}

fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8")
NODE

    printf '%s\n' "$feature_branch"
    ;;

  print-task-base)
    feature_slug="\${2:-}"
    depends_csv="\${3:-}"
    [ -n "$feature_slug" ] || fail "Usage: print-task-base <feature-slug> [depends-csv]"

    manifest="$(manifest_path "$feature_slug")"
    [ -f "$manifest" ] || fail "Missing integration manifest: $manifest"

    feature_branch="$(json_read_field "$manifest" "featureBranch")" || fail "Unable to read feature branch"
    base_start_point="$(json_read_field "$manifest" "baseStartPoint")" || fail "Unable to read base start point"

    if [ -n "$depends_csv" ]; then
      DEPENDS_CSV="$depends_csv" MANIFEST_PATH="$manifest" "$JS_RUNTIME" - <<'NODE'
const fs = require("fs")

const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, "utf8"))
for (const dep of (process.env.DEPENDS_CSV || "").split(",").map((value) => value.trim()).filter(Boolean)) {
  const entry = manifest.tasks?.[dep]
  const status = entry?.integration?.status
  if (entry && (!status || status === "pending")) {
    throw new Error("Dependency " + dep + " is not integrated yet")
  }
}
NODE
      printf '%s\n' "$feature_branch"
      exit 0
    fi

    printf '%s\n' "$base_start_point"
    ;;

  prepare-task-branch)
    feature_slug="\${2:-}"
    task_id="\${3:-}"
    depends_csv="\${4:-}"
    worktree_directory="\${5:-}"

    [ -n "$feature_slug" ] || fail "Usage: prepare-task-branch <feature-slug> <task-id> [depends-csv] [worktree-directory]"
    [ -n "$task_id" ] || fail "Missing task id"

    manifest="$(manifest_path "$feature_slug")"
    [ -f "$manifest" ] || fail "Missing integration manifest: $manifest"

    task_branch="$(task_branch_name "$feature_slug" "$task_id")"
    task_base="$(sh "$0" print-task-base "$feature_slug" "$depends_csv")"

    if [ -n "$worktree_directory" ]; then
      if [ -d "$worktree_directory" ]; then
        printf '%s\n' "$task_branch"
        exit 0
      fi

      parent_dir=$(dirname "$worktree_directory")
      [ -d "$parent_dir" ] || fail "Missing worktree parent directory: $parent_dir"

      if git show-ref --verify --quiet "refs/heads/$task_branch"; then
        git worktree add "$worktree_directory" "$task_branch" >/dev/null
      else
        git worktree add -b "$task_branch" "$worktree_directory" "$task_base" >/dev/null
      fi
      printf '%s\n' "$task_branch"
      exit 0
    fi

    if git show-ref --verify --quiet "refs/heads/$task_branch"; then
      git switch "$task_branch" >/dev/null
    else
      git switch -c "$task_branch" "$task_base" >/dev/null
    fi
    printf '%s\n' "$task_branch"
    ;;

  switch)
    feature_slug="\${2:-}"
    [ -n "$feature_slug" ] || fail "Usage: switch <feature-slug>"

    manifest="$(manifest_path "$feature_slug")"
    if [ -f "$manifest" ]; then
      feature_branch="$(json_read_field "$manifest" "featureBranch")" || fail "Unable to read feature branch from $manifest"
    else
      feature_branch="$(feature_branch_name "$feature_slug")"
    fi

    git switch "$feature_branch" >/dev/null
    printf '%s\n' "$feature_branch"
    ;;

  switch-active)
    feature_slug="$(parse_active_feature_slug)"
    [ -n "$feature_slug" ] || exit 0
    sh "$0" switch "$feature_slug"
    ;;

  record-task)
    feature_slug="\${2:-}"
    task_id="\${3:-}"
    task_branch="\${4:-}"
    validated_commit="\${5:-}"
    attempt="\${6:-}"
    worktree_directory="\${7:-}"
    task_label="\${8:-}"

    [ -n "$feature_slug" ] || fail "Usage: record-task <feature-slug> <task-id> <task-branch> <validated-commit> <attempt> [worktree] [label]"
    [ -n "$task_id" ] || fail "Missing task id"
    [ -n "$task_branch" ] || fail "Missing task branch"
    [ -n "$validated_commit" ] || fail "Missing validated commit"
    [ -n "$attempt" ] || fail "Missing attempt"

    manifest="$(manifest_path "$feature_slug")"
    [ -f "$manifest" ] || fail "Missing integration manifest: $manifest"

    task_tip="$(git rev-parse "refs/heads/$task_branch" 2>/dev/null || printf '%s' "$validated_commit")"

    FEATURE_SLUG="$feature_slug" TASK_ID="$task_id" TASK_BRANCH="$task_branch" VALIDATED_COMMIT="$validated_commit" TASK_TIP="$task_tip" TASK_ATTEMPT="$attempt" WORKTREE_DIRECTORY="$worktree_directory" TASK_LABEL="$task_label" MANIFEST_PATH="$manifest" "$JS_RUNTIME" - <<'NODE'
const fs = require("fs")

const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, "utf8"))
const existing = manifest.tasks?.[process.env.TASK_ID]

manifest.tasks = manifest.tasks || {}
manifest.tasks[process.env.TASK_ID] = {
  ...(existing || {}),
  taskID: process.env.TASK_ID,
  taskBranch: process.env.TASK_BRANCH,
  validatedCommit: process.env.VALIDATED_COMMIT,
  taskTip: process.env.TASK_TIP,
  attempt: Number(process.env.TASK_ATTEMPT),
  worktreeDirectory: process.env.WORKTREE_DIRECTORY || "",
  taskLabel: process.env.TASK_LABEL || "",
  recordedAt: new Date().toISOString(),
  integration: existing?.integration || { status: "pending" },
}
manifest.lastUpdatedAt = new Date().toISOString()
fs.writeFileSync(process.env.MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8")
NODE

    printf '%s\n' "$validated_commit"
    ;;

  integrate-task)
    feature_slug="\${2:-}"
    task_id="\${3:-}"

    [ -n "$feature_slug" ] || fail "Usage: integrate-task <feature-slug> <task-id>"
    [ -n "$task_id" ] || fail "Missing task id"

    manifest="$(manifest_path "$feature_slug")"
    [ -f "$manifest" ] || fail "Missing integration manifest: $manifest"

    feature_branch="$(json_read_field "$manifest" "featureBranch")" || fail "Unable to read feature branch"
    validated_commit="$(json_read_field "$manifest" "tasks.$task_id.validatedCommit")" || fail "Task $task_id has no validated commit"
    task_branch="$(json_read_field "$manifest" "tasks.$task_id.taskBranch")" || fail "Task $task_id has no task branch"

    git switch "$feature_branch" >/dev/null

    integration_status="already-contained"
    integration_method="ancestor"
    if git merge-base --is-ancestor "$validated_commit" HEAD; then
      integrated_commit="$validated_commit"
    elif git cherry "$feature_branch" "$validated_commit" 2>/dev/null | grep -q "^- $validated_commit$"; then
      integration_method="patch-equivalent"
      integrated_commit="$(find_existing_feature_commit "$feature_branch" "$validated_commit")"
      if [ -z "$integrated_commit" ]; then
        integrated_commit="$(git rev-parse HEAD)"
      fi
    elif git merge-base --is-ancestor HEAD "$validated_commit"; then
      git merge --ff-only "$validated_commit" >/dev/null
      integration_status="ff-only"
      integration_method="ff-only"
      integrated_commit="$(git rev-parse HEAD)"
    else
      git cherry-pick -x "$validated_commit" >/dev/null
      integration_status="cherry-picked"
      integration_method="cherry-pick"
      integrated_commit="$(git rev-parse HEAD)"
    fi

    TASK_ID="$task_id" INTEGRATED_STATUS="$integration_status" INTEGRATION_METHOD="$integration_method" INTEGRATED_COMMIT="$integrated_commit" FEATURE_BRANCH="$feature_branch" TASK_BRANCH="$task_branch" MANIFEST_PATH="$manifest" "$JS_RUNTIME" - <<'NODE'
const fs = require("fs")

const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, "utf8"))
const task = manifest.tasks?.[process.env.TASK_ID]

if (!task) throw new Error("Task " + process.env.TASK_ID + " is missing from manifest")

task.integration = {
  status: process.env.INTEGRATED_STATUS,
  method: process.env.INTEGRATION_METHOD,
  featureBranch: process.env.FEATURE_BRANCH,
  taskBranch: process.env.TASK_BRANCH,
  integratedAt: new Date().toISOString(),
  integratedCommit: process.env.INTEGRATED_COMMIT,
}
manifest.lastUpdatedAt = new Date().toISOString()
fs.writeFileSync(process.env.MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8")
NODE

    printf '%s\n' "$integrated_commit"
    ;;

  cleanup)
    feature_slug="\${2:-}"
    [ -n "$feature_slug" ] || fail "Usage: cleanup <feature-slug>"

    manifest="$(manifest_path "$feature_slug")"
    [ -f "$manifest" ] || fail "Missing integration manifest: $manifest"

    feature_branch="$(json_read_field "$manifest" "featureBranch")" || fail "Unable to read feature branch"
    git switch "$feature_branch" >/dev/null

    cleanup_rows="$(MANIFEST_PATH="$manifest" "$JS_RUNTIME" - <<'NODE'
const fs = require("fs")

const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, "utf8"))
for (const [taskId, task] of Object.entries(manifest.tasks || {})) {
  if (!task?.integration?.status || task.integration.status === "pending") continue
  process.stdout.write(taskId + "\t" + (task.taskBranch || "") + "\t" + (task.worktreeDirectory || "") + "\n")
}
NODE
    )"

    if [ -n "$cleanup_rows" ]; then
      printf '%s\n' "$cleanup_rows" | while IFS="$TAB" read -r task_id task_branch worktree_directory; do
        if [ -n "$worktree_directory" ] && [ -d "$worktree_directory" ]; then
          git worktree remove "$worktree_directory" >/dev/null
        fi

        if [ -n "$task_branch" ] && [ "$task_branch" != "$feature_branch" ] && git show-ref --verify --quiet "refs/heads/$task_branch"; then
          git branch -d "$task_branch" >/dev/null
        fi
      done
    fi

    MANIFEST_PATH="$manifest" "$JS_RUNTIME" - <<'NODE'
const fs = require("fs")

const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, "utf8"))
for (const task of Object.values(manifest.tasks || {})) {
  if (!task.integration?.status || task.integration.status === "pending") continue
  task.cleanup = {
    status: "done",
    cleanedAt: new Date().toISOString(),
  }
}
manifest.lastUpdatedAt = new Date().toISOString()
fs.writeFileSync(process.env.MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8")
NODE

    printf '%s\n' "$feature_branch"
    ;;

  print-feature-branch)
    feature_slug="\${2:-}"
    [ -n "$feature_slug" ] || fail "Usage: print-feature-branch <feature-slug>"
    manifest="$(manifest_path "$feature_slug")"
    if [ -f "$manifest" ]; then
      json_read_field "$manifest" "featureBranch"
    else
      feature_branch_name "$feature_slug"
    fi
    printf '\n'
    ;;

  print-base-branch)
    feature_slug="\${2:-}"
    [ -n "$feature_slug" ] || fail "Usage: print-base-branch <feature-slug>"
    manifest="$(manifest_path "$feature_slug")"
    [ -f "$manifest" ] || fail "Missing integration manifest: $manifest"
    json_read_field "$manifest" "baseBranch"
    printf '\n'
    ;;

  print-base-ref)
    feature_slug="\${2:-}"
    [ -n "$feature_slug" ] || fail "Usage: print-base-ref <feature-slug>"
    manifest="$(manifest_path "$feature_slug")"
    [ -f "$manifest" ] || fail "Missing integration manifest: $manifest"
    if json_read_field "$manifest" "baseRef" >/dev/null 2>&1; then
      json_read_field "$manifest" "baseRef"
    else
      json_read_field "$manifest" "baseBranch"
    fi
    printf '\n'
    ;;

  *)
    fail "Unknown command: \${cmd:-<empty>}"
    ;;
esac
`

// ─── Build Verify ────────────────────────────────────────────────────────────

function buildVerify(projectType: ProjectType, isKotlin: boolean): string {
  if (projectType === "java") {
    return `#!/bin/sh
set -e

ROOT_DIR="\${TARGET_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT_DIR"

echo "[juninho:build-verify] Running build verification..."

if [ -x "./gradlew" ]; then
  ${isKotlin ? './gradlew compileKotlin compileTestKotlin' : './gradlew compileJava compileTestJava'}
  exit 0
fi

if [ -x "./mvnw" ]; then
  ./mvnw -q -DskipTests compile test-compile
  exit 0
fi

echo "[juninho:build-verify] No build tool found."
exit 1
`
  }

  if (projectType === "go") {
    return `#!/bin/sh
set -e

ROOT_DIR="\${TARGET_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT_DIR"

echo "[juninho:build-verify] Running build verification..."
go build ./...
`
  }

  // Node/Python/Generic — lightweight build check
  return `#!/bin/sh
set -e

ROOT_DIR="\${TARGET_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT_DIR"

echo "[juninho:build-verify] Running build verification..."

if [ -f "package.json" ]; then
  if npm run --silent build --if-present 2>/dev/null; then
    exit 0
  fi
  if npx tsc --noEmit 2>/dev/null; then
    exit 0
  fi
fi

echo "[juninho:build-verify] No build verification available — skipping."
exit 0
`
}

// ─── Install Git Hooks ───────────────────────────────────────────────────────

const INSTALL_GIT_HOOKS = `#!/bin/sh
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HOOKS_DIR="$ROOT_DIR/.git/hooks"
SOURCE_HOOK="$ROOT_DIR/.opencode/hooks/pre-commit"
TARGET_HOOK="$HOOKS_DIR/pre-commit"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "[juninho:install-hooks] Missing git hooks directory: $HOOKS_DIR" >&2
  exit 1
fi

if [ ! -f "$SOURCE_HOOK" ]; then
  echo "[juninho:install-hooks] Missing source hook: $SOURCE_HOOK" >&2
  exit 1
fi

chmod +x "$SOURCE_HOOK"
ln -sf ../../.opencode/hooks/pre-commit "$TARGET_HOOK"
chmod +x "$TARGET_HOOK"

echo "[juninho:install-hooks] Installed pre-commit hook at $TARGET_HOOK"
`
