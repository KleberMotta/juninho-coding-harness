import { writeFileSync } from "fs"
import path from "path"
import type { ProjectType } from "../project-types.js"
import { getEffectiveConfig } from "../project-types.js"

export function writeTools(
  projectDir: string,
  projectType: ProjectType = "node-nextjs",
  isKotlin: boolean = false,
): void {
  const toolsDir = path.join(projectDir, ".opencode", "tools")
  const config = getEffectiveConfig(projectType, isKotlin)

  writeFileSync(path.join(toolsDir, "find-pattern.ts"), findPattern(projectType, isKotlin))
  writeFileSync(path.join(toolsDir, "next-version.ts"), nextVersion(config.migrationDirs))
  writeFileSync(path.join(toolsDir, "lsp.ts"), lsp(projectType, isKotlin))
  writeFileSync(path.join(toolsDir, "ast-grep.ts"), astGrep(config.astGrepLang))
}

// ─── Find Pattern ─────────────────────────────────────────────────────────────

function findPattern(projectType: ProjectType, isKotlin: boolean): string {
  const fallbackPatterns = getFallbackPatterns(projectType, isKotlin)

  return `import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { existsSync, readFileSync } from "fs"
import path from "path"

export const find_pattern = tool({
  name: "find_pattern",
  description: "Find canonical code patterns in the codebase for consistent implementation",
  parameters: z.object({
    patternType: z.string().describe("The type of pattern to find (e.g. api-route, service, repository, test-unit, error-handler)"),
    cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
  }),
  execute: async ({ patternType, cwd: cwdInput }) => {
    const cwd = cwdInput ?? process.cwd()
    const manifestPath = path.join(cwd, "docs", "principles", "manifest")

    if (existsSync(manifestPath)) {
      const manifest = readFileSync(manifestPath, "utf-8")
      const lines = manifest.split("\\n")
      const section = lines
        .slice(lines.findIndex((l) => l.toLowerCase().includes(patternType)))
        .slice(0, 20)
        .join("\\n")
      if (section.trim()) return { pattern: patternType, example: section }
    }

    // Fallback patterns
    const FALLBACK_PATTERNS: Record<string, string> = ${JSON.stringify(fallbackPatterns, null, 6).replace(/\n/g, "\n    ")}

    return {
      pattern: patternType,
      example: FALLBACK_PATTERNS[patternType] ?? "No canonical pattern found. Check docs/principles/manifest.",
    }
  },
})
`
}

function getFallbackPatterns(
  projectType: ProjectType,
  isKotlin: boolean,
): Record<string, string> {
  if (projectType === "java" && isKotlin) {
    return {
      "service": `// src/main/kotlin/com/example/FooService.kt
@Service
class FooService(
    private val repository: FooRepository,
) {
    fun findById(id: Long): Foo {
        return repository.findById(id)
            .orElseThrow { NotFoundException("Foo not found: $id") }
    }
}`,
      "repository": `// src/main/kotlin/com/example/FooRepository.kt
@Repository
interface FooRepository : JpaRepository<Foo, Long> {
    fun findByName(name: String): List<Foo>
}`,
      "controller": `// src/main/kotlin/com/example/FooController.kt
@RestController
@RequestMapping("/api/foo")
class FooController(
    private val service: FooService,
) {
    @GetMapping("/{id}")
    fun getById(@PathVariable id: Long): ResponseEntity<Foo> {
        return ResponseEntity.ok(service.findById(id))
    }

    @PostMapping
    fun create(@Valid @RequestBody request: CreateFooRequest): ResponseEntity<Foo> {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request))
    }
}`,
      "test-unit": `// src/test/kotlin/com/example/FooServiceTest.kt
@ExtendWith(MockitoExtension::class)
class FooServiceTest {

    @Mock
    lateinit var repository: FooRepository

    @InjectMocks
    lateinit var service: FooService

    @Test
    fun \`should find by id\`() {
        whenever(repository.findById(1L)).thenReturn(Optional.of(foo))
        val result = service.findById(1L)
        assertThat(result).isEqualTo(foo)
    }
}`,
      "error-handler": `// src/main/kotlin/com/example/GlobalExceptionHandler.kt
@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(NotFoundException::class)
    fun handleNotFound(ex: NotFoundException): ResponseEntity<ErrorResponse> {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(ErrorResponse(ex.message ?: "Not found"))
    }
}`,
    }
  }

  switch (projectType) {
    case "node-nextjs":
      return {
        "api-route": `// app/api/example/route.ts
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const data = await fetchData()
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}`,
        "server-action": `// app/actions/example.ts
"use server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const schema = z.object({ name: z.string().min(1) })

export async function createExample(formData: FormData) {
  const result = schema.safeParse(Object.fromEntries(formData))
  if (!result.success) return { error: result.error.flatten() }
  // ... implementation
  revalidatePath("/")
  return { success: true }
}`,
        "zod-schema": `import { z } from "zod"

export const ExampleSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(100),
  createdAt: z.date(),
})

export type Example = z.infer<typeof ExampleSchema>`,
      }

    case "node-generic":
      return {
        "service": `// src/services/example.ts
export class ExampleService {
  constructor(private readonly repository: ExampleRepository) {}

  async findById(id: string): Promise<Example> {
    const result = await this.repository.findById(id)
    if (!result) throw new NotFoundError(\`Example \${id} not found\`)
    return result
  }
}`,
        "error-handler": `// src/middleware/error-handler.ts
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message })
  }
  console.error(err)
  res.status(500).json({ error: "Internal server error" })
}`,
      }

    case "python":
      return {
        "service": `# src/services/foo_service.py
class FooService:
    def __init__(self, repository: FooRepository):
        self._repository = repository

    def find_by_id(self, id: int) -> Foo:
        result = self._repository.find_by_id(id)
        if not result:
            raise NotFoundError(f"Foo {id} not found")
        return result`,
        "test-unit": `# tests/test_foo_service.py
import pytest
from unittest.mock import MagicMock

class TestFooService:
    def test_find_by_id_returns_foo(self):
        repository = MagicMock()
        repository.find_by_id.return_value = Foo(id=1, name="test")
        service = FooService(repository)

        result = service.find_by_id(1)

        assert result.name == "test"
        repository.find_by_id.assert_called_once_with(1)`,
      }

    case "go":
      return {
        "handler": `// internal/handler/foo.go
func (h *FooHandler) GetByID(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")

    foo, err := h.service.FindByID(r.Context(), id)
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            http.Error(w, "not found", http.StatusNotFound)
            return
        }
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }

    json.NewEncoder(w).Encode(foo)
}`,
        "test-unit": `// internal/service/foo_test.go
func TestFooService_FindByID(t *testing.T) {
    tests := []struct {
        name    string
        id      string
        want    *Foo
        wantErr bool
    }{
        {name: "found", id: "1", want: &Foo{ID: "1"}, wantErr: false},
        {name: "not found", id: "999", want: nil, wantErr: true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := svc.FindByID(context.Background(), tt.id)
            if (err != nil) != tt.wantErr {
                t.Errorf("error = %v, wantErr %v", err, tt.wantErr)
            }
            if !reflect.DeepEqual(got, tt.want) {
                t.Errorf("got %v, want %v", got, tt.want)
            }
        })
    }
}`,
      }

    case "java":
      return {
        "service": `// src/main/java/com/example/FooService.java
@Service
public class FooService {
    private final FooRepository repository;

    public FooService(FooRepository repository) {
        this.repository = repository;
    }

    public Foo findById(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new NotFoundException("Foo not found: " + id));
    }
}`,
        "controller": `// src/main/java/com/example/FooController.java
@RestController
@RequestMapping("/api/foo")
public class FooController {
    private final FooService service;

    @GetMapping("/{id}")
    public ResponseEntity<Foo> getById(@PathVariable Long id) {
        return ResponseEntity.ok(service.findById(id));
    }
}`,
        "test-unit": `// src/test/java/com/example/FooServiceTest.java
@ExtendWith(MockitoExtension.class)
class FooServiceTest {

    @Mock
    private FooRepository repository;

    @InjectMocks
    private FooService service;

    @Test
    void shouldFindById() {
        when(repository.findById(1L)).thenReturn(Optional.of(foo));
        var result = service.findById(1L);
        assertThat(result).isEqualTo(foo);
    }
}`,
      }

    case "generic":
    default:
      return {}
  }
}

// ─── Next Version ─────────────────────────────────────────────────────────────

function nextVersion(migrationDirs: string[]): string {
  const dirsJson = JSON.stringify(migrationDirs)

  return `import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { existsSync, readdirSync } from "fs"
import path from "path"

export const next_version = tool({
  name: "next_version",
  description: "Get the next version number for migrations or schema files",
  parameters: z.object({
    type: z.enum(["migration", "schema"]).describe("Type of versioned file"),
    cwd: z.string().optional().describe("Working directory"),
  }),
  execute: async ({ type, cwd: cwdInput }) => {
    const cwd = cwdInput ?? process.cwd()

    const migrationDirs = ${dirsJson}
    const schemaDirs = ["prisma", "db", "src/db", "src/main/resources"]

    const dirs = type === "migration" ? migrationDirs : schemaDirs

    for (const dir of dirs) {
      const fullDir = path.join(cwd, dir)
      if (!existsSync(fullDir)) continue

      const entries = readdirSync(fullDir)
        .filter((e) => /^\\d/.test(e))
        .sort()

      if (entries.length === 0) {
        return { nextVersion: "0001", dir: fullDir, existing: [] }
      }

      const lastEntry = entries[entries.length - 1]
      const match = /^(\\d+)/.exec(lastEntry)
      if (!match) continue

      const lastNum = parseInt(match[1], 10)
      const nextNum = String(lastNum + 1).padStart(match[1].length, "0")

      return {
        nextVersion: nextNum,
        dir: fullDir,
        existing: entries.slice(-3),
        lastEntry,
      }
    }

    return {
      nextVersion: "0001",
      dir: "migrations/",
      existing: [],
      note: "No migration directory found. Create one first.",
    }
  },
})
`
}

// ─── LSP ──────────────────────────────────────────────────────────────────────

function lsp(projectType: ProjectType, isKotlin: boolean): string {
  const { typeCheckCmd, grepExtensions } = getLspConfig(projectType, isKotlin)

  return `import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { execSync } from "child_process"

// LSP tools — type checker and reference search
// Type checker: ${typeCheckCmd}

function runTypeCheck(cwd: string, args: string): string {
  try {
    return execSync(\`${typeCheckCmd} \${args}\`, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] })
  } catch (e: any) {
    return e.stdout ?? e.message ?? "type check failed"
  }
}

export const lsp_diagnostics = tool({
  name: "lsp_diagnostics",
  description: "Get diagnostics (errors and warnings) for a file or directory",
  parameters: z.object({
    path: z.string().describe("File or directory to check"),
    severity: z.enum(["error", "warning", "info"]).optional().default("error"),
  }),
  execute: async ({ path: targetPath, severity }) => {
    const output = runTypeCheck(process.cwd(), \`2>&1 | grep "\${targetPath}"\`)
    const lines = output.split("\\n").filter((l) => {
      if (severity === "error") return l.includes("error") || l.includes("ERROR")
      if (severity === "warning") return l.includes("warning") || l.includes("WARN")
      return l.trim().length > 0
    })
    return { diagnostics: lines, count: lines.length }
  },
})

export const lsp_goto_definition = tool({
  name: "lsp_goto_definition",
  description: "Find where a symbol is defined",
  parameters: z.object({
    file: z.string().describe("Source file path"),
    line: z.number().describe("Line number (1-indexed)"),
    character: z.number().describe("Character position (0-indexed)"),
  }),
  execute: async ({ file, line, character }) => {
    try {
      const content = require("fs").readFileSync(file, "utf-8")
      const lines = content.split("\\n")
      const targetLine = lines[line - 1] ?? ""
      const before = targetLine.slice(0, character)
      const after = targetLine.slice(character)
      const symbolMatch = /[\\w$]+$/.exec(before)
      const symbolEnd = /^[\\w$]*/.exec(after)
      const symbol = (symbolMatch?.[0] ?? "") + (symbolEnd?.[0] ?? "")
      return { symbol, hint: \`Search for 'export.*\${symbol}|function \${symbol}|class \${symbol}|const \${symbol}|fun \${symbol}|def \${symbol}|func \${symbol}'\` }
    } catch {
      return { error: "Could not read file" }
    }
  },
})

export const lsp_find_references = tool({
  name: "lsp_find_references",
  description: "Find all references to a symbol across the codebase",
  parameters: z.object({
    file: z.string(),
    line: z.number(),
    character: z.number(),
    includeDeclaration: z.boolean().optional().default(true),
  }),
  execute: async ({ file, line, character }) => {
    try {
      const content = require("fs").readFileSync(file, "utf-8")
      const lineContent = content.split("\\n")[line - 1] ?? ""
      const before = lineContent.slice(0, character)
      const after = lineContent.slice(character)
      const symbol = (/[\\w$]+$/.exec(before)?.[0] ?? "") + (/^[\\w$]*/.exec(after)?.[0] ?? "")
      if (!symbol) return { error: "No symbol at position" }
      const result = execSync(
        \`grep -rn ${grepExtensions} "\${symbol}" .\`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      )
      const refs = result.split("\\n").filter(Boolean)
      return { symbol, references: refs.slice(0, 20), total: refs.length }
    } catch (e: any) {
      return { references: [], note: e.stdout ?? "No references found" }
    }
  },
})

export const lsp_document_symbols = tool({
  name: "lsp_document_symbols",
  description: "Get all symbols (functions, classes, variables) in a file",
  parameters: z.object({ file: z.string() }),
  execute: async ({ file }) => {
    try {
      const content = require("fs").readFileSync(file, "utf-8")
      const lines = content.split("\\n")
      const symbols: Array<{ line: number; kind: string; name: string }> = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const patterns: Array<[RegExp, string]> = [
          [/^export\\s+(async\\s+)?function\\s+(\\w+)/, "function"],
          [/^export\\s+(const|let|var)\\s+(\\w+)/, "variable"],
          [/^export\\s+(default\\s+)?class\\s+(\\w+)/, "class"],
          [/^export\\s+(type|interface)\\s+(\\w+)/, "type"],
          [/^\\s*fun\\s+(\\w+)/, "function"],
          [/^\\s*class\\s+(\\w+)/, "class"],
          [/^\\s*interface\\s+(\\w+)/, "interface"],
          [/^\\s*data\\s+class\\s+(\\w+)/, "class"],
          [/^\\s*object\\s+(\\w+)/, "object"],
          [/^\\s*def\\s+(\\w+)/, "function"],
          [/^\\s*func\\s+(\\w+)/, "function"],
          [/^\\s+(async\\s+)?(\\w+)\\s*\\(/, "method"],
        ]
        for (const [pattern, kind] of patterns) {
          const match = pattern.exec(line)
          if (match) {
            symbols.push({ line: i + 1, kind, name: match[match.length - 1] })
            break
          }
        }
      }
      return { file, symbols }
    } catch {
      return { error: "Could not read file" }
    }
  },
})

export const lsp_workspace_symbols = tool({
  name: "lsp_workspace_symbols",
  description: "Search for symbols by name across the entire workspace",
  parameters: z.object({
    query: z.string().describe("Symbol name or pattern to search"),
    file: z.string().optional().describe("Any file in workspace (for language server context)"),
  }),
  execute: async ({ query }) => {
    try {
      const result = execSync(
        \`grep -rn ${grepExtensions} -E "export.*(function|class|const|interface|type|fun|def|func).*\${query}" .\`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      )
      return { query, matches: result.split("\\n").filter(Boolean).slice(0, 15) }
    } catch (e: any) {
      return { query, matches: [], note: "No matches found" }
    }
  },
})

export const lsp_prepare_rename = tool({
  name: "lsp_prepare_rename",
  description: "Check if the symbol at the given position can be safely renamed.",
  parameters: z.object({
    file: z.string().describe("Source file path"),
    line: z.number().describe("Line number (1-indexed)"),
    character: z.number().describe("Character position (0-indexed)"),
  }),
  execute: async ({ file, line, character }) => {
    try {
      const content = require("fs").readFileSync(file, "utf-8")
      const lines = content.split("\\n")
      const lineContent = lines[line - 1] ?? ""
      const before = lineContent.slice(0, character)
      const after = lineContent.slice(character)
      const symBefore = /[\\w$]+$/.exec(before)?.[0] ?? ""
      const symAfter = /^[\\w$]*/.exec(after)?.[0] ?? ""
      const symbol = symBefore + symAfter

      if (!symbol) {
        return { canRename: false, reason: "No symbol at the given position" }
      }

      const KEYWORDS = new Set(["const", "let", "var", "function", "class", "import", "export", "return", "if", "else", "for", "while", "fun", "val", "def", "func", "package", "object", "data"])
      if (KEYWORDS.has(symbol)) {
        return { canRename: false, reason: \`'\${symbol}' is a language keyword\` }
      }

      return {
        canRename: true,
        symbol,
        range: {
          start: { line, character: character - symBefore.length },
          end: { line, character: character + symAfter.length },
        },
        hint: "Call lsp_rename with newName to apply the rename across the workspace.",
      }
    } catch {
      return { canRename: false, reason: "Could not read file" }
    }
  },
})

export const lsp_rename = tool({
  name: "lsp_rename",
  description: "Preview rename of a symbol across all files (dry-run only — apply with sed/Edit)",
  parameters: z.object({
    file: z.string(),
    line: z.number(),
    character: z.number(),
    newName: z.string(),
  }),
  execute: async ({ file, line, character, newName }) => {
    try {
      const content = require("fs").readFileSync(file, "utf-8")
      const lineContent = content.split("\\n")[line - 1] ?? ""
      const before = lineContent.slice(0, character)
      const after = lineContent.slice(character)
      const oldName = (/[\\w$]+$/.exec(before)?.[0] ?? "") + (/^[\\w$]*/.exec(after)?.[0] ?? "")
      if (!oldName) return { error: "No symbol at position" }

      const result = execSync(
        \`grep -rln ${grepExtensions} "\\\\b\${oldName}\\\\b" .\`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      )
      const files = result.split("\\n").filter(Boolean)
      return {
        oldName,
        newName,
        affectedFiles: files,
        command: \`grep -rl "\\\\b\${oldName}\\\\b" . | xargs sed -i 's/\\\\b\${oldName}\\\\b/\${newName}/g'\`,
        note: "This is a preview. Run the command above to apply the rename.",
      }
    } catch (e: any) {
      return { error: e.message }
    }
  },
})
`
}

function getLspConfig(
  projectType: ProjectType,
  isKotlin: boolean,
): { typeCheckCmd: string; grepExtensions: string } {
  if (projectType === "java" && isKotlin) {
    return {
      typeCheckCmd: "./gradlew compileKotlin --console=plain",
      grepExtensions: '--include="*.kt" --include="*.kts" --include="*.java"',
    }
  }

  switch (projectType) {
    case "node-nextjs":
    case "node-generic":
      return {
        typeCheckCmd: "npx tsc --noEmit --pretty false",
        grepExtensions: '--include="*.ts" --include="*.tsx"',
      }
    case "python":
      return {
        typeCheckCmd: "mypy --no-error-summary",
        grepExtensions: '--include="*.py"',
      }
    case "go":
      return {
        typeCheckCmd: "go vet ./...",
        grepExtensions: '--include="*.go"',
      }
    case "java":
      return {
        typeCheckCmd: "./gradlew compileJava --console=plain",
        grepExtensions: '--include="*.java"',
      }
    case "generic":
    default:
      return {
        typeCheckCmd: "echo 'No type checker configured'",
        grepExtensions: '--include="*.ts" --include="*.tsx" --include="*.py" --include="*.go" --include="*.java" --include="*.kt"',
      }
  }
}

// ─── AST Grep ─────────────────────────────────────────────────────────────────

function astGrep(defaultLang: string): string {
  return `import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { execSync } from "child_process"

function runAstGrep(args: string): { output: string; error?: string } {
  try {
    const output = execSync(\`ast-grep \${args}\`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
    return { output }
  } catch (e: any) {
    if (e.code === "ENOENT" || e.message?.includes("not found")) {
      return { output: "", error: "ast-grep not installed. Run: npm install -g @ast-grep/cli" }
    }
    return { output: e.stdout ?? "", error: e.stderr ?? e.message }
  }
}

export const ast_grep_search = tool({
  name: "ast_grep_search",
  description: "Search for code patterns using AST matching. More precise than text search. Use meta-variables: $NAME (single node), $$$ARGS (multiple nodes).",
  parameters: z.object({
    pattern: z.string().describe("AST pattern with meta-variables. E.g.: 'console.log($MSG)', 'function $NAME($$$ARGS)'"),
    language: z.enum(["typescript", "javascript", "tsx", "python", "rust", "go", "java", "kotlin"]).default("${defaultLang}"),
    path: z.string().optional().describe("Directory or file to search (defaults to current directory)"),
    maxResults: z.number().optional().default(20),
  }),
  execute: async ({ pattern, language, path: searchPath, maxResults }) => {
    const pathArg = searchPath ? \`--dir "\${searchPath}"\` : ""
    const { output, error } = runAstGrep(\`scan --pattern '\${pattern}' --lang \${language} \${pathArg} --json\`)

    if (error) return { error, pattern }

    try {
      const results = JSON.parse(output || "[]")
      return {
        pattern,
        language,
        matches: results.slice(0, maxResults),
        total: results.length,
      }
    } catch {
      return { pattern, output: output.slice(0, 2000) }
    }
  },
})

export const ast_grep_replace = tool({
  name: "ast_grep_replace",
  description: "Replace code patterns using AST matching. Use meta-variables in both pattern and replacement.",
  parameters: z.object({
    pattern: z.string().describe("Pattern to match (use meta-variables like $NAME, $$$ARGS)"),
    replacement: z.string().describe("Replacement pattern (use same meta-variables)"),
    language: z.enum(["typescript", "javascript", "tsx", "python", "rust", "go", "java", "kotlin"]).default("${defaultLang}"),
    path: z.string().optional().describe("Directory or file to transform"),
    dryRun: z.boolean().optional().default(true).describe("Preview changes without applying (default: true)"),
  }),
  execute: async ({ pattern, replacement, language, path: targetPath, dryRun }) => {
    const pathArg = targetPath ? \`--dir "\${targetPath}"\` : ""
    const dryRunArg = dryRun ? "--dry-run" : ""

    const { output, error } = runAstGrep(
      \`scan --pattern '\${pattern}' --rewrite '\${replacement}' --lang \${language} \${pathArg} \${dryRunArg}\`
    )

    if (error) return { error, pattern, replacement }

    return {
      pattern,
      replacement,
      dryRun,
      output: output.slice(0, 3000),
      note: dryRun ? "Dry run — no files modified. Set dryRun: false to apply changes." : "Changes applied.",
    }
  },
})
`
}
