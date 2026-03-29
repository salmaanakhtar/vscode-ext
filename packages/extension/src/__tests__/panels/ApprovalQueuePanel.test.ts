import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApprovalQueuePanel } from '../../panels/ApprovalQueuePanel';
import {
  _reset,
  _triggerMessage,
  _triggerDispose,
  mockPanel,
  mockWebview,
  window as vscodeWindow,
} from '../../__mocks__/vscode';
import type { ApprovalRequest } from '@vscode-ext/shared';

// ---- helpers ----------------------------------------------------------------

const makeContext = () =>
  ({
    extensionPath: '/ext',
    subscriptions: [],
    workspaceState: {
      get: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
  }) as unknown as import('vscode').ExtensionContext;

function makePendingRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    id: 'req-1',
    agentId: 'frontend',
    taskId: 'task-1',
    action: 'createFile',
    riskLevel: 'low',
    description: 'Create index.ts',
    context: 'inside src/',
    requestedAt: new Date().toISOString(),
    status: 'pending',
    ...overrides,
  };
}

const makeSession = (pending: ApprovalRequest[] = []) =>
  ({
    gate: {
      getPendingRequests: vi.fn().mockReturnValue(pending),
    },
  }) as unknown as import('../../ProjectNameSession').ProjectNameSession;

// ---- tests ------------------------------------------------------------------

describe('ApprovalQueuePanel', () => {
  beforeEach(() => {
    _reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  describe('show()', () => {
    it('creates a webview panel when none exists', () => {
      const panel = new ApprovalQueuePanel(makeContext(), () => null);
      panel.show();

      expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledWith(
        'projectname.approvalQueue',
        'vscode-ext Approvals',
        3,
        expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
      );
    });

    it('sets webview html after creation', () => {
      const panel = new ApprovalQueuePanel(makeContext(), () => null);
      panel.show();

      expect(mockWebview.html).toContain('<!DOCTYPE html>');
      expect(mockWebview.html).toContain('acquireVsCodeApi');
      expect(mockWebview.html).toContain('Approval Queue');
    });

    it('wires message and dispose handlers', () => {
      const panel = new ApprovalQueuePanel(makeContext(), () => null);
      panel.show();

      expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
      expect(mockPanel.onDidDispose).toHaveBeenCalled();
    });

    it('reveals existing panel instead of creating a new one', () => {
      const panel = new ApprovalQueuePanel(makeContext(), () => null);
      panel.show();
      panel.show();

      expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
    });

    it('calls refresh immediately on show', () => {
      const session = makeSession([makePendingRequest()]);
      const panel = new ApprovalQueuePanel(makeContext(), () => session);
      panel.show();

      expect(session.gate.getPendingRequests).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'update' }),
      );
    });

    it('starts a polling interval that calls refresh', () => {
      vi.useFakeTimers();
      const session = makeSession();
      const panel = new ApprovalQueuePanel(makeContext(), () => session);
      panel.show();

      const callsAfterShow = (session.gate.getPendingRequests as ReturnType<typeof vi.fn>).mock.calls.length;

      vi.advanceTimersByTime(3000);

      const callsAfterAdvance = (session.gate.getPendingRequests as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(callsAfterAdvance).toBeGreaterThan(callsAfterShow);

      panel.dispose();
    });
  });

  // --------------------------------------------------------------------------
  describe('refresh()', () => {
    it('is a no-op when panel is not open', () => {
      const session = makeSession();
      const panel = new ApprovalQueuePanel(makeContext(), () => session);
      // don't call show()
      panel.refresh();

      expect(session.gate.getPendingRequests).not.toHaveBeenCalled();
    });

    it('is a no-op when session is null', () => {
      const panel = new ApprovalQueuePanel(makeContext(), () => null);
      panel.show();
      mockWebview.postMessage.mockClear();

      panel.refresh();

      expect(mockWebview.postMessage).not.toHaveBeenCalled();
    });

    it('posts update message with pending requests', () => {
      const requests = [makePendingRequest()];
      const session = makeSession(requests);
      const panel = new ApprovalQueuePanel(makeContext(), () => session);
      panel.show();
      mockWebview.postMessage.mockClear();

      panel.refresh();

      expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'update', data: requests });
    });

    it('sets badge when there are pending requests', () => {
      const session = makeSession([makePendingRequest(), makePendingRequest({ id: 'req-2' })]);
      const panel = new ApprovalQueuePanel(makeContext(), () => session);
      panel.show();

      expect(mockPanel.badge).toEqual({ value: 2, tooltip: '2 pending approval(s)' });
    });

    it('clears badge when no pending requests', () => {
      // first show with one pending
      const session = makeSession([makePendingRequest()]);
      const panel = new ApprovalQueuePanel(makeContext(), () => session);
      panel.show();
      expect(mockPanel.badge).toBeDefined();

      // now session returns empty
      (session.gate.getPendingRequests as ReturnType<typeof vi.fn>).mockReturnValue([]);
      panel.refresh();

      expect(mockPanel.badge).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  describe('handleMessage()', () => {
    it('resolve message writes resolution to workspaceState', async () => {
      const context = makeContext();
      const session = makeSession();
      const panel = new ApprovalQueuePanel(context, () => session);
      panel.show();

      await _triggerMessage({
        type: 'resolve',
        data: { requestId: 'req-1', decision: 'approved', feedback: 'Looks good' },
      });

      expect(context.workspaceState.update).toHaveBeenCalledWith(
        'approval:resolution:req-1',
        expect.objectContaining({ decision: 'approved', feedback: 'Looks good' }),
      );
    });

    it('resolve message calls refresh after saving resolution', async () => {
      const session = makeSession();
      const panel = new ApprovalQueuePanel(makeContext(), () => session);
      panel.show();
      mockWebview.postMessage.mockClear();
      (session.gate.getPendingRequests as ReturnType<typeof vi.fn>).mockClear();

      await _triggerMessage({
        type: 'resolve',
        data: { requestId: 'req-1', decision: 'rejected' },
      });

      expect(session.gate.getPendingRequests).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'update' }),
      );
    });

    it('resolve message without session is a no-op', async () => {
      const context = makeContext();
      const panel = new ApprovalQueuePanel(context, () => null);
      panel.show();

      await _triggerMessage({
        type: 'resolve',
        data: { requestId: 'req-1', decision: 'approved' },
      });

      expect(context.workspaceState.update).not.toHaveBeenCalled();
    });

    it('unknown message type is ignored gracefully', async () => {
      const panel = new ApprovalQueuePanel(makeContext(), () => null);
      panel.show();

      await expect(_triggerMessage({ type: 'unknown' })).resolves.not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  describe('dispose()', () => {
    it('disposes the underlying panel', () => {
      const panel = new ApprovalQueuePanel(makeContext(), () => null);
      panel.show();
      panel.dispose();

      expect(mockPanel.dispose).toHaveBeenCalled();
    });

    it('is a no-op when panel is null', () => {
      const panel = new ApprovalQueuePanel(makeContext(), () => null);
      expect(() => panel.dispose()).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  describe('onDidDispose handler', () => {
    it('nulls the internal panel reference so a new one is created on next show()', () => {
      const panel = new ApprovalQueuePanel(makeContext(), () => null);
      panel.show();

      _triggerDispose();

      vscodeWindow.createWebviewPanel.mockReturnValue(mockPanel);
      panel.show();
      expect(vscodeWindow.createWebviewPanel).toHaveBeenCalledTimes(2);
    });
  });
});
