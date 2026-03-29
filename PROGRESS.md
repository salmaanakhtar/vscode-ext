# vscode-ext — Development Progress

## Last Updated
2026-03-29T14:15:00Z

## Current Phase
Phase 5 — VS Code Shell | Sub-phase 5.2 — Agent Panel UI (COMPLETE)

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
- [x] 5.2 — Agent Panel UI

## Current Branch
main (phase/5.2-agent-panel-ui merged and deleted)

## What Was Just Built
`AgentPanel` webview in `packages/extension/src/panels/AgentPanel.ts` — an inline-HTML chat interface that posts/receives messages to/from the VS Code webview. It shows a chat window, agent status chips, and an agent selector. `extension.ts` wires the panel in and registers the `projectname.agentTeam.focus` command. 21 new unit tests added for the panel (200 total across all packages). Vitest config, vscode mock, and `__tests__/panels/` directory added to the extension package.

## Decisions Made This Session
- Omitted unused `fs` import from AgentPanel (spec listed it but it is never used — avoids lint error).
- Test overrides typed as `Record<string, unknown>` (not `Partial<ProjectNameSession>`) to avoid structural type check failures against private Orchestrator fields.
- `vscode` module aliased to `src/__mocks__/vscode.ts` in `vitest.config.ts` so tests run without the VS Code host.

## Known Issues / TODOs
- Node.js v18 engine warnings from transitive deps — not a blocker.
- `createPR` uses `execSync` with `gh` CLI — not unit-tested (requires real gh); covered in later integration phase.
- 8 pre-existing lint warnings in test files (`@typescript-eslint/explicit-function-return-type`) — warnings only, zero errors.

## What The Next Session Should Do First
1. Read CLAUDE.md and this PROGRESS.md in full.
2. Load `_phases/PHASE-6.1.md` (Approval Queue UI).
3. Create branch: `git checkout main && git checkout -b phase/6.1-approval-queue`
4. Implement the Approval Queue webview panel in `packages/extension/src/panels/`.
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
│   │           ├── registry/
│   │           ├── runtime/
│   │           ├── messaging/
│   │           ├── approval/
│   │           ├── orchestrator/
│   │           └── git/
│   └── extension/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── resources/icon.svg
│       └── src/
│           ├── extension.ts
│           ├── ProjectNameSession.ts
│           ├── __mocks__/
│           │   └── vscode.ts
│           ├── commands/
│           │   └── index.ts
│           ├── statusbar/
│           │   └── AgentStatusBar.ts
│           ├── panels/
│           │   └── AgentPanel.ts
│           ├── providers/.gitkeep
│           └── __tests__/
│               └── panels/
│                   └── AgentPanel.test.ts
```
