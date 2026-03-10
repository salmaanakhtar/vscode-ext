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
      expect(result.data.tags).toContain('react');
      expect(result.data.id).toMatch(/^mem_/);
    }
  });

  it('write defaults to empty tags array', async () => {
    const result = await manager.write('frontend', 'fact', 'No tags');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });

  it('reads a written entry by id', async () => {
    const writeResult = await manager.write('frontend', 'fact', 'Readable');
    expect(writeResult.success).toBe(true);
    if (!writeResult.success) return;

    const readResult = await manager.read(writeResult.data.id);
    expect(readResult.success).toBe(true);
    if (readResult.success) {
      expect(readResult.data?.content).toBe('Readable');
    }
  });

  it('reads null for missing id', async () => {
    const result = await manager.read('nonexistent');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it('lists entries with filter', async () => {
    await manager.write('frontend', 'fact', 'FE entry');
    await manager.write('backend', 'fact', 'BE entry');

    const result = await manager.list({ agentId: 'frontend' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.agentId).toBe('frontend');
    }
  });

  it('searches entries', async () => {
    await manager.write('frontend', 'fact', 'Uses TypeScript');
    await manager.write('frontend', 'fact', 'Uses React');

    const result = await manager.search('TypeScript');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
    }
  });

  it('deletes an entry', async () => {
    const writeResult = await manager.write('frontend', 'fact', 'To be deleted');
    expect(writeResult.success).toBe(true);
    if (!writeResult.success) return;

    const deleteResult = await manager.delete(writeResult.data.id);
    expect(deleteResult.success).toBe(true);

    const readResult = await manager.read(writeResult.data.id);
    expect(readResult.success).toBe(true);
    if (readResult.success) {
      expect(readResult.data).toBeNull();
    }
  });

  it('compact returns success', async () => {
    const result = await manager.compact('frontend');
    expect(result.success).toBe(true);
  });

  it('returns Result error when write fails on bad path', async () => {
    // Create a FILE at the target path so mkdir in init() fails (file != directory)
    const filePath = path.join(tmpDir, 'not-a-dir');
    await fs.writeFile(filePath, 'occupied');
    const badManager = new MemoryManager();
    // init() mkdir will fail because filePath is a file, not a directory
    const initResult = await badManager.init({ backend: 'files', path: filePath });
    expect(initResult.success).toBe(false);
  });

  it('generates agent context string', async () => {
    await manager.write('frontend', 'fact', 'Entry 1');
    await manager.write('frontend', 'decision', 'Entry 2');
    const ctx = await manager.getAgentContext('frontend');
    expect(ctx).toContain('Entry 1');
    expect(ctx).toContain('Entry 2');
    expect(ctx).toContain('[fact]');
    expect(ctx).toContain('[decision]');
  });

  it('returns empty string when agent has no entries', async () => {
    const ctx = await manager.getAgentContext('nonexistent-agent');
    expect(ctx).toBe('');
  });

  it('generates project context string', async () => {
    await manager.write('project', 'context', 'Project uses monorepo');
    const ctx = await manager.getProjectContext();
    expect(ctx).toContain('Project uses monorepo');
  });

  it('fromConfig creates FileAdapter by default', async () => {
    const m = MemoryManager.fromConfig({ backend: 'files', path: tmpDir });
    const initResult = await m.init({ backend: 'files', path: tmpDir });
    expect(initResult.success).toBe(true);
  });

  it('fromConfig throws for custom backend without path', () => {
    expect(() =>
      MemoryManager.fromConfig({ backend: 'custom', path: tmpDir })
    ).toThrow('customAdapterPath required');
  });
});
