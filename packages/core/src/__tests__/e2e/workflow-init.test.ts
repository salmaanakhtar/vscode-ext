// packages/core/src/__tests__/e2e/workflow-init.test.ts
// End-to-end tests for the project initialisation workflow.
// Uses a real temp directory and real TeamRegistry + TemplateLibrary.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TeamRegistry } from '../../registry/TeamRegistry';
import { TemplateLibrary } from '../../templates/TemplateLibrary';
import type { Agent } from '@vscode-ext/shared';
import { makeTempDir, cleanupTempDir, makeAgent } from './setup';

describe('Workflow: Project Initialisation', () => {
  let tmpDir: string;

  beforeEach(async () => { tmpDir = await makeTempDir(); });
  afterEach(async () => { await cleanupTempDir(tmpDir); });

  // ─── Directory structure ───────────────────────────────────────────────────

  it('creates the full .agent/ directory structure', async () => {
    const registry = new TeamRegistry(tmpDir);
    const result = await registry.initProject('my-app');

    expect(result.success).toBe(true);
    await expect(fs.access(path.join(tmpDir, '.agent'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tmpDir, '.agent', 'team.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tmpDir, '.agent', 'CLAUDE.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tmpDir, '.agent', 'PROJECT-INFO.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tmpDir, '.agent', 'memory'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tmpDir, '.agent', 'memory', 'audit.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tmpDir, '.agent', 'inbox'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tmpDir, '.agent', 'agents'))).resolves.toBeUndefined();
  });

  it('team.json contains the project name and default team lead', async () => {
    const registry = new TeamRegistry(tmpDir);
    await registry.initProject('api-service');

    const raw = await fs.readFile(path.join(tmpDir, '.agent', 'team.json'), 'utf-8');
    const config = JSON.parse(raw) as { project: string; teamLead: object; agents: unknown[] };

    expect(config.project).toBe('api-service');
    expect(config.teamLead).toBeDefined();
    expect(config.agents).toHaveLength(0);
  });

  // ─── isInitialised ─────────────────────────────────────────────────────────

  it('isInitialised returns false before initProject', async () => {
    const registry = new TeamRegistry(tmpDir);
    expect(await registry.isInitialised()).toBe(false);
  });

  it('isInitialised returns true after initProject', async () => {
    const registry = new TeamRegistry(tmpDir);
    await registry.initProject('my-app');
    expect(await registry.isInitialised()).toBe(true);
  });

  it('isInitialised returns false for a non-existent directory', async () => {
    const registry = new TeamRegistry(path.join(tmpDir, 'no-such-dir'));
    expect(await registry.isInitialised()).toBe(false);
  });

  // ─── Loading existing state ────────────────────────────────────────────────

  it('second registry instance loads the same team.json', async () => {
    const registry1 = new TeamRegistry(tmpDir);
    await registry1.initProject('my-app');

    const registry2 = new TeamRegistry(tmpDir);
    const result = await registry2.load();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.project).toBe('my-app');
    }
  });

  it('second initProject call does not overwrite existing team.json', async () => {
    const registry = new TeamRegistry(tmpDir);
    await registry.initProject('original-name');
    await registry.initProject('new-name'); // must not overwrite

    const registry2 = new TeamRegistry(tmpDir);
    const result = await registry2.load();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.project).toBe('original-name');
    }
  });

  // ─── Error handling ────────────────────────────────────────────────────────

  it('load returns an error for corrupt team.json', async () => {
    const registry = new TeamRegistry(tmpDir);
    await registry.initProject('my-app');
    await fs.writeFile(path.join(tmpDir, '.agent', 'team.json'), '{ bad json >>>');

    const registry2 = new TeamRegistry(tmpDir);
    const result = await registry2.load();
    expect(result.success).toBe(false);
  });

  it('load returns an error when team.json is missing', async () => {
    const registry = new TeamRegistry(tmpDir);
    const result = await registry.load();
    expect(result.success).toBe(false);
  });

  // ─── Agent registration ────────────────────────────────────────────────────

  it('registerAgent creates the agent directory and CLAUDE.md', async () => {
    const registry = new TeamRegistry(tmpDir);
    await registry.initProject('my-app');
    await registry.load();

    const agent = makeAgent({ id: 'my-backend', name: 'My Backend', role: 'API dev' });
    const result = await registry.registerAgent(agent);

    expect(result.success).toBe(true);
    await expect(
      fs.access(path.join(tmpDir, '.agent', 'agents', 'my-backend', 'CLAUDE.md')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(tmpDir, '.agent', 'agents', 'my-backend', 'tools.json')),
    ).resolves.toBeUndefined();
  });

  it('registerAgent persists agent in team.json', async () => {
    const registry = new TeamRegistry(tmpDir);
    await registry.initProject('my-app');
    await registry.load();

    const agent = makeAgent({ id: 'persisted', name: 'Persisted Agent', role: 'Testing' });
    await registry.registerAgent(agent);

    const registry2 = new TeamRegistry(tmpDir);
    const loadResult = await registry2.load();
    expect(loadResult.success).toBe(true);
    if (loadResult.success) {
      expect(loadResult.data.agents.map(a => a.id)).toContain('persisted');
    }
  });

  it('registerAgent rejects duplicate agent IDs', async () => {
    const registry = new TeamRegistry(tmpDir);
    await registry.initProject('my-app');
    await registry.load();

    const agent = makeAgent({ id: 'dup', name: 'Dup Agent', role: 'Test' });
    await registry.registerAgent(agent);
    const second = await registry.registerAgent(agent);

    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.error.message).toContain('already exists');
    }
  });

  // ─── Template + registry integration ──────────────────────────────────────

  it('api-service preset registers backend, documentation, and qa agents', async () => {
    const registry = new TeamRegistry(tmpDir);
    await registry.initProject('api-app');
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
    expect(agents.map(a => a.id)).toContain('backend');
    expect(agents.map(a => a.id)).toContain('documentation');
    expect(agents.map(a => a.id)).toContain('qa');
  });

  it('fullstack-web preset registers 4 agents', async () => {
    const registry = new TeamRegistry(tmpDir);
    await registry.initProject('webapp');
    await registry.load();

    const lib = new TemplateLibrary();
    const drafts = lib.instantiateFromPreset('fullstack-web');
    expect(drafts).toHaveLength(4);

    for (const draft of drafts) {
      const agent: Agent = { ...draft.agent, id: draft.id };
      await registry.registerAgent(agent);
    }

    expect(registry.getAllAgents()).toHaveLength(4);
  });
});
