# Phase 6 — Approval Queue UI

> **Before starting:** Read CLAUDE.md in full, then PROGRESS.md.
> Confirm Phases 1–5 are complete before proceeding.

---

## Phase 6 Goal

Build the full Approval Queue UI — the dedicated panel where developers review, approve, reject, or modify pending agent actions. Also implement the three-tier notification routing (popup for low risk, queue panel for medium, blocking for high) and the audit log viewer.

---

## Sub-phases

| Sub-phase | Name | Branch |
|-----------|------|--------|
| 6.1 | Approval Queue panel (webview) | `phase/6-1-approval-queue-panel` |
| 6.2 | Notification routing (3-tier system) | `phase/6-2-notification-routing` |
| 6.3 | Audit log viewer | `phase/6-3-audit-log` |

---

## Sub-phase 6.1 — Approval Queue Panel

### What to build

A dedicated VS Code webview panel (separate from the Agent Panel) that shows all pending approval requests in a reviewable list. Each item shows full context and action buttons.

### Files to create

```
packages/extension/src/
├── panels/
│   ├── ApprovalQueuePanel.ts         # VS Code webview panel provider
│   └── ApprovalQueueMessages.ts      # Message protocol
└── webview-approval/
    ├── index.html
    ├── index.tsx
    └── components/
        ├── ApprovalApp.tsx
        ├── ApprovalQueueList.tsx      # List of pending approvals
        ├── ApprovalCard.tsx           # Single approval item
        ├── ApprovalActions.tsx        # Approve/Reject/Modify buttons
        └── RiskBadge.tsx              # Coloured risk level badge
```

### Message protocol (ApprovalQueueMessages.ts)

```typescript
// Extension → Webview
type ApprovalExtensionMessage =
  | { type: 'init'; requests: ApprovalRequest[] }
  | { type: 'added'; request: ApprovalRequest }
  | { type: 'resolved'; requestId: string; resolution: ApprovalResolution };

// Webview → Extension
type ApprovalWebviewMessage =
  | { type: 'approve'; requestId: string }
  | { type: 'reject'; requestId: string; feedback: string }
  | { type: 'modify'; requestId: string; modifiedParameters: Record<string, unknown>; feedback: string }
  | { type: 'ready' };
```

### ApprovalCard UI requirements

Each approval card must display:

1. **Header row**: Agent name + role, risk badge (colour-coded), timestamp
2. **Action description**: What the agent wants to do (human-readable, from `ApprovalRequest.description`)
3. **Reasoning section**: Expandable — why the agent needs to do this (`ApprovalRequest.reasoning`)
4. **Parameters section**: Expandable — technical details (`ApprovalRequest.parameters` as formatted JSON)
5. **Action buttons**:
   - ✅ **Approve** — immediately resolves with approved
   - ✏️ **Modify** — opens an inline editor for the parameters JSON, then resolves with modified
   - ❌ **Reject** — opens a text input for feedback, then resolves with rejected

### Risk badge colours

| Risk Level | Badge Color | VS Code Variable |
|-----------|-------------|-----------------|
| auto | Grey | `--vscode-badge-background` |
| low | Blue | `--vscode-debugIcon-startForeground` |
| medium | Yellow | `--vscode-editorWarning-foreground` |
| high | Red | `--vscode-errorForeground` |

### ApprovalQueuePanel.ts

```typescript
class ApprovalQueuePanel {
  static currentPanel: ApprovalQueuePanel | undefined;

  static createOrShow(context: vscode.ExtensionContext, coreManager: CoreManager): void

  private constructor(panel: vscode.WebviewPanel, core: ProjectNameCore) {
    // Subscribe to core approval events
    core.on('approval:requested', (request) => {
      this.postMessage({ type: 'added', request });
    });

    core.on('approval:resolved', ({ requestId, resolution }) => {
      this.postMessage({ type: 'resolved', requestId, resolution });
    });

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (msg: ApprovalWebviewMessage) => {
      switch (msg.type) {
        case 'ready':
          this.postMessage({ type: 'init', requests: core.getPendingApprovals() });
          break;
        case 'approve':
          core.resolveApproval(msg.requestId, {
            decision: 'approved',
            resolvedAt: new Date().toISOString()
          });
          break;
        case 'reject':
          core.resolveApproval(msg.requestId, {
            decision: 'rejected',
            feedback: msg.feedback,
            resolvedAt: new Date().toISOString()
          });
          break;
        case 'modify':
          core.resolveApproval(msg.requestId, {
            decision: 'modified',
            modifiedParameters: msg.modifiedParameters,
            feedback: msg.feedback,
            resolvedAt: new Date().toISOString()
          });
          break;
      }
    });
  }
}
```

### Acceptance criteria
- [ ] Approval Queue panel opens via command and from Agent Panel
- [ ] Pending approvals appear in the list with full context
- [ ] Approve resolves immediately
- [ ] Reject shows feedback input, resolves with rejection
- [ ] Modify shows parameters editor, resolves with modified params
- [ ] List updates in real time (new items added, resolved items marked)
- [ ] Empty state shown when no pending approvals

### Git
```bash
git checkout main && git pull origin main
git checkout -b phase/6-1-approval-queue-panel
npm run lint && npm run build
git add -A
git commit -m "feat(extension): Approval Queue panel with full review UI"
git push origin phase/6-1-approval-queue-panel
git checkout main && git merge phase/6-1-approval-queue-panel --no-ff -m "chore: merge phase/6-1-approval-queue-panel into main"
git push origin main && git branch -d phase/6-1-approval-queue-panel
git checkout -b phase/6-2-notification-routing
```

---

## Sub-phase 6.2 — Notification Routing (3-Tier System)

### What to build

Route approval requests to the correct UI tier based on their risk level. Low risk → VS Code notification popup. Medium risk → Approval Queue panel (with focus). High risk → Blocking notification that forces the user to the Approval Queue.

### Files to create

```
packages/extension/src/
└── approval/
    ├── NotificationRouter.ts
    ├── NotificationRouter.test.ts
    └── index.ts
```

### NotificationRouter spec

```typescript
class NotificationRouter {
  constructor(
    private context: vscode.ExtensionContext,
    private coreManager: CoreManager
  ) {}

  // Route an approval request to the appropriate UI tier
  async route(request: ApprovalRequest): Promise<void>

  // Handle a low-risk request — show VS Code notification popup
  private async handleLow(request: ApprovalRequest): Promise<void>

  // Handle a medium-risk request — open Approval Queue panel and focus it
  private async handleMedium(request: ApprovalRequest): Promise<void>

  // Handle a high-risk request — show blocking modal + open Approval Queue
  private async handleHigh(request: ApprovalRequest): Promise<void>
}
```

### Tier behaviour

**Low risk** — VS Code information notification:
```typescript
const choice = await vscode.window.showInformationMessage(
  `[Agent: ${request.agentName}] ${request.description}`,
  'Approve',
  'Reject',
  'View Details'
);
// 'Approve' → resolve approved
// 'Reject' → resolve rejected with empty feedback
// 'View Details' → open Approval Queue panel and resolve nothing (user reviews there)
// Dismissed (undefined) → resolve rejected with feedback 'Dismissed by user'
```

**Medium risk** — Open Approval Queue panel and show a warning notification:
```typescript
void vscode.window.showWarningMessage(
  `vscode-ext Agent action requires review: ${request.description}`,
  'Open Approval Queue'
).then((choice) => {
  if (choice === 'Open Approval Queue') {
    ApprovalQueuePanel.createOrShow(context, coreManager);
  }
});
ApprovalQueuePanel.createOrShow(context, coreManager);
// The panel will show the pending request — user resolves it there
```

**High risk** — Blocking modal dialog:
```typescript
const choice = await vscode.window.showWarningMessage(
  `⚠️ HIGH RISK ACTION — Agent "${request.agentName}" wants to: ${request.description}\n\nThis action requires your immediate review.`,
  { modal: true },
  'Open Approval Queue',
  'Reject Immediately'
);
if (choice === 'Reject Immediately') {
  // resolve rejected immediately
} else {
  // Open approval queue (user must review)
  ApprovalQueuePanel.createOrShow(context, coreManager);
}
```

### Wire NotificationRouter into extension

In `extension.ts`, after initialising the core, subscribe to `approval:requested` events and route them through `NotificationRouter`:

```typescript
core.on('approval:requested', (request: ApprovalRequest) => {
  void notificationRouter.route(request);
});
```

### Tests

Mock VS Code API in tests. Test:
- Low risk shows `showInformationMessage` with correct buttons
- Low risk 'Approve' click resolves approved
- Low risk 'Reject' click resolves rejected
- Medium risk opens Approval Queue panel
- High risk shows modal dialog
- High risk 'Reject Immediately' resolves rejected without opening panel

### Acceptance criteria
- [ ] Low risk → notification popup with approve/reject buttons
- [ ] Medium risk → queue panel opens, warning notification shown
- [ ] High risk → blocking modal, must open queue or reject immediately
- [ ] All three tiers correctly call `core.resolveApproval()` when user decides inline
- [ ] All tests pass

### Git
```bash
npm run lint && npm run test && npm run build
git add -A
git commit -m "feat(extension): 3-tier approval notification routing"
git push origin phase/6-2-notification-routing
git checkout main && git merge phase/6-2-notification-routing --no-ff -m "chore: merge phase/6-2-notification-routing into main"
git push origin main && git branch -d phase/6-2-notification-routing
git checkout -b phase/6-3-audit-log
```

---

## Sub-phase 6.3 — Audit Log Viewer

### What to build

A simple read-only webview that renders the `.agent/memory/audit.md` file with syntax highlighting. Accessible from the command palette and from the Approval Queue panel.

### Files to create

```
packages/extension/src/
├── panels/
│   └── AuditLogPanel.ts
└── commands/
    └── openAuditLog.ts
```

### AuditLogPanel spec

```typescript
class AuditLogPanel {
  static currentPanel: AuditLogPanel | undefined;

  static createOrShow(context: vscode.ExtensionContext, coreManager: CoreManager): void

  private async loadAuditLog(): Promise<string>
  // Reads .agent/memory/audit.md from the active workspace
  // Returns "No audit log found." if file doesn't exist

  private getWebviewContent(auditMarkdown: string): string
  // Returns HTML that renders the markdown with basic styling
  // Use a simple client-side markdown renderer (marked.js from CDN)
  // Style with VS Code variables

  // Refresh the panel (re-reads the file)
  async refresh(): Promise<void>
}
```

### AuditLog HTML

The webview should be a simple, clean HTML page:
- Load `marked.js` from a CDN for markdown rendering
- Display the rendered audit.md content
- Include a "Refresh" button that sends a message to the extension host to re-read the file
- Show timestamps, agent names, and decisions clearly
- Use VS Code CSS variables for theming

### Register command

Add `projectname.openAuditLog` to commands in `package.json` and implement `openAuditLog.ts`.

Also add an "Audit Log" button to the Approval Queue panel header so users can access it from there.

### Acceptance criteria
- [ ] Audit log panel opens and displays audit.md content
- [ ] Rendered as readable markdown (not raw text)
- [ ] Refresh button reloads the file
- [ ] "No audit log" message shown when file doesn't exist
- [ ] Accessible from Command Palette and from Approval Queue panel

### Git
```bash
npm run lint && npm run build
git add -A
git commit -m "feat(extension): audit log viewer panel"
git push origin phase/6-3-audit-log
git checkout main && git merge phase/6-3-audit-log --no-ff -m "chore: merge phase/6-3-audit-log into main — Phase 6 complete"
git push origin main && git branch -d phase/6-3-audit-log
```

### Update PROGRESS.md

Mark Phase 6 complete. Next session: Phase 7 — Templates, Polish & E2E Tests. This is the final phase.

---

## Phase 6 Complete Checklist

- [ ] Approval Queue panel shows all pending requests with full context
- [ ] Approve/Reject/Modify all work correctly
- [ ] Low/Medium/High risk routing working correctly
- [ ] Audit log viewer renders audit.md
- [ ] All extension panels open and function without errors
- [ ] PROGRESS.md updated
- [ ] Main branch up to date on GitHub
