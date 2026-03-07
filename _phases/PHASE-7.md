# Phase 7 — Templates, Polish & End-to-End Testing

> **Before starting:** Read CLAUDE.md in full, then PROGRESS.md.
> Confirm Phases 1–6 are complete. This is the final phase.

---

## Phase 7 Goal

Implement the agent template library, team presets, agent export/import (.agentpack format), final polish on all UX flows, and comprehensive end-to-end testing. By the end of Phase 7, vscode-ext is feature-complete for v1 and ready for internal testing.

---

## Sub-phases

| Sub-phase | Name | Branch |
|-----------|------|--------|
| 7.1 | Agent template library & team presets | `phase/7-1-templates` |
| 7.2 | Agent export & import (.agentpack) | `phase/7-2-export-import` |
| 7.3 | UX polish & error handling | `phase/7-3-ux-polish` |
| 7.4 | End-to-end integration tests | `phase/7-4-e2e-tests` |
| 7.5 | Documentation & release prep | `phase/7-5-release-prep` |

---

## Sub-phase 7.1 — Agent Template Library & Team Presets

### What to build

The template library that provides pre-configured CLAUDE.md and tools.json content for all 8 built-in agent templates, plus the 4 team preset configurations.

### Files to create

```
packages/core/src/templates/
├── TemplateLibrary.ts
├── TemplateLibrary.test.ts
├── templates/
│   ├── frontend.ts
│   ├── backend.ts
│   ├── qa.ts
│   ├── security.ts
│   ├── devops.ts
│   ├── documentation.ts
│   ├── database.ts
│   └── reviewer.ts
├── presets/
│   ├── fullstack-web.ts
│   ├── api-service.ts
│   ├── open-source.ts
│   └── solo.ts
└── index.ts
```

### Template file structure

Each template file exports a `AgentTemplate` object:

```typescript
interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  role: string;
  defaultModel: ModelId;
  claudeMd: string;          // Full CLAUDE.md content for this agent type
  tools: AgentTools;         // Default tools.json content
  defaultApprovalRequired: ActionType[];
  defaultGitPermissions: GitPermissions;
}
```

### CLAUDE.md content for each template

Write thorough CLAUDE.md content for each template. Each should be 200-400 words covering:
1. Role description and primary responsibilities
2. What the agent should and should not do autonomously
3. How it should communicate with the Team Lead and other agents
4. Domain-specific best practices (e.g. the security agent's CLAUDE.md should reference OWASP)
5. How it should handle uncertainty (always ask rather than guess)
6. Output format preferences

Example for the `security` template CLAUDE.md:
```markdown
# Security Agent

## Role
You are a security specialist focused on identifying and addressing security vulnerabilities
in the codebase. Your primary responsibilities are...

## What You Do
- Audit code changes for OWASP Top 10 vulnerabilities
- Check dependencies for known CVEs using available audit tools
- Review authentication and authorisation implementations
- Detect hardcoded secrets, credentials, and sensitive data
...

## What You Do NOT Do Autonomously
- Modify security-critical code without approval
- Access production credentials or environment variables
- Push security patches directly to main without review
...

## Communication
When you find a vulnerability, report it to the Team Lead with:
- Severity level (Critical/High/Medium/Low)
- File and line number
- Description of the issue
- Recommended fix
...
```

Write equivalent thorough content for all 8 templates.

### Preset file structure

```typescript
interface TeamPreset {
  id: string;
  name: string;
  description: string;
  agents: Array<{
    templateId: string;
    customName?: string;
    modelOverride?: ModelId;
  }>;
}
```

### TemplateLibrary spec

```typescript
class TemplateLibrary {
  // Get all available templates
  getTemplates(): AgentTemplate[]

  // Get a specific template by ID
  getTemplate(id: string): AgentTemplate | undefined

  // Get all presets
  getPresets(): TeamPreset[]

  // Get a specific preset
  getPreset(id: string): TeamPreset | undefined

  // Instantiate an agent from a template
  // Returns a partial Agent config ready to be added to the team
  instantiateFromTemplate(
    templateId: string,
    overrides?: Partial<Agent>
  ): Omit<Agent, 'id'> & { claudeMd: string; tools: AgentTools }

  // Instantiate a full team from a preset
  // Returns array of agents ready to be added
  instantiateFromPreset(
    presetId: string,
    overrides?: Partial<Agent>[]
  ): Array<Omit<Agent, 'id'> & { claudeMd: string; tools: AgentTools }>
}
```

### Wire into ProjectNameCore

Update `ProjectNameCore.createTeam()` to use `TemplateLibrary.instantiateFromPreset()` when a preset name is provided.

### Update extension — addAgent command

Update `commands/addAgent.ts` to show the template list using `vscode.window.showQuickPick()`:
```
Templates:
  🖥️  Frontend — UI/UX, React/Vue, CSS, accessibility
  ⚙️  Backend — APIs, server logic, databases
  🧪  QA — Testing, coverage, regression
  🔒  Security — Vulnerabilities, CVEs, auth review
  🚀  DevOps — CI/CD, Docker, IaC
  📝  Documentation — READMEs, API docs, changelogs
  🗄️  Database — Schema, migrations, queries
  👁️  Code Reviewer — Quality, consistency, best practices
  ✨  Custom — Start from scratch
```

### Acceptance criteria
- [ ] All 8 templates have thorough CLAUDE.md content (200-400 words each)
- [ ] All 4 presets correctly reference template IDs
- [ ] `TemplateLibrary.instantiateFromPreset()` returns correct agent configs
- [ ] `createTeam()` with a preset name creates all preset agents
- [ ] `addAgent` command shows template picker in VS Code
- [ ] All tests pass

### Git
```bash
git checkout main && git pull origin main
git checkout -b phase/7-1-templates
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/templates): agent template library and team presets"
git push origin phase/7-1-templates
git checkout main && git merge phase/7-1-templates --no-ff -m "chore: merge phase/7-1-templates into main"
git push origin main && git branch -d phase/7-1-templates
git checkout -b phase/7-2-export-import
```

---

## Sub-phase 7.2 — Agent Export & Import (.agentpack)

### What to build

Allow agents to be exported to a portable `.agentpack` file and imported into another project. An agentpack is a ZIP archive containing the agent's configuration, CLAUDE.md, tools.json, and a sanitised memory snapshot.

### Install dependency

```bash
cd packages/core && npm install archiver unzipper
cd packages/core && npm install -D @types/archiver @types/unzipper
```

### Files to create

```
packages/core/src/templates/
├── AgentExporter.ts
├── AgentExporter.test.ts
├── AgentImporter.ts
└── AgentImporter.test.ts
```

### .agentpack format

A `.agentpack` file is a ZIP archive with this structure:

```
[agent-name].agentpack  (ZIP)
├── manifest.json           # Export metadata
├── agent.json              # Agent config (id, name, role, model, permissions, etc.)
├── CLAUDE.md               # Agent's CLAUDE.md
├── tools.json              # Agent's tools.json
└── memory/                 # Sanitised memory snapshot (optional)
    └── [key].json          # Individual memory entries
```

`manifest.json` format:
```json
{
  "version": "1.0",
  "exportedAt": "ISO8601",
  "exportedFrom": "project-name",
  "agentId": "frontend",
  "agentName": "Frontend Agent",
  "packVersion": "1"
}
```

### AgentExporter spec

```typescript
interface ExportOptions {
  agentId: string;
  projectRoot: string;
  includeMemory?: boolean;       // Default: true
  sanitiseMemory?: boolean;      // Default: true — strips project-specific references
  outputPath: string;            // Where to write the .agentpack file
}

class AgentExporter {
  constructor(private memoryManager: MemoryManager) {}

  async export(options: ExportOptions): Promise<string>
  // Returns the path to the created .agentpack file

  // Sanitise memory entries — remove project-specific paths, names, and URLs
  // Keep generic patterns, learnings, and preferences
  private sanitiseMemoryEntry(entry: MemoryEntry): MemoryEntry
}
```

### AgentImporter spec

```typescript
interface ImportOptions {
  packPath: string;             // Path to .agentpack file
  targetProjectRoot: string;
  agentIdOverride?: string;     // Use a different ID than what's in the pack
  agentNameOverride?: string;
}

interface ImportResult {
  agent: Agent;
  claudeMdPath: string;
  toolsPath: string;
  memoriesImported: number;
}

class AgentImporter {
  constructor(
    private teamRegistry: TeamRegistry,
    private memoryManager: MemoryManager
  ) {}

  async import(options: ImportOptions): Promise<ImportResult>
  // Steps:
  // 1. Unzip the .agentpack
  // 2. Read manifest.json and agent.json
  // 3. Check for ID conflicts, apply override if provided
  // 4. Create agent directory structure
  // 5. Write CLAUDE.md and tools.json
  // 6. Import memory entries if present
  // 7. Add agent to team.json
  // 8. Return ImportResult

  // Read pack manifest without fully importing (for preview)
  async preview(packPath: string): Promise<{ manifest: object; agent: Agent }>
}
```

### Wire into extension commands

`commands/exportAgent.ts`:
```typescript
// Show agent picker → pick save location → export → show success with file path
const agents = team.agents;
const pick = await vscode.window.showQuickPick(agents.map(a => ({ label: a.name, id: a.id })));
const saveUri = await vscode.window.showSaveDialog({ filters: { 'Agent Pack': ['agentpack'] } });
// ... export ...
void vscode.window.showInformationMessage(`Agent exported to ${saveUri.fsPath}`);
```

`commands/importAgent.ts`:
```typescript
// Show file picker (*.agentpack) → preview → confirm → import → show success
const fileUri = await vscode.window.showOpenDialog({ filters: { 'Agent Pack': ['agentpack'] } });
const preview = await importer.preview(fileUri[0].fsPath);
const confirm = await vscode.window.showInformationMessage(
  `Import "${preview.agent.name}" (${preview.agent.role})?`,
  'Import', 'Cancel'
);
if (confirm === 'Import') { /* ... import ... */ }
```

### Acceptance criteria
- [ ] Export creates a valid ZIP file with correct structure
- [ ] Memory is sanitised before export
- [ ] Import correctly creates agent directory and registers in team.json
- [ ] ID conflict is handled (rename with suffix or use override)
- [ ] Preview works without importing
- [ ] Extension commands wire correctly
- [ ] All tests pass

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(core/templates): agent export/import .agentpack format"
git push origin phase/7-2-export-import
git checkout main && git merge phase/7-2-export-import --no-ff -m "chore: merge phase/7-2-export-import into main"
git push origin main && git branch -d phase/7-2-export-import
git checkout -b phase/7-3-ux-polish
```

---

## Sub-phase 7.3 — UX Polish & Error Handling

### What to build

Audit and improve all user-facing flows: error states, loading states, empty states, edge cases, and accessibility. No new features — just making everything already built feel solid and professional.

### Checklist of things to audit and fix

**Chat Panel:**
- [ ] Loading spinner when waiting for agent response
- [ ] Error state when API key is missing or invalid
- [ ] Empty state when no team is initialised (show initTeam CTA)
- [ ] Long messages scroll correctly without breaking layout
- [ ] Agent @mention autocomplete works for all registered agents
- [ ] Sending empty message is prevented
- [ ] Chat history persists across panel close/reopen (store in VS Code globalState)

**Approval Queue:**
- [ ] Empty state: "No pending approvals — your agents are working within their permissions"
- [ ] Modify parameters editor validates JSON before allowing submission
- [ ] Reject button requires non-empty feedback
- [ ] Resolved items fade out rather than vanishing abruptly
- [ ] Queue item count shown in panel title: "Approval Queue (3)"

**Status Bar:**
- [ ] Cost formatted correctly (e.g. "$0.03" not "$0.034567")
- [ ] Tooltip shows breakdown: "2 active agents | 1 pending approval | $0.03 spent"
- [ ] Pulsing animation stops when no agents are active
- [ ] Correct icon used ($(robot) when idle, $(loading~spin) when active)

**File Decorations:**
- [ ] Decorations cleared immediately when task completes (no stale badges)
- [ ] Tooltip shows: "Being worked on by: [Agent Name]"
- [ ] Badge colour distinguishes active (blue) from waiting approval (yellow)

**Extension Startup:**
- [ ] Clear error shown if `ANTHROPIC_API_KEY` is not set
- [ ] Extension handles corrupt `team.json` gracefully (show error + option to reinitialise)
- [ ] Handles missing `.agent/` directory gracefully
- [ ] Works correctly with multiple workspace folders open simultaneously

**Error messages:**
All user-facing error messages should be:
- Specific (say what went wrong)
- Actionable (say what the user can do about it)
- Not expose internal stack traces

Audit every `showErrorMessage` call and improve any that are vague.

**Keyboard shortcuts:**
Add default keyboard shortcuts for the most common commands:
```json
{
  "keybindings": [
    { "command": "projectname.startChat", "key": "ctrl+shift+a", "mac": "cmd+shift+a" },
    { "command": "projectname.openApprovalQueue", "key": "ctrl+shift+q", "mac": "cmd+shift+q" }
  ]
}
```

Add to `package.json` contributes.

### Acceptance criteria
- [ ] All empty states have helpful messages
- [ ] All error states are specific and actionable
- [ ] Loading states prevent duplicate submissions
- [ ] Chat history persists across panel close/reopen
- [ ] Keyboard shortcuts work
- [ ] Extension handles startup edge cases gracefully

### Git
```bash
npm run lint && npm run build
git add -A
git commit -m "chore(extension): UX polish, error handling, empty states, keyboard shortcuts"
git push origin phase/7-3-ux-polish
git checkout main && git merge phase/7-3-ux-polish --no-ff -m "chore: merge phase/7-3-ux-polish into main"
git push origin main && git branch -d phase/7-3-ux-polish
git checkout -b phase/7-4-e2e-tests
```

---

## Sub-phase 7.4 — End-to-End Integration Tests

### What to build

Integration tests that exercise complete workflows through `ProjectNameCore` with a real (but minimal) file system, and mocked Claude Agent SDK. These tests verify that all the modules from Phases 1-7 work together correctly.

### Files to create

```
packages/core/src/__tests__/
├── e2e/
│   ├── setup.ts                  # Test utilities: temp dirs, mock SDK
│   ├── workflow-init.test.ts     # Project initialisation flow
│   ├── workflow-chat.test.ts     # Chat → task delegation → completion
│   ├── workflow-approval.test.ts # Approval gate flow end-to-end
│   ├── workflow-git.test.ts      # Git workflow (with mocked simple-git)
│   └── workflow-export.test.ts   # Export/import agent pack
```

### Test scenarios

**workflow-init.test.ts:**
```typescript
describe('Project Initialisation', () => {
  it('initialises a fresh project with a preset', async () => {
    // 1. Create ProjectNameCore with temp dir
    // 2. core.createTeam('my-app', 'api-service')
    // 3. Assert: .agent/ directory created
    // 4. Assert: team.json contains Team Lead + backend + documentation + qa
    // 5. Assert: each agent has its own directory
    // 6. Assert: core.isInitialized() returns true
    // 7. Assert: core.getTeam() returns correct team config
  });

  it('loads an existing team on second initialize()', async () => { ... });
  it('handles missing .agent/ directory gracefully', async () => { ... });
  it('handles corrupt team.json gracefully', async () => { ... });
});
```

**workflow-chat.test.ts:**
```typescript
describe('Chat → Delegation → Completion', () => {
  it('routes message to Team Lead and receives response', async () => {
    // Mock SDK to return a response without tasks block
    // Assert: response returned to caller
    // Assert: no tasks created
  });

  it('Team Lead delegates tasks to agents', async () => {
    // Mock SDK: Team Lead returns a <tasks> block with 2 tasks
    // Mock SDK: each agent completes its task
    // Assert: 2 tasks created in task queue
    // Assert: each task assigned to correct agent
    // Assert: final result is synthesis from Team Lead
    // Assert: cost tracked correctly
  });

  it('direct message bypasses Team Lead', async () => {
    // core.chat('Review this component', 'frontend')
    // Assert: SDK called directly with frontend agent context
    // Assert: Team Lead not involved
  });
});
```

**workflow-approval.test.ts:**
```typescript
describe('Approval Gate End-to-End', () => {
  it('auto-risk actions execute without approval', async () => {
    // Configure agent with 'modifyFile' as auto
    // Trigger action
    // Assert: approval queue stays empty
    // Assert: action executed
  });

  it('low-risk action is queued and resolves on approval', async () => {
    // Trigger a low-risk action
    // Assert: approval request added to queue
    // Simulate user approval (call resolveApproval)
    // Assert: action executes after approval
    // Assert: audit log entry written
  });

  it('rejected action does not execute', async () => {
    // Trigger action
    // Reject it
    // Assert: action does not execute
    // Assert: agent receives rejection feedback
  });
});
```

**workflow-git.test.ts:**
```typescript
describe('Git Workflow', () => {
  it('creates agent branch following naming convention', async () => {
    // Mock simple-git
    // Agent completes task that triggers git workflow
    // Assert: branch name matches agent/[id]/[slug] pattern
  });

  it('commit message formatted correctly', async () => { ... });
  it('agent without push permission does not push', async () => { ... });
  it('conflict guard prevents simultaneous file edits', async () => { ... });
});
```

**workflow-export.test.ts:**
```typescript
describe('Agent Export/Import', () => {
  it('exports agent to valid .agentpack file', async () => {
    // Create a team with a configured agent
    // Export the agent
    // Assert: .agentpack file created
    // Assert: ZIP contains manifest.json, agent.json, CLAUDE.md, tools.json
  });

  it('imports .agentpack into a new project', async () => {
    // Export from project A
    // Import into project B
    // Assert: agent appears in project B's team.json
    // Assert: CLAUDE.md and tools.json match original
  });

  it('handles ID conflicts on import', async () => { ... });
});
```

### Acceptance criteria
- [ ] All 5 workflow test files pass
- [ ] No tests rely on real network calls or real file system beyond temp dirs
- [ ] All edge cases documented in test descriptions
- [ ] >= 80% overall coverage on `packages/core`

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "test(core): comprehensive end-to-end integration test suite"
git push origin phase/7-4-e2e-tests
git checkout main && git merge phase/7-4-e2e-tests --no-ff -m "chore: merge phase/7-4-e2e-tests into main"
git push origin main && git branch -d phase/7-4-e2e-tests
git checkout -b phase/7-5-release-prep
```

---

## Sub-phase 7.5 — Documentation & Release Prep

### What to build

Write the README, CONTRIBUTING guide, and CHANGELOG. Package the extension as a `.vsix`. Prepare for v0.1.0 release.

### Files to create / update

```
vscode-ext/
├── README.md                    # User-facing readme
├── CONTRIBUTING.md              # Developer guide
├── CHANGELOG.md                 # Version history
└── packages/extension/
    └── README.md                # Extension marketplace readme (same content as root)
```

### README.md content

Write a comprehensive README covering:
1. **What is vscode-ext?** — 2-3 sentence pitch
2. **Features** — bullet list of v1 features
3. **Requirements** — VS Code version, Node.js version, Claude API key, `gh` CLI for PR features
4. **Installation** — from marketplace (placeholder) and from VSIX
5. **Quick Start** — step-by-step: install → open project → run initTeam → add first agent → send first message
6. **Agent Team Structure** — explain the `.agent/` directory, team.json, CLAUDE.md hierarchy
7. **Agent Templates** — table of all 8 templates with descriptions
8. **Approval System** — explain the 3-tier approval system
9. **Git Integration** — explain agent git permissions and branch conventions
10. **Memory** — explain project vs agent memory, pluggable backends
11. **Configuration** — all configurable options in team.json
12. **Keyboard Shortcuts** — list of shortcuts
13. **FAQ** — 5-10 common questions
14. **Contributing** — link to CONTRIBUTING.md

### Package the extension

```bash
cd packages/extension
npm install -g @vscode/vsce
vsce package --out ../../dist/projectname-0.1.0.vsix
```

Ensure `packages/extension/package.json` has all required marketplace fields:
- `publisher`
- `displayName`
- `description`
- `categories`
- `keywords`
- `icon` (create a simple 128x128 icon)
- `repository`
- `license`

### Tag the release

```bash
git tag -a v0.1.0 -m "v0.1.0 — Initial release"
git push origin v0.1.0
```

Create a GitHub release:
```bash
gh release create v0.1.0 dist/projectname-0.1.0.vsix \
  --title "v0.1.0 — Initial Release" \
  --notes "First release of vscode-ext..."
```

### Acceptance criteria
- [ ] README.md is comprehensive and accurate
- [ ] CONTRIBUTING.md explains how to set up dev environment and run tests
- [ ] CHANGELOG.md has v0.1.0 entry
- [ ] `.vsix` file builds successfully
- [ ] GitHub release created with `.vsix` attached
- [ ] v0.1.0 tag pushed

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "docs: README, CONTRIBUTING, CHANGELOG — v0.1.0 release prep"
git push origin phase/7-5-release-prep
git checkout main && git merge phase/7-5-release-prep --no-ff -m "chore: merge phase/7-5-release-prep into main — Phase 7 complete"
git push origin main && git branch -d phase/7-5-release-prep
git tag -a v0.1.0 -m "v0.1.0 — Initial release"
git push origin v0.1.0
```

### Final PROGRESS.md update

```markdown
## Status: v0.1.0 COMPLETE

All 7 phases complete. Extension packaged as .vsix and released on GitHub.

## What Was Built
[Full summary of everything built across all phases]

## Known Limitations for v2
- Vector memory backend (semantic search)
- Agent marketplace
- Parallel execution with git worktrees
- Multi-model support
```

---

## Phase 7 Complete Checklist

- [ ] All 8 agent templates have thorough CLAUDE.md content
- [ ] All 4 presets instantiate correctly
- [ ] Export/import produces valid, portable .agentpack files
- [ ] All UX edge cases handled with clear messaging
- [ ] Keyboard shortcuts registered
- [ ] All e2e integration tests pass
- [ ] >= 80% coverage on packages/core
- [ ] README, CONTRIBUTING, CHANGELOG written
- [ ] .vsix package builds successfully
- [ ] GitHub release v0.1.0 created
- [ ] PROGRESS.md marks project complete

---

## 🎉 vscode-ext v1.0 Feature Complete

At this point, the following are all working:
- Persistent agent teams per project
- Team Lead orchestration with task delegation
- Direct agent @mention access
- Agent-to-agent messaging via inbox files
- Pluggable memory backends (files + SQLite)
- Human-in-the-loop approval gates (3-tier)
- Per-agent git permissions with branch/commit/PR automation
- Agent template library (8 templates, 4 presets)
- Agent export/import (.agentpack)
- Full VS Code UI (Agent Panel, Approval Queue, Audit Log, Status Bar, File Decorations)
- Comprehensive test suite
