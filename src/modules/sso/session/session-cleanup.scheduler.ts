import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SessionFederationService } from './session-federation.service';
import { SESSION_FEDERATION_CONSTANTS } from '../constants/session-federation.constants';

@Injectable()
export class SessionCleanupScheduler {
  private readonly logger = new Logger(SessionCleanupScheduler.name);

  constructor(
    private readonly sessionFederationService: SessionFederationService,
  ) {}

  /**
   * Clean up expired sessions every 15 minutes.
   * Terminates sessions past absolute or idle timeout.
   */
  @Cron('0 */15 * * * *')
  async handleExpiredSessionCleanup(): Promise<void> {
    try {
      const cleanedCount = await this.sessionFederationService.cleanupExpiredSessions();
      if (cleanedCount > 0) {
        this.logger.log(`Cleaned up ${cleanedCount} expired federated sessions`);
      }
    } catch (error) {
      this.logger.error('Error in expired session cleanup', error);
      // Scheduler should never crash - swallow the error
    }
  }

  /**
   * Purge old terminated sessions daily at 03:00 UTC.
   * Deletes terminated sessions older than retention period (90 days).
   */
  @Cron('0 0 3 * * *')
  async handleTerminatedSessionPurge(): Promise<void> {
    try {
      const purgedCount = await this.sessionFederationService.purgeTerminatedSessions();
      if (purgedCount > 0) {
        this.logger.log(`Purged ${purgedCount} terminated federated sessions older than ${SESSION_FEDERATION_CONSTANTS.TERMINATED_SESSION_RETENTION_DAYS} days`);
      }
    } catch (error) {
      this.logger.error('Error in terminated session purge', error);
    }
  }

  /**
   * Check for sessions near expiry every 5 minutes.
   * Logs warnings for sessions about to expire.
   */
  @Cron('0 */5 * * * *')
  async handleSessionExpiryWarnings(): Promise<void> {
    try {
      const expiringSessionsCount = await this.sessionFederationService.getSessionsNearExpiry(
        SESSION_FEDERATION_CONSTANTS.SESSION_EXPIRY_WARNING_MINUTES,
      );

      if (expiringSessionsCount.length > 0) {
        this.logger.log(
          `${expiringSessionsCount.length} federated sessions expiring within ${SESSION_FEDERATION_CONSTANTS.SESSION_EXPIRY_WARNING_MINUTES} minutes`,
        );
        // TODO: Emit WebSocket events to user channels for frontend warning display
      }
    } catch (error) {
      this.logger.error('Error in session expiry warnings', error);
    }
  }
}
