// packages/shared/src/interfaces/MemoryAdapter.ts

import type { MemoryConfig, MemoryEntry } from '../types';

export interface MemoryAdapter {
  /**
   * Initialise the backend. Called once on startup.
   * Should create directories, tables, or any required infrastructure.
   */
  init(config: MemoryConfig): Promise<void>;

  /**
   * Write a memory entry. If an entry with the same id exists, overwrite it.
   */
  write(entry: MemoryEntry): Promise<void>;

  /**
   * Read a specific entry by ID. Returns null if not found.
   */
  read(id: string): Promise<MemoryEntry | null>;

  /**
   * List entries with optional filtering.
   */
  list(filter?: {
    agentId?: string;
    type?: MemoryEntry['type'];
    tags?: string[];
    limit?: number;
    since?: string; // ISO timestamp
  }): Promise<MemoryEntry[]>;

  /**
   * Search entries by content. Implementation varies by backend.
   * File backend: substring match. SQLite: FTS5.
   */
  search(query: string, agentId?: string): Promise<MemoryEntry[]>;

  /**
   * Delete a memory entry by ID.
   */
  delete(id: string): Promise<void>;

  /**
   * Summarise and compact old entries for an agent.
   * Called at the end of an agent session to keep memory lean.
   */
  compact(agentId: string): Promise<void>;
}
