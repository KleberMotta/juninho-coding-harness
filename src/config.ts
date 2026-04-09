/**
 * Configuration persistence for juninho model preferences.
 *
 * Stored at: .opencode/juninho-config.json within the project directory.
 * Contains the user's chosen models for each tier (strong/medium/weak).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import path from "path"
import { type ModelTier, selectBestModels } from "./models.js"
import { discoverAvailableModels } from "./discovery.js"
import type { ProjectType, BuildTool } from "./project-types.js"

export interface JuninhoConfig {
  /** Model ID for strong-tier agents (planner, spec-writer) */
  strong: string
  /** Model ID for medium-tier agents (implementer, validator, reviewer, etc.) */
  medium: string
  /** Model ID for weak-tier agents (explore, librarian) */
  weak: string
  /** Detected or user-selected project type */
  projectType?: ProjectType
  /** Whether the java project uses Kotlin */
  isKotlin?: boolean
  /** Build tool for java projects */
  buildTool?: BuildTool
  /** Runtime workflow settings for implement/unify/docs phases */
  workflow?: {
    automation?: {
      nonInteractive?: boolean
      autoApproveArtifacts?: boolean
    }
    implement?: {
      preCommitScope?: string
      postImplementFullCheck?: boolean
      reenterImplementOnFullCheckFailure?: boolean
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

const CONFIG_FILENAME = "juninho-config.json"

export const DEFAULT_WORKFLOW_CONFIG: NonNullable<JuninhoConfig["workflow"]> = {
  automation: {
    nonInteractive: false,
    autoApproveArtifacts: false,
  },
  implement: {
    preCommitScope: "related",
    postImplementFullCheck: true,
    reenterImplementOnFullCheckFailure: true,
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
}

function configPath(projectDir: string): string {
  return path.join(projectDir, ".opencode", CONFIG_FILENAME)
}

function withWorkflowDefaults(config: JuninhoConfig): JuninhoConfig {
  return {
    ...config,
    workflow: {
      ...DEFAULT_WORKFLOW_CONFIG,
      ...config.workflow,
      automation: {
        ...DEFAULT_WORKFLOW_CONFIG.automation,
        ...config.workflow?.automation,
      },
      implement: {
        ...DEFAULT_WORKFLOW_CONFIG.implement,
        ...config.workflow?.implement,
      },
      unify: {
        ...DEFAULT_WORKFLOW_CONFIG.unify,
        ...config.workflow?.unify,
      },
      documentation: {
        ...DEFAULT_WORKFLOW_CONFIG.documentation,
        ...config.workflow?.documentation,
      },
    },
  }
}

/**
 * Load saved configuration from .opencode/juninho-config.json.
 * Returns null if no config file exists or it's malformed.
 */
export function loadConfig(projectDir: string): JuninhoConfig | null {
  const p = configPath(projectDir)
  if (!existsSync(p)) return null

  try {
    const data = JSON.parse(readFileSync(p, "utf-8"))
    if (data.strong && data.medium && data.weak) {
      return withWorkflowDefaults({
        strong: data.strong,
        medium: data.medium,
        weak: data.weak,
        projectType: data.projectType,
        isKotlin: data.isKotlin,
        buildTool: data.buildTool,
        workflow: data.workflow,
      })
    }
    return null
  } catch {
    return null
  }
}

/**
 * Save configuration to .opencode/juninho-config.json.
 * Creates .opencode/ directory if it doesn't exist.
 */
export function saveConfig(projectDir: string, config: JuninhoConfig): void {
  const dir = path.join(projectDir, ".opencode")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(configPath(projectDir), JSON.stringify(withWorkflowDefaults(config), null, 2) + "\n")
}

/**
 * Resolve models for the given project:
 *   1. Load saved config (if exists) → use it
 *   2. Otherwise, run discovery → select best → return
 *   3. If discovery fails, throw error — user must run 'juninho config' or fix opencode
 *
 * Does NOT save — caller decides whether to persist.
 */
export function resolveModels(projectDir: string): JuninhoConfig {
  // 1. Check saved config
  const saved = loadConfig(projectDir)
  if (saved) return saved

  // 2. Try discovery
  const available = discoverAvailableModels()
  if (available.length > 0) {
    const best = selectBestModels(available)
    return {
      strong: best.strong ?? available[0],
      medium: best.medium ?? available[0],
      weak: best.weak ?? available[0],
    }
  }

  // 3. No config and no discovery — error
  throw new Error(
    "Não foi possível detectar modelos disponíveis.\n" +
    "  O comando 'opencode models' falhou ou não retornou modelos.\n" +
    "\n" +
    "  Possíveis causas:\n" +
    "    - O 'opencode' não está instalado ou não está no PATH\n" +
    "    - Nenhum provider está configurado no OpenCode\n" +
    "\n" +
    "  Soluções:\n" +
    "    1. Instale e configure o OpenCode (https://opencode.ai)\n" +
    "    2. Execute 'juninho setup' — você poderá configurar os modelos interativamente"
  )
}

/**
 * Convert a JuninhoConfig to the record format used by templates.
 */
export function configToRecord(config: JuninhoConfig): Record<ModelTier, string> {
  return {
    strong: config.strong,
    medium: config.medium,
    weak: config.weak,
  }
}
