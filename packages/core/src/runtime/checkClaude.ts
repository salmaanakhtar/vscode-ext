// packages/core/src/runtime/checkClaude.ts

import { execSync } from 'child_process';

export interface ClaudeCheckResult {
  installed: boolean;
  version?: string;
  error?: string;
}

export function checkClaudeInstalled(): ClaudeCheckResult {
  try {
    const version = execSync('claude --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    return { installed: true, version };
  } catch {
    return {
      installed: false,
      error:
        'Claude Code CLI not found in PATH.\n' +
        'Install it with: npm install -g @anthropic-ai/claude-code\n' +
        'Then log in: claude login\n' +
        'A Claude Pro or Max subscription is required.',
    };
  }
}
