// packages/core/src/__tests__/e2e/workflow-approval.test.ts
// End-to-end tests for the approval gate workflow.
// Uses a real temp directory and real ApprovalGate.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ApprovalGate } from '../../approval/ApprovalGate';
import { makeTempDir, cleanupTempDir } from './setup';

async function scaffoldAuditLog(root: string): Promise<void> {
  await fs.mkdir(path.join(root, '.agent', 'memory'), { recursive: true });
  await fs.writeFile(path.join(root, '.agent', 'memory', 'audit.md'), '# Audit Log\n\n');
}

describe('Workflow: Approval Gate', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    await scaffoldAuditLog(tmpDir);
  });
  afterEach(async () => { await cleanupTempDir(tmpDir); });

  // ─── No handler (blocking) ────────────────────────────────────────────────

  describe('no approval handler set', () => {
    it('blocks the action and returns false when no handler is registered', async () => {
      const gate = new ApprovalGate(tmpDir);
      const result = await gate.check('agent1', 'push', 'Push branch', 'ctx', 'task-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('setAutoApprove bypasses the missing handler for a specific agent+action', async () => {
      const gate = new ApprovalGate(tmpDir);
      gate.setAutoApprove('trusted-agent', 'createFile');

      const result = await gate.check('trusted-agent', 'createFile', 'Create config', 'ctx', 'task-2');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('setAutoApprove only bypasses for the exact agent+action pair', async () => {
      const gate = new ApprovalGate(tmpDir);
      gate.setAutoApprove('trusted-agent', 'createFile');

      // Different agent — should still be blocked
      const result = await gate.check('other-agent', 'createFile', 'Create config', 'ctx', 'task-3');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  // ─── Approval handler: approved ──────────────────────────────────────────

  describe('handler returns approved', () => {
    it('approved action returns true', async () => {
      const gate = new ApprovalGate(tmpDir);
      gate.setApprovalHandler(async () => ({
        decision: 'approved',
        resolvedAt: new Date().toISOString(),
      }));

      const result = await gate.check('agent1', 'push', 'Push to remote', 'ctx', 'task-4');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('approved action writes to the audit log', async () => {
      const gate = new ApprovalGate(tmpDir);
      gate.setApprovalHandler(async () => ({
        decision: 'approved',
        resolvedAt: new Date().toISOString(),
      }));

      await gate.check('agent1', 'push', 'Push to remote', 'ctx', 'task-5');

      const audit = await fs.readFile(
        path.join(tmpDir, '.agent', 'memory', 'audit.md'), 'utf-8',
      );
      expect(audit).toContain('approved');
      expect(audit).toContain('agent1');
    });
  });

  // ─── Approval handler: rejected ───────────────────────────────────────────

  describe('handler returns rejected', () => {
    it('rejected action returns false', async () => {
      const gate = new ApprovalGate(tmpDir);
      gate.setApprovalHandler(async () => ({
        decision: 'rejected',
        feedback: 'This is unsafe',
        resolvedAt: new Date().toISOString(),
      }));

      const result = await gate.check('agent1', 'deleteFile', 'Delete .env', 'ctx', 'task-6');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('rejected action writes feedback to the audit log', async () => {
      const gate = new ApprovalGate(tmpDir);
      gate.setApprovalHandler(async () => ({
        decision: 'rejected',
        feedback: 'Cannot delete production files',
        resolvedAt: new Date().toISOString(),
      }));

      await gate.check('agent1', 'deleteFile', 'Delete prod file', 'ctx', 'task-7');

      const audit = await fs.readFile(
        path.join(tmpDir, '.agent', 'memory', 'audit.md'), 'utf-8',
      );
      expect(audit).toContain('rejected');
      expect(audit).toContain('Cannot delete production files');
    });
  });

  // ─── Approval handler: modified ───────────────────────────────────────────

  describe('handler returns modified', () => {
    it('modified decision is treated as approved (returns true)', async () => {
      const gate = new ApprovalGate(tmpDir);
      gate.setApprovalHandler(async () => ({
        decision: 'modified',
        modifiedParams: { files: ['safe-file.ts'] },
        resolvedAt: new Date().toISOString(),
      }));

      const result = await gate.check('agent1', 'runScript', 'Run build script', 'ctx', 'task-8');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });
  });

  // ─── Pending request queue ────────────────────────────────────────────────

  describe('pending request queue', () => {
    it('request is in the queue while the handler is executing', async () => {
      const gate = new ApprovalGate(tmpDir);
      let pendingDuringHandler: unknown[] = [];

      gate.setApprovalHandler(async () => {
        pendingDuringHandler = gate.getPendingRequests();
        return { decision: 'approved', resolvedAt: new Date().toISOString() };
      });

      await gate.check('agent1', 'push', 'Push branch', 'ctx', 'task-9');

      expect(pendingDuringHandler).toHaveLength(1);
    });

    it('queue is empty after the handler resolves', async () => {
      const gate = new ApprovalGate(tmpDir);
      gate.setApprovalHandler(async () => ({
        decision: 'approved',
        resolvedAt: new Date().toISOString(),
      }));

      await gate.check('agent1', 'push', 'Push branch', 'ctx', 'task-10');

      expect(gate.getPendingRequests()).toHaveLength(0);
    });

    it('getPendingRequest returns null for unknown request id', () => {
      const gate = new ApprovalGate(tmpDir);
      expect(gate.getPendingRequest('nonexistent-id')).toBeNull();
    });

    it('returns error when handler throws', async () => {
      const gate = new ApprovalGate(tmpDir);
      gate.setApprovalHandler(async () => {
        throw new Error('handler crashed');
      });

      const result = await gate.check('agent1', 'push', 'Push', 'ctx', 'task-11');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('handler crashed');
      }
    });
  });

  // ─── Risk level classification ────────────────────────────────────────────

  describe('risk level classification', () => {
    it('deleteFile is classified as high risk', () => {
      const gate = new ApprovalGate(tmpDir);
      expect(gate.getRiskLevel('any-agent', 'deleteFile')).toBe('high');
    });

    it('forcePush is classified as high risk', () => {
      const gate = new ApprovalGate(tmpDir);
      expect(gate.getRiskLevel('any-agent', 'forcePush')).toBe('high');
    });

    it('push is classified as medium risk', () => {
      const gate = new ApprovalGate(tmpDir);
      expect(gate.getRiskLevel('any-agent', 'push')).toBe('medium');
    });

    it('createFile is classified as low risk', () => {
      const gate = new ApprovalGate(tmpDir);
      expect(gate.getRiskLevel('any-agent', 'createFile')).toBe('low');
    });

    it('installPackage is classified as low risk', () => {
      const gate = new ApprovalGate(tmpDir);
      expect(gate.getRiskLevel('any-agent', 'installPackage')).toBe('low');
    });
  });

  // ─── Multiple sequential approvals ───────────────────────────────────────

  describe('sequential approval requests', () => {
    it('handles multiple sequential approval requests independently', async () => {
      const gate = new ApprovalGate(tmpDir);
      const decisions: string[] = ['approved', 'rejected', 'approved'];
      let callCount = 0;

      gate.setApprovalHandler(async () => {
        const decision = decisions[callCount++] as 'approved' | 'rejected';
        return { decision, resolvedAt: new Date().toISOString() };
      });

      const r1 = await gate.check('agent1', 'push', 'Push 1', 'ctx', 'task-a');
      const r2 = await gate.check('agent1', 'deleteFile', 'Delete 1', 'ctx', 'task-b');
      const r3 = await gate.check('agent1', 'push', 'Push 2', 'ctx', 'task-c');

      expect(r1.success && r1.data).toBe(true);
      expect(r2.success && r2.data).toBe(false);
      expect(r3.success && r3.data).toBe(true);
    });
  });
});
