import { describe, it, expect, vi } from 'vitest';
import { SystemPromptBuilder } from '../../runtime/SystemPromptBuilder';

describe('SystemPromptBuilder', () => {
  it('includes all context sections in correct order', async () => {
    const mockRegistry = {
      readProjectInfo: vi.fn().mockResolvedValue('Project info'),
      readProjectClaude: vi.fn().mockResolvedValue('Shared instructions'),
      readAgentClaude: vi.fn().mockResolvedValue('Agent instructions'),
    };
    const mockMemory = {
      getAgentContext: vi.fn().mockResolvedValue('Agent memory'),
      getProjectContext: vi.fn().mockResolvedValue('Project memory'),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = new SystemPromptBuilder(mockRegistry as any, mockMemory as any);
    const prompt = await builder.build('frontend');

    expect(prompt).toContain('Project info');
    expect(prompt).toContain('Shared instructions');
    expect(prompt).toContain('Agent instructions');
    expect(prompt).toContain('Agent memory');
    expect(prompt).toContain('Project memory');
    expect(prompt.indexOf('Project info')).toBeLessThan(prompt.indexOf('Shared instructions'));
    expect(prompt.indexOf('Shared instructions')).toBeLessThan(prompt.indexOf('Agent instructions'));
  });

  it('returns empty string when all context is empty', async () => {
    const mockRegistry = {
      readProjectInfo: vi.fn().mockResolvedValue(''),
      readProjectClaude: vi.fn().mockResolvedValue(''),
      readAgentClaude: vi.fn().mockResolvedValue(''),
    };
    const mockMemory = {
      getAgentContext: vi.fn().mockResolvedValue(''),
      getProjectContext: vi.fn().mockResolvedValue(''),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = new SystemPromptBuilder(mockRegistry as any, mockMemory as any);
    expect(await builder.build('frontend')).toBe('');
  });

  it('omits sections when individual context returns empty', async () => {
    const mockRegistry = {
      readProjectInfo: vi.fn().mockResolvedValue('Project info'),
      readProjectClaude: vi.fn().mockResolvedValue(''),
      readAgentClaude: vi.fn().mockResolvedValue('Agent instructions'),
    };
    const mockMemory = {
      getAgentContext: vi.fn().mockResolvedValue(''),
      getProjectContext: vi.fn().mockResolvedValue(''),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = new SystemPromptBuilder(mockRegistry as any, mockMemory as any);
    const prompt = await builder.build('backend');
    expect(prompt).toContain('Project info');
    expect(prompt).toContain('Agent instructions');
    expect(prompt).not.toContain('Shared Team Instructions');
  });

  it('passes agentId to readAgentClaude and getAgentContext', async () => {
    const mockRegistry = {
      readProjectInfo: vi.fn().mockResolvedValue(''),
      readProjectClaude: vi.fn().mockResolvedValue(''),
      readAgentClaude: vi.fn().mockResolvedValue(''),
    };
    const mockMemory = {
      getAgentContext: vi.fn().mockResolvedValue(''),
      getProjectContext: vi.fn().mockResolvedValue(''),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = new SystemPromptBuilder(mockRegistry as any, mockMemory as any);
    await builder.build('qa');
    expect(mockRegistry.readAgentClaude).toHaveBeenCalledWith('qa');
    expect(mockMemory.getAgentContext).toHaveBeenCalledWith('qa', 20);
  });

  it('sections are separated by dividers', async () => {
    const mockRegistry = {
      readProjectInfo: vi.fn().mockResolvedValue('Info'),
      readProjectClaude: vi.fn().mockResolvedValue('Claude'),
      readAgentClaude: vi.fn().mockResolvedValue(''),
    };
    const mockMemory = {
      getAgentContext: vi.fn().mockResolvedValue(''),
      getProjectContext: vi.fn().mockResolvedValue(''),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = new SystemPromptBuilder(mockRegistry as any, mockMemory as any);
    const prompt = await builder.build('frontend');
    expect(prompt).toContain('---');
  });
});
