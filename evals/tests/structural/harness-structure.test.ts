import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, readFileSync, readdirSync } from "fs"
import path from "path"
import { installHarness, removeDir } from "../../lib/test-utils"

let testRoot = ""

beforeAll(() => {
  testRoot = installHarness("node-generic")
})

afterAll(() => {
  if (testRoot) removeDir(testRoot)
})

describe("harness structural contracts", () => {
  test("core plugins exist as active .ts files", () => {
    const pluginsDir = path.join(testRoot, ".opencode", "plugins")
    const required = [
      "j.plan-autoload.ts",
      "j.carl-inject.ts",
      "j.skill-inject.ts",
      "j.directory-agents-injector.ts",
      "j.intent-gate.ts",
      "j.memory.ts",
      "j.env-protection.ts",
      "j.task-runtime.ts",
    ]

    for (const file of required) {
      expect(existsSync(path.join(pluginsDir, file))).toBe(true)
    }
  })

  test("lib utilities exist", () => {
    const libDir = path.join(testRoot, ".opencode", "lib")
    const required = [
      "j.workspace-paths.ts",
      "j.feature-state-paths.ts",
      "j.state-paths.ts",
      "j.juninho-config.ts",
    ]

    for (const file of required) {
      expect(existsSync(path.join(libDir, file))).toBe(true)
    }
  })

  test("plugins import from ../lib/ not from sibling files", () => {
    const pluginsDir = path.join(testRoot, ".opencode", "plugins")
    const pluginsWithLibImports = [
      "j.plan-autoload.ts",
      "j.carl-inject.ts",
      "j.intent-gate.ts",
      "j.task-runtime.ts",
    ]

    for (const file of pluginsWithLibImports) {
      const content = readFileSync(path.join(pluginsDir, file), "utf-8")
      // Should NOT have old-style sibling imports
      expect(content).not.toContain('from "./j.workspace-paths"')
      expect(content).not.toContain('from "./j.state-paths"')
      expect(content).not.toContain('from "./j.feature-state-paths"')
    }
  })

  test("all 12 agents exist", () => {
    const agentsDir = path.join(testRoot, ".opencode", "agents")
    const required = [
      "j.planner.md",
      "j.plan.md",
      "j.plan-reviewer.md",
      "j.spec-writer.md",
      "j.spec.md",
      "j.implementer.md",
      "j.validator.md",
      "j.reviewer.md",
      "j.checker.md",
      "j.unify.md",
      "j.explore.md",
      "j.librarian.md",
    ]

    for (const file of required) {
      expect(existsSync(path.join(agentsDir, file))).toBe(true)
    }
  })

  test("all 14 commands exist", () => {
    const commandsDir = path.join(testRoot, ".opencode", "commands")
    const required = [
      "j.plan.md",
      "j.spec.md",
      "j.implement.md",
      "j.check.md",
      "j.sync-docs.md",
      "j.start-work.md",
      "j.handoff.md",
      "j.ulw-loop.md",
      "j.lint.md",
      "j.test.md",
      "j.pr-review.md",
      "j.status.md",
      "j.unify.md",
      "j.finish-setup.md",
    ]

    for (const file of required) {
      expect(existsSync(path.join(commandsDir, file))).toBe(true)
    }
  })

  test("skill-map.json is valid JSON with entries", () => {
    const mapPath = path.join(testRoot, ".opencode", "skill-map.json")
    expect(existsSync(mapPath)).toBe(true)

    const entries = JSON.parse(readFileSync(mapPath, "utf-8"))
    expect(Array.isArray(entries)).toBe(true)
    expect(entries.length).toBeGreaterThan(0)

    for (const entry of entries) {
      expect(entry.pattern).toBeDefined()
      expect(entry.skill).toBeDefined()
    }
  })

  test("skill-creator skill exists", () => {
    const skillPath = path.join(testRoot, ".opencode", "skills", "skill-creator", "SKILL.md")
    expect(existsSync(skillPath)).toBe(true)
    const content = readFileSync(skillPath, "utf-8")
    expect(content).toContain("skill-creator")
    expect(content).toContain("## When this skill activates")
  })

  test("support scripts exist and are executable", () => {
    const scriptsDir = path.join(testRoot, ".opencode", "scripts")
    const required = [
      "pre-commit.sh",
      "lint-structure.sh",
      "test-related.sh",
      "check-all.sh",
    ]

    for (const file of required) {
      expect(existsSync(path.join(scriptsDir, file))).toBe(true)
    }
  })

  test("templates directory has spec-state-readme", () => {
    const templatePath = path.join(testRoot, ".opencode", "templates", "spec-state-readme.md")
    expect(existsSync(templatePath)).toBe(true)
    const content = readFileSync(templatePath, "utf-8")
    expect(content).toContain("Feature State")
    expect(content).toContain("follow-up task")
  })

  test("juninho-config.json has watchdogSessionStale", () => {
    const configPath = path.join(testRoot, ".opencode", "juninho-config.json")
    expect(existsSync(configPath)).toBe(true)
    const config = JSON.parse(readFileSync(configPath, "utf-8"))
    expect(config.workflow?.implement?.watchdogSessionStale).toBe(true)
  })

  test("state directory has required files", () => {
    const stateDir = path.join(testRoot, ".opencode", "state")
    expect(existsSync(path.join(stateDir, "persistent-context.md"))).toBe(true)
    expect(existsSync(path.join(stateDir, "execution-state.md"))).toBe(true)
    expect(existsSync(path.join(stateDir, "README.md"))).toBe(true)
  })

  test("workspace-paths lib has multi-repo functions", () => {
    const wpPath = path.join(testRoot, ".opencode", "lib", "j.workspace-paths.ts")
    const content = readFileSync(wpPath, "utf-8")
    expect(content).toContain("findContainingProjectRoot")
    expect(content).toContain("loadActivePlanTargets")
    expect(content).toContain("loadActivePlanReferenceProjects")
    expect(content).toContain("discoverWorkspaceProjects")
    expect(content).toContain("resolveProjectPaths")
  })

  test("feature-state-paths has targetRepoRoot hints", () => {
    const fspPath = path.join(testRoot, ".opencode", "lib", "j.feature-state-paths.ts")
    const content = readFileSync(fspPath, "utf-8")
    expect(content).toContain("FeaturePathHints")
    expect(content).toContain("targetRepoRoot")
    expect(content).toContain("contractPath")
  })

  test("agents have multi-repo awareness", () => {
    const agentsDir = path.join(testRoot, ".opencode", "agents")

    // Checker agent exists and mentions multi-repo
    const checker = readFileSync(path.join(agentsDir, "j.checker.md"), "utf-8")
    expect(checker).toContain("write target")

    // Implementer mentions REPO_ROOT
    const impl = readFileSync(path.join(agentsDir, "j.implementer.md"), "utf-8")
    expect(impl.toLowerCase()).toContain("target")
  })

  test("commands have multi-repo awareness", () => {
    const commandsDir = path.join(testRoot, ".opencode", "commands")

    const finishSetup = readFileSync(path.join(commandsDir, "j.finish-setup.md"), "utf-8")
    expect(finishSetup).toContain("project")

    const check = readFileSync(path.join(commandsDir, "j.check.md"), "utf-8")
    expect(check.toLowerCase()).toContain("target")
  })

  test("no utility plugins in plugins directory (moved to lib)", () => {
    const pluginsDir = path.join(testRoot, ".opencode", "plugins")
    // These should NOT exist as plugins — they're in lib/ now
    expect(existsSync(path.join(pluginsDir, "j.state-paths.ts"))).toBe(false)
    expect(existsSync(path.join(pluginsDir, "j.feature-state-paths.ts"))).toBe(false)
    expect(existsSync(path.join(pluginsDir, "j.juninho-config.ts"))).toBe(false)
  })
})
