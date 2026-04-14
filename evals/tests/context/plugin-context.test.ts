import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs"
import path from "path"
import { loadPlugin, PluginHarness } from "../../lib/plugin-harness"
import { createTempDir, removeDir, writeActivePlan, writePersistentContext, installHarness } from "../../lib/test-utils"

let harnessRoot = ""
let tempRoot = ""

beforeAll(() => {
  // Install harness once — we'll reference its plugin files for loading
  harnessRoot = installHarness("node-generic")
})

afterAll(() => {
  if (harnessRoot) removeDir(harnessRoot)
})

beforeEach(() => {
  tempRoot = createTempDir("juninho-context-")
  mkdirSync(path.join(tempRoot, ".opencode", "state"), { recursive: true })
  mkdirSync(path.join(tempRoot, ".opencode", "lib"), { recursive: true })
  mkdirSync(path.join(tempRoot, ".opencode", "skills", "j.test-writing"), { recursive: true })
  mkdirSync(path.join(tempRoot, "docs", "specs", "feature-x"), { recursive: true })
  mkdirSync(path.join(tempRoot, "docs", "specs", "feature-x", "state"), { recursive: true })
  mkdirSync(path.join(tempRoot, "docs", "principles"), { recursive: true })
  mkdirSync(path.join(tempRoot, "docs", "domain"), { recursive: true })
  mkdirSync(path.join(tempRoot, "src", "feature"), { recursive: true })
  mkdirSync(path.join(tempRoot, ".git"), { recursive: true })

  // Write a test plan
  writeFileSync(
    path.join(tempRoot, "docs", "specs", "feature-x", "plan.md"),
    '<plan><tasks><task id="1" wave="1" agent="j.implementer" depends=""><files>src/feature/SampleController.kt</files><action>Implement controller</action><verify>Tests pass</verify><done>Controller exists and handles requests</done></task></tasks></plan>\n',
    "utf-8"
  )

  // Write skill map
  writeFileSync(
    path.join(tempRoot, ".opencode", "skill-map.json"),
    JSON.stringify([{ pattern: "Test\\.kt$", skill: "j.test-writing" }], null, 2) + "\n",
    "utf-8"
  )

  // Write test skill
  writeFileSync(
    path.join(tempRoot, ".opencode", "skills", "j.test-writing", "SKILL.md"),
    "---\nname: j.test-writing\ndescription: test skill\n---\n\n## When this skill activates\nTest files.\n\n## Required Steps\n- Write tests.\n\n## Anti-patterns to avoid\n- No assertions.\n",
    "utf-8"
  )

  // Write a source file
  writeFileSync(
    path.join(tempRoot, "src", "feature", "SampleController.kt"),
    "class SampleController { fun handle() {} }\n",
    "utf-8"
  )

  // Copy lib files from installed harness to temp (plugins need them)
  for (const libFile of ["j.workspace-paths.ts", "j.feature-state-paths.ts", "j.state-paths.ts", "j.juninho-config.ts"]) {
    const src = path.join(harnessRoot, ".opencode", "lib", libFile)
    const dst = path.join(tempRoot, ".opencode", "lib", libFile)
    if (existsSync(src)) {
      writeFileSync(dst, readFileSync(src, "utf-8"))
    }
  }
})

afterEach(() => {
  if (tempRoot) removeDir(tempRoot)
})

async function createHarness(pluginNames: string[]): Promise<PluginHarness> {
  const plugins = []
  for (const name of pluginNames) {
    // Load from the installed harness output
    const pluginPath = path.join(harnessRoot, ".opencode", "plugins", name)
    const loaded = await loadPlugin(pluginPath, tempRoot)
    plugins.push(loaded)
  }
  return new PluginHarness(plugins)
}

describe("context injection plugins", () => {
  test("plan-autoload injects active plan on first chat message and during compaction", async () => {
    writeActivePlan(tempRoot, "docs/specs/feature-x/plan.md")
    const harness = await createHarness(["j.plan-autoload.ts"])

    const chatOutput = { message: {} as { system?: string }, parts: [] as unknown[] }
    await harness.runChatMessage({ sessionID: "s-1" }, chatOutput)
    expect(chatOutput.message.system).toContain("[plan-autoload] Active plan detected")
    expect(chatOutput.message.system).toContain("SampleController.kt")

    const compactOutput = { context: [] as string[] }
    await harness.runCompaction({ sessionID: "s-1" }, compactOutput)
    expect(compactOutput.context.join("\n")).toContain("[plan-autoload] Active plan detected")
  })

  test("memory injects persistent context once per session and re-injects on compaction", async () => {
    writePersistentContext(tempRoot, "Always protect settlement invariants.")
    const harness = await createHarness(["j.memory.ts"])

    const firstOutput = { title: "Read", output: "body", metadata: {} }
    await harness.runToolAfter({ tool: "Read", sessionID: "s-1", callID: "1", args: {} }, firstOutput)
    expect(firstOutput.output).toContain("[memory] Project memory")

    const secondOutput = { title: "Read", output: "body", metadata: {} }
    await harness.runToolAfter({ tool: "Read", sessionID: "s-1", callID: "2", args: {} }, secondOutput)
    expect(secondOutput.output).not.toContain("[memory] Project memory")

    const compactOutput = { context: [] as string[] }
    await harness.runCompaction({ sessionID: "s-1" }, compactOutput)
    expect(compactOutput.context.join("\n")).toContain("Always protect settlement invariants.")
  })

  test("skill injector activates on matching file read", async () => {
    const harness = await createHarness(["j.skill-inject.ts"])
    const filePath = path.join(tempRoot, "src", "feature", "SomeTest.kt")
    writeFileSync(filePath, "class SomeTest {}", "utf-8")

    const output = { title: "Read", output: readFileSync(filePath, "utf-8"), metadata: {} }
    await harness.runToolAfter({ tool: "Read", sessionID: "s-1", callID: "1", args: { file_path: filePath } }, output)
    expect(output.output).toContain("[skill-inject] Skill activated for j.test-writing")
  })

  test("skill injector does not activate on non-matching files", async () => {
    const harness = await createHarness(["j.skill-inject.ts"])
    const filePath = path.join(tempRoot, "src", "feature", "SampleController.kt")

    const output = { title: "Read", output: readFileSync(filePath, "utf-8"), metadata: {} }
    await harness.runToolAfter({ tool: "Read", sessionID: "s-1", callID: "1", args: { file_path: filePath } }, output)
    expect(output.output).not.toContain("[skill-inject]")
  })

  test("env protection blocks sensitive file access", async () => {
    const harness = await createHarness(["j.env-protection.ts"])

    await expect(
      harness.runToolBefore(
        { tool: "Read", sessionID: "s-1", callID: "1" },
        { args: { file_path: path.join(tempRoot, ".env.test") } }
      )
    ).rejects.toThrow("[env-protection] Blocked access to sensitive file")
  })

  test("env protection allows normal file access", async () => {
    const harness = await createHarness(["j.env-protection.ts"])

    // Should not throw
    await harness.runToolBefore(
      { tool: "Read", sessionID: "s-1", callID: "1" },
      { args: { file_path: path.join(tempRoot, "src", "feature", "SampleController.kt") } }
    )
  })

  test("plan autoload includes spec and context contract pointers", async () => {
    writeActivePlan(tempRoot, "docs/specs/feature-x/plan.md")
    const harness = await createHarness(["j.plan-autoload.ts"])
    const output = { message: {} as { system?: string }, parts: [] as unknown[] }

    await harness.runChatMessage({ sessionID: "plan-session" }, output)

    const system = typeof output.message.system === "string" ? output.message.system : ""
    expect(system).toContain("[plan-autoload] Active plan detected at docs/specs/feature-x/plan.md")
    expect(system).toContain("[plan-autoload] Spec contract: docs/specs/feature-x/spec.md")
    expect(system).toContain("[plan-autoload] Context contract: docs/specs/feature-x/CONTEXT.md")
  })

  test("directory-agents-injector walks to project root, not workspace root", async () => {
    // Create a multi-repo-like structure
    const projectRoot = path.join(tempRoot, "org", "my-project")
    mkdirSync(path.join(projectRoot, ".git"), { recursive: true })
    mkdirSync(path.join(projectRoot, "src", "domain"), { recursive: true })
    writeFileSync(path.join(projectRoot, "src", "AGENTS.md"), "# src agents\nDomain rules here.\n", "utf-8")
    writeFileSync(path.join(projectRoot, "src", "domain", "Service.kt"), "class Service {}", "utf-8")

    const harness = await createHarness(["j.directory-agents-injector.ts"])
    const filePath = path.join(projectRoot, "src", "domain", "Service.kt")

    const output = { title: "Read", output: "class Service {}", metadata: {} }
    await harness.runToolAfter(
      { tool: "Read", sessionID: "dag-1", callID: "1", args: { file_path: filePath } },
      output
    )

    expect(output.output).toContain("[directory-agents-injector] Context from src/AGENTS.md")
    expect(output.output).toContain("Domain rules here.")
  })

  test("directory-agents-injector deduplicates per session", async () => {
    const projectRoot = path.join(tempRoot, "org", "dup-project")
    mkdirSync(path.join(projectRoot, ".git"), { recursive: true })
    mkdirSync(path.join(projectRoot, "src", "a"), { recursive: true })
    mkdirSync(path.join(projectRoot, "src", "b"), { recursive: true })
    writeFileSync(path.join(projectRoot, "src", "AGENTS.md"), "# shared src agents\n", "utf-8")
    writeFileSync(path.join(projectRoot, "src", "a", "A.kt"), "class A {}", "utf-8")
    writeFileSync(path.join(projectRoot, "src", "b", "B.kt"), "class B {}", "utf-8")

    const harness = await createHarness(["j.directory-agents-injector.ts"])

    const output1 = { title: "Read", output: "class A {}", metadata: {} }
    await harness.runToolAfter(
      { tool: "Read", sessionID: "dup-1", callID: "1", args: { file_path: path.join(projectRoot, "src", "a", "A.kt") } },
      output1
    )
    expect(output1.output).toContain("[directory-agents-injector]")

    // Same session, different file under same src/ — should NOT re-inject
    const output2 = { title: "Read", output: "class B {}", metadata: {} }
    await harness.runToolAfter(
      { tool: "Read", sessionID: "dup-1", callID: "2", args: { file_path: path.join(projectRoot, "src", "b", "B.kt") } },
      output2
    )
    expect(output2.output).not.toContain("[directory-agents-injector]")
  })

  test("intent-gate warns for out-of-plan writes", async () => {
    writeActivePlan(tempRoot, "docs/specs/feature-x/plan.md")
    const harness = await createHarness(["j.intent-gate.ts"])

    // In-scope write — plan references SampleController.kt
    const inScope = { title: "Edit", output: "ok", metadata: {} }
    await harness.runToolAfter(
      { tool: "Edit", sessionID: "ig-1", callID: "1", args: { file_path: path.join(tempRoot, "src", "feature", "SampleController.kt") } },
      inScope
    )
    expect(inScope.output).not.toContain("[intent-gate]")

    // Out-of-scope write — file not in plan
    const outOfScope = { title: "Edit", output: "ok", metadata: {} }
    await harness.runToolAfter(
      { tool: "Edit", sessionID: "ig-1", callID: "2", args: { file_path: path.join(tempRoot, "src", "feature", "UnrelatedService.kt") } },
      outOfScope
    )
    expect(outOfScope.output).toContain("[intent-gate]")
    expect(outOfScope.output).toContain("SCOPE WARNING")
  })

  test("carl-inject loads principles and domains for task sessions", async () => {
    // Set up principles
    writeFileSync(
      path.join(tempRoot, "docs", "principles", "manifest"),
      [
        "API_STATE=active",
        "API_RECALL=controller,endpoint,api",
        "API_FILE=docs/principles/api-patterns.md",
        "API_PRIORITY=1",
        "API_ALWAYS=true",
        "",
      ].join("\n"),
      "utf-8"
    )
    writeFileSync(
      path.join(tempRoot, "docs", "principles", "api-patterns.md"),
      "# API Patterns\n\nKeep controllers thin. Delegate to services.\n",
      "utf-8"
    )

    // Set up domain
    mkdirSync(path.join(tempRoot, "docs", "domain"), { recursive: true })
    writeFileSync(
      path.join(tempRoot, "docs", "domain", "INDEX.md"),
      "## Orders\nKeywords: order, payment, settlement\nFiles:\n- orders.md — Order lifecycle\n",
      "utf-8"
    )
    writeFileSync(
      path.join(tempRoot, "docs", "domain", "orders.md"),
      "# Orders\n\nOrder lifecycle and settlement rules.\n",
      "utf-8"
    )

    writeActivePlan(tempRoot, "docs/specs/feature-x/plan.md")
    writeFileSync(
      path.join(tempRoot, ".opencode", "state", "execution-state.md"),
      "**Goal**: update payment controller\n- [ ] task: update payment endpoint\n",
      "utf-8"
    )

    const harness = await createHarness(["j.carl-inject.ts"])

    // Simulate a Read of a controller file — should trigger CARL with API principle
    const filePath = path.join(tempRoot, "src", "feature", "SampleController.kt")
    const output = { title: "Read", output: readFileSync(filePath, "utf-8"), metadata: {} }
    await harness.runToolAfter(
      { tool: "Read", sessionID: "carl-1", callID: "1", args: { file_path: filePath } },
      output
    )

    // CARL should inject the API principle (always=true)
    expect(output.output).toContain("[carl-inject]")
    expect(output.output).toContain("API Patterns")
    expect(output.output).toContain("Keep controllers thin")
  })

  test("carl-inject survives compaction", async () => {
    writeFileSync(
      path.join(tempRoot, "docs", "principles", "manifest"),
      "API_STATE=active\nAPI_RECALL=controller\nAPI_FILE=docs/principles/api-patterns.md\nAPI_PRIORITY=1\nAPI_ALWAYS=true\n",
      "utf-8"
    )
    writeFileSync(
      path.join(tempRoot, "docs", "principles", "api-patterns.md"),
      "# API Patterns\nThin controllers.\n",
      "utf-8"
    )

    const harness = await createHarness(["j.carl-inject.ts"])

    // Trigger CARL via Read
    const filePath = path.join(tempRoot, "src", "feature", "SampleController.kt")
    const readOutput = { title: "Read", output: "class SampleController {}", metadata: {} }
    await harness.runToolAfter(
      { tool: "Read", sessionID: "carl-compact", callID: "1", args: { file_path: filePath } },
      readOutput
    )

    // Compaction should preserve injected context
    const compactOutput = { context: [] as string[] }
    await harness.runCompaction({ sessionID: "carl-compact" }, compactOutput)
    expect(compactOutput.context.join("\n")).toContain("Previously injected context")
    expect(compactOutput.context.join("\n")).toContain("API Patterns")
  })

  test("skill-inject deduplicates per session — second read of same skill type does not re-inject", async () => {
    const harness = await createHarness(["j.skill-inject.ts"])

    const file1 = path.join(tempRoot, "src", "feature", "FooTest.kt")
    writeFileSync(file1, "class FooTest {}", "utf-8")
    const file2 = path.join(tempRoot, "src", "feature", "BarTest.kt")
    writeFileSync(file2, "class BarTest {}", "utf-8")

    const output1 = { title: "Read", output: "class FooTest {}", metadata: {} }
    await harness.runToolAfter(
      { tool: "Read", sessionID: "skill-dedup", callID: "1", args: { file_path: file1 } },
      output1
    )
    expect(output1.output).toContain("[skill-inject] Skill activated for j.test-writing")

    const output2 = { title: "Read", output: "class BarTest {}", metadata: {} }
    await harness.runToolAfter(
      { tool: "Read", sessionID: "skill-dedup", callID: "2", args: { file_path: file2 } },
      output2
    )
    // Same session, same skill — should NOT re-inject
    expect(output2.output).not.toContain("[skill-inject]")
  })

  test("skill-inject warns on Write without prior Read", async () => {
    const harness = await createHarness(["j.skill-inject.ts"])

    const filePath = path.join(tempRoot, "src", "feature", "NewTest.kt")
    writeFileSync(filePath, "class NewTest {}", "utf-8")

    const output = { title: "Write", output: "ok", metadata: {} }
    await harness.runToolAfter(
      { tool: "Write", sessionID: "skill-write", callID: "1", args: { file_path: filePath } },
      output
    )
    expect(output.output).toContain("[skill-inject] IMPORTANT")
    expect(output.output).toContain("Read the matching file first")
  })

  test("env-protection blocks multiple sensitive patterns", async () => {
    const harness = await createHarness(["j.env-protection.ts"])

    const sensitiveFiles = [".env", ".env.local", "secrets.json", "credentials.yaml", "id_rsa", "server.key", "cert.pem"]

    for (const file of sensitiveFiles) {
      await expect(
        harness.runToolBefore(
          { tool: "Read", sessionID: `env-${file}`, callID: "1" },
          { args: { file_path: path.join(tempRoot, file) } }
        )
      ).rejects.toThrow("[env-protection]")
    }
  })

  test("plan autoload handles multi-project write targets", async () => {
    const repoA = path.join(tempRoot, "repo-a")
    const repoB = path.join(tempRoot, "repo-b")
    mkdirSync(path.join(repoA, ".git"), { recursive: true })
    mkdirSync(path.join(repoA, "docs", "specs", "feature-x"), { recursive: true })
    mkdirSync(path.join(repoB, ".git"), { recursive: true })
    mkdirSync(path.join(repoB, "docs", "specs", "feature-x"), { recursive: true })
    writeFileSync(path.join(repoA, "docs", "specs", "feature-x", "plan.md"), "<plan><tasks /></plan>\n", "utf-8")
    writeFileSync(path.join(repoB, "docs", "specs", "feature-x", "plan.md"), "<plan><tasks /></plan>\n", "utf-8")
    writeFileSync(
      path.join(tempRoot, ".opencode", "state", "active-plan.json"),
      JSON.stringify({
        slug: "feature-x",
        writeTargets: [
          {
            project: "repo-a",
            targetRepoRoot: repoA,
            planPath: "docs/specs/feature-x/plan.md",
            specPath: "docs/specs/feature-x/spec.md",
            contextPath: "docs/specs/feature-x/CONTEXT.md",
          },
          {
            project: "repo-b",
            targetRepoRoot: repoB,
            planPath: "docs/specs/feature-x/plan.md",
            specPath: "docs/specs/feature-x/spec.md",
            contextPath: "docs/specs/feature-x/CONTEXT.md",
          },
        ],
      }, null, 2) + "\n",
      "utf-8"
    )

    const harness = await createHarness(["j.plan-autoload.ts"])
    const output = { message: {} as { system?: string }, parts: [] as unknown[] }

    await harness.runChatMessage({ sessionID: "multi-plan-session" }, output)

    const system = typeof output.message.system === "string" ? output.message.system : ""
    expect(system).toContain("[plan-autoload] Multi-project write targets:")
    expect(system).toContain("repo-a")
    expect(system).toContain("repo-b")
  })
})
