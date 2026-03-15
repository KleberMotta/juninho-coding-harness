import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "fs"
import { createInterface } from "readline"
import { execSync } from "child_process"
import path from "path"
import { writeAgents } from "./templates/agents.js"
import { writeSkills } from "./templates/skills.js"
import { writePlugins } from "./templates/plugins.js"
import { writeTools } from "./templates/tools.js"
import { writeCommands } from "./templates/commands.js"
import { writeState } from "./templates/state.js"
import { writeSupportScripts } from "./templates/support-scripts.js"
import { writeDocs, patchOpencodeJson } from "./templates/docs.js"
import { type JuninhoConfig, loadConfig, saveConfig } from "./config.js"
import { discoverAvailableModels } from "./discovery.js"
import {
  type ModelTier,
  groupModelsByTier,
  selectBestModels,
  DEFAULT_MODELS,
} from "./models.js"
import { rewriteAgentModels } from "./rewriter.js"
import {
  type ProjectType,
  VALID_PROJECT_TYPES,
  PROJECT_TYPE_REGISTRY,
  detectProjectType,
  detectKotlin,
  getEffectiveConfig,
} from "./project-types.js"
import {
  detectLintTool,
  suggestLintTools,
  type LintSuggestion,
} from "./lint-detection.js"

export interface SetupOptions {
  force?: boolean
  type?: ProjectType
}

/* ─── Readline helper ─── */

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

/* ─── Interactive model selection ─── */

const TIER_LABELS: Record<ModelTier, string> = {
  strong: "Forte (Strong)",
  medium: "Médio (Medium)",
  weak: "Fraco (Weak)",
}

const TIER_AGENTS: Record<ModelTier, string[]> = {
  strong: ["j.planner", "j.spec-writer"],
  medium: ["j.plan-reviewer", "j.implementer", "j.validator", "j.reviewer", "j.unify"],
  weak: ["j.explore", "j.librarian"],
}

const TIER_KNOWN_DEFAULTS: Record<ModelTier, string> = {
  strong: "Claude Opus 4.6",
  medium: "Claude Sonnet 4.6",
  weak: "Claude Haiku 4.5",
}

/**
 * Discover models and let user pick one for each tier interactively.
 * Falls back to manual entry when discovery fails.
 */
async function interactiveModelSelection(
  rl: ReturnType<typeof createInterface>,
  existing: JuninhoConfig | null,
): Promise<JuninhoConfig> {
  console.log("")
  console.log("[juninho] Detectando modelos disponíveis via 'opencode models'...")
  const available = discoverAvailableModels()

  if (available.length === 0) {
    console.log("")
    console.log("[juninho] ⚠ Nenhum modelo detectado via 'opencode models'.")
    console.log("[juninho]   Possíveis causas:")
    console.log("[juninho]   - O comando 'opencode' não está instalado ou não está no PATH")
    console.log("[juninho]   - Nenhum provider está configurado no OpenCode")
    console.log("")
    console.log("[juninho]   Você pode configurar manualmente os model IDs abaixo.")
    return manualEntry(rl, existing)
  }

  console.log(`[juninho] ✓ ${available.length} modelo(s) detectado(s):`)
  console.log("")
  const grouped = groupModelsByTier(available)
  const best = selectBestModels(available)

  if (grouped.strong.length > 0) console.log("  Fortes: " + grouped.strong.join(", "))
  if (grouped.medium.length > 0) console.log("  Médios: " + grouped.medium.join(", "))
  if (grouped.weak.length > 0)   console.log("  Fracos: " + grouped.weak.join(", "))
  if (grouped.unknown.length > 0) console.log("  Outros: " + grouped.unknown.join(", "))
  console.log("")

  const config: JuninhoConfig = {
    strong: DEFAULT_MODELS.strong,
    medium: DEFAULT_MODELS.medium,
    weak: DEFAULT_MODELS.weak,
  }

  for (const tier of ["strong", "medium", "weak"] as ModelTier[]) {
    const tierModels = grouped[tier]
    const defaultBest = best[tier]
    const currentValue = existing?.[tier]

    console.log(`─── ${TIER_LABELS[tier]} ───`)
    console.log(`  Usado por: ${TIER_AGENTS[tier].join(", ")}`)
    console.log(`  Ideal: ${TIER_KNOWN_DEFAULTS[tier]}`)

    if (tierModels.length === 0) {
      console.log("  ⚠ Nenhum modelo deste tier detectado.")
      const fallbackOptions = [...grouped.strong, ...grouped.medium, ...grouped.weak, ...grouped.unknown]
        .filter((m) => m !== config.strong && m !== config.medium && m !== config.weak)

      if (fallbackOptions.length > 0 || defaultBest) {
        const allOptions = defaultBest ? [defaultBest, ...fallbackOptions.filter(m => m !== defaultBest)] : fallbackOptions
        console.log("  Modelos disponíveis de outros tiers:")
        allOptions.forEach((m, i) => {
          const marker = (currentValue === m || (!currentValue && m === defaultBest)) ? " ← recomendado" : ""
          console.log(`    ${i + 1}) ${m}${marker}`)
        })
        const response = await ask(rl, `  Escolha (1-${allOptions.length}) ou Enter para '${defaultBest ?? DEFAULT_MODELS[tier]}': `)
        const idx = parseInt(response, 10)
        config[tier] = (idx >= 1 && idx <= allOptions.length) ? allOptions[idx - 1] : (defaultBest ?? DEFAULT_MODELS[tier])
      } else {
        const manual = await ask(rl, `  Digite o model ID ou Enter para padrão (${DEFAULT_MODELS[tier]}): `)
        config[tier] = manual || DEFAULT_MODELS[tier]
      }
    } else if (tierModels.length === 1) {
      const model = tierModels[0]
      const response = await ask(rl, `  Modelo detectado: ${model}. Usar? (S/n): `)
      config[tier] = (response.toLowerCase() === "n") ? (await ask(rl, `  Digite o model ID: `)) || model : model
    } else {
      tierModels.forEach((m, i) => {
        const marker = (m === defaultBest) ? " ← recomendado" : ""
        console.log(`    ${i + 1}) ${m}${marker}`)
      })
      const defaultIdx = defaultBest ? tierModels.indexOf(defaultBest) + 1 : 1
      const response = await ask(rl, `  Escolha (1-${tierModels.length}) ou Enter para ${defaultIdx}: `)
      const idx = parseInt(response, 10)
      config[tier] = (idx >= 1 && idx <= tierModels.length) ? tierModels[idx - 1] : (tierModels[defaultIdx - 1] ?? tierModels[0])
    }

    console.log(`  ✓ ${TIER_LABELS[tier]}: ${config[tier]}`)
    console.log("")
  }

  return config
}

async function manualEntry(
  rl: ReturnType<typeof createInterface>,
  existing: JuninhoConfig | null,
): Promise<JuninhoConfig> {
  console.log("")
  console.log("Digite o model ID completo (ex: github-copilot/claude-opus-4.6)")
  console.log("Pressione Enter para aceitar o default sugerido entre colchetes.")
  console.log("")

  const strongDefault = existing?.strong ?? DEFAULT_MODELS.strong
  const mediumDefault = existing?.medium ?? DEFAULT_MODELS.medium
  const weakDefault  = existing?.weak   ?? DEFAULT_MODELS.weak

  const strong = await ask(rl, `  Modelo Forte [${strongDefault}]: `)
  const medium = await ask(rl, `  Modelo Médio [${mediumDefault}]: `)
  const weak   = await ask(rl, `  Modelo Fraco [${weakDefault}]: `)

  return {
    strong: strong || strongDefault,
    medium: medium || mediumDefault,
    weak:   weak   || weakDefault,
  }
}

/* ─── Resolve models (auto or interactive) ─── */

async function resolveModelsForSetup(
  projectDir: string,
  rl: ReturnType<typeof createInterface>,
): Promise<JuninhoConfig> {
  const saved = loadConfig(projectDir)
  if (saved) return saved

  const available = discoverAvailableModels()
  if (available.length > 0) {
    const best = selectBestModels(available)
    if (best.strong && best.medium && best.weak) {
      return { strong: best.strong, medium: best.medium, weak: best.weak }
    }
  }

  if (!process.stdin.isTTY) {
    return { strong: DEFAULT_MODELS.strong, medium: DEFAULT_MODELS.medium, weak: DEFAULT_MODELS.weak }
  }

  return interactiveModelSelection(rl, null)
}

/* ─── Resolve project type ─── */

const TYPE_LABELS: Record<ProjectType, string> = {
  "node-nextjs": "Node.js + Next.js",
  "node-generic": "Node.js (generic)",
  "python": "Python",
  "go": "Go",
  "java": "Java / Kotlin (JVM)",
  "generic": "Generic",
}

async function resolveProjectType(
  projectDir: string,
  rl: ReturnType<typeof createInterface>,
  options: SetupOptions,
  savedConfig: JuninhoConfig | null,
): Promise<{ projectType: ProjectType; isKotlin: boolean }> {
  // 1. CLI flag takes precedence
  if (options.type) {
    const isKotlin = options.type === "java" && detectKotlin(projectDir)
    if (isKotlin) {
      console.log("[juninho] Kotlin detected in Java project")
    }
    return { projectType: options.type, isKotlin }
  }

  // 2. Saved config (unless --force)
  if (savedConfig?.projectType && !options.force) {
    return {
      projectType: savedConfig.projectType,
      isKotlin: savedConfig.isKotlin ?? false,
    }
  }

  // 3. Auto-detect
  const detected = detectProjectType(projectDir)

  if (detected) {
    const isKotlin = detected === "java" && detectKotlin(projectDir)
    const label = isKotlin ? "Java/Kotlin (JVM)" : TYPE_LABELS[detected]

    if (process.stdin.isTTY) {
      const response = await ask(rl, `[juninho] Tipo de projeto detectado: ${label}. Confirma? (S/n): `)
      if (response.toLowerCase() === "n") {
        return interactiveTypeSelection(rl, projectDir)
      }
    }

    return { projectType: detected, isKotlin }
  }

  // 4. No detection — interactive or fallback
  if (process.stdin.isTTY) {
    console.log("[juninho] Tipo de projeto não detectado automaticamente.")
    return interactiveTypeSelection(rl, projectDir)
  }

  return { projectType: "generic", isKotlin: false }
}

async function interactiveTypeSelection(
  rl: ReturnType<typeof createInterface>,
  projectDir: string,
): Promise<{ projectType: ProjectType; isKotlin: boolean }> {
  console.log("")
  console.log("[juninho] Selecione o tipo de projeto:")
  VALID_PROJECT_TYPES.forEach((t, i) => {
    console.log(`  ${i + 1}) ${TYPE_LABELS[t]}`)
  })

  const response = await ask(rl, `  Escolha (1-${VALID_PROJECT_TYPES.length}): `)
  const idx = parseInt(response, 10)
  const projectType = (idx >= 1 && idx <= VALID_PROJECT_TYPES.length)
    ? VALID_PROJECT_TYPES[idx - 1]
    : "generic"

  const isKotlin = projectType === "java" && detectKotlin(projectDir)
  if (isKotlin) {
    console.log("[juninho] Kotlin detected in Java project")
  }

  return { projectType, isKotlin }
}

/* ─── Lint detection and suggestion ─── */

async function handleLintDetection(
  projectDir: string,
  projectType: ProjectType,
  isKotlin: boolean,
  rl: ReturnType<typeof createInterface>,
): Promise<string | undefined> {
  const result = detectLintTool(projectDir, projectType, isKotlin)

  if (result.detected) {
    console.log(`[juninho] ✓ Linter detectado: ${result.detected}${result.configFile ? ` (${result.configFile})` : ""}`)
    return result.detected
  }

  // No linter detected — suggest if interactive
  if (!process.stdin.isTTY) return undefined

  const suggestions = suggestLintTools(projectType, isKotlin)
  if (suggestions.length === 0) return undefined

  const typeLabel = isKotlin ? "Kotlin" : TYPE_LABELS[projectType]
  console.log("")
  console.log(`[juninho] Nenhum linter detectado. Sugestões para projetos ${typeLabel}:`)
  suggestions.forEach((s, i) => {
    console.log(`  ${i + 1}) ${s.name} — ${s.command}`)
  })
  console.log(`  ${suggestions.length + 1}) Skip`)

  const response = await ask(rl, `  Escolha (1-${suggestions.length + 1}) ou Enter para skip: `)
  const idx = parseInt(response, 10)

  if (idx >= 1 && idx <= suggestions.length) {
    const chosen = suggestions[idx - 1]
    if (chosen.install) {
      console.log(`[juninho] Instalando ${chosen.name}...`)
      try {
        execSync(chosen.install, {
          cwd: projectDir,
          stdio: "inherit",
          timeout: 120_000,
        })
        console.log(`[juninho] ✓ ${chosen.name} instalado`)
      } catch {
        console.log(`[juninho] ⚠ Falha ao instalar ${chosen.name}. Continue manualmente.`)
      }
    }
    return chosen.name
  }

  return undefined
}

/* ─── Main setup ─── */

export async function runSetup(projectDir: string, options: SetupOptions = {}): Promise<void> {
  const marker = path.join(projectDir, ".opencode", ".juninho-installed")
  const isReinstall = existsSync(marker)

  if (isReinstall && !options.force) {
    console.log("[juninho] Framework already installed. Use --force to reinstall.")
    return
  }

  console.log("[juninho] Installing Agentic Coding Framework...")
  console.log(`[juninho] Target: ${projectDir}`)

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    // Step 0: Resolve models (config → auto → interactive)
    const models = await resolveModelsForSetup(projectDir, rl)
    console.log("[juninho] ✓ Models resolved")
    console.log(`[juninho]   Strong: ${models.strong}`)
    console.log(`[juninho]   Medium: ${models.medium}`)
    console.log(`[juninho]   Weak:   ${models.weak}`)

    // Step 0.5: Resolve project type
    const savedConfig = loadConfig(projectDir)
    const { projectType, isKotlin } = await resolveProjectType(projectDir, rl, options, savedConfig)
    const typeLabel = isKotlin ? "Java/Kotlin" : TYPE_LABELS[projectType]
    console.log(`[juninho] ✓ Project type: ${typeLabel}`)

    // Step 0.7: Detect/suggest lint tool
    const lintTool = await handleLintDetection(projectDir, projectType, isKotlin, rl)

    // Step 1: Create directory structure
    const config = getEffectiveConfig(projectType, isKotlin)
    createDirectories(projectDir, config.skills)
    console.log("[juninho] ✓ Directories created")

    // Step 2: Save config (models + project type)
    const fullConfig: JuninhoConfig = {
      ...models,
      projectType,
      isKotlin: isKotlin || undefined,
    }
    saveConfig(projectDir, fullConfig)
    console.log("[juninho] ✓ Config saved")

    // Step 3: Write agents
    writeAgents(projectDir, models, projectType, isKotlin)
    console.log("[juninho] ✓ Agents created (9)")

    // Step 4: Write skills (filtered by project type)
    writeSkills(projectDir, projectType, isKotlin)
    console.log(`[juninho] ✓ Skills created (${config.skills.length})`)

    // Step 5: Write plugins
    writePlugins(projectDir, projectType, isKotlin)
    console.log("[juninho] ✓ Plugins created (12)")

    // Step 6: Write tools
    writeTools(projectDir, projectType, isKotlin)
    console.log("[juninho] ✓ Tools created (4)")

    // Step 7: Write support scripts
    writeSupportScripts(projectDir, projectType, isKotlin, lintTool)
    console.log("[juninho] ✓ Support scripts created (4)")

    // Step 8: Write commands
    writeCommands(projectDir)
    console.log("[juninho] ✓ Commands created (15)")

    // Step 9: Write state files
    writeState(projectDir)
    console.log("[juninho] ✓ State files created")

    // Step 10: Write docs (parameterized by project type)
    writeDocs(projectDir, projectType, isKotlin)
    console.log("[juninho] ✓ Docs scaffold created")

    // Step 11: Patch opencode.json
    patchOpencodeJson(projectDir, models)
    console.log("[juninho] ✓ opencode.json patched")

    // Step 12: Install pre-commit hook
    writePreCommitHook(projectDir)

    // Step 13: Write marker
    writeFileSync(marker, new Date().toISOString())

    console.log("")
    console.log("[juninho] ✓ Framework installed successfully!")
    console.log("[juninho] Open OpenCode — /j.plan, /j.spec and /j.implement are ready.")
    console.log("[juninho] Agents: @j.planner, @j.spec-writer, @j.implementer, @j.validator, @j.reviewer, @j.unify, @j.explore, @j.librarian")

    // Step 14: Offer /j.finish-setup
    if (process.stdin.isTTY) {
      console.log("")
      const finishResponse = await ask(rl, "[juninho] Deseja executar /j.finish-setup agora para gerar skills e docs do projeto? (S/n): ")
      if (finishResponse.toLowerCase() !== "n") {
        console.log("[juninho] Executando /j.finish-setup via opencode...")
        try {
          execSync('opencode -p "/j.finish-setup"', {
            cwd: projectDir,
            stdio: "inherit",
            timeout: 600_000, // 10 minutes
          })
        } catch {
          console.log("[juninho] ⚠ Falha ao executar /j.finish-setup. Execute manualmente no OpenCode.")
        }
      } else {
        console.log("[juninho] Rode /j.finish-setup no OpenCode quando quiser gerar skills e documentação.")
      }
    } else {
      console.log("[juninho] Rode /j.finish-setup no OpenCode quando quiser gerar skills e documentação do projeto.")
    }
  } finally {
    rl.close()
  }
}

function writePreCommitHook(projectDir: string): void {
  const gitHooksDir = path.join(projectDir, ".git", "hooks")

  if (!existsSync(gitHooksDir)) {
    return
  }

  const hookPath = path.join(gitHooksDir, "pre-commit")

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf-8")
    if (!existing.includes("installed by juninho")) {
      console.log("[juninho] ⚠ pre-commit hook already exists — skipping (not installed by juninho)")
      return
    }
  }

  const hookContent = `#!/bin/sh
# Deterministic outer validation loop — installed by juninho
# Runs structure lint + related tests before every commit.
# Do not bypass with --no-verify.
set -e

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [ ! -x "$ROOT_DIR/.opencode/scripts/pre-commit.sh" ]; then
  echo "[pre-commit] FAIL: .opencode/scripts/pre-commit.sh not found or not executable"
  exit 1
fi

exec "$ROOT_DIR/.opencode/scripts/pre-commit.sh"
`

  writeFileSync(hookPath, hookContent)

  try {
    chmodSync(hookPath, 0o755)
    console.log("[juninho] ✓ pre-commit hook installed")
  } catch {
    console.log("[juninho] ✓ pre-commit hook written (chmod not supported on this platform — make it executable manually)")
  }
}

function createDirectories(projectDir: string, skills: string[]): void {
  const dirs = [
    ".opencode",
    ".opencode/agents",
    ".opencode/skills",
    // Only create skill directories for the relevant project type
    ...skills.map((s) => `.opencode/skills/${s}`),
    ".opencode/plugins",
    ".opencode/tools",
    ".opencode/scripts",
    ".opencode/commands",
    ".opencode/state",
    "docs",
    "docs/principles",
    "docs/domain",
    "docs/specs",
    "worktrees",
  ]

  for (const dir of dirs) {
    const fullPath = path.join(projectDir, dir)
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true })
    }
  }
}
