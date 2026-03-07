# Phase 3 — Orchestration & Approval

> **Before starting:** Read CLAUDE.md in full, then PROGRESS.md.
> Confirm Phases 1 and 2 are complete before proceeding.

---

## Phase 3 Goal

Implement the `ApprovalGate` (the human-in-the-loop safety system) and the `Orchestrator` (the Team Lead's task delegation engine). By the end of Phase 3, the core engine can receive a user message, the Team Lead can decompose it into tasks, delegate to agents, and block on approval for risky actions — all without any VS Code code.

---

## Sub-phases

| Sub-phase | Name | Branch |
|-----------|------|--------|
| 3.1 | ApprovalGate | `phase/3-1-approval-gate` |
| 3.2 | Orchestrator | `phase/3-2-orchestrator` |
| 3.3 | Core engine integration & smoke test | `phase/3-3-core-integration` |

---

## Sub-phase 3.1 — ApprovalGate

### What to build

The `ApprovalGate` intercepts agent tool calls, classifies their risk level, and either auto-approves them, blocks them pending human review, or rejects them. It exposes an event system so the VS Code UI layer (Phase 6) can subscribe to pending approvals and render them.

### Files to create

```
packages/core/src/approval/
├── ApprovalGate.ts
├── ApprovalGate.test.ts
├── ApprovalQueue.ts            # In-memory queue of pending approvals
├── ApprovalQueue.test.ts
├── RiskClassifier.ts           # Maps actions to risk levels
├── RiskClassifier.test.ts
├── AuditLogger.ts              # Writes to .agent/memory/audit.md
├── AuditLogger.test.ts
└── index.ts
```

### RiskClassifier spec

```typescript
// Uses ACTION_RISK_MAP from @projectname/shared as the baseline.
// Per-agent overrides in team.json can lower risk for specific actions on specific paths.

class RiskClassifier {
  constructor(private agentConfig: Agent) {}

  classify(action: ActionType, parameters: Record<string, unknown>): RiskLevel
  // Logic:
  //   1. Start with ACTION_RISK_MAP[action] from shared constants
  //   2. If action is in agent.approvalRequired and baseline is 'auto', upgrade to 'low'
  //   3. Return final risk level
}
```

### ApprovalQueue spec

```typescript
type ApprovalEventType = 'added' | 'resolved';
type ApprovalEventHandler = (request: ApprovalRequest) => void;

class ApprovalQueue {
  // Add a new pending approval request
  add(request: ApprovalRequest): void

  // Resolve a pending request (approve/reject/modify)
  resolve(requestId: string, resolution: ApprovalResolution): ApprovalRequest

  // Get all pending requests
  getPending(): ApprovalRequest[]

  // Get a specific request by ID
  get(requestId: string): ApprovalRequest | undefined

  // Subscribe to queue events
  on(event: ApprovalEventType, handler: ApprovalEventHandler): () => void

  // Wait for a specific request to be resolved (used by ApprovalGate to block)
  waitForResolution(requestId: string, timeoutMs?: number): Promise<ApprovalResolution>
}
```

### AuditLogger spec

```typescript
// Appends every approval decision to .agent/memory/audit.md

class AuditLogger {
  constructor(private projectRoot: string) {}

  async log(request: ApprovalRequest): Promise<void>
  // Appends a markdown entry:
  // ## [timestamp] [APPROVED|REJECTED|MODIFIED] by user
  // - Agent: [agentName]
  // - Action: [action]
  // - Risk: [riskLevel]
  // - Reasoning: [agent's reasoning]
  // - Parameters: [JSON]
  // - Feedback: [user feedback if any]
  // ---
}
```

### ApprovalGate spec

```typescript
// Implements ApprovalGateInterface from packages/shared

class ApprovalGate implements ApprovalGateInterface {
  constructor(options: {
    projectRoot: string;
    queue: ApprovalQueue;
    classifier: RiskClassifier;   // One per agent — or Map<agentId, RiskClassifier>
    auditLogger: AuditLogger;
    agents: Agent[];
  }) {}

  async check(
    agentId: string,
    action: ActionType,
    parameters: Record<string, unknown>,
    reasoning?: string
  ): Promise<boolean>
  // Logic:
  //   1. Classify risk level for this agent + action
  //   2. If 'auto' → return true immediately (no approval needed)
  //   3. If 'low' | 'medium' | 'high':
  //      a. Create ApprovalRequest and add to queue
  //      b. Emit event (UI layer subscribes in Phase 6)
  //      c. await waitForResolution()
  //      d. Log to audit trail
  //      e. Return true if approved/modified, false if rejected
}
```

### Implementation notes

- `ApprovalQueue.waitForResolution()` uses a Promise that resolves when `resolve()` is called with the matching ID. Use a Map of `[requestId → resolve function]` internally.
- The `timeoutMs` default for `waitForResolution` should be `undefined` (wait forever) — the UI layer is responsible for timeouts if needed.
- Generate request IDs with `crypto.randomUUID()`
- `ApprovalGate` needs a `Map<agentId, RiskClassifier>` since different agents have different `approvalRequired` lists

### Tests

- `RiskClassifier.classify()` returns correct risk levels for all `ActionType` values
- `RiskClassifier` upgrades risk when action is in agent's `approvalRequired`
- `ApprovalQueue.add()` and `getPending()` work correctly
- `ApprovalQueue.resolve()` updates status and triggers `waitForResolution()`
- `ApprovalQueue.on('added')` fires when item added
- `ApprovalGate.check()` returns true immediately for 'auto' risk
- `ApprovalGate.check()` adds to queue and awaits for non-auto risk
- `ApprovalGate.check()` returns false when rejected
- `AuditLogger.log()` writes correctly formatted markdown

### Acceptance criteria
- [ ] `ApprovalGate` implements `ApprovalGateInterface`
- [ ] Auto-risk actions pass through without queuing
- [ ] Non-auto actions are queued and gate blocks until resolved
- [ ] Audit log is written on every resolution
- [ ] All tests pass >= 80% coverage

### Git
```bash
git checkout main && git pull origin main
git checkout -b phase/3-1-approval-gate
# ... build ...
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/approval): implement ApprovalGate, ApprovalQueue, RiskClassifier, AuditLogger"
git push origin phase/3-1-approval-gate
git checkout main && git merge phase/3-1-approval-gate --no-ff -m "chore: merge phase/3-1-approval-gate into main"
git push origin main && git branch -d phase/3-1-approval-gate
git checkout -b phase/3-2-orchestrator
```

---

## Sub-phase 3.2 — Orchestrator

### What to build

The `Orchestrator` is the brain of the Team Lead. It receives a user message, uses the Team Lead agent to decompose it into tasks, assigns tasks to registered agents, monitors progress, and synthesises the final response.

### Files to create

```
packages/core/src/orchestrator/
├── Orchestrator.ts
├── Orchestrator.test.ts
├── TaskQueue.ts               # Manages the active task queue
├── TaskQueue.test.ts
├── TaskRouter.ts              # Routes tasks to appropriate agents
├── TaskRouter.test.ts
└── index.ts
```

### TaskQueue spec

```typescript
class TaskQueue {
  // Add a task
  enqueue(task: Task): void

  // Get next pending task for a specific agent
  dequeue(agentId: string): Task | undefined

  // Mark a task as active
  setActive(taskId: string): void

  // Mark a task as complete with result
  complete(taskId: string, result: string, costUsd: number): void

  // Mark a task as failed
  fail(taskId: string, error: string): void

  // Get all tasks (for UI display)
  getAll(): Task[]

  // Get tasks by status
  getByStatus(status: Task['status']): Task[]

  // Get tasks assigned to an agent
  getByAgent(agentId: string): Task[]

  // Subscribe to task events
  on(event: 'enqueued' | 'active' | 'complete' | 'failed', handler: (task: Task) => void): () => void
}
```

### TaskRouter spec

```typescript
// Determines which agent should handle a given task based on the task description
// and the available agents' roles and templates.

class TaskRouter {
  constructor(private agents: Agent[]) {}

  // Given a task description, return the best matching agent ID
  // Uses simple keyword matching against agent roles and templates in v1
  route(taskDescription: string): string | undefined

  // Get all agents that could potentially handle this task (for Team Lead to choose from)
  getCandidates(taskDescription: string): Agent[]
}
```

### Orchestrator spec

```typescript
interface OrchestratorOptions {
  teamConfig: TeamConfig;
  agentRuntime: AgentRuntime;
  memoryManager: MemoryManager;
  messageBus: MessageBus;
  approvalGate: ApprovalGate;
  projectRoot: string;
}

interface OrchestratorResult {
  response: string;           // Final synthesised response to user
  tasksCreated: number;
  tasksCompleted: number;
  tasksFailed: number;
  totalCostUsd: number;
}

class Orchestrator {
  constructor(options: OrchestratorOptions) {}

  // Process a user message through the Team Lead
  async processUserMessage(message: string): Promise<OrchestratorResult>

  // Process a direct message to a specific agent (bypassing Team Lead)
  async processDirectMessage(agentId: string, message: string): Promise<RunTaskResult>

  // Get current task queue state
  getTaskQueue(): Task[]

  // Abort all active tasks
  async abortAll(): Promise<void>

  // Subscribe to orchestrator events for UI updates
  on(event: 'taskCreated' | 'taskComplete' | 'taskFailed' | 'agentMessage', handler: (data: unknown) => void): () => void
}
```

### Orchestrator.processUserMessage() logic

```
1. Read PROJECT-INFO.md and project CLAUDE.md
2. Build Team Lead context (memory + recent tasks)
3. Send message to Team Lead via AgentRuntime with special "decompose and delegate" instructions
4. Team Lead returns a structured task list (JSON in its response)
5. Parse the task list — extract: [{ agentId, taskDescription }]
6. Enqueue each task in TaskQueue
7. For each task (in parallel up to concurrency limit of 3):
   a. Build agent context
   b. Run task via AgentRuntime
   c. Handle any approval gate blocks
   d. On completion, write result to agent memory
   e. Send completion message to Team Lead inbox
8. Once all tasks complete, send synthesis prompt to Team Lead
9. Team Lead synthesises all results into final response
10. Return OrchestratorResult
```

### Team Lead task decomposition prompt

The system prompt for the Team Lead should include these instructions for decomposing tasks:

```
When responding to a user request, first analyse whether the request requires
multiple specialised agents or can be handled directly.

If delegation is needed, respond with a JSON block in this exact format before
any other text:

<tasks>
[
  {
    "agentId": "[registered agent id]",
    "description": "[clear task description for the agent]",
    "priority": 1
  }
]
</tasks>

After the tasks block, you may include a brief message to the user explaining
what work is being delegated.

If you can handle the request directly without delegation, respond normally
without a tasks block.
```

### Implementation notes

- Parse the `<tasks>...</tasks>` block from Team Lead response using a simple regex or string split
- If parsing fails, fall back to handling the entire message with the Team Lead directly
- Concurrency limit: maximum 3 agents running simultaneously in v1
- Use `Promise.all()` with a semaphore pattern for concurrency limiting
- `TaskRouter` v1 uses simple role/template keyword matching — it does not need to be sophisticated

### Tests

- `TaskQueue`: enqueue, dequeue, state transitions, event subscriptions
- `TaskRouter.route()`: matches 'frontend' tasks to frontend agent, 'test' tasks to qa agent, etc.
- `Orchestrator.processUserMessage()` with mocked AgentRuntime:
  - Correctly parses task list from Team Lead response
  - Dispatches tasks to correct agents
  - Returns synthesised result
  - Handles Team Lead responding directly (no tasks block)
- `Orchestrator.processDirectMessage()` bypasses Team Lead and sends directly to named agent

### Acceptance criteria
- [ ] `Orchestrator` correctly decomposes and delegates multi-agent tasks
- [ ] Concurrency limited to 3 simultaneous agents
- [ ] Direct agent messages bypass Team Lead
- [ ] Task events fire correctly
- [ ] All tests pass

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/orchestrator): implement Orchestrator, TaskQueue, TaskRouter"
git push origin phase/3-2-orchestrator
git checkout main && git merge phase/3-2-orchestrator --no-ff -m "chore: merge phase/3-2-orchestrator into main"
git push origin main && git branch -d phase/3-2-orchestrator
git checkout -b phase/3-3-core-integration
```

---

## Sub-phase 3.3 — Core Engine Integration & Smoke Test

### What to build

Wire all Phase 1-3 modules together through a single `ProjectNameCore` facade class. Write a smoke test script that initialises the system, creates a team, and runs a simple task end-to-end (with the Claude Agent SDK mocked).

### Files to create

```
packages/core/src/
├── ProjectNameCore.ts          # Main facade — the public API of the core engine
├── ProjectNameCore.test.ts
└── index.ts                    # Exports ProjectNameCore and all public types
```

### ProjectNameCore spec

```typescript
interface CoreOptions {
  projectRoot: string;
  anthropicApiKey: string;
}

class ProjectNameCore {
  constructor(options: CoreOptions) {}

  // Initialise for a project (creates .agent/ if not exists, loads team config)
  async initialize(): Promise<void>

  // Check if project has been initialised
  async isInitialized(): Promise<boolean>

  // Create a new team for this project
  async createTeam(projectName: string, preset?: string): Promise<TeamConfig>

  // Get current team config
  async getTeam(): Promise<TeamConfig>

  // Add an agent to the team
  async addAgent(agent: Omit<Agent, 'id'> & { id?: string }): Promise<TeamConfig>

  // Remove an agent from the team
  async removeAgent(agentId: string): Promise<TeamConfig>

  // Process a message (goes to Team Lead by default)
  async chat(message: string, targetAgentId?: string): Promise<OrchestratorResult | RunTaskResult>

  // Get pending approvals
  getPendingApprovals(): ApprovalRequest[]

  // Resolve an approval request
  resolveApproval(requestId: string, resolution: ApprovalResolution): void

  // Get current tasks
  getTasks(): Task[]

  // Abort all active tasks
  async abort(): Promise<void>

  // Subscribe to events (for VS Code UI to listen to)
  on(event: CoreEvent, handler: (data: unknown) => void): () => void

  // Shutdown cleanly
  async shutdown(): Promise<void>
}

type CoreEvent =
  | 'task:created'
  | 'task:active'
  | 'task:complete'
  | 'task:failed'
  | 'approval:requested'
  | 'approval:resolved'
  | 'agent:message'
  | 'agent:idle'
  | 'error';
```

### Smoke test script

Create `packages/core/scripts/smoke-test.ts`:

```typescript
// This script exercises the full core engine with a mocked SDK.
// Run with: npx ts-node scripts/smoke-test.ts
// It should:
// 1. Initialize a temp project
// 2. Create a team with the 'fullstack-web' preset
// 3. Send a message: "Add a health check endpoint to the backend"
// 4. Print task delegation, agent responses (mocked), and final result
// 5. Clean up temp directory
// Expected output: Clean run with no errors, tasks created for backend agent
```

### Update `packages/core/src/index.ts`

Export everything the extension layer will need:
- `ProjectNameCore`
- All types from `@projectname/shared` (re-export)
- `ApprovalQueue` (for UI event subscription)
- `TaskQueue` (for UI state display)

### Acceptance criteria
- [ ] `ProjectNameCore` wires all modules together correctly
- [ ] `isInitialized()` correctly detects existing projects
- [ ] `createTeam()` with preset creates correct agent structure
- [ ] `chat()` routes to Team Lead by default, direct agent when `targetAgentId` provided
- [ ] Events fire correctly
- [ ] Smoke test runs end-to-end without errors (with mocked SDK)
- [ ] PROGRESS.md updated marking Phase 3 complete

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core): add ProjectNameCore facade and core integration"
git push origin phase/3-3-core-integration
git checkout main && git merge phase/3-3-core-integration --no-ff -m "chore: merge phase/3-3-core-integration into main — Phase 3 complete"
git push origin main && git branch -d phase/3-3-core-integration
```

### Update PROGRESS.md

Mark Phase 3 complete. The core engine is now functionally complete. Next session starts Phase 4 — Git Integration.

---

## Phase 3 Complete Checklist

- [ ] `ApprovalGate` implements `ApprovalGateInterface` and blocks on non-auto actions
- [ ] `ApprovalQueue` holds pending requests and resolves them
- [ ] `AuditLogger` writes every decision to audit.md
- [ ] `Orchestrator` decomposes messages and delegates to agents
- [ ] `TaskQueue` tracks all tasks with correct state transitions
- [ ] `ProjectNameCore` facade exposes clean public API
- [ ] Smoke test passes end-to-end
- [ ] All tests pass from root
- [ ] PROGRESS.md updated
- [ ] Main branch up to date on GitHub
