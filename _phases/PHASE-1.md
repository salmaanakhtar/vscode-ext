# Phase 1 — Foundation

> **Before starting:** Read CLAUDE.md in full. Read PROGRESS.md if it exists.
> This is the first phase. If PROGRESS.md does not exist, you are starting fresh.

---

## Phase 1 Goal

Establish the complete monorepo foundation: workspace configuration, shared TypeScript types, the MemoryAdapter interface, the local file memory backend, and the TeamRegistry. By the end of Phase 1, the core data layer is fully built, tested, and pushed to GitHub.

No VS Code code. No Claude Agent SDK. Pure Node.js TypeScript that can be tested in isolation.

---

## Sub-phases

| Sub-phase | Name | Branch |
|-----------|------|--------|
| 1.1 | Monorepo scaffold & GitHub setup | `phase/1-1-monorepo-scaffold` |
| 1.2 | Shared types & constants | `phase/1-2-shared-types` |
| 1.3 | MemoryAdapter interface & file backend | `phase/1-3-memory-adapter` |
| 1.4 | SQLite memory backend | `phase/1-4-sqlite-backend` |
| 1.5 | TeamRegistry | `phase/1-5-team-registry` |

Complete sub-phases in order. Do not start a sub-phase until the previous one is merged to main.

---

## Sub-phase 1.1 — Monorepo Scaffold & GitHub Setup

### What to build

Set up the complete monorepo skeleton with npm workspaces, shared TypeScript config, ESLint, and an initial GitHub repository.

### Step-by-step

1. Create root `package.json` with npm workspaces:
```json
{
  "name": "vscode-ext",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces --if-present",
    "lint": "eslint packages/*/src --ext .ts",
    "clean": "rimraf packages/*/dist packages/*/node_modules node_modules"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.0.0",
    "rimraf": "^5.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

2. Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

3. Create `.eslintrc.js`:
```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking'
  ],
  parserOptions: {
    project: ['./packages/*/tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-console': 'warn'
  }
};
```

4. Create `.gitignore`:
```
node_modules/
dist/
*.js.map
.env
.DS_Store
*.vsix
out/
coverage/
```

5. Create `.env.example`:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
GITHUB_TOKEN=ghp_optional_used_by_gh_cli
```

6. Create empty package scaffolds for `packages/shared`, `packages/core`, `packages/extension`:

For each package, create:
- `packages/[name]/package.json`
- `packages/[name]/tsconfig.json` (extends `../../tsconfig.base.json`)
- `packages/[name]/src/index.ts` (empty export)

`packages/shared/package.json`:
```json
{
  "name": "@projectname/shared",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "dev": "tsc --watch"
  }
}
```

`packages/core/package.json`:
```json
{
  "name": "@projectname/core",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@projectname/shared": "*"
  }
}
```

`packages/extension/package.json`:
```json
{
  "name": "@projectname/extension",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "activationEvents": ["onStartupFinished"],
  "main": "dist/extension.js",
  "contributes": {
    "commands": [],
    "views": {},
    "viewsContainers": {}
  },
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --platform=node",
    "test": "echo 'Extension tests in Phase 5'"
  },
  "dependencies": {
    "@projectname/core": "*",
    "@projectname/shared": "*"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.20.0"
  }
}
```

7. Create `packages/extension/src/extension.ts` (minimal shell):
```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  console.log('vscode-ext extension activated');
}

export function deactivate(): void {}
```

8. Run `npm install` at root to link workspaces.

9. Initialise git and create GitHub repo:
```bash
git init
git add -A
git commit -m "chore: initial monorepo scaffold"
gh repo create vscode-ext --private --source=. --remote=origin --push
```

### Acceptance criteria
- [ ] `npm install` runs without errors from root
- [ ] `npm run build` compiles all packages without errors
- [ ] `npm run lint` runs without errors
- [ ] GitHub repository exists and main branch is pushed
- [ ] File structure matches the monorepo layout in CLAUDE.md

### Git
```bash
# Branch was created before starting this sub-phase
git checkout -b phase/1-1-monorepo-scaffold
# ... do the work ...
# Pre-push checklist
npm run lint && npm run build
# Commit and push
git add -A
git commit -m "chore: monorepo scaffold, workspace config, github setup"
git push origin phase/1-1-monorepo-scaffold
# Self-review, then merge
git checkout main && git merge phase/1-1-monorepo-scaffold --no-ff -m "chore: merge phase/1-1-monorepo-scaffold into main"
git push origin main && git branch -d phase/1-1-monorepo-scaffold
# Create next branch
git checkout -b phase/1-2-shared-types
```

---

## Sub-phase 1.2 — Shared Types & Constants

### What to build

Implement all canonical TypeScript interfaces and types in `packages/shared`. These are the types defined in CLAUDE.md. Every other package imports from here.

### Files to create

```
packages/shared/src/
├── types/
│   ├── agent.types.ts       # Agent, GitPermissions, ModelId
│   ├── task.types.ts        # Task
│   ├── approval.types.ts    # ApprovalRequest, ApprovalResolution, ActionType, RiskLevel
│   ├── memory.types.ts      # MemoryEntry, MemoryAdapter, MemoryConfig
│   ├── messaging.types.ts   # AgentMessage
│   └── team.types.ts        # TeamConfig
├── constants/
│   ├── risk.constants.ts    # ACTION_RISK_MAP: Record<ActionType, RiskLevel>
│   ├── model.constants.ts   # DEFAULT_MODEL, MODEL_IDS array
│   └── agent.constants.ts   # DEFAULT_BUDGET_USD, DEFAULT_GIT_PERMISSIONS
└── index.ts                 # Re-exports everything
```

### Key implementation notes

- Every interface from the CLAUDE.md "Canonical TypeScript Types" section must be implemented exactly as specified
- Add JSDoc comments to every interface and property
- `ACTION_RISK_MAP` in `risk.constants.ts` must map every `ActionType` to its `RiskLevel` per the Approval Gate table in CLAUDE.md
- Export everything from `index.ts` with named exports

### Tests

Create `packages/shared/src/__tests__/types.test.ts`:
- Test that `ACTION_RISK_MAP` covers all `ActionType` values
- Test that `DEFAULT_GIT_PERMISSIONS` has all fields set to false
- Type-check tests (vitest with TypeScript) verifying interface shapes compile

### Acceptance criteria
- [ ] All types from CLAUDE.md are implemented with JSDoc
- [ ] `ACTION_RISK_MAP` covers every `ActionType`
- [ ] All tests pass
- [ ] `npm run build` on shared package produces `dist/`
- [ ] Types are importable via `@projectname/shared`

### Git
```bash
# Working on phase/1-2-shared-types
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(shared): add all canonical types, interfaces, and constants"
git push origin phase/1-2-shared-types
# Self-review, merge
git checkout main && git merge phase/1-2-shared-types --no-ff -m "chore: merge phase/1-2-shared-types into main"
git push origin main && git branch -d phase/1-2-shared-types
git checkout -b phase/1-3-memory-adapter
```

---

## Sub-phase 1.3 — MemoryAdapter Interface & File Backend

### What to build

Implement the `MemoryAdapter` interface (already defined in shared types) and the first concrete backend: `FileMemoryAdapter`, which persists memory as JSON files in `.agent/memory/` and `.agent/agents/[id]/memory/`.

### Files to create

```
packages/core/src/memory/
├── FileMemoryAdapter.ts
├── FileMemoryAdapter.test.ts
├── MemoryManager.ts         # Facade that holds the active adapter
├── MemoryManager.test.ts
└── index.ts
```

### FileMemoryAdapter spec

```typescript
// Storage layout on disk:
// [agentDir]/[agentId]/[key].json   <- for agent-scoped memory
// [agentDir]/project/[key].json     <- for project-scoped memory (agentId === 'project')

class FileMemoryAdapter implements MemoryAdapter {
  constructor(private basePath: string) {}

  async read(agentId: string, key: string): Promise<MemoryEntry | null>
  async write(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry>
  async search(agentId: string, query: string): Promise<MemoryEntry[]>  // simple substring match on value+tags
  async list(agentId: string, tags?: string[]): Promise<MemoryEntry[]>
  async delete(agentId: string, key: string): Promise<boolean>
  async close(): Promise<void>  // no-op for file backend
}
```

### MemoryManager spec

```typescript
// Holds the configured adapter and exposes it
// Also handles initialising the directory structure

class MemoryManager {
  constructor(config: MemoryConfig, projectRoot: string)
  async initialize(): Promise<void>  // creates .agent/memory dirs if not exist
  getAdapter(): MemoryAdapter
  async close(): Promise<void>
}
```

### Implementation notes

- Use Node.js `fs/promises` exclusively — no third-party file libs
- Keys should be sanitised (replace spaces, slashes with underscores) before use as filenames
- `search()` in the file backend does a simple substring match across `value` and `tags` — not semantic search
- `write()` should upsert: if the key exists, update `updatedAt` and preserve `createdAt`
- Generate IDs with `crypto.randomUUID()`
- All file operations should use try/catch and return sensible defaults (not throw) for missing files

### Tests

Use vitest with a temporary directory (use `os.tmpdir()`) for all file operations. Clean up after each test.

Test coverage must include:
- write then read returns same value
- write same key twice updates updatedAt, preserves createdAt
- read non-existent key returns null
- delete returns true if deleted, false if not found
- list returns all entries for an agentId
- list with tags filters correctly
- search finds entries by substring in value
- search finds entries by tag
- MemoryManager.initialize() creates required directories

### Acceptance criteria
- [ ] FileMemoryAdapter implements MemoryAdapter fully
- [ ] All edge cases tested
- [ ] >= 80% test coverage
- [ ] MemoryManager correctly initialises directory structure
- [ ] No third-party dependencies beyond Node.js built-ins

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/memory): implement FileMemoryAdapter and MemoryManager"
git push origin phase/1-3-memory-adapter
git checkout main && git merge phase/1-3-memory-adapter --no-ff -m "chore: merge phase/1-3-memory-adapter into main"
git push origin main && git branch -d phase/1-3-memory-adapter
git checkout -b phase/1-4-sqlite-backend
```

---

## Sub-phase 1.4 — SQLite Memory Backend

### What to build

A second `MemoryAdapter` implementation backed by `better-sqlite3`. This is an optional backend — users who need better search performance or higher memory volumes can switch to it via `MemoryConfig`.

### Files to create

```
packages/core/src/memory/
├── SqliteMemoryAdapter.ts
└── SqliteMemoryAdapter.test.ts
```

Install dependency in `packages/core`:
```bash
cd packages/core && npm install better-sqlite3 && npm install -D @types/better-sqlite3
```

### SqliteMemoryAdapter spec

```typescript
class SqliteMemoryAdapter implements MemoryAdapter {
  constructor(private dbPath: string) {}

  // Schema: single table `memory_entries` with columns:
  //   id TEXT PRIMARY KEY
  //   agent_id TEXT NOT NULL
  //   key TEXT NOT NULL
  //   value TEXT NOT NULL
  //   tags TEXT NOT NULL  (JSON array stored as string)
  //   created_at TEXT NOT NULL
  //   updated_at TEXT NOT NULL
  //   UNIQUE(agent_id, key)

  async read(agentId: string, key: string): Promise<MemoryEntry | null>
  async write(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry>
  async search(agentId: string, query: string): Promise<MemoryEntry[]>  // SQLite LIKE on value
  async list(agentId: string, tags?: string[]): Promise<MemoryEntry[]>
  async delete(agentId: string, key: string): Promise<boolean>
  async close(): Promise<void>  // closes the db connection
}
```

### Implementation notes

- Use `better-sqlite3` synchronous API (it is synchronous by design) wrapped in async methods for interface compliance
- Create the table with `CREATE TABLE IF NOT EXISTS` on construction
- Use parameterised queries — never string interpolation in SQL
- `search()` uses SQLite `LIKE '%query%'` on the `value` column and also matches tags
- `list()` with tags filters by checking if any of the provided tags exist in the JSON tags array

### Tests

Same test coverage as FileMemoryAdapter — the two adapters must behave identically from the outside. Consider extracting a shared test suite function that both adapter tests call with their respective adapter instance.

### Acceptance criteria
- [ ] SqliteMemoryAdapter passes the same test scenarios as FileMemoryAdapter
- [ ] Shared test suite pattern used to avoid duplication
- [ ] No SQL injection possible (parameterised queries only)
- [ ] >= 80% test coverage

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/memory): implement SqliteMemoryAdapter"
git push origin phase/1-4-sqlite-backend
git checkout main && git merge phase/1-4-sqlite-backend --no-ff -m "chore: merge phase/1-4-sqlite-backend into main"
git push origin main && git branch -d phase/1-4-sqlite-backend
git checkout -b phase/1-5-team-registry
```

---

## Sub-phase 1.5 — TeamRegistry

### What to build

The `TeamRegistry` manages reading and writing `team.json` and the `.agent/` directory structure. It is the source of truth for the team configuration.

### Files to create

```
packages/core/src/registry/
├── TeamRegistry.ts
├── TeamRegistry.test.ts
├── AgentDirectoryManager.ts   # Creates/manages .agent/[agent-id]/ dirs
├── AgentDirectoryManager.test.ts
└── index.ts
```

### TeamRegistry spec

```typescript
class TeamRegistry {
  constructor(private projectRoot: string) {}

  // Initialise a new project — creates .agent/ structure and team.json
  async init(projectName: string, memoryConfig: MemoryConfig): Promise<TeamConfig>

  // Load existing team config from team.json
  async load(): Promise<TeamConfig>

  // Save team config to team.json
  async save(config: TeamConfig): Promise<void>

  // Add a new agent to the team
  async addAgent(config: TeamConfig, agent: Agent): Promise<TeamConfig>

  // Remove an agent from the team
  async removeAgent(config: TeamConfig, agentId: string): Promise<TeamConfig>

  // Check if .agent/team.json exists
  async exists(): Promise<boolean>

  // Get the agent directory path for a given agent id
  getAgentPath(agentId: string): string

  // Get the inbox file path for a given agent id
  getInboxPath(agentId: string): string
}
```

### AgentDirectoryManager spec

```typescript
class AgentDirectoryManager {
  constructor(private projectRoot: string) {}

  // Create full directory structure for a new agent
  async createAgentDirectory(agent: Agent, templateContent?: AgentTemplateContent): Promise<void>

  // Delete an agent's directory
  async removeAgentDirectory(agentId: string): Promise<void>

  // Read an agent's CLAUDE.md
  async readClaudeMd(agentId: string): Promise<string>

  // Write an agent's CLAUDE.md
  async writeClaudeMd(agentId: string, content: string): Promise<void>

  // Read an agent's tools.json
  async readTools(agentId: string): Promise<AgentTools>

  // Write an agent's tools.json
  async writeTools(agentId: string, tools: AgentTools): Promise<void>
}

interface AgentTools {
  builtinTools: string[];
  mcpServers: MCPServerConfig[];
}

interface MCPServerConfig {
  name: string;
  url: string;
  allowedTools: string[];
}

interface AgentTemplateContent {
  claudeMd: string;
  tools: AgentTools;
}
```

### Implementation notes

- `team.json` is pretty-printed JSON (`JSON.stringify(config, null, 2)`)
- `init()` creates: `.agent/`, `.agent/memory/`, `.agent/team-lead/`, `.agent/team-lead/memory/`, `.agent/agents/`, `.agent/inbox/`
- `init()` also creates `.agent/PROJECT-INFO.md` and `.agent/CLAUDE.md` with placeholder content prompting the user to fill them in
- `addAgent()` also calls `AgentDirectoryManager.createAgentDirectory()`
- `removeAgent()` also calls `AgentDirectoryManager.removeAgentDirectory()`
- Always update `updatedAt` on `save()`

### Tests

Use temporary directories. Test:
- `init()` creates all required directories and files
- `load()` reads and parses team.json correctly
- `save()` writes valid JSON
- `addAgent()` adds to agents array and creates directory
- `removeAgent()` removes from agents array and removes directory
- `exists()` returns correct boolean
- Round-trip: init → load → addAgent → save → load returns consistent data

### Acceptance criteria
- [ ] TeamRegistry can initialise a fresh project
- [ ] Round-trip read/write/read produces consistent data
- [ ] AgentDirectoryManager creates correct directory structure
- [ ] All tests pass with >= 80% coverage
- [ ] PROGRESS.md updated with Phase 1 complete status

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/registry): implement TeamRegistry and AgentDirectoryManager"
git push origin phase/1-5-team-registry
# Self-review all Phase 1 code before final merge
git checkout main && git merge phase/1-5-team-registry --no-ff -m "chore: merge phase/1-5-team-registry into main — Phase 1 complete"
git push origin main && git branch -d phase/1-5-team-registry
```

### Update PROGRESS.md

After merging, update PROGRESS.md marking Phase 1 as complete and describing what the next session should start with (Phase 2 — read PHASE-2.md).

---

## Phase 1 Complete Checklist

- [ ] Monorepo compiles end-to-end (`npm run build` from root)
- [ ] All tests pass (`npm run test` from root)
- [ ] ESLint passes (`npm run lint` from root)
- [ ] GitHub repo exists with all sub-phase branches merged to main
- [ ] `packages/shared` exports all canonical types
- [ ] `FileMemoryAdapter` and `SqliteMemoryAdapter` both implement `MemoryAdapter`
- [ ] `TeamRegistry` can init, load, save, addAgent, removeAgent
- [ ] PROGRESS.md is up to date
- [ ] No secrets committed
- [ ] Main branch is clean and up to date on GitHub
