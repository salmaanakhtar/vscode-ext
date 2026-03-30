# Contributing to vscode-ext

Thank you for your interest in contributing. This guide covers everything you need to get the project running locally, understand the architecture, and submit a change.

---

## Table of Contents

- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Dev setup](#dev-setup)
- [Running tests](#running-tests)
- [Linting and type-checking](#linting-and-type-checking)
- [Branch strategy](#branch-strategy)
- [Commit conventions](#commit-conventions)
- [Pre-push checklist](#pre-push-checklist)
- [Architectural rules (non-negotiable)](#architectural-rules)
- [Adding a new agent template](#adding-a-new-agent-template)

---

## Project structure

```
vscode-ext/
├── packages/
│   ├── shared/     # Canonical TypeScript types, interfaces, utilities
│   ├── core/       # Standalone agent engine — zero vscode dependencies
│   └── extension/  # VS Code extension shell — thin wrapper over core
├── _phases/        # Phase spec files (read-only historical context)
├── CLAUDE.md       # Master development context — read before any session
└── PROGRESS.md     # Session handoff log
```

The monorepo uses npm workspaces. Packages reference each other as `@vscode-ext/shared` and `@vscode-ext/core`.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18 or later | https://nodejs.org |
| npm | 9 or later | bundled with Node.js |
| Git | any recent | https://git-scm.com |
| VS Code | 1.85+ | https://code.visualstudio.com |

Optional but useful:

- `gh` CLI — for PR operations in tests and release workflows
- Claude Code CLI — `npm install -g @anthropic-ai/claude-code` + `claude login`

---

## Dev setup

```bash
# Clone the repository
git clone https://github.com/salmaanakhtar/vscode-ext.git
cd vscode-ext

# Install all dependencies (root + all packages)
npm install

# Verify everything compiles
npm run typecheck

# Run the full test suite
npm run test
```

To build the extension bundle:

```bash
cd packages/extension
npm run build
```

To run the extension in a VS Code Extension Development Host:
1. Open the repo root in VS Code.
2. Press `F5` (or **Run → Start Debugging**).
3. A new VS Code window opens with the extension loaded.

---

## Running tests

```bash
# Run all tests across all packages
npm run test

# Run tests for a specific package
cd packages/core && npm run test
cd packages/shared && npm run test
cd packages/extension && npm run test

# Watch mode
npm run test:watch
```

Tests use [Vitest](https://vitest.dev/). Test files live in `__tests__/` directories alongside the source they test.

### Coverage

The project targets ≥ 80% coverage on `packages/core` and `packages/shared`. Run coverage with:

```bash
cd packages/core && npx vitest run --coverage
```

---

## Linting and type-checking

```bash
# Type-check all packages
npm run typecheck

# Lint all packages (zero errors required, warnings OK)
npm run lint
```

ESLint config is at `.eslintrc.js` in the repo root. TypeScript base config is at `tsconfig.base.json`.

Notable lint rules:
- `@typescript-eslint/no-explicit-any` — always add a comment when `any` is genuinely unavoidable
- `@typescript-eslint/no-var-requires` — use the correct rule name for `require()` disable comments (not `no-require-imports`)

---

## Branch strategy

Every feature, fix, or phase gets its own branch off `main`:

```bash
git checkout main
git pull origin main
git checkout -b type/short-description
# e.g. feat/template-go-agent
#      fix/approval-gate-race
#      test/registry-edge-cases
```

Phase branches follow the pattern `phase/N-M-description` (e.g. `phase/7-5-release-prep`).

Never commit directly to `main`.

---

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

Types:  feat, fix, test, refactor, docs, chore, build
Scopes: core, extension, shared, memory, runtime, messaging,
        approval, orchestrator, git, templates, ui, config
```

Examples:

```
feat(core/templates): add Go agent template
fix(core/approval): handle concurrent approval requests correctly
test(shared): add validation edge-case tests
docs(root): update README quick-start section
```

---

## Pre-push checklist

Run all three before every push. Fix failures before pushing — never push broken code.

```bash
npm run typecheck   # zero TS errors
npm run lint        # zero ESLint errors
npm run test        # all tests pass
```

---

## Architectural rules

These rules are non-negotiable. A PR that violates any of them will not be merged.

1. **`packages/core` has zero VS Code dependencies.** It must be importable in a plain Node.js environment.
2. **All agent logic lives in `packages/core`.** The extension is a thin shell.
3. **Memory backends are pluggable** — implement `MemoryAdapter` from `@vscode-ext/shared`.
4. **`ApprovalGate` intercepts ALL potentially destructive actions.**
5. **TypeScript strict mode everywhere** — `strict: true`, no unexcused `any`.
6. **Every module has unit tests** — minimum 80% coverage on new code.
7. **Agent state lives in `.agent/`** — never store runtime state elsewhere.
8. **Agents communicate via file-based inbox only** — no direct in-process calls between agent sessions.
9. **No secrets in committed files.**

---

## Adding a new agent template

1. Create `packages/core/src/templates/templates/[name].ts` exporting an `AgentTemplate` object.
2. Write a thorough `claudeMdTemplate` — 200–400 words covering role, autonomy limits, communication conventions, and domain best practices.
3. Register the template in `AgentTemplates.ALL_TEMPLATES` inside `AgentTemplates.ts`.
4. Add tests in `packages/core/src/__tests__/templates/`.
5. Document the template in the README table.

See the existing `backend.ts` or `security.ts` template as a reference.

---

## Questions?

Open an issue on GitHub: https://github.com/salmaanakhtar/vscode-ext/issues
