// packages/core/src/orchestrator/TaskQueue.ts

import type { Task, Result } from '@vscode-ext/shared';
import { generateTaskId, logger } from '@vscode-ext/shared';

export class TaskQueue {
  private tasks: Map<string, Task> = new Map();

  /**
   * Create a new pending task and add it to the queue.
   */
  create(agentId: string, prompt: string): Task {
    const task: Task = {
      id: generateTaskId(),
      agentId,
      prompt,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, task);
    logger.debug('Task created', { taskId: task.id, agentId });
    return task;
  }

  /**
   * Apply partial updates to an existing task.
   */
  update(taskId: string, updates: Partial<Task>): Result<Task> {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, error: new Error(`Task not found: ${taskId}`) };
    const updated = { ...task, ...updates };
    this.tasks.set(taskId, updated);
    return { success: true, data: updated };
  }

  /** Retrieve a task by id, or null if not found. */
  get(taskId: string): Task | null {
    return this.tasks.get(taskId) ?? null;
  }

  /** Return all tasks for a given agent. */
  getByAgent(agentId: string): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.agentId === agentId);
  }

  /** Return all tasks that are currently pending, running, or awaiting approval. */
  getActive(): Task[] {
    return Array.from(this.tasks.values()).filter(
      t => t.status === 'pending' || t.status === 'running' || t.status === 'awaiting_approval'
    );
  }

  /** Return every task in the queue. */
  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Remove completed/failed tasks older than `olderThanMs` milliseconds.
   * Defaults to 24 hours.
   */
  clear(olderThanMs = 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    for (const [id, task] of this.tasks.entries()) {
      if ((task.status === 'complete' || task.status === 'failed') && task.createdAt < cutoff) {
        this.tasks.delete(id);
      }
    }
  }
}
