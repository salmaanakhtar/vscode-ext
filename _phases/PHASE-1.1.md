# Phase 1.1 — Monorepo Scaffold & GitHub Setup

> Read CLAUDE.md fully before starting this phase.
> This is the very first phase. No prior work exists.

---

## Goal

Create the complete monorepo skeleton — all directories, config files, workspace setup, and root scripts. Push to a new private GitHub repository. Nothing is implemented yet, just the scaffold.

---

## Branch

```bash
git init
git checkout -b phase/1.1-monorepo-scaffold
```

---

## GitHub Setup

Run this after the initial commit:

```bash
# Create the repo if it does not exist
gh repo view [projectname] 2>/dev/null || gh repo create [projectname] --private --source=. --push

# If repo already exists, just add remote and push
git remote add origin https://github.com/[your-username]/[projectname].git
git push -u origin phase/1.1-monorepo-scaffold
```

---

## Deliverables

### 1. Root `package.json`

```json
{
  "name": "[projectname]",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "eslint packages/*/src --ext .ts,.tsx",
    "coverage": "vitest run --coverage",
    "clean": "rimraf packages/*/dist packages/*/node_modules"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "rimraf": "^5.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0"
  }
}
```

### 2. Root `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### 3. Root `.eslintrc.js`

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'no-console': 'warn'
  },
  env: {
    node: true,
    es2022: true
  }
};
```

### 4. Root `.gitignore`

```
node_modules/
dist/
*.js.map
*.d.ts.map
coverage/
.vscode-test/
*.vsix
out/
.DS_Store
*.log
.env
.env.local
```

### 5. `packages/shared/` scaffold

```
packages/shared/
├── package.json
├── tsconfig.json
└── src/
    ├── types/
    │   └── .gitkeep
    ├── interfaces/
    │   └── .gitkeep
    └── index.ts        # empty export for now
```

`packages/shared/package.json`:
```json
{
  "name": "@[projectname]/shared",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### 6. `packages/core/` scaffold

```
packages/core/
├── package.json
├── tsconfig.json
└── src/
    ├── memory/
    │   └── .gitkeep
    ├── registry/
    │   └── .gitkeep
    ├── runtime/
    │   └── .gitkeep
    ├── bus/
    │   └── .gitkeep
    ├── gate/
    │   └── .gitkeep
    ├── orchestrator/
    │   └── .gitkeep
    ├── git/
    │   └── .gitkeep
    ├── templates/
    │   └── .gitkeep
    └── index.ts        # empty export for now
```

`packages/core/package.json`:
```json
{
  "name": "@[projectname]/core",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@[projectname]/shared": "*"
  },
  "devDependencies": {
    "better-sqlite3": "^9.0.0",
    "chokidar": "^3.6.0",
    "simple-git": "^3.22.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@[projectname]/shared": ["../shared/src"]
    }
  },
  "include": ["src"]
}
```

### 7. `packages/extension/` scaffold

```
packages/extension/
├── package.json
├── tsconfig.json
└── src/
    ├── panels/
    │   └── .gitkeep
    ├── providers/
    │   └── .gitkeep
    ├── commands/
    │   └── .gitkeep
    ├── statusbar/
    │   └── .gitkeep
    └── extension.ts    # stub activate/deactivate
```

`packages/extension/src/extension.ts` (stub):
```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  console.log('[ProjectName] extension activated');
}

export function deactivate(): void {
  console.log('[ProjectName] extension deactivated');
}
```

`packages/extension/package.json`:
```json
{
  "name": "[projectname]",
  "displayName": "[ProjectName]",
  "description": "Persistent AI agent teams for your VS Code projects",
  "version": "0.1.0",
  "private": true,
  "engines": { "vscode": "^1.85.0" },
  "categories": ["AI", "Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node",
    "typecheck": "tsc --noEmit",
    "watch": "npm run build -- --watch",
    "package": "vsce package"
  },
  "dependencies": {
    "@[projectname]/core": "*",
    "@[projectname]/shared": "*"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^2.0.0",
    "esbuild": "^0.20.0"
  },
  "contributes": {
    "viewsContainers": {
      "activitybar": [{ "id": "projectname-sidebar", "title": "[ProjectName]", "icon": "resources/icon.svg" }],
      "panel": [{ "id": "projectname-panel", "title": "[ProjectName] Approvals" }]
    },
    "views": {
      "projectname-sidebar": [
        { "id": "projectname.agentTeam", "name": "Agent Team", "type": "webview" },
        { "id": "projectname.agentActivity", "name": "Activity", "type": "tree" }
      ],
      "projectname-panel": [
        { "id": "projectname.approvalQueue", "name": "Approval Queue", "type": "webview" }
      ]
    },
    "commands": [
      { "command": "projectname.initTeam", "title": "[ProjectName]: Initialise Agent Team" },
      { "command": "projectname.addAgent", "title": "[ProjectName]: Add Agent" },
      { "command": "projectname.startTeamLead", "title": "[ProjectName]: Start Team Lead" },
      { "command": "projectname.openApprovalQueue", "title": "[ProjectName]: Open Approval Queue" },
      { "command": "projectname.exportAgent", "title": "[ProjectName]: Export Agent" },
      { "command": "projectname.importAgent", "title": "[ProjectName]: Import Agent" },
      { "command": "projectname.viewProgress", "title": "[ProjectName]: View Agent Progress" }
    ]
  }
}
```

`packages/extension/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"],
    "paths": {
      "@[projectname]/shared": ["../shared/src"],
      "@[projectname]/core": ["../core/src"]
    }
  },
  "include": ["src"]
}
```

### 8. `resources/` directory

Create `packages/extension/resources/icon.svg` — a simple placeholder SVG:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="10"/>
  <path d="M8 12h8M12 8v8"/>
</svg>
```

---

## Acceptance Criteria

Before merging, verify ALL of the following:

- [ ] `npm install` runs from root without errors
- [ ] All three `package.json` files are valid JSON
- [ ] All three `tsconfig.json` files are valid
- [ ] `packages/shared/src/index.ts` exports cleanly (even if empty)
- [ ] `packages/core/src/index.ts` exports cleanly
- [ ] `packages/extension/src/extension.ts` compiles without errors
- [ ] Root `npm run typecheck` passes across all packages
- [ ] Root `npm run lint` runs without error (warnings OK)
- [ ] GitHub repo exists and branch is pushed
- [ ] No `node_modules` in git

---

## Self-Review & Merge

```bash
npm install
npm run typecheck
npm run lint
grep -r "from 'vscode'" packages/core packages/shared && echo "VIOLATION" || echo "OK"
git diff main...HEAD

# If all pass:
git checkout main
git merge phase/1.1-monorepo-scaffold --no-ff -m "merge: complete phase 1.1 — monorepo scaffold"
git push origin main
git tag -a "phase-1.1-complete" -m "Phase 1.1 complete: monorepo scaffold"
git push origin --tags
```

---

## PROGRESS.md Update

After merging, update PROGRESS.md marking Phase 1.1 complete and noting that Phase 1.2 (Shared Types) is next.

---

## Next Phase

**Phase 1.2 — Shared Types & Interfaces**
Load `_phases/PHASE-1.2.md` in the next session.
