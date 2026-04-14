import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import path from "path"
import { installHarness, removeDir } from "../../lib/test-utils"

let testRoot = ""

beforeAll(() => {
  testRoot = installHarness("node-generic")
})

afterAll(() => {
  if (testRoot) removeDir(testRoot)
})

function readAgent(name: string): string {
  return readFileSync(path.join(testRoot, ".opencode", "agents", name + ".md"), "utf-8")
}

function readCommand(name: string): string {
  return readFileSync(path.join(testRoot, ".opencode", "commands", name + ".md"), "utf-8")
}

describe("spec-writer granularity enforcement", () => {
  test("has depth enforcement rule", () => {
    const content = readAgent("j.spec-writer")
    expect(content.toLowerCase()).toContain("depth enforcement")
  })

  test("has ambiguity detection rule", () => {
    const content = readAgent("j.spec-writer")
    expect(content.toLowerCase()).toContain("ambiguity detection")
  })

  test("has acceptance criteria precision rule", () => {
    const content = readAgent("j.spec-writer")
    expect(content.toLowerCase()).toContain("precision")
    // Should mention concrete observables vs vague verbs
    expect(content).toContain("Given/When/Then")
  })

  test("has cross-boundary tracing for multi-service features", () => {
    const content = readAgent("j.spec-writer")
    expect(content.toLowerCase()).toContain("cross-boundary")
  })

  test("has interview depth rule for short requests", () => {
    const content = readAgent("j.spec-writer")
    // Should require probing questions for short requests
    expect(content.toLowerCase()).toContain("interview depth")
  })
})

describe("planner granularity enforcement", () => {
  test("has task action precision rule", () => {
    const content = readAgent("j.planner")
    expect(content.toLowerCase()).toContain("action precision")
  })

  test("has file-level specificity rule", () => {
    const content = readAgent("j.planner")
    expect(content.toLowerCase()).toContain("file-level specificity")
  })

  test("has done criteria completeness rule", () => {
    const content = readAgent("j.planner")
    expect(content.toLowerCase()).toContain("done criteria completeness")
  })

  test("has probing before writing rule", () => {
    const content = readAgent("j.planner")
    expect(content.toLowerCase()).toContain("probing before writing")
  })

  test("has behavioral ownership rule for relocated behavior", () => {
    const content = readAgent("j.planner")
    expect(content.toLowerCase()).toContain("behavioral ownership")
  })

  test("has multi-project scope rule", () => {
    const content = readAgent("j.planner")
    expect(content.toLowerCase()).toContain("writetarget")
  })
})

describe("checker agent quality", () => {
  test("checker exists and is a quality-gate orchestrator", () => {
    const content = readAgent("j.checker")
    expect(content).toContain("quality")
    expect(content.toLowerCase()).toContain("check-all.sh")
    expect(content.toLowerCase()).toContain("j.reviewer")
  })

  test("checker delegates review — never self-reviews", () => {
    const content = readAgent("j.checker")
    expect(content).toContain("MUST delegate")
    expect(content).toContain("Never skip")
  })

  test("checker persists check-review.md", () => {
    const content = readAgent("j.checker")
    expect(content).toContain("check-review.md")
  })

  test("checker has reentry contract for implement", () => {
    const content = readAgent("j.checker")
    expect(content).toContain("Reentry Contract")
  })
})

describe("implementer multi-repo awareness", () => {
  test("implementer references target project root", () => {
    const content = readAgent("j.implementer")
    // Should mention target repo root or REPO_ROOT
    expect(content.toLowerCase()).toContain("target")
  })

  test("implementer has forward-only follow-up rule", () => {
    const content = readAgent("j.implementer")
    expect(content.toLowerCase()).toContain("follow-up task")
    expect(content.toLowerCase()).toContain("reopen")
  })
})

describe("command multi-repo awareness", () => {
  test("finish-setup accepts project argument", () => {
    const content = readCommand("j.finish-setup")
    expect(content).toContain("project")
    expect(content).toContain("$PROJECT_ROOT")
  })

  test("implement command mentions multi-target iteration", () => {
    const content = readCommand("j.implement")
    expect(content.toLowerCase()).toContain("target")
  })

  test("check command references per-target artifacts", () => {
    const content = readCommand("j.check")
    expect(content.toLowerCase()).toContain("target")
  })

  test("unify command reconciles per target", () => {
    const content = readCommand("j.unify")
    expect(content.toLowerCase()).toContain("target")
  })
})

describe("cross-agent documentation contracts", () => {
  test("forward-only follow-up rule stays documented across workflow stages", () => {
    const files = [
      readCommand("j.plan"),
      readCommand("j.implement"),
      readCommand("j.check"),
      readCommand("j.unify"),
      readAgent("j.implementer"),
      readAgent("j.planner"),
      readAgent("j.checker"),
    ]

    for (const content of files) {
      expect(content.toLowerCase()).toContain("follow-up task")
    }
  })

  test("check review contract stays documented across checker, reviewer, implement, and unify", () => {
    const files = [
      readAgent("j.checker"),
      readAgent("j.reviewer"),
      readCommand("j.implement"),
      readCommand("j.unify"),
    ]

    for (const content of files) {
      expect(
        content.includes("Reentry Contract") || content.includes("reentry contract") || content.includes("check-review.md")
      ).toBe(true)
    }
  })
})
