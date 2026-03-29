import * as vscode from 'vscode';
import type { ProjectNameSession } from '../ProjectNameSession';
import type { ApprovalResolution } from '@vscode-ext/shared';

export class ApprovalQueuePanel {
  private panel: vscode.WebviewPanel | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private context: vscode.ExtensionContext,
    private getSession: () => ProjectNameSession | null,
  ) {}

  show(): void {
    if (this.panel) { this.panel.reveal(); return; }

    this.panel = vscode.window.createWebviewPanel(
      'projectname.approvalQueue',
      'vscode-ext Approvals',
      vscode.ViewColumn.Three,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage(
      async (msg) => await this.handleMessage(msg),
      null, this.disposables,
    );
    this.panel.onDidDispose(() => {
      this.panel = null;
      this.disposables.forEach(d => d.dispose());
      this.disposables = [];
    });

    this.refresh();

    // Poll for new requests
    const timer = setInterval(() => this.refresh(), 1000);
    this.disposables.push({ dispose: () => clearInterval(timer) });
  }

  refresh(): void {
    const session = this.getSession();
    if (!this.panel || !session) return;

    const pending = session.gate.getPendingRequests();
    this.panel.webview.postMessage({ type: 'update', data: pending });

    // Update panel title with count
    this.panel.title = pending.length > 0
      ? `vscode-ext Approvals (${pending.length})`
      : 'vscode-ext Approvals';

    // badge exists on WebviewPanel at runtime (VS Code 1.79+) but is absent from @types/vscode here
    const panelWithBadge = this.panel as unknown as { badge?: { value: number; tooltip: string } };
    if (pending.length > 0) {
      panelWithBadge.badge = { value: pending.length, tooltip: `${pending.length} pending approval(s)` };
    } else {
      panelWithBadge.badge = undefined;
    }
  }

  dispose(): void { this.panel?.dispose(); }

  private async handleMessage(msg: { type: string; data?: unknown }): Promise<void> {
    const session = this.getSession();
    if (!session) return;

    if (msg.type === 'resolve') {
      const { requestId, decision, feedback } = msg.data as {
        requestId: string;
        decision: 'approved' | 'rejected';
        feedback?: string;
      };

      const resolution: ApprovalResolution = {
        decision,
        feedback,
        resolvedAt: new Date().toISOString(),
      };

      await this.context.workspaceState.update(
        `approval:resolution:${requestId}`, resolution,
      );

      this.refresh();
    }
  }

  private getHtml(): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px; }
    h2 { margin-bottom: 12px; font-size: 14px; opacity: 0.8; }
    .empty { opacity: 0.6; font-style: italic; margin-top: 40px; text-align: center; line-height: 1.6; }
    .empty strong { display: block; margin-bottom: 6px; font-style: normal; opacity: 1; }
    .request { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-bottom: 12px; overflow: hidden; transition: opacity 0.3s ease; }
    .request.resolving { opacity: 0.4; pointer-events: none; }
    .request-header { padding: 8px 12px; font-weight: bold; font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
    .request-body { padding: 10px 12px; }
    .request-body p { margin-bottom: 6px; font-size: 12px; }
    .context-box { background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textBlockQuote-border); padding: 6px 10px; margin: 8px 0; font-size: 11px; font-family: var(--vscode-editor-font-family); white-space: pre-wrap; max-height: 80px; overflow-y: auto; }
    .actions { display: flex; gap: 8px; margin-top: 10px; align-items: center; flex-wrap: wrap; }
    .actions input { flex: 1; min-width: 120px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 8px; border-radius: 3px; font-size: 12px; }
    .actions input.error { border-color: #f44747; }
    .btn { padding: 4px 12px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
    .btn-approve { background: #28a745; color: white; }
    .btn-reject { background: #dc3545; color: white; }
    .risk-badge { padding: 2px 6px; border-radius: 3px; font-size: 10px; text-transform: uppercase; font-weight: bold; }
    .risk-low { background: #dae8fc; color: #006eaf; }
    .risk-medium { background: #ffe6cc; color: #d6720c; }
    .risk-high { background: #f8cecc; color: #b85450; }
  </style>
</head>
<body>
  <h2>Approval Queue</h2>
  <div id="queue"><p class="empty"><strong>All clear</strong>No pending approvals — your agents are working within their permissions.</p></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function render(requests) {
      const queue = document.getElementById('queue');
      if (!requests || requests.length === 0) {
        queue.innerHTML = '<p class="empty"><strong>All clear</strong>No pending approvals — your agents are working within their permissions.</p>';
        return;
      }

      queue.innerHTML = requests.map(r => \`
        <div class="request" id="req-\${r.id}">
          <div class="request-header" style="background: \${riskBg(r.riskLevel)}">
            <span>\${escHtml(r.agentId)} — \${escHtml(r.action)}</span>
            <span class="risk-badge risk-\${r.riskLevel}">\${r.riskLevel}</span>
          </div>
          <div class="request-body">
            <p><strong>\${escHtml(r.description)}</strong></p>
            <div class="context-box">\${escHtml(r.context)}</div>
            <p style="font-size:11px;opacity:0.6">Task: \${escHtml(r.taskId)} · Requested: \${new Date(r.requestedAt).toLocaleTimeString()}</p>
            <div class="actions">
              <input type="text" id="feedback-\${r.id}" placeholder="Feedback (required to reject)..." />
              <button class="btn btn-approve" onclick="resolve('\${r.id}', 'approved')">Approve</button>
              <button class="btn btn-reject" onclick="resolve('\${r.id}', 'rejected')">Reject</button>
            </div>
          </div>
        </div>
      \`).join('');
    }

    function riskBg(level) {
      return { low: 'rgba(218,232,252,0.2)', medium: 'rgba(255,230,204,0.2)', high: 'rgba(248,206,204,0.2)' }[level] || 'transparent';
    }

    function escHtml(str) {
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function resolve(requestId, decision) {
      const feedbackEl = document.getElementById('feedback-' + requestId);
      const feedback = feedbackEl ? feedbackEl.value.trim() : '';

      if (decision === 'rejected' && !feedback) {
        if (feedbackEl) {
          feedbackEl.classList.add('error');
          feedbackEl.placeholder = 'Feedback is required to reject';
          feedbackEl.focus();
        }
        return;
      }

      // Mark as resolving (fade out)
      const card = document.getElementById('req-' + requestId);
      if (card) card.classList.add('resolving');

      vscode.postMessage({ type: 'resolve', data: { requestId, decision, feedback: feedback || undefined } });
    }

    window.addEventListener('message', e => {
      if (e.data.type === 'update') render(e.data.data);
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
