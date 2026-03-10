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

  it('lists all entries when no filter applied', async () => {
    await adapter.write(makeEntry({ id: '1' }));
    await adapter.write(makeEntry({ id: '2', agentId: 'backend' }));
    const results = await adapter.list();
    expect(results).toHaveLength(2);
  });

  it('lists entries with agentId filter', async () => {
    await adapter.write(makeEntry({ id: '1', agentId: 'frontend' }));
    await adapter.write(makeEntry({ id: '2', agentId: 'backend' }));
    const results = await adapter.list({ agentId: 'frontend' });
    expect(results).toHaveLength(1);
    expect(results[0]?.agentId).toBe('frontend');
  });

  it('lists entries with type filter', async () => {
    await adapter.write(makeEntry({ id: '1', type: 'fact' }));
    await adapter.write(makeEntry({ id: '2', type: 'decision' }));
    const results = await adapter.list({ type: 'decision' });
    expect(results).toHaveLength(1);
    expect(results[0]?.type).toBe('decision');
  });

  it('lists entries with tags filter', async () => {
    await adapter.write(makeEntry({ id: '1', tags: ['react'] }));
    await adapter.write(makeEntry({ id: '2', tags: ['express'] }));
    const results = await adapter.list({ tags: ['react'] });
    expect(results).toHaveLength(1);
  });

  it('respects limit in list', async () => {
    await adapter.write(makeEntry({ id: '1' }));
    await adapter.write(makeEntry({ id: '2', agentId: 'backend' }));
    await adapter.write(makeEntry({ id: '3', agentId: 'qa' }));
    const results = await adapter.list({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('filters by since timestamp', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    await adapter.write(makeEntry({ id: '1', createdAt: past, updatedAt: past }));
    await adapter.write(makeEntry({ id: '2', createdAt: future, updatedAt: future }));
    const results = await adapter.list({ since: new Date().toISOString() });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('2');
  });

  it('searches by content', async () => {
    await adapter.write(makeEntry({ id: '1', content: 'Uses React 18', tags: [] }));
    await adapter.write(makeEntry({ id: '2', content: 'Uses Express 4', tags: [] }));
    const results = await adapter.search('React');
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toContain('React');
  });

  it('searches by tag', async () => {
    await adapter.write(makeEntry({ id: '1', content: 'neutral', tags: ['react', 'frontend'] }));
    await adapter.write(makeEntry({ id: '2', content: 'neutral', tags: ['express'] }));
    const results = await adapter.search('react');
    expect(results).toHaveLength(1);
  });

  it('search is case-insensitive', async () => {
    await adapter.write(makeEntry({ id: '1', content: 'Uses REACT 18' }));
    const results = await adapter.search('react');
    expect(results).toHaveLength(1);
  });

  it('deletes an entry', async () => {
    const entry = makeEntry();
    await adapter.write(entry);
    await adapter.delete(entry.id);
    expect(await adapter.read(entry.id)).toBeNull();
  });

  it('delete is idempotent for missing entries', async () => {
    await expect(adapter.delete('nonexistent')).resolves.toBeUndefined();
  });

  it('returns empty list when directory is empty', async () => {
    const results = await adapter.list();
    expect(results).toEqual([]);
  });

  it('compact archives old entries', async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeEntry({ id: 'old-1', agentId: 'frontend', createdAt: oldDate, updatedAt: oldDate });
    await adapter.write(entry);

    await adapter.compact('frontend');

    // original entry deleted
    expect(await adapter.read('old-1')).toBeNull();

    // archive file created
    const files = await fs.readdir(tmpDir);
    const archives = files.filter(f => f.startsWith('archive_frontend_'));
    expect(archives).toHaveLength(1);
  });

  it('compact skips when no old entries', async () => {
    const entry = makeEntry({ id: 'new-1' });
    await adapter.write(entry);
    await adapter.compact('frontend');
    // entry still exists
    expect(await adapter.read('new-1')).not.toBeNull();
  });
});
