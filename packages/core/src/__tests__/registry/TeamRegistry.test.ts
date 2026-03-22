import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TeamRegistry } from '../../registry/TeamRegistry';
import type { Agent } from '@vscode-ext/shared';

describe('TeamRegistry', () => {
  let tmpDir: string;
  let registry: TeamRegistry;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-test-'));
    registry = new TeamRegistry(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeAgent = (id = 'frontend'): Agent => ({
    id,
    name: 'Frontend Agent',
    role: 'Frontend development',
    model: 'claude-sonnet-4-6',
    maxTurns: 20,
    git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
    approvalRequired: ['deleteFile'],
    builtinTools: ['Read', 'Write'],
  });

  // ─── initProject ──────────────────────────────────────────────

  it('initialises project directory structure', async () => {
    const result = await registry.initProject('test-app');
    expect(result.success).toBe(true);

    const agentDir = path.join(tmpDir, '.agent');
    await expect(fs.access(agentDir)).resolves.toBeUndefined();
    await expect(fs.access(path.join(agentDir, 'team.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(agentDir, 'CLAUDE.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(agentDir, 'PROJECT-INFO.md'))).resolves.toBeUndefined();
  });

  it('creates memory directory and files', async () => {
    await registry.initProject('test-app');
    const memDir = path.join(tmpDir, '.agent', 'memory');
    await expect(fs.access(memDir)).resolves.toBeUndefined();
    for (const f of ['decisions.md', 'context.md', 'tasks.md', 'audit.md']) {
      await expect(fs.access(path.join(memDir, f))).resolves.toBeUndefined();
    }
  });

  it('creates team-lead directory with CLAUDE.md, tools.json, and inbox', async () => {
    await registry.initProject('test-app');
    const leadDir = path.join(tmpDir, '.agent', 'team-lead');
    await expect(fs.access(path.join(leadDir, 'CLAUDE.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(leadDir, 'tools.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tmpDir, '.agent', 'inbox', 'team-lead.md'))).resolves.toBeUndefined();
  });

  it('does not overwrite existing team.json on re-init', async () => {
    await registry.initProject('test-app');
    const configPath = path.join(tmpDir, '.agent', 'team.json');
    const original = await fs.readFile(configPath, 'utf-8');

    // Re-initialise — should not overwrite
    await registry.initProject('test-app');
    const after = await fs.readFile(configPath, 'utf-8');
    expect(after).toBe(original);
  });

  // ─── load / save ──────────────────────────────────────────────

  it('loads team config after init', async () => {
    await registry.initProject('test-app');
    const result = await registry.load();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.project).toBe('test-app');
      expect(result.data.version).toBe('1.0');
    }
  });

  it('load returns error when file missing', async () => {
    const result = await registry.load();
    expect(result.success).toBe(false);
  });

  it('load returns error when team.json is invalid', async () => {
    await registry.initProject('test-app');
    const configPath = path.join(tmpDir, '.agent', 'team.json');
    await fs.writeFile(configPath, JSON.stringify({ version: '1.0' })); // missing required fields
    const result = await registry.load();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Invalid team.json');
    }
  });

  it('save returns error when no config loaded', async () => {
    const result = await registry.save();
    expect(result.success).toBe(false);
  });

  it('getConfig returns null before load', () => {
    expect(registry.getConfig()).toBeNull();
  });

  it('getConfig returns config after load', async () => {
    await registry.initProject('test-app');
    await registry.load();
    expect(registry.getConfig()).not.toBeNull();
    expect(registry.getConfig()?.project).toBe('test-app');
  });

  // ─── registerAgent ────────────────────────────────────────────

  it('registers an agent', async () => {
    await registry.initProject('test-app');
    await registry.load();
    const result = await registry.registerAgent(makeAgent());
    expect(result.success).toBe(true);
    expect(registry.getAgent('frontend')).not.toBeNull();
  });

  it('creates agent directory structure on registration', async () => {
    await registry.initProject('test-app');
    await registry.load();
    await registry.registerAgent(makeAgent());

    const agentDir = path.join(tmpDir, '.agent', 'agents', 'frontend');
    await expect(fs.access(path.join(agentDir, 'CLAUDE.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(agentDir, 'tools.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(agentDir, 'memory'))).resolves.toBeUndefined();
  });

  it('creates agent inbox on registration', async () => {
    await registry.initProject('test-app');
    await registry.load();
    await registry.registerAgent(makeAgent());
    const inboxPath = path.join(tmpDir, '.agent', 'inbox', 'frontend.md');
    await expect(fs.access(inboxPath)).resolves.toBeUndefined();
  });

  it('persists agent to team.json on registration', async () => {
    await registry.initProject('test-app');
    await registry.load();
    await registry.registerAgent(makeAgent());

    // Fresh registry from disk
    const r2 = new TeamRegistry(tmpDir);
    const loadResult = await r2.load();
    expect(loadResult.success).toBe(true);
    expect(r2.getAgent('frontend')).not.toBeNull();
  });

  it('rejects duplicate agent id', async () => {
    await registry.initProject('test-app');
    await registry.load();
    await registry.registerAgent(makeAgent());
    const result = await registry.registerAgent(makeAgent());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('already exists');
    }
  });

  it('registerAgent returns error when no config loaded', async () => {
    const result = await registry.registerAgent(makeAgent());
    expect(result.success).toBe(false);
  });

  // ─── removeAgent ──────────────────────────────────────────────

  it('removes an agent', async () => {
    await registry.initProject('test-app');
    await registry.load();
    await registry.registerAgent(makeAgent());
    await registry.removeAgent('frontend');
    expect(registry.getAgent('frontend')).toBeNull();
  });

  it('removeAgent persists to disk', async () => {
    await registry.initProject('test-app');
    await registry.load();
    await registry.registerAgent(makeAgent());
    await registry.removeAgent('frontend');

    const r2 = new TeamRegistry(tmpDir);
    await r2.load();
    expect(r2.getAgent('frontend')).toBeNull();
  });

  it('removeAgent returns error when no config loaded', async () => {
    const result = await registry.removeAgent('frontend');
    expect(result.success).toBe(false);
  });

  // ─── updateAgent ──────────────────────────────────────────────

  it('updates an agent', async () => {
    await registry.initProject('test-app');
    await registry.load();
    await registry.registerAgent(makeAgent());
    const result = await registry.updateAgent('frontend', { name: 'Updated Frontend' });
    expect(result.success).toBe(true);
    expect(registry.getAgent('frontend')?.name).toBe('Updated Frontend');
  });

  it('updateAgent returns error when agent not found', async () => {
    await registry.initProject('test-app');
    await registry.load();
    const result = await registry.updateAgent('nonexistent', { name: 'X' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Agent not found');
    }
  });

  it('updateAgent returns error when no config loaded', async () => {
    const result = await registry.updateAgent('frontend', { name: 'X' });
    expect(result.success).toBe(false);
  });

  // ─── getAllAgents ──────────────────────────────────────────────

  it('getAllAgents returns empty array before load', () => {
    expect(registry.getAllAgents()).toEqual([]);
  });

  it('getAllAgents returns all registered agents', async () => {
    await registry.initProject('test-app');
    await registry.load();
    await registry.registerAgent(makeAgent('agent-a'));
    await registry.registerAgent(makeAgent('agent-b'));
    expect(registry.getAllAgents()).toHaveLength(2);
  });

  // ─── isInitialised ────────────────────────────────────────────

  it('isInitialised returns false before init', async () => {
    expect(await registry.isInitialised()).toBe(false);
  });

  it('isInitialised returns true after init', async () => {
    await registry.initProject('test-app');
    expect(await registry.isInitialised()).toBe(true);
  });

  // ─── file readers ─────────────────────────────────────────────

  it('readProjectInfo returns content after init', async () => {
    await registry.initProject('my-project');
    const content = await registry.readProjectInfo();
    expect(content).toContain('my-project');
  });

  it('readProjectInfo returns empty string when missing', async () => {
    const content = await registry.readProjectInfo();
    expect(content).toBe('');
  });

  it('readProjectClaude returns content after init', async () => {
    await registry.initProject('test-app');
    const content = await registry.readProjectClaude();
    expect(content).toContain('Shared Agent Instructions');
  });

  it('readProjectClaude returns empty string when missing', async () => {
    const content = await registry.readProjectClaude();
    expect(content).toBe('');
  });

  it('readAgentClaude returns content after registration', async () => {
    await registry.initProject('test-app');
    await registry.load();
    await registry.registerAgent(makeAgent());
    const content = await registry.readAgentClaude('frontend');
    expect(content).toContain('Frontend Agent');
  });

  it('readAgentClaude returns empty string for unknown agent', async () => {
    const content = await registry.readAgentClaude('nobody');
    expect(content).toBe('');
  });
});
