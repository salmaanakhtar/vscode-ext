# Phase 2 — Agent Runtime

> **Before starting:** Read CLAUDE.md in full, then PROGRESS.md.
> Confirm Phase 1 is complete before proceeding. All packages must build and all tests must pass.

---

## Phase 2 Goal

Implement the Claude Agent SDK wrapper (`AgentRuntime`), session management, and the file-based `MessageBus` for agent-to-agent communication. By the end of Phase 2, you can programmatically spawn an agent, give it a task, and have it communicate results back — all from a plain Node.js script with no VS Code involved.

---

## Sub-phases

| Sub-phase | Name | Branch |
|-----------|------|--------|
| 2.1 | Claude Agent SDK integration & AgentRuntime | `phase/2-1-agent-runtime` |
| 2.2 | Session management & context building | `phase/2-2-session-management` |
| 2.3 | MessageBus (agent-to-agent messaging) | `phase/2-3-message-bus` |

---

## Sub-phase 2.1 — Claude Agent SDK Integration & AgentRuntime

### What to build

A wrapper around the Claude Agent SDK (`@anthropic-ai/claude-code`) that handles spawning agents, enforcing tool permissions, enforcing budgets, and returning results. The `AgentRuntime` is the single point of contact between vscode-ext and the Claude Agent SDK.

### Install dependency

```bash
cd packages/core && npm install @anthropic-ai/claude-code
```

### Files to create

```
packages/core/src/runtime/
├── AgentRuntime.ts
├── AgentRuntime.test.ts
├── SystemPromptBuilder.ts      # Builds the stacked system prompt for an agent
├── SystemPromptBuilder.test.ts
└── index.ts
```

### AgentRuntime spec

```typescript
interface AgentRuntimeOptions {
  projectRoot: string;
  approvalGate: ApprovalGateInterface;  // Injected — implemented in Phase 3
}

interface RunTaskOptions {
  agent: Agent;
  task: Task;
  projectClaudeMd: string;
  agentClaudeMd: string;
  projectInfo: string;
  sessionId?: string;          // If provided, resumes an existing warm session
  abortSignal?: AbortSignal;
}

interface RunTaskResult {
  success: boolean;
  output: string;
  sessionId: string;           // For session resumption
  costUsd: number;
  error?: string;
}

class AgentRuntime {
  constructor(options: AgentRuntimeOptions) {}

  // Run a task for an agent
  async runTask(options: RunTaskOptions): Promise<RunTaskResult>

  // Abort a running task
  abort(taskId: string): void

  // Get active session IDs
  getActiveSessions(): string[]
}
```

### SystemPromptBuilder spec

```typescript
// Assembles the layered system prompt injected into each agent session.
// Layer order (top to bottom):
//   1. Project context (PROJECT-INFO.md content)
//   2. Project CLAUDE.md (shared instructions for all agents)
//   3. Agent CLAUDE.md (agent-specific instructions)
//   4. Current task context (active tasks, relevant memory entries)
//   5. Communication instructions (how to use inbox, message format)

class SystemPromptBuilder {
  build(options: {
    projectInfo: string;
    projectClaudeMd: string;
    agentClaudeMd: string;
    agentId: string;
    agentName: string;
    taskContext?: string;
    memoryContext?: string;
  }): string
}
```

### ApprovalGateInterface

Define this interface in `packages/shared` so Phase 2 can depend on it without requiring Phase 3 to be complete. Phase 3 will implement it.

```typescript
// packages/shared/src/types/approval.types.ts — add this interface

interface ApprovalGateInterface {
  // Called before a tool executes. Returns true if execution should proceed.
  // If false, the tool call is blocked and a pending approval is created.
  check(agentId: string, action: ActionType, parameters: Record<string, unknown>): Promise<boolean>;
}
```

### Implementation notes

- The Claude Agent SDK's `query()` function is the core call. Read its documentation before implementing.
- Tool permissions are enforced by passing only the agent's declared tools to `query()`. An agent cannot use tools not in its `tools.json`.
- Budget enforcement: pass `maxBudgetUsd` to the SDK. If the budget is exceeded, the session should return an error result rather than throw.
- The `approvalGate.check()` call must happen inside a tool interception hook provided by the SDK. Look for the SDK's mechanism for intercepting tool calls before execution.
- For Phase 2 testing, create a `MockApprovalGate` that always returns `true` (approve all). The real gate is built in Phase 3.
- The session ID returned by the SDK should be stored and passed as `resume` on subsequent calls to the same agent to maintain warm sessions.

### Testing approach

Unit testing `AgentRuntime` requires mocking the Claude Agent SDK. Create `packages/core/src/runtime/__mocks__/claude-agent-sdk.mock.ts` that provides a controllable mock of `query()`. Tests should verify:

- Task is sent to SDK with correct system prompt
- Tool permissions are restricted to declared tools
- Budget parameter is passed correctly
- Session ID is returned and can be used for resumption
- Abort signal cancels the task
- SDK errors are caught and returned as failed results (not thrown)

### Acceptance criteria
- [ ] `AgentRuntime.runTask()` calls Claude Agent SDK with correct parameters
- [ ] Tool permissions restricted to agent's declared tools
- [ ] Budget enforcement passed to SDK
- [ ] `ApprovalGateInterface` defined in shared types
- [ ] `MockApprovalGate` available for testing
- [ ] All tests pass with SDK mocked

### Git
```bash
git checkout main && git pull origin main
git checkout -b phase/2-1-agent-runtime
# ... build ...
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/runtime): implement AgentRuntime and SystemPromptBuilder"
git push origin phase/2-1-agent-runtime
git checkout main && git merge phase/2-1-agent-runtime --no-ff -m "chore: merge phase/2-1-agent-runtime into main"
git push origin main && git branch -d phase/2-1-agent-runtime
git checkout -b phase/2-2-session-management
```

---

## Sub-phase 2.2 — Session Management & Context Building

### What to build

A `SessionManager` that tracks warm sessions, handles session resumption, manages session lifecycle (idle timeout, graceful shutdown), and a `ContextBuilder` that pulls relevant memory entries into the prompt before each task.

### Files to create

```
packages/core/src/runtime/
├── SessionManager.ts
├── SessionManager.test.ts
├── ContextBuilder.ts
└── ContextBuilder.test.ts
```

### SessionManager spec

```typescript
interface SessionInfo {
  sessionId: string;
  agentId: string;
  lastActiveAt: string;
  status: 'active' | 'idle' | 'terminated';
}

class SessionManager {
  constructor(private idleTimeoutMs: number = 5 * 60 * 1000) {} // 5 min default

  // Register a new or resumed session
  register(agentId: string, sessionId: string): void

  // Get session ID for an agent (for resumption)
  getSessionId(agentId: string): string | undefined

  // Mark a session as active (called when task starts)
  setActive(agentId: string): void

  // Mark a session as idle (called when task ends)
  setIdle(agentId: string): void

  // Terminate a session (clear from registry)
  terminate(agentId: string): void

  // Get all current sessions
  getSessions(): SessionInfo[]

  // Start idle timeout watcher — terminates sessions idle longer than idleTimeoutMs
  startIdleWatcher(): void

  // Stop the idle watcher
  stopIdleWatcher(): void
}
```

### ContextBuilder spec

```typescript
// Pulls relevant memory entries and formats them for injection into the system prompt.
// Keeps the context concise — truncates if total context would exceed maxTokens.

class ContextBuilder {
  constructor(
    private memoryManager: MemoryManager,
    private maxContextTokens: number = 4000
  ) {}

  async buildTaskContext(options: {
    agentId: string;
    taskPrompt: string;
    includeProjectMemory: boolean;
  }): Promise<string>
  // Returns formatted markdown string of relevant memory entries
  // Uses search() to find relevant entries based on task prompt
  // Always includes the last 5 memory entries for the agent regardless of relevance
}
```

### Implementation notes

- `SessionManager` uses an in-memory Map — sessions are not persisted across process restarts (each VS Code window restart creates fresh sessions, but warm sessions within a session are preserved)
- The idle watcher uses `setInterval`. Make sure `stopIdleWatcher()` clears the interval to prevent memory leaks.
- `ContextBuilder` calls `memoryManager.getAdapter().search()` with the task prompt as the query, then formats the results as a compact markdown block
- Estimate tokens roughly as `Math.ceil(text.length / 4)` — no need for a real tokeniser
- If context exceeds `maxContextTokens`, truncate older entries first (keep recent ones)

### Tests

- SessionManager: register, getSessionId, setActive/setIdle, terminate, idle timeout triggers termination after delay
- ContextBuilder: returns empty string when no memory, formats entries correctly, truncates when over limit

### Acceptance criteria
- [ ] SessionManager tracks sessions and handles idle timeout
- [ ] ContextBuilder pulls and formats relevant memory
- [ ] AgentRuntime updated to use SessionManager and ContextBuilder
- [ ] All tests pass

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/runtime): add SessionManager and ContextBuilder"
git push origin phase/2-2-session-management
git checkout main && git merge phase/2-2-session-management --no-ff -m "chore: merge phase/2-2-session-management into main"
git push origin main && git branch -d phase/2-2-session-management
git checkout -b phase/2-3-message-bus
```

---

## Sub-phase 2.3 — MessageBus

### What to build

The `MessageBus` enables agents to send messages to each other via files in `.agent/inbox/`. It watches inbox files with `chokidar` and delivers messages to registered listeners.

### Install dependency

```bash
cd packages/core && npm install chokidar
```

### Files to create

```
packages/core/src/messaging/
├── MessageBus.ts
├── MessageBus.test.ts
├── InboxManager.ts         # Low-level inbox file read/write
├── InboxManager.test.ts
└── index.ts
```

### Message file format

Each agent has one inbox file at `.agent/inbox/[agent-id].md`. Messages are appended to the file in this format:

```markdown
---
id: [uuid]
from: [agent-id]
to: [agent-id]
re: [task-id or empty]
subject: [subject line]
sentAt: [ISO8601]
read: false
---

[message body]

===END===
```

Multiple messages are appended one after another in the same file. The `===END===` delimiter separates messages.

### InboxManager spec

```typescript
class InboxManager {
  constructor(private agentDir: string) {}

  // Append a message to an agent's inbox file
  async appendMessage(agentId: string, message: AgentMessage): Promise<void>

  // Read all messages from an agent's inbox
  async readMessages(agentId: string): Promise<AgentMessage[]>

  // Mark a message as read (updates the read: false line to read: true)
  async markRead(agentId: string, messageId: string): Promise<void>

  // Read only unread messages
  async readUnread(agentId: string): Promise<AgentMessage[]>

  // Clear all messages from an inbox (used when inbox grows too large)
  async clearInbox(agentId: string): Promise<void>

  // Get inbox file path
  getInboxPath(agentId: string): string
}
```

### MessageBus spec

```typescript
type MessageHandler = (message: AgentMessage) => void | Promise<void>;

class MessageBus {
  constructor(
    private inboxManager: InboxManager,
    private watchedAgentIds: string[]
  ) {}

  // Start watching inbox files for changes
  start(): void

  // Stop watching
  stop(): void

  // Subscribe to messages for a specific agent
  subscribe(agentId: string, handler: MessageHandler): () => void  // returns unsubscribe fn

  // Send a message from one agent to another
  async send(message: Omit<AgentMessage, 'id' | 'sentAt' | 'read'>): Promise<void>

  // Broadcast a message to all registered agents
  async broadcast(from: string, subject: string, body: string): Promise<void>

  // Add an agent to the watch list
  addAgent(agentId: string): void

  // Remove an agent from the watch list
  removeAgent(agentId: string): void
}
```

### Implementation notes

- `chokidar` watches the `.agent/inbox/` directory for file changes
- When a watched file changes, `MessageBus` reads new unread messages and calls registered handlers
- Parsing the inbox file: split on `===END===`, then parse the frontmatter block (between `---` delimiters) as key-value pairs, and treat everything after the second `---` as the body
- Be careful of race conditions — use a per-file mutex pattern (simple boolean lock is fine) to prevent concurrent reads/writes corrupting the file
- The `broadcast` method appends to ALL agent inbox files
- Unsubscribe function returned by `subscribe` removes the handler from the internal map

### Tests

Use temporary directories. Mock `chokidar` in unit tests. Test:
- `appendMessage` adds parseable message to file
- `readMessages` parses all messages correctly
- `markRead` updates the read field
- `readUnread` only returns unread messages
- `send` calls `appendMessage` with correct data
- `broadcast` sends to all registered agents
- Subscribe handler is called when inbox changes (use manual trigger, not real watcher)

### Acceptance criteria
- [ ] InboxManager correctly appends and parses messages
- [ ] MessageBus delivers messages to subscribed handlers
- [ ] Broadcast reaches all agents
- [ ] Unsubscribe works correctly
- [ ] All tests pass

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/messaging): implement MessageBus and InboxManager"
git push origin phase/2-3-message-bus
git checkout main && git merge phase/2-3-message-bus --no-ff -m "chore: merge phase/2-3-message-bus into main — Phase 2 complete"
git push origin main && git branch -d phase/2-3-message-bus
```

### Update PROGRESS.md

Mark Phase 2 complete. Describe what was built. Note any decisions or deferred items. Specify that the next session starts Phase 3 — read PHASE-3.md.

---

## Phase 2 Complete Checklist

- [ ] `AgentRuntime` wraps Claude Agent SDK correctly
- [ ] Tool permissions enforced per agent
- [ ] Budget enforcement working
- [ ] `SessionManager` tracks warm sessions with idle timeout
- [ ] `ContextBuilder` pulls relevant memory into task context
- [ ] `MessageBus` delivers messages via inbox files
- [ ] `InboxManager` correctly parses inbox file format
- [ ] `ApprovalGateInterface` defined in shared (ready for Phase 3)
- [ ] All tests pass from root (`npm run test`)
- [ ] All code builds from root (`npm run build`)
- [ ] PROGRESS.md updated
- [ ] Main branch up to date on GitHub
