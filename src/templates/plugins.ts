import { writeFileSync } from "fs"
import path from "path"

export function writePlugins(projectDir: string): void {
  const pluginsDir = path.join(projectDir, ".opencode", "plugins")

  writeFileSync(path.join(pluginsDir, "j.env-protection.ts"), ENV_PROTECTION)
  writeFileSync(path.join(pluginsDir, "j.auto-format.ts"), AUTO_FORMAT)
  writeFileSync(path.join(pluginsDir, "j.plan-autoload.ts"), PLAN_AUTOLOAD)
  writeFileSync(path.join(pluginsDir, "j.carl-inject.ts"), CARL_INJECT)
  writeFileSync(path.join(pluginsDir, "j.skill-inject.ts"), SKILL_INJECT)
  writeFileSync(path.join(pluginsDir, "j.intent-gate.ts"), INTENT_GATE)
  writeFileSync(path.join(pluginsDir, "j.todo-enforcer.ts"), TODO_ENFORCER)
  writeFileSync(path.join(pluginsDir, "j.comment-checker.ts"), COMMENT_CHECKER)
  writeFileSync(path.join(pluginsDir, "j.hashline-read.ts"), HASHLINE_READ)
  writeFileSync(path.join(pluginsDir, "j.hashline-edit.ts"), HASHLINE_EDIT)
  writeFileSync(path.join(pluginsDir, "j.directory-agents-injector.ts"), DIR_AGENTS_INJECTOR)
  writeFileSync(path.join(pluginsDir, "j.memory.ts"), MEMORY)
}

// ─── Env Protection ──────────────────────────────────────────────────────────

const ENV_PROTECTION = `import type { Plugin } from "@opencode-ai/plugin"

// Blocks reads/writes of sensitive files before any tool executes.
// Real API: tool.execute.before(input, output) — throw Error to abort.

const SENSITIVE = [
  /\\.env($|\\.)/i,
  /secret/i,
  /credential/i,
  /\\.pem$/i,
  /id_rsa/i,
  /\\.key$/i,
]

export default (async ({ directory: _directory }: { directory: string }) => ({
  "tool.execute.before": async (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: any }
  ) => {
    const filePath: string =
      output.args?.path ?? output.args?.file_path ?? output.args?.filename ?? ""
    if (!filePath) return

    if (SENSITIVE.some((p) => p.test(filePath))) {
      throw new Error(
        \`[env-protection] Blocked access to sensitive file: \${filePath}\\n\` +
        \`If intentional, temporarily disable the env-protection plugin.\`
      )
    }
  },
})) satisfies Plugin
`

// ─── Auto Format ─────────────────────────────────────────────────────────────

const AUTO_FORMAT = `import type { Plugin } from "@opencode-ai/plugin"
import { execSync } from "child_process"
import path from "path"

// Auto-formats files after Write/Edit tool calls.
// Real API: tool.execute.after(input, output) — input.args has the file path.

const FORMATTERS: Record<string, string> = {
  ".ts": "prettier --write",
  ".tsx": "prettier --write",
  ".js": "prettier --write",
  ".jsx": "prettier --write",
  ".json": "prettier --write",
  ".css": "prettier --write",
  ".scss": "prettier --write",
  ".md": "prettier --write",
  ".py": "black",
  ".go": "gofmt -w",
  ".rs": "rustfmt",
}

export default (async ({ directory: _directory }: { directory: string }) => ({
  "tool.execute.after": async (
    input: { tool: string; sessionID: string; callID: string; args: any },
    _output: { title: string; output: string; metadata: any }
  ) => {
    if (!["Write", "Edit", "MultiEdit"].includes(input.tool)) return

    const filePath: string = input.args?.path ?? input.args?.file_path ?? ""
    if (!filePath) return

    const formatter = FORMATTERS[path.extname(filePath)]
    if (!formatter) return

    try {
      execSync(\`\${formatter} "\${filePath}"\`, { stdio: "ignore" })
    } catch {
      // Formatter not available — skip silently
    }
  },
})) satisfies Plugin
`

// ─── Plan Autoload ────────────────────────────────────────────────────────────

const PLAN_AUTOLOAD = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync, unlinkSync } from "fs"
import path from "path"

// Injects active plan into agent context when a .plan-ready IPC flag exists.
// Uses tool.execute.after on Read — the first Read triggers plan injection.
// Also uses experimental.session.compacting to survive session compaction.
// The .plan-ready flag is deleted after first injection (fire-once).

export default (async ({ directory }: { directory: string }) => {
  let planInjected = false

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      if (input.tool !== "Read" || planInjected) return

      const readyFile = path.join(directory, ".opencode", "state", ".plan-ready")
      if (!existsSync(readyFile)) return

      const planPath = readFileSync(readyFile, "utf-8").trim()
      const fullPath = path.isAbsolute(planPath) ? planPath : path.join(directory, planPath)
      if (!existsSync(fullPath)) return

      const planContent = readFileSync(fullPath, "utf-8")
      planInjected = true

      try { unlinkSync(readyFile) } catch { /* ok */ }

      output.output +=
        \`\\n\\n[plan-autoload] Active plan detected at \${planPath}:\\n\\n\${planContent}\\n\\n\` +
        \`Use /j.implement to execute this plan, or /j.plan to revise it.\`
    },

    "experimental.session.compacting": async (
      _input: { sessionID?: string },
      output: { context: string[] }
    ) => {
      // Ensure plan survives session compaction
      const readyFile = path.join(directory, ".opencode", "state", ".plan-ready")
      if (existsSync(readyFile)) {
        const planPath = readFileSync(readyFile, "utf-8").trim()
        const fullPath = path.isAbsolute(planPath) ? planPath : path.join(directory, planPath)
        if (existsSync(fullPath)) {
          const planContent = readFileSync(fullPath, "utf-8")
          output.context.push(
            \`[plan-autoload] Active plan at \${planPath}:\\n\\n\${planContent}\`
          )
        }
      }
    },
  }
}) satisfies Plugin
`

// ─── CARL Inject ──────────────────────────────────────────────────────────────

const CARL_INJECT = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import path from "path"

// CARL v2 = Context-Aware Retrieval Layer
// Content-aware keyword detection inspired by oh-my-opencode.
// Two hooks:
//   tool.execute.after (Read) — extracts keywords from FILE CONTENT (not just
//     path) after stripping code blocks. On first trigger per session, also
//     reads execution-state.md for task-awareness. Injects matching principles
//     and domain docs into the Read output.
//   experimental.session.compacting — re-injects all collected docs so they
//     survive context window resets.
//
// Key improvements over v1:
//   - Analyzes stripped file content for keyword matching (understands context)
//   - Word-boundary regex matching (prevents "auth" matching "authorize")
//   - Task-awareness from execution-state.md (understands the goal)
//   - Budget cap prevents context overflow
//   - Compaction survival via second hook

// ── Types ──

interface PrincipleEntry {
  key: string
  recall: string[]
  file: string
  priority: number
}

interface DomainEntry {
  domain: string
  keywords: string[]
  files: Array<{ path: string; description: string }>
}

interface CollectedEntry {
  content: string
  priority: number
  type: "principle" | "domain"
  label: string
}

// ── Parsing ──

function parsePrinciplesManifest(content: string): PrincipleEntry[] {
  const entries: PrincipleEntry[] = []
  const lines = content.split("\\n").filter((l) => !l.startsWith("#") && l.trim())

  const byKey: Record<string, Record<string, string>> = {}
  for (const line of lines) {
    const match = /^([A-Z_]+)_(STATE|RECALL|FILE|PRIORITY)=(.*)$/.exec(line)
    if (!match) continue
    const [, prefix, field, value] = match
    if (!byKey[prefix]) byKey[prefix] = {}
    byKey[prefix][field] = value.trim()
  }

  for (const [key, fields] of Object.entries(byKey)) {
    if (fields["STATE"] !== "active") continue
    if (!fields["RECALL"] || !fields["FILE"]) continue
    entries.push({
      key,
      recall: fields["RECALL"].split(",").map((k) => k.trim().toLowerCase()),
      file: fields["FILE"],
      priority: parseInt(fields["PRIORITY"] ?? "1", 10),
    })
  }

  return entries
}

function parseDomainIndex(content: string): DomainEntry[] {
  const entries: DomainEntry[] = []
  const sections = content.split(/^## /m).slice(1)

  for (const section of sections) {
    const lines = section.split("\\n")
    const domain = lines[0].trim()
    const keywordsLine = lines.find((l) => l.startsWith("Keywords:"))
    const filesStart = lines.findIndex((l) => l.startsWith("Files:"))

    if (!keywordsLine || filesStart === -1) continue

    const keywords = keywordsLine
      .replace("Keywords:", "")
      .split(",")
      .map((k) => k.trim().toLowerCase())

    const files: Array<{ path: string; description: string }> = []
    for (let i = filesStart + 1; i < lines.length; i++) {
      const fileMatch = /^\\s+-\\s+([^—]+)(?:—\\s+(.*))?$/.exec(lines[i])
      if (!fileMatch) break
      files.push({ path: fileMatch[1].trim(), description: fileMatch[2]?.trim() ?? "" })
    }

    entries.push({ domain, keywords, files })
  }

  return entries
}

// ── Content Analysis (oh-my-opencode style) ──

function stripCodeBlocks(text: string): string {
  // Remove fenced code blocks and inline code (backtick-wrapped)
  // Prevents false keyword matches from variable names, imports, etc.
  let stripped = text.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, "")
  stripped = stripped.replace(/\`[^\`\\n]+\`/g, "")
  return stripped
}

function extractKeywords(text: string): Set<string> {
  // Extract meaningful words from text (stripped of code) for matching
  const words = new Set<string>()
  for (const w of text.split(/[^a-zA-Z0-9_-]+/).filter((w) => w.length >= 3)) {
    words.add(w.toLowerCase())
  }
  return words
}

function extractPathKeywords(filePath: string): Set<string> {
  // Secondary signal: meaningful words from the file path
  const parts = filePath.replace(/\\\\/g, "/").split("/")
  const words = new Set<string>()
  for (const part of parts) {
    for (const w of part.split(/[^a-zA-Z0-9_-]+/).filter((w) => w.length >= 3)) {
      words.add(w.toLowerCase())
    }
  }
  return words
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^$()|[\\]{}]/g, "\\$&")
}

function matchKeyword(keyword: string, textWords: Set<string>, rawText: string): boolean {
  // Word-boundary matching — "auth" matches "auth" but NOT "authorize" or "author"
  // First check exact set membership (fast path), then regex fallback for
  // short tokens and multi-word recall terms.
  if (textWords.has(keyword)) return true

  const pattern = new RegExp("\\b" + escapeRegex(keyword) + "\\b", "i")
  return pattern.test(rawText)
}

// ── ContextCollector — budget-aware dedup singleton ──

const MAX_CONTEXT_BYTES = 8000

class ContextCollector {
  private collected = new Map<string, CollectedEntry>()
  private totalBytes = 0

  has(key: string): boolean {
    return this.collected.has(key)
  }

  add(key: string, content: string, priority: number, type: "principle" | "domain", label: string): boolean {
    if (this.collected.has(key)) return false
    const size = Buffer.byteLength(content, "utf-8")
    if (this.totalBytes + size > MAX_CONTEXT_BYTES) return false

    this.collected.set(key, { content, priority, type, label })
    this.totalBytes += size
    return true
  }

  getNewEntries(keys: string[]): CollectedEntry[] {
    return keys
      .filter((k) => this.collected.has(k))
      .map((k) => this.collected.get(k)!)
      .sort((a, b) => a.priority - b.priority)
  }

  getAll(): CollectedEntry[] {
    return Array.from(this.collected.values()).sort((a, b) => a.priority - b.priority)
  }

  formatForOutput(entries: CollectedEntry[]): string {
    return entries
      .map((e) => \`[carl-inject] \${e.type === "principle" ? "Principle" : "Domain"} (\${e.label}):\\n\${e.content}\`)
      .join("\\n\\n---\\n\\n")
  }
}

// ── Plugin ──

export default (async ({ directory }: { directory: string }) => {
  const collector = new ContextCollector()
  const taskKeywordsLoaded = new Set<string>()

  function loadTaskKeywords(sessionID: string): Set<string> {
    // Fire-once per session: extract keywords from execution-state.md
    // to understand what the agent is working on (task awareness)
    if (taskKeywordsLoaded.has(sessionID)) return new Set()
    taskKeywordsLoaded.add(sessionID)

    const statePath = path.join(directory, ".opencode", "state", "execution-state.md")
    if (!existsSync(statePath)) return new Set()

    const state = readFileSync(statePath, "utf-8")
    // Extract Goal + Task List sections — these describe what the agent is doing
    const goalMatch = /\\*\\*Goal\\*\\*:\\s*(.+)/i.exec(state)
    const taskLines = state.split("\\n").filter((l) => /^\\s*-\\s*\\[/.test(l))

    const taskText = [goalMatch?.[1] ?? "", ...taskLines].join(" ")
    return extractKeywords(stripCodeBlocks(taskText))
  }

  function matchAgainstSources(keywords: Set<string>, rawText: string): string[] {
    const manifestPath = path.join(directory, "docs", "principles", "manifest")
    const indexPath = path.join(directory, "docs", "domain", "INDEX.md")
    const addedKeys: string[] = []

    // ── Principles manifest ──
    if (existsSync(manifestPath)) {
      const manifest = readFileSync(manifestPath, "utf-8")
      const principles = parsePrinciplesManifest(manifest)

      for (const entry of principles) {
        const dedupKey = \`principle:\${entry.key}\`
        if (collector.has(dedupKey)) continue

        const matched = entry.recall.some((kw) => matchKeyword(kw, keywords, rawText))
        if (!matched) continue

        const entryFilePath = path.join(directory, entry.file)
        if (!existsSync(entryFilePath)) continue

        const content = readFileSync(entryFilePath, "utf-8")
        if (collector.add(dedupKey, content, entry.priority, "principle", entry.key)) {
          addedKeys.push(dedupKey)
        }
      }
    }

    // ── Domain index ──
    if (existsSync(indexPath)) {
      const index = readFileSync(indexPath, "utf-8")
      const domains = parseDomainIndex(index)

      for (const entry of domains) {
        const matched = entry.keywords.some((kw) => matchKeyword(kw, keywords, rawText))
        if (!matched) continue

        for (const file of entry.files.slice(0, 3)) {
          const dedupKey = \`domain:\${entry.domain}:\${file.path}\`
          if (collector.has(dedupKey)) continue

          const domainFilePath = path.join(directory, "docs", "domain", file.path)
          if (!existsSync(domainFilePath)) continue

          const content = readFileSync(domainFilePath, "utf-8")
          if (collector.add(dedupKey, content, 10, "domain", \`\${entry.domain} / \${file.path}\`)) {
            addedKeys.push(dedupKey)
          }
        }
      }
    }

    return addedKeys
  }

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      if (input.tool !== "Read") return

      const filePath: string = input.args?.path ?? input.args?.file_path ?? ""
      if (!filePath) return

      // ── Collect keywords from multiple signals ──
      const allKeywords = new Set<string>()

      // Signal 1: Task awareness (fire-once per session)
      const taskKw = loadTaskKeywords(input.sessionID)
      for (const kw of taskKw) allKeywords.add(kw)

      // Signal 2: File content analysis (primary — understands what agent reads)
      const fileContent = output.output ?? ""
      const strippedContent = stripCodeBlocks(fileContent)
      const contentKw = extractKeywords(strippedContent)
      for (const kw of contentKw) allKeywords.add(kw)

      // Signal 3: Path keywords (secondary — cheap, complements content)
      const pathKw = extractPathKeywords(filePath)
      for (const kw of pathKw) allKeywords.add(kw)

      if (allKeywords.size === 0) return

      const rawSignal = [
        strippedContent,
        filePath,
        ...Array.from(taskKw),
        ...Array.from(pathKw),
      ].join(" ").toLowerCase()

      // ── Match and inject ──
      const addedKeys = matchAgainstSources(allKeywords, rawSignal)
      if (addedKeys.length === 0) return

      const newEntries = collector.getNewEntries(addedKeys)
      if (newEntries.length > 0) {
        output.output += "\\n\\n" + collector.formatForOutput(newEntries)
      }
    },

    "experimental.session.compacting": async (
      _input: Record<string, unknown>,
      output: { context: string[]; prompt?: string }
    ) => {
      const all = collector.getAll()
      if (all.length === 0) return

      output.context.push(
        "[carl-inject] Previously injected context (principles + domain docs):\\n\\n" +
          collector.formatForOutput(all)
      )
    },
  }
}) satisfies Plugin
`

// ─── Skill Inject ────────────────────────────────────────────────────────────

const SKILL_INJECT = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import path from "path"

// Injects skill instructions via tool.execute.after on Read + Write.
// Read: full skill content when reading a file matching a pattern (agent
//       sees instructions BEFORE creating or editing matching artifacts).
// Write: short reminder after writing a matching file.
// This is Tier 3 of the context architecture.

const SKILL_MAP: Array<{ pattern: RegExp; skill: string }> = [
  { pattern: /\\.test\\.(ts|tsx|js|jsx)$/, skill: "j.test-writing" },
  { pattern: /app\\/.*\\/page\\.(tsx|jsx)$/, skill: "j.page-creation" },
  { pattern: /app\\/api\\/.*\\.(ts|js)$/, skill: "j.api-route-creation" },
  { pattern: /actions\\.(ts|js)$/, skill: "j.server-action-creation" },
  { pattern: /schema\\.prisma$/, skill: "j.schema-migration" },
  { pattern: /(^|\\/)AGENTS\\.md$/, skill: "j.agents-md-writing" },
  { pattern: /docs\\/domain\\/.*\\.md$/, skill: "j.domain-doc-writing" },
  { pattern: /docs\\/principles\\/.*(?:\\.md|manifest)$/, skill: "j.principle-doc-writing" },
  { pattern: /(^|\\/)(\\.opencode\\/scripts|scripts)\\/.*\\.sh$/, skill: "j.shell-script-writing" },
  { pattern: /(^|\\/)pre-commit$/, skill: "j.shell-script-writing" },
]

export default (async ({ directory }: { directory: string }) => {
  const injectedSkills = new Set<string>()

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      const filePath: string = input.args?.path ?? input.args?.file_path ?? ""
      if (!filePath) return

      const match = SKILL_MAP.find(({ pattern }) => pattern.test(filePath))
      if (!match) return

      const key = \`\${input.sessionID}:\${match.skill}\`

      if (input.tool === "Read") {
        // Full injection on Read — agent sees skill instructions before writing
        if (injectedSkills.has(key)) return
        injectedSkills.add(key)

        const skillPath = path.join(directory, ".opencode", "skills", match.skill, "SKILL.md")
        if (!existsSync(skillPath)) return

        const skillContent = readFileSync(skillPath, "utf-8")
        output.output +=
          \`\\n\\n[skill-inject] Skill activated for \${match.skill}:\\n\\n\${skillContent}\`
      } else if (["Write", "Edit", "MultiEdit"].includes(input.tool)) {
        // Short reminder on Write — only if skill was never injected via Read
        if (injectedSkills.has(key)) return

        const skillPath = path.join(directory, ".opencode", "skills", match.skill, "SKILL.md")
        if (!existsSync(skillPath)) return

        injectedSkills.add(key)
        output.output +=
          \`\\n\\n[skill-inject] IMPORTANT: Skill "\${match.skill}" exists for this file type. \` +
          \`Read the matching file first to receive full skill instructions.\`
      }
    },
  }
}) satisfies Plugin
`

// ─── Intent Gate ─────────────────────────────────────────────────────────────

const INTENT_GATE = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import path from "path"

// Scope-guard: after any Write/Edit, checks if the modified file is part of
// the current plan. If it drifts outside the plan scope, appends a warning.
// Uses tool.execute.after on Write/Edit — agent sees the warning and can
// course-correct before continuing.

function extractPlanFiles(planContent: string): Set<string> {
  const files = new Set<string>()
  // Matches common plan file references: paths with extensions, bullet paths, etc.
  const pathPattern = /(?:^|\\s|\\/|\\|)[\\w\\-./]+\\.[a-z]{1,5}\\b/gi
  for (const match of planContent.matchAll(pathPattern)) {
    const cleaned = match[0].replace(/^[\\s/|]+/, "").trim()
    if (cleaned.endsWith(".") || cleaned.length < 4) continue
    files.add(cleaned)
  }
  return files
}

export default (async ({ directory }: { directory: string }) => {
  let planFiles: Set<string> | null = null

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      if (!["Write", "Edit", "MultiEdit"].includes(input.tool)) return

      const filePath: string = input.args?.path ?? input.args?.file_path ?? ""
      if (!filePath) return

      // Lazy-load plan files on first Write/Edit
      if (planFiles === null) {
        planFiles = new Set<string>()
        const planDir = path.join(directory, ".opencode", "state")
        // Try multiple plan file names
        for (const name of ["plan.md", "plan-ready.md"]) {
          const planPath = path.join(planDir, name)
          if (existsSync(planPath)) {
            const content = readFileSync(planPath, "utf-8")
            for (const f of extractPlanFiles(content)) planFiles.add(f)
          }
        }
      }

      // No plan loaded — nothing to guard
      if (planFiles.size === 0) return

      const relPath = path.relative(directory, filePath).replace(/\\\\\\\\/g, "/")

      // Check if the modified file matches any plan reference
      const inScope = [...planFiles].some(
        (pf) => relPath.endsWith(pf) || relPath.includes(pf) || pf.includes(relPath)
      )

      if (!inScope) {
        output.output +=
          \`\\n\\n[intent-gate] ⚠ SCOPE WARNING: "\${relPath}" is not referenced in the current plan. \` +
          \`Verify this change is necessary for the current task before continuing.\`
      }
    },
  }
}) satisfies Plugin
`

// ─── Todo Enforcer ────────────────────────────────────────────────────────────

const TODO_ENFORCER = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import path from "path"

// Re-injects incomplete tasks to prevent the agent from forgetting pending work.
// Two hooks:
//   experimental.session.compacting — injects pending tasks into compaction
//     context so they survive context window resets.
//   tool.execute.after on Write/Edit — lean reminder of pending count after
//     file modifications, nudging the agent to continue.

function getIncompleteTasks(directory: string): string[] {
  const statePath = path.join(directory, ".opencode", "state", "execution-state.md")
  if (!existsSync(statePath)) return []

  const state = readFileSync(statePath, "utf-8")
  return state
    .split("\\n")
    .filter((line) => /^\\s*-\\s*\\[\\s*\\]/.test(line))
    .map((line) => line.trim())
}

export default (async ({ directory }: { directory: string }) => ({
  "experimental.session.compacting": async (
    _input: Record<string, unknown>,
    output: { context: string[]; prompt?: string }
  ) => {
    const incomplete = getIncompleteTasks(directory)
    if (incomplete.length === 0) return

    output.context.push(
      \`[todo-enforcer] \${incomplete.length} incomplete task(s) remaining:\\n\\n\` +
        incomplete.join("\\n") +
        \`\\n\\nDo not stop until all tasks are complete. Continue working.\`
    )
  },
  "tool.execute.after": async (
    input: { tool: string; sessionID: string; callID: string; args: any },
    output: { title: string; output: string; metadata: any }
  ) => {
    if (!["Write", "Edit", "MultiEdit"].includes(input.tool)) return

    const incomplete = getIncompleteTasks(directory)
    if (incomplete.length === 0) return

    output.output +=
      \`\\n\\n[todo-enforcer] \${incomplete.length} task(s) still pending. Continue working.\`
  },
})) satisfies Plugin
`

// ─── Comment Checker ──────────────────────────────────────────────────────────

const COMMENT_CHECKER = `import type { Plugin } from "@opencode-ai/plugin"

// Detects obvious/redundant comments after Write/Edit and appends a reminder.
// Uses tool.execute.after — appends to output.output so agent sees the warning.

const OBVIOUS_PATTERNS = [
  /\\/\\/ increment .*/i,
  /\\/\\/ set .* to/i,
  /\\/\\/ return .*/i,
  /\\/\\/ call .*/i,
  /\\/\\/ create .* variable/i,
  /\\/\\/ check if/i,
  /\\/\\/ loop (through|over|for)/i,
  /\\/\\/ define function/i,
  /\\/\\/ initialize/i,
  /\\/\\/ assign/i,
]

const IGNORE_PATTERNS = [
  /\\/\\/\\s*@ts-/,
  /\\/\\/\\s*eslint/,
  /\\/\\/\\s*TODO/i,
  /\\/\\/\\s*FIXME/i,
  /\\/\\/\\s*HACK/i,
  /\\/\\/\\s*NOTE:/i,
  /\\/\\/\\s*BUG:/i,
  /\\/\\*\\*/,
  /\\s*\\*\\s/,
  /given|when|then/i,
  /describe|it\\(/,
]

function hasObviousComments(content: string): string[] {
  const lines = content.split("\\n")
  const found: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (IGNORE_PATTERNS.some((p) => p.test(line))) continue
    if (OBVIOUS_PATTERNS.some((p) => p.test(line))) {
      found.push(\`Line \${i + 1}: \${line.trim()}\`)
    }
  }

  return found
}

export default (async ({ directory: _directory }: { directory: string }) => ({
  "tool.execute.after": async (
    input: { tool: string; sessionID: string; callID: string; args: any },
    output: { title: string; output: string; metadata: any }
  ) => {
    if (!["Write", "Edit"].includes(input.tool)) return

    const content: string = input.args?.content ?? input.args?.new_string ?? ""
    if (!content) return

    const obvious = hasObviousComments(content)
    if (obvious.length === 0) return

    output.output +=
      \`\\n\\n[comment-checker] \${obvious.length} potentially obvious comment(s) detected:\\n\` +
      obvious.slice(0, 3).join("\\n") +
      \`\\nConsider removing redundant comments — code should be self-documenting.\`
  },
})) satisfies Plugin
`

// ─── Hashline Read ────────────────────────────────────────────────────────────

const HASHLINE_READ = `import type { Plugin } from "@opencode-ai/plugin"
import crypto from "crypto"

// Tags each line in Read output with NN#XX: prefix for stable hash references.
// Agent uses these tags when editing — hashline-edit.ts validates them.
// Uses tool.execute.after — sets output.output to the tagged version.

function hashLine(line: string): string {
  return crypto.createHash("md5").update(line).digest("hex").slice(0, 2)
}

function addHashlines(content: string): string {
  return content
    .split("\\n")
    .map((line, i) => {
      const lineNum = String(i + 1).padStart(3, "0")
      const hash = hashLine(line)
      return \`\${lineNum}#\${hash}: \${line}\`
    })
    .join("\\n")
}

export default (async ({ directory: _directory }: { directory: string }) => ({
  "tool.execute.after": async (
    input: { tool: string; sessionID: string; callID: string; args: any },
    output: { title: string; output: string; metadata: any }
  ) => {
    if (input.tool !== "Read") return
    if (typeof output.output !== "string") return

    output.output = addHashlines(output.output)
  },
})) satisfies Plugin
`

// ─── Hashline Edit ────────────────────────────────────────────────────────────

const HASHLINE_EDIT = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import crypto from "crypto"

// Validates hashline references before Edit tool calls.
// Throws an Error (aborts the edit) if referenced hashes are stale.
// Uses tool.execute.before — output.args has the edit arguments.

function hashLine(line: string): string {
  return crypto.createHash("md5").update(line).digest("hex").slice(0, 2)
}

const HASHLINE_REF = /^(\\d{3})#([a-f0-9]{2}):/

function extractHashlineRefs(text: string): Array<{ lineNum: number; hash: string }> {
  return text
    .split("\\n")
    .map((line) => {
      const match = HASHLINE_REF.exec(line)
      if (!match) return null
      return { lineNum: parseInt(match[1], 10), hash: match[2] }
    })
    .filter((r): r is { lineNum: number; hash: string } => r !== null)
}

export default (async ({ directory: _directory }: { directory: string }) => ({
  "tool.execute.before": async (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: any }
  ) => {
    if (input.tool !== "Edit") return

    const filePath: string = output.args?.path ?? output.args?.file_path ?? ""
    const oldString: string = output.args?.old_string ?? ""

    if (!filePath || !oldString || !existsSync(filePath)) return

    const refs = extractHashlineRefs(oldString)
    if (refs.length === 0) return

    const currentLines = readFileSync(filePath, "utf-8").split("\\n")

    for (const ref of refs) {
      const lineIndex = ref.lineNum - 1
      if (lineIndex >= currentLines.length) {
        throw new Error(
          \`[hashline-edit] Stale reference: line \${ref.lineNum} no longer exists in \${filePath}.\\n\` +
          \`Re-read the file to get current hashlines.\`
        )
      }

      const currentHash = hashLine(currentLines[lineIndex])
      if (currentHash !== ref.hash) {
        throw new Error(
          \`[hashline-edit] Stale reference at line \${ref.lineNum}: expected hash \${ref.hash}, got \${currentHash}.\\n\` +
          \`Re-read the file to get current hashlines.\`
        )
      }
    }
  },
})) satisfies Plugin
`

// ─── Directory Agents Injector ────────────────────────────────────────────────

const DIR_AGENTS_INJECTOR = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import path from "path"

// Tier 1 context mechanism — hierarchical AGENTS.md injection.
// When an agent reads a file, walks the directory tree from the file's location
// to the project root and appends every AGENTS.md found to the Read output.
// Injects from root → most specific (additive, layered context).
// Uses tool.execute.after on Read — appends to output.output.

function findAgentsMdFiles(filePath: string, projectRoot: string): string[] {
  const result: string[] = []
  let current = path.dirname(filePath)

  // Walk up to project root (exclusive — root AGENTS.md is auto-loaded by OpenCode)
  while (current !== projectRoot && current !== path.dirname(current)) {
    const agentsMd = path.join(current, "AGENTS.md")
    if (existsSync(agentsMd)) {
      result.unshift(agentsMd) // prepend for root → specific order
    }
    current = path.dirname(current)
  }

  return result
}

export default (async ({ directory }: { directory: string }) => {
  const injectedPaths = new Set<string>()

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      if (input.tool !== "Read") return

      const filePath: string = input.args?.path ?? input.args?.file_path ?? ""
      if (!filePath || !filePath.startsWith(directory)) return

      const agentsMdFiles = findAgentsMdFiles(filePath, directory)
      const toInject: string[] = []

      for (const agentsPath of agentsMdFiles) {
        if (injectedPaths.has(agentsPath)) continue
        injectedPaths.add(agentsPath)

        const content = readFileSync(agentsPath, "utf-8")
        const relPath = path.relative(directory, agentsPath)
        toInject.push(\`[directory-agents-injector] Context from \${relPath}:\\n\\n\${content}\`)
      }

      if (toInject.length > 0) {
        output.output += "\\n\\n" + toInject.join("\\n\\n---\\n\\n")
      }
    },
  }
}) satisfies Plugin
`

// ─── Memory (persistent-context injection) ────────────────────────────────────

const MEMORY = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import path from "path"

// Injects persistent-context.md (cross-session repo memory, like OpenClaw).
// This file is written by UNIFY and contains project conventions, decisions,
// and patterns accumulated across sessions.
// Two hooks:
//   tool.execute.after — injects on the FIRST tool call of a session so the
//     agent has repo memory from the very beginning.
//   experimental.session.compacting — re-injects during compaction so memory
//     survives context window resets.

function loadMemory(directory: string): string | null {
  const memoryPath = path.join(directory, ".opencode", "state", "persistent-context.md")
  if (!existsSync(memoryPath)) return null

  const content = readFileSync(memoryPath, "utf-8").trim()
  if (!content) return null

  return content
}

export default (async ({ directory }: { directory: string }) => {
  const injectedSessions = new Set<string>()

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      // Fire once per session — first tool call triggers injection
      if (injectedSessions.has(input.sessionID)) return
      injectedSessions.add(input.sessionID)

      const memory = loadMemory(directory)
      if (!memory) return

      output.output +=
        \`\\n\\n[memory] Project memory (persistent-context):\\n\\n\${memory}\`
    },
    "experimental.session.compacting": async (
      _input: Record<string, unknown>,
      output: { context: string[]; prompt?: string }
    ) => {
      const memory = loadMemory(directory)
      if (!memory) return

      output.context.push(
        \`[memory] Project memory (persistent-context):\\n\\n\${memory}\`
      )
    },
  }
}) satisfies Plugin
`
