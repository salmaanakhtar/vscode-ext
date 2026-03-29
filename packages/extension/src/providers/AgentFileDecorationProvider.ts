import * as vscode from 'vscode';

type FileState = 'active' | 'awaiting_approval';

interface ActiveFileEntry {
  agentId: string;
  agentName: string;
  state: FileState;
}

/**
 * Provides file tree decorations that indicate which files are currently
 * being worked on by an agent. Badge shows first two letters of agent ID.
 * Blue = actively editing, yellow = awaiting approval.
 */
export class AgentFileDecorationProvider implements vscode.FileDecorationProvider {
  private readonly activeFiles = new Map<string, ActiveFileEntry>(); // fsPath → entry
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  /** Mark a file as actively being edited by an agent. */
  setActiveFile(filePath: string, agentId: string, agentName: string, state: FileState = 'active'): void {
    this.activeFiles.set(filePath, { agentId, agentName, state });
    this._onDidChange.fire(vscode.Uri.file(filePath));
  }

  /** Remove the decoration from a file (e.g. after the agent completes). */
  clearActiveFile(filePath: string): void {
    this.activeFiles.delete(filePath);
    this._onDidChange.fire(vscode.Uri.file(filePath));
  }

  /** Remove all current decorations (e.g. on session teardown). */
  clearAll(): void {
    const uris = [...this.activeFiles.keys()].map(p => vscode.Uri.file(p));
    this.activeFiles.clear();
    if (uris.length > 0) {
      this._onDidChange.fire(uris);
    }
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const entry = this.activeFiles.get(uri.fsPath);
    if (!entry) return undefined;

    const color = entry.state === 'awaiting_approval'
      ? new vscode.ThemeColor('list.warningForeground')
      : new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');

    return {
      badge: entry.agentId.substring(0, 2).toUpperCase(),
      tooltip: `Being worked on by: ${entry.agentName}`,
      color,
    };
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
