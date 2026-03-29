# vscode-ext — Development Progress

## Last Updated
2026-03-29T14:00:00Z

## Current Phase
Phase 5 — VS Code Shell | Sub-phase 5.1 — VS Code Extension Shell (COMPLETE)

## Completed Sub-Phases
- [x] 1.1 — Monorepo scaffold
- [x] 1.2 — Shared types, interfaces, utils, and tests
- [x] 2.1 — Memory Adapters (FileAdapter, SQLiteAdapter, MemoryManager)
- [x] 2.2 — TeamRegistry
- [x] 3.1 — Agent Runtime (Claude Code CLI subprocess integration)
- [x] 3.2 — MessageBus & ApprovalGate
- [x] 4.1 — Orchestrator & TaskQueue
- [x] 4.2 — Git Integration (GitManager)
- [x] 5.1 — VS Code Extension Shell

## Current Branch
main (phase/5.1-vscode-shell merged and deleted)

## What Was Just Built
Full VS Code extension shell in `packages/extension/src/`. `ProjectNameSession` holds all core engine instances for a workspace and wires approval requests to VS Code notifications/queue. `registerCommands` registers all 7 commands (initTeam, startTeamLead, addAgent, openApprovalQueue, exportAgent, importAgent, viewProgress). `AgentStatusBar` polls runtime status every 2 seconds and shows active/awaiting counts. `extension.ts` activates everything and auto-starts if a project is already initialised. 179 tests passing.

## Decisions Made This Session
- Extension `tsconfig.json`: removed `rootDir` (TS6059 with cross-package aliases) and `lib` (explicit `["ES2022"]` omits `AbortController`/`AbortSignal`; omitting `lib` defaults to the full variant, matching core's behaviour).
- `autoStart` context param prefixed `_context` — context is captured in command closures, not needed in the auto-start helper itself.

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker.
- `console.log` removed from extension.ts stub — new implementation has no lint warnings.
- `createPR` uses `execSync` with `gh` CLI — not unit-tested (requires real gh); covered in later integration phase.
- 5 pre-existing lint warnings in core test files (`@typescript-eslint/explicit-function-return-type`) — warnings only, zero errors.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-5.2.md` (Agent Panel UI — Webview).
3. Create branch: `git checkout main && git checkout -b phase/5.2-agent-panel`
4. Implement the Agent Team webview panel in `packages/extension/src/panels/`.
5. Write unit tests with >80% coverage.
6. Run `npm run typecheck && npm run lint && npm run test` — all must pass before pushing.

## File Tree Snapshot
```
vsdcode-ext/
├── .env.example
├── .eslintrc.js
├── .gitignore
├── CLAUDE.md
├── PROGRESS.md
├── package.json
├── tsconfig.base.json
├── _phases/
│   └── (all PHASE-*.md files)
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/index.ts
│   │       ├── interfaces/MemoryAdapter.ts
│   │       ├── constants/index.ts
│   │       ├── utils/paths.ts
│   │       ├── utils/id.ts
│   │       ├── utils/logger.ts
│   │       ├── utils/validation.ts
│   │       └── __tests__/
│   │           ├── id.test.ts
│   │           ├── paths.test.ts
│   │           └── validation.test.ts
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── memory/
│   │       │   ├── FileAdapter.ts
│   │       │   ├── SQLiteAdapter.ts
│   │       │   ├── MemoryManager.ts
│   │       │   └── index.ts
│   │       ├── registry/
│   │       │   ├── TeamRegistry.ts
│   │       │   └── index.ts
│   │       ├── runtime/
│   │       │   ├── checkClaude.ts
│   │       │   ├── ClaudeCliRunner.ts
│   │       │   ├── SystemPromptBuilder.ts
│   │       │   ├── AgentRuntime.ts
│   │       │   └── index.ts
│   │       ├── messaging/
│   │       │   ├── MessageBus.ts
│   │       │   └── index.ts
│   │       ├── approval/
│   │       │   ├── ApprovalGate.ts
│   │       │   └── index.ts
│   │       ├── orchestrator/
│   │       │   ├── Orchestrator.ts
│   │       │   ├── TaskQueue.ts
│   │       │   └── index.ts
│   │       ├── git/
│   │       │   ├── GitManager.ts
│   │       │   └── index.ts
│   │       └── __tests__/
│   │           ├── memory/
│   │           │   ├── FileAdapter.test.ts
│   │           │   └── MemoryManager.test.ts
│   │           ├── registry/
│   │           │   └── TeamRegistry.test.ts
│   │           ├── runtime/
│   │           │   ├── checkClaude.test.ts
│   │           │   ├── ClaudeCliRunner.test.ts
│   │           │   ├── SystemPromptBuilder.test.ts
│   │           │   └── AgentRuntime.test.ts
│   │           ├── messaging/
│   │           │   └── MessageBus.test.ts
│   │           ├── approval/
│   │           │   └── ApprovalGate.test.ts
│   │           ├── orchestrator/
│   │           │   ├── Orchestrator.test.ts
│   │           │   └── TaskQueue.test.ts
│   │           └── git/
│   │               └── GitManager.test.ts
│   └── extension/
│       ├── package.json
│       ├── tsconfig.json
│       ├── resources/icon.svg
│       └── src/
│           ├── extension.ts
│           ├── ProjectNameSession.ts
│           ├── commands/
│           │   └── index.ts
│           ├── statusbar/
│           │   └── AgentStatusBar.ts
│           ├── panels/.gitkeep
│           └── providers/.gitkeep
```
