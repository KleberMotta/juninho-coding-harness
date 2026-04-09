#!/usr/bin/env node
const fs = require("fs")
const path = require("path")

function main() {
  const harnessRoot = path.resolve(process.argv[2] || process.cwd())
  const autoresearchRoot = path.resolve(process.argv[3])
  if (!autoresearchRoot) {
    throw new Error("Usage: prepare-autoresearch-run.js <harness-root> <autoresearch-root>")
  }

  const out = {
    harnessRoot,
    benchmarkPath: path.join(harnessRoot, "eval", "benchmarks", "benchmark-v0.json"),
    loopScript: path.join(harnessRoot, "eval", "runners", "run-loop.sh"),
    resultsTsv: path.join(harnessRoot, "eval", "results.tsv"),
  }

  fs.writeFileSync(
    path.join(autoresearchRoot, "juninho-eval-config.json"),
    JSON.stringify(out, null, 2) + "\n"
  )

  process.stdout.write(JSON.stringify(out, null, 2) + "\n")
}

main()
