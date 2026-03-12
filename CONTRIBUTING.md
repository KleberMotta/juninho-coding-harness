# Contributing to juninho

Obrigado por querer contribuir! Este guia explica como configurar o ambiente, entender a arquitetura e submeter contribuições.

## Índice

- [Setup do ambiente](#setup-do-ambiente)
- [Arquitetura](#arquitetura)
- [Tipos de contribuição](#tipos-de-contribuição)
- [Workflow de desenvolvimento](#workflow-de-desenvolvimento)
- [Convenções](#convenções)
- [Testando localmente](#testando-localmente)
- [Submetendo uma PR](#submetendo-uma-pr)
- [Release process](#release-process)

---

## Setup do ambiente

**Pré-requisitos:** Node.js 18+ e npm 9+

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/juninho.git
cd juninho

# Instale as dependências
npm install

# Build inicial
npm run build

# Modo watch (recompila ao salvar)
npm run dev
```

---

## Arquitetura

```
src/
├── cli.ts          # Entry point — parseia args, chama runSetup()
├── installer.ts    # Orquestra o setup: cria dirs, chama cada template
├── templates/support-scripts.ts # Scripts shell gerados para hooks e checks
└── templates/
    ├── agents.ts   # 9 agentes (planner, spec-writer, implementer...)
    ├── plugins.ts  # 12 plugins OpenCode (hooks de sessão/arquivo)
    ├── tools.ts    # 4 ferramentas (lsp, ast-grep, find-pattern...)
    ├── skills.ts   # 9 skills (tests, docs, scripts, stack-specific)
    ├── commands.ts # 14 slash commands (/plan, /spec, /implement...)
    ├── state.ts    # Templates de estado (persistent-context, execution-state, workflow-config)
    └── docs.ts     # AGENTS.md, INDEX.md, manifest + patchOpencodeJson()
```

**Fluxo de dados:**

```
juninho setup
     ↓
cli.ts → runSetup(projectDir)
     ↓
installer.ts → createDirectories() → writeAgents() → writeSkills()
             → writePlugins() → writeTools() → writeSupportScripts()
             → writeCommands() → writeState() → writeDocs() → patchOpencodeJson()
             → write .juninho-installed marker
```

**Princípio fundamental:** O `juninho` é um bootstrapper. Ele escreve arquivos estáticos no projeto alvo. Esses arquivos são depois lidos/executados pelo OpenCode — o pacote em si não precisa estar instalado no projeto alvo.

---

## Tipos de contribuição

### Adicionar um novo agente

1. Adicione a string do agente em `src/templates/agents.ts` seguindo o formato:
   ```markdown
   ---
   description: <descrição para autocomplete @mention>
   mode: subagent
   model: anthropic/claude-sonnet-4-5
   ---
   <prompt completo>
   ```
2. Exporte e chame `writeFileSync` para o novo arquivo em `writeAgents()`
3. Registre no `opencode.json` em `patchOpencodeJson()` em `docs.ts`
4. Adicione na tabela de agentes do `AGENTS.md` template

### Adicionar um novo plugin

1. Adicione a string do plugin em `src/templates/plugins.ts`
2. O plugin deve usar a API `@opencode-ai/plugin` e exportar default satisfying `Plugin`
3. Chame `writeFileSync` para o novo arquivo em `writePlugins()`
4. Documente na tabela de plugins do `AGENTS.md` template

### Adicionar uma nova skill

1. Crie o novo diretório em `createDirectories()` no `installer.ts`
2. Adicione a string do `SKILL.md` em `src/templates/skills.ts`
3. Adicione o mapeamento de path em `src/templates/plugins.ts` no `skill-inject`
4. Chame `writeFileSync` em `writeSkills()`

### Ajustar scripts de hook ou checks

1. Edite `src/templates/support-scripts.ts`
2. Mantenha o pre-commit rápido: lint estrutural + testes relacionados
3. Coloque checks amplos em `.opencode/scripts/check-all.sh`
4. Atualize `docs/wiki/commands.md` e `README.md` se o comportamento exposto ao usuário mudar

### Adicionar um novo comando slash

1. Adicione a string do comando em `src/templates/commands.ts`
2. Chame `writeFileSync` em `writeCommands()`

### Melhorar um prompt existente

Edite a string correspondente no arquivo de template. Os prompts são strings TypeScript — qualquer editor funciona. Verifique se a mudança não quebra o formato esperado pelo OpenCode (frontmatter YAML válido + Markdown).

---

## Workflow de desenvolvimento

```bash
# Terminal 1: compilação em watch mode
npm run dev

# Terminal 2: teste após cada mudança
node dist/cli.js setup /tmp/dev-test --force

# Ver o que foi gerado
ls /tmp/dev-test/.opencode/
cat /tmp/dev-test/opencode.json
```

### Testando uma mudança específica

```bash
# Rebuild
npm run build

# Setup forçado em dir de teste
mkdir -p /tmp/my-test
node dist/cli.js setup /tmp/my-test --force

# Inspecionar o arquivo específico que mudou
cat /tmp/my-test/.opencode/agents/planner.md
```

---

## Convenções

### Código TypeScript

- TypeScript strict mode — sem `any` implícito
- Nomes de função: `camelCase`
- Nomes de arquivo: `kebab-case`
- Imports com extensão `.js` (NodeNext module resolution)
- Sem dependências externas desnecessárias — o pacote deve ser zero-dep em runtime

### Strings de template

- Conteúdo em inglês (o OpenCode opera em inglês por padrão)
- Comentários explicativos de por que uma regra existe, não o que ela faz
- Prompts de agente: específicos e acionáveis, sem regras vagas
- Plugins: sempre testar o caminho de "plugin não disponível" (graceful degradation)

### Commits

Seguir [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add memory-manager agent
fix: correct hashline hash length from 2 to 4 chars
docs: update AGENTS.md with new plugin table
chore: upgrade typescript to 5.5
refactor: extract deepMerge into utils module
```

---

## Testando localmente

### Método 1: `npm link` (recomendado para testar como usuário final)

```bash
# No diretório do juninho
npm run build
npm link

# Em qualquer projeto
cd /caminho/para/meu-projeto
juninho setup

# Para desfazer
npm unlink -g juninho
```

### Método 2: `node dist/cli.js` (mais rápido durante desenvolvimento)

```bash
node /caminho/para/juninho/dist/cli.js setup /tmp/teste
node /caminho/para/juninho/dist/cli.js setup /tmp/teste --force
node /caminho/para/juninho/dist/cli.js --help
```

### Checklist de smoke test manual

```bash
# 1. Setup limpo
rm -rf /tmp/smoke && mkdir /tmp/smoke
node dist/cli.js setup /tmp/smoke
# → deve mostrar todos os ✓ e mensagem de sucesso

# 2. Idempotência
node dist/cli.js setup /tmp/smoke
# → deve mostrar "already installed"

# 3. Force reinstall
node dist/cli.js setup /tmp/smoke --force
# → deve rodar setup completo novamente

# 4. Estrutura completa
find /tmp/smoke -type f | wc -l
# → deve ser 39+ arquivos

# 5. opencode.json válido
node -e "JSON.parse(require('fs').readFileSync('/tmp/smoke/opencode.json','utf8'))" && echo "JSON válido"

# 6. Merge preserva config existente
echo '{"myConfig":"preserved"}' > /tmp/existing/opencode.json
node dist/cli.js setup /tmp/existing --force
node -e "const j=JSON.parse(require('fs').readFileSync('/tmp/existing/opencode.json','utf8')); console.assert(j.myConfig==='preserved','FALHOU')"
echo "✓ Merge preserva config"
```

---

## Submetendo uma PR

1. Fork o repositório
2. Crie uma branch: `git checkout -b feat/meu-agente`
3. Faça as mudanças seguindo as convenções
4. Rode o smoke test manual (checklist acima)
5. Commit com mensagem Conventional Commits
6. Push e abra PR usando o template fornecido

**Revisão:** PRs são revisadas em até 5 dias úteis. Feedback será dado inline no GitHub.

---

## Release process

Releases são feitas pelo mantenedor:

```bash
# 1. Atualizar versão em package.json
# 2. Atualizar CHANGELOG.md
# 3. Commit: "chore: release v1.0.0"
# 4. Tag: git tag v1.0.0 && git push origin v1.0.0
# → GitHub Actions publica automaticamente no npm
```

Versões alpha: `1.0.0-alpha.N` — podem ter breaking changes entre versões.
Versões beta: `1.0.0-beta.N` — API estável, bugs sendo corrigidos.
Versão estável: `1.0.0` — pronta para uso em produção.

---

## Dúvidas?

Abra uma [Issue](https://github.com/seu-usuario/juninho/issues) com a label `question`.
