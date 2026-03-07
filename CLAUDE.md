# vscode-ext — Master Development Context

> **This file is the single source of truth for all Claude Code sessions.**
> Read this file completely before writing any code. If PROGRESS.md exists, read it second.
> Never skip either file. Every session starts here without exception.

---

## What Is vscode-ext?

vscode-ext is a **VS Code extension** that brings persistent, project-scoped AI agent teams into a developer's existing workflow. Instead of a single AI assistant, developers register and manage a coordinated team of specialised agents — each with its own memory, tools, and instructions — that collaborate on a shared codebase.

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
vscode-ext/
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
│   │   └── src/
│   │       ├── types/
│   │       ├── constants/
│   │       └── index.ts
│   ├── core/                        # Standalone agent engine (NO vscode deps)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── memory/              # MemoryAdapter + backends
│   │       ├── registry/            # TeamRegistry
│   │       ├── runtime/             # AgentRuntime (Claude Agent SDK)
│   │       ├── messaging/           # MessageBus
│   │       ├── approval/            # ApprovalGate
│   │       ├── orchestrator/        # Orchestrator
│   │       ├── git/                 # Git integration
│   │       ├── templates/           # Agent template library
│   │       └── index.ts
│   └── extension/                   # VS Code extension shell
│       ├── package.json             # Extension manifest
│       ├── tsconfig.json
│       └── src/
│           ├── extension.ts         # Entry point
│           ├── panels/              # Webview panels
│           ├── views/               # TreeView providers
│           ├── commands/            # Command handlers
│           ├── decorations/         # File decorator provider
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

These live in `packages/shared/src/types/`. Import from `@projectname/shared` everywhere else. Never redefine these types in other packages.

```typescript
type ModelId = 'claude-opus-4-6' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001';

type ActionType =
  | 'createFile' | 'deleteFile' | 'modifyFile'
  | 'runScript' | 'installPackage'
  | 'gitBranch' | 'gitCommit' | 'gitPush' | 'gitCreatePR' | 'gitMerge'
  | 'readEnv' | 'networkRequest';

type RiskLevel = 'auto' | 'low' | 'medium' | 'high';

interface GitPermissions {
  canBranch: boolean;
  canCommit: boolean;
  canPush: boolean;
  canCreatePR: boolean;
  canMerge: boolean;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  model: ModelId;
  template?: string;
  maxBudgetUsd: number;
  git: GitPermissions;
  approvalRequired: ActionType[];
  isTeamLead: boolean;
}

interface Task {
  id: string;
  assignedTo: string;
  assignedBy: string;
  prompt: string;
  status: 'pending' | 'active' | 'waiting-approval' | 'complete' | 'failed';
  createdAt: string;
  completedAt?: string;
  result?: string;
  cost?: number;
}

interface ApprovalRequest {
  id: string;
  agentId: string;
  agentName: string;
  action: ActionType;
  riskLevel: RiskLevel;
  description: string;
  parameters: Record<string, unknown>;
  reasoning: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  resolution?: ApprovalResolution;
}

interface ApprovalResolution {
  decision: 'approved' | 'rejected' | 'modified';
  modifiedParameters?: Record<string, unknown>;
  feedback?: string;
  resolvedAt: string;
}

interface AgentMessage {
  id: string;
  from: string;
  to: string;
  re?: string;
  subject: string;
  body: string;
  sentAt: string;
  read: boolean;
}

interface MemoryEntry {
  id: string;
  agentId: string;
  key: string;
  value: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface MemoryAdapter {
  read(agentId: string, key: string): Promise<MemoryEntry | null>;
  write(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntry>;
  search(agentId: string, query: string): Promise<MemoryEntry[]>;
  list(agentId: string, tags?: string[]): Promise<MemoryEntry[]>;
  delete(agentId: string, key: string): Promise<boolean>;
  close(): Promise<void>;
}

interface MemoryConfig {
  backend: 'files' | 'sqlite' | 'custom';
  path: string;
  customAdapterPath?: string;
}

interface TeamConfig {
  version: string;
  project: string;
  teamLead: Agent;
  agents: Agent[];
  memory: MemoryConfig;
  createdAt: string;
  updatedAt: string;
}
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Extension Shell | TypeScript, VS Code Extension API |
| Core Engine | TypeScript / Node.js (zero vscode deps) |
| Agent Runtime | `@anthropic-ai/claude-code` (Claude Agent SDK) |
| UI Panels | VS Code Webview API + React + Tailwind CSS |
| Memory (default) | Local markdown/JSON files via Node.js `fs` |
| Memory (SQLite) | `better-sqlite3` |
| Git Operations | `simple-git` |
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
gh repo create vscode-ext --private --source=. --remote=origin --push
```

If the repo already exists:
```bash
git remote add origin https://github.com/[username]/vscode-ext.git
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
phase/1-3-memory-adapter-interface
phase/2-1-agent-runtime
phase/2-2-session-management
phase/3-1-orchestrator
phase/3-2-approval-gate
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
npm run lint          # Zero errors required
npm run test          # All tests must pass
npm run build         # Zero build errors required
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
# vscode-ext — Development Progress

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
ANTHROPIC_API_KEY=sk-ant-...   # Required for Claude Agent SDK
GITHUB_TOKEN=ghp_...           # Optional — gh CLI handles auth normally
```

Never commit `.env`. Document all variables in `.env.example` without values.
