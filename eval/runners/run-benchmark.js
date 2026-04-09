#!/usr/bin/env node
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")
const { runOpencodeCommand } = require("./lib/opencode-runner")
const { evaluateExpectations } = require("./lib/fs-assertions")

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, "utf8")
}

function shellEscape(value) {
  return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`
}

function installRepo({ harnessRoot, fixturePath, projectType, resultsRoot, taskID }) {
  const taskRoot = path.join(resultsRoot, taskID)
  ensureDir(taskRoot)
  const installOut = execSync(
    `node ${shellEscape(path.join(harnessRoot, "eval", "runners", "install-harness.js"))} ${shellEscape(harnessRoot)} ${shellEscape(fixturePath)} ${shellEscape(projectType)} ${shellEscape(taskRoot)}`,
    { encoding: "utf8", cwd: harnessRoot }
  )
  return JSON.parse(installOut).repoDir
}

function appendLedger(resultsTsvPath, row) {
  const line = [
    row.commit,
    row.score.toFixed(3),
    row.successRate.toFixed(3),
    row.qualityRate.toFixed(3),
    row.regressionRate.toFixed(3),
    row.avgTimeS.toFixed(2),
    row.avgCost.toFixed(3),
    row.flakeRate.toFixed(3),
    row.status,
    row.description.replace(/\t/g, " "),
  ].join("\t")
  fs.appendFileSync(resultsTsvPath, line + "\n")
}

function scoreRun(weights, metrics) {
  return (
    weights.successRate * metrics.successRate +
    weights.qualityRate * metrics.qualityRate +
    weights.regressionRate * metrics.regressionRate +
    weights.normalizedTime * metrics.normalizedTime +
    weights.normalizedCost * metrics.normalizedCost +
    weights.flakeRate * metrics.flakeRate
  )
}

function getLatestSpecSlug(repoDir) {
  const specsRoot = path.join(repoDir, "docs", "specs")
  if (!fs.existsSync(specsRoot)) return null

  const candidates = fs.readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const slug = entry.name
      const planPath = path.join(specsRoot, slug, "plan.md")
      const statPath = fs.existsSync(planPath)
        ? planPath
        : path.join(specsRoot, slug)

      return {
        slug,
        mtimeMs: fs.statSync(statPath).mtimeMs,
      }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)

  return candidates[0]?.slug || null
}

function getActiveSpecSlug(repoDir) {
  const activePlanPath = path.join(repoDir, ".opencode", "state", "active-plan.json")
  const marker = readTextIfExists(activePlanPath)

  if (marker) {
    try {
      const parsed = JSON.parse(marker)
      if (typeof parsed.slug === "string" && parsed.slug.trim()) return parsed.slug.trim()

      if (typeof parsed.planPath === "string") {
        const match = parsed.planPath.trim().match(/^docs\/specs\/([^/]+)\/plan\.md$/)
        if (match) return match[1]
      }
    } catch {
      // Fall back to directory scan below.
    }
  }

  return getLatestSpecSlug(repoDir)
}

function readCheckReview(repoDir) {
  const slug = getActiveSpecSlug(repoDir)
  if (!slug) return null

  const reviewPath = path.join(repoDir, "docs", "specs", slug, "state", "check-review.md")
  const text = readTextIfExists(reviewPath)
  if (!text) return null

  return {
    slug,
    reviewPath,
    relativePath: path.relative(repoDir, reviewPath),
    text,
  }
}

function reviewNeedsFollowUp(review) {
  if (!review?.text) return false

  return (
    /Overall status:\s*\**NEEDS_WORK\**/i.test(review.text) ||
    /BLOCKS SHIP/i.test(review.text) ||
    /\|\s*[^|]+\|\s*FIX\s*\|/i.test(review.text)
  )
}

function buildReviewFixPrompt(task, review) {
  return [
    `Address the findings in ${review.relativePath} before shipping this feature.`,
    "Treat Critical and Important findings as required fixes.",
    task.specPrompt ? `Original task: ${task.specPrompt}` : null,
  ]
    .filter(Boolean)
    .join(" ")
}

function main() {
  const harnessRoot = path.resolve(process.argv[2] || process.cwd())
  const benchmarkPath = path.resolve(process.argv[3] || path.join(harnessRoot, "eval", "benchmarks", "benchmark-v0.json"))
  const runLabel = process.argv[4] || new Date().toISOString().replace(/[:.]/g, "-")

  const benchmark = readJson(benchmarkPath)
  const resultsRoot = path.join(harnessRoot, "eval", "results", runLabel)
  ensureDir(resultsRoot)

  const repoDefinitions = new Map(
    benchmark.repos.map((repo) => [repo.id, repo])
  )

  const taskResults = []

  for (const task of benchmark.tasks) {
    const repo = repoDefinitions.get(task.repo)
    const fixturePath = path.join(harnessRoot, repo.path)
    const repoDir = installRepo({
      harnessRoot,
      fixturePath,
      projectType: repo.projectType || benchmark.defaults.projectType,
      resultsRoot,
      taskID: task.id,
    })
    const timeoutMs = task.commandTimeoutMs || benchmark.defaults.commandTimeoutMs
    const bootstrapTimeoutMs = task.bootstrapTimeoutMs || benchmark.defaults.bootstrapTimeoutMs || timeoutMs
    const implementTimeoutMs = task.implementTimeoutMs || benchmark.defaults.implementTimeoutMs || timeoutMs
    const checkTimeoutMs = task.checkTimeoutMs || benchmark.defaults.checkTimeoutMs || timeoutMs
    const unifyTimeoutMs = task.unifyTimeoutMs || benchmark.defaults.unifyTimeoutMs || timeoutMs
    const commandResults = []

    const bootstrap = runOpencodeCommand({
      repoDir,
      command: "j.finish-setup",
      timeoutMs: bootstrapTimeoutMs,
    })
    commandResults.push(bootstrap)

    if (task.type === "full-flow") {
      const initialFlowCommands = [
        { command: "j.spec", prompt: task.specPrompt },
        { command: "j.plan", prompt: task.specPrompt },
        { command: "j.implement", timeoutMs: implementTimeoutMs },
        { command: "j.check", timeoutMs: checkTimeoutMs },
      ]

      for (const entry of initialFlowCommands) {
        const result = runOpencodeCommand({
          repoDir,
          command: entry.command,
          prompt: entry.prompt,
          timeoutMs: entry.timeoutMs || timeoutMs,
        })
        commandResults.push(result)
      }

      const initialReview = readCheckReview(repoDir)
      let finalReview = initialReview
      let reviewRetryPerformed = false

      if (reviewNeedsFollowUp(initialReview)) {
        reviewRetryPerformed = true
        const repairImplement = runOpencodeCommand({
          repoDir,
          command: "j.implement",
          prompt: buildReviewFixPrompt(task, initialReview),
          timeoutMs: implementTimeoutMs,
        })
        commandResults.push(repairImplement)

        const repairCheck = runOpencodeCommand({
          repoDir,
          command: "j.check",
          timeoutMs: checkTimeoutMs,
        })
        commandResults.push(repairCheck)
        finalReview = readCheckReview(repoDir) || initialReview
      }

      const unify = runOpencodeCommand({
        repoDir,
        command: "j.unify",
        timeoutMs: unifyTimeoutMs,
      })
      commandResults.push(unify)

      task.reviewLoop = {
        initial: initialReview
          ? {
            path: initialReview.relativePath,
            needsFollowUp: reviewNeedsFollowUp(initialReview),
          }
          : null,
        final: finalReview
          ? {
            path: finalReview.relativePath,
            needsFollowUp: reviewNeedsFollowUp(finalReview),
          }
          : null,
        retried: reviewRetryPerformed,
      }

    }

    const assertions = evaluateExpectations(repoDir, task.expect)
    const totalTimeMs = commandResults.reduce((sum, result) => sum + (result.elapsedMs || 0), 0)
    const totalCost = commandResults.reduce((sum, result) => sum + (result.cost || 0), 0)
    const commandFailures = commandResults.filter((result) => !result.ok)

    const taskResult = {
      taskID: task.id,
      repoDir,
      commandResults,
      assertions,
      success: commandFailures.length === 0 && assertions.success,
      qualityRate: assertions.qualityRate,
      totalTimeMs,
      totalCost,
      commandFailures: commandFailures.map((result) => ({ command: result.command, error: result.error, text: result.text })),
      reviewLoop: task.reviewLoop || null,
    }

    fs.writeFileSync(
      path.join(resultsRoot, `${task.id}.json`),
      JSON.stringify(taskResult, null, 2) + "\n"
    )

    taskResults.push(taskResult)
  }

  const successRate = taskResults.length === 0 ? 0 : taskResults.filter((task) => task.success).length / taskResults.length
  const qualityRate = taskResults.length === 0 ? 0 : taskResults.reduce((sum, task) => sum + task.qualityRate, 0) / taskResults.length
  const avgTimeS = taskResults.length === 0 ? 0 : taskResults.reduce((sum, task) => sum + task.totalTimeMs, 0) / taskResults.length / 1000
  const avgCost = taskResults.length === 0 ? 0 : taskResults.reduce((sum, task) => sum + task.totalCost, 0) / taskResults.length

  const metrics = {
    successRate,
    qualityRate,
    regressionRate: 0,
    normalizedTime: avgTimeS,
    normalizedCost: avgCost,
    flakeRate: 0,
  }

  const score = scoreRun(benchmark.weights, metrics)
  const summary = {
    runLabel,
    benchmark: benchmark.version,
    metrics,
    score,
    tasks: taskResults.map((task) => ({
      taskID: task.taskID,
      success: task.success,
      qualityRate: task.qualityRate,
      totalTimeMs: task.totalTimeMs,
      totalCost: task.totalCost,
      failures: task.commandFailures,
      assertionFailures: task.assertions.failures,
      reviewLoop: task.reviewLoop,
    })),
  }

  fs.writeFileSync(path.join(resultsRoot, "summary.json"), JSON.stringify(summary, null, 2) + "\n")

  const commit = execSync("git rev-parse --short HEAD", { cwd: harnessRoot, encoding: "utf8" }).trim()
  appendLedger(path.join(harnessRoot, "eval", "results.tsv"), {
    commit,
    score,
    successRate,
    qualityRate,
    regressionRate: 0,
    avgTimeS,
    avgCost,
    flakeRate: 0,
    status: successRate === 1 ? "keep" : "discard",
    description: `benchmark ${benchmark.version} (${runLabel})`,
  })

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
}

main()
