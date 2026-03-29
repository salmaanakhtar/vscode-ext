import * as vscode from 'vscode';
import * as path from 'path';
import type { ProjectNameSession } from '../ProjectNameSession';

export class AgentPanel {
  private panel: vscode.WebviewPanel | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private context: vscode.ExtensionContext,
    private getSession: () => ProjectNameSession | null,
  ) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'projectname.agentPanel',
      'vscode-ext',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview')),
        ],
      },
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      async (msg) => await this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
      this.disposables.forEach(d => d.dispose());
      this.disposables = [];
    });

    this.pushState();
  }

  async pushState(): Promise<void> {
    const session = this.getSession();
    if (!this.panel || !session) return;

    const agents = session.registry.getAllAgents();
    const statuses = session.runtime.getAllStatuses();
    const tasks = session.orchestrator.getAllTasks().slice(-20);

    this.panel.webview.postMessage({
      type: 'stateUpdate',
      data: { agents, statuses, tasks },
    });
  }

  async postMessage(type: string, data: unknown): Promise<void> {
    this.panel?.webview.postMessage({ type, data });
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private async handleMessage(msg: { type: string; data?: unknown }): Promise<void> {
    const session = this.getSession();

    switch (msg.type) {
      case 'sendMessage': {
        const { message, targetAgentId } = msg.data as { message: string; targetAgentId?: string };
        if (!session) {
          await this.postMessage('error', 'No active session. Start Team Lead first.');
          return;
        }

        await this.postMessage('thinking', { agentId: targetAgentId ?? 'team-lead' });

        let result;
        if (targetAgentId && targetAgentId !== 'team-lead') {
          result = await session.orchestrator.runDirectTask(targetAgentId, message);
        } else {
          result = await session.orchestrator.handleUserMessage(message);
        }

        if (result.success) {
          await this.postMessage('response', { text: result.data, agentId: targetAgentId ?? 'team-lead' });
        } else {
          await this.postMessage('error', result.error.message);
        }

        await this.pushState();
        break;
      }

      case 'getState':
        await this.pushState();
        break;

      case 'ready':
        await this.pushState();
        break;
    }
  }

  private getHtml(): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>vscode-ext</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); height: 100vh; display: flex; flex-direction: column; }
    #root { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .chat-container { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .message { padding: 8px 12px; border-radius: 6px; max-width: 85%; word-wrap: break-word; }
    .message.user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; }
    .message.agent { background: var(--vscode-editor-inactiveSelectionBackground); align-self: flex-start; }
    .message .agent-label { font-size: 11px; opacity: 0.7; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .input-row { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--vscode-panel-border); }
    .input-row input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px 10px; border-radius: 4px; font-size: var(--vscode-font-size); }
    .input-row button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; }
    .input-row button:hover { background: var(--vscode-button-hoverBackground); }
    .agent-select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; border-radius: 4px; }
    .status-bar { display: flex; gap: 8px; padding: 6px 12px; border-top: 1px solid var(--vscode-panel-border); font-size: 11px; flex-wrap: wrap; }
    .agent-chip { display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .dot { width: 6px; height: 6px; border-radius: 50%; }
    .dot.idle { background: #888; }
    .dot.thinking, .dot.writing { background: #4ec9b0; animation: pulse 1s infinite; }
    .dot.awaiting_approval { background: #ce9178; }
    .dot.error { background: #f44747; }
    .dot.offline { background: #555; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .thinking-indicator { opacity: 0.6; font-style: italic; }
  </style>
</head>
<body>
  <div id="root">
    <div class="chat-container" id="chat"></div>
    <div class="status-bar" id="status-bar"></div>
    <div class="input-row">
      <select class="agent-select" id="target-agent">
        <option value="team-lead">Team Lead</option>
      </select>
      <input type="text" id="message-input" placeholder="Message your team..." />
      <button id="send-btn">Send</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat');
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const agentSelect = document.getElementById('target-agent');
    const statusBar = document.getElementById('status-bar');

    let isThinking = false;

    function addMessage(text, sender, agentId) {
      const div = document.createElement('div');
      div.className = 'message ' + (sender === 'user' ? 'user' : 'agent');
      if (sender !== 'user' && agentId) {
        const label = document.createElement('div');
        label.className = 'agent-label';
        label.textContent = agentId;
        div.appendChild(label);
      }
      const content = document.createElement('div');
      content.textContent = text;
      div.appendChild(content);
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }

    function setThinking(agentId) {
      isThinking = true;
      sendBtn.disabled = true;
      const div = document.createElement('div');
      div.className = 'message agent thinking-indicator';
      div.id = 'thinking-msg';
      div.textContent = (agentId || 'team-lead') + ' is thinking...';
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }

    function clearThinking() {
      isThinking = false;
      sendBtn.disabled = false;
      const msg = document.getElementById('thinking-msg');
      if (msg) msg.remove();
    }

    function updateStatusBar(statuses) {
      statusBar.innerHTML = '';
      statuses.forEach(s => {
        const chip = document.createElement('div');
        chip.className = 'agent-chip';
        const dot = document.createElement('div');
        dot.className = 'dot ' + s.state;
        chip.appendChild(dot);
        chip.appendChild(document.createTextNode(s.agentId + ': ' + s.state));
        statusBar.appendChild(chip);
      });
    }

    function updateAgentSelect(agents) {
      const current = agentSelect.value;
      agentSelect.innerHTML = '<option value="team-lead">Team Lead</option>';
      agents.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = '@' + a.id + ' (' + a.name + ')';
        agentSelect.appendChild(opt);
      });
      agentSelect.value = current;
    }

    function send() {
      const message = input.value.trim();
      if (!message || isThinking) return;
      const targetAgentId = agentSelect.value;
      addMessage(message, 'user');
      input.value = '';
      setThinking(targetAgentId);
      vscode.postMessage({ type: 'sendMessage', data: { message, targetAgentId } });
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

    window.addEventListener('message', e => {
      const { type, data } = e.data;
      switch (type) {
        case 'stateUpdate':
          if (data.statuses) updateStatusBar(data.statuses);
          if (data.agents) updateAgentSelect(data.agents);
          break;
        case 'thinking':
          setThinking(data.agentId);
          break;
        case 'response':
          clearThinking();
          addMessage(data.text, 'agent', data.agentId);
          break;
        case 'error':
          clearThinking();
          addMessage('Error: ' + data, 'agent', 'system');
          break;
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
