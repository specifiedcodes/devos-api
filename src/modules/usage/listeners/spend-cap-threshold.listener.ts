import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SpendCapService } from '../services/spend-cap.service';
import { CostUpdateEvent } from '../services/usage.service';

/**
 * SpendCapThresholdListener
 *
 * Story 13-7: Spend Caps & Auto-Downgrade
 *
 * Listens for usage:cost_update events emitted by UsageService (Story 13-6)
 * and triggers spend cap threshold checks in real-time.
 *
 * This keeps the threshold check decoupled from the usage recording flow.
 */
@Injectable()
export class SpendCapThresholdListener {
  private readonly logger = new Logger(SpendCapThresholdListener.name);

  constructor(private readonly spendCapService: SpendCapService) {}

  /**
   * Handle cost update events.
   * Invalidates cached spend cap status and checks for threshold crossings.
   *
   * Errors are caught and logged to avoid breaking the usage recording flow.
   */
  @OnEvent('usage:cost_update')
  async handleCostUpdate(event: CostUpdateEvent): Promise<void> {
    try {
      // Invalidate cached spend cap status so next check uses fresh data
      await this.spendCapService.invalidateCache(event.workspaceId);

      // Check if any threshold was crossed
      await this.spendCapService.checkAndNotifyThresholds(event.workspaceId);
    } catch (error) {
      // Listener errors should not break the usage recording flow
      this.logger.error(
        `Failed to process spend cap threshold check for workspace ${event.workspaceId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
