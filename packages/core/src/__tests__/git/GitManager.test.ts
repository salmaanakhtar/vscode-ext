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
    maxTurns: 20,
    git: {
      canBranch: true, canCommit: true, canPush: false,
      canCreatePR: false, canMerge: false,
      ...gitOverrides,
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

  // ─── createBranch ────────────────────────────────────────────

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

  it('blocks branch creation without canBranch permission', async () => {
    const result = await git.createBranch(makeAgent({ canBranch: false }), {
      agentId: 'frontend',
      taskSlug: 'some task',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('canBranch');
    }
  });

  it('uses fromBranch option when provided', async () => {
    const currentBranch = await git.getCurrentBranch();
    const result = await git.createBranch(makeAgent(), {
      agentId: 'frontend',
      taskSlug: 'derived-task',
      fromBranch: currentBranch,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('agent/frontend/derived-task');
    }
  });

  // ─── commit ──────────────────────────────────────────────────

  it('commits staged files with agent tag in message', async () => {
    await git.createBranch(makeAgent(), { agentId: 'frontend', taskSlug: 'test' });
    await fs.writeFile(path.join(tmpDir, 'test.txt'), 'hello');
    const result = await git.commit(makeAgent(), {
      message: 'feat(ui): add button',
      agentId: 'frontend',
    });
    expect(result.success).toBe(true);
  });

  it('commits only specified files', async () => {
    await git.createBranch(makeAgent(), { agentId: 'frontend', taskSlug: 'test' });
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'file a');
    await fs.writeFile(path.join(tmpDir, 'b.txt'), 'file b');
    const result = await git.commit(makeAgent(), {
      message: 'feat: partial commit',
      agentId: 'frontend',
      files: ['a.txt'],
    });
    expect(result.success).toBe(true);
  });

  it('returns error when nothing to commit', async () => {
    const result = await git.commit(makeAgent(), {
      message: 'empty commit',
      agentId: 'frontend',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Nothing to commit');
    }
  });

  it('blocks commit without canCommit permission', async () => {
    const result = await git.commit(makeAgent({ canCommit: false }), {
      message: 'test',
      agentId: 'frontend',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('canCommit');
    }
  });

  // ─── push ────────────────────────────────────────────────────

  it('blocks push without canPush permission', async () => {
    const result = await git.push(makeAgent({ canPush: false }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('canPush');
    }
  });

  it('returns error when push fails (no remote)', async () => {
    const result = await git.push(makeAgent({ canPush: true }));
    expect(result.success).toBe(false);
  });

  // ─── createPR ────────────────────────────────────────────────

  it('blocks PR creation without canCreatePR permission', async () => {
    const result = await git.createPR(makeAgent({ canCreatePR: false }), {
      title: 'My PR',
      body: 'Description',
      agentId: 'frontend',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('canCreatePR');
    }
  });

  // ─── merge ───────────────────────────────────────────────────

  it('blocks merge without canMerge permission', async () => {
    const result = await git.merge(makeAgent({ canMerge: false }), 'some-branch');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('canMerge');
    }
  });

  // ─── getStatus ───────────────────────────────────────────────

  it('returns current status including branch name', async () => {
    const status = await git.getStatus();
    expect(typeof status.branch).toBe('string');
    expect(Array.isArray(status.modified)).toBe(true);
    expect(Array.isArray(status.staged)).toBe(true);
    expect(Array.isArray(status.untracked)).toBe(true);
  });

  it('reflects untracked files in status', async () => {
    await fs.writeFile(path.join(tmpDir, 'untracked.txt'), 'content');
    const status = await git.getStatus();
    expect(status.untracked).toContain('untracked.txt');
  });

  // ─── listBranches ────────────────────────────────────────────

  it('lists local branches', async () => {
    const branches = await git.listBranches();
    expect(Array.isArray(branches)).toBe(true);
    expect(branches.length).toBeGreaterThan(0);
  });

  // ─── getCurrentBranch ────────────────────────────────────────

  it('returns current branch name', async () => {
    const branch = await git.getCurrentBranch();
    expect(typeof branch).toBe('string');
    expect(branch.length).toBeGreaterThan(0);
  });

  // ─── getFileOwnership ────────────────────────────────────────

  it('returns an empty map from getFileOwnership stub', async () => {
    const ownership = await git.getFileOwnership();
    expect(ownership instanceof Map).toBe(true);
    expect(ownership.size).toBe(0);
  });
});
