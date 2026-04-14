import { writeFileSync } from "fs"
import path from "path"

export function writeLib(projectDir: string): void {
  const libDir = path.join(projectDir, ".opencode", "lib")

  writeFileSync(path.join(libDir, "j.workspace-paths.ts"), WORKSPACE_PATHS)
  writeFileSync(path.join(libDir, "j.feature-state-paths.ts"), FEATURE_STATE_PATHS)
  writeFileSync(path.join(libDir, "j.state-paths.ts"), STATE_PATHS)
  writeFileSync(path.join(libDir, "j.juninho-config.ts"), JUNINHO_CONFIG)
}

const WORKSPACE_PATHS = `import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import path from "path"

type ProjectHints = {
  prompt?: string
  planPath?: string
  specPath?: string
  contextPath?: string
  taskContractPath?: string
  targetRepoRoot?: string
}

type ActivePlanTarget = {
  project?: string
  slug?: string
  planPath?: string
  specPath?: string
  contextPath?: string
  targetRepoRoot?: string
}

type ActivePlanReferenceProject = {
  project?: string
  targetRepoRoot?: string
  reason?: string
}

type ActivePlanState = ActivePlanTarget & {
  writeTargets?: ActivePlanTarget[]
  targets?: ActivePlanTarget[]
  referenceProjects?: ActivePlanReferenceProject[]
}

type ProjectPaths = {
  workspaceRoot: string
  harnessRoot: string
  projectRoot: string
  stateRoot: string
  docsRoot: string
  specsRoot: string
  principlesRoot: string
  domainRoot: string
  projectLabel: string
}

const IGNORED_DIRS = new Set([
  ".git",
  ".idea",
  ".opencode",
  "build",
  "dist",
  "node_modules",
  "target",
  "tmp",
  "worktrees",
])

const discoveryCache = new Map<string, string[]>()

function normalizePath(filePath: string): string {
  return filePath.replace(/\\\\/g, "/")
}

function looksLikeProjectRoot(directory: string): boolean {
  if (!existsSync(directory)) return false
  return existsSync(path.join(directory, ".git")) || (existsSync(path.join(directory, "opencode.json")) && existsSync(path.join(directory, "docs")))
}

function walkProjects(current: string, depth: number, found: Set<string>): void {
  if (depth < 0 || !existsSync(current)) return
  if (looksLikeProjectRoot(current)) {
    found.add(current)
    return
  }

  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(current, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (IGNORED_DIRS.has(entry.name)) continue
    walkProjects(path.join(current, entry.name), depth - 1, found)
  }
}

function uniqueSorted(paths: Iterable<string>): string[] {
  return Array.from(new Set(paths)).sort((left, right) => left.localeCompare(right))
}

function looksLikeDirectDocsPath(value: string): boolean {
  return /^docs\\//.test(normalizePath(value))
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&")
}

export function discoverWorkspaceProjects(workspaceRoot: string): string[] {
  const cached = discoveryCache.get(workspaceRoot)
  if (cached) return cached

  const found = new Set<string>()
  if (looksLikeProjectRoot(workspaceRoot)) found.add(workspaceRoot)
  walkProjects(workspaceRoot, 4, found)

  const projects = uniqueSorted(found)
  discoveryCache.set(workspaceRoot, projects)
  return projects
}

export function findContainingProjectRoot(workspaceRoot: string, targetPath: string): string | null {
  const absolutePath = path.resolve(targetPath)
  let current = absolutePath
  try {
    if (!statSync(absolutePath).isDirectory()) current = path.dirname(absolutePath)
  } catch {
    current = path.dirname(absolutePath)
  }

  const normalizedWorkspaceRoot = path.resolve(workspaceRoot)
  while (current.startsWith(normalizedWorkspaceRoot)) {
    if (looksLikeProjectRoot(current)) return current
    if (current === normalizedWorkspaceRoot) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

function scoreProjectMatch(workspaceRoot: string, projectRoot: string, text: string): number {
  const normalizedText = normalizePath(text)
  const relativeRoot = normalizePath(path.relative(workspaceRoot, projectRoot))
  const projectName = path.basename(projectRoot)
  let score = 0

  if (relativeRoot && normalizedText.includes(relativeRoot)) score = Math.max(score, relativeRoot.length + 20)
  if (relativeRoot && normalizedText.includes("@" + relativeRoot + "/")) score = Math.max(score, relativeRoot.length + 30)
  if (relativeRoot && normalizedText.includes(relativeRoot + "/docs/")) score = Math.max(score, relativeRoot.length + 40)

  const projectNamePattern = new RegExp("(^|[^\\\\w-])" + escapeRegex(projectName) + "([^\\\\w-]|$)", "i")
  if (projectNamePattern.test(normalizedText)) score = Math.max(score, projectName.length)

  return score
}

export function inferProjectRootFromText(workspaceRoot: string, text: string): string | null {
  const projects = discoverWorkspaceProjects(workspaceRoot)
  if (projects.length === 0) return null
  if (!text.trim()) return projects.length === 1 ? projects[0] : null

  const ranked = projects
    .map((projectRoot) => ({ projectRoot, score: scoreProjectMatch(workspaceRoot, projectRoot, text) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  if (ranked.length > 0) return ranked[0].projectRoot
  return projects.length === 1 ? projects[0] : null
}

function resolveProjectFromPathHint(workspaceRoot: string, value?: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (path.isAbsolute(trimmed)) return findContainingProjectRoot(workspaceRoot, trimmed)

  const normalized = normalizePath(trimmed)
  if (looksLikeDirectDocsPath(normalized)) return null

  const candidate = path.resolve(workspaceRoot, trimmed)
  const containing = findContainingProjectRoot(workspaceRoot, candidate)
  if (containing) return containing

  return inferProjectRootFromText(workspaceRoot, normalized)
}

export function resolveTargetProjectRoot(workspaceRoot: string, hints: ProjectHints = {}): string | null {
  const explicitTarget = hints.targetRepoRoot?.trim()
  if (explicitTarget) {
    const resolvedExplicit = path.isAbsolute(explicitTarget) ? explicitTarget : path.resolve(workspaceRoot, explicitTarget)
    if (looksLikeProjectRoot(resolvedExplicit)) return resolvedExplicit
    const containing = findContainingProjectRoot(workspaceRoot, resolvedExplicit)
    if (containing) return containing
  }

  const pathHints = [hints.planPath, hints.specPath, hints.contextPath, hints.taskContractPath]
  for (const hint of pathHints) {
    const projectRoot = resolveProjectFromPathHint(workspaceRoot, hint)
    if (projectRoot) return projectRoot
  }

  if (hints.prompt) {
    const fromPrompt = inferProjectRootFromText(workspaceRoot, hints.prompt)
    if (fromPrompt) return fromPrompt
  }

  const projects = discoverWorkspaceProjects(workspaceRoot)
  if (projects.length === 1) return projects[0]
  if (looksLikeProjectRoot(workspaceRoot)) return workspaceRoot
  return workspaceRoot
}

export function resolvePathFromProjectRoot(projectRoot: string, value: string): string {
  return path.isAbsolute(value) ? value : path.join(projectRoot, value)
}

export function resolveProjectPaths(workspaceRoot: string, hints: ProjectHints = {}): ProjectPaths | null {
  const projectRoot = resolveTargetProjectRoot(workspaceRoot, hints)
  if (!projectRoot) return null

  return {
    workspaceRoot,
    harnessRoot: path.join(workspaceRoot, ".opencode"),
    projectRoot,
    stateRoot: path.join(workspaceRoot, ".opencode", "state"),
    docsRoot: path.join(projectRoot, "docs"),
    specsRoot: path.join(projectRoot, "docs", "specs"),
    principlesRoot: path.join(projectRoot, "docs", "principles"),
    domainRoot: path.join(projectRoot, "docs", "domain"),
    projectLabel: normalizePath(path.relative(workspaceRoot, projectRoot)) || ".",
  }
}

export function normalizeActivePlanTargets(workspaceRoot: string, state: ActivePlanState): ActivePlanTarget[] {
  const directTargets = Array.isArray(state.writeTargets)
    ? state.writeTargets
    : Array.isArray(state.targets)
      ? state.targets
      : []
  const fallbackTarget = state.planPath || state.specPath || state.contextPath || state.targetRepoRoot
    ? [{
      project: state.project,
      slug: state.slug,
      planPath: state.planPath,
      specPath: state.specPath,
      contextPath: state.contextPath,
      targetRepoRoot: state.targetRepoRoot,
    } satisfies ActivePlanTarget]
    : []

  return directTargets.concat(fallbackTarget)
    .map((target) => {
      const targetRepoRoot = target.targetRepoRoot?.trim() || resolveTargetProjectRoot(workspaceRoot, {
        targetRepoRoot: target.targetRepoRoot,
        planPath: target.planPath,
        specPath: target.specPath,
        contextPath: target.contextPath,
      }) || undefined

      return {
        ...target,
        targetRepoRoot,
      }
    })
    .filter((target) => Boolean(target.targetRepoRoot && (target.planPath || target.specPath || target.contextPath)))
}

export function loadActivePlanTargets(workspaceRoot: string): ActivePlanTarget[] {
  const activePlanPath = path.join(workspaceRoot, ".opencode", "state", "active-plan.json")
  if (!existsSync(activePlanPath)) return []

  try {
    const parsed = JSON.parse(readFileSync(activePlanPath, "utf-8")) as ActivePlanState
    return normalizeActivePlanTargets(workspaceRoot, parsed)
  } catch {
    return []
  }
}

export function loadActivePlanTarget(workspaceRoot: string): ActivePlanTarget | null {
  return loadActivePlanTargets(workspaceRoot)[0] ?? null
}

export function loadActivePlanReferenceProjects(workspaceRoot: string): ActivePlanReferenceProject[] {
  const activePlanPath = path.join(workspaceRoot, ".opencode", "state", "active-plan.json")
  if (!existsSync(activePlanPath)) return []

  try {
    const parsed = JSON.parse(readFileSync(activePlanPath, "utf-8")) as ActivePlanState
    return (Array.isArray(parsed.referenceProjects) ? parsed.referenceProjects : [])
      .map((project) => ({
        ...project,
        targetRepoRoot: project.targetRepoRoot?.trim()
          || resolveTargetProjectRoot(workspaceRoot, { targetRepoRoot: project.targetRepoRoot })
          || undefined,
      }))
      .filter((project): project is ActivePlanReferenceProject => Boolean(project.targetRepoRoot))
  } catch {
    return []
  }
}
`

const STATE_PATHS = `import path from "path"
import { resolveProjectPaths } from "./j.workspace-paths"

export function resolveStateFile(directory: string, filename: string): string {
  return path.join(directory, ".opencode", "state", filename)
}

export function resolveProjectStateFile(directory: string, filename: string, hints?: { targetRepoRoot?: string; planPath?: string; specPath?: string; contextPath?: string; taskContractPath?: string; prompt?: string }): string | null {
  const projectPaths = resolveProjectPaths(directory, hints)
  if (!projectPaths) return null
  return path.join(projectPaths.projectRoot, ".opencode", "state", filename)
}
`

const FEATURE_STATE_PATHS = `import { mkdirSync } from "fs"
import path from "path"
import { resolveProjectPaths } from "./j.workspace-paths"

type FeaturePathHints = {
  targetRepoRoot?: string
}

function resolveFeatureSpecsRoot(directory: string, featureSlug: string, hints?: FeaturePathHints): string {
  const projectPaths = resolveProjectPaths(directory, {
    targetRepoRoot: hints?.targetRepoRoot,
    planPath: \`docs/specs/\${featureSlug}/plan.md\`,
  })
  const specsRoot = projectPaths?.specsRoot ?? path.join(directory, "docs", "specs")
  return path.join(specsRoot, featureSlug)
}

export function featureStateDir(directory: string, featureSlug: string, hints?: FeaturePathHints): string {
  return path.join(resolveFeatureSpecsRoot(directory, featureSlug, hints), "state")
}

export function featureStateTaskDir(directory: string, featureSlug: string, taskID: string, hints?: FeaturePathHints): string {
  return path.join(featureStateDir(directory, featureSlug, hints), "tasks", "task-" + taskID)
}

export function featureStateSessionsDir(directory: string, featureSlug: string, hints?: FeaturePathHints): string {
  return path.join(featureStateDir(directory, featureSlug, hints), "sessions")
}

export function ensureFeatureStateStructure(directory: string, featureSlug: string, hints?: FeaturePathHints): void {
  mkdirSync(featureStateDir(directory, featureSlug, hints), { recursive: true })
  mkdirSync(path.join(featureStateDir(directory, featureSlug, hints), "tasks"), { recursive: true })
  mkdirSync(featureStateSessionsDir(directory, featureSlug, hints), { recursive: true })
}

export function featureStateTaskPaths(directory: string, featureSlug: string, taskID: string, hints?: FeaturePathHints) {
  const taskDir = featureStateTaskDir(directory, featureSlug, taskID, hints)
  return {
    taskDir,
    statePath: path.join(taskDir, "execution-state.md"),
    retryStatePath: path.join(taskDir, "retry-state.json"),
    runtimePath: path.join(taskDir, "runtime.json"),
    validatorPath: path.join(taskDir, "validator-work.md"),
    contractPath: path.join(taskDir, "task-contract.json"),
  }
}

export function featureStateSessionRuntimePath(directory: string, featureSlug: string, sessionID: string, hints?: FeaturePathHints): string {
  return path.join(featureStateSessionsDir(directory, featureSlug, hints), sessionID + "-runtime.json")
}

export function featureStateImplementerLogPath(directory: string, featureSlug: string, hints?: FeaturePathHints): string {
  return path.join(featureStateDir(directory, featureSlug, hints), "implementer-work.md")
}

export function featureStateManifestPath(directory: string, featureSlug: string, hints?: FeaturePathHints): string {
  return path.join(featureStateDir(directory, featureSlug, hints), "integration-state.json")
}

export function featureStateReadmePath(directory: string, featureSlug: string, hints?: FeaturePathHints): string {
  return path.join(featureStateDir(directory, featureSlug, hints), "README.md")
}
`

const JUNINHO_CONFIG = `import { existsSync, readFileSync } from "fs"
import path from "path"
import { resolveProjectPaths } from "./j.workspace-paths"

export type JuninhoConfig = {
  strong?: string
  medium?: string
  weak?: string
  projectType?: string
  isKotlin?: boolean
  buildTool?: string
  workflow?: {
    automation?: {
      nonInteractive?: boolean
      autoApproveArtifacts?: boolean
    }
    implement?: {
      preCommitScope?: string
      postImplementFullCheck?: boolean
      reenterImplementOnFullCheckFailure?: boolean
      watchdogSessionStale?: boolean
    }
    unify?: {
      enabled?: boolean
      updatePersistentContext?: boolean
      updateDomainDocs?: boolean
      updateDomainIndex?: boolean
      cleanupIntegratedTaskBranches?: boolean
      createPullRequest?: boolean
      createDeliveryPrBody?: boolean
    }
    documentation?: {
      preferAgentsMdForLocalRules?: boolean
      preferDomainDocsForBusinessBehavior?: boolean
      preferPrincipleDocsForCrossCuttingTech?: boolean
      syncMarkers?: boolean
    }
  }
}

const DEFAULT_CONFIG: JuninhoConfig = {
  workflow: {
    automation: {
      nonInteractive: false,
      autoApproveArtifacts: false,
    },
    implement: {
      preCommitScope: "related",
      postImplementFullCheck: true,
      reenterImplementOnFullCheckFailure: true,
      watchdogSessionStale: true,
    },
    unify: {
      enabled: true,
      updatePersistentContext: true,
      updateDomainDocs: true,
      updateDomainIndex: true,
      cleanupIntegratedTaskBranches: true,
      createPullRequest: true,
      createDeliveryPrBody: true,
    },
    documentation: {
      preferAgentsMdForLocalRules: true,
      preferDomainDocsForBusinessBehavior: true,
      preferPrincipleDocsForCrossCuttingTech: true,
      syncMarkers: true,
    },
  },
}

export function loadJuninhoConfig(directory: string): JuninhoConfig {
  const configCandidates = [
    path.join(directory, ".opencode", "juninho-config.json"),
    path.join(directory, "juninho-config.json"),
  ]
  const projectPaths = resolveProjectPaths(directory)
  if (projectPaths) {
    configCandidates.push(path.join(projectPaths.projectRoot, ".opencode", "juninho-config.json"))
  }

  for (const configPath of configCandidates) {
    if (!existsSync(configPath)) continue
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as JuninhoConfig
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        workflow: {
          ...DEFAULT_CONFIG.workflow,
          ...parsed.workflow,
          automation: {
            ...DEFAULT_CONFIG.workflow?.automation,
            ...parsed.workflow?.automation,
          },
          implement: {
            ...DEFAULT_CONFIG.workflow?.implement,
            ...parsed.workflow?.implement,
          },
          unify: {
            ...DEFAULT_CONFIG.workflow?.unify,
            ...parsed.workflow?.unify,
          },
          documentation: {
            ...DEFAULT_CONFIG.workflow?.documentation,
            ...parsed.workflow?.documentation,
          },
        },
      }
    } catch {
      // Try next config candidate.
    }
  }

  return DEFAULT_CONFIG
}
`
