# Phase 4.2 — Git Integration

> Read CLAUDE.md and PROGRESS.md before starting.
> Phase 4.1 (Orchestrator) must be complete.

---

## Goal

Implement `GitManager` in `packages/core/src/git/`. Provides per-agent git operations with permission enforcement, agent branch naming conventions, commit formatting, and PR creation via GitHub CLI.

---

## Branch

```bash
git checkout main && git pull origin main
git checkout -b phase/4.2-git-integration
```

---

## Deliverables

### 1. `packages/core/src/git/GitManager.ts`

```typescript
import simpleGit, { SimpleGit } from 'simple-git';
import { execSync } from 'child_process';
import type { Agent, GitPermissions, Result } from '@vscode-ext/shared';
import { slugify, logger } from '@vscode-ext/shared';

export interface CommitOptions {
  message: string;
  agentId: string;
  files?: string[]; // specific files to stage, or all if undefined
}

export interface BranchOptions {
  agentId: string;
  taskSlug: string;
  fromBranch?: string;
}

export interface PROptions {
  title: string;
  body: string;
  agentId: string;
  baseBranch?: string;
}

export class GitManager {
  private git: SimpleGit;

  constructor(private projectRoot: string) {
    this.git = simpleGit(projectRoot);
  }

  // ─── Permission Check ────────────────────────────────────────

  private checkPermission(
    agent: Agent,
    permission: keyof GitPermissions,
  ): Result<void> {
    if (!agent.git[permission]) {
      return {
        success: false,
        error: new Error(
          `Agent '${agent.id}' does not have permission: ${permission}`
        ),
      };
    }
    return { success: true, data: undefined };
  }

  // ─── Branch Operations ───────────────────────────────────────

  async createBranch(agent: Agent, options: BranchOptions): Promise<Result<string>> {
    const perm = this.checkPermission(agent, 'canBranch');
    if (!perm.success) return perm;

    try {
      const slug = slugify(options.taskSlug);
      const branchName = `agent/${options.agentId}/${slug}`;
      const from = options.fromBranch ?? await this.getCurrentBranch();

      await this.git.checkoutBranch(branchName, from);
      logger.info('Branch created', { agent: agent.id, branch: branchName });

      return { success: true, data: branchName };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current ?? 'main';
  }

  async listBranches(): Promise<string[]> {
    const summary = await this.git.branchLocal();
    return summary.all;
  }

  // ─── Staging & Committing ────────────────────────────────────

  async commit(agent: Agent, options: CommitOptions): Promise<Result<string>> {
    const perm = this.checkPermission(agent, 'canCommit');
    if (!perm.success) return perm;

    try {
      if (options.files && options.files.length > 0) {
        await this.git.add(options.files);
      } else {
        await this.git.add('.');
      }

      const status = await this.git.status();
      if (status.staged.length === 0) {
        return { success: false, error: new Error('Nothing to commit') };
      }

      const formattedMessage = `${options.message} [agent:${options.agentId}]`;
      const result = await this.git.commit(formattedMessage);

      logger.info('Committed', { agent: agent.id, hash: result.commit, message: formattedMessage });
      return { success: true, data: result.commit };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  // ─── Push Operations ─────────────────────────────────────────

  async push(agent: Agent, branch?: string): Promise<Result<void>> {
    const perm = this.checkPermission(agent, 'canPush');
    if (!perm.success) return perm;

    try {
      const currentBranch = branch ?? await this.getCurrentBranch();
      await this.git.push('origin', currentBranch, ['--set-upstream']);
      logger.info('Pushed', { agent: agent.id, branch: currentBranch });
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  // ─── Pull Request Creation ───────────────────────────────────

  async createPR(agent: Agent, options: PROptions): Promise<Result<string>> {
    const perm = this.checkPermission(agent, 'canCreatePR');
    if (!perm.success) return perm;

    try {
      const base = options.baseBranch ?? 'main';
      const body = `${options.body}\n\n---\n*Created by agent: ${options.agentId}*`;

      // Use GitHub CLI
      const output = execSync(
        `gh pr create --title "${options.title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --base ${base}`,
        { cwd: this.projectRoot, encoding: 'utf-8' }
      );

      const prUrl = output.trim();
      logger.info('PR created', { agent: agent.id, url: prUrl });
      return { success: true, data: prUrl };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  // ─── Merge Operations ─────────────────────────────────────────

  async merge(agent: Agent, sourceBranch: string, targetBranch = 'main'): Promise<Result<void>> {
    const perm = this.checkPermission(agent, 'canMerge');
    if (!perm.success) return perm;

    try {
      await this.git.checkout(targetBranch);
      await this.git.merge([sourceBranch, '--no-ff']);
      logger.info('Merged', { agent: agent.id, from: sourceBranch, into: targetBranch });
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  // ─── Status & Info ────────────────────────────────────────────

  async getStatus(): Promise<{ branch: string; modified: string[]; staged: string[]; untracked: string[] }> {
    const status = await this.git.status();
    return {
      branch: status.current ?? 'unknown',
      modified: status.modified,
      staged: status.staged,
      untracked: status.not_added,
    };
  }

  async getFileOwnership(): Promise<Map<string, string>> {
    // Returns a map of file -> agentId for files currently being worked on
    // This is tracked externally by the Orchestrator
    // This method is a stub for future file locking implementation
    return new Map();
  }
}
```

### 2. `packages/core/src/git/index.ts`

```typescript
export { GitManager } from './GitManager';
export type { CommitOptions, BranchOptions, PROptions } from './GitManager';
```

### 3. Unit Tests

`packages/core/src/__tests__/git/GitManager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { GitManager } from '../../git/GitManager';
import type { Agent } from '@vscode-ext/shared';

describe('GitManager', () => {
  let tmpDir: string;
  let git: GitManager;

  const makeAgent = (gitOverrides?: Partial<Agent['git']>): Agent => ({
    id: 'frontend',
    name: 'Frontend',
    role: 'Frontend',
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 1,
    git: {
      canBranch: true, canCommit: true, canPush: false,
      canCreatePR: false, canMerge: false,
      ...gitOverrides
    },
    approvalRequired: [],
    builtinTools: [],
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-test-'));
    execSync('git init', { cwd: tmpDir });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git commit --allow-empty -m "initial"', { cwd: tmpDir });
    git = new GitManager(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a branch with agent naming convention', async () => {
    const result = await git.createBranch(makeAgent(), {
      agentId: 'frontend',
      taskSlug: 'Add Login Form',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('agent/frontend/add-login-form');
    }
  });

  it('blocks branch creation without permission', async () => {
    const result = await git.createBranch(makeAgent({ canBranch: false }), {
      agentId: 'frontend',
      taskSlug: 'some task',
    });
    expect(result.success).toBe(false);
  });

  it('commits with agent tag in message', async () => {
    await git.createBranch(makeAgent(), { agentId: 'frontend', taskSlug: 'test' });
    await fs.writeFile(path.join(tmpDir, 'test.txt'), 'hello');
    const result = await git.commit(makeAgent(), {
      message: 'feat(ui): add button',
      agentId: 'frontend',
    });
    expect(result.success).toBe(true);
  });

  it('blocks commit without permission', async () => {
    const result = await git.commit(makeAgent({ canCommit: false }), {
      message: 'test',
      agentId: 'frontend',
    });
    expect(result.success).toBe(false);
  });
});
```

---

## Acceptance Criteria

- [ ] Branch naming follows `agent/[agent-id]/[task-slug]` convention
- [ ] All operations check agent permissions before executing
- [ ] Commit messages include `[agent:id]` suffix
- [ ] Permission failures return `Result` errors, not throws
- [ ] No `vscode` imports
- [ ] Tests pass

---

## Self-Review & Merge

```bash
cd packages/core && npm test && npm run typecheck
grep -r "from 'vscode'" packages/core && echo "VIOLATION" || echo "OK"
cd ../.. && npm run lint

git checkout main
git merge phase/4.2-git-integration --no-ff -m "merge: complete phase 4.2 — git integration"
git push origin main
git tag -a "phase-4.2-complete" -m "Phase 4.2 complete: git integration"
git push origin --tags
```

---

## Next Phase

**Phase 5.1 — VS Code Extension Shell**
Load `_phases/PHASE-5.1.md` in the next session.

---
---

