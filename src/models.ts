/**
 * Model tier definitions and matching logic.
 *
 * Three tiers:
 *   strong  — planning, spec writing (requires deep reasoning)
 *   medium  — implementation, review, validation (balanced cost/quality)
 *   weak    — read-only research, exploration (fast, cheap)
 *
 * Each tier has a priority-ordered list of known models.
 * The first match found in a user's available models wins.
 */

export type ModelTier = "strong" | "medium" | "weak"

export interface KnownModel {
  /** Substring patterns to match against the full model ID (case-insensitive) */
  patterns: string[]
  /** Human-readable display name */
  displayName: string
  /** Priority within tier — lower index = higher priority */
  tier: ModelTier
}

/**
 * Strong-tier models — ordered by preference (best first).
 * Used for: j.planner, j.spec-writer
 */
export const STRONG_MODELS: KnownModel[] = [
  {
    patterns: ["claude-opus-4.6", "claude-opus-4-6"],
    displayName: "Claude Opus 4.6",
    tier: "strong",
  },
  {
    patterns: ["gpt-5.4", "gpt-5-4"],
    displayName: "GPT-5.4",
    tier: "strong",
  },
  {
    patterns: ["gemini-3.1", "gemini-3-1"],
    displayName: "Gemini 3.1",
    tier: "strong",
  },
]

/**
 * Medium-tier models — ordered by preference (best first).
 * Used for: j.plan-reviewer, j.implementer, j.validator, j.reviewer, j.unify
 */
export const MEDIUM_MODELS: KnownModel[] = [
  {
    patterns: ["claude-sonnet-4.6", "claude-sonnet-4-6"],
    displayName: "Claude Sonnet 4.6",
    tier: "medium",
  },
  {
    patterns: ["gpt-5.4", "gpt-5-4"],
    displayName: "GPT-5.4",
    tier: "medium",
  },
]

/**
 * Weak-tier models — ordered by preference (best first).
 * Used for: j.explore, j.librarian
 */
export const WEAK_MODELS: KnownModel[] = [
  {
    patterns: ["claude-haiku-4.5", "claude-haiku-4-5"],
    displayName: "Claude Haiku 4.5",
    tier: "weak",
  },
  {
    patterns: ["grok-fast-1", "grok-fast1"],
    displayName: "Grok Fast 1",
    tier: "weak",
  },
  {
    patterns: ["gemini-flash-2.0", "gemini-flash-2-0", "gemini-2.0-flash", "gemini-2-0-flash"],
    displayName: "Gemini Flash 2.0",
    tier: "weak",
  },
]

/** All known models across tiers, in priority order within each tier */
export const ALL_KNOWN_MODELS: KnownModel[] = [
  ...STRONG_MODELS,
  ...MEDIUM_MODELS,
  ...WEAK_MODELS,
]

/** Map of agent name → required tier */
export const AGENT_TIER_MAP: Record<string, ModelTier> = {
  "j.planner": "strong",
  "j.spec-writer": "strong",
  "j.plan-reviewer": "medium",
  "j.implementer": "medium",
  "j.validator": "medium",
  "j.reviewer": "medium",
  "j.unify": "medium",
  "j.explore": "weak",
  "j.librarian": "weak",
}

/** Default models (used when no config exists and discovery is unavailable) */
export const DEFAULT_MODELS: Record<ModelTier, string> = {
  strong: "claude-opus-4-6",
  medium: "claude-sonnet-4-6",
  weak: "claude-haiku-4-5",
}

/**
 * Match a full model ID string (e.g. "github-copilot/claude-opus-4.6")
 * against the known model lists and return its tier + known model info.
 *
 * Returns null if the model doesn't match any known pattern.
 */
export function matchModelToTier(modelId: string): { tier: ModelTier; model: KnownModel } | null {
  const lower = modelId.toLowerCase()

  for (const model of ALL_KNOWN_MODELS) {
    for (const pattern of model.patterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return { tier: model.tier, model }
      }
    }
  }

  return null
}

/**
 * Given a list of available model IDs, find the best model for each tier.
 * Returns the full model ID strings (with provider prefix).
 *
 * Fallback cascade: if no strong model is available, try medium, then weak.
 */
export function selectBestModels(
  availableModels: string[]
): Record<ModelTier, string | null> {
  const result: Record<ModelTier, string | null> = {
    strong: null,
    medium: null,
    weak: null,
  }

  // For each tier, walk the priority-ordered list and find the first available match
  const tierLists: Record<ModelTier, KnownModel[]> = {
    strong: STRONG_MODELS,
    medium: MEDIUM_MODELS,
    weak: WEAK_MODELS,
  }

  for (const tier of ["strong", "medium", "weak"] as ModelTier[]) {
    for (const knownModel of tierLists[tier]) {
      const match = availableModels.find((id) => {
        const lower = id.toLowerCase()
        return knownModel.patterns.some((p) => lower.includes(p.toLowerCase()))
      })
      if (match) {
        result[tier] = match
        break
      }
    }
  }

  // Fallback cascade: strong → medium → weak
  if (!result.strong) result.strong = result.medium ?? result.weak
  if (!result.medium) result.medium = result.strong ?? result.weak
  if (!result.weak) result.weak = result.medium ?? result.strong

  return result
}

/**
 * Group available model IDs by tier.
 * Returns unknown models in a separate "unknown" array.
 */
export function groupModelsByTier(availableModels: string[]): {
  strong: string[]
  medium: string[]
  weak: string[]
  unknown: string[]
} {
  const groups = { strong: [] as string[], medium: [] as string[], weak: [] as string[], unknown: [] as string[] }

  for (const modelId of availableModels) {
    const match = matchModelToTier(modelId)
    if (match) {
      groups[match.tier].push(modelId)
    } else {
      groups.unknown.push(modelId)
    }
  }

  return groups
}
