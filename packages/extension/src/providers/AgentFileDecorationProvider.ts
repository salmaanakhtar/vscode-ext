import * as vscode from 'vscode';

/**
 * Provides file tree decorations that indicate which files are currently
 * being worked on by an agent. The badge shows the first two letters of
 * the agent ID; the colour matches the git-modified resource colour.
 */
export class AgentFileDecorationProvider implements vscode.FileDecorationProvider {
  private readonly activeFiles = new Map<string, string>(); // fsPath → agentId
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  /** Mark a file as actively being edited by an agent. */
  setActiveFile(filePath: string, agentId: string): void {
    this.activeFiles.set(filePath, agentId);
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
