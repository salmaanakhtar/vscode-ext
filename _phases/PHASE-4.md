# Phase 4 — Git Integration

> **Before starting:** Read CLAUDE.md in full, then PROGRESS.md.
> Confirm Phases 1, 2, and 3 are complete before proceeding.

---

## Phase 4 Goal

Implement the git integration layer that gives agents the ability to create branches, commit changes, push to remotes, and open pull requests — all subject to per-agent permission enforcement. By the end of Phase 4, an agent with appropriate permissions can perform a complete git workflow autonomously.

---

## Sub-phases

| Sub-phase | Name | Branch |
|-----------|------|--------|
| 4.1 | GitClient wrapper & permission enforcer | `phase/4-1-git-client` |
| 4.2 | Branch management & commit conventions | `phase/4-2-branch-commit` |
| 4.3 | Push & PR creation | `phase/4-3-push-pr` |

---

## Sub-phase 4.1 — GitClient Wrapper & Permission Enforcer

### What to build

A `GitClient` that wraps `simple-git` and enforces per-agent git permissions before executing any operation. Any attempt to perform an operation the agent is not permitted to do results in an `ApprovalGate` check rather than a hard error, giving the user a chance to approve it.

### Install dependency

```bash
cd packages/core && npm install simple-git
```

### Files to create

```
packages/core/src/git/
├── GitClient.ts
├── GitClient.test.ts
├── GitPermissionEnforcer.ts
├── GitPermissionEnforcer.test.ts
├── GitError.ts                  # Custom error types
└── index.ts
```

### GitError spec

```typescript
class GitPermissionError extends Error {
  constructor(
    public agentId: string,
    public operation: string,
    public requiredPermission: keyof GitPermissions
  ) {
    super(`Agent '${agentId}' does not have permission to: ${operation}`);
  }
}

class GitOperationError extends Error {
  constructor(
    public operation: string,
    public cause: Error
  ) {
    super(`Git operation failed: ${operation}`);
  }
}
```

### GitPermissionEnforcer spec

```typescript
class GitPermissionEnforcer {
  constructor(
    private agent: Agent,
    private approvalGate: ApprovalGateInterface
  ) {}

  // Check if agent has a git permission, go through approval gate if not
  async enforce(
    operation: keyof GitPermissions,
    action: ActionType,
    parameters: Record<string, unknown>
  ): Promise<boolean>
  // Returns true if operation can proceed (either permitted or user approved)
  // Returns false if user rejected in approval gate
  // Note: if agent has permission, no approval gate check is needed
}
```

### GitClient spec

```typescript
interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

interface CommitResult {
  hash: string;
  branch: string;
  message: string;
}

class GitClient {
  constructor(
    private projectRoot: string,
    private agent: Agent,
    private enforcer: GitPermissionEnforcer
  ) {}

  // Read operations — always permitted
  async getStatus(): Promise<GitStatus>
  async getCurrentBranch(): Promise<string>
  async getLog(limit?: number): Promise<GitLogEntry[]>
  async diff(filePath?: string): Promise<string>

  // Write operations — subject to permission enforcement
  async createBranch(branchName: string): Promise<void>
  async checkout(branchName: string): Promise<void>
  async stageAll(): Promise<void>
  async stageFiles(files: string[]): Promise<void>
  async commit(message: string): Promise<CommitResult>
  async push(remote?: string, branch?: string): Promise<void>
  async merge(sourceBranch: string, targetBranch: string): Promise<void>
}
```

### Implementation notes

- All write operations call `enforcer.enforce()` before executing — if `enforce()` returns false, the operation is a no-op and a warning is logged
- Wrap all `simple-git` calls in try/catch and rethrow as `GitOperationError`
- `simple-git` is initialised with the project root path
- Read operations (`getStatus`, `getCurrentBranch`, `getLog`, `diff`) never go through the enforcer

### Tests

Mock `simple-git` in tests. Test:
- Read operations never call enforcer
- Write operations call enforcer before execution
- If enforcer returns false, operation is skipped
- If enforcer returns true, `simple-git` method is called
- `GitOperationError` is thrown when `simple-git` throws
- `GitPermissionError` is thrown when agent lacks permission and approval gate rejects

### Acceptance criteria
- [ ] All read operations work without permission checks
- [ ] All write operations go through `GitPermissionEnforcer`
- [ ] Custom error types thrown correctly
- [ ] `simple-git` calls are wrapped safely

### Git
```bash
git checkout main && git pull origin main
git checkout -b phase/4-1-git-client
# ... build ...
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/git): implement GitClient wrapper and GitPermissionEnforcer"
git push origin phase/4-1-git-client
git checkout main && git merge phase/4-1-git-client --no-ff -m "chore: merge phase/4-1-git-client into main"
git push origin main && git branch -d phase/4-1-git-client
git checkout -b phase/4-2-branch-commit
```

---

## Sub-phase 4.2 — Branch Management & Commit Conventions

### What to build

Implement branch naming, commit message formatting, and conflict prevention logic. Agents that create branches and commits must follow the naming conventions from CLAUDE.md exactly.

### Files to create

```
packages/core/src/git/
├── BranchManager.ts
├── BranchManager.test.ts
├── CommitFormatter.ts
├── CommitFormatter.test.ts
└── ConflictGuard.ts
└── ConflictGuard.test.ts
```

### BranchManager spec

```typescript
// Manages agent branch creation following the naming convention:
// agent/[agent-id]/[task-slug]

class BranchManager {
  constructor(private gitClient: GitClient, private agentId: string) {}

  // Create a branch for a task. Name is auto-generated from task description.
  async createTaskBranch(taskDescription: string): Promise<string>
  // Returns the created branch name

  // Generate branch name from task description
  // Rules: lowercase, spaces→hyphens, remove special chars, max 50 chars
  // Format: agent/[agentId]/[slugified-description]
  generateBranchName(taskDescription: string): string

  // Check if an agent branch already exists for this task (avoid duplicates)
  async branchExists(branchName: string): Promise<boolean>

  // Switch to an existing agent branch or create it
  async ensureBranch(taskDescription: string): Promise<string>
}
```

### CommitFormatter spec

```typescript
// Formats commit messages per Conventional Commits with agent suffix.
// Format: type(scope): description [agent:agentId]

type CommitType = 'feat' | 'fix' | 'test' | 'refactor' | 'docs' | 'chore' | 'build' | 'style';

class CommitFormatter {
  constructor(private agentId: string) {}

  format(options: {
    type: CommitType;
    scope?: string;
    description: string;
    body?: string;
    breakingChange?: string;
  }): string

  // Parse a raw message from an agent (agents may not always use correct format)
  // Returns a properly formatted commit message, inferring type if missing
  normalise(rawMessage: string): string

  // Validate a commit message conforms to the convention
  validate(message: string): { valid: boolean; errors: string[] }
}
```

### ConflictGuard spec

```typescript
// Prevents two agents from modifying the same file simultaneously.
// Uses an in-memory lock map.

class ConflictGuard {
  // Acquire a lock on files for an agent
  // Returns true if lock acquired, false if files are locked by another agent
  acquire(agentId: string, filePaths: string[]): boolean

  // Release all locks held by an agent
  release(agentId: string): void

  // Get which agent (if any) has a lock on a file
  getLockHolder(filePath: string): string | undefined

  // Get all files locked by an agent
  getLockedFiles(agentId: string): string[]

  // Wait for a file to become available (polls every 500ms, default timeout 30s)
  async waitForLock(agentId: string, filePaths: string[], timeoutMs?: number): Promise<boolean>
}
```

### Implementation notes

- `generateBranchName` must produce valid git branch names: only alphanumeric, hyphens, and slashes
- `CommitFormatter.normalise()` is important — agents will sometimes write messages like "Added the login endpoint" without a Conventional Commits prefix. Normalise should detect this and prepend `feat(unknown): ` as a fallback.
- `ConflictGuard` is a singleton in the core engine — one instance per `ProjectNameCore`
- `waitForLock` uses `setInterval` polling — ensure the interval is cleaned up on resolution

### Tests

- `generateBranchName`: handles special chars, long descriptions, various input formats
- `validate`: catches missing type, too-long description, invalid type values
- `normalise`: converts plain messages to conventional format
- `ConflictGuard.acquire()`: grants lock when available, denies when held
- `ConflictGuard.release()`: clears agent's locks
- `waitForLock()`: resolves when lock is released, times out correctly

### Acceptance criteria
- [ ] Branch names always follow `agent/[id]/[slug]` convention
- [ ] Commit messages are validated and normalised
- [ ] `ConflictGuard` prevents simultaneous file modification
- [ ] All tests pass

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/git): add BranchManager, CommitFormatter, ConflictGuard"
git push origin phase/4-2-branch-commit
git checkout main && git merge phase/4-2-branch-commit --no-ff -m "chore: merge phase/4-2-branch-commit into main"
git push origin main && git branch -d phase/4-2-branch-commit
git checkout -b phase/4-3-push-pr
```

---

## Sub-phase 4.3 — Push & Pull Request Creation

### What to build

Implement push operations and automated pull request creation via the GitHub CLI (`gh`). Agents with `canCreatePR` permission can open PRs when their task is complete.

### Files to create

```
packages/core/src/git/
├── PullRequestManager.ts
├── PullRequestManager.test.ts
└── GitWorkflow.ts              # High-level workflow: branch → commit → push → PR
└── GitWorkflow.test.ts
```

### PullRequestManager spec

```typescript
interface PROptions {
  title: string;
  body: string;
  sourceBranch: string;
  targetBranch: string;
  labels?: string[];
  draft?: boolean;
}

interface PRResult {
  url: string;
  number: number;
  title: string;
}

class PullRequestManager {
  constructor(
    private agent: Agent,
    private enforcer: GitPermissionEnforcer
  ) {}

  // Create a PR using `gh pr create`
  async create(options: PROptions): Promise<PRResult>

  // Generate PR title from task description
  generateTitle(taskDescription: string, agentId: string): string
  // Format: "[AgentName]: [task description]"

  // Generate PR body from task result
  generateBody(options: {
    taskDescription: string;
    taskResult: string;
    agentId: string;
    agentName: string;
    filesChanged: string[];
  }): string
  // Structured markdown body with sections:
  // ## Summary, ## Changes, ## Agent, ## Files Changed
}
```

### GitWorkflow spec

```typescript
// High-level workflow that chains git operations for a complete agent task cycle.

interface WorkflowOptions {
  task: Task;
  agent: Agent;
  changedFiles: string[];
  commitMessage?: string;   // If not provided, auto-generated from task
  createPR?: boolean;       // Default: true if agent has canCreatePR permission
  targetBranch?: string;    // PR target, default: 'main'
}

interface WorkflowResult {
  branch: string;
  commitHash: string;
  prUrl?: string;
  prNumber?: number;
}

class GitWorkflow {
  constructor(
    private gitClient: GitClient,
    private branchManager: BranchManager,
    private commitFormatter: CommitFormatter,
    private prManager: PullRequestManager,
    private conflictGuard: ConflictGuard
  ) {}

  // Execute the full workflow for a completed task
  async executeTaskWorkflow(options: WorkflowOptions): Promise<WorkflowResult>
  // Steps:
  //   1. Acquire conflict guard locks on changedFiles
  //   2. Create/switch to agent task branch
  //   3. Stage changed files
  //   4. Format and create commit
  //   5. Push branch (if canPush)
  //   6. Create PR (if createPR and canCreatePR)
  //   7. Release conflict guard locks
  //   8. Return result
}
```

### PR body template

```markdown
## Summary
[task description]

## Changes Made
[task result — what the agent did]

## Agent
- **Agent**: [agentName] (`[agentId]`)
- **Task ID**: [taskId]
- **Completed**: [ISO timestamp]

## Files Changed
- `path/to/file1.ts`
- `path/to/file2.ts`

---
*This PR was created automatically by vscode-ext agent: [agentId]*
*Review all changes carefully before merging.*
```

### Implementation notes

- Use Node.js `child_process.execSync` or `exec` to run `gh pr create` — do not add the `gh` CLI as a dependency, just shell out to it
- Check if `gh` is available before trying to create PRs, and fail gracefully with a clear error if not
- Always add the label `agent-created` to PRs (create the label if it doesn't exist)
- Push uses `simple-git.push()` — this was already implemented in `GitClient`
- `GitWorkflow.executeTaskWorkflow()` should release conflict guard locks in a `finally` block to ensure they are always released even on error

### Tests

Mock `child_process` for `gh` CLI calls. Test:
- `generateTitle` formats correctly with agent name
- `generateBody` includes all required sections
- `create()` calls `gh pr create` with correct arguments
- `create()` fails gracefully when `gh` is not available
- `executeTaskWorkflow()` calls methods in correct order
- `executeTaskWorkflow()` always releases locks (test with a simulated error mid-workflow)

### Wire GitWorkflow into ProjectNameCore

Update `packages/core/src/ProjectNameCore.ts` to instantiate `GitWorkflow` and call `executeTaskWorkflow()` after each agent task completes successfully (when the agent has git permissions configured).

### Acceptance criteria
- [ ] `PullRequestManager.create()` successfully creates PRs via `gh` CLI
- [ ] PRs are labelled with `agent-created`
- [ ] `GitWorkflow` executes complete branch→commit→push→PR chain
- [ ] Conflict guard locks always released
- [ ] `gh` absence handled gracefully
- [ ] `ProjectNameCore` triggers git workflow after task completion
- [ ] All tests pass

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/git): add PullRequestManager and GitWorkflow"
git push origin phase/4-3-push-pr
git checkout main && git merge phase/4-3-push-pr --no-ff -m "chore: merge phase/4-3-push-pr into main — Phase 4 complete"
git push origin main && git branch -d phase/4-3-push-pr
```

### Update PROGRESS.md

Mark Phase 4 complete. The git integration layer is done. Next session starts Phase 5 — VS Code Shell. Note: Phase 5 is the first phase that touches VS Code APIs.

---

## Phase 4 Complete Checklist

- [ ] `GitClient` wraps `simple-git` with permission enforcement
- [ ] `BranchManager` creates branches following `agent/[id]/[slug]` convention
- [ ] `CommitFormatter` validates and normalises commit messages
- [ ] `ConflictGuard` prevents simultaneous file modification
- [ ] `PullRequestManager` creates PRs via `gh` CLI
- [ ] `GitWorkflow` chains the full branch→commit→push→PR flow
- [ ] Workflow integrated into `ProjectNameCore`
- [ ] All tests pass from root
- [ ] PROGRESS.md updated
- [ ] Main branch up to date on GitHub
