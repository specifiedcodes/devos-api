import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceSettingsService } from '../services/workspace-settings.service';
import { UsageService } from '../../usage/services/usage.service';

/**
 * Guard to prevent new agent tasks when workspace reaches 100% of monthly budget
 *
 * Usage: Apply to agent task creation endpoints
 * @example
 * ```typescript
 * // In agent-tasks.controller.ts (Epic 5)
 * @Post('workspaces/:workspaceId/agents/:agentId/tasks')
 * @UseGuards(JwtAuthGuard, WorkspaceAccessGuard, SpendingLimitGuard)
 * async createTask(@Param('workspaceId') workspaceId: string, ...) {
 *   // Task creation logic
 * }
 *
 * // With budget override (owners only)
 * POST /api/workspaces/:id/agents/:id/tasks?allow_budget_override=true
 * ```
 *
 * Behavior:
 * - Allows requests if no spending limits configured
 * - Allows requests if budget usage < 100%
 * - Blocks requests at 100% budget with 403 error
 * - Allows override if user is workspace owner AND allow_budget_override=true
 */
@Injectable()
export class SpendingLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly workspaceSettingsService: WorkspaceSettingsService,
    private readonly usageService: UsageService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const workspaceId =
      request.params.workspaceId ||
      request.params.id ||
      request.body?.workspaceId ||
      request.user?.workspaceId;
    const { allow_budget_override } = request.query;
    const user = request.user;

    if (!workspaceId) {
      // No workspace context, allow request
      return true;
    }

    // Check if workspace has spending limits enabled
    const settings =
      await this.workspaceSettingsService.getSpendingLimits(workspaceId);

    if (!settings.limit_enabled || !settings.monthly_limit_usd) {
      return true; // No limit set, allow
    }

    // Get current month spend
    const currentMonthSpend =
      await this.usageService.getCurrentMonthSpend(workspaceId);
    const percentageUsed =
      (currentMonthSpend / settings.monthly_limit_usd) * 100;

    // Check if 100% limit reached
    if (percentageUsed >= 100) {
      // Allow override if user is workspace owner
      if (
        allow_budget_override === 'true' &&
        (user?.role === 'owner' || user?.workspaceRole === 'owner')
      ) {
        return true;
      }

      throw new ForbiddenException({
        message: 'Monthly budget reached',
        statusCode: 403,
        errorCode: 'BYOK_QUOTA_EXCEEDED',
        details: {
          currentSpend: Math.round(currentMonthSpend * 100) / 100,
          limit: settings.monthly_limit_usd,
          percentageUsed: Math.round(percentageUsed),
        },
      });
    }

    return true;
  }
}
