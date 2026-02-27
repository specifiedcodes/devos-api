/**
 * WebhookModule
 * Story 21-8: Webhook Management (AC9)
 *
 * NestJS module registering all webhook components.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { OutgoingWebhook } from '../../../database/entities/outgoing-webhook.entity';
import { WebhookDeliveryLog } from '../../../database/entities/webhook-delivery-log.entity';
import { OutgoingWebhookController } from './controllers/outgoing-webhook.controller';
import { OutgoingWebhookService } from './services/outgoing-webhook.service';
import { WebhookDeliveryProcessor } from './processors/webhook-delivery.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutgoingWebhook, WebhookDeliveryLog]),
    BullModule.registerQueue({ name: 'webhook-delivery' }),
  ],
  controllers: [OutgoingWebhookController],
  providers: [OutgoingWebhookService, WebhookDeliveryProcessor],
  exports: [OutgoingWebhookService],
})
export class WebhookModule {}
