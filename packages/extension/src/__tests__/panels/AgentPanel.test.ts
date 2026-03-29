import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentPanel } from '../../panels/AgentPanel';
import {
  _reset,
  _triggerMessage,
  _triggerDispose,
  mockPanel,
  mockWebview,
  window as vscodeWindow,
} from '../../__mocks__/vscode';

// ---- helpers ----------------------------------------------------------------

const makeContext = () =>
  ({
    extensionPath: '/ext',
    subscriptions: [],
    workspaceState: { get: vi.fn(), update: vi.fn() },
  }) as unknown as import('vscode').ExtensionContext;

const makeSession = (overrides?: Record<string, unknown>) =>
  buildSession(overrides);

function buildSession(overrides?: Record<string, unknown>) {
  return {
    registry: {
      getAllAgents: vi.fn().mockReturnValue([{ id: 'frontend', name: 'Frontend' }]),
    },
    runtime: {
      getAllStatuses: vi.fn().mockReturnValue([{ agentId: 'frontend', state: 'idle' }]),
    },
    orchestrator: {
      getAllTasks: vi.fn().mockReturnValue([]),
      handleUserMessage: vi.fn().mockResolvedValue({ success: true, data: 'Team Lead response' }),
      runDirectTask: vi.fn().mockResolvedValue({ success: true, data: 'Agent response' }),
    },
    ...overrides,
  } as unknown as import('../../ProjectNameSession').ProjectNameSession;
}

// ---- tests ------------------------------------------------------------------

describe('AgentPanel', () => {
  beforeEach(() => {
    _reset();
  });

  describe('show()', () => {
    it('creates a webview panel when none exists', () => {
      const panel = new AgentPanel(makeContext(), () => null);
      panel.show();

      expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledWith(
        'projectname.agentPanel',
        'vscode-ext',
        2,
        expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
      );
    });

    it('sets the webview html after creation', () => {
      const panel = new AgentPanel(makeContext(), () => null);
      panel.show();

      expect(mockWebview.html).toContain('<!DOCTYPE html>');
      expect(mockWebview.html).toContain('acquireVsCodeApi');
    });

    it('wires message and dispose handlers', () => {
      const panel = new AgentPanel(makeContext(), () => null);
      panel.show();

      expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
      expect(mockPanel.onDidDispose).toHaveBeenCalled();
    });

    it('reveals existing panel instead of creating a new one', () => {
      const panel = new AgentPanel(makeContext(), () => null);
      panel.show();
      panel.show();

      expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
    });

    it('calls pushState after creating panel', () => {
      const session = makeSession();
      const panel = new AgentPanel(makeContext(), () => session);
      panel.show();

      expect(session.orchestrator.getAllTasks).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'stateUpdate' }),
      );
    });
  });

  describe('pushState()', () => {
    it('posts stateUpdate with agents, statuses, tasks', async () => {
      const session = makeSession();
      const panel = new AgentPanel(makeContext(), () => session);
      panel.show();
      mockWebview.postMessage.mockClear();

      await panel.pushState();

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: 'stateUpdate',
        data: {
          agents: [{ id: 'frontend', name: 'Frontend' }],
          statuses: [{ agentId: 'frontend', state: 'idle' }],
          tasks: [],
        },
      });
    });

    it('truncates tasks to last 20', async () => {
      const tasks = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}` }));
      const session = makeSession({
        orchestrator: {
          getAllTasks: vi.fn().mockReturnValue(tasks),
          handleUserMessage: vi.fn(),
          runDirectTask: vi.fn(),
        },
      });
      const panel = new AgentPanel(makeContext(), () => session);
      panel.show();
      mockWebview.postMessage.mockClear();

      await panel.pushState();

      const call = mockWebview.postMessage.mock.calls[0][0] as { data: { tasks: unknown[] } };
      expect(call.data.tasks).toHaveLength(20);
    });

    it('is a no-op when no panel exists', async () => {
      const session = makeSession();
      const panel = new AgentPanel(makeContext(), () => session);
      // do not call show() — panel stays null
      await panel.pushState();

      expect(mockWebview.postMessage).not.toHaveBeenCalled();
    });

    it('posts noTeam message when no session', async () => {
      const panel = new AgentPanel(makeContext(), () => null);
      panel.show();
      mockWebview.postMessage.mockClear();

      await panel.pushState();

      expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'noTeam' });
    });
  });

  describe('postMessage()', () => {
    it('posts to webview when panel is open', async () => {
      const panel = new AgentPanel(makeContext(), () => null);
      panel.show();
      mockWebview.postMessage.mockClear();

      await panel.postMessage('myType', { foo: 'bar' });

      expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'myType', data: { foo: 'bar' } });
    });

    it('is a no-op when panel is null', async () => {
      const panel = new AgentPanel(makeContext(), () => null);
      // not shown — panel is null
      await panel.postMessage('myType', {});

      expect(mockWebview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('dispose()', () => {
    it('disposes the underlying panel', () => {
      const panel = new AgentPanel(makeContext(), () => null);
      panel.show();
      panel.dispose();

      expect(mockPanel.dispose).toHaveBeenCalled();
    });

    it('is a no-op when panel is null', () => {
      const panel = new AgentPanel(makeContext(), () => null);
      expect(() => panel.dispose()).not.toThrow();
    });
  });

  describe('onDidDispose handler', () => {
    it('nulls the internal panel reference on dispose', () => {
      const session = makeSession();
      const panel = new AgentPanel(makeContext(), () => session);
      panel.show();

      _triggerDispose();

      // After dispose fires, reveal should create a new panel on next show()
      vscodeWindow.createWebviewPanel.mockReturnValue(mockPanel);
      panel.show();
      expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledTimes(2);
    });
  });

  describe('message handling', () => {
    it('ready message triggers pushState', async () => {
      const session = makeSession();
      const panel = new AgentPanel(makeContext(), () => session);
      panel.show();
      mockWebview.postMessage.mockClear();

      await _triggerMessage({ type: 'ready' });

      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'stateUpdate' }),
      );
    });

    it('getState message triggers pushState', async () => {
      const session = makeSession();
      const panel = new AgentPanel(makeContext(), () => session);
      panel.show();
      mockWebview.postMessage.mockClear();

      await _triggerMessage({ type: 'getState' });

      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'stateUpdate' }),
      );
    });

    it('sendMessage without session posts error', async () => {
      const panel = new AgentPanel(makeContext(), () => null);
      panel.show();
      mockWebview.postMessage.mockClear();

      await _triggerMessage({ type: 'sendMessage', data: { message: 'hello', targetAgentId: 'team-lead' } });

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: 'error',
        data: expect.stringContaining('No agent team running'),
      });
    });

    it('sendMessage to team-lead calls handleUserMessage', async () => {
      const session = makeSession();
      const panel = new AgentPanel(makeContext(), () => session);
      panel.show();
      mockWebview.postMessage.mockClear();

      await _triggerMessage({ type: 'sendMessage', data: { message: 'hello', targetAgentId: 'team-lead' } });

      expect(session.orchestrator.handleUserMessage).toHaveBeenCalledWith('hello');
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'thinking' }),
      );
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: 'response',
        data: { text: 'Team Lead response', agentId: 'team-lead' },
      });
    });

    it('sendMessage to a specific agent calls runDirectTask', async () => {
      const session = makeSession();
      const panel = new AgentPanel(makeContext(), () => session);
      panel.show();
      mockWebview.postMessage.mockClear();

      await _triggerMessage({ type: 'sendMessage', data: { message: 'review this', targetAgentId: 'frontend' } });

      expect(session.orchestrator.runDirectTask).toHaveBeenCalledWith('frontend', 'review this');
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: 'response',
        data: { text: 'Agent response', agentId: 'frontend' },
      });
    });

    it('sendMessage posts error when orchestrator fails', async () => {
      const session = makeSession({
        orchestrator: {
          getAllTasks: vi.fn().mockReturnValue([]),
          handleUserMessage: vi.fn().mockResolvedValue({
            success: false,
            error: new Error('CLI error'),
          }),
          runDirectTask: vi.fn(),
        },
      });
      const panel = new AgentPanel(makeContext(), () => session);
      panel.show();
      mockWebview.postMessage.mockClear();

      await _triggerMessage({ type: 'sendMessage', data: { message: 'fail', targetAgentId: 'team-lead' } });

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: 'error',
        data: 'CLI error',
      });
    });

    it('unknown message type is ignored gracefully', async () => {
      const panel = new AgentPanel(makeContext(), () => null);
      panel.show();
      mockWebview.postMessage.mockClear();

      await expect(_triggerMessage({ type: 'unknown' })).resolves.not.toThrow();
    });

    it('ready message sends chatHistory when history exists in workspaceState', async () => {
      const history = [
        { text: 'hello', sender: 'user' },
        { text: 'hi there', sender: 'agent', agentId: 'team-lead' },
      ];
      const context = {
        extensionPath: '/ext',
        subscriptions: [],
        workspaceState: {
          get: vi.fn().mockReturnValue(history),
          update: vi.fn().mockResolvedValue(undefined),
        },
      } as unknown as import('vscode').ExtensionContext;

      const session = makeSession();
      const panel = new AgentPanel(context, () => session);
      panel.show();
      mockWebview.postMessage.mockClear();

      await _triggerMessage({ type: 'ready' });

      expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'chatHistory', data: history });
    });

    it('ready message does not send chatHistory when history is empty', async () => {
      const session = makeSession();
      const panel = new AgentPanel(makeContext(), () => session);
      panel.show();
      mockWebview.postMessage.mockClear();

      await _triggerMessage({ type: 'ready' });

      const chatHistoryCalls = (mockWebview.postMessage as ReturnType<typeof vi.fn>).mock.calls
        .filter((c: unknown[]) => (c[0] as { type: string }).type === 'chatHistory');
      expect(chatHistoryCalls).toHaveLength(0);
    });
  });
});
