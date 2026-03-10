import type { MemoryAdapter, MemoryConfig, MemoryEntry } from '@vscode-ext/shared';
import { logger } from '@vscode-ext/shared';

// BindParameters type matching better-sqlite3's accepted parameter types.
type BindParam = string | number | bigint | Buffer | null;

export class SQLiteAdapter implements MemoryAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any = null; // better-sqlite3 Database instance, assigned by init()

  async init(config: MemoryConfig): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let BetterSqlite3: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      BetterSqlite3 = require('better-sqlite3');
    } catch {
      throw new Error('better-sqlite3 is not installed. Run: npm install better-sqlite3');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    this.db = new BetterSqlite3(config.path) as unknown;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get database(): any {
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
    const row = this.database
      .prepare('SELECT * FROM memory_entries WHERE id = ?')
      .get(id) as Record<string, string> | undefined;

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
    const params: BindParam[] = [];

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
    const params: BindParam[] = [query];

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
      .run(agentId, thirtyDaysAgo) as { changes: number };
    logger.info('Compacted SQLite memory', { agentId, deleted: result.changes });
  }

  private rowToEntry(row: Record<string, string>): MemoryEntry {
    return {
      id: row['id'] as string,
      agentId: row['agent_id'] as string,
      type: row['type'] as MemoryEntry['type'],
      content: row['content'] as string,
      tags: JSON.parse(row['tags'] as string) as string[],
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
}
