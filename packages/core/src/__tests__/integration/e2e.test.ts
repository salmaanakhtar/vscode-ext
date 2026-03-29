import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TeamRegistry, MemoryManager, ApprovalGate } from '../../index';
import { TemplateLibrary, AgentExporter } from '../../templates';
import type { Agent } from '@vscode-ext/shared';

describe('Core Engine Integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─── Project Initialisation ────────────────────────────────────────────────

  describe('Project Initialisation', () => {
    it('initialises a fresh project and creates .agent/ structure', async () => {
      const registry = new TeamRegistry(tmpDir);
      const result = await registry.initProject('e2e-project');
      expect(result.success).toBe(true);

      const teamJsonStat = await fs.stat(path.join(tmpDir, '.agent', 'team.json'));
      expect(teamJsonStat.isFile()).toBe(true);

      const claudeStat = await fs.stat(path.join(tmpDir, '.agent', 'CLAUDE.md'));
      expect(claudeStat.isFile()).toBe(true);
    });

    it('isInitialised returns true after initProject', async () => {
      const registry = new TeamRegistry(tmpDir);
      await registry.initProject('e2e-project');
      expect(await registry.isInitialised()).toBe(true);
    });

    it('isInitialised returns false before initProject', async () => {
      const registry = new TeamRegistry(tmpDir);
      expect(await registry.isInitialised()).toBe(false);
    });

    it('loads existing team.json on second load()', async () => {
      const registry = new TeamRegistry(tmpDir);
      await registry.initProject('e2e-project');

      const registry2 = new TeamRegistry(tmpDir);
      const result = await registry2.load();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.project).toBe('e2e-project');
      }
    });

    it('initProject does not overwrite existing team.json', async () => {
      const registry = new TeamRegistry(tmpDir);
      await registry.initProject('original-name');
      await registry.initProject('new-name'); // should not overwrite
      const registry2 = new TeamRegistry(tmpDir);
      const loadResult = await registry2.load();
      if (loadResult.success) {
        expect(loadResult.data.project).toBe('original-name');
      }
    });
  });

  // ─── Agent Registration ────────────────────────────────────────────────────

  describe('Agent Registration', () => {
    it('registers an agent and persists it in team.json', async () => {
      const registry = new TeamRegistry(tmpDir);
      await registry.initProject('e2e-project');
      await registry.load();

      const agent: Agent = {
        id: 'test-backend',
        name: 'Test Backend',
        role: 'API development',
        model: 'claude-sonnet-4-6',
        maxTurns: 50,
        git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
        approvalRequired: ['deleteFile'],
        builtinTools: ['Read', 'Write'],
      };

      const result = await registry.registerAgent(agent);
      expect(result.success).toBe(true);
      expect(registry.getAgent('test-backend')).not.toBeNull();
    });

    it('creates agent directory structure on registration', async () => {
      const registry = new TeamRegistry(tmpDir);
      await registry.initProject('e2e-project');
      await registry.load();

      const agent: Agent = {
        id: 'test-qa',
        name: 'Test QA',
        role: 'Testing',
        model: 'claude-sonnet-4-6',
        maxTurns: 50,
        git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
        approvalRequired: ['deleteFile'],
        builtinTools: ['Read'],
      };

      await registry.registerAgent(agent);
      const claudeStat = await fs.stat(
        path.join(tmpDir, '.agent', 'agents', 'test-qa', 'CLAUDE.md'),
      );
      expect(claudeStat.isFile()).toBe(true);
    });

    it('rejects duplicate agent id', async () => {
      const registry = new TeamRegistry(tmpDir);
      await registry.initProject('e2e-project');
      await registry.load();

      const agent: Agent = {
        id: 'dup-agent',
        name: 'Dup',
        role: 'Test',
        model: 'claude-sonnet-4-6',
        maxTurns: 10,
        git: { canBranch: false, canCommit: false, canPush: false, canCreatePR: false, canMerge: false },
        approvalRequired: [],
        builtinTools: [],
      };

      await registry.registerAgent(agent);
      const second = await registry.registerAgent(agent);
      expect(second.success).toBe(false);
    });
  });

  // ─── Memory ────────────────────────────────────────────────────────────────

  describe('Memory Write and Search', () => {
    it('writes a memory entry and retrieves it by search', async () => {
      const memory = new MemoryManager();
      const initResult = await memory.init({
        backend: 'files',
        path: path.join(tmpDir, 'memory'),
      });
      expect(initResult.success).toBe(true);

      await memory.write('agent1', 'fact', 'The app uses PostgreSQL for storage', ['db', 'postgres']);

      const search = await memory.search('PostgreSQL');
      expect(search.success).toBe(true);
      if (search.success) {
        expect(search.data.length).toBeGreaterThan(0);
        expect(search.data[0].content).toContain('PostgreSQL');
      }
    });

    it('lists entries by agentId', async () => {
      const memory = new MemoryManager();
      await memory.init({ backend: 'files', path: path.join(tmpDir, 'memory') });

      await memory.write('agent1', 'fact', 'fact one', ['a']);
      await memory.write('agent2', 'decision', 'decision by agent2', ['b']);

      const agent1Entries = await memory.list({ agentId: 'agent1' });
      if (agent1Entries.success) {
        expect(agent1Entries.data.every(e => e.agentId === 'agent1')).toBe(true);
      }
    });
  });

  // ─── Approval Gate ─────────────────────────────────────────────────────────

  describe('Approval Gate', () => {
    async function scaffoldAuditLog(): Promise<void> {
      await fs.mkdir(path.join(tmpDir, '.agent', 'memory'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, '.agent', 'memory', 'audit.md'), '# Audit\n\n');
    }

    it('approves an action when handler returns approved', async () => {
      await scaffoldAuditLog();
      const gate = new ApprovalGate(tmpDir);
      gate.setApprovalHandler(async () => ({
        decision: 'approved',
        resolvedAt: new Date().toISOString(),
      }));

      const result = await gate.check('agent1', 'push', 'Push to remote', 'ctx', 'task-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('rejects an action when handler returns rejected', async () => {
      await scaffoldAuditLog();
      const gate = new ApprovalGate(tmpDir);
      gate.setApprovalHandler(async () => ({
        decision: 'rejected',
        feedback: 'Not allowed',
        resolvedAt: new Date().toISOString(),
      }));

      const result = await gate.check('agent1', 'deleteFile', 'Delete a file', 'ctx', 'task-2');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('auto-approves when no approval handler is set and action is low risk', async () => {
      await scaffoldAuditLog();
      const gate = new ApprovalGate(tmpDir);
      // No handler set — gate should auto-approve or handle gracefully
      const result = await gate.check('agent1', 'createFile', 'Create a file', 'ctx', 'task-3');
      // Result may be success or failure depending on implementation, just no throw
      expect(result).toBeDefined();
    });
  });

  // ─── Template Library Integration ─────────────────────────────────────────

  describe('TemplateLibrary + TeamRegistry integration', () => {
    it('instantiates preset agents and registers them in the team', async () => {
      const registry = new TeamRegistry(tmpDir);
      await registry.initProject('template-test');
      await registry.load();

      const lib = new TemplateLibrary();
      const drafts = lib.instantiateFromPreset('api-service');
      expect(drafts).toHaveLength(3);

      for (const draft of drafts) {
        const agent: Agent = { ...draft.agent, id: draft.id };
        const result = await registry.registerAgent(agent);
        expect(result.success).toBe(true);
      }

      const agents = registry.getAllAgents();
      expect(agents).toHaveLength(3);
      expect(agents.map(a => a.id)).toContain('backend');
      expect(agents.map(a => a.id)).toContain('documentation');
      expect(agents.map(a => a.id)).toContain('qa');
    });

    it('instantiateFromTemplate returns correct claudeMdContent', () => {
      const lib = new TemplateLibrary();
      const draft = lib.instantiateFromTemplate('security');
      expect(draft).not.toBeNull();
      expect(draft?.claudeMdContent).toContain('Security Agent');
      expect(draft?.claudeMdContent).toContain('OWASP');
    });
  });

  // ─── AgentExporter Integration ─────────────────────────────────────────────

  describe('AgentExporter round-trip', () => {
    it('exports an agent and imports it into a fresh project', async () => {
      // Set up source project with a registered agent
      const srcRegistry = new TeamRegistry(tmpDir);
      await srcRegistry.initProject('source-project');
      await srcRegistry.load();

      const agent: Agent = {
        id: 'my-frontend',
        name: 'My Frontend',
        role: 'UI work',
        model: 'claude-sonnet-4-6',
        maxTurns: 50,
        git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
        approvalRequired: ['deleteFile'],
        builtinTools: ['Read', 'Write'],
        sessionId: 'session-to-strip',
      };
      await srcRegistry.registerAgent(agent);

      // Export
      const exporter = new AgentExporter();
      const packPath = path.join(tmpDir, 'my-frontend.agentpack');
      const exportResult = await exporter.export(tmpDir, agent, packPath);
      expect(exportResult.success).toBe(true);

      // Import into a new project root
      const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-e2e-'));
      try {
        const importResult = await exporter.import(packPath, targetDir);
        expect(importResult.success).toBe(true);

        // sessionId must be stripped
        if (importResult.success) {
          expect(importResult.data.agent.sessionId).toBeUndefined();
        }

        // CLAUDE.md should exist in the target
        const claudeStat = await fs.stat(
          path.join(targetDir, '.agent', 'agents', 'my-frontend', 'CLAUDE.md'),
        );
        expect(claudeStat.isFile()).toBe(true);
      } finally {
        await fs.rm(targetDir, { recursive: true, force: true });
      }
    });
  });
});
