// packages/shared/src/constants/index.ts

export const AGENT_DIR = '.agent';
export const TEAM_CONFIG_FILE = 'team.json';
export const PROJECT_INFO_FILE = 'PROJECT-INFO.md';
export const PROJECT_CLAUDE_FILE = 'CLAUDE.md';
export const TEAM_LEAD_ID = 'team-lead';
export const INBOX_DIR = 'inbox';
export const MEMORY_DIR = 'memory';
export const AGENTS_DIR = 'agents';

export const RISK_LEVEL_MAP: Record<string, import('../types').RiskLevel> = {
  deleteFile: 'high',
  forcePush: 'high',
  modifyCI: 'high',
  push: 'medium',
  runScript: 'medium',
  modifyConfig: 'medium',
  installPackage: 'low',
  createFile: 'low',
};

export const DEFAULT_TEAM_LEAD_CONFIG = {
  model: 'claude-sonnet-4-6' as const,
  maxTurns: 30,
};

export const DEFAULT_GIT_CONFIG = {
  defaultBranch: 'main',
  agentBranchPrefix: 'agent',
  requireReviewBeforeMerge: true,
};

export const DEFAULT_MEMORY_CONFIG = {
  backend: 'files' as const,
  path: '.agent/memory',
};

export const SUPPORTED_BUILTIN_TOOLS = [
  'Read', 'Write', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
] as const;

export const TEAM_VERSION = '1.0';
