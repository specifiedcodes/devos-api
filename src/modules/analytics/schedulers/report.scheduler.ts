import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledReport, ReportFrequency } from '../../../database/entities/scheduled-report.entity';
import { ScheduledReportsService } from '../services/scheduled-reports.service';
import { ReportGeneratorService } from '../services/report-generator.service';

@Injectable()
export class ReportScheduler {
  private readonly logger = new Logger(ReportScheduler.name);
  private isProcessingDaily = false;
  private isProcessingHourly = false;

  constructor(
    private readonly scheduledReportsService: ScheduledReportsService,
    private readonly reportGeneratorService: ReportGeneratorService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processDailyReports() {
    if (this.isProcessingDaily) {
      this.logger.debug('Daily report processing already in progress, skipping');
      return;
    }

    this.isProcessingDaily = true;
    this.logger.log('Starting daily report processing');

    try {
      const reports = await this.scheduledReportsService.findDueReports(ReportFrequency.DAILY);
      this.logger.log(`Found ${reports.length} daily reports due`);

      await this.processReports(reports);
    } catch (error) {
      this.logger.error('Error processing daily reports', error);
    } finally {
      this.isProcessingDaily = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processHourlyReports() {
    if (this.isProcessingHourly) {
      this.logger.debug('Hourly report processing already in progress, skipping');
      return;
    }

    this.isProcessingHourly = true;
    this.logger.log('Starting hourly report check for weekly/monthly reports');

    try {
      const weeklyReports = await this.scheduledReportsService.findDueReports(ReportFrequency.WEEKLY);
      const monthlyReports = await this.scheduledReportsService.findDueReports(ReportFrequency.MONTHLY);

      const allReports = [...weeklyReports, ...monthlyReports];
      this.logger.log(`Found ${allReports.length} weekly/monthly reports due`);

      await this.processReports(allReports);
    } catch (error) {
      this.logger.error('Error processing hourly reports', error);
    } finally {
      this.isProcessingHourly = false;
    }
  }

  private async processReports(reports: ScheduledReport[]) {
    for (const report of reports) {
      try {
        await this.processReport(report);
      } catch (error) {
        this.logger.error(`Failed to process report ${report.id}: ${report.name}`, error);
      }
    }
  }

  private async processReport(report: ScheduledReport) {
    this.logger.log(`Processing report: ${report.name} (${report.id})`);

    try {
      const reportBuffer = await this.reportGeneratorService.generateReport(report);

      await this.sendReportEmail(report, reportBuffer);

      await this.scheduledReportsService.markAsSent(report.id);

      this.logger.log(`Successfully sent report: ${report.name}`);
    } catch (error) {
      this.logger.error(`Failed to generate/send report ${report.id}`, error);
      throw error;
    }
  }

  private async sendReportEmail(report: ScheduledReport, reportBuffer: Buffer) {
    this.logger.log(`Would send email to ${report.recipients.length} recipients for report: ${report.name}`);

    for (const recipient of report.recipients) {
      this.logger.debug(`Sending report ${report.name} to ${recipient}`);
    }
  }
}
