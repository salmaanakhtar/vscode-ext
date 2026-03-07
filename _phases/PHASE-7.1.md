# Phase 7.1 — Templates, Agent Export/Import & Polish

> Read CLAUDE.md and PROGRESS.md before starting.
> All previous phases must be complete and merged.

---

## Goal

Complete the product by implementing: the full agent template library, team presets, agent export/import (.agentpack format), the SQLite memory backend wiring, file tree decorations, and end-to-end testing.

---

## Branch

```bash
git checkout main && git pull origin main
git checkout -b phase/7.1-templates-and-polish
```

---

## Deliverables

### 1. `packages/core/src/templates/AgentTemplates.ts`

Implement all 8 templates and 4 team presets:

```typescript
import type { AgentTemplate, TeamPreset } from '@vscode-ext/shared';

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'frontend',
    name: 'Frontend Agent',
    role: 'UI/UX development, React/Vue/Angular, CSS, and browser APIs',
    description: 'Specialised in frontend development and user interfaces',
    defaultModel: 'claude-sonnet-4-6',
    defaultTools: ['Read', 'Write', 'Bash', 'WebFetch'],
    defaultApprovalRequired: ['deleteFile', 'push', 'runScript'],
    defaultGitPermissions: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
    claudeMdTemplate: `# Frontend Agent Instructions\n\n## Role\nYou are the Frontend Agent...\n\n## Scope\nFocus on /src/components, /src/pages, /src/styles\n\n## Standards\n- Accessibility first\n- Mobile responsive\n- Use the project component library\n`,
  },
  {
    id: 'backend',
    name: 'Backend Agent',
    role: 'API design, server logic, authentication, and database interactions',
    description: 'Specialised in backend services and APIs',
    defaultModel: 'claude-sonnet-4-6',
    defaultTools: ['Read', 'Write', 'Bash', 'Glob', 'Grep'],
    defaultApprovalRequired: ['deleteFile', 'push', 'runScript', 'modifyConfig'],
    defaultGitPermissions: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
    claudeMdTemplate: `# Backend Agent Instructions\n\n## Role\nYou are the Backend Agent...\n\n## Scope\nFocus on /src/api, /src/services, /src/models\n\n## Standards\n- Always validate inputs\n- Never expose sensitive data\n- Write tests for all endpoints\n`,
  },
  {
    id: 'qa',
    name: 'QA Agent',
    role: 'Test generation, coverage analysis, and regression identification',
    description: 'Specialised in testing and quality assurance',
    defaultModel: 'claude-sonnet-4-6',
    defaultTools: ['Read', 'Write', 'Bash', 'Glob'],
    defaultApprovalRequired: ['deleteFile', 'push'],
    defaultGitPermissions: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
    claudeMdTemplate: `# QA Agent Instructions\n\n## Role\nYou are the QA Agent...\n\n## Standards\n- Minimum 80% coverage\n- Test edge cases\n- Always run tests before marking complete\n`,
  },
  {
    id: 'security',
    name: 'Security Agent',
    role: 'Vulnerability scanning, auth review, and secrets detection',
    description: 'Specialised in security analysis',
    defaultModel: 'claude-sonnet-4-6',
    defaultTools: ['Read', 'Grep', 'Bash'],
    defaultApprovalRequired: ['deleteFile', 'push', 'runScript', 'modifyConfig', 'createFile'],
    defaultGitPermissions: { canBranch: false, canCommit: false, canPush: false, canCreatePR: false, canMerge: false },
    claudeMdTemplate: `# Security Agent Instructions\n\n## Role\nYou are the Security Agent...\n\n## Rules\n- Never auto-approve any action\n- Flag ALL credential handling\n- Check dependencies for CVEs\n`,
  },
  {
    id: 'devops',
    name: 'DevOps Agent',
    role: 'CI/CD pipelines, Docker, and infrastructure-as-code',
    description: 'Specialised in deployment and infrastructure',
    defaultModel: 'claude-sonnet-4-6',
    defaultTools: ['Read', 'Write', 'Bash'],
    defaultApprovalRequired: ['deleteFile', 'push', 'runScript', 'modifyConfig', 'modifyCI'],
    defaultGitPermissions: { canBranch: true, canCommit: true, canPush: false, canCreatePR: true, canMerge: false },
    claudeMdTemplate: `# DevOps Agent Instructions\n\n## Role\nYou are the DevOps Agent...\n\n## Rules\n- Never modify CI/CD without explicit approval\n- Always test changes locally first\n`,
  },
  {
    id: 'documentation',
    name: 'Documentation Agent',
    role: 'README generation, API docs, inline comments, and changelogs',
    description: 'Specialised in technical writing and documentation',
    defaultModel: 'claude-sonnet-4-6',
    defaultTools: ['Read', 'Write', 'WebFetch'],
    defaultApprovalRequired: ['deleteFile', 'push'],
    defaultGitPermissions: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
    claudeMdTemplate: `# Documentation Agent Instructions\n\n## Role\nYou are the Documentation Agent...\n\n## Standards\n- Clear and concise language\n- Include code examples\n- Keep README up to date\n`,
  },
  {
    id: 'database',
    name: 'Database Agent',
    role: 'Schema design, migrations, and query optimisation',
    description: 'Specialised in database management',
    defaultModel: 'claude-sonnet-4-6',
    defaultTools: ['Read', 'Write', 'Bash'],
    defaultApprovalRequired: ['deleteFile', 'push', 'runScript', 'modifyConfig'],
    defaultGitPermissions: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
    claudeMdTemplate: `# Database Agent Instructions\n\n## Role\nYou are the Database Agent...\n\n## Rules\n- Always write reversible migrations\n- Never drop columns without approval\n- Optimise queries before committing\n`,
  },
  {
    id: 'reviewer',
    name: 'Code Reviewer',
    role: 'Cross-cutting code review for quality and consistency',
    description: 'Read-only code review agent',
    defaultModel: 'claude-sonnet-4-6',
    defaultTools: ['Read', 'Grep', 'Glob'],
    defaultApprovalRequired: ['deleteFile', 'push', 'runScript', 'createFile', 'modifyConfig'],
    defaultGitPermissions: { canBranch: false, canCommit: false, canPush: false, canCreatePR: false, canMerge: false },
    claudeMdTemplate: `# Code Reviewer Instructions\n\n## Role\nYou are the Code Reviewer...\n\n## Focus Areas\n- Code quality and consistency\n- Test coverage\n- Security issues\n- Performance\n`,
  },
];

export const TEAM_PRESETS: TeamPreset[] = [
  {
    id: 'fullstack-web',
    name: 'Full-Stack Web App',
    description: 'Complete team for full-stack web development',
    agentTemplateIds: ['frontend', 'backend', 'qa', 'security'],
  },
  {
    id: 'api-service',
    name: 'API Service',
    description: 'Backend-focused team for API services',
    agentTemplateIds: ['backend', 'documentation', 'qa'],
  },
  {
    id: 'open-source',
    name: 'Open Source Project',
    description: 'Team optimised for open source maintenance',
    agentTemplateIds: ['reviewer', 'documentation', 'qa'],
  },
  {
    id: 'solo-dev',
    name: 'Solo Developer',
    description: 'Minimal team for individual projects',
    agentTemplateIds: ['backend'],
  },
];

export function getTemplate(id: string): AgentTemplate | null {
  return AGENT_TEMPLATES.find(t => t.id === id) ?? null;
}

export function getPreset(id: string): TeamPreset | null {
  return TEAM_PRESETS.find(p => p.id === id) ?? null;
}
```

### 2. `packages/core/src/templates/AgentExporter.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type { Agent, Result } from '@vscode-ext/shared';
import { getAgentClaudePath, getAgentToolsPath, getAgentMemoryDir, logger } from '@vscode-ext/shared';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface AgentPack {
  version: '1.0';
  exportedAt: string;
  agent: Agent;
  claudeMd: string;
  toolsJson: string;
  memorySummary: string;
}

export class AgentExporter {
  async export(
    projectRoot: string,
    agent: Agent,
    outputPath: string,
  ): Promise<Result<void>> {
    try {
      const claudeMd = await this.readSafe(getAgentClaudePath(projectRoot, agent.id));
      const toolsJson = await this.readSafe(getAgentToolsPath(projectRoot, agent.id));
      const memorySummary = await this.summariseMemory(getAgentMemoryDir(projectRoot, agent.id));

      // Strip session ID from exported agent
      const exportAgent: Agent = { ...agent, sessionId: undefined };

      const pack: AgentPack = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        agent: exportAgent,
        claudeMd,
        toolsJson,
        memorySummary,
      };

      const json = JSON.stringify(pack, null, 2);
      const compressed = await gzip(Buffer.from(json));
      await fs.writeFile(outputPath, compressed);

      logger.info('Agent exported', { agentId: agent.id, outputPath });
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  async import(packPath: string): Promise<Result<AgentPack>> {
    try {
      const compressed = await fs.readFile(packPath);
      const json = await gunzip(compressed);
      const pack = JSON.parse(json.toString()) as AgentPack;
      return { success: true, data: pack };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  private async readSafe(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private async summariseMemory(memDir: string): Promise<string> {
    try {
      const files = await fs.readdir(memDir);
      const contents = await Promise.all(
        files.slice(0, 5).map(f => this.readSafe(path.join(memDir, f)))
      );
      return contents.filter(Boolean).join('\n\n---\n\n').substring(0, 2000);
    } catch {
      return '';
    }
  }
}
```

### 3. File Tree Decorations

`packages/extension/src/providers/AgentFileDecorationProvider.ts`:

```typescript
import * as vscode from 'vscode';
import type { ProjectNameSession } from '../ProjectNameSession';

export class AgentFileDecorationProvider implements vscode.FileDecorationProvider {
  private activeFiles: Map<string, string> = new Map(); // filepath -> agentId
  private _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  constructor(private getSession: () => ProjectNameSession | null) {}

  setActiveFile(filePath: string, agentId: string): void {
    this.activeFiles.set(filePath, agentId);
    this._onDidChange.fire(vscode.Uri.file(filePath));
  }

  clearActiveFile(filePath: string): void {
    this.activeFiles.delete(filePath);
    this._onDidChange.fire(vscode.Uri.file(filePath));
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const agentId = this.activeFiles.get(uri.fsPath);
    if (!agentId) return undefined;

    return {
      badge: agentId.substring(0, 2).toUpperCase(),
      tooltip: `Being modified by agent: ${agentId}`,
      color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
    };
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
```

### 4. End-to-End Test

`packages/core/src/__tests__/integration/e2e.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TeamRegistry, MemoryManager, MessageBus, ApprovalGate, TaskQueue } from '../../index';

describe('Core Engine Integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('initialises project and registers an agent', async () => {
    const registry = new TeamRegistry(tmpDir);
    await registry.initProject('e2e-test');
    await registry.load();

    const result = await registry.registerAgent({
      id: 'test-agent',
      name: 'Test Agent',
      role: 'Testing',
      model: 'claude-sonnet-4-6',
      maxBudgetUsd: 0.5,
      git: { canBranch: true, canCommit: true, canPush: false, canCreatePR: false, canMerge: false },
      approvalRequired: ['deleteFile'],
      builtinTools: ['Read', 'Write'],
    });

    expect(result.success).toBe(true);
    expect(registry.getAgent('test-agent')).not.toBeNull();
  });

  it('writes and searches memory', async () => {
    const memory = new MemoryManager();
    await memory.init({ backend: 'files', path: path.join(tmpDir, 'memory') });

    await memory.write('agent1', 'fact', 'The app uses PostgreSQL', ['db', 'postgres']);
    await memory.write('agent1', 'decision', 'We chose REST over GraphQL', ['api']);

    const search = await memory.search('PostgreSQL');
    expect(search.success).toBe(true);
    if (search.success) {
      expect(search.data).toHaveLength(1);
      expect(search.data[0].content).toContain('PostgreSQL');
    }
  });

  it('approval gate blocks and resolves', async () => {
    await fs.mkdir(path.join(tmpDir, '.agent', 'memory'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.agent', 'memory', 'audit.md'), '');

    const gate = new ApprovalGate(tmpDir);
    gate.setApprovalHandler(async () => ({
      decision: 'approved',
      resolvedAt: new Date().toISOString(),
    }));

    const result = await gate.check('agent1', 'push', 'Push to main', 'ctx', 'task-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(true);
  });
});
```

### 5. Update `commands/index.ts`

Implement `projectname.exportAgent` and `projectname.importAgent` using `AgentExporter`.

### 6. Final polish checklist

- [ ] Update all stub commands with real implementations
- [ ] Wire `AgentFileDecorationProvider` into `extension.ts`
- [ ] Wire `AgentExporter` into export/import commands
- [ ] Add `packages/core/src/templates/index.ts` exporting templates and presets
- [ ] Run full test suite — fix any failing tests
- [ ] Run typecheck across all packages
- [ ] Run lint and fix all warnings
- [ ] Create a `CHANGELOG.md` documenting what was built
- [ ] Update `PROGRESS.md` marking all phases complete

---

## Final Self-Review & Merge

```bash
# Full suite
npm test
npm run typecheck
npm run lint
npm run coverage

# Verify no vscode in core
grep -r "from 'vscode'" packages/core packages/shared && echo "VIOLATION" || echo "OK"

# Check coverage >= 80%
# Review all open issues in PROGRESS.md

git checkout main
git merge phase/7.1-templates-and-polish --no-ff -m "merge: complete phase 7.1 — templates, export/import, polish"
git push origin main
git tag -a "phase-7.1-complete" -m "Phase 7.1 complete: all phases done"
git tag -a "v0.1.0" -m "v0.1.0 — initial complete build"
git push origin --tags
```

---

## Post-Build

After all phases are complete:

1. Test the extension end-to-end in VS Code Extension Development Host
2. Run `npm run package` in `packages/extension` to build the `.vsix`
3. Install the `.vsix` locally: `code --install-extension vscode-ext-0.1.0.vsix`
4. Create a GitHub Release with the `.vsix` attached

**The build is complete. Replace all `vscode-ext` and `vscode-ext` placeholders with your chosen name.**
