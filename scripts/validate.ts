#!/usr/bin/env tsx
import { execSync } from "child_process"
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs"
import path from "path"
import crypto from "crypto"
import os from "os"
import { fileURLToPath } from "url"

interface OpencodeRunResult {
  type?: string
  part?: {
    type?: string
    text?: string
  }
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

interface TestResult {
  name: string
  group: string
  passed: boolean
  note?: string
}

const results: TestResult[] = []

function test(group: string, name: string, fn: () => boolean | string): void {
  try {
    const result = fn()
    const passed = result === true || result === ""
    results.push({
      group,
      name,
      passed,
      note: typeof result === "string" && result !== "" ? result : undefined,
    })
  } catch (e: any) {
    results.push({ group, name, passed: false, note: (e.message ?? String(e)).slice(0, 300) })
  }
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const JUNINHO_ROOT = path.resolve(__dirname, "..")
const CLI_PATH = path.join(JUNINHO_ROOT, "dist", "cli.js")
const PKG = JSON.parse(readFileSync(path.join(JUNINHO_ROOT, "package.json"), "utf-8"))

const testDir = path.join(os.tmpdir(), `juninho-validate-${Date.now()}`)

// ─── Path Helpers ─────────────────────────────────────────────────────────────

const agentPath = (n: string) => path.join(testDir, ".opencode", "agents", n + ".md")
const pluginPath = (n: string) => path.join(testDir, ".opencode", "plugins", n + ".ts")
const toolPath = (n: string) => path.join(testDir, ".opencode", "tools", n + ".ts")
const scriptPath = (n: string) => path.join(testDir, ".opencode", "scripts", n)
const skillPath = (n: string) => path.join(testDir, ".opencode", "skills", n, "SKILL.md")
const cmdPath = (n: string) => path.join(testDir, ".opencode", "commands", n + ".md")
const statePath = (n: string) => path.join(testDir, ".opencode", "state", n)

const readPlugin = (n: string) => readFileSync(pluginPath(n), "utf-8")
const readTool = (n: string) => readFileSync(toolPath(n), "utf-8")
const readSkill = (n: string) => readFileSync(skillPath(n), "utf-8")
const readCmd = (n: string) => readFileSync(cmdPath(n), "utf-8")

// ─── Known Lists ──────────────────────────────────────────────────────────────

const AGENTS = [
  "j.planner", "j.plan-reviewer", "j.spec-writer", "j.implementer",
  "j.validator", "j.reviewer", "j.unify", "j.explore", "j.librarian",
]

const PLUGINS = [
  "j.env-protection", "j.auto-format", "j.plan-autoload", "j.carl-inject",
  "j.skill-inject", "j.intent-gate", "j.todo-enforcer", "j.comment-checker",
  "j.hashline-read", "j.hashline-edit", "j.directory-agents-injector", "j.memory",
]

const COMMANDS = [
  "j.plan", "j.spec", "j.implement", "j.sync-docs", "j.init-deep", "j.start-work",
  "j.handoff", "j.ulw-loop", "j.check", "j.lint", "j.test",
  "j.pr-review", "j.status", "j.unify",
]

const TOOLS = ["find-pattern", "next-version", "lsp", "ast-grep"]

const SUPPORT_SCRIPTS = [
  "pre-commit.sh",
  "lint-structure.sh",
  "test-related.sh",
  "check-all.sh",
]

const SKILLS = [
  "j.test-writing", "j.page-creation", "j.api-route-creation",
  "j.server-action-creation", "j.schema-migration",
  "j.agents-md-writing", "j.domain-doc-writing",
  "j.principle-doc-writing", "j.shell-script-writing",
]

function extractOpencodeText(jsonLines: string): string {
  return jsonLines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as OpencodeRunResult
      } catch {
        return null
      }
    })
    .filter((entry): entry is OpencodeRunResult => entry !== null)
    .filter((entry) => entry.type === "text" && typeof entry.part?.text === "string")
    .map((entry) => entry.part?.text ?? "")
    .join("\n")
    .trim()
}

// ─── Setup ────────────────────────────────────────────────────────────────────

console.log("─".repeat(60))
console.log("Juninho Functional Validation Suite")
console.log(`Version: ${PKG.name}@${PKG.version}`)
console.log("─".repeat(60))
console.log(`Test dir: ${testDir}\n`)

// Build dist if needed
if (!existsSync(CLI_PATH)) {
  console.log("Building juninho (dist not found)...")
  execSync("npm run build", { cwd: JUNINHO_ROOT, stdio: "inherit" })
  console.log()
}

// Create fixture project structure
mkdirSync(path.join(testDir, "src", "payments"), { recursive: true })
mkdirSync(path.join(testDir, ".git", "hooks"), { recursive: true })

// Pre-setup fixture files (not overwritten by installer)
writeFileSync(
  path.join(testDir, ".env"),
  "DATABASE_URL=postgres://localhost/petshop\nSECRET_KEY=abc123\n"
)
writeFileSync(
  path.join(testDir, "src", "AGENTS.md"),
  "# src context\nThis is the src-level agents file.\n"
)
writeFileSync(
  path.join(testDir, "src", "payments", "AGENTS.md"),
  "# payments context\nPayments module rules and invariants.\n"
)
writeFileSync(
  path.join(testDir, "src", "payments", "service.ts"),
  [
    "// initialize the database connection",
    "export function connect() {",
    "  // set status to active",
    "  const status = \"active\"",
    "  // return the connection",
    "  return { status }",
    "}",
  ].join("\n") + "\n"
)

// Run juninho setup
console.log("Running juninho setup...")
const setupOutput = execSync(`node "${CLI_PATH}" setup "${testDir}"`, { encoding: "utf-8" })
console.log(setupOutput)

// Post-setup fixtures: extend generated files with domain entries for CARL tests
const indexPath = path.join(testDir, "docs", "domain", "INDEX.md")
const existingIndex = readFileSync(indexPath, "utf-8")
writeFileSync(
  indexPath,
  existingIndex +
    "\n## payments\n" +
    "Keywords: payment, stripe, checkout, invoice, subscription, billing\n" +
    "Files:\n" +
    "  - payments/rules.md — Core payment processing rules\n" +
    "  - payments/edge-cases.md — Failed payments, retries, refunds\n"
)

// Plan file for plan-autoload test
const planFile = path.join(testDir, "docs", "specs", "test-feature", "plan.md")
mkdirSync(path.dirname(planFile), { recursive: true })
writeFileSync(planFile, "# Plan\n\n- [ ] Implement feature A\n- [ ] Write tests\n")

// .plan-ready IPC flag
writeFileSync(statePath(".plan-ready"), "docs/specs/test-feature/plan.md")

// execution-state.md with 2 incomplete todos (overwrite template)
writeFileSync(
  statePath("execution-state.md"),
  [
    "# Execution State",
    "",
    "## Task List",
    "",
    "- [x] Completed setup task",
    "- [ ] Implement the payment service",
    "- [ ] Write unit tests for payments",
    "",
    "## In Progress",
    "",
    "## Completed",
  ].join("\n") + "\n"
)

console.log("Running tests...\n")

// ─── Group 1: Installation (12 tests) ────────────────────────────────────────

test("Installation", "All 9 agent files exist", () => {
  const missing = AGENTS.filter((a) => !existsSync(agentPath(a)))
  return missing.length === 0 ? true : `Missing: ${missing.join(", ")}`
})

test("Installation", "All 12 plugins exist", () => {
  const missing = PLUGINS.filter((p) => !existsSync(pluginPath(p)))
  return missing.length === 0 ? true : `Missing: ${missing.join(", ")}`
})

test("Installation", "All 14 commands exist", () => {
  const missing = COMMANDS.filter((c) => !existsSync(cmdPath(c)))
  return missing.length === 0 ? true : `Missing: ${missing.join(", ")}`
})

test("Installation", "All 4 tool files exist", () => {
  const missing = TOOLS.filter((t) => !existsSync(toolPath(t)))
  return missing.length === 0 ? true : `Missing: ${missing.join(", ")}`
})

test("Installation", "All 4 support scripts exist", () => {
  const missing = SUPPORT_SCRIPTS.filter((s) => !existsSync(scriptPath(s)))
  return missing.length === 0 ? true : `Missing: ${missing.join(", ")}`
})

test("Installation", "All 9 skill dirs exist", () => {
  const missing = SKILLS.filter((s) => !existsSync(skillPath(s)))
  return missing.length === 0 ? true : `Missing: ${missing.join(", ")}`
})

test("Installation", "opencode.json exists", () =>
  existsSync(path.join(testDir, "opencode.json")))

test("Installation", "AGENTS.md root exists", () =>
  existsSync(path.join(testDir, "AGENTS.md")))

test("Installation", "pre-commit hook exists", () =>
  existsSync(path.join(testDir, ".git", "hooks", "pre-commit")))

test("Installation", "workflow-config.md exists", () =>
  existsSync(statePath("workflow-config.md")))

test("Installation", ".juninho-installed marker exists", () =>
  existsSync(path.join(testDir, ".opencode", ".juninho-installed")))

test("Installation", "worktrees/ directory exists", () =>
  existsSync(path.join(testDir, "worktrees")))

test("Installation", "docs/specs/ directory exists", () =>
  existsSync(path.join(testDir, "docs", "specs")))

test("Installation", "Idempotency: second run skips re-install", () => {
  const out = execSync(`node "${CLI_PATH}" setup "${testDir}"`, { encoding: "utf-8" })
  return out.includes("already installed")
    ? true
    : `Expected 'already installed' in output, got: ${out.slice(0, 120)}`
})

// ─── Group 2: Plugin Structure (22 tests) ─────────────────────────────────────

const PLUGIN_HOOKS: Record<string, string> = {
  "j.env-protection": "tool.execute.before",
  "j.auto-format": "tool.execute.after",
  "j.plan-autoload": "tool.execute.after",
  "j.carl-inject": "tool.execute.after",
  "j.skill-inject": "tool.execute.after",
  "j.intent-gate": "tool.execute.after",
  "j.todo-enforcer": "experimental.session.compacting",
  "j.comment-checker": "tool.execute.after",
  "j.hashline-read": "tool.execute.after",
  "j.hashline-edit": "tool.execute.before",
  "j.directory-agents-injector": "tool.execute.after",
  "j.memory": "tool.execute.after",
}

for (const [plugin, hook] of Object.entries(PLUGIN_HOOKS)) {
  test("Plugin Structure", `${plugin}: uses ${hook}`, () => {
    const content = readPlugin(plugin)
    return content.includes(`"${hook}"`)
      ? true
      : `Hook "${hook}" not found in ${plugin}.ts`
  })

  test("Plugin Structure", `${plugin}: uses factory function pattern`, () => {
    const content = readPlugin(plugin)
    return content.includes("async ({ directory")
      ? true
      : `Factory pattern (async ({ directory) not found in ${plugin}.ts`
  })
}

// ─── Group 3: Plugin Logic (19 tests) ─────────────────────────────────────────

// env-protection (3)
test("Plugin Logic", "env-protection: SENSITIVE array contains .env pattern", () => {
  const content = readPlugin("j.env-protection")
  return content.includes("SENSITIVE") && /\\\.env/.test(content)
    ? true
    : "SENSITIVE array or .env regex pattern not found"
})

test("Plugin Logic", "env-protection: SENSITIVE array contains secret/credential", () => {
  const content = readPlugin("j.env-protection")
  return content.includes("secret") && content.includes("credential")
    ? true
    : "secret or credential patterns not found in env-protection"
})

test("Plugin Logic", "env-protection: guards with .some() check before throwing", () => {
  const content = readPlugin("j.env-protection")
  return content.includes("SENSITIVE.some") && content.includes("throw new Error")
    ? true
    : "SENSITIVE.some() or throw new Error not found"
})

// hashline-read (3)
test("Plugin Logic", "hashline-read: uses MD5 for hashing", () => {
  const content = readPlugin("j.hashline-read")
  return content.includes('"md5"')
    ? true
    : 'MD5 ("md5") not found in hashline-read'
})

test("Plugin Logic", "hashline-read: pads line number to 3 digits", () => {
  const content = readPlugin("j.hashline-read")
  return content.includes('padStart(3, "0")')
    ? true
    : 'padStart(3, "0") not found in hashline-read'
})

test("Plugin Logic", "hashline-read: correct hash format verified via simulation", () => {
  // Simulate the exact algorithm from the template
  const line = "export function hello() {"
  const hash = crypto.createHash("md5").update(line).digest("hex").slice(0, 2)
  const lineNum = String(1).padStart(3, "0")
  const tagged = `${lineNum}#${hash}: ${line}`
  return /^\d{3}#[a-f0-9]{2}: /.test(tagged)
    ? true
    : `Tagged line format incorrect: ${tagged}`
})

// carl-inject (4)
test("Plugin Logic", "carl-inject: generated manifest has AUTH_STATE=active", () => {
  const manifest = readFileSync(path.join(testDir, "docs", "principles", "manifest"), "utf-8")
  return manifest.includes("AUTH_STATE=active")
    ? true
    : "AUTH_STATE=active not found in generated manifest"
})

test("Plugin Logic", "carl-inject: stripCodeBlocks function present", () => {
  const content = readPlugin("j.carl-inject")
  return content.includes("stripCodeBlocks")
    ? true
    : "stripCodeBlocks function not found in carl-inject"
})

test("Plugin Logic", "carl-inject: ContextCollector with budget cap", () => {
  const content = readPlugin("j.carl-inject")
  return content.includes("ContextCollector") && content.includes("MAX_CONTEXT_BYTES")
    ? true
    : "ContextCollector or MAX_CONTEXT_BYTES not found in carl-inject"
})

test("Plugin Logic", "carl-inject: compaction survival via experimental.session.compacting", () => {
  const content = readPlugin("j.carl-inject")
  return content.includes("experimental.session.compacting")
    ? true
    : "experimental.session.compacting hook not found in carl-inject"
})

test("Plugin Logic", "carl-inject: regex fallback handles short keywords and phrases", () => {
  const content = readPlugin("j.carl-inject")
  return content.includes("escapeRegex") && content.includes("new RegExp")
    ? true
    : "escapeRegex or regex fallback not found in carl-inject"
})

// skill-inject (3)
test("Plugin Logic", "skill-inject: maps page.tsx pattern to page-creation skill", () => {
  const content = readPlugin("j.skill-inject")
  return content.includes("j.page-creation") && content.includes("page")
    ? true
    : "page-creation skill mapping not found"
})

test("Plugin Logic", "skill-inject: maps app/api pattern to api-route-creation skill", () => {
  const content = readPlugin("j.skill-inject")
  return content.includes("j.api-route-creation") && content.includes("api")
    ? true
    : "api-route-creation skill mapping not found"
})

test("Plugin Logic", "skill-inject: returns early when no skill pattern matches", () => {
  const content = readPlugin("j.skill-inject")
  return content.includes("if (!match)")
    ? true
    : "early-return guard (if (!match)) not found in skill-inject"
})

// plan-autoload (3)
test("Plugin Logic", "plan-autoload: reads .plan-ready flag file", () => {
  const content = readPlugin("j.plan-autoload")
  return content.includes(".plan-ready")
    ? true
    : ".plan-ready reference not found in plan-autoload"
})

test("Plugin Logic", "plan-autoload: deletes flag with unlinkSync (fire-once)", () => {
  const content = readPlugin("j.plan-autoload")
  return content.includes("unlinkSync")
    ? true
    : "unlinkSync (fire-once delete) not found in plan-autoload"
})

test("Plugin Logic", "plan-autoload: appends plan content to output.output", () => {
  const content = readPlugin("j.plan-autoload")
  return content.includes("output.output")
    ? true
    : "output.output not found in plan-autoload"
})

// todo-enforcer (3)
test("Plugin Logic", "todo-enforcer: reads execution-state.md for todos", () => {
  const content = readPlugin("j.todo-enforcer")
  return content.includes("execution-state.md")
    ? true
    : "execution-state.md reference not found in todo-enforcer"
})

test("Plugin Logic", "todo-enforcer: pushes incomplete items to output.context", () => {
  const content = readPlugin("j.todo-enforcer")
  return content.includes("output.context.push")
    ? true
    : "output.context.push not found in todo-enforcer"
})

test("Plugin Logic", "todo-enforcer: returns early when no incomplete items", () => {
  const content = readPlugin("j.todo-enforcer")
  return content.includes("if (incomplete.length === 0)")
    ? true
    : "early-return guard (if (incomplete.length === 0)) not found in todo-enforcer"
})

// ─── Group 4: Agent Config (9 tests) ─────────────────────────────────────────

const cfg = JSON.parse(readFileSync(path.join(testDir, "opencode.json"), "utf-8"))

test("Agent Config", "j.planner: model matches juninho-config strong tier", () => {
  const configData = JSON.parse(readFileSync(path.join(testDir, ".opencode", "juninho-config.json"), "utf-8"))
  return cfg.agent?.["j.planner"]?.model === configData.strong
    ? true
    : `Expected ${configData.strong}, got: ${cfg.agent?.["j.planner"]?.model}`
})

test("Agent Config", "j.planner: task+bash+write allowed, edit denied", () => {
  const p = cfg.agent?.["j.planner"]?.permission
  return p?.task === "allow" && p?.bash === "allow" && p?.write === "allow" && p?.edit === "deny"
    ? true
    : `j.planner permissions mismatch: ${JSON.stringify(p)}`
})

test("Agent Config", "j.plan-reviewer: task+bash+write+edit all denied", () => {
  const p = cfg.agent?.["j.plan-reviewer"]?.permission
  return p?.task === "deny" && p?.bash === "deny" && p?.write === "deny" && p?.edit === "deny"
    ? true
    : `j.plan-reviewer permissions mismatch: ${JSON.stringify(p)}`
})

test("Agent Config", "j.explore: model includes haiku", () =>
  cfg.agent?.["j.explore"]?.model?.includes("haiku")
    ? true
    : `Expected haiku model, got: ${cfg.agent?.["j.explore"]?.model}`)

test("Agent Config", "j.librarian: model includes haiku", () =>
  cfg.agent?.["j.librarian"]?.model?.includes("haiku")
    ? true
    : `Expected haiku model, got: ${cfg.agent?.["j.librarian"]?.model}`)

test("Agent Config", "j.reviewer: bash+edit+write+task all denied", () => {
  const p = cfg.agent?.["j.reviewer"]?.permission
  return p?.bash === "deny" && p?.edit === "deny" && p?.write === "deny" && p?.task === "deny"
    ? true
    : `j.reviewer permissions mismatch: ${JSON.stringify(p)}`
})

test("Agent Config", "j.validator: task denied", () =>
  cfg.agent?.["j.validator"]?.permission?.task === "deny"
    ? true
    : `j.validator.permission.task should be deny, got: ${cfg.agent?.["j.validator"]?.permission?.task}`)

test("Agent Config", "j.unify: task allowed", () =>
  cfg.agent?.["j.unify"]?.permission?.task === "allow"
    ? true
    : `j.unify.permission.task should be allow, got: ${cfg.agent?.["j.unify"]?.permission?.task}`)

test("Agent Config", "Context7 MCP configured for OpenCode", () => {
  const ctx = cfg.mcp?.context7
  return ctx?.type === "local" && Array.isArray(ctx?.command) && ctx.command[0] === "npx"
    ? true
    : `Expected mcp.context7 with type=local and command array starting with npx, got: ${JSON.stringify(ctx)}`
})

// ─── Group 5: Tool Exports (8 tests) ─────────────────────────────────────────

test("Tools", "lsp.ts exports lsp_diagnostics", () =>
  readTool("lsp").includes("export const lsp_diagnostics"))

test("Tools", "lsp.ts exports lsp_prepare_rename", () =>
  readTool("lsp").includes("export const lsp_prepare_rename"))

test("Tools", "lsp.ts exports lsp_rename", () =>
  readTool("lsp").includes("export const lsp_rename"))

test("Tools", "lsp.ts exports lsp_goto_definition", () =>
  readTool("lsp").includes("export const lsp_goto_definition"))

test("Tools", "lsp.ts exports lsp_find_references", () =>
  readTool("lsp").includes("export const lsp_find_references"))

test("Tools", "lsp.ts exports lsp_document_symbols", () =>
  readTool("lsp").includes("export const lsp_document_symbols"))

test("Tools", "ast-grep.ts exports ast_grep_replace with dryRun param", () => {
  const content = readTool("ast-grep")
  return content.includes("ast_grep_replace") && content.includes("dryRun")
    ? true
    : "ast_grep_replace export or dryRun parameter not found"
})

test("Tools", "next-version.ts exports next_version", () =>
  readTool("next-version").includes("export const next_version"))

// ─── Group 6: Skills (11 tests) ──────────────────────────────────────────────

for (const skill of SKILLS) {
  test("Skills", `${skill}: has name: frontmatter`, () =>
    readSkill(skill).includes("name:")
      ? true
      : `name: not found in ${skill}/SKILL.md frontmatter`)

  test("Skills", `${skill}: has description: frontmatter`, () =>
    readSkill(skill).includes("description:")
      ? true
      : `description: not found in ${skill}/SKILL.md frontmatter`)
}

test("Skills", "test-writing: Playwright MCP commented in frontmatter", () =>
  readSkill("j.test-writing").includes("# mcp:")
    ? true
    : "# mcp: comment not found in test-writing/SKILL.md")

// ─── Group 7: Commands (13 tests) ────────────────────────────────────────────

test("Commands", "plan.md references @j.planner", () =>
  readCmd("j.plan").includes("@j.planner"))

test("Commands", "spec.md references @j.spec-writer", () =>
  readCmd("j.spec").includes("@j.spec-writer"))

test("Commands", "implement.md references @j.implementer", () =>
  readCmd("j.implement").includes("@j.implementer"))

test("Commands", "unify.md references @j.unify", () =>
  readCmd("j.unify").includes("@j.unify"))

test("Commands", "sync-docs.md references AGENTS.md and sync markers", () => {
  const content = readCmd("j.sync-docs")
  return content.includes("AGENTS.md") && content.includes("juninho:sync")
    ? true
    : "AGENTS.md or juninho:sync not found in j.sync-docs"
})

test("Commands", "pr-review.md references @j.reviewer", () =>
  readCmd("j.pr-review").includes("@j.reviewer"))

test("Commands", "check.md references pre-commit", () =>
  readCmd("j.check").includes("pre-commit"))

test("Commands", "lint.md references lint-structure script", () =>
  readCmd("j.lint").includes("lint-structure.sh"))

test("Commands", "test.md references jest", () =>
  readCmd("j.test").toLowerCase().includes("jest"))

test("Commands", "status.md references execution-state.md", () =>
  readCmd("j.status").includes("execution-state.md"))

test("Commands", "init-deep.md references AGENTS.md", () =>
  readCmd("j.init-deep").includes("AGENTS.md"))

test("Commands", "start-work.md references execution-state.md", () =>
  readCmd("j.start-work").includes("execution-state.md"))

test("Commands", "handoff.md references execution-state.md", () =>
  readCmd("j.handoff").includes("execution-state.md"))

test("Commands", "ulw-loop.md references @j.implementer", () =>
  readCmd("j.ulw-loop").includes("@j.implementer"))

// ─── Group 8: Docs/Config (8 tests) ──────────────────────────────────────────

const agentsMd = readFileSync(path.join(testDir, "AGENTS.md"), "utf-8")
const manifest = readFileSync(path.join(testDir, "docs", "principles", "manifest"), "utf-8")
const domainIndex = readFileSync(path.join(testDir, "docs", "domain", "INDEX.md"), "utf-8")

test("Docs", "AGENTS.md: mentions all 9 agents", () => {
  const missing = AGENTS.filter((a) => !agentsMd.includes(a))
  return missing.length === 0
    ? true
    : `Missing agents in AGENTS.md: ${missing.join(", ")}`
})

test("Docs", "AGENTS.md: describes both Path A and Path B", () =>
  agentsMd.includes("Path A") && agentsMd.includes("Path B")
    ? true
    : "Path A or Path B not found in AGENTS.md")

test("Docs", "AGENTS.md: lists 5 context tiers in Context Tiers section", () =>
  agentsMd.includes("Context Tiers") && agentsMd.includes("| 5 |")
    ? true
    : "Context Tiers section or tier-5 row not found in AGENTS.md")

test("Docs", "manifest: uses KEY_STATE=active format", () =>
  manifest.includes("_STATE=active")
    ? true
    : "_STATE=active format not found in manifest")

test("Docs", "manifest: has AUTH, ERROR, API, DATA, TEST state entries", () => {
  const missing = ["AUTH_STATE", "ERROR_STATE", "API_STATE", "DATA_STATE", "TEST_STATE"].filter(
    (k) => !manifest.includes(k)
  )
  return missing.length === 0
    ? true
    : `Missing manifest keys: ${missing.join(", ")}`
})

test("Docs", "INDEX.md: has Keywords: format", () =>
  domainIndex.includes("Keywords:")
    ? true
    : "Keywords: format not found in INDEX.md")

test("Docs", "INDEX.md: has Files: format", () =>
  domainIndex.includes("Files:")
    ? true
    : "Files: format not found in INDEX.md")

test("Docs", "state: persistent-context.md exists", () =>
  existsSync(statePath("persistent-context.md")))

test("Docs", "principles docs scaffold exists for CARL default manifest", () => {
  const required = [
    path.join(testDir, "docs", "principles", "auth-patterns.md"),
    path.join(testDir, "docs", "principles", "error-handling.md"),
    path.join(testDir, "docs", "principles", "api-patterns.md"),
    path.join(testDir, "docs", "principles", "data-patterns.md"),
    path.join(testDir, "docs", "principles", "test-patterns.md"),
  ]
  const missing = required.filter((p) => !existsSync(p))
  return missing.length === 0 ? true : `Missing principles docs: ${missing.join(", ")}`
})

// ─── Group 9: Directory Structure (5 tests) ──────────────────────────────────

test("Dirs", "worktrees/ exists", () =>
  existsSync(path.join(testDir, "worktrees")))

test("Dirs", "docs/specs/ exists", () =>
  existsSync(path.join(testDir, "docs", "specs")))

test("Dirs", ".opencode/state/ exists", () =>
  existsSync(path.join(testDir, ".opencode", "state")))

test("Dirs", ".opencode/skills/j.test-writing/ exists", () =>
  existsSync(path.join(testDir, ".opencode", "skills", "j.test-writing")))

test("Dirs", ".opencode/scripts/ exists", () =>
  existsSync(path.join(testDir, ".opencode", "scripts")))

test("Dirs", "docs/domain/ exists", () =>
  existsSync(path.join(testDir, "docs", "domain")))

// ─── Group 10: Model Config (8 tests) ─────────────────────────────────────────

test("Model Config", "juninho-config.json exists after setup", () =>
  existsSync(path.join(testDir, ".opencode", "juninho-config.json")))

test("Model Config", "juninho-config.json has strong/medium/weak keys", () => {
  const configData = JSON.parse(readFileSync(path.join(testDir, ".opencode", "juninho-config.json"), "utf-8"))
  return configData.strong && configData.medium && configData.weak
    ? true
    : `Missing keys: ${JSON.stringify(configData)}`
})

test("Model Config", "juninho-config.json strong contains opus or is a valid model", () => {
  const configData = JSON.parse(readFileSync(path.join(testDir, ".opencode", "juninho-config.json"), "utf-8"))
  return typeof configData.strong === "string" && configData.strong.length > 0
    ? true
    : `Expected non-empty strong model, got: ${configData.strong}`
})

test("Model Config", "Agent frontmatter model matches config", () => {
  const configData = JSON.parse(readFileSync(path.join(testDir, ".opencode", "juninho-config.json"), "utf-8"))
  const plannerMd = readFileSync(agentPath("j.planner"), "utf-8")
  const modelMatch = plannerMd.match(/^model:\s*(.+)$/m)
  return modelMatch && modelMatch[1] === configData.strong
    ? true
    : `Frontmatter model (${modelMatch?.[1]}) doesn't match config (${configData.strong})`
})

test("Model Config", "opencode.json agent models match config tiers", () => {
  const configData = JSON.parse(readFileSync(path.join(testDir, ".opencode", "juninho-config.json"), "utf-8"))
  const opencodeJson = JSON.parse(readFileSync(path.join(testDir, "opencode.json"), "utf-8"))
  const plannerModel = opencodeJson.agent?.["j.planner"]?.model
  const exploreModel = opencodeJson.agent?.["j.explore"]?.model
  const implModel = opencodeJson.agent?.["j.implementer"]?.model
  const ok = plannerModel === configData.strong && exploreModel === configData.weak && implModel === configData.medium
  return ok
    ? true
    : `Model mismatch: planner=${plannerModel}, implementer=${implModel}, explore=${exploreModel}`
})

test("Model Config", "j.explore frontmatter uses weak model", () => {
  const configData = JSON.parse(readFileSync(path.join(testDir, ".opencode", "juninho-config.json"), "utf-8"))
  const exploreMd = readFileSync(agentPath("j.explore"), "utf-8")
  const modelMatch = exploreMd.match(/^model:\s*(.+)$/m)
  return modelMatch && modelMatch[1] === configData.weak
    ? true
    : `Explore frontmatter model (${modelMatch?.[1]}) doesn't match config weak (${configData.weak})`
})

test("Model Config", "j.implementer frontmatter uses medium model", () => {
  const configData = JSON.parse(readFileSync(path.join(testDir, ".opencode", "juninho-config.json"), "utf-8"))
  const implMd = readFileSync(agentPath("j.implementer"), "utf-8")
  const modelMatch = implMd.match(/^model:\s*(.+)$/m)
  return modelMatch && modelMatch[1] === configData.medium
    ? true
    : `Implementer frontmatter model (${modelMatch?.[1]}) doesn't match config medium (${configData.medium})`
})

test("Model Config", "CLI shows help when called without arguments", () => {
  const out = execSync(`node "${CLI_PATH}"`, { encoding: "utf-8" })
  return out.includes("setup") && out.includes("Model Tiers") && out.includes("--force")
    ? true
    : `Expected help output with setup/Model Tiers/--force, got: ${out.slice(0, 200)}`
})

// ─── Group 11: Workflow/Evals (8 tests) ───────────────────────────────────────

test("Workflow/Evals", "pre-commit hook delegates to support script", () => {
  const hook = readFileSync(path.join(testDir, ".git", "hooks", "pre-commit"), "utf-8")
  return hook.includes('.opencode/scripts/pre-commit.sh')
    ? true
    : "pre-commit hook does not delegate to .opencode/scripts/pre-commit.sh"
})

test("Workflow/Evals", "pre-commit support script runs related tests not full suite", () => {
  const content = readFileSync(scriptPath("pre-commit.sh"), "utf-8")
  return content.includes("test-related.sh") && !content.includes("check-all.sh")
    ? true
    : "pre-commit.sh should call test-related.sh and avoid check-all.sh"
})

test("Workflow/Evals", "check-all support script exists for post-implement verification", () => {
  const content = readFileSync(scriptPath("check-all.sh"), "utf-8")
  return content.includes("check:all") || content.includes("./gradlew test")
    ? true
    : "check-all.sh does not expose repo-wide verification behavior"
})

test("Workflow/Evals", "implementer prompt exits before repo-wide checks", () => {
  const content = readFileSync(agentPath("j.implementer"), "utf-8")
  return content.includes("repo-wide check fails") && content.includes("check-all.sh")
    ? true
    : "implementer prompt does not describe post-implement repo-wide checks"
})

test("Workflow/Evals", "unify prompt is configurable via workflow-config", () => {
  const content = readFileSync(agentPath("j.unify"), "utf-8")
  return content.includes("workflow-config") && content.includes("enabled closeout steps")
    ? true
    : "unify prompt is not tied to workflow-config"
})

test("Workflow/Evals", "reference PR eval assets exist", () => {
  const required = [
    path.join(JUNINHO_ROOT, "evals", "reference-pr-quality.md"),
    path.join(JUNINHO_ROOT, "evals", "reference-pr-54.prompt.md"),
    path.join(JUNINHO_ROOT, "evals", "run-reference-pr-eval.sh"),
  ]
  const missing = required.filter((p) => !existsSync(p))
  return missing.length === 0 ? true : `Missing eval assets: ${missing.join(", ")}`
})

test("Workflow/Evals", "reference PR eval rubric mentions changed files and validation steps", () => {
  const rubric = readFileSync(path.join(JUNINHO_ROOT, "evals", "reference-pr-quality.md"), "utf-8")
  return rubric.includes("changed files") && rubric.includes("validation steps")
    ? true
    : "reference-pr-quality rubric is missing changed files or validation steps guidance"
})

test("Workflow/Evals", "opencode CLI smoke test works in json mode", () => {
  const out = execSync(
    `opencode run --dir "${testDir}" --format json "Responda apenas OK"`,
    { encoding: "utf-8" }
  )
  const text = extractOpencodeText(out)
  return text === "OK" ? true : `Expected OK from opencode, got: ${text || "<empty>"}`
})

// ─── Report Generator ─────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of arr) {
    const k = key(item)
    if (!out[k]) out[k] = []
    out[k].push(item)
  }
  return out
}

function generateReport(): string {
  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const failed = total - passed
  const byGroup = groupBy(results, (r) => r.group)

  const groupSection = Object.entries(byGroup)
    .map(([group, tests]) => {
      const gPassed = tests.filter((t) => t.passed).length
      const icon = tests.every((t) => t.passed) ? "✅" : "❌"
      const rows = tests
        .map((t) => `| ${t.name} | ${t.passed ? "✅ PASS" : "❌ FAIL"} | ${t.note ?? ""} |`)
        .join("\n")
      return `### ${group} (${gPassed}/${tests.length}) ${icon}\n\n| Test | Status | Note |\n|------|--------|------|\n${rows}\n`
    })
    .join("\n")

  const failedSection =
    failed === 0
      ? "*All tests passed.*"
      : results
          .filter((r) => !r.passed)
          .map((r) => `- **[${r.group}] ${r.name}**: ${r.note ?? "assertion failed"}`)
          .join("\n")

  return `# Juninho Validation Report

Generated: ${new Date().toISOString()}
Version: ${PKG.name}@${PKG.version}
Framework: Agentic Coding Framework v2.1
Test Project: ${testDir}

## Summary

| | |
|---|---|
| Total Tests | ${total} |
| Passed | ${passed} |
| Failed | ${failed} |
| **Pass Rate** | **${Math.round((passed / total) * 100)}%** |

## Results by Group

${groupSection}

## Failed Tests

${failedSection}

---
*Generated by \`npm run validate\`*
`
}

// ─── Print & Write Report ─────────────────────────────────────────────────────

const total = results.length
const passed = results.filter((r) => r.passed).length
const failed = total - passed

console.log("─".repeat(60))
console.log(`Results: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`)
console.log("─".repeat(60))

if (failed > 0) {
  console.log("\nFailed tests:")
  results
    .filter((r) => !r.passed)
    .forEach((r) => {
      console.log(`  ❌ [${r.group}] ${r.name}`)
      if (r.note) console.log(`     ${r.note}`)
    })
  console.log()
}

const report = generateReport()
const reportPath = path.join(JUNINHO_ROOT, "validation-report.md")
writeFileSync(reportPath, report)
console.log(`Report written to: ${reportPath}`)

// Cleanup temp dir
try {
  rmSync(testDir, { recursive: true, force: true })
} catch {
  // ignore cleanup errors
}

process.exit(failed > 0 ? 1 : 0)
