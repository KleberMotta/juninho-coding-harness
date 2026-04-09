#!/usr/bin/env node
const { execSync } = require("child_process")

function shellEscape(value) {
  return JSON.stringify(String(value))
}

function parseJsonLines(raw) {
  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function extractText(events) {
  return events
    .filter((event) => event.type === "text" && typeof event.part?.text === "string")
    .map((event) => event.part.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

function extractCost(events) {
  return events.reduce((total, event) => {
    if (event.type === "step_finish" && typeof event.part?.cost === "number") {
      return total + event.part.cost
    }
    return total
  }, 0)
}

function runOpencodeCommand({ repoDir, command, prompt, timeoutMs, printLogs = false }) {
  const pieces = [
    "opencode",
    "run",
    "--dir",
    shellEscape(repoDir),
    "--format",
    "json",
    "--command",
    shellEscape(command.replace(/^\//, "")),
  ]

  if (prompt) pieces.push(shellEscape(prompt))

  if (printLogs) pieces.push("--print-logs")

  const startedAt = Date.now()
  try {
    const stdout = execSync(pieces.join(" "), {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs,
    })
    const events = parseJsonLines(stdout)
    return {
      ok: !events.some((event) => event.type === "error"),
      command,
      stdout,
      events,
      text: extractText(events),
      cost: extractCost(events),
      elapsedMs: Date.now() - startedAt,
    }
  } catch (error) {
    const stdout = String(error.stdout || "")
    const stderr = String(error.stderr || "")
    const events = parseJsonLines(stdout)
    return {
      ok: false,
      command,
      stdout,
      stderr,
      events,
      text: extractText(events),
      cost: extractCost(events),
      elapsedMs: Date.now() - startedAt,
      error: error.message,
    }
  }
}

module.exports = {
  runOpencodeCommand,
  parseJsonLines,
  extractText,
  extractCost,
}
