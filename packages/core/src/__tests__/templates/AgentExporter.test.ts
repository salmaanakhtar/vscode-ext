import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AgentExporter } from '../../templates/AgentExporter';
import type { Agent } from '@vscode-ext/shared';

const MOCK_AGENT: Agent = {
  id: 'test-frontend',
  name: 'Test Frontend',
  role: 'UI development',
  model: 'claude-sonnet-4-6',
  maxTurns: 50,
  template: 'frontend',
  git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
  approvalRequired: ['deleteFile', 'push'],
  builtinTools: ['Read', 'Write'],
  sessionId: 'session-abc-123', // should be stripped on export
};

async function scaffoldAgentDir(root: string, agentId: string): Promise<void> {
  const agentDir = path.join(root, '.agent', 'agents', agentId);
  await fs.mkdir(path.join(agentDir, 'memory'), { recursive: true });
  await fs.writeFile(path.join(agentDir, 'CLAUDE.md'), `# ${agentId} CLAUDE.md\n\nSome instructions.`);
  await fs.writeFile(
    path.join(agentDir, 'tools.json'),
    JSON.stringify({ builtinTools: ['Read', 'Write'] }, null, 2),
  );
  await fs.writeFile(
    path.join(agentDir, 'memory', 'decisions.md'),
    '# Decisions\n\nSome memory content.',
  );
}

describe('AgentExporter', () => {
  let tmpDir: string;
  const exporter = new AgentExporter();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'exporter-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('export', () => {
    it('creates a .agentpack file at the specified path', async () => {
      await scaffoldAgentDir(tmpDir, MOCK_AGENT.id);
      const packPath = path.join(tmpDir, 'test-frontend.agentpack');

      const result = await exporter.export(tmpDir, MOCK_AGENT, packPath);
      expect(result.success).toBe(true);

      const stat = await fs.stat(packPath);
      expect(stat.size).toBeGreaterThan(0);
    });

    it('strips sessionId from the exported agent', async () => {
      await scaffoldAgentDir(tmpDir, MOCK_AGENT.id);
      const packPath = path.join(tmpDir, 'test.agentpack');

      await exporter.export(tmpDir, MOCK_AGENT, packPath);
      const preview = await exporter.preview(packPath);

      expect(preview.success).toBe(true);
      if (preview.success) {
        expect(preview.data.agent.sessionId).toBeUndefined();
      }
    });

    it('includes CLAUDE.md and tools.json in the pack', async () => {
      await scaffoldAgentDir(tmpDir, MOCK_AGENT.id);
      const packPath = path.join(tmpDir, 'test.agentpack');

      await exporter.export(tmpDir, MOCK_AGENT, packPath);
      const preview = await exporter.preview(packPath);

      if (preview.success) {
        expect(preview.data.claudeMd).toContain('test-frontend CLAUDE.md');
        expect(preview.data.toolsJson).toContain('builtinTools');
      }
    });

    it('includes memory summary in the pack', async () => {
      await scaffoldAgentDir(tmpDir, MOCK_AGENT.id);
      const packPath = path.join(tmpDir, 'test.agentpack');

      await exporter.export(tmpDir, MOCK_AGENT, packPath);
      const preview = await exporter.preview(packPath);

      if (preview.success) {
        expect(preview.data.memorySummary).toContain('Decisions');
      }
    });

    it('sets version to 1.0', async () => {
      await scaffoldAgentDir(tmpDir, MOCK_AGENT.id);
      const packPath = path.join(tmpDir, 'test.agentpack');

      await exporter.export(tmpDir, MOCK_AGENT, packPath);
      const preview = await exporter.preview(packPath);

      if (preview.success) {
        expect(preview.data.version).toBe('1.0');
      }
    });

    it('returns error when output directory does not exist', async () => {
      const packPath = path.join(tmpDir, 'nonexistent', 'test.agentpack');
      const result = await exporter.export(tmpDir, MOCK_AGENT, packPath);
      expect(result.success).toBe(false);
    });

    it('gracefully handles missing CLAUDE.md (empty string)', async () => {
      // No scaffolding — agent dir does not exist
      const packPath = path.join(tmpDir, 'test.agentpack');
      const result = await exporter.export(tmpDir, MOCK_AGENT, packPath);
      // Completes successfully but with empty strings
      expect(result.success).toBe(true);
      const preview = await exporter.preview(packPath);
      if (preview.success) {
        expect(preview.data.claudeMd).toBe('');
        expect(preview.data.toolsJson).toBe('');
      }
    });
  });

  describe('preview', () => {
    it('returns the pack without importing anything', async () => {
      await scaffoldAgentDir(tmpDir, MOCK_AGENT.id);
      const packPath = path.join(tmpDir, 'test.agentpack');
      await exporter.export(tmpDir, MOCK_AGENT, packPath);

      const result = await exporter.preview(packPath);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agent.id).toBe('test-frontend');
        expect(result.data.agent.name).toBe('Test Frontend');
      }
    });

    it('returns error for a non-existent file', async () => {
      const result = await exporter.preview(path.join(tmpDir, 'missing.agentpack'));
      expect(result.success).toBe(false);
    });

    it('returns error for a corrupt file', async () => {
      const badPath = path.join(tmpDir, 'bad.agentpack');
      await fs.writeFile(badPath, Buffer.from('not gzip data'));
      const result = await exporter.preview(badPath);
      expect(result.success).toBe(false);
    });
  });

  describe('import', () => {
    it('writes CLAUDE.md and tools.json to the target project', async () => {
      await scaffoldAgentDir(tmpDir, MOCK_AGENT.id);
      const packPath = path.join(tmpDir, 'test.agentpack');
      await exporter.export(tmpDir, MOCK_AGENT, packPath);

      const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-target-'));
      try {
        const result = await exporter.import(packPath, targetDir);
        expect(result.success).toBe(true);

        const claudeMd = await fs.readFile(
          path.join(targetDir, '.agent', 'agents', 'test-frontend', 'CLAUDE.md'),
          'utf-8',
        );
        expect(claudeMd).toContain('test-frontend CLAUDE.md');
      } finally {
        await fs.rm(targetDir, { recursive: true, force: true });
      }
    });

    it('supports agentIdOverride', async () => {
      await scaffoldAgentDir(tmpDir, MOCK_AGENT.id);
      const packPath = path.join(tmpDir, 'test.agentpack');
      await exporter.export(tmpDir, MOCK_AGENT, packPath);

      const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-override-'));
      try {
        const result = await exporter.import(packPath, targetDir, 'my-frontend');
        expect(result.success).toBe(true);

        const stat = await fs.stat(
          path.join(targetDir, '.agent', 'agents', 'my-frontend', 'CLAUDE.md'),
        );
        expect(stat.isFile()).toBe(true);
      } finally {
        await fs.rm(targetDir, { recursive: true, force: true });
      }
    });
  });
});
