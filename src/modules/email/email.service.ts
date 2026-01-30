import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter based on environment
   */
  private initializeTransporter(): void {
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      SMTP_FROM,
      NODE_ENV,
    } = process.env;

    // In development, use Ethereal (test email service) if SMTP not configured
    if (NODE_ENV === 'development' && (!SMTP_HOST || !SMTP_USER)) {
      this.logger.warn(
        'SMTP not configured. Emails will be logged only. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env',
      );
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT || '587', 10),
        secure: parseInt(SMTP_PORT || '587', 10) === 465, // true for 465, false for other ports
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

      this.logger.log(
        `Email transporter initialized: ${SMTP_HOST}:${SMTP_PORT}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize email transporter: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    template: string;
    context: Record<string, any>;
  }): Promise<void> {
    const { to, subject, template, context } = options;

    // If transporter not configured, log only
    if (!this.transporter) {
      this.logger.log(
        `[EMAIL STUB] To: ${to} | Subject: ${subject} | Template: ${template}`,
      );
      this.logger.debug('Email context:', context);
      return;
    }

    try {
      // Generate HTML from template
      const html = this.renderTemplate(template, context);

      // Send email
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"DevOS" <noreply@devos.app>',
        to,
        subject,
        html,
      });

      this.logger.log(
        `Email sent: ${info.messageId} to ${to} (${subject})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Render email template
   * TODO: Use Handlebars for proper templating
   */
  private renderTemplate(
    template: string,
    context: Record<string, any>,
  ): string {
    if (template === 'spending-alert') {
      return this.renderSpendingAlertTemplate(context as any);
    }

    // Default template
    return `
      <!DOCTYPE html>
      <html>
        <body>
          <h2>Notification from DevOS</h2>
          <pre>${JSON.stringify(context, null, 2)}</pre>
        </body>
      </html>
    `;
  }

  /**
   * Render spending alert email template
   */
  private renderSpendingAlertTemplate(context: {
    workspaceName: string;
    threshold: number;
    currentSpend: string;
    limit: string;
    percentageUsed: number;
    critical: boolean;
    dashboardUrl: string;
  }): string {
    const {
      workspaceName,
      threshold,
      currentSpend,
      limit,
      percentageUsed,
      critical,
      dashboardUrl,
    } = context;

    const backgroundColor = critical ? '#fee2e2' : '#fef3c7';
    const borderColor = critical ? '#dc2626' : '#f59e0b';
    const emoji = critical ? '⛔' : '⚠️';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert-box { background: ${backgroundColor}; border-left: 4px solid ${borderColor}; padding: 16px; margin: 20px 0; border-radius: 4px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${emoji} Spending Alert</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>

            <div class="alert-box">
              <h2 style="margin-top: 0;">${threshold}% Budget Used</h2>
              <p><strong>Workspace:</strong> ${workspaceName}</p>
              <p><strong>Current Spend:</strong> $${currentSpend}</p>
              <p><strong>Monthly Limit:</strong> $${limit}</p>
              <p><strong>Percentage Used:</strong> ${percentageUsed}%</p>
            </div>

            ${
              critical
                ? `
            <p><strong>⛔ New agent tasks are currently blocked.</strong></p>
            <p>To continue using AI agents, you can:</p>
            <ul>
              <li>Increase your monthly budget in workspace settings</li>
              <li>Wait until next month (budget resets automatically)</li>
              <li>Override the limit manually (workspace owners only)</li>
            </ul>
            `
                : `
            <p>You're approaching your monthly AI spending budget. Consider increasing your limit if you need more capacity this month.</p>
            `
            }

            <a href="${dashboardUrl}" class="button">View Usage Dashboard</a>

            <div class="footer">
              <p>DevOS - Autonomous Development Platform</p>
              <p>This is an automated alert. You can configure spending limits in workspace settings.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
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
