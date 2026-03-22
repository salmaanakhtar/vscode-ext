// packages/core/src/registry/TeamRegistry.ts

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import type { TeamConfig, Agent, Result } from '@vscode-ext/shared';
import {
  getAgentDir,
  getTeamConfigPath,
  getProjectClaudePath,
  getProjectInfoPath,
  getProjectMemoryDir,
  getAgentClaudePath,
  getAgentMemoryDir,
  getAgentToolsPath,
  getInboxPath,
  validateTeamConfig,
  logger,
  DEFAULT_TEAM_LEAD_CONFIG,
  DEFAULT_GIT_CONFIG,
  DEFAULT_MEMORY_CONFIG,
  TEAM_VERSION,
  TEAM_LEAD_ID,
} from '@vscode-ext/shared';

export class TeamRegistry {
  private projectRoot: string;
  private config: TeamConfig | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  // ─── Initialisation ───────────────────────────────────────────

  /**
   * Initialise a new .agent/ directory for a project.
   * Creates all required directories and files.
   * Will not overwrite an existing team.json.
   */
  async initProject(projectName: string): Promise<Result<void>> {
    try {
      const agentDir = getAgentDir(this.projectRoot);

      // Create directory structure
      await fs.mkdir(agentDir, { recursive: true });
      await fs.mkdir(getProjectMemoryDir(this.projectRoot), { recursive: true });
      await fs.mkdir(path.join(agentDir, 'team-lead', 'memory'), { recursive: true });
      await fs.mkdir(path.join(agentDir, 'agents'), { recursive: true });
      await fs.mkdir(path.join(agentDir, 'inbox'), { recursive: true });

      // Create PROJECT-INFO.md if not exists
      const projectInfoPath = getProjectInfoPath(this.projectRoot);
      if (!fsSync.existsSync(projectInfoPath)) {
        await fs.writeFile(projectInfoPath, this.defaultProjectInfo(projectName));
      }

      // Create project CLAUDE.md if not exists
      const claudePath = getProjectClaudePath(this.projectRoot);
      if (!fsSync.existsSync(claudePath)) {
        await fs.writeFile(claudePath, this.defaultProjectClaude());
      }

      // Create memory files
      const memDir = getProjectMemoryDir(this.projectRoot);
      for (const file of ['decisions.md', 'context.md', 'tasks.md', 'audit.md']) {
        const filePath = path.join(memDir, file);
        if (!fsSync.existsSync(filePath)) {
          await fs.writeFile(filePath, `# ${file.replace('.md', '')}\n\n`);
        }
      }

      // Create team-lead CLAUDE.md and tools.json
      const leadClaudePath = getAgentClaudePath(this.projectRoot, TEAM_LEAD_ID);
      if (!fsSync.existsSync(leadClaudePath)) {
        await fs.writeFile(leadClaudePath, this.defaultTeamLeadClaude());
      }
      const leadToolsPath = getAgentToolsPath(this.projectRoot, TEAM_LEAD_ID);
      if (!fsSync.existsSync(leadToolsPath)) {
        await fs.writeFile(
          leadToolsPath,
          JSON.stringify(
            { builtinTools: ['Read', 'Write', 'Bash', 'Glob', 'Grep', 'WebFetch'], mcpServers: [] },
            null,
            2,
          ),
        );
      }

      // Create team-lead inbox
      const inboxPath = getInboxPath(this.projectRoot, TEAM_LEAD_ID);
      if (!fsSync.existsSync(inboxPath)) {
        await fs.writeFile(inboxPath, `# Team Lead Inbox\n\n`);
      }

      // Create team.json if not exists
      const configPath = getTeamConfigPath(this.projectRoot);
      if (!fsSync.existsSync(configPath)) {
        const defaultConfig: TeamConfig = {
          version: TEAM_VERSION,
          project: projectName,
          teamLead: DEFAULT_TEAM_LEAD_CONFIG,
          agents: [],
          memory: DEFAULT_MEMORY_CONFIG,
          git: DEFAULT_GIT_CONFIG,
        };
        await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
        this.config = defaultConfig;
      } else {
        await this.load();
      }

      logger.info('Project initialised', { projectName, root: this.projectRoot });
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  // ─── Load / Save ──────────────────────────────────────────────

  /** Load team.json from disk and validate. */
  async load(): Promise<Result<TeamConfig>> {
    try {
      const configPath = getTeamConfigPath(this.projectRoot);
      const raw = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;

      const errors = validateTeamConfig(parsed);
      if (errors.length > 0) {
        const message = errors.map(e => `${e.field}: ${e.message}`).join(', ');
        return { success: false, error: new Error(`Invalid team.json: ${message}`) };
      }

      this.config = parsed as TeamConfig;
      return { success: true, data: this.config };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  /** Persist the in-memory config to disk. */
  async save(): Promise<Result<void>> {
    if (!this.config) return { success: false, error: new Error('No config loaded') };
    try {
      const configPath = getTeamConfigPath(this.projectRoot);
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  /** Return the in-memory config without hitting disk. */
  getConfig(): TeamConfig | null {
    return this.config;
  }

  // ─── Agent Management ─────────────────────────────────────────

  /**
   * Register a new agent: creates its directory structure and
   * appends it to team.json.
   */
  async registerAgent(agent: Agent): Promise<Result<void>> {
    if (!this.config) return { success: false, error: new Error('No config loaded') };

    if (this.config.agents.find(a => a.id === agent.id)) {
      return { success: false, error: new Error(`Agent with id '${agent.id}' already exists`) };
    }

    try {
      // Create agent directory structure
      const agentMemDir = getAgentMemoryDir(this.projectRoot, agent.id);
      await fs.mkdir(agentMemDir, { recursive: true });

      // Create CLAUDE.md for agent
      const claudePath = getAgentClaudePath(this.projectRoot, agent.id);
      if (!fsSync.existsSync(claudePath)) {
        await fs.writeFile(claudePath, this.defaultAgentClaude(agent));
      }

      // Create tools.json for agent
      const toolsPath = getAgentToolsPath(this.projectRoot, agent.id);
      if (!fsSync.existsSync(toolsPath)) {
        await fs.writeFile(
          toolsPath,
          JSON.stringify(
            { builtinTools: agent.builtinTools, mcpServers: agent.mcpServers ?? [] },
            null,
            2,
          ),
        );
      }

      // Create inbox
      const inboxPath = getInboxPath(this.projectRoot, agent.id);
      if (!fsSync.existsSync(inboxPath)) {
        await fs.writeFile(inboxPath, `# ${agent.name} Inbox\n\n`);
      }

      // Register in config and persist
      this.config.agents.push(agent);
      await this.save();

      logger.info('Agent registered', { agentId: agent.id, name: agent.name });
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  /** Remove an agent from team.json (does not delete its directory). */
  async removeAgent(agentId: string): Promise<Result<void>> {
    if (!this.config) return { success: false, error: new Error('No config loaded') };
    this.config.agents = this.config.agents.filter(a => a.id !== agentId);
    return this.save();
  }

  /** Merge partial updates into an existing agent and persist. */
  async updateAgent(agentId: string, updates: Partial<Agent>): Promise<Result<void>> {
    if (!this.config) return { success: false, error: new Error('No config loaded') };

    const idx = this.config.agents.findIndex(a => a.id === agentId);
    if (idx === -1) return { success: false, error: new Error(`Agent not found: ${agentId}`) };

    this.config.agents[idx] = { ...this.config.agents[idx], ...updates };
    return this.save();
  }

  /** Return a single agent by id, or null if not found. */
  getAgent(agentId: string): Agent | null {
    return this.config?.agents.find(a => a.id === agentId) ?? null;
  }

  /** Return all registered agents. */
  getAllAgents(): Agent[] {
    return this.config?.agents ?? [];
  }

  // ─── File Readers ─────────────────────────────────────────────

  /** Read the project PROJECT-INFO.md, returns empty string on error. */
  async readProjectInfo(): Promise<string> {
    try {
      return await fs.readFile(getProjectInfoPath(this.projectRoot), 'utf-8');
    } catch { return ''; }
  }

  /** Read the project-level CLAUDE.md, returns empty string on error. */
  async readProjectClaude(): Promise<string> {
    try {
      return await fs.readFile(getProjectClaudePath(this.projectRoot), 'utf-8');
    } catch { return ''; }
  }

  /** Read an agent's CLAUDE.md, returns empty string on error. */
  async readAgentClaude(agentId: string): Promise<string> {
    try {
      return await fs.readFile(getAgentClaudePath(this.projectRoot, agentId), 'utf-8');
    } catch { return ''; }
  }

  /** Returns true if team.json exists on disk. */
  async isInitialised(): Promise<boolean> {
    try {
      await fs.access(getTeamConfigPath(this.projectRoot));
      return true;
    } catch { return false; }
  }

  // ─── Default Content Templates ────────────────────────────────

  private defaultProjectInfo(name: string): string {
    return `# Project: ${name}

## Overview
[Describe what this project does]

## Tech Stack
- [List main technologies]

## Architecture
[Brief description of the architecture]

## Key Directories
- \`src/\` — source code
- [add more as relevant]

## Coding Conventions
- [List conventions]

## Important Context for Agents
[Any context agents should always be aware of]
`;
  }

  private defaultProjectClaude(): string {
    return `# Shared Agent Instructions

## All agents must follow these rules:

### Code Standards
- Follow the project's existing code style
- Write tests for all new functionality
- Document public APIs

### Git Rules
- Use conventional commit messages
- Create branches using the agent/[id]/[task] naming convention
- Never commit secrets or credentials

### Escalation Rules
- If unsure about a destructive operation, request approval
- If a task requires access outside your defined scope, notify the Team Lead

### Communication
- Be concise in agent-to-agent messages
- Always reference the task ID in messages
`;
  }

  private defaultTeamLeadClaude(): string {
    return `# Team Lead Instructions

You are the Team Lead for this project. Your responsibilities:

## Primary Role
- Receive developer requests and break them into concrete tasks
- Delegate tasks to the most appropriate registered agents
- Monitor agent progress and synthesise results
- Handle escalations from agents that need clarification

## Delegation Rules
- Always consider which agent is best suited for each task
- Provide clear, specific prompts when delegating
- Include relevant context from project memory
- Set realistic expectations on task complexity

## Communication
- Keep the developer informed of progress at key milestones
- Surface blockers immediately
- Summarise agent outputs before presenting to the developer
`;
  }

  private defaultAgentClaude(agent: Agent): string {
    return `# ${agent.name} Instructions

## Role
${agent.role}

## Scope
[Define what areas of the codebase this agent is responsible for]

## Tools Available
${agent.builtinTools.join(', ')}

## Behaviour Rules
- Stay within your defined scope
- Request approval for any high-risk actions
- Write to your memory after completing significant tasks
- Communicate with other agents via the inbox system

## Quality Standards
- All code changes must be tested
- Follow project coding conventions defined in the project CLAUDE.md
`;
  }
}
