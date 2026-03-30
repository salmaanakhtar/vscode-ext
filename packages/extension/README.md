# vscode-ext

**Persistent AI agent teams for your VS Code projects.**

vscode-ext brings a coordinated team of specialised AI agents into your editor. Instead of a single assistant, you register a **Team Lead** plus specialist agents (Frontend, Backend, QA, Security, and more) that collaborate on your codebase, accumulate project-specific memory, and grow more effective over time — all without leaving VS Code.

---

## Features

- **Persistent agent teams** — teams survive across sessions; agents remember past decisions and context
- **Team Lead orchestration** — routes tasks to the right agent automatically, synthesises results
- **8 built-in agent templates** — Frontend, Backend, QA, Security, DevOps, Documentation, Database, Code Reviewer
- **4 team presets** — spin up a fully configured team in seconds
- **Human-in-the-loop approvals** — three-tier gate (auto / notify / block) before any risky action
- **Per-agent git permissions** — fine-grained control over branch, commit, push, PR, and merge
- **Pluggable memory** — file-based (default) or SQLite backends; project and per-agent memory
- **Agent export / import** — portable `.agentpack` files to share agents across projects
- **Direct agent @mention** — bypass the Team Lead and talk to any specialist directly
- **Audit trail** — every approval decision is logged with timestamp and reasoning

---

## Requirements

| Requirement | Version |
|-------------|---------|
| VS Code | 1.85 or later |
| Node.js | 18 or later |
| Claude Code CLI | latest (`npm install -g @anthropic-ai/claude-code`) |
| `gh` CLI | optional — required for PR creation (`brew install gh` / `winget install gh`) |

> **Authentication** — vscode-ext does not use an API key directly. It invokes the `claude` CLI subprocess, which uses your existing Claude Code authentication. Run `claude login` once to authenticate.

---

## Installation

### From VSIX (recommended for early access)

1. Download `vscode-ext-0.1.0.vsix` from the [latest GitHub release](https://github.com/salmaanakhtar/vscode-ext/releases).
2. In VS Code: **Extensions** → **…** menu → **Install from VSIX…** → select the file.
3. Reload VS Code when prompted.

### From the Marketplace

> Marketplace listing coming soon.

---

## Quick Start

### 1. Open your project

Open any folder in VS Code. vscode-ext creates a `.agent/` directory inside your project — nothing outside your project root is modified.

### 2. Initialise a team

Open the Command Palette (`Ctrl+Shift+P`) and run:

```
vscode-ext: Initialise Agent Team
```

Pick a team preset (e.g. **fullstack-web**) and give your project a name. This creates `.agent/team.json` and the directory structure for each agent.

### 3. Add or customise agents

```
vscode-ext: Add Agent
```

Choose a template from the picker or start from scratch. Each agent gets its own `CLAUDE.md` with role-specific instructions.

### 4. Start the Team Lead

```
vscode-ext: Start Team Lead
```

The Team Lead is now listening. Open the **Agent Panel** (`Ctrl+Shift+A`) to start chatting.

### 5. Send your first message

Type in the Agent Panel and press **Enter**. The Team Lead will decide whether to handle the request itself or delegate subtasks to specialists.

To talk directly to a specific agent, prefix your message with `@agent-name`:

```
@backend Add rate limiting to the /auth endpoints
```

---

## Agent Team Structure

vscode-ext creates a `.agent/` directory in your project root at runtime:

```
your-project/
└── .agent/
    ├── team.json          # Team manifest — agents, models, permissions
    ├── CLAUDE.md          # Shared instructions for all agents
    ├── memory/            # Project-level memory (decisions, context, tasks, audit)
    ├── team-lead/         # Team Lead CLAUDE.md and per-session memory
    ├── agents/
    │   └── [agent-id]/    # Per-agent CLAUDE.md, memory, and tools.json
    └── inbox/             # File-based message bus (agent-to-agent)
```

`team.json` is the single source of truth for your team configuration. You can edit it directly — changes take effect on the next session start.

---

## Agent Templates

| Template | Role | Default Model |
|----------|------|---------------|
| `frontend` | UI/UX, component architecture, CSS, accessibility | claude-sonnet-4-6 |
| `backend` | REST APIs, server logic, input validation, security | claude-sonnet-4-6 |
| `qa` | Test pyramid, coverage, edge cases, CI integration | claude-haiku-4-5-20251001 |
| `security` | OWASP Top 10, CVE scanning, auth review, secrets hygiene | claude-sonnet-4-6 |
| `devops` | CI/CD, Docker, IaC, rollback procedures | claude-sonnet-4-6 |
| `documentation` | READMEs, API docs, changelogs, keeping docs in sync | claude-haiku-4-5-20251001 |
| `database` | Migrations, index strategy, query performance, data integrity | claude-sonnet-4-6 |
| `reviewer` | Code quality, consistency, constructive feedback | claude-sonnet-4-6 |

Each template ships with a pre-written `CLAUDE.md` that describes the agent's responsibilities, autonomy limits, and communication conventions.

---

## Team Presets

| Preset | Agents |
|--------|--------|
| `fullstack-web` | Team Lead + frontend + backend + qa + security |
| `api-service` | Team Lead + backend + documentation + qa |
| `open-source` | Team Lead + reviewer + documentation + qa |
| `solo` | Team Lead + general (broad permissions) |

---

## Approval System

Every agent action is classified before execution:

| Risk Level | Examples | Behaviour |
|------------|----------|-----------|
| **Auto** | Read files, search, write agent memory, send messages | Executes immediately — no interruption |
| **Low** | Create files, install packages, create git branches | VS Code notification popup — approve in one click |
| **Medium** | Modify files outside agent scope, run shell scripts, push to remote | Approval Queue panel — review before proceeding |
| **High** | Delete files, force-push, modify CI/CD, access env vars | Blocking Approval Queue — must explicitly approve |

Open the Approval Queue with `Ctrl+Shift+Q`. Every decision (approve, reject, or modify with parameters) is written to `.agent/memory/audit.md`.

---

## Git Integration

Each agent can be granted individual git permissions in `team.json`:

```json
{
  "git": {
    "canBranch": true,
    "canCommit": true,
    "canPush": false,
    "canCreatePR": false,
    "canMerge": false
  }
}
```

Agents that can branch follow the naming convention `agent/[agent-id]/[task-slug]`.

Commits made by agents are tagged with the agent ID so the audit trail is clear.

The global `git` config in `team.json` sets `requireReviewBeforeMerge` and `agentBranchPrefix` for the whole team.

> **PR creation** requires the `gh` CLI to be installed and authenticated.

---

## Memory

vscode-ext maintains two layers of memory:

- **Project memory** — decisions, context, and tasks shared across the whole team (`/.agent/memory/`)
- **Agent memory** — per-agent preferences, patterns, and learnings (`/.agent/agents/[id]/memory/`)

### Memory backends

The default backend stores memory as Markdown and JSON files — human-readable and git-friendly.

To switch to SQLite for larger projects, edit `team.json`:

```json
{
  "memory": {
    "backend": "sqlite",
    "path": ".agent/memory/store.db"
  }
}
```

A custom backend can be wired in by implementing the `MemoryAdapter` interface and setting `customAdapterPath`.

---

## Configuration

All configuration lives in `.agent/team.json`. The key fields:

```jsonc
{
  "version": "1.0",
  "project": "my-app",
  "teamLead": {
    "model": "claude-sonnet-4-6",
    "maxTurns": 20
  },
  "agents": [
    {
      "id": "backend",
      "name": "Backend Agent",
      "role": "API and server-side logic",
      "model": "claude-sonnet-4-6",
      "maxTurns": 15,
      "git": { "canBranch": true, "canCommit": true, "canPush": false, "canCreatePR": false, "canMerge": false },
      "approvalRequired": ["deleteFile", "push", "runScript", "modifyConfig", "installPackage"],
      "builtinTools": ["Read", "Write", "Bash", "Glob", "Grep"]
    }
  ],
  "memory": { "backend": "files", "path": ".agent/memory" },
  "git": {
    "defaultBranch": "main",
    "agentBranchPrefix": "agent",
    "requireReviewBeforeMerge": true
  }
}
```

`maxTurns` controls how many Claude Code CLI turns an agent may take per task. Tune this to balance thoroughness and token usage.

---

## Keyboard Shortcuts

| Shortcut | Mac | Action |
|----------|-----|--------|
| `Ctrl+Shift+A` | `Cmd+Shift+A` | Open Agent Panel |
| `Ctrl+Shift+Q` | `Cmd+Shift+Q` | Open Approval Queue |

---

## Agent Export & Import

Share a configured agent between projects using `.agentpack` files:

```
vscode-ext: Export Agent   →  saves [agent-name].agentpack
vscode-ext: Import Agent   →  picks a .agentpack file and registers it in the current project
```

An `.agentpack` is a gzip-compressed JSON bundle containing the agent configuration, `CLAUDE.md`, tools list, and an optional sanitised memory snapshot. Project-specific paths and names are stripped on export so the pack is portable.

---

## FAQ

**Do I need an Anthropic API key?**
No. vscode-ext invokes the `claude` CLI subprocess, which uses your existing Claude Code authentication (Pro/Max subscription). Run `claude login` once and you're set.

**Does vscode-ext send my code to the cloud?**
Only when an agent runs a task. Each task invokes the `claude` CLI exactly as you would from the terminal — same data handling as normal Claude Code usage.

**Can I use a different AI model per agent?**
Yes. Set `"model"` in each agent's entry in `team.json`. Available values: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`.

**What happens if I close VS Code mid-task?**
Tasks are written to the `.agent/` filesystem before the agent starts. When you reopen VS Code the extension reloads team state. Any in-flight task will be marked as interrupted and can be retried.

**Can I have multiple teams (e.g. one per branch)?**
Not in v0.1.0 — one `.agent/` directory per workspace folder. Multi-team support is planned for v2.

**How do I reset the team?**
Delete the `.agent/` directory and run `vscode-ext: Initialise Agent Team` again. This clears all memory and agent state.

**Can agents talk to each other directly?**
Agents communicate via file-based inboxes (`/.agent/inbox/[agent-id].md`). The Team Lead routes messages; agents do not call each other directly in-process.

**Is the `.agent/` directory safe to commit?**
You can commit it — it contains no secrets by default. Add `/.agent/memory/*.db` to `.gitignore` if you use the SQLite backend. The `.agentpack` files produced by export are also safe to commit or share.

**What does `maxTurns` control?**
`maxTurns` limits how many back-and-forth turns the Claude Code CLI may take within a single task invocation. It prevents runaway tasks, not total project usage.

**I got an error saying `claude` is not found.**
Install Claude Code: `npm install -g @anthropic-ai/claude-code` then authenticate: `claude login`. See the [Claude Code documentation](https://docs.anthropic.com/claude-code) for details.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, branch strategy, and contribution guidelines.

---

## License

MIT — see [LICENSE](LICENSE).
