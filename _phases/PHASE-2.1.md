# Phase 2.1 — Memory Adapters

> Read CLAUDE.md and PROGRESS.md before starting.
> Phases 1.1 and 1.2 must be complete. `packages/shared` must be fully built and tested.

---

## Goal

Implement the `MemoryManager` and two concrete `MemoryAdapter` backends inside `packages/core/src/memory/`:
1. **FileAdapter** — stores memory as markdown/JSON files in `.agent/memory/` (default backend)
2. **SQLiteAdapter** — stores memory in a local SQLite database using better-sqlite3

Both adapters must implement the `MemoryAdapter` interface from `packages/shared` exactly.

---

## Branch

```bash
git checkout main && git pull origin main
git checkout -b phase/2.1-memory-adapters
```

---

## Deliverables

### 1. `packages/core/src/memory/FileAdapter.ts`

```typescript
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import type { MemoryAdapter } from '@vscode-ext/shared';
import type { MemoryConfig, MemoryEntry } from '@vscode-ext/shared';
import { generateMemoryId } from '@vscode-ext/shared';
import { logger } from '@vscode-ext/shared';

export class FileAdapter implements MemoryAdapter {
  private basePath: string = '';

  async init(config: MemoryConfig): Promise<void> {
    this.basePath = config.path;
    await fs.mkdir(this.basePath, { recursive: true });
    logger.debug('FileAdapter initialised', { path: this.basePath });
  }

  private entryPath(id: string): string {
    return path.join(this.basePath, `${id}.json`);
  }

  async write(entry: MemoryEntry): Promise<void> {
    const filePath = this.entryPath(entry.id);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  }

  async read(id: string): Promise<MemoryEntry | null> {
    try {
      const content = await fs.readFile(this.entryPath(id), 'utf-8');
      return JSON.parse(content) as MemoryEntry;
    } catch {
      return null;
    }
  }

  async list(filter?: {
    agentId?: string;
    type?: MemoryEntry['type'];
    tags?: string[];
    limit?: number;
    since?: string;
  }): Promise<MemoryEntry[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.basePath);
    } catch {
      return [];
    }

    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const entries: MemoryEntry[] = [];

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(this.basePath, file), 'utf-8');
        const entry = JSON.parse(content) as MemoryEntry;
        entries.push(entry);
      } catch {
        // skip corrupt files
      }
    }

    let results = entries;

    if (filter?.agentId !== undefined) {
      results = results.filter(e => e.agentId === filter.agentId);
    }
    if (filter?.type !== undefined) {
      results = results.filter(e => e.type === filter.type);
    }
    if (filter?.tags && filter.tags.length > 0) {
      results = results.filter(e =>
        filter.tags!.some(tag => e.tags.includes(tag))
      );
    }
    if (filter?.since) {
      results = results.filter(e => e.createdAt >= filter.since!);
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async search(query: string, agentId?: string): Promise<MemoryEntry[]> {
    const all = await this.list({ agentId });
    const lower = query.toLowerCase();
    return all.filter(e =>
      e.content.toLowerCase().includes(lower) ||
      e.tags.some(t => t.toLowerCase().includes(lower))
    );
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(this.entryPath(id));
    } catch {
      // already deleted — ignore
    }
  }

  async compact(agentId: string): Promise<void> {
    // For file backend: archive entries older than 30 days to a summary file
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const old = await this.list({ agentId, since: undefined });
    const toArchive = old.filter(e => e.updatedAt < thirtyDaysAgo);

    if (toArchive.length === 0) return;

    const archivePath = path.join(this.basePath, `archive_${agentId}_${Date.now()}.json`);
    await fs.writeFile(archivePath, JSON.stringify(toArchive, null, 2));

    for (const entry of toArchive) {
      await this.delete(entry.id);
    }

    logger.info('Compacted memory entries', { agentId, count: toArchive.length });
  }
}
```

### 2. `packages/core/src/memory/SQLiteAdapter.ts`

```typescript
import type { MemoryAdapter } from '@vscode-ext/shared';
import type { MemoryConfig, MemoryEntry } from '@vscode-ext/shared';
import { logger } from '@vscode-ext/shared';
// dynamic import to avoid hard dependency if sqlite not installed
let Database: typeof import('better-sqlite3');

export class SQLiteAdapter implements MemoryAdapter {
  private db: import('better-sqlite3').Database | null = null;

  async init(config: MemoryConfig): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Database = require('better-sqlite3');
    } catch {
      throw new Error('better-sqlite3 is not installed. Run: npm install better-sqlite3');
    }

    this.db = new Database(config.path);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_id ON memory_entries(agent_id);
      CREATE INDEX IF NOT EXISTS idx_type ON memory_entries(type);
      CREATE INDEX IF NOT EXISTS idx_created_at ON memory_entries(created_at);

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts
      USING fts5(id, content, tags, content=memory_entries, content_rowid=rowid);

      CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_entries BEGIN
        INSERT INTO memory_fts(rowid, id, content, tags) VALUES (new.rowid, new.id, new.content, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_entries BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, id, content, tags) VALUES('delete', old.rowid, old.id, old.content, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory_entries BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, id, content, tags) VALUES('delete', old.rowid, old.id, old.content, old.tags);
        INSERT INTO memory_fts(rowid, id, content, tags) VALUES (new.rowid, new.id, new.content, new.tags);
      END;
    `);

    logger.debug('SQLiteAdapter initialised', { path: config.path });
  }

  private get database(): import('better-sqlite3').Database {
    if (!this.db) throw new Error('SQLiteAdapter not initialised');
    return this.db;
  }

  async write(entry: MemoryEntry): Promise<void> {
    const stmt = this.database.prepare(`
      INSERT INTO memory_entries (id, agent_id, type, content, tags, created_at, updated_at)
      VALUES (@id, @agentId, @type, @content, @tags, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        tags = excluded.tags,
        updated_at = excluded.updated_at
    `);

    stmt.run({
      id: entry.id,
      agentId: entry.agentId,
      type: entry.type,
      content: entry.content,
      tags: JSON.stringify(entry.tags),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  }

  async read(id: string): Promise<MemoryEntry | null> {
    const row = this.database.prepare(
      'SELECT * FROM memory_entries WHERE id = ?'
    ).get(id) as Record<string, string> | undefined;

    if (!row) return null;
    return this.rowToEntry(row);
  }

  async list(filter?: {
    agentId?: string;
    type?: MemoryEntry['type'];
    tags?: string[];
    limit?: number;
    since?: string;
  }): Promise<MemoryEntry[]> {
    let sql = 'SELECT * FROM memory_entries WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.agentId) { sql += ' AND agent_id = ?'; params.push(filter.agentId); }
    if (filter?.type) { sql += ' AND type = ?'; params.push(filter.type); }
    if (filter?.since) { sql += ' AND created_at >= ?'; params.push(filter.since); }

    sql += ' ORDER BY created_at DESC';

    if (filter?.limit) { sql += ' LIMIT ?'; params.push(filter.limit); }

    const rows = this.database.prepare(sql).all(...params) as Record<string, string>[];
    let results = rows.map(r => this.rowToEntry(r));

    if (filter?.tags && filter.tags.length > 0) {
      results = results.filter(e =>
        filter.tags!.some(tag => e.tags.includes(tag))
      );
    }

    return results;
  }

  async search(query: string, agentId?: string): Promise<MemoryEntry[]> {
    let sql = `
      SELECT me.* FROM memory_entries me
      INNER JOIN memory_fts ON memory_fts.id = me.id
      WHERE memory_fts MATCH ?
    `;
    const params: unknown[] = [query];

    if (agentId) {
      sql += ' AND me.agent_id = ?';
      params.push(agentId);
    }

    sql += ' ORDER BY me.created_at DESC LIMIT 50';

    const rows = this.database.prepare(sql).all(...params) as Record<string, string>[];
    return rows.map(r => this.rowToEntry(r));
  }

  async delete(id: string): Promise<void> {
    this.database.prepare('DELETE FROM memory_entries WHERE id = ?').run(id);
  }

  async compact(agentId: string): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = this.database
      .prepare('DELETE FROM memory_entries WHERE agent_id = ? AND updated_at < ?')
      .run(agentId, thirtyDaysAgo);
    logger.info('Compacted SQLite memory', { agentId, deleted: result.changes });
  }

  private rowToEntry(row: Record<string, string>): MemoryEntry {
    return {
      id: row['id'],
      agentId: row['agent_id'],
      type: row['type'] as MemoryEntry['type'],
      content: row['content'],
      tags: JSON.parse(row['tags']) as string[],
      createdAt: row['created_at'],
      updatedAt: row['updated_at'],
    };
  }
}
```

### 3. `packages/core/src/memory/MemoryManager.ts`

```typescript
import type { MemoryAdapter } from '@vscode-ext/shared';
import type { MemoryConfig, MemoryEntry, Result } from '@vscode-ext/shared';
import { generateMemoryId, logger } from '@vscode-ext/shared';
import { FileAdapter } from './FileAdapter';
import { SQLiteAdapter } from './SQLiteAdapter';

export class MemoryManager {
  private adapter: MemoryAdapter;
  private initialised = false;

  constructor(adapter?: MemoryAdapter) {
    // Default to FileAdapter if none provided
    this.adapter = adapter ?? new FileAdapter();
  }

  static fromConfig(config: MemoryConfig): MemoryManager {
    let adapter: MemoryAdapter;

    switch (config.backend) {
      case 'sqlite':
        adapter = new SQLiteAdapter();
        break;
      case 'custom':
        if (!config.customAdapterPath) {
          throw new Error('customAdapterPath required for custom backend');
        }
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const CustomAdapter = require(config.customAdapterPath);
        adapter = new CustomAdapter() as MemoryAdapter;
        break;
      case 'files':
      default:
        adapter = new FileAdapter();
    }

    return new MemoryManager(adapter);
  }

  async init(config: MemoryConfig): Promise<Result<void>> {
    try {
      await this.adapter.init(config);
      this.initialised = true;
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async write(
    agentId: string,
    type: MemoryEntry['type'],
    content: string,
    tags: string[] = []
  ): Promise<Result<MemoryEntry>> {
    try {
      const now = new Date().toISOString();
      const entry: MemoryEntry = {
        id: generateMemoryId(),
        agentId,
        type,
        content,
        tags,
        createdAt: now,
        updatedAt: now,
      };
      await this.adapter.write(entry);
      return { success: true, data: entry };
    } catch (err) {
      logger.error('Failed to write memory', { agentId, error: (err as Error).message });
      return { success: false, error: err as Error };
    }
  }

  async read(id: string): Promise<Result<MemoryEntry | null>> {
    try {
      const entry = await this.adapter.read(id);
      return { success: true, data: entry };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async list(filter?: Parameters<MemoryAdapter['list']>[0]): Promise<Result<MemoryEntry[]>> {
    try {
      const entries = await this.adapter.list(filter);
      return { success: true, data: entries };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async search(query: string, agentId?: string): Promise<Result<MemoryEntry[]>> {
    try {
      const entries = await this.adapter.search(query, agentId);
      return { success: true, data: entries };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async delete(id: string): Promise<Result<void>> {
    try {
      await this.adapter.delete(id);
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async compact(agentId: string): Promise<Result<void>> {
    try {
      await this.adapter.compact(agentId);
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async getAgentContext(agentId: string, limit = 20): Promise<string> {
    const result = await this.list({ agentId, limit });
    if (!result.success || result.data.length === 0) return '';

    return result.data
      .map(e => `[${e.type}] ${e.content}`)
      .join('\n\n');
  }

  async getProjectContext(limit = 10): Promise<string> {
    const result = await this.list({ agentId: 'project', limit });
    if (!result.success || result.data.length === 0) return '';

    return result.data
      .map(e => `[${e.type}] ${e.content}`)
      .join('\n\n');
  }
}
```

### 4. `packages/core/src/memory/index.ts`

```typescript
export { FileAdapter } from './FileAdapter';
export { SQLiteAdapter } from './SQLiteAdapter';
export { MemoryManager } from './MemoryManager';
```

### 5. Unit Tests

`packages/core/src/__tests__/memory/FileAdapter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileAdapter } from '../../memory/FileAdapter';
import type { MemoryEntry } from '@vscode-ext/shared';

describe('FileAdapter', () => {
  let adapter: FileAdapter;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mem-test-'));
    adapter = new FileAdapter();
    await adapter.init({ backend: 'files', path: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeEntry = (overrides?: Partial<MemoryEntry>): MemoryEntry => ({
    id: 'test-id-1',
    agentId: 'frontend',
    type: 'fact',
    content: 'The app uses React 18',
    tags: ['react', 'frontend'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  it('writes and reads an entry', async () => {
    const entry = makeEntry();
    await adapter.write(entry);
    const result = await adapter.read(entry.id);
    expect(result).toEqual(entry);
  });

  it('returns null for missing entry', async () => {
    expect(await adapter.read('nonexistent')).toBeNull();
  });

  it('lists entries with agentId filter', async () => {
    await adapter.write(makeEntry({ id: '1', agentId: 'frontend' }));
    await adapter.write(makeEntry({ id: '2', agentId: 'backend' }));
    const results = await adapter.list({ agentId: 'frontend' });
    expect(results).toHaveLength(1);
    expect(results[0].agentId).toBe('frontend');
  });

  it('searches by content', async () => {
    await adapter.write(makeEntry({ id: '1', content: 'Uses React 18' }));
    await adapter.write(makeEntry({ id: '2', content: 'Uses Express 4' }));
    const results = await adapter.search('React');
    expect(results).toHaveLength(1);
  });

  it('deletes an entry', async () => {
    const entry = makeEntry();
    await adapter.write(entry);
    await adapter.delete(entry.id);
    expect(await adapter.read(entry.id)).toBeNull();
  });
});
```

`packages/core/src/__tests__/memory/MemoryManager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MemoryManager } from '../../memory/MemoryManager';

describe('MemoryManager', () => {
  let manager: MemoryManager;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mgr-test-'));
    manager = new MemoryManager();
    await manager.init({ backend: 'files', path: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes a memory entry successfully', async () => {
    const result = await manager.write('frontend', 'fact', 'Uses React 18', ['react']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentId).toBe('frontend');
      expect(result.data.content).toBe('Uses React 18');
    }
  });

  it('returns Result error on adapter failure', async () => {
    // Corrupt the adapter path
    const badManager = new MemoryManager();
    await badManager.init({ backend: 'files', path: '/nonexistent/path' });
    const result = await badManager.write('agent', 'fact', 'test');
    // Should not throw — should return Result error
    expect(result.success).toBe(false);
  });

  it('generates agent context string', async () => {
    await manager.write('frontend', 'fact', 'Entry 1');
    await manager.write('frontend', 'decision', 'Entry 2');
    const ctx = await manager.getAgentContext('frontend');
    expect(ctx).toContain('Entry 1');
    expect(ctx).toContain('Entry 2');
  });
});
```

Add `vitest.config.ts` to `packages/core/`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**']
    }
  }
});
```

---

## Acceptance Criteria

- [ ] `FileAdapter` passes all tests
- [ ] `MemoryManager` wraps all operations in `Result<T>`
- [ ] `SQLiteAdapter` initialises without errors when better-sqlite3 is available
- [ ] Both adapters satisfy the `MemoryAdapter` interface (TypeScript verifies this)
- [ ] No `vscode` imports anywhere in `packages/core`
- [ ] Tests pass with >80% coverage
- [ ] `npm run typecheck` passes

---

## Self-Review & Merge

```bash
cd packages/core && npm test && npm run typecheck
grep -r "from 'vscode'" packages/core && echo "VIOLATION" || echo "OK"
cd ../.. && npm run lint
git diff main...HEAD

git checkout main
git merge phase/2.1-memory-adapters --no-ff -m "merge: complete phase 2.1 — memory adapters"
git push origin main
git tag -a "phase-2.1-complete" -m "Phase 2.1 complete: memory adapters"
git push origin --tags
```

---

## Next Phase

**Phase 2.2 — TeamRegistry**
Load `_phases/PHASE-2.2.md` in the next session.
