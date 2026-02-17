import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SsoAuditWebhookService } from './sso-audit-webhook.service';
import { SsoAuditExportService } from './sso-audit-export.service';
import { SSO_AUDIT_CONSTANTS } from '../constants/audit.constants';

@Injectable()
export class SsoAuditScheduler {
  private readonly logger = new Logger(SsoAuditScheduler.name);

  constructor(
    private readonly webhookService: SsoAuditWebhookService,
    private readonly exportService: SsoAuditExportService,
  ) {}

  /**
   * Process pending webhook deliveries every 30 seconds
   */
  @Cron('*/30 * * * * *')
  async handleWebhookDelivery(): Promise<void> {
    try {
      const count = await this.webhookService.processDeliveries();
      if (count > 0) {
        this.logger.log(`Processed ${count} webhook deliveries`);
      }
    } catch (error) {
      this.logger.error('Error processing webhook deliveries', error);
      // Scheduler should never crash - swallow the error
    }
  }

  /**
   * Clean up expired audit events and delivery logs daily at 3 AM
   */
  @Cron('0 3 * * *')
  async handleRetentionCleanup(): Promise<void> {
    try {
      const deletedEvents = await this.exportService.cleanupExpiredEvents(
        SSO_AUDIT_CONSTANTS.DEFAULT_RETENTION_DAYS,
      );

      const deletedDeliveryLogs = await this.webhookService.cleanupDeliveryLogs(
        SSO_AUDIT_CONSTANTS.WEBHOOK_DELIVERY_LOG_RETENTION_DAYS,
      );

      if (deletedEvents > 0 || deletedDeliveryLogs > 0) {
        this.logger.log(
          `Retention cleanup: ${deletedEvents} expired events, ${deletedDeliveryLogs} delivery logs removed`,
        );
      }
    } catch (error) {
      this.logger.error('Error during retention cleanup', error);
      // Scheduler should never crash - swallow the error
    }
  }
}
