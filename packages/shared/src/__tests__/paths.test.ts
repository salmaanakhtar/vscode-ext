import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  getAgentDir,
  getTeamConfigPath,
  getInboxPath,
  getAgentWorkDir,
  getAgentMemoryDir,
  getProjectMemoryDir,
  getAuditLogPath,
} from '../utils/paths';

describe('path utilities', () => {
  const root = '/projects/my-app';

  it('getAgentDir returns correct path', () => {
    expect(getAgentDir(root)).toBe(path.join(root, '.agent'));
  });

  it('getTeamConfigPath returns team.json path', () => {
    expect(getTeamConfigPath(root)).toBe(path.join(root, '.agent', 'team.json'));
  });

  it('getInboxPath returns correct inbox path', () => {
    expect(getInboxPath(root, 'frontend')).toBe(
      path.join(root, '.agent', 'inbox', 'frontend.md'),
    );
  });

  it('getAgentWorkDir uses team-lead dir for team-lead id', () => {
    expect(getAgentWorkDir(root, 'team-lead')).toBe(
      path.join(root, '.agent', 'team-lead'),
    );
  });

  it('getAgentWorkDir uses agents subdir for regular agents', () => {
    expect(getAgentWorkDir(root, 'frontend')).toBe(
      path.join(root, '.agent', 'agents', 'frontend'),
    );
  });

  it('getAgentMemoryDir returns correct memory dir', () => {
    expect(getAgentMemoryDir(root, 'frontend')).toBe(
      path.join(root, '.agent', 'agents', 'frontend', 'memory'),
    );
  });

  it('getProjectMemoryDir returns shared memory dir', () => {
    expect(getProjectMemoryDir(root)).toBe(path.join(root, '.agent', 'memory'));
  });

  it('getAuditLogPath returns audit.md path', () => {
    expect(getAuditLogPath(root)).toBe(path.join(root, '.agent', 'memory', 'audit.md'));
  });
});
