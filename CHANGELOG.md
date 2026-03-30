# Changelog

All notable changes to vscode-ext are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-03-30

### Added

**Core engine (`packages/core`)**
- `TeamRegistry` — create, load, update, and delete agent teams stored as `team.json` in the `.agent/` workspace directory
- `AgentRuntime` — invokes the `claude` CLI subprocess (`--print` mode) per agent task; no direct API key required
- `ClaudeCliRunner` — thin subprocess wrapper with stdout/stderr capture and non-zero exit handling
- `SystemPromptBuilder` — assembles the system prompt from the agent's `CLAUDE.md`, project memory, and inbox messages
- `checkClaude` — startup utility that verifies `claude` CLI availability and surfaces a clear error if absent
- `MessageBus` — file-based inbox (`/.agent/inbox/[agent-id].md`) watched by `chokidar`; agents communicate without direct in-process calls
- `ApprovalGate` — four-tier risk classification (auto / low / medium / high); every approval/rejection written to `audit.md`
- `Orchestrator` — Team Lead → specialist delegation; synthesises results; tracks task queue state via `TaskQueue`
- `TaskQueue` — creates, updates, and queries `Task` objects; `update()` produces a new immutable object (original reference is not mutated)
- `GitManager` — per-agent branch/commit/push/PR/merge with permission enforcement; uses `simple-git`
- `TemplateLibrary` — 8 built-in agent templates (frontend, backend, qa, security, devops, documentation, database, reviewer) and 4 team presets (fullstack-web, api-service, open-source, solo)
- `AgentExporter` — exports an agent to a gzip-compressed `.agentpack` JSON bundle; strips `sessionId` and sanitises project-specific memory on export
- `FileMemoryAdapter` — default memory backend; stores entries as Markdown/JSON files; human-readable and git-friendly
- `SQLiteMemoryAdapter` — optional SQLite backend via `better-sqlite3`
- `MemoryManager` — facade over any `MemoryAdapter`; handles project-level and per-agent memory separately

**VS Code extension (`packages/extension`)**
- `AgentPanel` — webview chat UI; empty state CTA when no team is running; chat history persisted in `workspaceState` across panel close/reopen
- `ApprovalQueuePanel` — webview approval queue; dynamic panel title badge showing pending count; reject validates non-empty feedback; resolved cards fade before removal; JSON parameter editor
- `AgentStatusBar` — status bar item showing active agent count, pending approval count, and total cost (formatted `$0.03`); breakdown tooltip; pulsing animation while agents are active
- `AgentFileDecorationProvider` — file badges for in-progress files; blue = active, yellow = awaiting approval; tooltip shows agent name
- `ProjectNameSession` — wires all core modules together; manages lifecycle for a single workspace folder
- Commands: `initTeam`, `addAgent`, `startTeamLead`, `openApprovalQueue`, `exportAgent`, `importAgent`, `viewProgress`, `agentTeam.focus`
- Keyboard shortcuts: `Ctrl+Shift+A` (Agent Panel), `Ctrl+Shift+Q` (Approval Queue)
- Startup check for `claude` CLI with actionable error message if not found

**Shared package (`packages/shared`)**
- Canonical TypeScript types: `Agent`, `TeamConfig`, `Task`, `ApprovalRequest`, `MemoryEntry`, `AgentMessage`, `AgentTemplate`, `TeamPreset`, `AgentStatus`, `ProjectInfo`, `Result<T,E>`
- `MemoryAdapter` interface — pluggable backend contract
- Utilities: `generateId`, `getAgentWorkDir`, `validateTeamConfig`, `logger`
- Constants: risk action classifications, default model names

**Tests**
- 289 tests across 20 test files
- Unit tests for every module in `packages/core` and `packages/shared`
- VS Code extension tests with a full `vscode` module mock
- E2E workflow tests: project init, chat delegation, approval gate, git workflow, agent export/import

### Known limitations

- `createPR` requires the `gh` CLI; not covered by automated tests
- File decoration `setActiveFile` is not yet wired to task lifecycle (stale badges possible after task completion)
- One `.agent/` directory per workspace folder — multi-root team support planned for v2
- Node.js v18 engine warnings from some transitive dependencies (non-blocking)

[0.1.0]: https://github.com/salmaanakhtar/vscode-ext/releases/tag/v0.1.0
