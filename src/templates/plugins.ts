import { writeFileSync } from "fs"
import path from "path"
import type { ProjectType } from "../project-types.js"

export function writePlugins(
  projectDir: string,
  projectType: ProjectType = "node-nextjs",
  isKotlin: boolean = false,
): void {
  const pluginsDir = path.join(projectDir, ".opencode", "plugins")

  writeFileSync(path.join(pluginsDir, "j.env-protection.ts"), ENV_PROTECTION)
  writeFileSync(path.join(pluginsDir, "j.auto-format.ts"), AUTO_FORMAT)
  writeFileSync(path.join(pluginsDir, "j.plan-autoload.ts"), PLAN_AUTOLOAD)
  writeFileSync(path.join(pluginsDir, "j.task-runtime.ts"), TASK_RUNTIME)
  writeFileSync(path.join(pluginsDir, "j.task-board.ts"), TASK_BOARD)
  writeFileSync(path.join(pluginsDir, "j.notify.ts"), NOTIFY)
  writeFileSync(path.join(pluginsDir, "j.carl-inject.ts"), CARL_INJECT)
  writeFileSync(path.join(pluginsDir, "j.skill-inject.ts"), skillInject(projectType, isKotlin))
  writeFileSync(path.join(pluginsDir, "j.intent-gate.ts"), INTENT_GATE)
  writeFileSync(path.join(pluginsDir, "j.todo-enforcer.ts"), TODO_ENFORCER)
  writeFileSync(path.join(pluginsDir, "j.comment-checker.ts"), COMMENT_CHECKER)
  writeFileSync(path.join(pluginsDir, "j.hashline-read.ts"), HASHLINE_READ)
  writeFileSync(path.join(pluginsDir, "j.hashline-edit.ts"), HASHLINE_EDIT)
  writeFileSync(path.join(pluginsDir, "j.directory-agents-injector.ts"), DIR_AGENTS_INJECTOR)
  writeFileSync(path.join(pluginsDir, "j.memory.ts"), MEMORY)

  // Write initial skill-map.json for dynamic extension by /j.finish-setup
  writeFileSync(
    path.join(projectDir, ".opencode", "skill-map.json"),
    JSON.stringify(getBaseSkillMap(projectType, isKotlin), null, 2) + "\n",
  )
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

// ─── Plan Autoload (evolved) ─────────────────────────────────────────────────

const PLAN_AUTOLOAD = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { resolveStateFile } from "../lib/j.state-paths"
import { loadActivePlanReferenceProjects, loadActivePlanTarget, loadActivePlanTargets, resolvePathFromProjectRoot, resolveProjectPaths } from "../lib/j.workspace-paths"

// Injects active plan into agent context when an active-plan state pointer exists.
// Uses chat.message for initial injection, tool.execute.after(Read) as a
// fallback, and experimental.session.compacting to survive session compaction.
// The active-plan pointer stays on disk so later messages, compaction, and
// write-time guards can all resolve the same active plan consistently.

export default (async ({ directory }: { directory: string }) => {
  const planInjectedSessions = new Set<string>()

  function loadActivePlan(): { planPath: string; planContent: string; specPath?: string; contextPath?: string; targets?: Array<{ projectLabel: string; planPath: string; planContent?: string; specPath?: string; contextPath?: string }>; referenceProjects?: Array<{ projectLabel: string; reason?: string }> } | null {
    const activePlanFile = resolveStateFile(directory, "active-plan.json")
    if (!existsSync(activePlanFile)) return null

    const state = loadActivePlanTarget(directory) ?? JSON.parse(readFileSync(activePlanFile, "utf-8")) as { planPath?: string; specPath?: string; contextPath?: string; targetRepoRoot?: string }
    const planPath = state.planPath?.trim()
    if (!planPath) return null
    const projectPaths = resolveProjectPaths(directory, {
      targetRepoRoot: state.targetRepoRoot,
      planPath,
      specPath: state.specPath,
      contextPath: state.contextPath,
    })
    const fullPath = path.isAbsolute(planPath)
      ? planPath
      : projectPaths
        ? resolvePathFromProjectRoot(projectPaths.projectRoot, planPath)
        : path.join(directory, planPath)
    if (!existsSync(fullPath)) return null

    return {
      planPath,
      planContent: readFileSync(fullPath, "utf-8"),
      specPath: state.specPath?.trim() || undefined,
      contextPath: state.contextPath?.trim() || undefined,
      targets: loadActivePlanTargets(directory)
        .map((target) => {
          const projectPaths = resolveProjectPaths(directory, { targetRepoRoot: target.targetRepoRoot, planPath: target.planPath })
          if (!projectPaths || !target.planPath) return null
          const targetPlanFullPath = path.isAbsolute(target.planPath)
            ? target.planPath
            : resolvePathFromProjectRoot(projectPaths.projectRoot, target.planPath)
          const targetPlanContent = existsSync(targetPlanFullPath) ? readFileSync(targetPlanFullPath, "utf-8") : undefined
          return {
            projectLabel: projectPaths.projectLabel,
            planPath: target.planPath,
            planContent: targetPlanContent,
            specPath: target.specPath?.trim() || undefined,
            contextPath: target.contextPath?.trim() || undefined,
          }
        })
        .filter((entry): entry is { projectLabel: string; planPath: string; planContent?: string; specPath?: string; contextPath?: string } => Boolean(entry)),
      referenceProjects: loadActivePlanReferenceProjects(directory)
        .map((project) => {
          const projectPaths = resolveProjectPaths(directory, { targetRepoRoot: project.targetRepoRoot })
          if (!projectPaths) return null
          return {
            projectLabel: projectPaths.projectLabel,
            reason: project.reason?.trim() || undefined,
          }
        })
        .filter((entry): entry is { projectLabel: string; reason?: string } => Boolean(entry)),
    }
  }

  function renderPlan(planPath: string, planContent: string, specPath?: string, contextPath?: string, targets?: Array<{ projectLabel: string; planPath: string; planContent?: string; specPath?: string; contextPath?: string }>, referenceProjects?: Array<{ projectLabel: string; reason?: string }>): string {
    const contractLines = [
      \`[plan-autoload] Active plan detected at \${planPath}:\`,
      specPath ? \`[plan-autoload] Spec contract: \${specPath}\` : "[plan-autoload] Spec contract: N/A",
      contextPath ? \`[plan-autoload] Context contract: \${contextPath}\` : "[plan-autoload] Context contract: N/A",
      ...(targets && targets.length > 1
        ? ["[plan-autoload] Multi-project write targets:", ...targets.map((target) => \`- \${target.projectLabel}: plan=\${target.planPath}\${target.specPath ? \` spec=\${target.specPath}\` : ""}\${target.contextPath ? \` context=\${target.contextPath}\` : ""}\`)]
        : []),
      ...(targets && targets.length > 1
        ? ["[plan-autoload] /j.implement must iterate every write target and must not stop after the first target."]
        : []),
      ...(referenceProjects && referenceProjects.length > 0
        ? ["[plan-autoload] Reference projects:", ...referenceProjects.map((project) => \`- \${project.projectLabel}\${project.reason ? \`: \${project.reason}\` : ""}\`)]
        : []),
      "",
      planContent,
      ...(targets && targets.length > 1
        ? targets
            .filter((t) => t.planContent && t.planContent !== planContent)
            .flatMap((t) => [
              "",
              \`[plan-autoload] Plan content for \${t.projectLabel} (\${t.planPath}):\`,
              "",
              t.planContent!,
            ])
        : []),
      "",
      "Use /j.implement to execute this plan, or /j.plan to revise it.",
    ]
    return (
      contractLines.join("\\n")
    )
  }

  return {
    "chat.message": async (
      input: { sessionID: string },
      output: { message: { system?: string }; parts: unknown[] }
    ) => {
      if (planInjectedSessions.has(input.sessionID)) return

      const loaded = loadActivePlan()
      if (!loaded) return

      planInjectedSessions.add(input.sessionID)
      output.message.system = output.message.system
        ? output.message.system + "\\n\\n" + renderPlan(loaded.planPath, loaded.planContent, loaded.specPath, loaded.contextPath, loaded.targets, loaded.referenceProjects)
        : renderPlan(loaded.planPath, loaded.planContent, loaded.specPath, loaded.contextPath, loaded.targets, loaded.referenceProjects)
    },
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      if (input.tool !== "Read" || planInjectedSessions.has(input.sessionID)) return

      const loaded = loadActivePlan()
      if (!loaded) return

      planInjectedSessions.add(input.sessionID)
      output.output += "\\n\\n" + renderPlan(loaded.planPath, loaded.planContent, loaded.specPath, loaded.contextPath, loaded.targets, loaded.referenceProjects)
    },

    "experimental.session.compacting": async (
      _input: { sessionID?: string },
      output: { context: string[] }
    ) => {
      const loaded = loadActivePlan()
      if (!loaded) return

      output.context.push(renderPlan(loaded.planPath, loaded.planContent, loaded.specPath, loaded.contextPath, loaded.targets, loaded.referenceProjects))
    },
  }
}) satisfies Plugin
`

// ─── CARL Inject (evolved v3) ────────────────────────────────────────────────

const CARL_INJECT = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"
import { loadActivePlanTarget, loadActivePlanTargets, resolvePathFromProjectRoot, resolveProjectPaths } from "../lib/j.workspace-paths"
import { featureStateTaskPaths } from "../lib/j.feature-state-paths"

// CARL v3 = Context-Aware Retrieval Layer
// Goals:
// - Preload task-scoped context for child implementer sessions before exploratory reads
// - Keep read-time enrichment for additional context discovered while working
// - Always load canonical principles when configured in the manifest
// - Rehydrate collected context during compaction

interface PrincipleEntry {
  key: string
  recall: string[]
  file: string
  priority: number
  always: boolean
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

interface RuntimeTaskMetadata {
  featureSlug?: string
  taskID?: string
  planPath?: string
  targetRepoRoot?: string
  originalPrompt?: string
}

interface TaskPlanContext {
  taskID: string
  files: string[]
  action: string
  verify: string
  done: string
}

interface PendingStartupSeed {
  prompt: string
  subagentType?: string
  featureSlug?: string
  planPath?: string
  taskID?: string
  specPath?: string
  contextPath?: string
  taskContractPath?: string
  targetRepoRoot?: string
}

interface TaskContractSeed {
  featureSlug?: string
  taskID?: string
  planPath?: string
  specPath?: string
  contextPath?: string
  taskContractPath?: string
  targetRepoRoot?: string
}

const GENERIC_CARL_KEYWORDS = new Set([
  "api",
  "controller",
  "endpoint",
  "handler",
  "http",
  "integration",
  "mock",
  "request",
  "response",
  "rest",
  "route",
  "spec",
  "test",
  "tests",
  "unit",
])

const STARTUP_DOMAIN_SCORE_FLOOR_RATIO = 0.65
const FLOW_DOMAINS_WITH_BALANCE_COMPANION = new Set(["Cashout", "Orders", "Order", "Operational-entry", "Inactive-fee"])
const BALANCE_COMPANION_SIGNALS = ["available", "balance", "credit", "debit", "escrow", "loss", "reserve"]
const STARTUP_SEEDED_SUBAGENTS = new Set(["j.implementer", "j.checker", "j.planner", "j.spec-writer"])

function shouldSeedStartupPrompt(prompt: string, subagentType?: string): boolean {
  if (subagentType && STARTUP_SEEDED_SUBAGENTS.has(subagentType)) return true
  return /\\bactive plan\\b/i.test(prompt) || /docs\\/specs\\/[^\\s]+\\/(?:plan|spec)\\.md/.test(prompt) || /\\btask\\s+\\d+\\b/i.test(prompt)
}

function parsePrinciplesManifest(content: string): PrincipleEntry[] {
  const entries: PrincipleEntry[] = []
  const lines = content.split("\\n").filter((line) => !line.startsWith("#") && line.trim())

  const byKey: Record<string, Record<string, string>> = {}
  for (const line of lines) {
    const match = /^([A-Z_]+)_(STATE|RECALL|FILE|PRIORITY|ALWAYS)=(.*)$/.exec(line)
    if (!match) continue
    const [, prefix, field, value] = match
    if (!byKey[prefix]) byKey[prefix] = {}
    byKey[prefix][field] = value.trim()
  }

  for (const [key, fields] of Object.entries(byKey)) {
    if (fields["STATE"] !== "active") continue
    if (!fields["FILE"]) continue
    entries.push({
      key,
      recall: fields["RECALL"]
        ? fields["RECALL"].split(",").map((keyword) => keyword.trim().toLowerCase()).filter(Boolean)
        : [],
      file: fields["FILE"],
      priority: parseInt(fields["PRIORITY"] ?? "50", 10),
      always: /^(1|true|yes)$/i.test(fields["ALWAYS"] ?? "false"),
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
    const keywordsLine = lines.find((line) => line.startsWith("Keywords:"))
    const filesStart = lines.findIndex((line) => line.startsWith("Files:"))
    if (!keywordsLine || filesStart === -1) continue

    const keywords = keywordsLine
      .replace("Keywords:", "")
      .split(",")
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean)

    const files: Array<{ path: string; description: string }> = []
    for (let index = filesStart + 1; index < lines.length; index += 1) {
      const fileMatch = /^\\s*-\\s+([^—]+)(?:—\\s+(.*))?$/.exec(lines[index])
      if (!fileMatch) break
      files.push({ path: fileMatch[1].trim(), description: fileMatch[2]?.trim() ?? "" })
    }

    entries.push({ domain, keywords, files })
  }

  return entries
}

function stripCodeBlocks(text: string): string {
  let stripped = text.replace(/\\\`\\\`\\\`[\\s\\S]*?\\\`\\\`\\\`/g, "")
  stripped = stripped.replace(/\\\`[^\\\`\\n]+\\\`/g, "")
  return stripped
}

function extractKeywords(text: string): Set<string> {
  const words = new Set<string>()
  for (const word of text.split(/[^a-zA-Z0-9_-]+/).filter((candidate) => candidate.length >= 3)) {
    words.add(word.toLowerCase())
  }
  return words
}

function extractPathKeywords(filePath: string): Set<string> {
  const parts = filePath.replace(/\\\\/g, "/").split("/")
  const words = new Set<string>()
  for (const part of parts) {
    for (const word of part.split(/[^a-zA-Z0-9_-]+/).filter((candidate) => candidate.length >= 3)) {
      words.add(word.toLowerCase())
    }
  }
  return words
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^$()|[\\]{}]/g, "\\\\$&")
}

function matchKeyword(keyword: string, textWords: Set<string>, rawText: string): boolean {
  if (textWords.has(keyword)) return true
  const pattern = new RegExp("\\\\b" + escapeRegex(keyword) + "\\\\b", "i")
  return pattern.test(rawText)
}

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
      .filter((key) => this.collected.has(key))
      .map((key) => this.collected.get(key)!)
      .sort((left, right) => left.priority - right.priority)
  }

  getAll(): CollectedEntry[] {
    return Array.from(this.collected.values()).sort((left, right) => left.priority - right.priority)
  }

  formatForOutput(entries: CollectedEntry[]): string {
    return entries
      .map((entry) => \`[carl-inject] \${entry.type === "principle" ? "Principle" : "Domain"} (\${entry.label}):\\n\${entry.content}\`)
      .join("\\n\\n---\\n\\n")
  }
}

function loadRuntimeMetadata(directory: string, sessionID: string): RuntimeTaskMetadata | null {
  const activeTargets = loadActivePlanTargets(directory)
  const candidateProjectRoots = new Set<string>()
  for (const target of activeTargets) {
    if (target?.targetRepoRoot) candidateProjectRoots.add(target.targetRepoRoot)
  }

  if (candidateProjectRoots.size === 0) {
    const fallback = resolveProjectPaths(directory, loadActivePlanTarget(directory) ?? {})
    if (fallback?.projectRoot) candidateProjectRoots.add(fallback.projectRoot)
  }

  for (const projectRoot of candidateProjectRoots) {
    const projectPaths = resolveProjectPaths(directory, { targetRepoRoot: projectRoot })
    const specsDir = projectPaths?.specsRoot
    if (!specsDir || !existsSync(specsDir)) continue

    const featureDirs = readDirectoryNames(specsDir)
    for (const featureSlug of featureDirs) {
      const runtimePath = path.join(specsDir, featureSlug, "state", "sessions", \`\${sessionID}-runtime.json\`)
      if (!existsSync(runtimePath)) continue
      try {
        return JSON.parse(readFileSync(runtimePath, "utf-8")) as RuntimeTaskMetadata
      } catch {
        return null
      }
    }
  }

  return null
}

function readDirectoryNames(target: string): string[] {
  try {
    return readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function resolvePlanPath(directory: string, runtime: RuntimeTaskMetadata | null): string | null {
  const runtimePlanPath = runtime?.planPath?.trim()
  if (runtimePlanPath) {
    const projectPaths = resolveProjectPaths(directory, {
      targetRepoRoot: runtime?.targetRepoRoot,
      planPath: runtimePlanPath,
    })
    return path.isAbsolute(runtimePlanPath)
      ? runtimePlanPath
      : projectPaths
        ? resolvePathFromProjectRoot(projectPaths.projectRoot, runtimePlanPath)
        : path.join(directory, runtimePlanPath)
  }

  const activePlan = loadActivePlanTarget(directory)
  if (!activePlan) return null
  try {
    const relativePath = activePlan.planPath?.trim()
    if (!relativePath) return null
    const projectPaths = resolveProjectPaths(directory, {
      targetRepoRoot: activePlan.targetRepoRoot,
      planPath: relativePath,
      specPath: activePlan.specPath,
      contextPath: activePlan.contextPath,
    })
    return path.isAbsolute(relativePath)
      ? relativePath
      : projectPaths
        ? resolvePathFromProjectRoot(projectPaths.projectRoot, relativePath)
        : path.join(directory, relativePath)
  } catch {
    return null
  }
}

function extractFeatureSlugFromPath(filePath: string): string | null {
  return filePath.match(/docs\\/specs\\/([^/]+)\\//)?.[1] ?? null
}

function extractFeatureSlugFromPrompt(prompt: string): string | null {
  return prompt.match(/docs\\/specs\\/([^/]+)\\//)?.[1] ?? null
}

function extractPlanPathFromPrompt(prompt: string): string | null {
  return prompt.match(/docs\\/specs\\/[^\\s]+\\/plan\\.md/)?.[0] ?? null
}

function readIfExists(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf-8") : ""
}

function loadTaskContractSeed(directory: string, args: Record<string, unknown>): TaskContractSeed | null {
  const contractArg = typeof args.contract === "object" && args.contract
    ? (args.contract as Record<string, unknown>)
    : null
  if (contractArg) {
    return {
      featureSlug: typeof contractArg.featureSlug === "string" ? contractArg.featureSlug : undefined,
      taskID: typeof contractArg.taskID === "string" ? contractArg.taskID : typeof contractArg.taskID === "number" ? String(contractArg.taskID) : undefined,
      planPath: typeof contractArg.planPath === "string" ? contractArg.planPath : undefined,
      specPath: typeof contractArg.specPath === "string" ? contractArg.specPath : undefined,
      contextPath: typeof contractArg.contextPath === "string" ? contractArg.contextPath : undefined,
      taskContractPath: typeof contractArg.taskContractPath === "string" ? contractArg.taskContractPath : undefined,
      targetRepoRoot: typeof contractArg.targetRepoRoot === "string" ? contractArg.targetRepoRoot : undefined,
    }
  }

  const contractPathArg = typeof args.task_contract_path === "string"
    ? args.task_contract_path
    : typeof args.taskContractPath === "string"
      ? args.taskContractPath
      : undefined
  if (!contractPathArg) return null

  const absolutePath = path.isAbsolute(contractPathArg) ? contractPathArg : path.join(directory, contractPathArg)
  if (!existsSync(absolutePath)) return null

  try {
    const contract = JSON.parse(readFileSync(absolutePath, "utf-8")) as TaskContractSeed
    return {
      ...contract,
      taskContractPath: contractPathArg,
    }
  } catch {
    return null
  }
}

function loadTaskPlanContext(planPath: string, taskID: string | undefined): TaskPlanContext | null {
  if (!taskID || !existsSync(planPath)) return null
  const content = readFileSync(planPath, "utf-8")
  const match = Array.from(content.matchAll(/<task id="([^"]+)" wave="[^"]+" agent="[^"]+" depends="[^"]*">[\\s\\S]*?<\\/task>/g))
    .find((candidate) => candidate[1] === taskID)
  if (!match) return null

  const body = match[2]
  const files = (body.match(/<files>[\\s\\S]*?<\\/files>/)?.[1] ?? "")
    .replace(/\\r/g, "")
    .split(/,|\\n/)
    .map((file) => file.trim())
    .filter(Boolean)

  return {
    taskID,
    files,
    action: (body.match(/<action>[\\s\\S]*?<\\/action>/)?.[1] ?? "").trim(),
    verify: (body.match(/<verify>[\\s\\S]*?<\\/verify>/)?.[1] ?? "").trim(),
    done: (body.match(/<done>[\\s\\S]*?<\\/done>/)?.[1] ?? "").trim(),
  }
}

function taskSignals(runtime: RuntimeTaskMetadata | null, taskContext: TaskPlanContext | null): { keywords: Set<string>; rawText: string } {
  const texts = [
    runtime?.originalPrompt ?? "",
    taskContext?.action ?? "",
    taskContext?.done ?? "",
    ...(taskContext?.files ?? []),
  ]
  const rawText = texts.join(" ").toLowerCase()
  return { keywords: extractKeywords(stripCodeBlocks(rawText)), rawText }
}

function startupSeedSignals(directory: string, seed: PendingStartupSeed): { keywords: Set<string>; rawText: string } {
  const projectPaths = resolveProjectPaths(directory, {
    prompt: seed.prompt,
    targetRepoRoot: seed.targetRepoRoot,
    planPath: seed.planPath,
    specPath: seed.specPath,
    contextPath: seed.contextPath,
    taskContractPath: seed.taskContractPath,
  })
  const projectRoot = projectPaths?.projectRoot ?? directory
  const specsRoot = projectPaths?.specsRoot ?? path.join(directory, "docs", "specs")
  const resolvedPlanPath = seed.planPath
    ? path.isAbsolute(seed.planPath)
      ? seed.planPath
      : resolvePathFromProjectRoot(projectRoot, seed.planPath)
    : resolvePlanPath(directory, null)
  const featureSlug = seed.featureSlug ?? (resolvedPlanPath ? extractFeatureSlugFromPath(resolvedPlanPath) : null)

  const texts = [seed.prompt]
  if (seed.taskContractPath) {
    const absoluteTaskContract = path.isAbsolute(seed.taskContractPath)
      ? seed.taskContractPath
      : resolvePathFromProjectRoot(projectRoot, seed.taskContractPath)
    texts.push(readIfExists(absoluteTaskContract))
  }
  if (resolvedPlanPath) texts.push(readIfExists(resolvedPlanPath))
  if (featureSlug) {
    texts.push(readIfExists(seed.specPath ? resolvePathFromProjectRoot(projectRoot, seed.specPath) : path.join(specsRoot, featureSlug, "spec.md")))
    texts.push(readIfExists(seed.contextPath ? resolvePathFromProjectRoot(projectRoot, seed.contextPath) : path.join(specsRoot, featureSlug, "CONTEXT.md")))
    texts.push(readIfExists(path.join(specsRoot, featureSlug, "state", "functional-validation-plan.md")))
  }

  const rawText = texts.filter(Boolean).join(" ").toLowerCase()
  return { keywords: extractKeywords(stripCodeBlocks(rawText)), rawText }
}

function isTestFocusedTask(taskContext: TaskPlanContext | null, runtime: RuntimeTaskMetadata | null): boolean {
  const fileHints = taskContext?.files ?? []
  return fileHints.some((file) => /(^|\\/)src\\/test\\//.test(file) || /(Test|IT)\\.(kt|java)$/.test(file))
}

function isTestFocusedRead(filePath: string, rawText: string): boolean {
  return /(^|\\/)src\\/test\\//.test(filePath) || /(Test|IT)\\.(kt|java)$/.test(filePath) || /@Test\\b/.test(rawText)
}

function isPromptTestFocused(rawText: string): boolean {
  return /(^|\\s)(src\\/test\\/|test\\s+file|test\\s+suite|unit\\s+test|integration\\s+test|write\\s+tests?|add\\s+tests?|implement\\s+tests?)/.test(rawText)
}

function effectiveRecallKeywords(entry: PrincipleEntry | DomainEntry, options?: { mode?: "startup" | "read"; testFocused?: boolean }): string[] {
  const recall = "recall" in entry ? entry.recall : entry.keywords
  const mode = options?.mode ?? "read"
  if (mode === "startup") {
    if ("always" in entry && entry.always) return recall
    if ("key" in entry && entry.key === "TEST") return options?.testFocused ? recall : []
  } else if ("key" in entry && entry.key === "TEST" && options?.testFocused) {
    return recall
  }

  return recall.filter((keyword) => !GENERIC_CARL_KEYWORDS.has(keyword))
}

function addPrinciples(
  directory: string,
  collector: ContextCollector,
  keywords: Set<string>,
  rawText: string,
  options?: { includeAlways?: boolean; mode?: "startup" | "read"; testFocused?: boolean }
): string[] {
  const targets = loadActivePlanTargets(directory)
  const projectPathsList = targets.length > 0
    ? targets.map((t) => resolveProjectPaths(directory, t)).filter((p): p is NonNullable<typeof p> => Boolean(p))
    : [resolveProjectPaths(directory, {})].filter((p): p is NonNullable<typeof p> => Boolean(p))

  const addedKeys: string[] = []
  const seenManifests = new Set<string>()

  for (const projectPaths of projectPathsList) {
    const manifestRoot = projectPaths.principlesRoot
    const manifestPathResolved = path.join(manifestRoot, "manifest")
    if (!existsSync(manifestPathResolved)) continue
    if (seenManifests.has(manifestPathResolved)) continue
    seenManifests.add(manifestPathResolved)

    const manifest = readFileSync(manifestPathResolved, "utf-8")
    const entries = parsePrinciplesManifest(manifest)

    for (const entry of entries) {
      const dedupKey = \`principle:\${entry.key}\`
      if (collector.has(dedupKey)) continue

      const recallKeywords = effectiveRecallKeywords(entry, { mode: options?.mode, testFocused: options?.testFocused })
      const matchedRecall = recallKeywords.some((keyword) => matchKeyword(keyword, keywords, rawText))
      if (!matchedRecall && !(options?.includeAlways && entry.always)) continue

      const filePath = path.isAbsolute(entry.file)
        ? entry.file
        : resolvePathFromProjectRoot(projectPaths.projectRoot, entry.file)
      if (!existsSync(filePath)) continue

      const content = readFileSync(filePath, "utf-8")
      if (collector.add(dedupKey, content, entry.priority, "principle", entry.key)) addedKeys.push(dedupKey)
    }
  }

  return addedKeys
}

function addDomains(
  directory: string,
  collector: ContextCollector,
  keywords: Set<string>,
  rawText: string,
  options?: { mode?: "startup" | "read"; testFocused?: boolean }
): string[] {
  const targets = loadActivePlanTargets(directory)
  const projectPathsList = targets.length > 0
    ? targets.map((t) => resolveProjectPaths(directory, t)).filter((p): p is NonNullable<typeof p> => Boolean(p))
    : [resolveProjectPaths(directory, {})].filter((p): p is NonNullable<typeof p> => Boolean(p))

  const addedKeys: string[] = []
  const seenIndexes = new Set<string>()

  for (const projectPaths of projectPathsList) {
    const domainRoot = projectPaths.domainRoot
    const indexPath = path.join(domainRoot, "INDEX.md")
    if (!existsSync(indexPath)) continue
    if (seenIndexes.has(indexPath)) continue
    seenIndexes.add(indexPath)

    const index = readFileSync(indexPath, "utf-8")
    const domains = parseDomainIndex(index)
    const scoredMatches = domains
      .map((entry) => {
        const recallKeywords = effectiveRecallKeywords(entry, { mode: options?.mode, testFocused: options?.testFocused })
        const matchedKeywords = recallKeywords.filter((keyword) => matchKeyword(keyword, keywords, rawText))
        return {
          entry,
          matchedKeywords,
          score: matchedKeywords.reduce((sum, keyword) => sum + Math.max(keyword.length, 1), 0),
        }
      })
      .filter((candidate) => candidate.matchedKeywords.length > 0)

    let allowedDomains: Set<string> | null = null
    if ((options?.mode ?? "read") === "startup" && scoredMatches.length > 0) {
      const bestScore = Math.max(...scoredMatches.map((candidate) => candidate.score))
      allowedDomains = new Set(
        scoredMatches
          .filter((candidate) => candidate.score >= bestScore * STARTUP_DOMAIN_SCORE_FLOOR_RATIO)
          .map((candidate) => candidate.entry.domain)
      )

      const bestDomains = scoredMatches.filter((candidate) => candidate.score === bestScore).map((candidate) => candidate.entry.domain)
      const hasFlowWinner = bestDomains.some((domain) => FLOW_DOMAINS_WITH_BALANCE_COMPANION.has(domain))
      const balanceCandidate = scoredMatches.find((candidate) => candidate.entry.domain.toLowerCase() === "balance")
      const hasBalanceSignals = BALANCE_COMPANION_SIGNALS.some((signal) => rawText.includes(signal))
      if (hasFlowWinner && balanceCandidate && hasBalanceSignals) {
        allowedDomains.add(balanceCandidate.entry.domain)
      }
    }

    for (const entry of domains) {
      if (allowedDomains && !allowedDomains.has(entry.domain)) continue
      const recallKeywords = effectiveRecallKeywords(entry, { mode: options?.mode, testFocused: options?.testFocused })
      const matched = recallKeywords.some((keyword) => matchKeyword(keyword, keywords, rawText))
      if (!matched) continue

      for (const file of entry.files.slice(0, 3)) {
        const dedupKey = \`domain:\${entry.domain}:\${file.path}\`
        if (collector.has(dedupKey)) continue

        const domainPath = path.join(domainRoot, file.path)
        if (!existsSync(domainPath)) continue

        const content = readFileSync(domainPath, "utf-8")
        if (collector.add(dedupKey, content, 10, "domain", \`\${entry.domain} / \${file.path}\`)) addedKeys.push(dedupKey)
      }
    }
  }

  return addedKeys
}

export default (async ({ directory }: { directory: string }) => {
  const collectorsBySession = new Map<string, ContextCollector>()
  const taskKeywordsLoaded = new Set<string>()
  const preloadedSessions = new Set<string>()
  const pendingStartupSeedsByParent = new Map<string, PendingStartupSeed[]>()
  const startupSeedBySession = new Map<string, PendingStartupSeed>()

  function collectorForSession(sessionID: string): ContextCollector {
    let collector = collectorsBySession.get(sessionID)
    if (!collector) {
      collector = new ContextCollector()
      collectorsBySession.set(sessionID, collector)
    }
    return collector
  }

  function loadTaskKeywords(sessionID: string): Set<string> {
    if (taskKeywordsLoaded.has(sessionID)) return new Set()
    taskKeywordsLoaded.add(sessionID)

    // Try task-scoped execution state first (feature/task-local)
    const runtime = loadRuntimeMetadata(directory, sessionID)
    if (runtime?.featureSlug && runtime?.taskID) {
      const taskPaths = featureStateTaskPaths(directory, runtime.featureSlug, runtime.taskID, {
        targetRepoRoot: runtime.targetRepoRoot,
      })
      if (existsSync(taskPaths.statePath)) {
        const state = readFileSync(taskPaths.statePath, "utf-8")
        const goalMatch = /\\*\\*Goal\\*\\*:\\s*(.+)/i.exec(state)
        const taskLines = state.split("\\n").filter((line) => /^\\s*-\\s*\\[/.test(line))
        const taskText = [goalMatch?.[1] ?? "", ...taskLines].join(" ")
        return extractKeywords(stripCodeBlocks(taskText))
      }
    }

    // Fallback to workspace-global state for backward compatibility
    const statePath = path.join(directory, ".opencode", "state", "execution-state.md")
    if (!existsSync(statePath)) return new Set()

    const state = readFileSync(statePath, "utf-8")
    const goalMatch = /\\*\\*Goal\\*\\*:\\s*(.+)/i.exec(state)
    const taskLines = state.split("\\n").filter((line) => /^\\s*-\\s*\\[/.test(line))
    const taskText = [goalMatch?.[1] ?? "", ...taskLines].join(" ")
    return extractKeywords(stripCodeBlocks(taskText))
  }

  function injectTaskScopedContext(sessionID: string): CollectedEntry[] {
    const collector = collectorForSession(sessionID)
    const runtime = loadRuntimeMetadata(directory, sessionID)
    const planPath = resolvePlanPath(directory, runtime)
    const taskContext = planPath ? loadTaskPlanContext(planPath, runtime?.taskID) : null
    const signals = taskSignals(runtime, taskContext)
    const testFocused = isTestFocusedTask(taskContext, runtime)
    const addedKeys = [
      ...addPrinciples(directory, collector, signals.keywords, signals.rawText, { includeAlways: true, mode: "startup", testFocused }),
      ...addDomains(directory, collector, signals.keywords, signals.rawText, { mode: "startup", testFocused }),
    ]
    return collector.getNewEntries(addedKeys)
  }

  function hasTaskScopedRuntime(sessionID: string): boolean {
    return Boolean(loadRuntimeMetadata(directory, sessionID)?.taskID)
  }

  function injectMainAgentStartupContext(sessionID: string): CollectedEntry[] {
    const seed = startupSeedBySession.get(sessionID)
    if (!seed) return []

    const collector = collectorForSession(sessionID)
    const signals = startupSeedSignals(directory, seed)
    const testFocused = isPromptTestFocused(signals.rawText)
    const addedKeys = [
      ...addPrinciples(directory, collector, signals.keywords, signals.rawText, { includeAlways: true, mode: "startup", testFocused }),
      ...addDomains(directory, collector, signals.keywords, signals.rawText, { mode: "startup", testFocused }),
    ]
    return collector.getNewEntries(addedKeys)
  }

  function renderStartupContext(entries: CollectedEntry[], collector: ContextCollector, scope: "task" | "session"): string | null {
    const injected = entries.length > 0 ? entries : collector.getAll()
    if (injected.length === 0) return null

    return (
      \`[carl-inject] \${scope === "task" ? "Task-scoped" : "Delegated session"} startup context. Use this before searching the repo or opening README/principles/domain docs:\\n\\n\` +
      collector.formatForOutput(injected)
    )
  }

  return {
    event: async ({ event }: { event: { type: string; properties?: Record<string, unknown> } }) => {
      if (event.type !== "session.created") return
      const sessionID = typeof event.properties?.sessionID === "string" ? event.properties.sessionID : undefined
      if (!sessionID) return
      const info = typeof event.properties?.info === "object" && event.properties.info
        ? (event.properties.info as Record<string, unknown>)
        : undefined
      const parentID = typeof info?.parentID === "string" ? info.parentID : undefined
      if (parentID) {
        const queue = pendingStartupSeedsByParent.get(parentID)
        const seed = queue?.shift()
        if (seed) {
          startupSeedBySession.set(sessionID, seed)
          if (queue && queue.length > 0) pendingStartupSeedsByParent.set(parentID, queue)
          else pendingStartupSeedsByParent.delete(parentID)
        }
      }
      injectTaskScopedContext(sessionID)
      injectMainAgentStartupContext(sessionID)
    },

    "tool.execute.before": async (
      input: { tool: string; sessionID: string },
      output: { args: Record<string, unknown> }
    ) => {
      if (input.tool !== "Task" && input.tool !== "task") return

      const subagentType = typeof output.args?.subagent_type === "string"
        ? output.args.subagent_type
        : typeof output.args?.subagentType === "string"
          ? output.args.subagentType
          : undefined
      const prompt = typeof output.args?.prompt === "string" ? output.args.prompt.trim() : ""
      if (!prompt) return
      if (!shouldSeedStartupPrompt(prompt, subagentType)) return
      const taskContract = loadTaskContractSeed(directory, output.args)

      const queue = pendingStartupSeedsByParent.get(input.sessionID) ?? []
      queue.push({
        prompt,
        subagentType,
        featureSlug: taskContract?.featureSlug ?? extractFeatureSlugFromPrompt(prompt) ?? undefined,
        taskID: taskContract?.taskID,
        targetRepoRoot: taskContract?.targetRepoRoot,
        planPath: taskContract?.planPath ?? extractPlanPathFromPrompt(prompt) ?? undefined,
        specPath: taskContract?.specPath,
        contextPath: taskContract?.contextPath,
        taskContractPath: taskContract?.taskContractPath,
      })
      pendingStartupSeedsByParent.set(input.sessionID, queue)
    },

    "chat.message": async (
      input: { sessionID: string },
      output: { message: { system?: string }; parts: unknown[] }
    ) => {
      if (preloadedSessions.has(input.sessionID)) return

      const collector = collectorForSession(input.sessionID)
      const taskScoped = hasTaskScopedRuntime(input.sessionID)
      const taskEntries = taskScoped ? injectTaskScopedContext(input.sessionID) : []
      const scope = taskScoped ? "task" : "session"
      const newEntries = taskScoped ? taskEntries : injectMainAgentStartupContext(input.sessionID)
      const rendered = renderStartupContext(newEntries, collector, scope)
      if (!rendered) return

      output.message.system = output.message.system ? \`\${output.message.system}\\n\\n\${rendered}\` : rendered
      preloadedSessions.add(input.sessionID)
    },

    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      if (input.tool !== "Read") return

      const filePath: string = input.args?.path ?? input.args?.file_path ?? ""
      if (!filePath) return

      const allKeywords = new Set<string>()
      const taskKeywords = loadTaskKeywords(input.sessionID)
      for (const keyword of taskKeywords) allKeywords.add(keyword)

      const fileContent = output.output ?? ""
      const strippedContent = stripCodeBlocks(fileContent)
      const contentKeywords = extractKeywords(strippedContent)
      for (const keyword of contentKeywords) allKeywords.add(keyword)

      const pathKeywords = extractPathKeywords(filePath)
      for (const keyword of pathKeywords) allKeywords.add(keyword)

      if (allKeywords.size === 0) return

      const rawSignal = [
        strippedContent,
        filePath,
        ...Array.from(taskKeywords),
        ...Array.from(pathKeywords),
      ].join(" ").toLowerCase()
      const testFocused = isTestFocusedRead(filePath, rawSignal)

      const collector = collectorForSession(input.sessionID)
      const addedKeys = [
        ...addPrinciples(directory, collector, allKeywords, rawSignal, { includeAlways: true, mode: "read", testFocused }),
        ...addDomains(directory, collector, allKeywords, rawSignal, { mode: "read", testFocused }),
      ]
      if (addedKeys.length === 0) return

      const newEntries = collector.getNewEntries(addedKeys)
      if (newEntries.length > 0) output.output += "\\n\\n" + collector.formatForOutput(newEntries)
    },

    "experimental.session.compacting": async (
      input: { sessionID?: string },
      output: { context: string[]; prompt?: string }
    ) => {
      if (!input.sessionID) return

      const collector = collectorsBySession.get(input.sessionID)
      if (!collector) return

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

// ─── Skill Inject (reads from skill-map.json for dynamic extension) ─────────

function getBaseSkillMap(
  projectType: ProjectType,
  isKotlin: boolean,
): Array<{ pattern: string; skill: string }> {
  // Universal patterns (all types)
  const universal = [
    { pattern: "(^|\\/)AGENTS\\.md$", skill: "j.agents-md-writing" },
    { pattern: "(^|\\/)\\.opencode\\/skills\\/[^/]+\\/SKILL\\.md$|(^|\\/)\\.opencode\\/skill-map\\.json$|(^|\\/)\\.opencode\\/evals\\/.*(skill|behavioral).*(\\.xml|\\.json|\\.md|\\.ts)$", skill: "skill-creator" },
    { pattern: "docs\\/domain\\/.*\\.md$", skill: "j.domain-doc-writing" },
    { pattern: "docs\\/principles\\/.*(?:\\.md|manifest)$", skill: "j.principle-doc-writing" },
    { pattern: "(^|\\/)(\\.opencode\\/scripts|scripts)\\/.*\\.sh$", skill: "j.shell-script-writing" },
    { pattern: "(^|\\/)pre-commit$", skill: "j.shell-script-writing" },
  ]

  if (projectType === "java" && isKotlin) {
    return [
      { pattern: "Test\\.kt$", skill: "j.test-writing" },
      { pattern: "Tests\\.kt$", skill: "j.test-writing" },
      { pattern: "IT\\.kt$", skill: "j.test-writing" },
      { pattern: "Test\\.java$", skill: "j.test-writing" },
      ...universal,
    ]
  }

  switch (projectType) {
    case "node-nextjs":
      return [
        { pattern: "\\.test\\.(ts|tsx|js|jsx)$", skill: "j.test-writing" },
        { pattern: "\\.spec\\.(ts|tsx|js|jsx)$", skill: "j.test-writing" },
        { pattern: "app\\/.*\\/page\\.(tsx|jsx)$", skill: "j.page-creation" },
        { pattern: "app\\/api\\/.*\\.(ts|js)$", skill: "j.api-route-creation" },
        { pattern: "actions\\.(ts|js)$", skill: "j.server-action-creation" },
        { pattern: "schema\\.prisma$", skill: "j.schema-migration" },
        ...universal,
      ]
    case "node-generic":
      return [
        { pattern: "\\.test\\.(ts|tsx|js|jsx)$", skill: "j.test-writing" },
        { pattern: "\\.spec\\.(ts|tsx|js|jsx)$", skill: "j.test-writing" },
        ...universal,
      ]
    case "python":
      return [
        { pattern: "test_.*\\.py$", skill: "j.test-writing" },
        { pattern: ".*_test\\.py$", skill: "j.test-writing" },
        ...universal,
      ]
    case "go":
      return [
        { pattern: "_test\\.go$", skill: "j.test-writing" },
        ...universal,
      ]
    case "java":
      return [
        { pattern: "Test\\.java$", skill: "j.test-writing" },
        { pattern: "Tests\\.java$", skill: "j.test-writing" },
        { pattern: "IT\\.java$", skill: "j.test-writing" },
        ...universal,
      ]
    case "generic":
    default:
      return [...universal]
  }
}

function skillInject(projectType: ProjectType, isKotlin: boolean): string {
  const fallbackJson = JSON.stringify(getBaseSkillMap(projectType, isKotlin))

  // Build the plugin source as a plain string to avoid template escaping issues
  const lines = [
    'import type { Plugin } from "@opencode-ai/plugin"',
    'import { existsSync, readFileSync } from "fs"',
    'import path from "path"',
    'import { findContainingProjectRoot } from "../lib/j.workspace-paths"',
    '',
    '// Injects skill instructions via tool.execute.after on Read + Write.',
    '// SKILL_MAP is loaded from .opencode/skill-map.json for dynamic',
    '// extension by /j.finish-setup. Falls back to hardcoded base patterns.',
    '',
    'interface SkillMapEntry { pattern: string; skill: string }',
    '',
    'function loadSkillMap(directory: string): Array<{ pattern: RegExp; skill: string }> {',
    '  const mapPath = path.join(directory, ".opencode", "skill-map.json")',
    '  let entries: SkillMapEntry[] = []',
    '',
    '  if (existsSync(mapPath)) {',
    '    try { entries = JSON.parse(readFileSync(mapPath, "utf-8")) } catch { entries = [] }',
    '  }',
    '',
    `  if (entries.length === 0) { entries = ${fallbackJson} }`,
    '',
    '  return entries.map((e) => ({ pattern: new RegExp(e.pattern), skill: e.skill }))',
    '}',
    '',
    'function resolveSkillPath(directory: string, skillName: string, filePath?: string): string | null {',
    '  // Check workspace-root skills first',
    '  const workspacePath = path.join(directory, ".opencode", "skills", skillName, "SKILL.md")',
    '  if (existsSync(workspacePath)) return workspacePath',
    '',
    '  // Check target project root skills as fallback',
    '  if (filePath) {',
    '    const projectRoot = findContainingProjectRoot(directory, filePath)',
    '    if (projectRoot && projectRoot !== directory) {',
    '      const projectPath = path.join(projectRoot, ".opencode", "skills", skillName, "SKILL.md")',
    '      if (existsSync(projectPath)) return projectPath',
    '    }',
    '  }',
    '',
    '  return null',
    '}',
    '',
    'export default (async ({ directory }: { directory: string }) => {',
    '  const injectedSkills = new Set<string>()',
    '  const skillMap = loadSkillMap(directory)',
    '',
    '  return {',
    '    "tool.execute.after": async (',
    '      input: { tool: string; sessionID: string; callID: string; args: any },',
    '      output: { title: string; output: string; metadata: any }',
    '    ) => {',
    '      const filePath: string = input.args?.path ?? input.args?.file_path ?? ""',
    '      if (!filePath) return',
    '',
    '      const match = skillMap.find(({ pattern }) => pattern.test(filePath))',
    '      if (!match) return',
    '',
    '      const key = `${input.sessionID}:${match.skill}`',
    '',
    '      if (input.tool === "Read") {',
    '        if (injectedSkills.has(key)) return',
    '        injectedSkills.add(key)',
    '',
    '        const skillPath = resolveSkillPath(directory, match.skill, filePath)',
    '        if (!skillPath) return',
    '',
    '        const skillContent = readFileSync(skillPath, "utf-8")',
    '        output.output +=',
    '          `\\n\\n[skill-inject] Skill activated for ${match.skill}:\\n\\n${skillContent}`',
    '      } else if (["Write", "Edit", "MultiEdit"].includes(input.tool)) {',
    '        if (injectedSkills.has(key)) return',
    '',
    '        const skillPath = resolveSkillPath(directory, match.skill, filePath)',
    '        if (!skillPath) return',
    '',
    '        injectedSkills.add(key)',
    '        output.output +=',
    '          `\\n\\n[skill-inject] IMPORTANT: Skill "${match.skill}" exists for this file type. ` +',
    '          `Read the matching file first to receive full skill instructions.`',
    '      }',
    '    },',
    '  }',
    '}) satisfies Plugin',
  ]

  return lines.join('\n') + '\n'
}

// ─── Directory Agents Injector (evolved) ─────────────────────────────────────

const DIR_AGENTS_INJECTOR = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { findContainingProjectRoot } from "../lib/j.workspace-paths"

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
  const injectedPathsBySession = new Map<string, Set<string>>()

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      if (input.tool !== "Read") return

      const filePath: string = input.args?.path ?? input.args?.file_path ?? ""
      if (!filePath || !filePath.startsWith(directory)) return

      // Resolve the actual project root containing this file, not the workspace root
      const projectRoot = findContainingProjectRoot(directory, filePath) ?? directory

      const injectedPaths = injectedPathsBySession.get(input.sessionID) ?? new Set<string>()
      injectedPathsBySession.set(input.sessionID, injectedPaths)

      const agentsMdFiles = findAgentsMdFiles(filePath, projectRoot)
      const toInject: string[] = []

      for (const agentsPath of agentsMdFiles) {
        if (injectedPaths.has(agentsPath)) continue
        injectedPaths.add(agentsPath)

        const content = readFileSync(agentsPath, "utf-8")
        const relPath = path.relative(projectRoot, agentsPath)
        toInject.push(\`[directory-agents-injector] Context from \${relPath}:\\n\\n\${content}\`)
      }

      if (toInject.length > 0) {
        output.output += "\\n\\n" + toInject.join("\\n\\n---\\n\\n")
      }
    },
  }
}) satisfies Plugin
`

// ─── Intent Gate (evolved) ───────────────────────────────────────────────────

const INTENT_GATE = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync, readdirSync } from "fs"
import path from "path"
import { resolveStateFile } from "../lib/j.state-paths"
import { loadActivePlanTarget, loadActivePlanTargets, resolvePathFromProjectRoot, resolveProjectPaths } from "../lib/j.workspace-paths"

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

function loadActivePlanContent(directory: string): string | null {
  const activePlanPath = resolveStateFile(directory, "active-plan.json")
  if (existsSync(activePlanPath)) {
    const activePlan = loadActivePlanTarget(directory) ?? JSON.parse(readFileSync(activePlanPath, "utf-8")) as { planPath?: string; targetRepoRoot?: string }
    const declaredPath = activePlan.planPath?.trim()
    if (!declaredPath) return null
    const projectPaths = resolveProjectPaths(directory, { targetRepoRoot: activePlan.targetRepoRoot, planPath: declaredPath })
    const resolvedPath = path.isAbsolute(declaredPath)
      ? declaredPath
      : projectPaths
        ? resolvePathFromProjectRoot(projectPaths.projectRoot, declaredPath)
        : path.join(directory, declaredPath)
    if (existsSync(resolvedPath)) {
      return readFileSync(resolvedPath, "utf-8")
    }
  }

  const statePath = resolveStateFile(directory, "execution-state.md")
  if (!existsSync(statePath)) return null

  const stateContent = readFileSync(statePath, "utf-8")
  const planMatch = stateContent.match(/\\*\\*Plan\\*\\*:\\s*(?:\\\`)?([^\\\`\\n\\s]+)(?:\\\`)?/)
  const declaredPlan = planMatch?.[1]?.trim()
  if (!declaredPlan) return null

  const activePlan = loadActivePlanTarget(directory)
  const projectPaths = resolveProjectPaths(directory, { targetRepoRoot: activePlan?.targetRepoRoot, planPath: declaredPlan })
  const resolvedPlan = path.isAbsolute(declaredPlan)
    ? declaredPlan
    : projectPaths
      ? resolvePathFromProjectRoot(projectPaths.projectRoot, declaredPlan)
      : path.join(directory, declaredPlan)
  if (!existsSync(resolvedPlan)) return null

  return readFileSync(resolvedPlan, "utf-8")
}

function readDirectoryNames(target: string): string[] {
  try {
    return readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function resolveSessionProjectRoot(directory: string, sessionID: string): string | null {
  const targets = loadActivePlanTargets(directory)
  for (const target of targets) {
    if (!target.targetRepoRoot) continue
    const projectPaths = resolveProjectPaths(directory, { targetRepoRoot: target.targetRepoRoot, planPath: target.planPath })
    const specsRoot = projectPaths?.specsRoot
    if (!specsRoot || !existsSync(specsRoot)) continue

    for (const featureSlug of readDirectoryNames(specsRoot)) {
      const runtimePath = path.join(specsRoot, featureSlug, "state", "sessions", \`\${sessionID}-runtime.json\`)
      if (!existsSync(runtimePath)) continue
      try {
        const runtime = JSON.parse(readFileSync(runtimePath, "utf-8")) as { targetRepoRoot?: string }
        return runtime.targetRepoRoot?.trim() || target.targetRepoRoot
      } catch {
        return target.targetRepoRoot
      }
    }
  }

  return loadActivePlanTarget(directory)?.targetRepoRoot?.trim() || null
}

function repoScopeWarning(directory: string, sessionID: string, filePath: string): string | null {
  if (!path.isAbsolute(filePath)) return null

  const targetProjectRoot = resolveSessionProjectRoot(directory, sessionID)
  if (!targetProjectRoot) return null

  const normalizedFilePath = path.resolve(filePath)
  const harnessRoot = path.join(directory, ".opencode")
  if (normalizedFilePath.startsWith(targetProjectRoot)) return null
  if (normalizedFilePath.startsWith(harnessRoot)) return null

  const relPath = path.relative(directory, normalizedFilePath).replace(/\\\\/g, "/")
  const relTarget = path.relative(directory, targetProjectRoot).replace(/\\\\/g, "/")
  return \`[intent-gate] REPO WARNING: "\${relPath}" is outside the current task/project scope. This session is scoped to "\${relTarget}".\`
}

export default (async ({ directory }: { directory: string }) => {
  const planFilesBySession = new Map<string, Set<string>>()

  function getPlanFiles(sessionID: string): Set<string> {
    const existing = planFilesBySession.get(sessionID)
    if (existing) return existing

    const planFiles = new Set<string>()
    const content = loadActivePlanContent(directory)
    if (content) {
      for (const file of extractPlanFiles(content)) planFiles.add(file)
    }

    planFilesBySession.set(sessionID, planFiles)
    return planFiles
  }

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      if (!["Read", "Write", "Edit", "MultiEdit"].includes(input.tool)) return

      const filePath: string = input.args?.path ?? input.args?.file_path ?? ""
      if (!filePath) return

      const scopeWarning = repoScopeWarning(directory, input.sessionID, filePath)
      if (scopeWarning) output.output += \`\\n\\n\${scopeWarning}\`

      if (!["Write", "Edit", "MultiEdit"].includes(input.tool)) return

      const planFiles = getPlanFiles(input.sessionID)

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

// ─── Memory (evolved) ────────────────────────────────────────────────────────

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

// ─── Task Runtime (evolved) ──────────────────────────────────────────────────

const TASK_RUNTIME = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import path from "path"
import {
  ensureFeatureStateStructure,
  featureStateSessionRuntimePath,
  featureStateTaskPaths,
} from "../lib/j.feature-state-paths"
import { loadJuninhoConfig } from "../lib/j.juninho-config"
import { resolveStateFile } from "../lib/j.state-paths"
import { loadActivePlanTarget, loadActivePlanTargets, resolveProjectPaths } from "../lib/j.workspace-paths"

type RuntimeTaskMetadata = {
  featureSlug: string
  taskID: string
  attempt: number
  stage: "implement" | "validate" | "check-reentry"
  planBranch: string
  planPath: string
  specPath: string
  contextPath: string
  statePath: string
  retryStatePath: string
  runtimePath: string
  taskContractPath: string
  targetRepoRoot: string
  parentSessionID: string
  ownerSessionID?: string
  ownerSessionTitle?: string
  originalPrompt: string
}

type ActivePlanContract = {
  slug?: string
  planPath?: string
  specPath?: string
  contextPath?: string
  workflowContractPath?: string
  targetRepoRoot?: string
  writeTargets?: Array<{
    project?: string
    planPath?: string
    specPath?: string
    contextPath?: string
    targetRepoRoot?: string
  }>
}

type TaskContract = {
  featureSlug?: string
  taskID?: string
  attempt?: number
  stage?: RuntimeTaskMetadata["stage"]
  planPath?: string
  specPath?: string
  contextPath?: string
  taskContractPath?: string
  targetRepoRoot?: string
}

type PersistedTaskContract = {
  featureSlug: string
  taskID: string
  attempt: number
  stage: RuntimeTaskMetadata["stage"]
  planPath: string
  specPath: string
  contextPath: string
  taskContractPath: string
  targetRepoRoot: string
  parentSessionID: string
  ownerSessionID?: string
  ownerSessionTitle?: string
  originalPrompt: string
}

type RetryState = {
  taskId: number
  attempt: number
  automaticRetriesUsed: number
  lastUpdatedAt: string
  lastReason?: string
  abortedSessionId?: string
  retriedFromAttempt?: number
}

type TrackedSession = {
  metadata: RuntimeTaskMetadata
  startedAtMs: number
  lastEventAtMs: number
}

type SessionStatus = { type: "idle" | "retry" | "busy" }

type SessionStatusMap = Record<string, SessionStatus>

type RuntimeRecord = {
  taskId?: number
  taskID?: string
  featureSlug?: string
  attempt?: number
  branch?: string
  planBranch?: string
  status?: string
  sessionId?: string
  ownerSessionID?: string
  startedAt?: string
  lastHeartbeat?: string
  stage?: RuntimeTaskMetadata["stage"]
  planPath?: string
  specPath?: string
  contextPath?: string
  statePath?: string
  retryStatePath?: string
  runtimePath?: string
  taskContractPath?: string
  targetRepoRoot?: string
  parentSessionID?: string
  ownerSessionTitle?: string
  originalPrompt?: string
}

const MAX_AUTOMATIC_RETRIES = 1
const TASK_START_TIMEOUT_MS = 2 * 60 * 1000
const IMPLEMENT_STALE_MS = 5 * 60 * 1000
const VALIDATE_STALE_MS = 3 * 60 * 1000
const BUSY_GRACE_MULTIPLIER = 2
const WATCHDOG_POLL_MS = 30 * 1000

function toRepoRelative(directory: string, filePath: string): string {
  return path.relative(directory, filePath) || "."
}

function toProjectRelative(projectRoot: string, filePath: string): string {
  return path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) || "." : filePath
}

function absoluteFromWorkspace(directory: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(directory, filePath)
}

function isoNow(): string {
  return new Date().toISOString()
}

function extractFeatureSlug(prompt: string): string | null {
  return prompt.match(/docs\\/specs\\/([^/]+)\\//)?.[1] ?? null
}

function extractPlanPath(prompt: string): string | null {
  return prompt.match(/(?:[\\w.-]+\\/)+docs\\/specs\\/[^\\s]+\\/plan\\.md|docs\\/specs\\/[^\\s]+\\/plan\\.md/)?.[0] ?? null
}

function extractFeatureSlugFromPlanPath(planPath: string): string | null {
  return planPath.match(/docs\\/specs\\/([^/]+)\\//)?.[1] ?? null
}

function extractStructuredString(prompt: string, label: string): string | null {
  const match = prompt.match(new RegExp(\`^\${label}:\\\\s*(.+)$\`, "im"))?.[1]?.trim()
  return match && match.length > 0 ? match : null
}

function extractTaskID(prompt: string): string | null {
  const explicitTask = extractStructuredString(prompt, "Task")
  if (explicitTask?.match(/^\\d+$/)) return explicitTask
  return prompt.match(/(?:Execute|executing|Validate|validating) task\\s+(\\d+)\\b/i)?.[1] ?? null
}

function extractStage(prompt: string): RuntimeTaskMetadata["stage"] {
  const explicitStage = extractStructuredString(prompt, "Stage")?.toLowerCase()
  if (explicitStage === "validate") return "validate"
  if (explicitStage === "check-reentry") return "check-reentry"
  if (explicitStage === "implement") return "implement"
  if (/\\bvalidate\\b|\\bvalidator\\b/i.test(prompt)) return "validate"
  if (/check-review\\.md|check-all-output\\.txt|functional-validation-plan\\.md/i.test(prompt)) return "check-reentry"
  return "implement"
}

function extractAttempt(prompt: string): number {
  const raw = prompt.match(/Attempt:\\s*(\\d+)/i)?.[1]
  return raw ? Number.parseInt(raw, 10) : 1
}

function loadActivePlan(directory: string): ActivePlanContract | null {
  const activePlanFile = resolveStateFile(directory, "active-plan.json")
  if (!existsSync(activePlanFile)) return null

  try {
    const parsed = JSON.parse(readFileSync(activePlanFile, "utf-8")) as ActivePlanContract
    const primary = loadActivePlanTarget(directory)
    return {
      ...parsed,
      ...(primary ?? {}),
      writeTargets: loadActivePlanTargets(directory),
    }
  } catch {
    return null
  }
}

function selectMatchingWriteTarget(prompt: string, activePlan: ActivePlanContract | null) {
  const targets = Array.isArray(activePlan?.writeTargets) ? activePlan.writeTargets : []
  if (targets.length <= 1) return null

  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt) return null

  const scored = targets.map((target) => {
    const repoRoot = target.targetRepoRoot?.trim()
    const planPath = target.planPath?.trim()
    const specPath = target.specPath?.trim()
    const contextPath = target.contextPath?.trim()
    const project = target.project?.trim()
    let score = 0

    if (repoRoot && normalizedPrompt.includes(repoRoot)) score += 100
    if (project && normalizedPrompt.includes(project)) score += 50
    if (planPath && normalizedPrompt.includes(planPath)) score += 10
    if (specPath && normalizedPrompt.includes(specPath)) score += 5
    if (contextPath && normalizedPrompt.includes(contextPath)) score += 5

    return { target, score }
  })

  scored.sort((left, right) => right.score - left.score)
  return scored[0]?.score ? scored[0].target : null
}

function loadTaskContract(directory: string, args: Record<string, unknown>): TaskContract | null {
  const contractArg = typeof args.contract === "object" && args.contract
    ? (args.contract as Record<string, unknown>)
    : null

  if (contractArg) {
    return {
      featureSlug: typeof contractArg.featureSlug === "string" ? contractArg.featureSlug : undefined,
      taskID: typeof contractArg.taskID === "string" ? contractArg.taskID : typeof contractArg.taskID === "number" ? String(contractArg.taskID) : undefined,
      attempt: typeof contractArg.attempt === "number" ? contractArg.attempt : undefined,
      stage: contractArg.stage === "implement" || contractArg.stage === "validate" || contractArg.stage === "check-reentry"
        ? contractArg.stage
        : undefined,
      planPath: typeof contractArg.planPath === "string" ? contractArg.planPath : undefined,
      specPath: typeof contractArg.specPath === "string" ? contractArg.specPath : undefined,
      contextPath: typeof contractArg.contextPath === "string" ? contractArg.contextPath : undefined,
      taskContractPath: typeof contractArg.taskContractPath === "string" ? contractArg.taskContractPath : undefined,
      targetRepoRoot: typeof contractArg.targetRepoRoot === "string" ? contractArg.targetRepoRoot : undefined,
    }
  }

  const contractPathArg = typeof args.task_contract_path === "string"
    ? args.task_contract_path
    : typeof args.taskContractPath === "string"
      ? args.taskContractPath
      : undefined
  if (!contractPathArg) return null

  const absolutePath = path.isAbsolute(contractPathArg) ? contractPathArg : path.join(directory, contractPathArg)
  if (!existsSync(absolutePath)) return null

  try {
    const contract = JSON.parse(readFileSync(absolutePath, "utf-8")) as TaskContract
    return {
      ...contract,
      taskContractPath: contractPathArg,
    }
  } catch {
    return null
  }
}

function buildMetadata(directory: string, parentSessionID: string, prompt: string, args: Record<string, unknown>): RuntimeTaskMetadata | null {
  const config = loadJuninhoConfig(directory)
  if (config.workflow?.implement?.watchdogSessionStale === false) return null

  const activePlan = loadActivePlan(directory)
  const taskContract = loadTaskContract(directory, args)
  const matchedTarget = selectMatchingWriteTarget(prompt, activePlan)
  const promptPlanPath = extractPlanPath(prompt)
  const planPath = taskContract?.planPath?.trim() ?? promptPlanPath ?? matchedTarget?.planPath?.trim() ?? activePlan?.planPath?.trim() ?? null
  const featureSlug = taskContract?.featureSlug?.trim() ?? extractFeatureSlug(prompt) ?? activePlan?.slug?.trim() ?? (planPath ? extractFeatureSlugFromPlanPath(planPath) : null)
  const taskID = taskContract?.taskID?.trim() ?? extractTaskID(prompt)
  if (!featureSlug || !taskID) return null

  const projectPaths = resolveProjectPaths(directory, {
    prompt,
    targetRepoRoot: taskContract?.targetRepoRoot?.trim() || matchedTarget?.targetRepoRoot?.trim() || activePlan?.targetRepoRoot,
    planPath: planPath ?? undefined,
    specPath: taskContract?.specPath?.trim() || matchedTarget?.specPath?.trim() || activePlan?.specPath?.trim(),
    contextPath: taskContract?.contextPath?.trim() || matchedTarget?.contextPath?.trim() || activePlan?.contextPath?.trim(),
    taskContractPath: taskContract?.taskContractPath?.trim(),
  })
  if (!projectPaths) return null

  ensureFeatureStateStructure(directory, featureSlug, { targetRepoRoot: projectPaths.projectRoot })
  const taskPaths = featureStateTaskPaths(directory, featureSlug, taskID, { targetRepoRoot: projectPaths.projectRoot })
  mkdirSync(taskPaths.taskDir, { recursive: true })

  const taskContractPath = toProjectRelative(
    projectPaths.projectRoot,
    taskContract?.taskContractPath?.trim() || taskPaths.contractPath
  )

  return {
    featureSlug,
    taskID,
    attempt: taskContract?.attempt ?? extractAttempt(prompt),
    stage: taskContract?.stage ?? extractStage(prompt),
    planBranch: "feature/" + featureSlug,
    planPath: toProjectRelative(projectPaths.projectRoot, planPath || \`docs/specs/\${featureSlug}/plan.md\`),
    specPath: toProjectRelative(projectPaths.projectRoot, taskContract?.specPath?.trim() || matchedTarget?.specPath?.trim() || activePlan?.specPath?.trim() || \`docs/specs/\${featureSlug}/spec.md\`),
    contextPath: toProjectRelative(projectPaths.projectRoot, taskContract?.contextPath?.trim() || matchedTarget?.contextPath?.trim() || activePlan?.contextPath?.trim() || \`docs/specs/\${featureSlug}/CONTEXT.md\`),
    statePath: toRepoRelative(directory, taskPaths.statePath),
    retryStatePath: toRepoRelative(directory, taskPaths.retryStatePath),
    runtimePath: toRepoRelative(directory, taskPaths.runtimePath),
    taskContractPath,
    targetRepoRoot: projectPaths.projectRoot,
    parentSessionID,
    originalPrompt: prompt,
  }
}

function sessionRuntimePath(directory: string, metadata: RuntimeTaskMetadata, sessionID: string): string {
  return featureStateSessionRuntimePath(directory, metadata.featureSlug, sessionID, { targetRepoRoot: metadata.targetRepoRoot })
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T
  } catch {
    return null
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\\n", "utf-8")
}

function writeMetadata(filePath: string, metadata: RuntimeTaskMetadata): void {
  const existing = readJsonFile<RuntimeRecord>(filePath) ?? {}
  const sessionChanged = existing.attempt !== metadata.attempt
    || existing.ownerSessionID !== metadata.ownerSessionID
    || existing.sessionId !== metadata.ownerSessionID
  const now = isoNow()
  const next: RuntimeRecord = {
    ...existing,
    taskId: existing.taskId ?? Number.parseInt(metadata.taskID, 10),
    taskID: metadata.taskID,
    featureSlug: metadata.featureSlug,
    attempt: metadata.attempt,
    branch: existing.branch ?? metadata.planBranch,
    planBranch: metadata.planBranch,
    status: sessionChanged ? undefined : existing.status,
    sessionId: metadata.ownerSessionID ?? existing.sessionId,
    ownerSessionID: metadata.ownerSessionID,
    startedAt: sessionChanged ? now : existing.startedAt,
    lastHeartbeat: sessionChanged ? now : existing.lastHeartbeat,
    stage: metadata.stage,
    planPath: metadata.planPath,
    specPath: metadata.specPath,
    contextPath: metadata.contextPath,
    statePath: metadata.statePath,
    retryStatePath: metadata.retryStatePath,
    runtimePath: metadata.runtimePath,
    taskContractPath: metadata.taskContractPath,
    targetRepoRoot: metadata.targetRepoRoot,
    parentSessionID: metadata.parentSessionID,
    ownerSessionTitle: metadata.ownerSessionTitle,
    originalPrompt: metadata.originalPrompt,
  }
  writeJsonFile(filePath, next)
}

function writeTaskContract(directory: string, metadata: RuntimeTaskMetadata): void {
  const contractPath = path.join(metadata.targetRepoRoot, metadata.taskContractPath)
  const payload: PersistedTaskContract = {
    featureSlug: metadata.featureSlug,
    taskID: metadata.taskID,
    attempt: metadata.attempt,
    stage: metadata.stage,
    planPath: metadata.planPath,
    specPath: metadata.specPath,
    contextPath: metadata.contextPath,
    taskContractPath: metadata.taskContractPath,
    targetRepoRoot: metadata.targetRepoRoot,
    parentSessionID: metadata.parentSessionID,
    ownerSessionID: metadata.ownerSessionID,
    ownerSessionTitle: metadata.ownerSessionTitle,
    originalPrompt: metadata.originalPrompt,
  }
  writeJsonFile(contractPath, payload)
}

function readExecutionState(filePath: string): { status?: string; attempt?: number; lastHeartbeat?: string } {
  if (!existsSync(filePath)) return {}
  const content = readFileSync(filePath, "utf-8")
  const status = content.match(/\\*\\*Status\\*\\*:\\s*([^\\n]+)/)?.[1]?.trim()
  const attemptRaw = content.match(/\\*\\*Attempt\\*\\*:\\s*(\\d+)/)?.[1]
  const lastHeartbeat = content.match(/\\*\\*Last heartbeat\\*\\*:\\s*([^\\n]+)/)?.[1]?.trim()
  return {
    status,
    attempt: attemptRaw ? Number.parseInt(attemptRaw, 10) : undefined,
    lastHeartbeat,
  }
}

function readRuntimeStatus(filePath: string): { status?: string; attempt?: number; lastHeartbeat?: string; sessionID?: string } {
  const parsed = readJsonFile<RuntimeRecord>(filePath)
  if (!parsed) return {}
  return {
    status: parsed.status,
    attempt: typeof parsed.attempt === "number" ? parsed.attempt : undefined,
    lastHeartbeat: parsed.lastHeartbeat,
    sessionID: parsed.sessionId ?? parsed.ownerSessionID,
  }
}

function writeRuntimeStatus(filePath: string, patch: Partial<RuntimeRecord>): void {
  const existing = readJsonFile<RuntimeRecord>(filePath) ?? {}
  const next: RuntimeRecord = {
    ...existing,
    ...patch,
  }
  writeJsonFile(filePath, next)
}

function readRetryState(filePath: string, taskID: string, attempt: number): RetryState {
  const existing = readJsonFile<RetryState>(filePath)
  return {
    taskId: Number.parseInt(taskID, 10),
    attempt,
    automaticRetriesUsed: existing?.automaticRetriesUsed ?? 0,
    lastUpdatedAt: existing?.lastUpdatedAt ?? isoNow(),
    lastReason: existing?.lastReason,
    abortedSessionId: existing?.abortedSessionId,
    retriedFromAttempt: existing?.retriedFromAttempt,
  }
}

function writeRetryState(filePath: string, next: RetryState): void {
  writeJsonFile(filePath, {
    ...next,
    lastUpdatedAt: isoNow(),
  })
}

function markSupersededExecutionState(filePath: string, attempt: number): void {
  if (!existsSync(filePath)) return
  const content = readFileSync(filePath, "utf-8")
  const nextContent = content
    .replace(/(\\*\\*Status\\*\\*:\\s*)([^\\n]+)/, \`$1SUPERSEDED\`)
    .replace(/(\\*\\*Last heartbeat\\*\\*:\\s*)([^\\n]+)/, \`$1\${isoNow()}\`)
  const retryLine = \`- **Retry of**: \${attempt}\`
  const finalContent = nextContent.includes("**Retry of**:")
    ? nextContent.replace(/(\\*\\*Retry of\\*\\*:\\s*)([^\\n]+)/, \`$1\${attempt}\`)
    : nextContent.replace(/(\\*\\*Depends on\\*\\*:[^\\n]*\\n)/, \`$1\${retryLine}\\n\`)
  writeFileSync(filePath, finalContent, "utf-8")
}

function isTerminalStatus(status?: string): boolean {
  return status === "COMPLETE" || status === "FAILED" || status === "BLOCKED" || status === "SUPERSEDED"
}

function parseStaleThresholdMs(stage: RuntimeTaskMetadata["stage"], busy: boolean): number {
  const base = stage === "validate" ? VALIDATE_STALE_MS : IMPLEMENT_STALE_MS
  return busy ? base * BUSY_GRACE_MULTIPLIER : base
}

function buildRetryPrompt(metadata: RuntimeTaskMetadata, nextAttempt: number, reason: string): string {
  return [
    metadata.originalPrompt.trim(),
    \`Attempt: \${nextAttempt}\`,
    \`Retry of: \${metadata.attempt}\`,
    \`Stage: \${metadata.stage}\`,
    \`Target Repo Root: \${metadata.targetRepoRoot}\`,
    \`Plan: \${metadata.planPath}\`,
    \`Spec: \${metadata.specPath}\`,
    \`Context: \${metadata.contextPath}\`,
    \`Task Contract Path: \${metadata.taskContractPath}\`,
    \`Retry reason: \${reason}\`,
    \`Read the existing execution state, validator output, retry state, and task contract before acting. Reuse partial artifacts and continue from the current task state instead of starting over.\`,
  ].join("\\n")
}

async function readSessionStatuses(client: any, directory: string): Promise<SessionStatusMap> {
  try {
    const result = await client.session.status({ directory })
    if (result?.data) return result.data as SessionStatusMap
    return result as SessionStatusMap
  } catch {
    return {}
  }
}

async function bestEffortAbortSession(client: any, directory: string, sessionID?: string): Promise<boolean> {
  if (!sessionID) return false

  try {
    await client.session.abort({ sessionID, directory })
    return true
  } catch {
    try {
      await client.session.delete({ sessionID, directory })
      return true
    } catch {
      return false
    }
  }
}

async function relaunchAttempt(client: any, metadata: RuntimeTaskMetadata, nextAttempt: number, reason: string): Promise<string | null> {
  try {
    const created = await client.session.create({
      directory: metadata.targetRepoRoot,
      parentID: metadata.parentSessionID,
      title: \`Execute task \${metadata.taskID} (retry \${nextAttempt})\`,
    })
    const newSessionID = created?.data?.id ?? created?.id
    if (!newSessionID) return null

    await client.session.promptAsync({
      sessionID: newSessionID,
      directory: metadata.targetRepoRoot,
      agent: metadata.stage === "validate" ? "j.validator" : "j.implementer",
      parts: [{ type: "text", text: buildRetryPrompt(metadata, nextAttempt, reason) }],
    })

    return newSessionID
  } catch {
    return null
  }
}

async function maybeRetryTrackedSession(
  client: any,
  directory: string,
  tracked: TrackedSession,
  statusMap: SessionStatusMap,
  trackedBySession: Map<string, TrackedSession>
): Promise<void> {
  const { metadata } = tracked
  const statePath = absoluteFromWorkspace(directory, metadata.statePath)
  const runtimePath = absoluteFromWorkspace(directory, metadata.runtimePath)
  const retryPath = absoluteFromWorkspace(directory, metadata.retryStatePath)

  const taskState = readExecutionState(statePath)
  const runtimeState = readRuntimeStatus(runtimePath)
  const effectiveStatus = taskState.status ?? runtimeState.status
  if (isTerminalStatus(effectiveStatus)) {
    trackedBySession.delete(metadata.ownerSessionID ?? "")
    return
  }

  const effectiveAttempt = taskState.attempt ?? runtimeState.attempt ?? metadata.attempt
  if (effectiveAttempt > metadata.attempt) {
    trackedBySession.delete(metadata.ownerSessionID ?? "")
    return
  }

  const retryState = readRetryState(retryPath, metadata.taskID, metadata.attempt)
  if (retryState.automaticRetriesUsed >= MAX_AUTOMATIC_RETRIES) return

  const sessionID = metadata.ownerSessionID
  const statusType = sessionID ? statusMap[sessionID]?.type : undefined
  const heartbeatSource = taskState.lastHeartbeat ?? runtimeState.lastHeartbeat
  const heartbeatMs = heartbeatSource ? Date.parse(heartbeatSource) : tracked.startedAtMs
  const ageMs = Date.now() - heartbeatMs
  const thresholdMs = effectiveStatus === undefined
    ? TASK_START_TIMEOUT_MS
    : parseStaleThresholdMs(metadata.stage, statusType === "busy")

  if (Number.isNaN(ageMs) || ageMs < thresholdMs) return

  const aborted = await bestEffortAbortSession(client, metadata.targetRepoRoot, sessionID)
  const nextAttempt = metadata.attempt + 1
  const retryReason = metadata.stage === "validate" ? "stale-validator-session" : "stale-task-session"

  const retriedMetadata: RuntimeTaskMetadata = {
    ...metadata,
    attempt: nextAttempt,
  }
  const newSessionID = await relaunchAttempt(client, retriedMetadata, nextAttempt, retryReason)
  if (!newSessionID) return

  markSupersededExecutionState(statePath, metadata.attempt)
  if (sessionID) {
    writeRuntimeStatus(sessionRuntimePath(directory, metadata, sessionID), {
      status: "SUPERSEDED",
      lastHeartbeat: isoNow(),
      sessionId: sessionID,
      ownerSessionID: sessionID,
    })
  }
  writeRetryState(retryPath, {
    ...retryState,
    attempt: nextAttempt,
    automaticRetriesUsed: retryState.automaticRetriesUsed + 1,
    lastReason: retryReason,
    abortedSessionId: aborted ? sessionID : retryState.abortedSessionId,
    retriedFromAttempt: metadata.attempt,
  })

  const nextMetadata: RuntimeTaskMetadata = {
    ...retriedMetadata,
    ownerSessionID: newSessionID,
    ownerSessionTitle: \`Execute task \${metadata.taskID} (retry \${nextAttempt})\`,
  }

  trackedBySession.delete(sessionID ?? "")
  trackedBySession.set(newSessionID, {
    metadata: nextMetadata,
    startedAtMs: Date.now(),
    lastEventAtMs: Date.now(),
  })

  writeTaskContract(directory, nextMetadata)
  writeMetadata(runtimePath, nextMetadata)
  writeMetadata(sessionRuntimePath(directory, nextMetadata, newSessionID), nextMetadata)
}

export default (async ({ directory, client }: { directory: string; client?: any }) => {
  const config = loadJuninhoConfig(directory)
  const watchdogEnabled = config.workflow?.implement?.watchdogSessionStale !== false
  const pendingByParent = new Map<string, RuntimeTaskMetadata[]>()
  const trackedBySession = new Map<string, TrackedSession>()

  async function runWatchdogSweep(): Promise<void> {
    if (!watchdogEnabled || !client?.session?.status || !client?.session?.create || !client?.session?.promptAsync) return
    if (trackedBySession.size === 0) return

    const statusMap = await readSessionStatuses(client, directory)
    for (const tracked of Array.from(trackedBySession.values())) {
      await maybeRetryTrackedSession(client, directory, tracked, statusMap, trackedBySession)
    }
  }

  if (watchdogEnabled && client?.session?.status && client?.session?.create && client?.session?.promptAsync) {
    const interval = setInterval(() => {
      void runWatchdogSweep()
    }, WATCHDOG_POLL_MS)
    interval.unref?.()
  }

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string },
      output: { args: Record<string, unknown> }
    ) => {
      if (input.tool !== "Task" && input.tool !== "task") return

      const prompt = typeof output.args?.prompt === "string" ? output.args.prompt : ""
      const metadata = buildMetadata(directory, input.sessionID, prompt, output.args)
      if (!metadata) return

      writeTaskContract(directory, metadata)
      const retryPath = absoluteFromWorkspace(directory, metadata.retryStatePath)
      if (!existsSync(retryPath)) {
        writeRetryState(retryPath, readRetryState(retryPath, metadata.taskID, metadata.attempt))
      }

      const queue = pendingByParent.get(input.sessionID) ?? []
      queue.push(metadata)
      pendingByParent.set(input.sessionID, queue)
    },

    event: async ({ event }: { event: { type: string; properties?: Record<string, unknown> } }) => {
      if (event.type === "session.created") {
        const sessionID = typeof event.properties?.sessionID === "string" ? event.properties.sessionID : undefined
        const info = typeof event.properties?.info === "object" && event.properties.info
          ? (event.properties.info as Record<string, unknown>)
          : undefined
        const parentID = typeof info?.parentID === "string" ? info.parentID : undefined
        const title = typeof info?.title === "string" ? info.title : ""
        if (!sessionID || !parentID) return

        const queue = pendingByParent.get(parentID)
        if (!queue || queue.length === 0) return

        const titleTaskID = extractTaskID(title)
        const index = titleTaskID ? queue.findIndex((item) => item.taskID === titleTaskID) : 0
        const resolvedIndex = index >= 0 ? index : 0
        const [metadata] = queue.splice(resolvedIndex, 1)
        if (!metadata) return

        if (queue.length > 0) pendingByParent.set(parentID, queue)
        else pendingByParent.delete(parentID)

        const resolvedMetadata: RuntimeTaskMetadata = {
          ...metadata,
          ownerSessionID: sessionID,
          ownerSessionTitle: title || undefined,
        }

        writeMetadata(absoluteFromWorkspace(directory, resolvedMetadata.runtimePath), resolvedMetadata)
        writeMetadata(sessionRuntimePath(directory, resolvedMetadata, sessionID), resolvedMetadata)
        writeTaskContract(directory, resolvedMetadata)
        trackedBySession.set(sessionID, {
          metadata: resolvedMetadata,
          startedAtMs: Date.now(),
          lastEventAtMs: Date.now(),
        })
        return
      }

      if (event.type === "session.deleted") {
        const sessionID = typeof event.properties?.sessionID === "string" ? event.properties.sessionID : undefined
        if (sessionID) trackedBySession.delete(sessionID)
        return
      }

      if (event.type !== "session.status" && event.type !== "session.idle") return

      const sessionID = typeof event.properties?.sessionID === "string" ? event.properties.sessionID : undefined
      if (!sessionID) return
      const tracked = trackedBySession.get(sessionID)
      if (!tracked) return

      tracked.lastEventAtMs = Date.now()
      await runWatchdogSweep()
    },
  }
}) satisfies Plugin
`

// ─── Auto Format (disabled/optional) ────────────────────────────────────────

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

// ─── Task Board (disabled/optional) ──────────────────────────────────────────

const TASK_BOARD = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { featureStateManifestPath, featureStateTaskPaths } from "./j.feature-state-paths"
import { resolveStateFile } from "./j.state-paths"

type TaskBoardRow = {
  id: string
  name: string
  wave: string
  depends: string
  status: string
  attempt: string
  heartbeat: string
  retryCount: string
  validatedCommit: string
  featureCommit: string
  integrationStatus: string
}

function getActiveFeatureSlug(directory: string): string | null {
  const statePath = resolveStateFile(directory, "execution-state.md")
  if (!existsSync(statePath)) return null

  const content = readFileSync(statePath, "utf-8")
  return content.match(/\\*\\*Feature slug\\*\\*:\\s*(?:\\\`)?([^\\\`\\s]+)/)?.[1] ?? null
}

function parsePlan(planPath: string): Array<{ id: string; name: string; wave: string; depends: string }> {
  if (!existsSync(planPath)) return []
  const content = readFileSync(planPath, "utf-8")
  const tasks = Array.from(content.matchAll(/<task id="([^"]+)" wave="([^"]+)" agent="[^"]+" depends="([^"]*)">[\\s\\S]*?<\\/task>/g))

  return tasks.map((match) => ({
    id: match[1],
    wave: match[2],
    depends: match[3] || "-",
    name: match[4].match(/<n>[\\s\\S]*?<\\/n>/)?.[1]?.trim() ?? "Task " + match[1],
  }))
}

function readStateValue(content: string, label: string): string {
  return content.match(new RegExp("- \\\\*\\\\*" + label + "\\\\*\\\\*:\\\\s*([^\\\\n]+)"))?.[1]?.trim() ?? "-"
}

function readRetryCount(retryPath: string): string {
  if (!existsSync(retryPath)) return "0"
  try {
    const parsed = JSON.parse(readFileSync(retryPath, "utf-8")) as { autoRetryCount?: number }
    return typeof parsed.autoRetryCount === "number" ? String(parsed.autoRetryCount) : "0"
  } catch {
    return "0"
  }
}

function buildBoard(directory: string): string | null {
  const slug = getActiveFeatureSlug(directory)
  if (!slug) return null

  const featureDir = path.join(directory, "docs", "specs", slug)
  const planPath = path.join(featureDir, "plan.md")
  const integrationPath = featureStateManifestPath(directory, slug)
  if (!existsSync(planPath)) return null

  const planTasks = parsePlan(planPath)
  if (planTasks.length === 0) return null

  let integrationManifest: { tasks?: Record<string, any> } | null = null
  if (existsSync(integrationPath)) {
    try {
      integrationManifest = JSON.parse(readFileSync(integrationPath, "utf-8")) as { tasks?: Record<string, any> }
    } catch {
      integrationManifest = null
    }
  }

  const rows: TaskBoardRow[] = planTasks.map((task) => {
    const taskPaths = featureStateTaskPaths(directory, slug, task.id)
    const content = existsSync(taskPaths.statePath) ? readFileSync(taskPaths.statePath, "utf-8") : ""
    const integrationEntry = integrationManifest?.tasks?.[task.id]

    return {
      id: task.id,
      name: task.name,
      wave: task.wave,
      depends: task.depends,
      status: content ? readStateValue(content, "Status") : "PENDING",
      attempt: content ? readStateValue(content, "Attempt") : "-",
      heartbeat: content ? readStateValue(content, "Last heartbeat") : "-",
      retryCount: readRetryCount(taskPaths.retryStatePath),
      validatedCommit: integrationEntry?.validatedCommit ?? "-",
      featureCommit: integrationEntry?.integration?.integratedCommit ?? "-",
      integrationStatus: integrationEntry?.integration?.method
        ? String(integrationEntry.integration.status ?? "pending") + "/" + String(integrationEntry.integration.method)
        : integrationEntry?.integration?.status ?? "pending",
    }
  })

  return [
    "[task-board] Feature: " + slug,
    "",
    "| ID | Wave | Depends | Status | Attempt | Retries | Validated Commit | Feature Commit | Integration | Heartbeat | Task |",
    "|----|------|---------|--------|---------|---------|------------------|----------------|-------------|-----------|------|",
    ...rows.map((row) =>
      "| " + row.id + " | " + row.wave + " | " + row.depends + " | " + row.status + " | " + row.attempt + " | " + row.retryCount + " | " + row.validatedCommit + " | " + row.featureCommit + " | " + row.integrationStatus + " | " + row.heartbeat + " | " + row.name + " |"
    ),
  ].join("\\n")
}

export default (async ({ directory }: { directory: string }) => {
  const lastBoardBySession = new Map<string, string>()

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: any },
      output: { title: string; output: string; metadata: any }
    ) => {
      const board = buildBoard(directory)
      if (!board) return
      if (lastBoardBySession.get(input.sessionID) === board) return

      lastBoardBySession.set(input.sessionID, board)
      output.output += "\\n\\n" + board
    },
    "experimental.session.compacting": async (
      _input: { sessionID?: string },
      output: { context: string[] }
    ) => {
      const board = buildBoard(directory)
      if (!board) return

      output.context.push(board)
    },
  }
}) satisfies Plugin
`

// ─── Notify (disabled/optional) ──────────────────────────────────────────────

const NOTIFY = `import type { Plugin } from "@opencode-ai/plugin"
import { execFileSync } from "child_process"
import { platform } from "os"

const TITLE = "opencode"

function escapeAppleScript(value: string): string {
  return value.replace(/\\\\/g, "\\\\\\\\").replace(/\\"/g, '\\\\\\"')
}

function sendNotification(message: string): void {
  try {
    const os = platform()
    if (os === "darwin") {
      const script = 'display notification "' + escapeAppleScript(message) + '" with title "' + TITLE + '" sound name "Glass"'
      execFileSync("osascript", ["-e", script], {
        stdio: "ignore",
        timeout: 5000,
      })
      return
    }
    if (os === "linux") {
      execFileSync("notify-send", [TITLE, message, "--expire-time=5000"], {
        stdio: "ignore",
        timeout: 5000,
      })
    }
  } catch {
    // Never block the session on notification failures.
  }
}

export default (async (_ctx: { directory: string }) => ({
  "session.idle": async (_input: Record<string, unknown>, output: { metadata?: Record<string, unknown> }) => {
    const reason = typeof output.metadata?.reason === "string" ? output.metadata.reason : "idle session detected"
    sendNotification(reason)
  },
})) satisfies Plugin
`

// ─── Todo Enforcer (disabled/optional) ───────────────────────────────────────

const TODO_ENFORCER = `import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync, readdirSync } from "fs"
import path from "path"
import { featureStateTaskDir } from "./j.feature-state-paths"
import { resolveStateFile } from "./j.state-paths"

// Re-injects incomplete tasks to prevent the agent from forgetting pending work.
// Three sources of truth (checked in order):
//   1. .opencode/state/execution-state.md — global session summary
//   2. docs/specs/{slug}/state/tasks/task-*/execution-state.md — per-task state files
//
// Two hooks:
//   experimental.session.compacting — injects pending tasks into compaction
//     context so they survive context window resets.
//   tool.execute.after on Write/Edit — lean reminder of pending count after
//     file modifications, nudging the agent to continue.

function getIncompleteFromFile(filePath: string): string[] {
  if (!existsSync(filePath)) return []
  const content = readFileSync(filePath, "utf-8")
  return content
    .split("\\n")
    .filter((line) => /^\\s*-\\s*\\[\\s*\\]/.test(line))
    .map((line) => line.trim())
}

function parseTaskState(filePath: string): string | null {
  if (!existsSync(filePath)) return null

  const content = readFileSync(filePath, "utf-8")
  const statusMatch = content.match(/- \*\*Status\*\*:\s*([^\n]+)/)
  const waveMatch = content.match(/- \*\*Wave\*\*:\s*([^\n]+)/)
  const attemptMatch = content.match(/- \*\*Attempt\*\*:\s*([^\n]+)/)
  const heartbeatMatch = content.match(/- \*\*Last heartbeat\*\*:\s*([^\n]+)/)
  const failureMatch = content.match(/## Failure Details \(if FAILED\/BLOCKED\)\n([\s\S]*)$/)
  const fileNameMatch = filePath.match(/tasks\/task-(\d+)\/execution-state\.md$/)

  const taskID = fileNameMatch?.[1] ?? "?"
  const status = statusMatch?.[1]?.trim()
  if (!status || status === "COMPLETE") return null

  const wave = waveMatch?.[1]?.trim() ?? "?"
  const attempt = attemptMatch?.[1]?.trim() ?? "1"
  const heartbeat = heartbeatMatch?.[1]?.trim()
  const failure = failureMatch?.[1]?.trim()

  let summary = "- [ ] Task " + taskID + " (wave " + wave + ", attempt " + attempt + ") — " + status
  if (heartbeat) summary += " — heartbeat " + heartbeat
  if (status === "FAILED" || status === "BLOCKED") {
    const detail = failure && failure !== "None." ? failure.split("\\n")[0].trim() : "see task state"
    summary += " — " + detail
  }

  return summary
}

function getActiveFeatureSlug(directory: string): string | null {
  const statePath = resolveStateFile(directory, "execution-state.md")
  if (!existsSync(statePath)) return null

  const content = readFileSync(statePath, "utf-8")
  const planMatch = content.match(/\*\*Plan\*\*:\s*(?:\`)?(?:docs\/specs\/([^/\`\s]+)\/plan\.md)/)
  if (planMatch) return planMatch[1]

  const slugMatch = content.match(/\*\*Feature slug\*\*:\s*(?:\`)?([^\`\s]+)/)
  if (slugMatch) return slugMatch[1]

  return null
}

function getPerTaskIncomplete(directory: string, slug: string): string[] {
  const tasksDir = path.join(directory, "docs", "specs", slug, "state", "tasks")
  if (!existsSync(tasksDir)) return []

  const tasks: string[] = []
  try {
    const taskDirs = readdirSync(tasksDir).filter((f) => f.startsWith("task-"))
    for (const taskDirName of taskDirs) {
      const taskDir = featureStateTaskDir(directory, slug, taskDirName.replace(/^task-/, ""))
      const summary = parseTaskState(path.join(taskDir, "execution-state.md"))
      if (summary) tasks.push(summary)
    }
  } catch {
    // Directory read failed — silently skip
  }
  return tasks
}

function getIncompleteTasks(directory: string): string[] {
  const globalPath = resolveStateFile(directory, "execution-state.md")
  const globalTasks = getIncompleteFromFile(globalPath)

  const slug = getActiveFeatureSlug(directory)
  const perTaskTasks = slug ? getPerTaskIncomplete(directory, slug) : []

  const seen = new Set<string>()
  const all: string[] = []
  for (const task of [...globalTasks, ...perTaskTasks]) {
    if (!seen.has(task)) {
      seen.add(task)
      all.push(task)
    }
  }
  return all
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

// ─── Comment Checker (disabled/optional) ─────────────────────────────────────

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

// ─── Hashline Read (disabled/optional) ───────────────────────────────────────

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

// ─── Hashline Edit (disabled/optional) ───────────────────────────────────────

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
