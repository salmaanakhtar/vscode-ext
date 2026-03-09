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

export function getAgentWorkDir(projectRoot: string, agentId: string): string {
  if (agentId === TEAM_LEAD_ID) {
    return path.join(projectRoot, AGENT_DIR, TEAM_LEAD_ID);
  }
  return path.join(projectRoot, AGENT_DIR, AGENTS_DIR, agentId);
}

export function getAgentClaudePath(projectRoot: string, agentId: string): string {
  return path.join(getAgentWorkDir(projectRoot, agentId), 'CLAUDE.md');
}

export function getAgentMemoryDir(projectRoot: string, agentId: string): string {
  return path.join(getAgentWorkDir(projectRoot, agentId), MEMORY_DIR);
}

export function getAgentToolsPath(projectRoot: string, agentId: string): string {
  return path.join(getAgentWorkDir(projectRoot, agentId), 'tools.json');
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
