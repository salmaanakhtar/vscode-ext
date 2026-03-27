// packages/core/src/runtime/SystemPromptBuilder.ts

import { TeamRegistry } from '../registry/TeamRegistry';
import { MemoryManager } from '../memory/MemoryManager';

export class SystemPromptBuilder {
  constructor(
    private registry: TeamRegistry,
    private memory: MemoryManager,
  ) {}

  async build(agentId: string): Promise<string> {
    const parts: string[] = [];

    const projectInfo = await this.registry.readProjectInfo();
    if (projectInfo) parts.push('# Project Information\n\n' + projectInfo);

    const projectClaude = await this.registry.readProjectClaude();
    if (projectClaude) parts.push('# Shared Team Instructions\n\n' + projectClaude);

    const agentClaude = await this.registry.readAgentClaude(agentId);
    if (agentClaude) parts.push('# Your Role and Instructions\n\n' + agentClaude);

    const agentContext = await this.memory.getAgentContext(agentId, 20);
    if (agentContext) parts.push('# Your Memory (Recent)\n\n' + agentContext);

    const projectContext = await this.memory.getProjectContext(10);
    if (projectContext) parts.push('# Project Shared Memory\n\n' + projectContext);

    return parts.join('\n\n---\n\n');
  }
}
