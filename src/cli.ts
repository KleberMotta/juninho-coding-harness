#!/usr/bin/env node
import { runSetup } from "./installer.js"
import path from "path"
import { VALID_PROJECT_TYPES, type ProjectType } from "./project-types.js"

const { version: VERSION } = require("../package.json") as { version: string }

const args = process.argv.slice(2)
const command = args[0] ?? ""
const forceFlag = args.includes("--force")

// Parse --type flag
const typeIdx = args.indexOf("--type")
const typeValue = typeIdx !== -1 ? args[typeIdx + 1] : undefined

const targetDir = args.find(
  (a, i) => !a.startsWith("--") && a !== command && i !== typeIdx + 1
) ?? process.cwd()

function showHelp(): void {
  console.log(`
juninho v${VERSION} — Agentic Coding Framework bootstrapper for OpenCode

Usage:
  juninho <command> [project-dir] [options]

Commands:
  setup [dir] [--force]   Install the framework into a project

Options:
  --force                 Reinstall even if already configured
  --type <type>           Set project type (skips auto-detection)
                          Values: ${VALID_PROJECT_TYPES.join(", ")}
  --version, -v           Show juninho version
  --help, -h              Show this help message

Model Tiers:
  Strong  → Planning & spec writing    (default: claude-opus-4.6)
  Medium  → Implementation & review    (default: claude-sonnet-4.6)
  Weak    → Research & exploration     (default: claude-haiku-4.5)

  During setup, juninho detects available models via 'opencode models'
  and lets you choose the best model for each tier.
  To reconfigure models, run 'juninho setup --force'.

Examples:
  juninho setup                              Auto-detect stack and models
  juninho setup ./my-project                 Install into a specific directory
  juninho setup --type python                Force Python project type
  juninho setup --type java ./spring-app     Java/Kotlin project (Kotlin auto-detected)
  juninho setup --force                      Reinstall & reconfigure models
`)
}

function showVersion(): void {
  console.log(VERSION)
}

if (command === "" || command === "--help" || command === "-h") {
  showHelp()
} else if (command === "--version" || command === "-v") {
  showVersion()
} else if (command === "setup") {
  // Validate --type if provided
  if (typeValue !== undefined && !VALID_PROJECT_TYPES.includes(typeValue as ProjectType)) {
    console.error(`[juninho] Invalid project type: ${typeValue}`)
    console.error(`[juninho] Valid types: ${VALID_PROJECT_TYPES.join(", ")}`)
    process.exit(1)
  }

  runSetup(path.resolve(targetDir), {
    force: forceFlag,
    type: typeValue as ProjectType | undefined,
  })
    .then(() => process.exit(0))
    .catch((e: Error) => {
      console.error("[juninho] Error:", e.message)
      process.exit(1)
    })
} else {
  console.error(`[juninho] Unknown command: ${command}`)
  console.error("Run 'juninho --help' for usage.")
  process.exit(1)
}
