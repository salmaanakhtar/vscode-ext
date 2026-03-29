import * as vscode from 'vscode';
import type { ProjectNameSession } from '../ProjectNameSession';

export class AgentStatusBar {
  private item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private getSession: () => ProjectNameSession | null) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 100,
    );
    this.item.command = 'projectname.viewProgress';
    this.item.tooltip = 'vscode-ext: Click to view agent progress';
    this.update();
    this.timer = setInterval(() => this.update(), 2000);
  }

  update(): void {
    const session = this.getSession();

    if (!session) {
      this.item.text = '$(robot) [PN]';
      this.item.color = new vscode.ThemeColor('statusBar.foreground');
    } else {
      const statuses = session.runtime.getAllStatuses();
      const active = statuses.filter(s => s.state !== 'idle' && s.state !== 'offline');
      const awaiting = statuses.filter(s => s.state === 'awaiting_approval');

      if (awaiting.length > 0) {
        this.item.text = `$(robot) [PN] $(warning) ${awaiting.length} awaiting approval`;
        this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      } else if (active.length > 0) {
        this.item.text = `$(robot) [PN] $(sync~spin) ${active.length} active`;
        this.item.color = new vscode.ThemeColor('statusBar.foreground');
      } else {
        this.item.text = '$(robot) [PN] $(check)';
        this.item.color = new vscode.ThemeColor('statusBar.foreground');
      }
    }

    this.item.show();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.item.dispose();
  }
}
