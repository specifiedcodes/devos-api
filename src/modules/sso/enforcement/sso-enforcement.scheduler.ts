import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SsoEnforcementService } from './sso-enforcement.service';
import { SSO_ENFORCEMENT_CONSTANTS } from '../constants/enforcement.constants';

@Injectable()
export class SsoEnforcementScheduler {
  private readonly logger = new Logger(SsoEnforcementScheduler.name);

  constructor(
    private readonly ssoEnforcementService: SsoEnforcementService,
  ) {}

  /**
   * Check for expired grace periods every 5 minutes.
   * Transitions policies to fully enforced (password_login_blocked = true).
   */
  @Cron('0 */5 * * * *')
  async handleGracePeriodExpiry(): Promise<void> {
    try {
      const transitionedCount = await this.ssoEnforcementService.processGracePeriodExpiry();
      if (transitionedCount > 0) {
        this.logger.log(
          `Grace period expired for ${transitionedCount} workspace(s) - password login now blocked`,
        );
      }
    } catch (error) {
      this.logger.error('Error processing grace period expiry', error);
      // Scheduler should never crash - swallow the error
    }
  }

  /**
   * Check for upcoming grace period expirations every hour.
   * Logs reminders at configured notification thresholds.
   */
  @Cron('0 0 * * * *')
  async handleGracePeriodReminders(): Promise<void> {
    try {
      const policies = await this.ssoEnforcementService.findPoliciesInGracePeriod();

      for (const policy of policies) {
        if (!policy.gracePeriodEnd) continue;

        const now = new Date();
        const remainingMs = policy.gracePeriodEnd.getTime() - now.getTime();
        const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));

        // Check if remaining hours matches a notification threshold
        const thresholds = SSO_ENFORCEMENT_CONSTANTS.GRACE_PERIOD_NOTIFICATION_HOURS;
        for (const threshold of thresholds) {
          if (remainingHours <= threshold && remainingHours > threshold - 1) {
            this.logger.log(
              `SSO enforcement grace period reminder: workspace ${policy.workspaceId} has ${remainingHours} hour(s) remaining`,
            );
            // TODO: Send actual notification via notification service
            break;
          }
        }
      }
    } catch (error) {
      this.logger.error('Error processing grace period reminders', error);
      // Scheduler should never crash - swallow the error
    }
  }
}
