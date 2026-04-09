#!/usr/bin/env node
const fs = require("fs")
const path = require("path")

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8")
}

function fileExists(repoDir, relativePath) {
  return fs.existsSync(path.join(repoDir, relativePath))
}

function expandSimpleGlob(repoDir, pattern) {
  if (!pattern.includes("**")) {
    return fileExists(repoDir, pattern) ? [pattern] : []
  }

  const [prefix, suffix] = pattern.split("**")
  const root = path.join(repoDir, prefix)
  if (!fs.existsSync(root)) return []

  const matches = []

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name)
      const relativePath = path.relative(repoDir, fullPath)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }

      if (!suffix || relativePath.endsWith(suffix.replace(/^\//, ""))) {
        matches.push(relativePath)
      }
    }
  }

  walk(root)
  return matches
}

function runCommandInRepo(repoDir, command) {
  const { execSync } = require("child_process")
  try {
    const stdout = execSync(command, {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120000,
    })
    return { ok: true, stdout }
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
      error: error.message,
    }
  }
}

function evaluateExpectations(repoDir, expect = {}) {
  const failures = []
  let checks = 0
  let passed = 0

  for (const relativePath of expect.filesExist || []) {
    checks += 1
    if (fileExists(repoDir, relativePath)) passed += 1
    else failures.push(`Missing required file: ${relativePath}`)
  }

  for (const pattern of expect.anyGlobExists || []) {
    checks += 1
    const matches = expandSimpleGlob(repoDir, pattern)
    if (matches.length > 0) passed += 1
    else failures.push(`No files matched pattern: ${pattern}`)
  }

  for (const assertion of expect.fileContains || []) {
    checks += 1
    const filePath = path.join(repoDir, assertion.path)
    if (!fs.existsSync(filePath)) {
      failures.push(`Missing file for content assertion: ${assertion.path}`)
      continue
    }

    if (readUtf8(filePath).includes(assertion.text)) passed += 1
    else failures.push(`File ${assertion.path} does not contain expected text: ${assertion.text}`)
  }

  for (const command of expect.commandsSucceed || []) {
    checks += 1
    const result = runCommandInRepo(repoDir, command)
    if (result.ok) passed += 1
    else failures.push(`Command failed: ${command}`)
  }

  return {
    checks,
    passed,
    failures,
    qualityRate: checks === 0 ? 1 : passed / checks,
    success: failures.length === 0,
  }
}

module.exports = {
  evaluateExpectations,
  runCommandInRepo,
}
