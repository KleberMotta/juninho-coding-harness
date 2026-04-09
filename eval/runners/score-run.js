#!/usr/bin/env node
const fs = require("fs")
const path = require("path")

function main() {
  const summaryPath = path.resolve(process.argv[2])
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"))
  process.stdout.write(JSON.stringify({ score: summary.score, metrics: summary.metrics }, null, 2) + "\n")
}

main()
