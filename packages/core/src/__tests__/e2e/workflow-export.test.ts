// packages/core/src/__tests__/e2e/workflow-export.test.ts
// End-to-end tests for agent export/import (.agentpack round-trip).
// Uses a real temp directory and real AgentExporter.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentExporter } from '../../templates/AgentExporter';
import { TeamRegistry } from '../../registry/TeamRegistry';
import type { Agent } from '@vscode-ext/shared';
import { makeTempDir, cleanupTempDir, makeAgent } from './setup';

async function setupProjectWithAgent(rootDir: string, agent: Agent): Promise<void> {
  const registry = new TeamRegistry(rootDir);
  await registry.initProject('source-project');
  await registry.load();
  await registry.registerAgent(agent);
}

describe('Workflow: Agent Export / Import', () => {
  let srcDir: string;
  let targetDir: string;

  beforeEach(async () => {
    srcDir = await makeTempDir();
    targetDir = await makeTempDir();
  });
  afterEach(async () => {
    await cleanupTempDir(srcDir);
    await cleanupTempDir(targetDir);
  });

  // ─── Export ───────────────────────────────────────────────────────────────

  describe('export', () => {
    it('creates a .agentpack file at the specified output path', async () => {
      const agent = makeAgent({ id: 'my-frontend', name: 'My Frontend', role: 'UI work' });
      await setupProjectWithAgent(srcDir, agent);

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'my-frontend.agentpack');
      const result = await exporter.export(srcDir, agent, packPath);

      expect(result.success).toBe(true);
      const stat = await fs.stat(packPath);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeGreaterThan(0);
    });

    it('exported pack can be previewed without importing', async () => {
      const agent = makeAgent({ id: 'my-backend', name: 'My Backend', role: 'API dev' });
      await setupProjectWithAgent(srcDir, agent);

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'my-backend.agentpack');
      await exporter.export(srcDir, agent, packPath);

      const preview = await exporter.preview(packPath);
      expect(preview.success).toBe(true);
      if (preview.success) {
        expect(preview.data.agent.id).toBe('my-backend');
        expect(preview.data.agent.name).toBe('My Backend');
        expect(preview.data.version).toBe('1.0');
      }
    });

    it('strips sessionId from the exported agent config', async () => {
      const agent = makeAgent({
        id: 'session-agent',
        name: 'Session Agent',
        role: 'Test',
        sessionId: 'active-session-xyz',
      });
      await setupProjectWithAgent(srcDir, agent);

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'session-agent.agentpack');
      await exporter.export(srcDir, agent, packPath);

      const preview = await exporter.preview(packPath);
      expect(preview.success).toBe(true);
      if (preview.success) {
        expect(preview.data.agent.sessionId).toBeUndefined();
      }
    });

    it('includes CLAUDE.md content in the pack', async () => {
      const agent = makeAgent({ id: 'doc-agent', name: 'Doc Agent', role: 'Docs' });
      await setupProjectWithAgent(srcDir, agent);

      // Write custom CLAUDE.md content
      const claudePath = path.join(srcDir, '.agent', 'agents', 'doc-agent', 'CLAUDE.md');
      await fs.writeFile(claudePath, '# Doc Agent\n\nCustom documentation agent instructions.');

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'doc-agent.agentpack');
      await exporter.export(srcDir, agent, packPath);

      const preview = await exporter.preview(packPath);
      expect(preview.success).toBe(true);
      if (preview.success) {
        expect(preview.data.claudeMd).toContain('Custom documentation agent instructions');
      }
    });

    it('handles export gracefully when agent directory does not exist', async () => {
      const agent = makeAgent({ id: 'ghost', name: 'Ghost', role: 'Nonexistent' });
      // Do NOT register the agent — its directory does not exist

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'ghost.agentpack');

      // AgentExporter uses readSafe which returns '' for missing files — should succeed
      const result = await exporter.export(srcDir, agent, packPath);
      expect(result.success).toBe(true);
    });
  });

  // ─── Import ───────────────────────────────────────────────────────────────

  describe('import', () => {
    it('creates agent directory structure in the target project', async () => {
      const agent = makeAgent({ id: 'my-frontend', name: 'My Frontend', role: 'UI work' });
      await setupProjectWithAgent(srcDir, agent);

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'my-frontend.agentpack');
      await exporter.export(srcDir, agent, packPath);

      const importResult = await exporter.import(packPath, targetDir);
      expect(importResult.success).toBe(true);

      await expect(
        fs.access(path.join(targetDir, '.agent', 'agents', 'my-frontend', 'CLAUDE.md')),
      ).resolves.toBeUndefined();
    });

    it('tools.json is written to the target agent directory', async () => {
      const agent = makeAgent({ id: 'my-qa', name: 'My QA', role: 'Testing' });
      await setupProjectWithAgent(srcDir, agent);

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'my-qa.agentpack');
      await exporter.export(srcDir, agent, packPath);
      await exporter.import(packPath, targetDir);

      await expect(
        fs.access(path.join(targetDir, '.agent', 'agents', 'my-qa', 'tools.json')),
      ).resolves.toBeUndefined();
    });

    it('imported agent has sessionId stripped', async () => {
      const agent = makeAgent({
        id: 'import-agent',
        name: 'Import Agent',
        role: 'Test',
        sessionId: 'old-session',
      });
      await setupProjectWithAgent(srcDir, agent);

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'import-agent.agentpack');
      await exporter.export(srcDir, agent, packPath);

      const importResult = await exporter.import(packPath, targetDir);
      expect(importResult.success).toBe(true);
      if (importResult.success) {
        expect(importResult.data.agent.sessionId).toBeUndefined();
      }
    });

    it('agentIdOverride renames the agent on import', async () => {
      const agent = makeAgent({ id: 'original-id', name: 'Original', role: 'Test' });
      await setupProjectWithAgent(srcDir, agent);

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'original.agentpack');
      await exporter.export(srcDir, agent, packPath);
      await exporter.import(packPath, targetDir, 'renamed-id');

      await expect(
        fs.access(path.join(targetDir, '.agent', 'agents', 'renamed-id', 'CLAUDE.md')),
      ).resolves.toBeUndefined();

      // Original id directory must NOT be created
      await expect(
        fs.access(path.join(targetDir, '.agent', 'agents', 'original-id')),
      ).rejects.toThrow();
    });

    it('returns error when pack file does not exist', async () => {
      const exporter = new AgentExporter();
      const result = await exporter.import(
        path.join(srcDir, 'nonexistent.agentpack'),
        targetDir,
      );
      expect(result.success).toBe(false);
    });

    it('returns error for a corrupt (invalid) pack file', async () => {
      const corruptPath = path.join(srcDir, 'corrupt.agentpack');
      await fs.writeFile(corruptPath, 'this is not valid gzip data');

      const exporter = new AgentExporter();
      const result = await exporter.import(corruptPath, targetDir);
      expect(result.success).toBe(false);
    });
  });

  // ─── Full round-trip ──────────────────────────────────────────────────────

  describe('full round-trip: export from project A → import into project B', () => {
    it('agent config survives the round-trip intact', async () => {
      const agent: Agent = {
        id: 'security',
        name: 'Security Agent',
        role: 'Vulnerability auditing',
        model: 'claude-opus-4-6',
        maxTurns: 30,
        git: { canBranch: false, canCommit: false, canPush: false, canCreatePR: false, canMerge: false },
        approvalRequired: ['deleteFile', 'runScript', 'modifyCI'],
        builtinTools: ['Read', 'Grep', 'Bash', 'Glob'],
      };

      await setupProjectWithAgent(srcDir, agent);

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'security.agentpack');
      await exporter.export(srcDir, agent, packPath);

      const importResult = await exporter.import(packPath, targetDir);
      expect(importResult.success).toBe(true);

      if (importResult.success) {
        const imported = importResult.data.agent;
        expect(imported.id).toBe('security');
        expect(imported.name).toBe('Security Agent');
        expect(imported.role).toBe('Vulnerability auditing');
        expect(imported.model).toBe('claude-opus-4-6');
        expect(imported.maxTurns).toBe(30);
        expect(imported.approvalRequired).toContain('deleteFile');
        expect(imported.approvalRequired).toContain('runScript');
        expect(imported.builtinTools).toContain('Read');
        expect(imported.sessionId).toBeUndefined();
      }
    });

    it('CLAUDE.md content is preserved across the round-trip', async () => {
      const agent = makeAgent({ id: 'docs-agent', name: 'Docs Agent', role: 'Documentation' });
      await setupProjectWithAgent(srcDir, agent);

      const customContent = '# Docs Agent\n\nFocus on clear, accurate documentation.';
      await fs.writeFile(
        path.join(srcDir, '.agent', 'agents', 'docs-agent', 'CLAUDE.md'),
        customContent,
      );

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'docs-agent.agentpack');
      await exporter.export(srcDir, agent, packPath);
      await exporter.import(packPath, targetDir);

      const importedClaude = await fs.readFile(
        path.join(targetDir, '.agent', 'agents', 'docs-agent', 'CLAUDE.md'),
        'utf-8',
      );
      expect(importedClaude).toContain('Focus on clear, accurate documentation.');
    });

    it('memory summary is imported when present', async () => {
      const agent = makeAgent({ id: 'mem-agent', name: 'Mem Agent', role: 'Test' });
      await setupProjectWithAgent(srcDir, agent);

      // Write a memory file so it gets included in the export
      const memDir = path.join(srcDir, '.agent', 'agents', 'mem-agent', 'memory');
      await fs.mkdir(memDir, { recursive: true });
      await fs.writeFile(path.join(memDir, 'context.md'), '# Context\n\nThe app uses PostgreSQL.');

      const exporter = new AgentExporter();
      const packPath = path.join(srcDir, 'mem-agent.agentpack');
      await exporter.export(srcDir, agent, packPath);
      await exporter.import(packPath, targetDir);

      const importedMemPath = path.join(
        targetDir, '.agent', 'agents', 'mem-agent', 'memory', 'imported-summary.md',
      );
      const memContent = await fs.readFile(importedMemPath, 'utf-8');
      expect(memContent).toContain('PostgreSQL');
    });
  });
});
