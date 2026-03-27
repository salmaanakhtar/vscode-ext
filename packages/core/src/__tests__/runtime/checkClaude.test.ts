import { describe, it, expect, vi } from 'vitest';
import * as childProcess from 'child_process';
import { checkClaudeInstalled } from '../../runtime/checkClaude';

vi.mock('child_process');

describe('checkClaudeInstalled', () => {
  it('returns installed=true when claude is in PATH', () => {
    vi.mocked(childProcess.execSync).mockReturnValue('claude 1.0.0\n' as unknown as Buffer);
    const result = checkClaudeInstalled();
    expect(result.installed).toBe(true);
    expect(result.version).toBe('claude 1.0.0');
  });

  it('returns installed=false with helpful error when not found', () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => { throw new Error('not found'); });
    const result = checkClaudeInstalled();
    expect(result.installed).toBe(false);
    expect(result.error).toContain('npm install -g @anthropic-ai/claude-code');
    expect(result.error).toContain('claude login');
  });

  it('error message mentions Pro or Max subscription', () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => { throw new Error('not found'); });
    const result = checkClaudeInstalled();
    expect(result.error).toContain('Pro or Max subscription');
  });
});
