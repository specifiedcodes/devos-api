import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendEmail(options: {
    to: string;
    subject: string;
    template: string;
    context: Record<string, any>;
  }): Promise<void> {
    // TODO: Implement with NodeMailer or SendGrid
    this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    this.logger.debug(`Template: ${options.template}`, options.context);

    // For now, just log. In production, use actual email service
    // await this.mailerService.sendMail({
    //   to: options.to,
    //   subject: options.subject,
    //   template: options.template,
    //   context: options.context,
    // });
  }

  /**
   * Send spending alert email (Story 3.5)
   */
  async sendSpendingAlert(
    to: string,
    workspaceName: string,
    threshold: number,
    currentSpend: number,
    limit: number,
  ): Promise<void> {
    const percentageUsed = Math.round((currentSpend / limit) * 100);
    const critical = threshold >= 100;

    const subject = critical
      ? `⛔ Monthly Budget Reached - ${workspaceName}`
      : `⚠️ Spending Alert: ${threshold}% Budget Used - ${workspaceName}`;

    await this.sendEmail({
      to,
      subject,
      template: 'spending-alert',
      context: {
        workspaceName,
        threshold,
        currentSpend: currentSpend.toFixed(2),
        limit: limit.toFixed(2),
        percentageUsed,
        critical,
        dashboardUrl: `${process.env.FRONTEND_URL}/workspace/settings/usage`,
      },
    });
  }
}
