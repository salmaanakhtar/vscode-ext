import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../../orchestrator/TaskQueue';

describe('TaskQueue', () => {
  it('creates tasks with pending status', () => {
    const q = new TaskQueue();
    const task = q.create('frontend', 'Build login form');
    expect(task.status).toBe('pending');
    expect(task.agentId).toBe('frontend');
    expect(task.prompt).toBe('Build login form');
    expect(task.id).toBeTruthy();
    expect(task.createdAt).toBeTruthy();
  });

  it('returns null for unknown task id', () => {
    const q = new TaskQueue();
    expect(q.get('nonexistent')).toBeNull();
  });

  it('updates task status', () => {
    const q = new TaskQueue();
    const task = q.create('frontend', 'task');
    const result = q.update(task.id, { status: 'running' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('running');
  });

  it('returns error when updating unknown task', () => {
    const q = new TaskQueue();
    const result = q.update('nonexistent', { status: 'running' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('nonexistent');
  });

  it('get returns updated task after update', () => {
    const q = new TaskQueue();
    const task = q.create('backend', 'task');
    q.update(task.id, { status: 'complete', result: 'done' });
    const fetched = q.get(task.id);
    expect(fetched?.status).toBe('complete');
    expect(fetched?.result).toBe('done');
  });

  it('getByAgent filters correctly', () => {
    const q = new TaskQueue();
    q.create('agent-a', 'task 1');
    q.create('agent-a', 'task 2');
    q.create('agent-b', 'task 3');
    expect(q.getByAgent('agent-a')).toHaveLength(2);
    expect(q.getByAgent('agent-b')).toHaveLength(1);
    expect(q.getByAgent('agent-c')).toHaveLength(0);
  });

  it('returns active tasks (pending, running, awaiting_approval)', () => {
    const q = new TaskQueue();
    const t1 = q.create('a1', 'pending task');
    const t2 = q.create('a2', 'running task');
    const t3 = q.create('a3', 'approval task');
    const t4 = q.create('a4', 'complete task');
    q.update(t2.id, { status: 'running' });
    q.update(t3.id, { status: 'awaiting_approval' });
    q.update(t4.id, { status: 'complete' });
    const active = q.getActive();
    expect(active.map(t => t.id)).toContain(t1.id);
    expect(active.map(t => t.id)).toContain(t2.id);
    expect(active.map(t => t.id)).toContain(t3.id);
    expect(active.map(t => t.id)).not.toContain(t4.id);
  });

  it('getAll returns every task', () => {
    const q = new TaskQueue();
    q.create('a', 'task 1');
    q.create('b', 'task 2');
    expect(q.getAll()).toHaveLength(2);
  });

  it('clears old completed tasks', () => {
    const q = new TaskQueue();
    const t = q.create('a1', 'old task');
    q.update(t.id, {
      status: 'complete',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    q.clear(24 * 60 * 60 * 1000);
    expect(q.get(t.id)).toBeNull();
  });

  it('does not clear recent completed tasks', () => {
    const q = new TaskQueue();
    const t = q.create('a1', 'recent task');
    q.update(t.id, { status: 'complete' });
    q.clear(24 * 60 * 60 * 1000);
    expect(q.get(t.id)).not.toBeNull();
  });

  it('does not clear active tasks regardless of age', () => {
    const q = new TaskQueue();
    const t = q.create('a1', 'old active task');
    q.update(t.id, {
      status: 'running',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    q.clear(24 * 60 * 60 * 1000);
    expect(q.get(t.id)).not.toBeNull();
  });
});
