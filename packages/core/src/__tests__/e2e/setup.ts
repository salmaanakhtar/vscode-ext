// packages/core/src/__tests__/e2e/setup.ts
// Shared utilities for e2e workflow tests.

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { vi } from 'vitest';
import type { Agent } from '@vscode-ext/shared';
import { TEAM_LEAD_ID } from '@vscode-ext/shared';

// ─── Temp directory helpers ───────────────────────────────────────────────────

export async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'vscode-ext-e2e-'));
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

// ─── Agent factory ────────────────────────────────────────────────────────────

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    role: 'Testing',
    model: 'claude-sonnet-4-6',
    maxTurns: 20,
    git: {
      canBranch: true,
      canCommit: true,
      canPush: false,
      canCreatePR: false,
      canMerge: false,
    },
    approvalRequired: ['deleteFile'],
    builtinTools: ['Read', 'Write'],
    ...overrides,
  };
}

// ─── Runtime stub ─────────────────────────────────────────────────────────────

/**
 * Lightweight AgentRuntime stub.
 * Pass a map of agentId → response text to control outputs.
 * Unregistered agent IDs return a generic mocked response.
 */
export function makeRuntimeStub(responses: Record<string, string> = {}) {
  return {
    runTask: vi.fn(async (agentId: string, _prompt: string) => {
      const output = responses[agentId] ?? `mocked response from ${agentId}`;
      return {
        success: true as const,
        data: { taskId: `task-${Date.now()}`, agentId, output, costUsd: 0 },
      };
    }),
  };
}

// ─── Registry stub ────────────────────────────────────────────────────────────

export function makeRegistryStub(agents: Agent[] = []) {
  return {
    getAllAgents: vi.fn(() => agents),
    getAgent: vi.fn((id: string) => agents.find(a => a.id === id) ?? null),
    getProjectRoot: vi.fn(() => '/stub/root'),
    getConfig: vi.fn(() => null),
  };
}

// ─── MessageBus stub ──────────────────────────────────────────────────────────

export function makeBusStub() {
  return {
    send: vi.fn(async () => ({ success: true as const, data: {} })),
  };
}

// ─── Default delegation responses ────────────────────────────────────────────

/**
 * Produce a sequence of vi.fn() mock implementations that simulate:
 *   1. Team Lead returns DELEGATE lines to given agent IDs
 *   2. Each agent responds with its assigned response
 *   3. Team Lead synthesises a final answer
 */
export function makeDelegationSequence(
  delegations: Array<{ agentId: string; task: string; agentResponse: string }>,
  synthesis: string,
) {
  const delegateOutput = delegations
    .map(d => `DELEGATE:${d.agentId}:${d.task}`)
    .join('\n') + '\nDelegating to agents.';

  const mocks = [
    { success: true as const, data: { taskId: 't0', agentId: TEAM_LEAD_ID, output: delegateOutput } },
    ...delegations.map((d, i) => ({
      success: true as const,
      data: { taskId: `t${i + 1}`, agentId: d.agentId, output: d.agentResponse },
    })),
    { success: true as const, data: { taskId: `t${delegations.length + 1}`, agentId: TEAM_LEAD_ID, output: synthesis } },
  ];

  const spy = vi.fn();
  for (const mock of mocks) {
    spy.mockResolvedValueOnce(mock);
  }
  return spy;
}
