import * as fs from 'fs/promises';
import type {
  ApprovalRequest, ApprovalResolution, RiskAction, RiskLevel, Result
} from '@vscode-ext/shared';
import {
  generateApprovalId, RISK_LEVEL_MAP, getAuditLogPath, logger
} from '@vscode-ext/shared';

export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalResolution>;

export class ApprovalGate {
  private pendingRequests: Map<string, ApprovalRequest> = new Map();
  private approvalHandler: ApprovalHandler | null = null;
  private autoApprovedActions = new Set<string>(); // agentId:action combos
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Register the handler that will be called when approval is needed.
   * In VS Code this will surface a notification or panel.
   * In tests this can be a mock that auto-approves.
   */
  setApprovalHandler(handler: ApprovalHandler): void {
    this.approvalHandler = handler;
  }

  /**
   * Auto-approve specific action/agent combinations without prompting.
   * Used for trusted agents with low-risk configured actions.
   */
  setAutoApprove(agentId: string, action: RiskAction): void {
    this.autoApprovedActions.add(`${agentId}:${action}`);
  }

  /**
   * Check if an action requires approval and handle accordingly.
   * Returns true if the action should proceed, false if rejected.
   */
  async check(
    agentId: string,
    action: RiskAction,
    description: string,
    context: string,
    taskId: string,
  ): Promise<Result<boolean>> {
    const riskLevel = this.getRiskLevel(agentId, action);

    // Auto-approved actions proceed immediately
    if (riskLevel === 'auto' || this.autoApprovedActions.has(`${agentId}:${action}`)) {
      return { success: true, data: true };
    }

    if (!this.approvalHandler) {
      logger.warn('No approval handler set — blocking action', { agentId, action });
      return { success: true, data: false };
    }

    const request: ApprovalRequest = {
      id: generateApprovalId(),
      agentId,
      taskId,
      action,
      riskLevel,
      description,
      context,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };

    this.pendingRequests.set(request.id, request);
    logger.info('Approval requested', { agentId, action, riskLevel, requestId: request.id });

    try {
      const resolution = await this.approvalHandler(request);

      request.status = resolution.decision === 'approved' ? 'approved'
        : resolution.decision === 'modified' ? 'modified'
        : 'rejected';
      request.resolution = resolution;

      this.pendingRequests.delete(request.id);
      await this.writeAuditLog(request);

      const approved = resolution.decision === 'approved' || resolution.decision === 'modified';
      logger.info('Approval resolved', { requestId: request.id, decision: resolution.decision });

      return { success: true, data: approved };
    } catch (err) {
      this.pendingRequests.delete(request.id);
      return { success: false, error: err as Error };
    }
  }

  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  getPendingRequest(id: string): ApprovalRequest | null {
    return this.pendingRequests.get(id) ?? null;
  }

  getRiskLevel(_agentId: string, action: RiskAction): RiskLevel {
    // Can be overridden per-agent in future; for now use global map
    return RISK_LEVEL_MAP[action] ?? 'medium';
  }

  private async writeAuditLog(request: ApprovalRequest): Promise<void> {
    try {
      const auditPath = getAuditLogPath(this.projectRoot);
      const entry = [
        `\n## ${new Date().toISOString()} | ${request.id}`,
        `**Agent:** ${request.agentId}`,
        `**Action:** ${request.action} (${request.riskLevel})`,
        `**Description:** ${request.description}`,
        `**Decision:** ${request.resolution?.decision ?? 'unknown'}`,
        request.resolution?.feedback ? `**Feedback:** ${request.resolution.feedback}` : '',
        '',
        '---',
      ].filter(Boolean).join('\n');

      await fs.appendFile(auditPath, entry, 'utf-8');
    } catch (err) {
      logger.error('Failed to write audit log', { error: (err as Error).message });
    }
  }
}
