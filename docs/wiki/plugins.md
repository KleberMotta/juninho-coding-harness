# Referência de Plugins

Plugins em `.opencode/plugins/` são **auto-descobertos pelo OpenCode** — sem configuração extra.
Cada plugin exporta um objeto `Plugin` com hooks que rodam em eventos específicos.

## Como plugins funcionam

```
Evento do OpenCode → Plugin intercepta → inject contexto / abort / transformOutput
```

Hooks disponíveis: `tool.execute.before`, `tool.execute.after`, `experimental.session.compacting`, `event`, `shell.env`

---

## env-protection

**Hook:** `tool.execute.before`

Bloqueia acesso acidental a arquivos sensíveis em qualquer tool call que envolva paths.

**Padrões bloqueados:**
- `.env`, `.env.local`, `.env.production`, etc.
- Arquivos com `secret` ou `credential` no nome
- `.pem`, `id_rsa`, `.key`

**Output quando bloqueado:**
```
[env-protection] Blocked access to sensitive file: .env.local
If this is intentional, temporarily disable the env-protection plugin.
```

**Para desabilitar temporariamente:** remova ou renomeie o arquivo `env-protection.ts` em `.opencode/plugins/`.

---

## auto-format

**Hook:** `tool.execute.after` em Write/Edit/MultiEdit

Detecta a extensão do arquivo modificado e roda o formatter adequado:

| Extensão | Formatter |
|----------|-----------|
| `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.css`, `.md` | `prettier --write` |
| `.py` | `black` |
| `.go` | `gofmt -w` |
| `.rs` | `rustfmt` |

**Graceful degradation:** se o formatter não estiver instalado, falha silenciosamente — nunca quebra o fluxo.

---

## plan-autoload

**Hooks:** `tool.execute.after` (Read) + `experimental.session.compacting`

Injeta o plano ativo no contexto da sessão. Fire-once: dispara apenas no primeiro Read.

**Fluxo:**
1. `@planner` termina e escreve o path do `plan.md` em `.plan-ready`
2. No primeiro Read da sessão, o plugin lê `.plan-ready`, carrega o plano e appenda a `output.output`
3. Deleta `.plan-ready` (fire-once) para não re-injetar
4. Durante compaction (`experimental.session.compacting`), re-injeta via `output.context.push` para sobreviver resets

**Resultado:** o agente recebe o plano ativo imediatamente e nunca o perde em compactions.

---

## carl-inject

**Hooks:** `tool.execute.after` (Read) + `experimental.session.compacting`

CARL v2 = **C**ontext-**A**ware **R**etrieval **L**ayer

Analisa o **conteúdo** dos arquivos lidos (não apenas o path) para injetar princípios e docs de domínio relevantes. Inspirado no design do oh-my-opencode (keyword-detector + ContextCollector).

**Algoritmo:**
1. **stripCodeBlocks** — remove blocos de código fenced e inline do texto antes de extrair keywords. Previne falsos positivos de nomes de variáveis, imports, etc.
2. **Três sinais de contexto:**
   - *Task awareness* (fire-once por sessão): lê `execution-state.md` e extrai keywords do Goal + Task List
   - *Conteúdo do arquivo* (primário): keywords do texto do arquivo lido, após strip de código
   - *Path do arquivo* (secundário): complementa a análise de conteúdo
3. **Word-boundary matching com fallback regex** — "auth" match "auth" mas NÃO "authorize" ou "author"; termos curtos e frases também são validados no texto bruto
4. **ContextCollector** com budget cap (`MAX_CONTEXT_BYTES = 8000`) e dedup por key — previne estouro de contexto
5. **Compaction survival** — `experimental.session.compacting` re-injeta todos os docs coletados via `output.context.push`

**Fontes de dados:**
- `docs/principles/manifest` — RECALL keywords + arquivo por princípio (com prioridade opcional)
- `docs/domain/INDEX.md` — keywords + arquivos por domínio

**Pré-requisito:** `docs/principles/manifest` e `docs/domain/INDEX.md` precisam ter conteúdo. Rode `/init-deep` para populá-los.

---

## skill-inject

**Hook:** `tool.execute.after` (Read + Write/Edit)

Mapeia o path do arquivo para uma skill e injeta instruções contextualmente:

| Padrão de path | Skill injetada |
|----------------|----------------|
| `*.test.ts`, `*.spec.ts` | `test-writing/SKILL.md` |
| `app/**/page.tsx` | `page-creation/SKILL.md` |
| `app/api/**/*.ts` | `api-route-creation/SKILL.md` |
| `**/actions.ts` | `server-action-creation/SKILL.md` |
| `**/schema.prisma` | `schema-migration/SKILL.md` |
| `**/AGENTS.md` | `agents-md-writing/SKILL.md` |
| `docs/domain/**/*.md` | `domain-doc-writing/SKILL.md` |
| `docs/principles/**` | `principle-doc-writing/SKILL.md` |
| `.opencode/scripts/**/*.sh`, `scripts/**/*.sh`, `pre-commit` | `shell-script-writing/SKILL.md` |

**Duas fases:**
- **Read:** injeta SKILL.md completo no output (agente recebe instruções ANTES de escrever)
- **Write/Edit:** se o skill nunca foi injetado via Read, lembra o agente de ler o arquivo primeiro

**Resultado:** o agente recebe instruções específicas para cada tipo de artefato — consistência automática.

---

## intent-gate

**Hook:** `tool.execute.after` (Write/Edit)

Scope-guard: depois de qualquer Write/Edit, verifica se o arquivo modificado está no plano ativo.

**Fluxo:**
1. No primeiro Write/Edit, carrega lazy os arquivos mencionados em `plan.md` / `plan-ready.md`
2. Para cada Write/Edit subsequente, compara o path do arquivo com os paths do plano
3. Se o arquivo não está no plano, appenda warning a `output.output`

**Output quando fora do escopo:**
```
[intent-gate] ⚠ SCOPE WARNING: "src/utils/random.ts" is not referenced in the current plan.
Verify this change is necessary for the current task before continuing.
```

**Resultado:** previne scope creep — o agente é alertado quando modifica arquivos fora do plano.

---

## todo-enforcer

**Hooks:** `experimental.session.compacting` + `tool.execute.after` (Write/Edit)

Re-injeta tasks incompletas para prevenir drift.

**Lê:** linhas com `- [ ]` (checkboxes desmarcadas) em `execution-state.md`

**Dois mecanismos:**
- **Compaction:** injeta lista completa de tasks pendentes via `output.context.push` — sobrevive resets de context window
- **Write/Edit:** append lean de contagem pendente no output — nudge contínuo após cada modificação

**Injeta (compaction):**
```
[todo-enforcer] 3 incomplete task(s) remaining:
- [ ] implementar rota de pagamento
- [ ] adicionar testes de integração
- [ ] atualizar AGENTS.md

Do not stop until all tasks are complete. Continue working.
```

**Resultado:** previne drift — o agente nunca perde o estado de tasks, nem em compaction nem entre edits.

---

## comment-checker

**Hook:** `tool.execute.after` em Write/Edit

Detecta comentários óbvios/redundantes no código escrito e injeta um lembrete.

**Padrões detectados:**
- `// increment x`
- `// return something`
- `// check if condition`
- `// loop through array`
- etc.

**Ignorados (comentários legítimos):**
- `@ts-ignore`, diretivas ESLint
- `TODO`, `FIXME`, `HACK`, `NOTE:`
- JSDoc (`/** */`)
- Comentários BDD (given/when/then)

Injeta aviso mas **não bloqueia** — é apenas um lembrete.

---

## hashline-read

**Hook:** `tool.execute.after` em Read

Transforma o output de Read adicionando prefixo `NNN#XX:` em cada linha:

```
001#a3: import { writeFileSync } from "fs"
002#7f: import path from "path"
003#00:
004#b2: export function writeAgents(projectDir: string): void {
```

- `NNN` = número da linha com padding
- `XX` = 2 chars do hash MD5 da linha (estável enquanto a linha não mudar)

**Uso:** o `@implementer` usa essas referências em edits para apontar linhas específicas. O `hashline-edit` valida que as referências ainda são válidas.

---

## hashline-edit

**Hook:** `tool.execute.before` em Edit

Valida referências hashline antes de executar um edit. Se o hash não bate com o conteúdo atual, rejeita o edit com mensagem clara.

**Protege contra:** edits "stale" — quando o agente tenta editar uma linha que já foi modificada por outro agente ou wave anterior.

**Output quando inválido:**
```
[hashline-edit] Stale reference at line 42: expected hash a3, got 7f.
Re-read the file to get current hashlines.
```

---

## directory-agents-injector

**Hook:** `tool.execute.after` (Read)

Mecanismo **Tier 1 de contexto**: quando o agente lê um arquivo, caminha a árvore de diretórios e appenda todo `AGENTS.md` encontrado de forma hierárquica.

**Como funciona:**

```
projeto/
├── AGENTS.md              ← instruções globais (sempre injetadas)
├── src/
│   ├── AGENTS.md          ← instruções do módulo src/
│   └── components/
│       └── AGENTS.md      ← instruções específicas de components/
```

Quando o agente trabalha em `src/components/Button.tsx`, o plugin injeta:
1. `AGENTS.md` da raiz (contexto global)
2. `src/AGENTS.md` (contexto do módulo)
3. `src/components/AGENTS.md` (contexto do sub-módulo)

**Benefício:** diferentes partes do projeto podem ter convenções diferentes (ex: regras de estilo para componentes, padrões de rota para API) sem poluir o contexto global da sessão.

**Integração com `/init-deep`:** o comando `/init-deep` gera `AGENTS.md` hierárquicos automaticamente ao escanear o codebase.

---

## memory

**Hooks:** `tool.execute.after` (qualquer tool) + `experimental.session.compacting`

Injeta `persistent-context.md` (memória de repositório cross-session, como OpenClaw).

**Fluxo:**
1. Na primeira tool call da sessão, lê `.opencode/state/persistent-context.md` e appenda a `output.output`
2. Fire-once per session — não re-injeta em tool calls subsequentes
3. Durante compaction, re-injeta via `output.context.push` para sobreviver resets

**Quem escreve:** apenas `@j.unify` atualiza `persistent-context.md` com decisões, padrões e NOTEs deferidos.

**Resultado:** toda sessão começa com memória do projeto — decisões arquiteturais, padrões descobertos e convenções persistem automaticamente.

---

## Customizando plugins

Para modificar o comportamento de um plugin, edite diretamente o arquivo `.ts` em `.opencode/plugins/`. O OpenCode recarrega plugins automaticamente.

Para desabilitar um plugin: renomeie com prefixo `_`:
```bash
mv .opencode/plugins/comment-checker.ts .opencode/plugins/_comment-checker.ts
```

Para adicionar um plugin novo: crie um arquivo `.ts` em `.opencode/plugins/` seguindo o padrão dos existentes.
