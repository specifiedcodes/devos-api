/**
 * EmailModule
 * Story 16.6: Production Email Service (AC12)
 *
 * NestJS module for email notification system.
 * Provides email configuration, template rendering, BullMQ processing,
 * and REST API endpoints for email integration management.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

// Entities
import { EmailConfiguration } from '../../database/entities/email-configuration.entity';
import { EmailBounce } from '../../database/entities/email-bounce.entity';
import { EmailSendLog } from '../../database/entities/email-send-log.entity';

// Services
import { EmailService } from './email.service';
import { EmailNotificationService, EMAIL_NOTIFICATIONS_QUEUE } from './services/email-notification.service';
import { EmailTemplateService } from './services/email-template.service';

// Processor
import { EmailMessageProcessor } from './processors/email-message.processor';

// Controller
import { EmailNotificationController } from './controllers/email-notification.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailConfiguration, EmailBounce, EmailSendLog]),
    BullModule.registerQueue({
      name: EMAIL_NOTIFICATIONS_QUEUE,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    }),
  ],
  controllers: [EmailNotificationController],
  providers: [
    EmailService,             // Backward-compatible service
    EmailNotificationService, // New production service
    EmailTemplateService,     // Template rendering
    EmailMessageProcessor,    // BullMQ processor
  ],
  exports: [
    EmailService,
    EmailNotificationService,
    EmailTemplateService,
  ],
})
export class EmailModule {}
