import { describe, it, expect } from 'vitest';
import { validateTeamConfig, validateAgent } from '../utils/validation';

describe('validateTeamConfig', () => {
  it('returns errors for empty config', () => {
    const errors = validateTeamConfig({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns error for non-object input', () => {
    expect(validateTeamConfig(null)).toEqual([{ field: 'root', message: 'Config must be an object' }]);
    expect(validateTeamConfig('string')).toEqual([{ field: 'root', message: 'Config must be an object' }]);
  });

  it('returns no errors for valid config', () => {
    const config = {
      version: '1.0',
      project: 'test',
      teamLead: { model: 'claude-sonnet-4-6', maxTurns: 30 },
      agents: [],
      memory: { backend: 'files', path: '.agent/memory' },
      git: { defaultBranch: 'main', agentBranchPrefix: 'agent', requireReviewBeforeMerge: true },
    };
    expect(validateTeamConfig(config)).toHaveLength(0);
  });

  it('validates nested agents', () => {
    const config = {
      version: '1.0',
      project: 'test',
      teamLead: { model: 'claude-sonnet-4-6', maxTurns: 30 },
      agents: [{ id: 'bad-agent' }], // missing required fields
      memory: { backend: 'files', path: '.agent/memory' },
      git: { defaultBranch: 'main', agentBranchPrefix: 'agent', requireReviewBeforeMerge: true },
    };
    const errors = validateTeamConfig(config);
    expect(errors.some(e => e.field.startsWith('agents[0]'))).toBe(true);
  });
});

describe('validateAgent', () => {
  it('returns errors for missing required fields', () => {
    expect(validateAgent({})).not.toHaveLength(0);
  });

  it('returns error for non-object input', () => {
    expect(validateAgent(null)).toEqual([{ field: 'root', message: 'Agent must be an object' }]);
  });

  it('validates a complete agent', () => {
    const agent = {
      id: 'frontend',
      name: 'Frontend Agent',
      model: 'claude-sonnet-4-6',
      maxTurns: 20,
      git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
      approvalRequired: ['deleteFile'],
      builtinTools: ['Read', 'Write'],
    };
    expect(validateAgent(agent)).toHaveLength(0);
  });

  it('flags missing model', () => {
    const agent = {
      id: 'frontend',
      name: 'Frontend Agent',
      maxTurns: 20,
      git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
      approvalRequired: [],
      builtinTools: [],
    };
    const errors = validateAgent(agent);
    expect(errors.some(e => e.field === 'model')).toBe(true);
  });
});
