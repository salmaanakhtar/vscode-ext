# Phase 1.2 — Shared Types & Interfaces

> Read CLAUDE.md and PROGRESS.md before starting.
> Phase 1.1 (monorepo scaffold) must be complete before this phase.

---

## Goal

Implement all shared TypeScript types, interfaces, constants, and utilities in `packages/shared`. This package is the contract layer that both `core` and `extension` depend on. Getting these types right now prevents breaking changes later.

---

## Branch

```bash
git checkout main && git pull origin main
git checkout -b phase/1.2-shared-types
```

---

## Deliverables

### 1. `packages/shared/src/types/index.ts`

Implement ALL types exactly as defined in CLAUDE.md. Do not abbreviate or simplify. Every field matters.

```typescript
// packages/shared/src/types/index.ts

export type RiskAction =
  | 'deleteFile'
  | 'push'
  | 'runScript'
  | 'modifyConfig'
  | 'installPackage'
  | 'createFile'
  | 'forcePush'
  | 'modifyCI';

export type RiskLevel = 'auto' | 'low' | 'medium' | 'high';

export type AgentModel =
  | 'claude-opus-4-6'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001';

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'complete'
  | 'failed';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'modified';

export type MemoryEntryType =
  | 'decision'
  | 'context'
  | 'task_summary'
  | 'preference'
  | 'fact';

export type MemoryBackend = 'files' | 'sqlite' | 'custom';

export interface GitPermissions {
  canBranch: boolean;
  canCommit: boolean;
  canPush: boolean;
  canCreatePR: boolean;
  canMerge: boolean;
}

export interface MCPServerConfig {
  name: string;
  url: string;
  allowedTools: string[];
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  model: AgentModel;
  template?: string;
  maxTurns: number; // max CLI turns per task (replaces maxBudgetUsd — no per-call billing in subscription mode)
  sessionId?: string;
  git: GitPermissions;
  approvalRequired: RiskAction[];
  mcpServers?: MCPServerConfig[];
  builtinTools: string[];
}

export interface TeamLeadConfig {
  model: AgentModel;
  maxTurns: number; // max CLI turns per task (replaces maxBudgetUsd — no per-call billing in subscription mode)
  sessionId?: string;
}

export interface MemoryConfig {
  backend: MemoryBackend;
  path: string;
  customAdapterPath?: string;
}

export interface GlobalGitConfig {
  defaultBranch: string;
  agentBranchPrefix: string;
  requireReviewBeforeMerge: boolean;
}

export interface TeamConfig {
  version: string;
  project: string;
  teamLead: TeamLeadConfig;
  agents: Agent[];
  memory: MemoryConfig;
  git: GlobalGitConfig;
}

export interface Task {
  id: string;
  agentId: string;
  prompt: string;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
  result?: string;
  cost?: number;
  error?: string;
}

export interface ApprovalResolution {
  decision: 'approved' | 'rejected' | 'modified';
  modifiedParams?: Record<string, unknown>;
  feedback?: string;
  resolvedAt: string;
}

export interface ApprovalRequest {
  id: string;
  agentId: string;
  taskId: string;
  action: RiskAction;
  riskLevel: RiskLevel;
  description: string;
  context: string;
  requestedAt: string;
  status: ApprovalStatus;
  resolution?: ApprovalResolution;
}

export interface MemoryEntry {
  id: string;
  agentId: string | 'project';
  type: MemoryEntryType;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string | 'all';
  taskId?: string;
  subject: string;
  body: string;
  sentAt: string;
  readAt?: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  role: string;
  description: string;
  defaultModel: AgentModel;
  defaultTools: string[];
  defaultMcpServers?: MCPServerConfig[];
  claudeMdTemplate: string;
  defaultApprovalRequired: RiskAction[];
  defaultGitPermissions: GitPermissions;
}

export interface TeamPreset {
  id: string;
  name: string;
  description: string;
  agentTemplateIds: string[];
}

export interface AgentStatus {
  agentId: string;
  state: 'idle' | 'thinking' | 'writing' | 'awaiting_approval' | 'error' | 'offline';
  currentTaskId?: string;
  lastActivityAt: string;
  sessionActive: boolean;
  tokensUsed: number;
  costUsd: number;
}

export interface ProjectInfo {
  name: string;
  description: string;
  techStack: string[];
  rootPath: string;
  agentDirPath: string;
}

// Result type — used throughout core package
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };
```

### 2. `packages/shared/src/interfaces/MemoryAdapter.ts`

```typescript
// packages/shared/src/interfaces/MemoryAdapter.ts

import type { MemoryConfig, MemoryEntry } from '../types';

export interface MemoryAdapter {
  /**
   * Initialise the backend. Called once on startup.
   * Should create directories, tables, or any required infrastructure.
   */
  init(config: MemoryConfig): Promise<void>;

  /**
   * Write a memory entry. If an entry with the same id exists, overwrite it.
   */
  write(entry: MemoryEntry): Promise<void>;

  /**
   * Read a specific entry by ID. Returns null if not found.
   */
  read(id: string): Promise<MemoryEntry | null>;

  /**
   * List entries with optional filtering.
   */
  list(filter?: {
    agentId?: string;
    type?: MemoryEntry['type'];
    tags?: string[];
    limit?: number;
    since?: string; // ISO timestamp
  }): Promise<MemoryEntry[]>;

  /**
   * Search entries by content. Implementation varies by backend.
   * File backend: substring match. SQLite: FTS5.
   */
  search(query: string, agentId?: string): Promise<MemoryEntry[]>;

  /**
   * Delete a memory entry by ID.
   */
  delete(id: string): Promise<void>;

  /**
   * Summarise and compact old entries for an agent.
   * Called at the end of an agent session to keep memory lean.
   */
  compact(agentId: string): Promise<void>;
}
```

### 3. `packages/shared/src/constants/index.ts`

```typescript
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
```

### 4. `packages/shared/src/utils/paths.ts`

```typescript
// packages/shared/src/utils/paths.ts

import * as path from 'path';
import { AGENT_DIR, AGENTS_DIR, INBOX_DIR, MEMORY_DIR, TEAM_LEAD_ID } from '../constants';

export function getAgentDir(projectRoot: string): string {
  return path.join(projectRoot, AGENT_DIR);
}

export function getTeamConfigPath(projectRoot: string): string {
  return path.join(projectRoot, AGENT_DIR, 'team.json');
}

export function getProjectClaudePath(projectRoot: string): string {
  return path.join(projectRoot, AGENT_DIR, 'CLAUDE.md');
}

export function getProjectInfoPath(projectRoot: string): string {
  return path.join(projectRoot, AGENT_DIR, 'PROJECT-INFO.md');
}

export function getProjectMemoryDir(projectRoot: string): string {
  return path.join(projectRoot, AGENT_DIR, MEMORY_DIR);
}

export function getAgentDir2(projectRoot: string, agentId: string): string {
  if (agentId === TEAM_LEAD_ID) {
    return path.join(projectRoot, AGENT_DIR, TEAM_LEAD_ID);
  }
  return path.join(projectRoot, AGENT_DIR, AGENTS_DIR, agentId);
}

export function getAgentClaudePath(projectRoot: string, agentId: string): string {
  return path.join(getAgentDir2(projectRoot, agentId), 'CLAUDE.md');
}

export function getAgentMemoryDir(projectRoot: string, agentId: string): string {
  return path.join(getAgentDir2(projectRoot, agentId), MEMORY_DIR);
}

export function getAgentToolsPath(projectRoot: string, agentId: string): string {
  return path.join(getAgentDir2(projectRoot, agentId), 'tools.json');
}

export function getInboxPath(projectRoot: string, agentId: string): string {
  return path.join(projectRoot, AGENT_DIR, INBOX_DIR, `${agentId}.md`);
}

export function getAuditLogPath(projectRoot: string): string {
  return path.join(projectRoot, AGENT_DIR, MEMORY_DIR, 'audit.md');
}

export function getErrorLogPath(projectRoot: string): string {
  return path.join(projectRoot, AGENT_DIR, MEMORY_DIR, 'errors.log');
}
```

### 5. `packages/shared/src/utils/id.ts`

```typescript
// packages/shared/src/utils/id.ts

import { randomBytes } from 'crypto';

export function generateId(prefix?: string): string {
  const random = randomBytes(8).toString('hex');
  const timestamp = Date.now().toString(36);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

export function generateTaskId(): string {
  return generateId('task');
}

export function generateMemoryId(): string {
  return generateId('mem');
}

export function generateApprovalId(): string {
  return generateId('appr');
}

export function generateMessageId(): string {
  return generateId('msg');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 50);
}
```

### 6. `packages/shared/src/utils/logger.ts`

```typescript
// packages/shared/src/utils/logger.ts
// This replaces console.log everywhere. Never use console.log directly.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

type LogHandler = (entry: LogEntry) => void;

class Logger {
  private handlers: LogHandler[] = [];
  private minLevel: LogLevel = 'info';

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  addHandler(handler: LogHandler): void {
    this.handlers.push(handler);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const entry: LogEntry = { level, message, context, timestamp: new Date().toISOString() };
    this.handlers.forEach(h => h(entry));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.emit('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.emit('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.emit('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.emit('error', message, context);
  }
}

export const logger = new Logger();

// Default handler: write to stderr for errors, stdout for rest
logger.addHandler((entry) => {
  const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${
    entry.context ? ' ' + JSON.stringify(entry.context) : ''
  }`;
  if (entry.level === 'error' || entry.level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
});
```

### 7. `packages/shared/src/utils/validation.ts`

```typescript
// packages/shared/src/utils/validation.ts

import type { TeamConfig, Agent } from '../types';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateTeamConfig(config: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!config || typeof config !== 'object') {
    return [{ field: 'root', message: 'Config must be an object' }];
  }

  const c = config as Partial<TeamConfig>;

  if (!c.version) errors.push({ field: 'version', message: 'Required' });
  if (!c.project) errors.push({ field: 'project', message: 'Required' });
  if (!c.teamLead) errors.push({ field: 'teamLead', message: 'Required' });
  if (!Array.isArray(c.agents)) errors.push({ field: 'agents', message: 'Must be array' });
  if (!c.memory) errors.push({ field: 'memory', message: 'Required' });
  if (!c.git) errors.push({ field: 'git', message: 'Required' });

  if (Array.isArray(c.agents)) {
    c.agents.forEach((agent, i) => {
      const agentErrors = validateAgent(agent);
      agentErrors.forEach(e => errors.push({ field: `agents[${i}].${e.field}`, message: e.message }));
    });
  }

  return errors;
}

export function validateAgent(agent: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!agent || typeof agent !== 'object') {
    return [{ field: 'root', message: 'Agent must be an object' }];
  }

  const a = agent as Partial<Agent>;

  if (!a.id) errors.push({ field: 'id', message: 'Required' });
  if (!a.name) errors.push({ field: 'name', message: 'Required' });
  if (!a.model) errors.push({ field: 'model', message: 'Required' });
  if (typeof a.maxTurns !== 'number') errors.push({ field: 'maxTurns', message: 'Must be number' });
  if (!a.git) errors.push({ field: 'git', message: 'Required' });
  if (!Array.isArray(a.builtinTools)) errors.push({ field: 'builtinTools', message: 'Must be array' });

  return errors;
}
```

### 8. `packages/shared/src/index.ts`

```typescript
// packages/shared/src/index.ts
// Central export — everything from shared goes through here

export * from './types';
export * from './interfaces/MemoryAdapter';
export * from './constants';
export * from './utils/paths';
export * from './utils/id';
export * from './utils/logger';
export * from './utils/validation';
```

### 9. Unit Tests

Create `packages/shared/src/__tests__/`:

**`packages/shared/src/__tests__/id.test.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import { generateId, generateTaskId, slugify } from '../utils/id';

describe('generateId', () => {
  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('includes prefix when provided', () => {
    expect(generateId('test')).toMatch(/^test_/);
  });
});

describe('slugify', () => {
  it('converts text to slug', () => {
    expect(slugify('Add Login Form Validation')).toBe('add-login-form-validation');
  });

  it('removes special characters', () => {
    expect(slugify('fix: auth/login bug!')).toBe('fix-authlogin-bug');
  });

  it('truncates to 50 chars', () => {
    expect(slugify('a'.repeat(100))).toHaveLength(50);
  });
});
```

**`packages/shared/src/__tests__/validation.test.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import { validateTeamConfig, validateAgent } from '../utils/validation';

describe('validateTeamConfig', () => {
  it('returns errors for empty config', () => {
    const errors = validateTeamConfig({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns no errors for valid config', () => {
    const config = {
      version: '1.0',
      project: 'test',
      teamLead: { model: 'claude-sonnet-4-6', maxTurns: 30 },
      agents: [],
      memory: { backend: 'files', path: '.agent/memory' },
      git: { defaultBranch: 'main', agentBranchPrefix: 'agent', requireReviewBeforeMerge: true }
    };
    expect(validateTeamConfig(config)).toHaveLength(0);
  });
});

describe('validateAgent', () => {
  it('returns errors for missing required fields', () => {
    expect(validateAgent({})).not.toHaveLength(0);
  });

  it('validates a complete agent', () => {
    const agent = {
      id: 'frontend',
      name: 'Frontend Agent',
      model: 'claude-sonnet-4-6',
      maxTurns: 20,
      git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
      approvalRequired: ['deleteFile'],
      builtinTools: ['Read', 'Write']
    };
    expect(validateAgent(agent)).toHaveLength(0);
  });
});
```

**`packages/shared/src/__tests__/paths.test.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { getAgentDir, getTeamConfigPath, getInboxPath } from '../utils/paths';

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
      path.join(root, '.agent', 'inbox', 'frontend.md')
    );
  });
});
```

Add `vitest.config.ts` to `packages/shared/`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**']
    }
  }
});
```

---

## Acceptance Criteria

- [ ] All types compile with `strict: true`
- [ ] `packages/shared` has zero external runtime dependencies (only built-ins)
- [ ] All utility functions have unit tests
- [ ] `npm test` in `packages/shared` passes with >80% coverage
- [ ] `npm run typecheck` passes
- [ ] `packages/shared/src/index.ts` exports everything needed by core and extension
- [ ] No `any` types without comments
- [ ] Logger works and replaces any console.log calls

---

## Self-Review & Merge

```bash
cd packages/shared && npm test && npm run typecheck
cd ../.. && npm run lint
git diff main...HEAD

git checkout main
git merge phase/1.2-shared-types --no-ff -m "merge: complete phase 1.2 — shared types and interfaces"
git push origin main
git tag -a "phase-1.2-complete" -m "Phase 1.2 complete: shared types"
git push origin --tags
```

---

## Next Phase

**Phase 2.1 — Memory Adapters**
Load `_phases/PHASE-2.1.md` in the next session.
