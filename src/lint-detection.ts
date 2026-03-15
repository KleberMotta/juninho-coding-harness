/**
 * Lint tool detection and suggestion.
 *
 * Detects existing lint tools in the project and suggests alternatives
 * when none is found. For java projects, detects Kotlin to recommend
 * ktlint/detekt instead of Checkstyle.
 */

import { existsSync, readFileSync } from "fs"
import path from "path"
import type { ProjectType } from "./project-types.js"

export interface LintDetectionResult {
  detected: string | null
  configFile?: string
}

export interface LintSuggestion {
  name: string
  install: string
  command: string
}

/**
 * Detect an existing lint tool in the project.
 */
export function detectLintTool(
  projectDir: string,
  projectType: ProjectType,
  isKotlin: boolean,
): LintDetectionResult {
  switch (projectType) {
    case "node-nextjs":
    case "node-generic":
      return detectNodeLint(projectDir)
    case "python":
      return detectPythonLint(projectDir)
    case "go":
      return detectGoLint(projectDir)
    case "java":
      return isKotlin
        ? detectKotlinLint(projectDir)
        : detectJavaLint(projectDir)
    case "generic":
      return detectGenericLint(projectDir)
  }
}

/**
 * Suggest lint tools appropriate for the project type.
 */
export function suggestLintTools(
  projectType: ProjectType,
  isKotlin: boolean,
): LintSuggestion[] {
  if (projectType === "java" && isKotlin) {
    return [
      {
        name: "ktlint (via Gradle plugin)",
        install: './gradlew addKtlintCheckGitPreCommitHook || echo "Add id(\\"org.jlleitschuh.gradle.ktlint\\") to plugins in build.gradle.kts"',
        command: "./gradlew ktlintCheck",
      },
      {
        name: "detekt (via Gradle plugin)",
        install: 'echo "Add id(\\"io.gitlab.arturbosch.detekt\\") to plugins in build.gradle.kts"',
        command: "./gradlew detekt",
      },
    ]
  }

  switch (projectType) {
    case "node-nextjs":
    case "node-generic":
      return [
        { name: "Biome", install: "npm install -D @biomejs/biome", command: "npx biome check" },
        { name: "ESLint", install: "npm install -D eslint", command: "npx eslint" },
      ]
    case "python":
      return [
        { name: "ruff", install: "pip install ruff", command: "ruff check" },
        { name: "flake8", install: "pip install flake8", command: "flake8" },
      ]
    case "go":
      return [
        { name: "golangci-lint", install: "go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest", command: "golangci-lint run" },
        { name: "go vet (built-in)", install: "", command: "go vet ./..." },
      ]
    case "java":
      return [
        { name: "Checkstyle (Gradle/Maven plugin)", install: 'echo "Add checkstyle plugin to build script"', command: "./gradlew checkstyleMain" },
        { name: "SpotBugs (Gradle/Maven plugin)", install: 'echo "Add spotbugs plugin to build script"', command: "./gradlew spotbugsMain" },
      ]
    case "generic":
      return []
  }
}

/* ─── Per-stack detectors ─── */

function detectNodeLint(projectDir: string): LintDetectionResult {
  const pkgPath = path.join(projectDir, "package.json")
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
      const devDeps = pkg.devDependencies ?? {}
      if (devDeps["@biomejs/biome"]) {
        return { detected: "biome", configFile: "biome.json" }
      }
      if (devDeps["eslint"]) {
        return { detected: "eslint", configFile: ".eslintrc*" }
      }
    } catch {
      // ignore
    }
  }

  // Check for config files directly
  for (const f of ["biome.json", "biome.jsonc"]) {
    if (existsSync(path.join(projectDir, f))) {
      return { detected: "biome", configFile: f }
    }
  }
  for (const f of [".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml", "eslint.config.js", "eslint.config.mjs"]) {
    if (existsSync(path.join(projectDir, f))) {
      return { detected: "eslint", configFile: f }
    }
  }

  return { detected: null }
}

function detectPythonLint(projectDir: string): LintDetectionResult {
  if (existsSync(path.join(projectDir, "ruff.toml"))) {
    return { detected: "ruff", configFile: "ruff.toml" }
  }
  const pyprojectPath = path.join(projectDir, "pyproject.toml")
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, "utf-8")
      if (content.includes("[tool.ruff]")) {
        return { detected: "ruff", configFile: "pyproject.toml [tool.ruff]" }
      }
    } catch {
      // ignore
    }
  }
  if (existsSync(path.join(projectDir, ".flake8"))) {
    return { detected: "flake8", configFile: ".flake8" }
  }
  return { detected: null }
}

function detectGoLint(projectDir: string): LintDetectionResult {
  for (const f of [".golangci.yml", ".golangci.yaml", ".golangci.json", ".golangci.toml"]) {
    if (existsSync(path.join(projectDir, f))) {
      return { detected: "golangci-lint", configFile: f }
    }
  }
  return { detected: null }
}

function detectJavaLint(projectDir: string): LintDetectionResult {
  // Check for checkstyle in build scripts
  for (const buildFile of ["build.gradle", "build.gradle.kts", "pom.xml"]) {
    const p = path.join(projectDir, buildFile)
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, "utf-8")
        if (content.includes("checkstyle")) {
          return { detected: "checkstyle", configFile: buildFile }
        }
        if (content.includes("spotbugs")) {
          return { detected: "spotbugs", configFile: buildFile }
        }
      } catch {
        // ignore
      }
    }
  }
  return { detected: null }
}

function detectKotlinLint(projectDir: string): LintDetectionResult {
  // Check for ktlint or detekt in build scripts
  for (const buildFile of ["build.gradle.kts", "build.gradle"]) {
    const p = path.join(projectDir, buildFile)
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, "utf-8")
        if (content.includes("ktlint")) {
          return { detected: "ktlint", configFile: buildFile }
        }
        if (content.includes("detekt")) {
          return { detected: "detekt", configFile: buildFile }
        }
      } catch {
        // ignore
      }
    }
  }
  // Check for standalone config files
  if (existsSync(path.join(projectDir, ".editorconfig"))) {
    // ktlint uses .editorconfig but that's not specific enough
  }
  if (existsSync(path.join(projectDir, "detekt.yml")) || existsSync(path.join(projectDir, "detekt-config.yml"))) {
    return { detected: "detekt", configFile: "detekt.yml" }
  }
  return { detected: null }
}

function detectGenericLint(projectDir: string): LintDetectionResult {
  // Try all detectors
  const detectors = [detectNodeLint, detectPythonLint, detectGoLint, detectJavaLint, detectKotlinLint]
  for (const detect of detectors) {
    const result = detect(projectDir)
    if (result.detected) return result
  }
  return { detected: null }
}
