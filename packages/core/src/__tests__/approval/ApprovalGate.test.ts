import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ApprovalGate } from '../../approval/ApprovalGate';

describe('ApprovalGate', () => {
  let tmpDir: string;
  let gate: ApprovalGate;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gate-test-'));
    await fs.mkdir(path.join(tmpDir, '.agent', 'memory'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.agent', 'memory', 'audit.md'), '# Audit\n\n');
    gate = new ApprovalGate(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('auto-approves when setAutoApprove is configured for that action', async () => {
    gate.setAutoApprove('frontend', 'createFile');
    const result = await gate.check('frontend', 'createFile', 'Create file', 'ctx', 'task-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(true);
  });

  it('calls approval handler for medium risk actions', async () => {
    const handler = vi.fn().mockResolvedValue({
      decision: 'approved',
      resolvedAt: new Date().toISOString(),
    });
    gate.setApprovalHandler(handler);

    const result = await gate.check('frontend', 'runScript', 'Run script', 'ctx', 'task-1');
    expect(handler).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(true);
  });

  it('blocks action when handler rejects', async () => {
    gate.setApprovalHandler(async () => ({
      decision: 'rejected',
      feedback: 'Too risky',
      resolvedAt: new Date().toISOString(),
    }));

    const result = await gate.check('frontend', 'deleteFile', 'Delete file', 'ctx', 'task-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(false);
  });

  it('approves modified decision as proceed', async () => {
    gate.setApprovalHandler(async () => ({
      decision: 'modified',
      modifiedParams: { path: '/safe/path' },
      resolvedAt: new Date().toISOString(),
    }));

    const result = await gate.check('frontend', 'push', 'Push branch', 'ctx', 'task-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(true);
  });

  it('writes to audit log on resolution', async () => {
    gate.setApprovalHandler(async () => ({
      decision: 'approved',
      resolvedAt: new Date().toISOString(),
    }));

    await gate.check('frontend', 'push', 'Push to remote', 'ctx', 'task-1');

    const audit = await fs.readFile(
      path.join(tmpDir, '.agent', 'memory', 'audit.md'), 'utf-8'
    );
    expect(audit).toContain('frontend');
    expect(audit).toContain('approved');
  });

  it('blocks when no handler is set', async () => {
    const result = await gate.check('frontend', 'deleteFile', 'Delete', 'ctx', 'task-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(false);
  });

  it('returns pending requests', async () => {
    // Make handler block indefinitely so we can inspect pending state
    let resolve: (r: { decision: 'approved'; resolvedAt: string }) => void;
    const pending = new Promise<{ decision: 'approved'; resolvedAt: string }>(res => { resolve = res; });
    gate.setApprovalHandler(() => pending);

    const checkPromise = gate.check('backend', 'runScript', 'Run build', 'ctx', 'task-2');
    // Yield to allow the request to be registered
    await new Promise(r => setImmediate(r));

    const reqs = gate.getPendingRequests();
    expect(reqs.length).toBe(1);
    expect(reqs[0].agentId).toBe('backend');
    expect(reqs[0].action).toBe('runScript');

    // Resolve to clean up
    resolve!({ decision: 'approved', resolvedAt: new Date().toISOString() });
    await checkPromise;
  });

  it('getPendingRequest returns null for unknown id', () => {
    expect(gate.getPendingRequest('nonexistent')).toBeNull();
  });

  it('getRiskLevel returns correct level for known actions', () => {
    expect(gate.getRiskLevel('any', 'deleteFile')).toBe('high');
    expect(gate.getRiskLevel('any', 'push')).toBe('medium');
    expect(gate.getRiskLevel('any', 'createFile')).toBe('low');
  });

  it('returns error result when handler throws', async () => {
    gate.setApprovalHandler(async () => { throw new Error('handler crashed'); });
    const result = await gate.check('frontend', 'runScript', 'Run', 'ctx', 'task-1');
    expect(result.success).toBe(false);
  });
});
