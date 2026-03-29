import { vi } from 'vitest';

type MessageCallback = (msg: unknown) => void | Promise<void>;
type DisposeCallback = () => void;

let _messageCallback: MessageCallback | undefined;
let _disposeCallback: DisposeCallback | undefined;

export const _reset = (): void => {
  _messageCallback = undefined;
  _disposeCallback = undefined;
  mockWebview.postMessage.mockReset().mockResolvedValue(undefined);
  mockPanel.reveal.mockReset();
  mockPanel.dispose.mockReset();
  mockPanel.onDidDispose.mockReset().mockImplementation((cb: DisposeCallback) => {
    _disposeCallback = cb;
    return { dispose: vi.fn() };
  });
  mockWebview.onDidReceiveMessage.mockReset().mockImplementation(
    (cb: MessageCallback) => {
      _messageCallback = cb;
      return { dispose: vi.fn() };
    },
  );
  window.createWebviewPanel.mockReset().mockReturnValue(mockPanel);
  mockPanel.badge = undefined;
  mockPanel.title = '';
};

export const _triggerMessage = async (msg: unknown): Promise<void> => {
  await _messageCallback?.(msg);
};

export const _triggerDispose = (): void => {
  _disposeCallback?.();
};

export const mockWebview = {
  html: '',
  postMessage: vi.fn().mockResolvedValue(undefined),
  onDidReceiveMessage: vi.fn().mockImplementation(
    (cb: MessageCallback) => {
      _messageCallback = cb;
      return { dispose: vi.fn() };
    },
  ),
};

export const mockPanel = {
  webview: mockWebview,
  reveal: vi.fn(),
  dispose: vi.fn(),
  badge: undefined as { value: number; tooltip: string } | undefined,
  title: '',
  onDidDispose: vi.fn().mockImplementation((cb: DisposeCallback) => {
    _disposeCallback = cb;
    return { dispose: vi.fn() };
  }),
};

export const window = {
  createWebviewPanel: vi.fn().mockReturnValue(mockPanel),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showInputBox: vi.fn(),
};

export const Uri = {
  file: vi.fn((p: string) => ({ fsPath: p, scheme: 'file' })),
};

export const ViewColumn = {
  Two: 2 as const,
  Three: 3 as const,
};

export const workspace = {
  workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
};

export const commands = {
  registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  executeCommand: vi.fn(),
};
