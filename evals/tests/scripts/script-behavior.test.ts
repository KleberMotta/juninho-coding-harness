import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync, existsSync, statSync } from "fs"
import { execSync } from "child_process"
import path from "path"
import { installHarness, removeDir } from "../../lib/test-utils"

let testRoot = ""

beforeAll(() => {
  testRoot = installHarness("java")
})

afterAll(() => {
  if (testRoot) removeDir(testRoot)
})

describe("support script behavior", () => {
  test("pre-commit.sh sets JUNINHO_STAGED_FILES and calls lint + test", () => {
    const script = readFileSync(path.join(testRoot, ".opencode", "scripts", "pre-commit.sh"), "utf-8")
    expect(script).toContain("JUNINHO_STAGED_FILES")
    expect(script).toContain("lint-structure.sh")
    expect(script).toContain("test-related.sh")
    expect(script).toContain("set -e")
  })

  test("lint-structure.sh has Java/Kotlin detection for java project type", () => {
    const script = readFileSync(path.join(testRoot, ".opencode", "scripts", "lint-structure.sh"), "utf-8")
    // Java project should have gradle or maven lint detection
    expect(
      script.includes("gradlew") || script.includes("mvnw") || script.includes("ktlint") || script.includes("checkstyle")
    ).toBe(true)
    expect(script).toContain("set -e")
  })

  test("check-all.sh runs tests and has error handling", () => {
    const script = readFileSync(path.join(testRoot, ".opencode", "scripts", "check-all.sh"), "utf-8")
    expect(script).toContain("run-test-scope.sh")
    expect(script).toContain("set -e")
    expect(script).toContain("check-all")
  })

  test("build-verify.sh has gradle/maven detection for java type", () => {
    const script = readFileSync(path.join(testRoot, ".opencode", "scripts", "build-verify.sh"), "utf-8")
    expect(script.includes("gradlew") || script.includes("mvnw")).toBe(true)
    expect(script).toContain("set -e")
  })

  test("scaffold-spec-state.sh creates feature state directory structure", () => {
    const script = readFileSync(path.join(testRoot, ".opencode", "scripts", "scaffold-spec-state.sh"), "utf-8")
    expect(script).toContain("tasks")
    expect(script).toContain("sessions")
  })

  test("harness-feature-integration.sh has ensure, record-task, cleanup commands", () => {
    const script = readFileSync(path.join(testRoot, ".opencode", "scripts", "harness-feature-integration.sh"), "utf-8")
    expect(script).toContain("ensure)")
    expect(script).toContain("record-task)")
    expect(script).toContain("cleanup)")
    expect(script).toContain("integrate-task)")
  })

  test("install-git-hooks.sh creates symlink to hooks/pre-commit", () => {
    const script = readFileSync(path.join(testRoot, ".opencode", "scripts", "install-git-hooks.sh"), "utf-8")
    expect(script).toContain("pre-commit")
    expect(script).toContain("ln -sf")
  })

  test("hooks/pre-commit delegates to scripts/pre-commit.sh", () => {
    const hook = readFileSync(path.join(testRoot, ".opencode", "hooks", "pre-commit"), "utf-8")
    expect(hook).toContain("pre-commit.sh")
    expect(hook).toContain("exec")
  })

  test("all scripts are executable", () => {
    const scriptsDir = path.join(testRoot, ".opencode", "scripts")
    const scripts = [
      "pre-commit.sh",
      "lint-structure.sh",
      "test-related.sh",
      "run-test-scope.sh",
      "check-all.sh",
      "scaffold-spec-state.sh",
      "harness-feature-integration.sh",
      "build-verify.sh",
      "install-git-hooks.sh",
    ]

    for (const script of scripts) {
      const scriptPath = path.join(scriptsDir, script)
      if (!existsSync(scriptPath)) continue
      const stats = statSync(scriptPath)
      // Check executable bit (owner execute)
      expect(stats.mode & 0o100).toBeGreaterThan(0)
    }
  })
})

describe("node-generic scripts", () => {
  let nodeRoot = ""

  beforeAll(() => {
    nodeRoot = installHarness("node-generic")
  })

  afterAll(() => {
    if (nodeRoot) removeDir(nodeRoot)
  })

  test("lint-structure.sh has Node.js linting for node-generic type", () => {
    const script = readFileSync(path.join(nodeRoot, ".opencode", "scripts", "lint-structure.sh"), "utf-8")
    expect(
      script.includes("eslint") || script.includes("npm run lint") || script.includes("biome")
    ).toBe(true)
  })

  test("build-verify.sh has Node.js build for node-generic type", () => {
    const script = readFileSync(path.join(nodeRoot, ".opencode", "scripts", "build-verify.sh"), "utf-8")
    expect(
      script.includes("npm") || script.includes("tsc") || script.includes("package.json")
    ).toBe(true)
  })
})
