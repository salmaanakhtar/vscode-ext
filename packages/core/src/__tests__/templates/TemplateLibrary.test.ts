import { describe, it, expect } from 'vitest';
import type { Agent } from '@vscode-ext/shared';
import { TemplateLibrary } from '../../templates/TemplateLibrary';
import { AGENT_TEMPLATES, TEAM_PRESETS } from '../../templates/AgentTemplates';

describe('TemplateLibrary', () => {
  const lib = new TemplateLibrary();

  describe('getTemplates', () => {
    it('returns all 8 built-in templates', () => {
      const templates = lib.getTemplates();
      expect(templates).toHaveLength(8);
    });

    it('each template has required fields', () => {
      for (const t of lib.getTemplates()) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.role).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.defaultModel).toBeTruthy();
        expect(t.defaultTools.length).toBeGreaterThan(0);
        expect(t.claudeMdTemplate.length).toBeGreaterThan(100);
        expect(t.defaultApprovalRequired.length).toBeGreaterThan(0);
        expect(typeof t.defaultGitPermissions.canBranch).toBe('boolean');
      }
    });

    it('includes all 8 expected template ids', () => {
      const ids = lib.getTemplates().map(t => t.id);
      expect(ids).toContain('frontend');
      expect(ids).toContain('backend');
      expect(ids).toContain('qa');
      expect(ids).toContain('security');
      expect(ids).toContain('devops');
      expect(ids).toContain('documentation');
      expect(ids).toContain('database');
      expect(ids).toContain('reviewer');
    });
  });

  describe('getTemplate', () => {
    it('returns a template by id', () => {
      const t = lib.getTemplate('frontend');
      expect(t).toBeDefined();
      expect(t?.id).toBe('frontend');
    });

    it('returns undefined for unknown id', () => {
      expect(lib.getTemplate('nonexistent')).toBeUndefined();
    });
  });

  describe('getPresets', () => {
    it('returns all 4 built-in presets', () => {
      expect(lib.getPresets()).toHaveLength(4);
    });

    it('each preset has required fields', () => {
      for (const p of lib.getPresets()) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.description).toBeTruthy();
        expect(p.agents.length).toBeGreaterThan(0);
      }
    });

    it('each preset agent entry references a valid template', () => {
      const templateIds = new Set(lib.getTemplates().map(t => t.id));
      for (const preset of lib.getPresets()) {
        for (const entry of preset.agents) {
          expect(templateIds.has(entry.templateId)).toBe(true);
        }
      }
    });
  });

  describe('getPreset', () => {
    it('returns a preset by id', () => {
      const p = lib.getPreset('api-service');
      expect(p).toBeDefined();
      expect(p?.id).toBe('api-service');
    });

    it('returns undefined for unknown id', () => {
      expect(lib.getPreset('nonexistent')).toBeUndefined();
    });
  });

  describe('instantiateFromTemplate', () => {
    it('returns an AgentDraft for a valid template', () => {
      const draft = lib.instantiateFromTemplate('backend');
      expect(draft).not.toBeNull();
      expect(draft?.agent.name).toBe('Backend Agent');
      expect(draft?.agent.template).toBe('backend');
      expect(draft?.claudeMdContent).toContain('Backend Agent');
    });

    it('applies overrides to the draft agent', () => {
      const overrides: Partial<Agent> = { name: 'My Backend', maxTurns: 10 };
      const draft = lib.instantiateFromTemplate('backend', overrides);
      expect(draft?.agent.name).toBe('My Backend');
      expect(draft?.agent.maxTurns).toBe(10);
    });

    it('returns null for unknown template', () => {
      expect(lib.instantiateFromTemplate('nonexistent')).toBeNull();
    });

    it('copies default git permissions', () => {
      const draft = lib.instantiateFromTemplate('security');
      expect(draft?.agent.git.canBranch).toBe(false);
      expect(draft?.agent.git.canCommit).toBe(false);
    });

    it('copies default approval required list', () => {
      const draft = lib.instantiateFromTemplate('frontend');
      expect(draft?.agent.approvalRequired).toContain('deleteFile');
      expect(draft?.agent.approvalRequired).toContain('push');
    });
  });

  describe('instantiateFromPreset', () => {
    it('returns correct number of drafts for api-service', () => {
      const drafts = lib.instantiateFromPreset('api-service');
      expect(drafts).toHaveLength(3);
    });

    it('returns correct number of drafts for fullstack-web', () => {
      const drafts = lib.instantiateFromPreset('fullstack-web');
      expect(drafts).toHaveLength(4);
    });

    it('returns empty array for unknown preset', () => {
      expect(lib.instantiateFromPreset('nonexistent')).toHaveLength(0);
    });

    it('each draft has a valid id matching the template', () => {
      const drafts = lib.instantiateFromPreset('open-source');
      const ids = drafts.map(d => d.id);
      expect(ids).toContain('reviewer');
      expect(ids).toContain('documentation');
      expect(ids).toContain('qa');
    });

    it('applies per-agent overrides', () => {
      const overrides: Partial<Agent>[] = [{ name: 'Custom Backend' }];
      const drafts = lib.instantiateFromPreset('api-service', overrides);
      expect(drafts[0].agent.name).toBe('Custom Backend');
    });
  });

  describe('generateAgentId', () => {
    it('generates a unique id with template prefix', () => {
      const id1 = lib.generateAgentId('frontend');
      const id2 = lib.generateAgentId('frontend');
      expect(id1.startsWith('frontend-')).toBe(true);
      expect(id2.startsWith('frontend-')).toBe(true);
      expect(id1).not.toBe(id2);
    });
  });

  describe('AGENT_TEMPLATES constant', () => {
    it('has 8 entries', () => {
      expect(AGENT_TEMPLATES).toHaveLength(8);
    });
  });

  describe('TEAM_PRESETS constant', () => {
    it('has 4 entries', () => {
      expect(TEAM_PRESETS).toHaveLength(4);
    });
  });
});
