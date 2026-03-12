import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "fs"
import { createInterface } from "readline"
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

export interface SetupOptions {
  force?: boolean
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

/**
 * Resolve models for setup:
 *   1. Saved config exists → use it
 *   2. Auto-discovery succeeds and finds exactly one per tier → use auto
 *   3. Otherwise → interactive selection
 */
async function resolveModelsForSetup(
  projectDir: string,
  rl: ReturnType<typeof createInterface>,
): Promise<JuninhoConfig> {
  // 1. Check saved config
  const saved = loadConfig(projectDir)
  if (saved) return saved

  // 2. Try auto-discovery (non-interactive happy path)
  const available = discoverAvailableModels()
  if (available.length > 0) {
    const best = selectBestModels(available)
    if (best.strong && best.medium && best.weak) {
      // All tiers have a clear best — use them automatically
      return { strong: best.strong, medium: best.medium, weak: best.weak }
    }
  }

  // 3. Non-interactive fallback (CI, piped stdin, no TTY)
  if (!process.stdin.isTTY) {
    return { strong: DEFAULT_MODELS.strong, medium: DEFAULT_MODELS.medium, weak: DEFAULT_MODELS.weak }
  }

  // 4. Interactive selection (discovery failed or ambiguous)
  return interactiveModelSelection(rl, null)
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

    // Step 1: Create directory structure
    createDirectories(projectDir)
    console.log("[juninho] ✓ Directories created")

    // Step 2: Save model config
    saveConfig(projectDir, models)
    console.log("[juninho] ✓ Model config saved")

    // Step 3: Write agents (with resolved models)
    writeAgents(projectDir, models)
    console.log("[juninho] ✓ Agents created (9)")

    // Step 4: Write skills
    writeSkills(projectDir)
    console.log("[juninho] ✓ Skills created (9)")

    // Step 5: Write plugins
    writePlugins(projectDir)
    console.log("[juninho] ✓ Plugins created (12)")

    // Step 6: Write tools
    writeTools(projectDir)
    console.log("[juninho] ✓ Tools created (4)")

    // Step 7: Write support scripts
    writeSupportScripts(projectDir)
    console.log("[juninho] ✓ Support scripts created (4)")

    // Step 8: Write commands
    writeCommands(projectDir)
    console.log("[juninho] ✓ Commands created (14)")

    // Step 9: Write state files
    writeState(projectDir)
    console.log("[juninho] ✓ State files created")

    // Step 10: Write docs
    writeDocs(projectDir)
    console.log("[juninho] ✓ Docs scaffold created")

    // Step 11: Patch opencode.json (with resolved models)
    patchOpencodeJson(projectDir, models)
    console.log("[juninho] ✓ opencode.json patched")

    // Step 12: Install pre-commit hook (outer validation loop)
    writePreCommitHook(projectDir)

    // Step 13: Write marker
    writeFileSync(marker, new Date().toISOString())

    console.log("")
    console.log("[juninho] ✓ Framework installed successfully!")
    console.log("[juninho] Open OpenCode — /j.plan, /j.spec and /j.implement are ready.")
    console.log("[juninho] Agents: @j.planner, @j.spec-writer, @j.implementer, @j.validator, @j.reviewer, @j.unify, @j.explore, @j.librarian")
  } finally {
    rl.close()
  }
}

function writePreCommitHook(projectDir: string): void {
  const gitHooksDir = path.join(projectDir, ".git", "hooks")

  if (!existsSync(gitHooksDir)) {
    // Not a git repo or hooks dir doesn't exist — skip silently
    return
  }

  const hookPath = path.join(gitHooksDir, "pre-commit")

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf-8")
    if (!existing.includes("installed by juninho")) {
      // Preserve existing hook — do not overwrite
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

function createDirectories(projectDir: string): void {
  const dirs = [
    ".opencode",
    ".opencode/agents",
    ".opencode/skills",
    ".opencode/skills/j.test-writing",
    ".opencode/skills/j.page-creation",
    ".opencode/skills/j.api-route-creation",
    ".opencode/skills/j.server-action-creation",
    ".opencode/skills/j.schema-migration",
    ".opencode/skills/j.agents-md-writing",
    ".opencode/skills/j.domain-doc-writing",
    ".opencode/skills/j.principle-doc-writing",
    ".opencode/skills/j.shell-script-writing",
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
