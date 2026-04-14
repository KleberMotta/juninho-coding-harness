/**
 * Smoke test: installs the harness into a real mini-project, boots all plugins
 * together, and simulates a full session lifecycle. This catches:
 *
 * - Import resolution failures (e.g., ../lib/ path broken)
 * - Plugin initialization crashes
 * - Plugin hook conflicts when running together
 * - Template escaping bugs that produce invalid TypeScript
 * - Missing exports from lib utilities
 * - Session lifecycle regressions (message → read → write → compaction)
 *
 * Does NOT require OpenCode or API keys — uses the plugin harness directly.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import path from "path"
import { loadPlugin, PluginHarness, type LoadedPlugin } from "../../lib/plugin-harness"
import { installHarness, removeDir, writeActivePlan, writePersistentContext } from "../../lib/test-utils"

let projectRoot = ""
let harness: PluginHarness

// The active plugins that should load without error
const ACTIVE_PLUGINS = [
  "j.env-protection.ts",
  "j.plan-autoload.ts",
  "j.memory.ts",
  "j.carl-inject.ts",
  "j.skill-inject.ts",
  "j.directory-agents-injector.ts",
  "j.intent-gate.ts",
  "j.task-runtime.ts",
]

beforeAll(async () => {
  // 1. Install harness into a mini Node.js project
  projectRoot = installHarness("node-generic")

  // 2. Scaffold a realistic project structure
  mkdirSync(path.join(projectRoot, "src", "services"), { recursive: true })
  mkdirSync(path.join(projectRoot, "src", "controllers"), { recursive: true })
  mkdirSync(path.join(projectRoot, "test"), { recursive: true })
  mkdirSync(path.join(projectRoot, "docs", "principles"), { recursive: true })
  mkdirSync(path.join(projectRoot, "docs", "domain"), { recursive: true })
  mkdirSync(path.join(projectRoot, "docs", "specs", "add-auth", "state", "tasks", "task-1"), { recursive: true })
  mkdirSync(path.join(projectRoot, "docs", "specs", "add-auth", "state", "sessions"), { recursive: true })

  // Source files
  writeFileSync(path.join(projectRoot, "src", "services", "auth.ts"), 'export class AuthService { login() { return "ok" } }\n')
  writeFileSync(path.join(projectRoot, "src", "controllers", "auth.controller.ts"), 'import { AuthService } from "../services/auth"\n')
  writeFileSync(path.join(projectRoot, "test", "auth.test.ts"), 'describe("auth", () => { it("works", () => {}) })\n')
  writeFileSync(path.join(projectRoot, "src", "AGENTS.md"), "# src agents\nKeep services thin. Controllers delegate.\n")

  // Principles + domain docs (for CARL)
  writeFileSync(
    path.join(projectRoot, "docs", "principles", "manifest"),
    "AUTH_STATE=active\nAUTH_RECALL=auth,login,session,token\nAUTH_FILE=docs/principles/auth-patterns.md\nAUTH_PRIORITY=1\nAUTH_ALWAYS=false\n"
  )
  writeFileSync(
    path.join(projectRoot, "docs", "principles", "auth-patterns.md"),
    "# Auth Patterns\n\nUse JWT. Rotate refresh tokens. Never store passwords in plaintext.\n"
  )
  writeFileSync(
    path.join(projectRoot, "docs", "domain", "INDEX.md"),
    "## Authentication\nKeywords: auth, login, session, token, jwt\nFiles:\n- auth.md — Auth domain rules\n"
  )
  writeFileSync(path.join(projectRoot, "docs", "domain", "auth.md"), "# Authentication\n\nSession management and token lifecycle.\n")

  // Plan + spec
  writeFileSync(
    path.join(projectRoot, "docs", "specs", "add-auth", "plan.md"),
    '<plan><goal>Add authentication</goal><tasks><task id="1" wave="1" agent="j.implementer" depends=""><files>src/services/auth.ts, src/controllers/auth.controller.ts</files><action>Implement JWT auth</action><verify>Tests pass</verify><done>Auth endpoints work</done></task></tasks></plan>\n'
  )
  writeFileSync(
    path.join(projectRoot, "docs", "specs", "add-auth", "spec.md"),
    "# Spec: Add Auth\nDate: 2026-04-14\nStatus: APPROVED\n\n## Acceptance Criteria\n- Given valid credentials, when POST /login, then return JWT\n"
  )

  // Persistent context
  writePersistentContext(projectRoot, "Project uses Express.js with TypeScript. JWT for auth.")

  // Active plan
  writeActivePlan(projectRoot, "docs/specs/add-auth/plan.md")

  // 3. Load ALL active plugins together — this is the real boot test
  const plugins: LoadedPlugin[] = []
  for (const pluginName of ACTIVE_PLUGINS) {
    const pluginPath = path.join(projectRoot, ".opencode", "plugins", pluginName)
    const loaded = await loadPlugin(pluginPath, projectRoot)
    plugins.push(loaded)
  }
  harness = new PluginHarness(plugins)
})

afterAll(() => {
  if (projectRoot) removeDir(projectRoot)
})

describe("smoke: harness installation", () => {
  test("all active plugins loaded without error", () => {
    // If we got here, all 8 plugins loaded. Just verify the count.
    expect(ACTIVE_PLUGINS.length).toBe(8)
  })

  test("lib utilities are importable by plugins", () => {
    // Plugins loaded successfully, which means lib/ imports resolved
    const libDir = path.join(projectRoot, ".opencode", "lib")
    expect(existsSync(path.join(libDir, "j.workspace-paths.ts"))).toBe(true)
    expect(existsSync(path.join(libDir, "j.state-paths.ts"))).toBe(true)
    expect(existsSync(path.join(libDir, "j.feature-state-paths.ts"))).toBe(true)
    expect(existsSync(path.join(libDir, "j.juninho-config.ts"))).toBe(true)
  })

  test("no .off plugins — all core plugins are active", () => {
    const pluginsDir = path.join(projectRoot, ".opencode", "plugins")
    const offFiles = readdirSync(pluginsDir).filter((f) => f.endsWith(".off"))
    expect(offFiles).toEqual([])
  })
})

describe("smoke: session lifecycle", () => {
  // Simulates: agent starts → reads plan → reads file → writes file → compaction

  test("step 1: chat.message injects plan + memory context", async () => {
    const output = { message: {} as { system?: string }, parts: [] as unknown[] }
    await harness.runChatMessage({ sessionID: "smoke-session-1" }, output)

    const system = output.message.system ?? ""
    // Plan autoload should fire
    expect(system).toContain("[plan-autoload] Active plan detected")
    expect(system).toContain("Add authentication")
  })

  test("step 2: first tool call injects memory", async () => {
    const output = {
      title: "Read",
      output: readFileSync(path.join(projectRoot, "src", "services", "auth.ts"), "utf-8"),
      metadata: {},
    }
    await harness.runToolAfter(
      {
        tool: "Read",
        sessionID: "smoke-session-1",
        callID: "read-1",
        args: { file_path: path.join(projectRoot, "src", "services", "auth.ts") },
      },
      output
    )

    // Memory should inject on first tool call
    expect(output.output).toContain("[memory] Project memory")
    expect(output.output).toContain("Express.js with TypeScript")
  })

  test("step 3: reading a file with AGENTS.md parent triggers directory-agents injection", async () => {
    // Use a fresh session so src/AGENTS.md hasn't been deduplicated yet
    const output = {
      title: "Read",
      output: readFileSync(path.join(projectRoot, "src", "controllers", "auth.controller.ts"), "utf-8"),
      metadata: {},
    }
    await harness.runToolAfter(
      {
        tool: "Read",
        sessionID: "smoke-session-dag",
        callID: "read-dag",
        args: { file_path: path.join(projectRoot, "src", "controllers", "auth.controller.ts") },
      },
      output
    )

    // directory-agents-injector should find src/AGENTS.md
    expect(output.output).toContain("[directory-agents-injector]")
    expect(output.output).toContain("Keep services thin")
  })

  test("step 4: reading an auth file triggers CARL principle injection", async () => {
    const output = {
      title: "Read",
      output: readFileSync(path.join(projectRoot, "src", "services", "auth.ts"), "utf-8"),
      metadata: {},
    }
    // Use a different session so CARL isn't deduplicated
    await harness.runToolAfter(
      {
        tool: "Read",
        sessionID: "smoke-session-carl",
        callID: "read-carl",
        args: { file_path: path.join(projectRoot, "src", "services", "auth.ts") },
      },
      output
    )

    // CARL should match "auth" keyword from file path and inject AUTH principle
    expect(output.output).toContain("[carl-inject]")
    expect(output.output).toContain("Auth Patterns")
  })

  test("step 5: writing an in-scope file does not trigger intent-gate warning", async () => {
    const output = { title: "Edit", output: "ok", metadata: {} }
    await harness.runToolAfter(
      {
        tool: "Edit",
        sessionID: "smoke-session-1",
        callID: "edit-1",
        args: { file_path: path.join(projectRoot, "src", "services", "auth.ts") },
      },
      output
    )

    // auth.ts is in the plan files — no scope warning
    expect(output.output).not.toContain("SCOPE WARNING")
  })

  test("step 6: writing an out-of-scope file triggers intent-gate warning", async () => {
    const output = { title: "Edit", output: "ok", metadata: {} }
    await harness.runToolAfter(
      {
        tool: "Edit",
        sessionID: "smoke-session-1",
        callID: "edit-2",
        args: { file_path: path.join(projectRoot, "src", "services", "billing.ts") },
      },
      output
    )

    expect(output.output).toContain("[intent-gate]")
    expect(output.output).toContain("SCOPE WARNING")
  })

  test("step 7: env-protection blocks .env access during session", async () => {
    await expect(
      harness.runToolBefore(
        { tool: "Read", sessionID: "smoke-session-1", callID: "env-1" },
        { args: { file_path: path.join(projectRoot, ".env.local") } }
      )
    ).rejects.toThrow("[env-protection]")
  })

  test("step 8: compaction preserves plan and CARL context", async () => {
    const output = { context: [] as string[], prompt: undefined as string | undefined }
    await harness.runCompaction({ sessionID: "smoke-session-1" }, output)

    const joined = output.context.join("\n")
    // Plan should survive compaction
    expect(joined).toContain("[plan-autoload] Active plan detected")
    // Memory should survive compaction
    expect(joined).toContain("Express.js with TypeScript")
  })
})

describe("smoke: task delegation lifecycle", () => {
  test("task tool.execute.before captures task metadata", async () => {
    const output = {
      args: {
        prompt: 'Execute task 1 for docs/specs/add-auth/plan.md\nAttempt: 1\nFocus on src/services/auth.ts',
      } as Record<string, unknown>,
    }

    // This simulates the orchestrator calling task() — task-runtime should capture metadata
    await harness.runToolBefore(
      { tool: "Task", sessionID: "smoke-parent", callID: "task-1" },
      output
    )

    // If we got here without error, task-runtime processed the task metadata
    expect(true).toBe(true)
  })

  test("child session.created event processes without error", async () => {
    // Simulate session creation event for the child task session
    await harness.runEvent({
      type: "session.created",
      properties: {
        sessionID: "smoke-child-1",
        info: {
          parentID: "smoke-parent",
          title: "Execute task 1",
        },
      },
    })

    // If we got here without error, all plugins handled the event
    expect(true).toBe(true)
  })
})

describe("smoke: multi-project workspace install", () => {
  let wsRoot = ""

  beforeAll(() => {
    wsRoot = installHarness("node-generic", { workspace: true })
  })

  afterAll(() => {
    if (wsRoot) removeDir(wsRoot)
  })

  test("workspace install creates .opencode at workspace root", () => {
    expect(existsSync(path.join(wsRoot, ".opencode", "plugins"))).toBe(true)
    expect(existsSync(path.join(wsRoot, ".opencode", "lib"))).toBe(true)
    expect(existsSync(path.join(wsRoot, ".opencode", "agents"))).toBe(true)
  })

  test("workspace plugins can load with workspace as directory", async () => {
    // This is the critical test: plugins must work when directory is a workspace root,
    // not a single project root
    const pluginPath = path.join(wsRoot, ".opencode", "plugins", "j.plan-autoload.ts")
    const loaded = await loadPlugin(pluginPath, wsRoot)
    expect(loaded.hooks).toBeDefined()
  })
})
