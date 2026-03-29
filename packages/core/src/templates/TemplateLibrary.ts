// packages/core/src/templates/TemplateLibrary.ts

import type { Agent, AgentTemplate, TeamPreset } from '@vscode-ext/shared';
import { generateId } from '@vscode-ext/shared';
import { AGENT_TEMPLATES, TEAM_PRESETS } from './AgentTemplates';

/**
 * An agent config ready to register, paired with the CLAUDE.md content to write to disk.
 */
export interface AgentDraft {
  agent: Omit<Agent, 'id'>;
  claudeMdContent: string;
}

/**
 * Provides access to the built-in agent template library and team presets.
 * Templates define default configuration and CLAUDE.md content for each specialist role.
 */
export class TemplateLibrary {
  /** Return all available agent templates. */
  getTemplates(): AgentTemplate[] {
    return AGENT_TEMPLATES;
  }

  /** Return a specific template by ID, or undefined if not found. */
  getTemplate(id: string): AgentTemplate | undefined {
    return AGENT_TEMPLATES.find(t => t.id === id);
  }

  /** Return all team presets. */
  getPresets(): TeamPreset[] {
    return TEAM_PRESETS;
  }

  /** Return a specific preset by ID, or undefined if not found. */
  getPreset(id: string): TeamPreset | undefined {
    return TEAM_PRESETS.find(p => p.id === id);
  }

  /**
   * Instantiate an agent draft from a template, with optional field overrides.
   * Returns the agent config (without an id) and the CLAUDE.md content to write.
   * The caller is responsible for assigning an id and registering the agent.
   */
  instantiateFromTemplate(
    templateId: string,
    overrides?: Partial<Agent>,
  ): AgentDraft | null {
    const template = this.getTemplate(templateId);
    if (!template) return null;

    const agent: Omit<Agent, 'id'> = {
      name: overrides?.name ?? template.name,
      role: overrides?.role ?? template.role,
      model: overrides?.model ?? template.defaultModel,
      template: template.id,
      maxTurns: overrides?.maxTurns ?? 50,
      git: overrides?.git ?? { ...template.defaultGitPermissions },
      approvalRequired: overrides?.approvalRequired ?? [...template.defaultApprovalRequired],
      builtinTools: overrides?.builtinTools ?? [...template.defaultTools],
      mcpServers: overrides?.mcpServers ?? template.defaultMcpServers ?? [],
    };

    return { agent, claudeMdContent: template.claudeMdTemplate };
  }

  /**
   * Instantiate a full set of agent drafts from a preset.
   * Returns one AgentDraft per agent in the preset.
   * Agents are given generated IDs using the template id as a base.
   */
  instantiateFromPreset(
    presetId: string,
    overrides?: Partial<Agent>[],
  ): Array<AgentDraft & { id: string }> {
    const preset = this.getPreset(presetId);
    if (!preset) return [];

    return preset.agents.flatMap((entry, idx) => {
      const agentOverrides = overrides?.[idx];
      const draft = this.instantiateFromTemplate(entry.templateId, {
        ...agentOverrides,
        ...(entry.customName ? { name: entry.customName } : {}),
        ...(entry.modelOverride ? { model: entry.modelOverride } : {}),
      });
      if (!draft) return [];

      // Use templateId as id base; if duplicate, append a short unique suffix
      const id = entry.templateId;
      return [{ ...draft, id }];
    });
  }

  /**
   * Generate a unique agent ID from a template ID.
   * Appends a short random suffix to avoid collisions when the same template
   * is used twice in one team.
   */
  generateAgentId(templateId: string): string {
    // generateId() returns "${timestamp}_${randomHex}" — use the random hex portion for uniqueness
    const raw = generateId();
    const suffix = raw.split('_').pop()?.slice(0, 6) ?? raw.slice(-6);
    return `${templateId}-${suffix}`;
  }
}
