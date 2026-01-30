import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SpendingAlertService } from '../services/spending-alert.service';

@Injectable()
export class SpendingAlertJob {
  private readonly logger = new Logger(SpendingAlertJob.name);

  constructor(private readonly spendingAlertService: SpendingAlertService) {}

  /**
   * Check spending alerts every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkAlerts() {
    this.logger.log('Running spending alerts check job...');
    try {
      await this.spendingAlertService.checkSpendingAlerts();
    } catch (error) {
      this.logger.error(
        `Spending alerts job failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Reset monthly alerts on the 1st of every month at midnight
   */
  @Cron('0 0 1 * *')
  async resetMonthlyAlerts() {
    this.logger.log('Resetting monthly spending alerts...');
    try {
      await this.spendingAlertService.resetMonthlyAlerts();
    } catch (error) {
      this.logger.error(
        `Monthly reset job failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
