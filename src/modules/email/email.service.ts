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
}
