# [ProjectName] — Master Development Context

> **This file is the single source of truth for all Claude Code sessions.**
> Read this file completely before writing any code. If PROGRESS.md exists, read it second.
> Never skip either file. Every session starts here without exception.

---

## What Is [ProjectName]?

[ProjectName] is a **VS Code extension** that brings persistent, project-scoped AI agent teams into a developer's existing workflow. Instead of a single AI assistant, developers register and manage a coordinated team of specialised agents — each with its own memory, tools, and instructions — that collaborate on a shared codebase.

A **Team Lead** agent acts as the primary orchestrator. Registered agents are specialists (Frontend, Backend, QA, Security, etc.). Developers retain full control through human-in-the-loop approval gates.

The core innovation is **persistence** — agent teams survive across sessions, accumulate project-specific memory, and grow more effective over time.

---

## Non-Negotiable Architectural Rules

These rules must never be violated under any circumstances. If you believe a rule needs to change, write a note in PROGRESS.md and stop — do not proceed without explicit human confirmation.

1. **Core Engine has ZERO VS Code dependencies.** `packages/core` must be importable in a plain Node.js environment with no `vscode` module present. This ensures future migration to Electron/Tauri.

2. **All agent logic lives in `packages/core`.** The VS Code extension (`packages/extension`) is a thin shell that calls into core. No business logic in the extension layer.

3. **Memory backends are pluggable.** All backends implement the `MemoryAdapter` interface defined in `packages/shared`. Never hard-code a specific backend anywhere except inside adapter implementations.

4. **ApprovalGate intercepts ALL potentially destructive tool calls.** No agent action classified as Low/Medium/High risk executes without passing through the gate first.

5. **TypeScript strict mode everywhere.** `strict: true` in all tsconfig files. No `any` types without a comment explaining why it is unavoidable.

6. **Every module has unit tests.** Minimum 80% coverage on `packages/core` and `packages/shared`. Tests live in `__tests__` directories alongside source files.

7. **The `.agent/` directory is the runtime agent workspace.** Never store agent state outside this directory structure at runtime.

8. **Agents communicate via file-based inbox only.** No direct in-process function calls between agent sessions. The MessageBus watches `.agent/inbox/` files exclusively.

9. **Never commit secrets.** No API keys, tokens, or credentials in any committed file. Use `.env` files (gitignored) or environment variables.

10. **Self-review before every push.** Run the full test suite and linter. Fix all failures before pushing. Never push broken code.

---

## Monorepo Structure

```
[projectname]/
├── CLAUDE.md                        # This file — always read first
├── PROGRESS.md                      # Session handoff log — read second if it exists
├── package.json                     # Root workspace package.json (npm workspaces)
├── tsconfig.base.json               # Shared TypeScript base config
├── .eslintrc.js                     # Shared ESLint config
├── .gitignore
├── .env.example
├── packages/
│   ├── shared/                      # Shared types, interfaces, constants
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── types/               # All canonical types (index.ts)
│   │       ├── interfaces/          # MemoryAdapter.ts
│   │       ├── constants/           # index.ts
│   │       ├── utils/               # paths.ts, id.ts, logger.ts, validation.ts
│   │       ├── __tests__/           # Unit tests
│   │       └── index.ts             # Re-exports everything
│   ├── core/                        # Standalone agent engine (NO vscode deps)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── memory/              # FileAdapter, SQLiteAdapter, MemoryManager
│   │       ├── registry/            # TeamRegistry
│   │       ├── runtime/             # AgentRuntime, ClaudeCliRunner, SystemPromptBuilder, checkClaude
│   │       ├── messaging/           # MessageBus
│   │       ├── approval/            # ApprovalGate
│   │       ├── orchestrator/        # Orchestrator, TaskQueue
│   │       ├── git/                 # GitManager — branch, commit, push, PR, merge
│   │       ├── templates/           # Agent template library (Phase 7)
│   │       ├── __tests__/           # Unit tests mirroring src structure
│   │       └── index.ts
│   └── extension/                   # VS Code extension shell
│       ├── package.json             # Extension manifest
│       ├── tsconfig.json
│       └── src/
│           ├── extension.ts         # Entry point
│           ├── panels/              # Webview panels
│           ├── providers/           # TreeView providers
│           ├── commands/            # Command handlers
│           └── statusbar/           # Status bar item
```

---

## The `.agent/` Runtime Directory

This directory is created inside a **user's project** at runtime. It is not part of the extension source code.

```
[user-project-root]/
└── .agent/
    ├── PROJECT-INFO.md
    ├── CLAUDE.md                    # Shared instructions for all agents
    ├── team.json                    # Team manifest
    ├── memory/
    │   ├── decisions.md
    │   ├── context.md
    │   ├── tasks.md
    │   └── audit.md                 # Approval gate audit trail
    ├── team-lead/
    │   ├── CLAUDE.md
    │   ├── memory/
    │   └── tools.json
    ├── agents/
    │   └── [agent-id]/
    │       ├── CLAUDE.md
    │       ├── memory/
    │       └── tools.json
    └── inbox/
        ├── team-lead.md
        └── [agent-id].md
```

---

## Canonical TypeScript Types

These live in `packages/shared/src/types/`. Import from `@vscode-ext/shared` everywhere else. Never redefine these types in other packages.

> **These are the implemented types as of Phase 4.2.** The source of truth is `packages/shared/src/types/index.ts`.

```typescript
// --- Primitive types ---

type AgentModel = 'claude-opus-4-6' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001';

type RiskAction =
  | 'deleteFile' | 'push' | 'runScript' | 'modifyConfig'
  | 'installPackage' | 'createFile' | 'forcePush' | 'modifyCI';

type RiskLevel = 'auto' | 'low' | 'medium' | 'high';

type TaskStatus = 'pending' | 'running' | 'awaiting_approval' | 'complete' | 'failed';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'modified';

type MemoryEntryType = 'decision' | 'context' | 'task_summary' | 'preference' | 'fact';

type MemoryBackend = 'files' | 'sqlite' | 'custom';

// Result type — used throughout core
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

// --- Interfaces ---

interface GitPermissions {
  canBranch: boolean;
  canCommit: boolean;
  canPush: boolean;
  canCreatePR: boolean;
  canMerge: boolean;
}

interface MCPServerConfig {
  name: string;
  url: string;
  allowedTools: string[];
}

interface Agent {
  id: string;
  name: string;
  role: string;
  model: AgentModel;
  template?: string;
  maxTurns: number;          // max CLI turns per task (subscription mode — no per-call USD billing)
  sessionId?: string;
  git: GitPermissions;
  approvalRequired: RiskAction[];
  mcpServers?: MCPServerConfig[];
  builtinTools: string[];
}

interface TeamLeadConfig {
  model: AgentModel;
  maxTurns: number;
  sessionId?: string;
}

interface MemoryConfig {
  backend: MemoryBackend;
  path: string;
  customAdapterPath?: string;
}

interface GlobalGitConfig {
  defaultBranch: string;
  agentBranchPrefix: string;
  requireReviewBeforeMerge: boolean;
}

interface TeamConfig {
  version: string;
  project: string;
  teamLead: TeamLeadConfig;
  agents: Agent[];
  memory: MemoryConfig;
  git: GlobalGitConfig;
}

interface Task {
  id: string;
  agentId: string;
  prompt: string;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
  result?: string;
  cost?: number;
  error?: string;
}

interface ApprovalResolution {
  decision: 'approved' | 'rejected' | 'modified';
  modifiedParams?: Record<string, unknown>;
  feedback?: string;
  resolvedAt: string;
}

interface ApprovalRequest {
  id: string;
  agentId: string;
  taskId: string;
  action: RiskAction;
  riskLevel: RiskLevel;
  description: string;
  context: string;
  requestedAt: string;
  status: ApprovalStatus;
  resolution?: ApprovalResolution;
}

interface MemoryEntry {
  id: string;
  agentId: string | 'project';
  type: MemoryEntryType;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string | 'all';
  taskId?: string;
  subject: string;
  body: string;
  sentAt: string;
  readAt?: string;
}

interface AgentTemplate {
  id: string;
  name: string;
  role: string;
  description: string;
  defaultModel: AgentModel;
  defaultTools: string[];
  defaultMcpServers?: MCPServerConfig[];
  claudeMdTemplate: string;
  defaultApprovalRequired: RiskAction[];
  defaultGitPermissions: GitPermissions;
}

interface TeamPreset {
  id: string;
  name: string;
  description: string;
  agents: Array<{
    templateId: string;
    customName?: string;
    modelOverride?: AgentModel;
  }>;
}

interface AgentStatus {
  agentId: string;
  state: 'idle' | 'thinking' | 'writing' | 'awaiting_approval' | 'error' | 'offline';
  currentTaskId?: string;
  lastActivityAt: string;
  sessionActive: boolean;
  tokensUsed: number;
  costUsd: number;
}

interface ProjectInfo {
  name: string;
  description: string;
  techStack: string[];
  rootPath: string;
  agentDirPath: string;
}

// MemoryAdapter lives in packages/shared/src/interfaces/MemoryAdapter.ts
interface MemoryAdapter {
  init(config: MemoryConfig): Promise<void>;
  write(entry: MemoryEntry): Promise<void>;
  read(id: string): Promise<MemoryEntry | null>;
  list(filter?: { agentId?: string; type?: MemoryEntryType; tags?: string[]; limit?: number; since?: string }): Promise<MemoryEntry[]>;
  search(query: string, agentId?: string): Promise<MemoryEntry[]>;
  delete(id: string): Promise<void>;
  compact(agentId: string): Promise<void>;
}
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Extension Shell | TypeScript, VS Code Extension API |
| Core Engine | TypeScript / Node.js (zero vscode deps) |
| Agent Runtime | Claude Code CLI (`claude --print`) via subprocess — uses user's Pro/Max subscription |
| UI Panels | VS Code Webview API + React + Tailwind CSS |
| Memory (default) | Local markdown/JSON files via Node.js `fs` |
| Memory (SQLite) | `better-sqlite3` |
| Git Operations | `simple-git` |
| Agent Pack (export/import) | `archiver` + `unzipper` (Phase 7.2, `packages/core`) |
| File Watching | `chokidar` |
| Testing | `vitest` |
| Bundler | `esbuild` |
| Linting | ESLint + `@typescript-eslint` |

---

## Git & GitHub Workflow

### One-Time Repo Setup (Phase 1.1 only)

```bash
git init
git add -A
git commit -m "chore: initial commit"

# Create GitHub repo and push
gh repo create [projectname] --private --source=. --remote=origin --push
```

If the repo already exists:
```bash
git remote add origin https://github.com/[username]/[projectname].git
git push -u origin main
```

### Branch Strategy

Every sub-phase gets its own branch created from `main`:
```bash
git checkout main
git pull origin main
git checkout -b phase/[N]-[M]-[short-description]
```

Branch naming convention:
```
phase/1-1-monorepo-scaffold
phase/1-2-shared-types
phase/2-1-memory-adapters
phase/2-2-team-registry
phase/3-1-agent-runtime
phase/3-2-messagebus-approvalgate
phase/4-1-orchestrator
phase/4-2-git-integration
... etc
```

### Commit Convention (Conventional Commits)

```
type(scope): description

Types: feat, fix, test, refactor, docs, chore, build
Scopes: core, extension, shared, memory, runtime, messaging,
        approval, orchestrator, git, templates, ui, config

Examples:
  feat(shared): add Agent and Task TypeScript interfaces
  feat(core/memory): implement FileMemoryAdapter
  test(core/registry): add unit tests for TeamRegistry
  fix(core/messaging): handle missing inbox file gracefully
  chore(root): configure eslint and tsconfig base
  docs(core): add JSDoc to AgentRuntime public methods
```

### Pre-Push Checklist (run every time before pushing)

```bash
npm run typecheck     # Zero errors required
npm run lint          # Zero errors required (warnings OK)
npm run test          # All tests must pass
```

Only push after all three pass. Fix failures before pushing — never push broken code.

### Pushing a Sub-Phase Branch

```bash
git add -A
git commit -m "type(scope): description"
git push origin phase/[N]-[M]-[description]
```

### Self-Review Before Merging

Before merging any branch to main, perform a self-review:
1. Read every changed file in full
2. Verify no hardcoded secrets, paths, or magic numbers
3. Verify all new functions have JSDoc comments
4. Verify tests cover the happy path and at least two error cases
5. Verify no architectural rules have been violated (see rules above)
6. If all good — merge. If not — fix and re-push.

### Merging to Main

```bash
git checkout main
git pull origin main
git merge phase/[N]-[M]-[description] --no-ff -m "chore: merge phase/[N]-[M]-[description] into main"
git push origin main
git branch -d phase/[N]-[M]-[description]
```

### When to Push

Push to the current branch after completing ANY of:
- A complete interface or type definition with tests
- A complete class or module with tests
- A complete sub-phase
- A complete phase
- Any working, tested, logical unit of work

Do not batch up large amounts of work without pushing. Commit and push often.

### PROGRESS.md

Update PROGRESS.md before every push. It is the handoff document for the next session.

---

## PROGRESS.md Format

Maintain this exact format so future sessions can parse it reliably:

```markdown
# [ProjectName] — Development Progress

## Last Updated
[ISO8601 timestamp]

## Current Phase
Phase [X] — [Phase Name] | Sub-phase [X.Y] — [Sub-phase Name]

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold
- [x] 1.2 — Shared types
- [ ] 1.3 — MemoryAdapter interface (IN PROGRESS)

## Current Branch
phase/[x]-[y]-[description]

## What Was Just Built
[2-3 sentences describing exactly what was implemented]

## Decisions Made This Session
- [Decision and brief rationale]

## Known Issues / TODOs
- [Anything incomplete, deferred, or needs attention]

## What The Next Session Should Do First
[Explicit step-by-step instructions for picking up exactly here]

## File Tree Snapshot
[Output of: find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*']
```

---

## Approval Gate Risk Classification

| Risk Level | Trigger Actions | Approval Method |
|-----------|----------------|-----------------|
| Auto | Read, search, run tests, write agent memory, send messages | No interruption |
| Low | Create files, install packages, create git branches | VS Code notification popup |
| Medium | Modify files outside agent scope, run shell scripts, push to remote | Approval Queue panel |
| High | Delete files, force-push, modify CI/CD, access env vars | Blocking Approval Queue |

---

## Agent Template Definitions

### frontend
Tools: `["Read", "Write", "Bash", "Glob", "Grep", "WebFetch"]`
Focus: Component architecture, design system, accessibility, CSS conventions

### backend
Tools: `["Read", "Write", "Bash", "Glob", "Grep"]`
Focus: REST conventions, error handling, input validation, security best practices

### qa
Tools: `["Read", "Write", "Bash", "Glob", "Grep"]`
Focus: Test pyramid, coverage, edge cases, CI integration

### security
Tools: `["Read", "Grep", "Bash", "Glob"]`
Focus: OWASP Top 10, dependency CVEs, least privilege, secrets hygiene

### devops
Tools: `["Read", "Write", "Bash", "Glob"]`
Focus: IaC, CI/CD, immutable deployments, rollback procedures

### documentation
Tools: `["Read", "Write", "WebFetch", "Glob"]`
Focus: Clarity, completeness, keeping docs in sync with code

### database
Tools: `["Read", "Write", "Bash", "Glob"]`
Focus: Migration safety, index strategy, query performance, data integrity

### reviewer
Tools: `["Read", "Grep", "Glob"]`
Focus: Code quality, consistency with existing patterns, constructive feedback

---

## Team Presets

| Preset | Agents |
|--------|--------|
| fullstack-web | Team Lead + frontend + backend + qa + security |
| api-service | Team Lead + backend + documentation + qa |
| open-source | Team Lead + reviewer + documentation + qa |
| solo | Team Lead + general (broad permissions) |

---

## Phase Overview

| Phase | Name | Prompt File |
|-------|------|-------------|
| 1 | Foundation | PHASE-1.md |
| 2 | Agent Runtime | PHASE-2.md |
| 3 | Orchestration & Approval | PHASE-3.md |
| 4 | Git Integration | PHASE-4.md |
| 5 | VS Code Shell | PHASE-5.md |
| 6 | Approval Queue UI | PHASE-6.md |
| 7 | Templates, Polish & E2E | PHASE-7.md |

Start each phase by reading CLAUDE.md, then PROGRESS.md, then the relevant PHASE-N.md file.

---

## Build & Test Configuration Notes

These patterns were discovered during implementation and must be followed in all future phases.

### TypeScript `rootDir` in `packages/core`

`packages/core/tsconfig.json` does **not** set `rootDir`. Reason: the `paths` alias maps `@vscode-ext/shared` to `../shared/src`, which pulls shared source files into core's compilation. Setting `rootDir: "src"` causes **TS6059** because those files are outside `src/`. Without `rootDir`, TypeScript infers the common ancestor automatically. The `--noEmit` typecheck is unaffected; if a build step is added later, use a separate `tsconfig.build.json` with project references.

### Vitest `resolve.alias` for `@vscode-ext/shared`

Any `vitest.config.ts` in a package that imports from `@vscode-ext/shared` **must** declare a `resolve.alias` entry, because Vitest (Vite) does not read TypeScript `paths`. Example — `packages/core/vitest.config.ts`:

```typescript
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@vscode-ext/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  // ...
});
```

Apply the same pattern to `packages/extension/vitest.config.ts`. The extension config additionally aliases `vscode` to the mock (see below):

```typescript
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/__mocks__/vscode.ts'),
      '@vscode-ext/shared': path.resolve(__dirname, '../shared/src'),
      '@vscode-ext/core': path.resolve(__dirname, '../core/src'),
    },
  },
  // ...
});
```

### VS Code module mock for extension tests

Extension tests cannot import the real `vscode` module (no VS Code host in Vitest). Alias it via `vitest.config.ts` and maintain a manual mock at `packages/extension/src/__mocks__/vscode.ts`. The mock must export:

- `window.createWebviewPanel` — returns a `mockPanel` with `webview`, `reveal`, `dispose`, `onDidDispose`
- `mockWebview.postMessage`, `onDidReceiveMessage`
- Test helpers: `_reset()` (resets all mocks between tests), `_triggerMessage(msg)` (simulates webview → extension message), `_triggerDispose()` (fires panel dispose)
- `Uri.file`, `ViewColumn`, `workspace`, `commands`

Call `_reset()` in `beforeEach` so mock state never leaks between tests.

### ESLint disable for dynamic `require()`

When suppressing `require()` usage inside source code, use the correct rule name:

```typescript
// eslint-disable-next-line @typescript-eslint/no-var-requires   ← for const x = require(...)
// eslint-disable-next-line @typescript-eslint/no-require-imports ← wrong name, does not suppress
```

The `@typescript-eslint/recommended` preset (v6) enables `@typescript-eslint/no-var-requires`, not `no-require-imports`. Always use `no-var-requires` for disable comments on `const x = require(...)` declarations.

### Casting `vi.fn().mock.calls` entries in TypeScript

Vitest's `mock.calls` is typed as `unknown[][]`. Casting a call entry directly to a tuple type (`as [string, string]`) causes TS2352 because `[]` does not sufficiently overlap. Always go through `unknown` first:

```typescript
// Wrong — TS2352
const [a, b] = spy.mock.calls[0] as [string, string];

// Correct
const [a, b] = spy.mock.calls[0] as unknown as [string, string];
```

### PHASE spec files may use non-canonical names

The `_phases/PHASE-N.M.md` spec files are written ahead of implementation and may use names that differ from the canonical names in this file. **CLAUDE.md always takes precedence.** Known divergences:

| Spec file said | Canonical (CLAUDE.md) |
|---|---|
| `bus/` | `messaging/` |
| `gate/` | `approval/` |
| `maxBudgetUsd` (Agent field) | `maxTurns` |
| `ModelId` (Phase 7 `AgentTemplate.defaultModel`) | `AgentModel` |
| `ActionType` (Phase 7 `AgentTemplate.defaultApprovalRequired`) | `RiskAction` |
| `claudeMd` (Phase 7 `AgentTemplate` field) | `claudeMdTemplate` |
| `tools: AgentTools` (Phase 7 `AgentTemplate` field) | `defaultTools: string[]` |
| `TeamPreset.agentTemplateIds: string[]` (old canonical) | `TeamPreset.agents: Array<{ templateId, customName?, modelOverride? }>` (updated Phase 7.1) |
| `ProjectNameCore` (Phase 7.4 e2e facade) | No canonical equivalent — e2e tests should construct `TeamRegistry`, `Orchestrator`, etc. directly |

When a spec names a directory or field, verify it matches the canonical name here before creating files. If it differs, use the canonical name and note the divergence in PROGRESS.md.

### Windows-safe `execSync` in tests

Never pass `shell: '/bin/bash'` to `execSync` in test files — `/bin/bash` does not exist on Windows and will throw `ENOENT`. Use cross-platform alternatives:

```typescript
// Wrong — fails on Windows
execSync('git checkout main 2>/dev/null || git checkout -', { cwd, shell: '/bin/bash' });

// Correct — use simple-git or a platform-neutral call
const currentBranch = await gitManager.getCurrentBranch();
```

When a test needs to know the current branch, call `GitManager.getCurrentBranch()` rather than shelling out.

### TypeScript `lib` and `rootDir` in `packages/extension`

`packages/extension/tsconfig.json` must **not** set `rootDir` or `lib`. Reason: the `paths` aliases map `@vscode-ext/core` → `../core/src` and `@vscode-ext/shared` → `../shared/src`, pulling those source files into the extension's compilation. Setting `rootDir: "src"` causes TS6059. Setting `lib: ["ES2022"]` (explicit) causes `AbortController`/`AbortSignal` to be missing because it uses the minimal lib — omitting `lib` defaults to the full `es2022` lib (which includes DOM types) and matches the core package's behaviour.

### `WebviewPanel.badge` missing from `@types/vscode`

`WebviewPanel.badge` exists at runtime (VS Code 1.79+) but is absent from `@types/vscode@1.85`. Setting it directly causes TS2339. Access it via an `unknown` cast with a comment:

```typescript
// badge exists on WebviewPanel at runtime (VS Code 1.79+) but is absent from @types/vscode here
const panelWithBadge = this.panel as unknown as { badge?: { value: number; tooltip: string } };
panelWithBadge.badge = { value: count, tooltip: `${count} pending approval(s)` };
// or clear it:
panelWithBadge.badge = undefined;
```

In the vscode mock (`src/__mocks__/vscode.ts`) add `badge: undefined` to `mockPanel` and reset it in `_reset()` so tests can assert on its value.

---

## Definition of Done

A sub-phase is complete when:
1. All TypeScript compiles with zero errors
2. All tests pass with >= 80% coverage on new code
3. ESLint passes with zero errors
4. PROGRESS.md is updated
5. Branch pushed to GitHub
6. Branch merged to main and deleted
7. Next sub-phase branch created ready to go

---

## If You Get Stuck

1. Write the blocker clearly in PROGRESS.md under "Known Issues"
2. Implement the simplest workaround that does not violate architectural rules
3. Mark it with `// TODO: [description]` in code
4. Push what you have and stop
5. Do not attempt to solve architecture-level problems mid-session

---

## Environment Variables

```bash
# No ANTHROPIC_API_KEY required.
# Authentication is handled by the user's local Claude Code installation.
# Users must have Claude Code installed and authenticated:
#   npm install -g @anthropic-ai/claude-code
#   claude login
#
# The extension checks for claude CLI availability at startup and
# surfaces a clear error message if not found.

GITHUB_TOKEN=ghp_...           # Optional — gh CLI handles auth normally
```

Never commit `.env`. Document all variables in `.env.example` without values.
