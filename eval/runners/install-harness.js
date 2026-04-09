#!/usr/bin/env node
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execSync } = require("child_process")

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath)
      continue
    }
    fs.copyFileSync(sourcePath, targetPath)
  }
}

function ensureGitScaffold(repoDir) {
  execSync("git init -b main", {
    cwd: repoDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  })
}

function createInitialCommit(repoDir) {
  execSync("git add .", {
    cwd: repoDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  })

  execSync("git commit -m \"chore: initial eval fixture\"", {
    cwd: repoDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Juninho Eval",
      GIT_AUTHOR_EMAIL: "juninho-eval@example.com",
      GIT_COMMITTER_NAME: "Juninho Eval",
      GIT_COMMITTER_EMAIL: "juninho-eval@example.com",
    },
  })
}

function writeAutomationConfig(repoDir) {
  const configPath = path.join(repoDir, ".opencode", "juninho-config.json")
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
  config.workflow = config.workflow || {}
  config.workflow.automation = {
    nonInteractive: true,
    autoApproveArtifacts: true,
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n")
}

function main() {
  const harnessRoot = path.resolve(process.argv[2])
  const fixturePath = path.resolve(process.argv[3])
  const projectType = process.argv[4] || "generic"
  const outputRoot = process.argv[5]
    ? path.resolve(process.argv[5])
    : fs.mkdtempSync(path.join(os.tmpdir(), "juninho-eval-repo-"))

  if (!harnessRoot || !fixturePath) {
    throw new Error("Usage: install-harness.js <harness-root> <fixture-path> [project-type] [output-root]")
  }

  const repoDir = path.join(outputRoot, path.basename(fixturePath))
  copyDir(fixturePath, repoDir)
  ensureGitScaffold(repoDir)
  createInitialCommit(repoDir)

  const cliPath = path.join(harnessRoot, "dist", "cli.js")
  execSync(`node "${cliPath}" setup "${repoDir}" --type ${projectType}`, {
    cwd: harnessRoot,
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf8",
  })

  writeAutomationConfig(repoDir)

  process.stdout.write(JSON.stringify({ repoDir }, null, 2) + "\n")
}

main()
