/**
 * Project type system — detection, configuration, and registry.
 *
 * Enables multi-stack support by parameterizing skills, scripts,
 * tools, and agents based on the detected project type.
 */

import { existsSync, readFileSync, readdirSync } from "fs"
import path from "path"

export type ProjectType =
  | "node-nextjs"
  | "node-generic"
  | "python"
  | "go"
  | "java"
  | "generic"

export interface ProjectTypeConfig {
  /** Skills to install for this project type */
  skills: string[]
  /** Test file patterns (globs) */
  testPatterns: string[]
  /** Lint chain — ordered list of commands to try */
  lintChain: string[]
  /** Source file extensions */
  fileExtensions: string[]
  /** Planner example file paths */
  plannerExamples: { files: string; skills: string }
  /** Default language for ast-grep */
  astGrepLang: string
  /** Migration directories to check */
  migrationDirs: string[]
  /** Whether this is a Kotlin JVM project (affects lint/test tooling) */
  isKotlin?: boolean
}

/**
 * Detect whether a java-type project uses Kotlin.
 * Checks for *.kt files in src/ and for kotlin plugin in build scripts.
 */
export function detectKotlin(projectDir: string): boolean {
  // Check build.gradle / build.gradle.kts for kotlin plugin
  for (const buildFile of ["build.gradle.kts", "build.gradle"]) {
    const p = path.join(projectDir, buildFile)
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, "utf-8")
        if (
          content.includes("kotlin") ||
          content.includes("org.jetbrains.kotlin") ||
          content.includes('plugin.kotlin')
        ) {
          return true
        }
      } catch {
        // ignore read errors
      }
    }
  }

  // Check for *.kt files in src/
  const srcDir = path.join(projectDir, "src")
  if (existsSync(srcDir)) {
    try {
      return hasKotlinFiles(srcDir, 3) // max depth 3
    } catch {
      // ignore
    }
  }

  return false
}

function hasKotlinFiles(dir: string, maxDepth: number): boolean {
  if (maxDepth <= 0) return false
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".kt")) return true
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        if (hasKotlinFiles(path.join(dir, entry.name), maxDepth - 1)) return true
      }
    }
  } catch {
    // ignore permission errors
  }
  return false
}

export const PROJECT_TYPE_REGISTRY: Record<ProjectType, ProjectTypeConfig> = {
  "node-nextjs": {
    skills: [
      "j.test-writing",
      "j.page-creation",
      "j.api-route-creation",
      "j.server-action-creation",
      "j.schema-migration",
      "j.agents-md-writing",
      "j.domain-doc-writing",
      "j.principle-doc-writing",
      "j.shell-script-writing",
    ],
    testPatterns: ["*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"],
    lintChain: ["npm run lint:structure", "npm run lint", "npx eslint"],
    fileExtensions: [".ts", ".tsx", ".js", ".jsx"],
    plannerExamples: {
      files: "src/app/actions/foo.ts",
      skills: "server-action-creation",
    },
    astGrepLang: "typescript",
    migrationDirs: ["prisma/migrations", "db/migrations", "migrations", "drizzle"],
  },

  "node-generic": {
    skills: [
      "j.test-writing",
      "j.agents-md-writing",
      "j.domain-doc-writing",
      "j.principle-doc-writing",
      "j.shell-script-writing",
    ],
    testPatterns: ["*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx", "*.test.js", "*.spec.js"],
    lintChain: ["npm run lint:structure", "npm run lint", "npx eslint"],
    fileExtensions: [".ts", ".tsx", ".js", ".jsx"],
    plannerExamples: {
      files: "src/services/foo.ts",
      skills: "",
    },
    astGrepLang: "typescript",
    migrationDirs: ["prisma/migrations", "db/migrations", "migrations", "drizzle"],
  },

  python: {
    skills: [
      "j.test-writing",
      "j.agents-md-writing",
      "j.domain-doc-writing",
      "j.principle-doc-writing",
      "j.shell-script-writing",
    ],
    testPatterns: ["test_*.py", "*_test.py"],
    lintChain: ["ruff check", "flake8", "pylint"],
    fileExtensions: [".py"],
    plannerExamples: {
      files: "src/services/foo.py",
      skills: "",
    },
    astGrepLang: "python",
    migrationDirs: ["alembic/versions", "migrations", "db/migrations"],
  },

  go: {
    skills: [
      "j.test-writing",
      "j.agents-md-writing",
      "j.domain-doc-writing",
      "j.principle-doc-writing",
      "j.shell-script-writing",
    ],
    testPatterns: ["*_test.go"],
    lintChain: ["golangci-lint run", "go vet ./..."],
    fileExtensions: [".go"],
    plannerExamples: {
      files: "internal/service/foo.go",
      skills: "",
    },
    astGrepLang: "go",
    migrationDirs: ["migrations", "db/migrations"],
  },

  java: {
    skills: [
      "j.test-writing",
      "j.agents-md-writing",
      "j.domain-doc-writing",
      "j.principle-doc-writing",
      "j.shell-script-writing",
    ],
    testPatterns: ["*Test.java", "*Test.kt", "*Tests.java", "*Tests.kt"],
    lintChain: ["./gradlew checkstyleMain", "./mvnw checkstyle:check"],
    fileExtensions: [".java", ".kt"],
    plannerExamples: {
      files: "src/main/java/com/example/FooService.java",
      skills: "",
    },
    astGrepLang: "java",
    migrationDirs: ["src/main/resources/db/migration", "src/main/resources/db/changelog", "migrations"],
  },

  generic: {
    skills: [
      "j.agents-md-writing",
      "j.domain-doc-writing",
      "j.principle-doc-writing",
      "j.shell-script-writing",
    ],
    testPatterns: [],
    lintChain: [],
    fileExtensions: [],
    plannerExamples: {
      files: "src/module/component.ext",
      skills: "",
    },
    astGrepLang: "typescript",
    migrationDirs: [],
  },
}

/**
 * Get the effective config for a project type, with Kotlin adjustments.
 * When isKotlin is true and type is "java", swaps lint chain and planner examples.
 */
export function getEffectiveConfig(
  projectType: ProjectType,
  isKotlin: boolean,
): ProjectTypeConfig {
  const base = { ...PROJECT_TYPE_REGISTRY[projectType] }

  if (projectType === "java" && isKotlin) {
    base.isKotlin = true
    base.lintChain = ["./gradlew ktlintCheck", "./gradlew detekt", "./gradlew checkstyleMain"]
    base.plannerExamples = {
      files: "src/main/kotlin/com/example/FooService.kt",
      skills: "",
    }
    base.astGrepLang = "kotlin"
    base.fileExtensions = [".kt", ".kts", ".java"]
  }

  return base
}

/**
 * Detect project type from marker files in the project directory.
 * Returns null if no markers are found.
 */
export function detectProjectType(projectDir: string): ProjectType | null {
  // Node.js detection
  const pkgPath = path.join(projectDir, "package.json")
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      }
      if (allDeps["next"]) return "node-nextjs"
      return "node-generic"
    } catch {
      return "node-generic"
    }
  }

  // Python detection
  if (
    existsSync(path.join(projectDir, "pyproject.toml")) ||
    existsSync(path.join(projectDir, "requirements.txt")) ||
    existsSync(path.join(projectDir, "setup.py"))
  ) {
    return "python"
  }

  // Go detection
  if (existsSync(path.join(projectDir, "go.mod"))) {
    return "go"
  }

  // Java/Kotlin detection
  if (
    existsSync(path.join(projectDir, "pom.xml")) ||
    existsSync(path.join(projectDir, "build.gradle")) ||
    existsSync(path.join(projectDir, "build.gradle.kts"))
  ) {
    return "java"
  }

  return null
}

/** All valid project type values for CLI validation */
export const VALID_PROJECT_TYPES: ProjectType[] = [
  "node-nextjs",
  "node-generic",
  "python",
  "go",
  "java",
  "generic",
]
