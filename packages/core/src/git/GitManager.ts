// packages/core/src/git/GitManager.ts

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
          `Agent '${agent.id}' does not have permission: ${permission}`,
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
        { cwd: this.projectRoot, encoding: 'utf-8' },
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
    // Stub for future file locking implementation — tracked externally by Orchestrator
    return new Map();
  }
}
