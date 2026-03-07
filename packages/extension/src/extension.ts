import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
  console.log('vscode-ext extension activated');
}

export function deactivate(): void {
  console.log('vscode-ext extension deactivated');
}
