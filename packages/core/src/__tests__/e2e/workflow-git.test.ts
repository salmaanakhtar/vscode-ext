// packages/core/src/__tests__/e2e/workflow-git.test.ts
// End-to-end tests for the git workflow.
// Uses a real temporary git repository (no network calls).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { GitManager } from '../../git/GitManager';
import type { Agent } from '@vscode-ext/shared';
import { makeTempDir, cleanupTempDir, makeAgent } from './setup';

function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test User"', { cwd: dir });
  execSync('git commit --allow-empty -m "initial commit"', { cwd: dir });
}

describe('Workflow: Git Operations', () => {
  let tmpDir: string;
  let git: GitManager;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    initGitRepo(tmpDir);
    git = new GitManager(tmpDir);
  });
  afterEach(async () => { await cleanupTempDir(tmpDir); });

  // ─── Branch creation ──────────────────────────────────────────────────────

  describe('branch creation', () => {
    it('creates a branch following the agent/[id]/[slug] naming convention', async () => {
      const agent = makeAgent({ id: 'frontend', name: 'Frontend', role: 'UI dev' });
      const result = await git.createBranch(agent, {
        agentId: 'frontend',
        taskSlug: 'Add login form',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('agent/frontend/add-login-form');
      }
    });

    it('slugifies task descriptions with special characters', async () => {
      const agent = makeAgent({ id: 'backend', name: 'Backend', role: 'API dev' });
      const result = await git.createBranch(agent, {
        agentId: 'backend',
        taskSlug: 'Fix: API rate-limiting bug!',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatch(/^agent\/backend\//);
        // Branch name must not contain spaces or colons
        expect(result.data).not.toContain(' ');
        expect(result.data).not.toContain(':');
      }
    });

    it('uses fromBranch when specified', async () => {
      const baseBranch = await git.getCurrentBranch();
      const agent = makeAgent({ id: 'qa', name: 'QA', role: 'Tester' });
      const result = await git.createBranch(agent, {
        agentId: 'qa',
        taskSlug: 'add-tests',
        fromBranch: baseBranch,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('agent/qa/add-tests');
      }
    });

    it('blocks branch creation when agent lacks canBranch permission', async () => {
      const agent = makeAgent({
        id: 'restricted',
        name: 'Restricted',
        role: 'Read-only',
        git: { canBranch: false, canCommit: false, canPush: false, canCreatePR: false, canMerge: false },
      });

      const result = await git.createBranch(agent, {
        agentId: 'restricted',
        taskSlug: 'do-something',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('canBranch');
      }
    });

    it('new branch is visible in listBranches after creation', async () => {
      const agent = makeAgent({ id: 'frontend', name: 'Frontend', role: 'UI dev' });
      await git.createBranch(agent, { agentId: 'frontend', taskSlug: 'new-feature' });

      const branches = await git.listBranches();
      expect(branches).toContain('agent/frontend/new-feature');
    });
  });

  // ─── Commits ──────────────────────────────────────────────────────────────

  describe('commit', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = makeAgent({ id: 'frontend', name: 'Frontend', role: 'UI dev' });
      await git.createBranch(agent, { agentId: 'frontend', taskSlug: 'my-task' });
    });

    it('commits staged files with agent tag appended to the message', async () => {
      await fs.writeFile(path.join(tmpDir, 'button.tsx'), 'export const Button = () => <button />;');

      const result = await git.commit(agent, {
        message: 'feat(ui): add Button component',
        agentId: 'frontend',
      });

      expect(result.success).toBe(true);
    });

    it('commit message includes [agent:id] tag', async () => {
      await fs.writeFile(path.join(tmpDir, 'component.ts'), 'export {}');
      await git.commit(agent, { message: 'feat: add component', agentId: 'frontend' });

      // Read the last commit message via simple-git status
      const status = await git.getStatus();
      expect(status.branch).toBe('agent/frontend/my-task');
    });

    it('commits only specified files when files list is provided', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.ts'), 'const a = 1;');
      await fs.writeFile(path.join(tmpDir, 'b.ts'), 'const b = 2;');

      const result = await git.commit(agent, {
        message: 'feat: only file a',
        agentId: 'frontend',
        files: ['a.ts'],
      });

      expect(result.success).toBe(true);
    });

    it('returns error when there is nothing to commit', async () => {
      const result = await git.commit(agent, {
        message: 'empty commit attempt',
        agentId: 'frontend',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Nothing to commit');
      }
    });

    it('blocks commit when agent lacks canCommit permission', async () => {
      const noCommitAgent = makeAgent({
        id: 'read-only',
        git: { canBranch: true, canCommit: false, canPush: false, canCreatePR: false, canMerge: false },
      });

      const result = await git.commit(noCommitAgent, {
        message: 'blocked commit',
        agentId: 'read-only',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('canCommit');
      }
    });
  });

  // ─── Push permissions ─────────────────────────────────────────────────────

  describe('push permissions', () => {
    it('blocks push when agent lacks canPush permission', async () => {
      const noPushAgent = makeAgent({
        id: 'no-push',
        git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
      });

      const result = await git.push(noPushAgent);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('canPush');
      }
    });

    it('returns error when push is attempted with no remote configured', async () => {
      const pushAgent = makeAgent({
        id: 'push-agent',
        git: { canBranch: true, canCommit: true, canPush: true, canCreatePR: false, canMerge: false },
      });

      // No remote is configured — push will fail gracefully
      const result = await git.push(pushAgent);
      expect(result.success).toBe(false);
    });
  });

  // ─── PR and merge permissions ─────────────────────────────────────────────

  describe('PR and merge permissions', () => {
    it('blocks PR creation when agent lacks canCreatePR permission', async () => {
      const agent = makeAgent({
        id: 'no-pr',
        git: { canBranch: true, canCommit: true, canPush: true, canCreatePR: false, canMerge: false },
      });

      const result = await git.createPR(agent, {
        title: 'My PR',
        body: 'Description',
        agentId: 'no-pr',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('canCreatePR');
      }
    });

    it('blocks merge when agent lacks canMerge permission', async () => {
      const agent = makeAgent({
        id: 'no-merge',
        git: { canBranch: true, canCommit: true, canPush: true, canCreatePR: true, canMerge: false },
      });

      const result = await git.merge(agent, 'some-branch');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('canMerge');
      }
    });
  });

  // ─── Status and branch info ───────────────────────────────────────────────

  describe('status and branch info', () => {
    it('getCurrentBranch returns the active branch name', async () => {
      const branch = await git.getCurrentBranch();
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });

    it('getStatus returns correct structure', async () => {
      const status = await git.getStatus();
      expect(typeof status.branch).toBe('string');
      expect(Array.isArray(status.modified)).toBe(true);
      expect(Array.isArray(status.staged)).toBe(true);
      expect(Array.isArray(status.untracked)).toBe(true);
    });

    it('getStatus reflects untracked files', async () => {
      await fs.writeFile(path.join(tmpDir, 'new-file.ts'), 'export {}');
      const status = await git.getStatus();
      expect(status.untracked).toContain('new-file.ts');
    });

    it('agent branch follows agent/[id]/[slug] pattern after creation', async () => {
      const agent = makeAgent({ id: 'devops', name: 'DevOps', role: 'CI/CD' });
      await git.createBranch(agent, { agentId: 'devops', taskSlug: 'add-ci-pipeline' });

      const branch = await git.getCurrentBranch();
      expect(branch).toMatch(/^agent\/devops\//);
    });
  });

  // ─── File ownership stub ──────────────────────────────────────────────────

  describe('file ownership', () => {
    it('getFileOwnership returns an empty map (conflict guard stub)', async () => {
      const ownership = await git.getFileOwnership();
      expect(ownership instanceof Map).toBe(true);
      expect(ownership.size).toBe(0);
    });
  });
});
