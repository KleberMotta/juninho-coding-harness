import { writeFileSync, mkdirSync, existsSync } from "fs"
import path from "path"
import type { ProjectType } from "../project-types.js"
import { PROJECT_TYPE_REGISTRY } from "../project-types.js"

export function writeSkills(
  projectDir: string,
  projectType: ProjectType = "node-nextjs",
  isKotlin: boolean = false,
): void {
  const skillsDir = path.join(projectDir, ".opencode", "skills")
  const config = PROJECT_TYPE_REGISTRY[projectType]

  // Create skill directories and write only the skills for this project type
  const skillWriters: Record<string, () => string> = {
    "j.test-writing": () => testWriting(projectType, isKotlin),
    "j.page-creation": () => PAGE_CREATION,
    "j.api-route-creation": () => API_ROUTE_CREATION,
    "j.server-action-creation": () => SERVER_ACTION_CREATION,
    "j.schema-migration": () => SCHEMA_MIGRATION,
    "j.agents-md-writing": () => AGENTS_MD_WRITING,
    "j.domain-doc-writing": () => DOMAIN_DOC_WRITING,
    "j.principle-doc-writing": () => PRINCIPLE_DOC_WRITING,
    "j.shell-script-writing": () => SHELL_SCRIPT_WRITING,
  }

  for (const skill of config.skills) {
    const writer = skillWriters[skill]
    if (!writer) continue

    const skillDir = path.join(skillsDir, skill)
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true })
    }
    writeFileSync(path.join(skillDir, "SKILL.md"), writer())
  }
}

// ─── Test Writing (parameterized by type) ──────────────────────────────────

function testWriting(projectType: ProjectType, isKotlin: boolean): string {
  switch (projectType) {
    case "node-nextjs":
    case "node-generic":
      return TEST_WRITING_NODE
    case "python":
      return TEST_WRITING_PYTHON
    case "go":
      return TEST_WRITING_GO
    case "java":
      return isKotlin ? TEST_WRITING_KOTLIN : TEST_WRITING_JAVA
    case "generic":
      return TEST_WRITING_GENERIC
  }
}

const TEST_WRITING_NODE = `---
name: j.test-writing
description: Write focused unit and integration tests following project conventions
# Optional: uncomment to enable Playwright MCP for E2E tests
# mcp:
#   playwright:
#     command: npx
#     args: ["-y", "@playwright/mcp@latest"]
---

# Skill: Test Writing

## When this skill activates
Writing or editing \`*.test.ts\`, \`*.test.tsx\`, \`*.spec.ts\`, or \`*.spec.tsx\` files.

## Required Steps

### 1. Read the implementation first
Before writing any test, read the file being tested. Understand:
- What it does (not what you think it does)
- Its dependencies and side effects
- Error cases and edge conditions

### 2. Test structure
Follow the AAA pattern strictly:
\`\`\`typescript
describe("ComponentName / functionName", () => {
  describe("when <condition>", () => {
    it("should <expected behavior>", () => {
      // Arrange
      const input = ...

      // Act
      const result = ...

      // Assert
      expect(result).toBe(...)
    })
  })
})
\`\`\`

### 3. Coverage requirements
- Happy path: at least 1 test
- Error cases: test each distinct error path
- Edge cases: empty inputs, boundary values, null/undefined
- Prefer tests related to the changed files before running the full suite
- Do NOT test implementation details — test behavior

### 4. Mock strategy
- Mock external dependencies (APIs, DB, file system)
- Do NOT mock the module under test
- Use \`vi.mock()\` or \`jest.mock()\` for module mocking
- Use \`vi.spyOn()\` for method spying

### 5. Async tests
Always use \`async/await\`:
\`\`\`typescript
it("should handle async operation", async () => {
  const result = await myAsyncFunction()
  expect(result).toEqual(expected)
})
\`\`\`

### 6. Naming conventions
- Describe block: noun (component/function name)
- Nested describe: "when <condition>"
- It block: "should <verb> <outcome>"
- Test file: \`{module}.test.ts\` co-located with source

## Anti-patterns to avoid
- \`expect(true).toBe(true)\` — meaningless assertion
- Snapshot tests for logic — use specific assertions
- Testing private methods directly
- \`expect.assertions(0)\` — always assert something
- Tests that depend on order of execution
`

const TEST_WRITING_PYTHON = `---
name: j.test-writing
description: Write focused unit and integration tests using pytest
---

# Skill: Test Writing (Python)

## When this skill activates
Writing or editing \`test_*.py\` or \`*_test.py\` files.

## Required Steps

### 1. Read the implementation first
Before writing any test, read the file being tested. Understand:
- What it does (not what you think it does)
- Its dependencies and side effects
- Error cases and edge conditions

### 2. Test structure
Follow the AAA pattern with pytest:
\`\`\`python
class TestFunctionName:
    """Tests for function_name."""

    def test_happy_path(self):
        # Arrange
        input_data = ...

        # Act
        result = function_name(input_data)

        # Assert
        assert result == expected

    def test_when_invalid_input(self):
        with pytest.raises(ValueError, match="specific message"):
            function_name(invalid_input)
\`\`\`

Or functional style:
\`\`\`python
def test_function_does_expected_thing():
    # Arrange
    input_data = ...

    # Act
    result = function_name(input_data)

    # Assert
    assert result == expected
\`\`\`

### 3. Coverage requirements
- Happy path: at least 1 test
- Error cases: test each distinct error path with \`pytest.raises\`
- Edge cases: empty inputs, boundary values, None
- Prefer tests related to the changed files before running the full suite

### 4. Mock strategy
- Use \`unittest.mock.patch\` or \`pytest-mock\` fixtures
- Mock external dependencies (APIs, DB, file system)
- Do NOT mock the module under test
\`\`\`python
from unittest.mock import patch, MagicMock

def test_with_mock(mocker):
    mock_service = mocker.patch("module.ExternalService")
    mock_service.return_value.fetch.return_value = {"data": "value"}

    result = my_function()
    assert result == expected
\`\`\`

### 5. Fixtures
Use pytest fixtures for reusable setup:
\`\`\`python
@pytest.fixture
def sample_user():
    return User(name="Test", email="test@example.com")

def test_user_display(sample_user):
    assert sample_user.display_name == "Test"
\`\`\`

### 6. Naming conventions
- File: \`test_{module}.py\` or \`{module}_test.py\`
- Class: \`TestClassName\`
- Function: \`test_{what_it_does}\` or \`test_when_{condition}_then_{outcome}\`

## Anti-patterns to avoid
- \`assert True\` — meaningless assertion
- Testing private methods (\`_method\`) directly
- Tests that depend on execution order
- Mocking the module under test
- Using \`time.sleep\` in tests
`

const TEST_WRITING_GO = `---
name: j.test-writing
description: Write focused unit and integration tests using Go testing
---

# Skill: Test Writing (Go)

## When this skill activates
Writing or editing \`*_test.go\` files.

## Required Steps

### 1. Read the implementation first
Before writing any test, read the file being tested. Understand:
- What it does (not what you think it does)
- Its dependencies and side effects
- Error cases and edge conditions

### 2. Test structure
Use table-driven tests with \`t.Run\`:
\`\`\`go
func TestFunctionName(t *testing.T) {
    tests := []struct {
        name     string
        input    InputType
        expected OutputType
        wantErr  bool
    }{
        {
            name:     "happy path",
            input:    validInput,
            expected: expectedOutput,
        },
        {
            name:    "invalid input returns error",
            input:   invalidInput,
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result, err := FunctionName(tt.input)

            if tt.wantErr {
                if err == nil {
                    t.Fatal("expected error, got nil")
                }
                return
            }
            if err != nil {
                t.Fatalf("unexpected error: %v", err)
            }
            if result != tt.expected {
                t.Errorf("got %v, want %v", result, tt.expected)
            }
        })
    }
}
\`\`\`

### 3. Coverage requirements
- Happy path: at least 1 test case
- Error cases: test each distinct error path
- Edge cases: nil inputs, zero values, empty slices
- Use \`t.Parallel()\` for independent subtests

### 4. Mock strategy
- Use interfaces for dependency injection
- Create mock implementations in test files
- For HTTP, use \`httptest.NewServer\`
- For DB, use test containers or in-memory implementations

### 5. Test helpers
\`\`\`go
func setupTestDB(t *testing.T) *DB {
    t.Helper()
    db := NewTestDB()
    t.Cleanup(func() { db.Close() })
    return db
}
\`\`\`

### 6. Naming conventions
- File: \`{package}_test.go\` in the same package
- Function: \`TestFunctionName\`, \`TestType_Method\`
- Subtests: descriptive names in \`t.Run("when condition", ...)\`

## Anti-patterns to avoid
- Using \`t.Log\` instead of assertions
- Testing unexported functions from external packages
- Using global state between tests
- Not using \`t.Helper()\` in helper functions
`

const TEST_WRITING_JAVA = `---
name: j.test-writing
description: Write focused unit and integration tests using JUnit 5
---

# Skill: Test Writing (Java/JUnit 5)

## When this skill activates
Writing or editing \`*Test.java\`, \`*Tests.java\`, or \`*IT.java\` files.

## Required Steps

### 1. Read the implementation first
Before writing any test, read the file being tested. Understand:
- What it does (not what you think it does)
- Its dependencies and side effects
- Error cases and edge conditions

### 2. Test structure
Follow the AAA pattern with JUnit 5:
\`\`\`java
@DisplayName("FunctionName")
class FunctionNameTest {

    @Nested
    @DisplayName("when valid input")
    class WhenValidInput {

        @Test
        @DisplayName("should return expected result")
        void shouldReturnExpectedResult() {
            // Arrange
            var input = createValidInput();

            // Act
            var result = functionName(input);

            // Assert
            assertThat(result).isEqualTo(expected);
        }
    }

    @Nested
    @DisplayName("when invalid input")
    class WhenInvalidInput {

        @Test
        @DisplayName("should throw IllegalArgumentException")
        void shouldThrowException() {
            assertThatThrownBy(() -> functionName(invalidInput))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("specific message");
        }
    }
}
\`\`\`

### 3. Coverage requirements
- Happy path: at least 1 test
- Error cases: test each distinct error path
- Edge cases: null inputs, empty collections, boundary values
- Use \`@ParameterizedTest\` for multiple inputs

### 4. Mock strategy (Mockito)
- Mock external dependencies
- Do NOT mock the class under test
\`\`\`java
@ExtendWith(MockitoExtension.class)
class ServiceTest {

    @Mock
    private Repository repository;

    @InjectMocks
    private Service service;

    @Test
    void shouldReturnData() {
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        var result = service.getData(1L);

        assertThat(result).isNotNull();
        verify(repository).findById(1L);
    }
}
\`\`\`

### 5. Naming conventions
- File: \`{ClassName}Test.java\` in \`src/test/java/\`
- Class: \`{ClassName}Test\`
- Method: \`should{ExpectedBehavior}\` or \`should{Action}When{Condition}\`
- Use \`@DisplayName\` for readable test names

## Anti-patterns to avoid
- \`assertTrue(true)\` — meaningless assertion
- Testing private methods via reflection
- \`@SuppressWarnings\` in tests
- Tests that depend on execution order
- Not using \`@ExtendWith(MockitoExtension.class)\`
`

const TEST_WRITING_KOTLIN = `---
name: j.test-writing
description: Write focused unit and integration tests using JUnit 5 with Kotlin idioms
---

# Skill: Test Writing (Kotlin/JUnit 5)

## When this skill activates
Writing or editing \`*Test.kt\`, \`*Tests.kt\`, or \`*IT.kt\` files.

## Required Steps

### 1. Read the implementation first
Before writing any test, read the file being tested. Understand:
- What it does (not what you think it does)
- Its dependencies and side effects
- Error cases and edge conditions

### 2. Test structure
Follow the AAA pattern with JUnit 5 and Kotlin idioms:
\`\`\`kotlin
@DisplayName("FunctionName")
class FunctionNameTest {

    @Nested
    @DisplayName("when valid input")
    inner class WhenValidInput {

        @Test
        @DisplayName("should return expected result")
        fun \`should return expected result\`() {
            // Arrange
            val input = createValidInput()

            // Act
            val result = functionName(input)

            // Assert
            assertThat(result).isEqualTo(expected)
        }
    }

    @Nested
    @DisplayName("when invalid input")
    inner class WhenInvalidInput {

        @Test
        fun \`should throw IllegalArgumentException\`() {
            assertThatThrownBy { functionName(invalidInput) }
                .isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("specific message")
        }
    }
}
\`\`\`

### 3. Kotlin-specific patterns
- Use backtick method names for readable test names: \`fun \\\`should do something\\\`()\`
- Use \`assertThrows<ExceptionType>\` from JUnit 5 Kotlin extensions
- Prefer \`shouldBe\`, \`shouldThrow\` if using Kotest assertions
- Use data classes for test fixtures
- Use \`@ParameterizedTest\` with \`@MethodSource\` for multiple inputs

\`\`\`kotlin
@ParameterizedTest
@MethodSource("invalidInputs")
fun \`should reject invalid input\`(input: String) {
    assertThrows<ValidationException> {
        validate(input)
    }
}

companion object {
    @JvmStatic
    fun invalidInputs() = listOf("", " ", "invalid@chars")
}
\`\`\`

### 4. Mock strategy (Mockito-Kotlin or MockK)
\`\`\`kotlin
// Using MockK (preferred for Kotlin)
class ServiceTest {

    private val repository = mockk<Repository>()
    private val service = Service(repository)

    @Test
    fun \`should return data\`() {
        every { repository.findById(1L) } returns Optional.of(entity)

        val result = service.getData(1L)

        assertThat(result).isNotNull
        verify { repository.findById(1L) }
    }
}
\`\`\`

Or with Mockito-Kotlin:
\`\`\`kotlin
@ExtendWith(MockitoExtension::class)
class ServiceTest {

    @Mock
    lateinit var repository: Repository

    @InjectMocks
    lateinit var service: Service

    @Test
    fun \`should return data\`() {
        whenever(repository.findById(1L)).thenReturn(Optional.of(entity))

        val result = service.getData(1L)

        assertThat(result).isNotNull
        verify(repository).findById(1L)
    }
}
\`\`\`

### 5. Spring Boot test patterns
\`\`\`kotlin
@SpringBootTest
@ActiveProfiles("test")
class IntegrationTest {

    @Autowired
    lateinit var service: MyService

    @MockkBean  // or @MockBean for Mockito
    lateinit var externalClient: ExternalClient

    @Test
    fun \`should integrate correctly\`() {
        every { externalClient.fetch() } returns listOf(data)
        val result = service.process()
        assertThat(result).hasSize(1)
    }
}
\`\`\`

### 6. Naming conventions
- File: \`{ClassName}Test.kt\` in \`src/test/kotlin/\`
- Class: \`{ClassName}Test\`
- Method: backtick names for readability
- Use \`@DisplayName\` or \`@Nested\` for grouping

## Anti-patterns to avoid
- \`assertTrue(true)\` — meaningless assertion
- Testing private methods via reflection
- Not using \`inner class\` with \`@Nested\` (required in Kotlin)
- Using Java-style mock setup instead of Kotlin DSL
- Not cleaning up coroutine test scopes in coroutine tests
- Ignoring \`runTest {}\` for suspend function tests
`

const TEST_WRITING_GENERIC = `---
name: j.test-writing
description: Write focused unit and integration tests following AAA pattern
---

# Skill: Test Writing (Generic)

## When this skill activates
Writing or editing test files in any language.

## Required Steps

### 1. Read the implementation first
Before writing any test, read the file being tested.

### 2. Test structure
Follow the AAA (Arrange-Act-Assert) pattern:
- **Arrange**: set up test data and dependencies
- **Act**: call the function/method under test
- **Assert**: verify the result matches expectations

### 3. Coverage requirements
- Happy path: at least 1 test
- Error cases: test each distinct error path
- Edge cases: empty inputs, boundary values, null/nil/None

### 4. Mock strategy
- Mock external dependencies (APIs, DB, file system)
- Do NOT mock the module under test

### 5. Naming conventions
- Test names should describe the expected behavior
- Group related tests logically

## Anti-patterns to avoid
- Meaningless assertions
- Testing implementation details instead of behavior
- Tests that depend on execution order
`

// ─── Non-test skills (unchanged) ─────────────────────────────────────────────

const PAGE_CREATION = `---
name: j.page-creation
description: Create Next.js App Router pages with correct patterns
---

# Skill: Page Creation

This is a stack-specific skill. Only apply it when the project actually uses Next.js App Router patterns.

## When this skill activates
Creating or editing \`app/**/page.tsx\` or \`app/**/layout.tsx\` files.

## Required Steps

### 1. Determine page type
- **Server Component** (default): data fetching, no interactivity
- **Client Component**: requires \`"use client"\`, interactivity, hooks
- **Mixed**: Server wrapper + Client island

### 2. Server Component pattern
\`\`\`typescript
// app/example/page.tsx
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Page Title",
  description: "Page description",
}

interface PageProps {
  params: { id: string }
  searchParams: { [key: string]: string | string[] | undefined }
}

export default async function ExamplePage({ params, searchParams }: PageProps) {
  // Fetch data at the server level
  const data = await fetchData(params.id)

  return (
    <main>
      {/* render data */}
    </main>
  )
}
\`\`\`

### 3. Client Component pattern
\`\`\`typescript
"use client"
// app/example/client-component.tsx
import { useState, useEffect } from "react"

interface Props {
  initialData: SomeType
}

export function ExampleClient({ initialData }: Props) {
  const [state, setState] = useState(initialData)
  // ...
}
\`\`\`

### 4. Loading and error states
Always create companion files:
- \`loading.tsx\` — skeleton or spinner
- \`error.tsx\` — error boundary (must be client component)
- \`not-found.tsx\` — 404 state

### 5. Data fetching
- Use \`fetch()\` with proper cache options in Server Components
- Use React Query / SWR for client-side data fetching
- Never fetch in useEffect for initial data

## Anti-patterns to avoid
- Mixing server and client concerns in one file
- Using \`useEffect\` for data that could be server-fetched
- Missing loading states
- Not handling error boundaries
`

const API_ROUTE_CREATION = `---
name: j.api-route-creation
description: Create Next.js App Router API routes with correct patterns
---

# Skill: API Route Creation

This is a stack-specific skill. Only apply it when the project actually uses Next.js App Router routes.

## When this skill activates
Creating or editing \`app/api/**/*.ts\` route files.

## Required Steps

### 1. Route handler structure
\`\`\`typescript
// app/api/resource/route.ts
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

// GET — list or single resource
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    const data = await getData(id)
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    console.error("[API GET /resource]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — create resource
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = CreateSchema.parse(body)

    const result = await createResource(validated)
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    console.error("[API POST /resource]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
\`\`\`

### 2. Dynamic routes
\`\`\`typescript
// app/api/resource/[id]/route.ts
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // ...
}
\`\`\`

### 3. Authentication
Check auth before any business logic:
\`\`\`typescript
import { auth } from "@clerk/nextjs/server"

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // ...
}
\`\`\`

### 4. Validation
Always validate with Zod:
\`\`\`typescript
const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
})
\`\`\`

## Anti-patterns
- No try/catch around async operations
- Exposing internal error messages to clients
- Missing input validation
- Returning 200 for errors
`

const SERVER_ACTION_CREATION = `---
name: j.server-action-creation
description: Create Next.js Server Actions with correct patterns
---

# Skill: Server Action Creation

This is a stack-specific skill. Only apply it when the project actually uses Next.js Server Actions.

## When this skill activates
Creating or editing files with \`"use server"\` directive, typically \`actions.ts\` or \`**/actions/*.ts\`.

## Required Steps

### 1. Server Action structure
\`\`\`typescript
"use server"
// app/actions/example.ts
import { revalidatePath, revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { auth } from "@clerk/nextjs/server"

const CreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
})

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createExample(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  // 1. Auth check
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Unauthorized" }

  // 2. Validate
  const raw = Object.fromEntries(formData)
  const result = CreateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: result.error.flatten().fieldErrors,
    }
  }

  // 3. Execute
  try {
    const created = await db.example.create({ data: result.data })

    // 4. Revalidate
    revalidatePath("/examples")

    return { success: true, data: { id: created.id } }
  } catch (error) {
    console.error("[createExample]", error)
    return { success: false, error: "Failed to create. Please try again." }
  }
}
\`\`\`

### 2. Using with useActionState (React 19)
\`\`\`typescript
"use client"
import { useActionState } from "react"
import { createExample } from "../actions/example"

export function ExampleForm() {
  const [state, action, isPending] = useActionState(createExample, null)
  return (
    <form action={action}>
      {state?.error && <p>{state.error}</p>}
      <button disabled={isPending}>Submit</button>
    </form>
  )
}
\`\`\`

## Anti-patterns
- Missing auth checks
- No validation before DB operations
- Catching errors silently without logging
- Forgetting to revalidate affected paths
`

const SCHEMA_MIGRATION = `---
name: j.schema-migration
description: Modify Prisma schema and create migrations safely
---

# Skill: Schema Migration

## When this skill activates
Editing \`prisma/schema.prisma\` or creating migration files.

## Required Steps

### 1. Before modifying schema
- Read the FULL current schema first
- Understand all relations that will be affected
- Check if there's existing data that constraints will affect
- Plan the migration: additive vs breaking change

### 2. Safe schema changes (additive — preferred)
\`\`\`prisma
// Adding a new optional field — always safe
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?  // Add as optional first
  createdAt DateTime @default(now())
}
\`\`\`

### 3. Breaking changes — require care
When adding required fields to existing models with data:
\`\`\`prisma
// Step 1: Add as optional
newField String?

// Step 2: Backfill in a migration
// Step 3: Make required in a separate migration
newField String
\`\`\`

### 4. Create migration
\`\`\`bash
npx prisma migrate dev --name descriptive_migration_name
\`\`\`

Migration name conventions:
- \`add_user_profile\`
- \`add_index_to_email\`
- \`make_phone_optional\`
- \`add_payment_table\`

### 5. Regenerate client
\`\`\`bash
npx prisma generate
\`\`\`

### 6. Update related types
After schema changes, update:
- TypeScript types that mirror the schema
- Zod validation schemas
- API response types
- Test fixtures

### 7. Verify
\`\`\`bash
npx prisma studio  # visual inspection
npx tsc --noEmit   # type check
npm test           # run tests
\`\`\`

## Anti-patterns
- Renaming columns without a migration step (data loss)
- Adding required columns without defaults to non-empty tables
- Forgetting to run \`prisma generate\` after schema changes
- Not updating TypeScript types after schema changes
`

const AGENTS_MD_WRITING = `---
name: j.agents-md-writing
description: Write strong AGENTS.md files with local rules, commands, and boundaries
---

# Skill: AGENTS.md Writing

## When this skill activates
Creating or editing any \`AGENTS.md\` file.

## Goal
Write an agent-facing operating manual for the current directory only.

## Required Sections
- Project or directory purpose
- Build, lint, and test commands that actually work here
- File layout and ownership boundaries
- Local coding conventions and pitfalls
- Review and verification expectations

## Rules
- Keep the root \`AGENTS.md\` concise and high-signal
- Make nested \`AGENTS.md\` files additive, not repetitive
- Prefer concrete commands over vague guidance
- Separate business rules from technical principles:
  - \`AGENTS.md\` = how to work in this area
  - \`docs/domain/*\` = business behavior
  - \`docs/principles/*\` = cross-cutting technical patterns

## Good patterns
- Include exact commands such as \`npm test -- foo\` or \`./gradlew test --tests "..."\`
- Call out invariants, ownership boundaries, and high-blast-radius files
- Mention generated files, migrations, or release steps when relevant

## Anti-patterns
- Dumping generic style advice with no repository specifics
- Repeating the same commands in every nested file
- Mixing business flows into technical instructions
- Writing aspirational rules that are not enforced anywhere
`

const DOMAIN_DOC_WRITING = `---
name: j.domain-doc-writing
description: Write business-domain documentation that stays aligned with code
---

# Skill: Domain Doc Writing

## When this skill activates
Creating or editing files under \`docs/domain/\`.

## Goal
Document how the business domain works now, not how the code is implemented internally.

## Required Structure
- Domain summary
- Rules and invariants
- Inputs, outputs, and state transitions when relevant
- Edge cases and operational limits
- Source of truth references to the key code files

## Sync marker pattern
At the top of a generated or refreshed section, prefer a marker like:

\`<!-- juninho:sync source=src/payments/service.ts hash=abc123 -->\`

Use the marker to indicate which code file justified the current documentation.

## Rules
- Write in present tense
- Prefer user-visible behavior and business meaning
- Cite key files that justify each rule
- Update \`docs/domain/INDEX.md\` when adding or renaming a domain doc

## Anti-patterns
- Explaining framework internals instead of business behavior
- Copying raw code into the document
- Leaving undocumented edge cases discovered during implementation
`

const PRINCIPLE_DOC_WRITING = `---
name: j.principle-doc-writing
description: Write technical principle docs with rationale, rules, and examples
---

# Skill: Principle Doc Writing

## When this skill activates
Creating or editing files under \`docs/principles/\`.

## Goal
Capture cross-cutting engineering guidance that multiple modules should follow.

## Required Structure
- Problem this principle solves
- Rule set (do / avoid)
- Rationale and trade-offs
- Canonical examples in this repository
- Related files or tooling that enforce the rule

## Sync marker pattern
For generated sections, prefer a marker like:

\`<!-- juninho:sync source=src/api/client.ts hash=def456 -->\`

## Rules
- Keep principles technical, reusable, and stack-aware
- Reference concrete files or commands when possible
- Register or update the keyword mapping in \`docs/principles/manifest\`
- Distinguish principle docs from domain docs and \`AGENTS.md\`

## Anti-patterns
- Repeating business requirements here
- Writing slogans with no enforcement or examples
- Documenting obsolete patterns without marking them deprecated
`

const SHELL_SCRIPT_WRITING = `---
name: j.shell-script-writing
description: Write robust shell automation for project workflows and hooks
---

# Skill: Shell Script Writing

## When this skill activates
Creating or editing shell scripts, especially in \`.opencode/scripts/\`, \`scripts/\`, or git hooks.

## Required Steps
1. Start with \`#!/bin/sh\` unless bash-only features are required
2. Use \`set -e\` and quote every variable expansion that can contain spaces
3. Resolve and \`cd\` to the project root before running project commands
4. Prefer delegating to project scripts (\`npm run ...\`, \`make ...\`, \`./gradlew ...\`) over embedding large command logic
5. Print short, actionable failure messages

## Preferred patterns
- Detect staged files once and reuse them
- Support project-specific overrides before framework defaults
- Keep hook scripts fast; full-suite checks belong outside the pre-commit path

## Anti-patterns
- Hardcoding one stack when multiple fallback commands are possible
- Running the full test suite inside pre-commit by default
- Using unquoted file lists or unsafe globbing
- Mixing environment bootstrapping with small hook utilities
`
