import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, realpathSync } from "fs"
import { execSync } from "child_process"
import os from "os"
import path from "path"

export function repoRoot(): string {
  return path.resolve(__dirname, "../..")
}

export function createTempDir(prefix: string): string {
  // Resolve symlinks (macOS /var -> /private/var) to avoid path mismatch in plugins
  return realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)))
}

export function removeDir(target: string): void {
  rmSync(target, { recursive: true, force: true })
}

/**
 * Run juninho setup in a temp directory and return the root path.
 * The generated harness is the system under test.
 */
export function installHarness(
  projectType: string = "node-generic",
  options?: { workspace?: boolean }
): string {
  const tempRoot = createTempDir("juninho-eval-")

  if (options?.workspace) {
    // Create a workspace with two repos
    mkdirSync(path.join(tempRoot, "repo-a", ".git"), { recursive: true })
    mkdirSync(path.join(tempRoot, "repo-b", ".git"), { recursive: true })
  } else {
    // Single project — needs .git for project detection
    mkdirSync(path.join(tempRoot, ".git"), { recursive: true })
  }

  const cliPath = path.join(repoRoot(), "dist", "cli.js")
  execSync(`node ${cliPath} setup ${tempRoot} --type ${projectType} --force`, {
    stdio: "pipe",
    env: { ...process.env, JUNINHO_NON_INTERACTIVE: "1" },
    timeout: 30_000,
  })

  return tempRoot
}

export function writeActivePlan(root: string, planPath: string): void {
  const target = path.join(root, ".opencode", "state", "active-plan.json")
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(
    target,
    JSON.stringify(
      {
        slug: "feature-x",
        planPath,
        specPath: "docs/specs/feature-x/spec.md",
        contextPath: "docs/specs/feature-x/CONTEXT.md",
      },
      null,
      2
    ) + "\n",
    "utf-8"
  )
}

export function writePersistentContext(root: string, content: string): void {
  const target = path.join(root, ".opencode", "state", "persistent-context.md")
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content, "utf-8")
}

export function writeExecutionState(root: string, content: string): void {
  const target = path.join(root, ".opencode", "state", "execution-state.md")
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content, "utf-8")
}
