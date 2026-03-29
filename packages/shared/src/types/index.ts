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
  agents: Array<{
    templateId: string;
    customName?: string;
    modelOverride?: AgentModel;
  }>;
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
