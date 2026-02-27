/**
 * WebhookDeliveryProcessor
 * Story 21-8: Webhook Management (AC7)
 *
 * Processes queued webhook delivery jobs:
 * - Fetches the webhook and delivery log
 * - Executes the HTTP POST with HMAC signature
 * - On failure, schedules retry with exponential backoff
 * - After max retries, marks delivery as permanently failed
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { OutgoingWebhook } from '../../../../database/entities/outgoing-webhook.entity';
import { WebhookDeliveryLog, DeliveryStatus } from '../../../../database/entities/webhook-delivery-log.entity';
import { OutgoingWebhookService } from '../services/outgoing-webhook.service';

@Processor('webhook-delivery')
export class WebhookDeliveryProcessor {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(
    @InjectRepository(OutgoingWebhook)
    private readonly webhookRepo: Repository<OutgoingWebhook>,
    @InjectRepository(WebhookDeliveryLog)
    private readonly deliveryLogRepo: Repository<WebhookDeliveryLog>,
    private readonly outgoingWebhookService: OutgoingWebhookService,
    @InjectQueue('webhook-delivery')
    private readonly deliveryQueue: Queue,
  ) {}

  @Process('deliver')
  async handleDelivery(job: Job<{
    webhookId: string;
    deliveryLogId: string;
  }>): Promise<void> {
    const { webhookId, deliveryLogId } = job.data;

    this.logger.debug(
      `Processing webhook delivery: webhook=${webhookId}, delivery=${deliveryLogId}`,
    );

    // Fetch webhook
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId },
    });

    if (!webhook || !webhook.isActive) {
      // Webhook deleted or disabled - mark delivery as failed
      const deliveryLog = await this.deliveryLogRepo.findOne({
        where: { id: deliveryLogId },
      });
      if (deliveryLog) {
        deliveryLog.status = DeliveryStatus.FAILED;
        deliveryLog.errorMessage = 'Webhook disabled or deleted';
        await this.deliveryLogRepo.save(deliveryLog);
      }
      return;
    }

    // Fetch delivery log
    const deliveryLog = await this.deliveryLogRepo.findOne({
      where: { id: deliveryLogId },
    });

    if (!deliveryLog) {
      this.logger.warn(`Delivery log not found: ${deliveryLogId}`);
      return;
    }

    // Execute delivery
    await this.outgoingWebhookService.executeDelivery(webhook, deliveryLog);

    // Re-fetch delivery log to check status
    const updatedLog = await this.deliveryLogRepo.findOne({
      where: { id: deliveryLogId },
    });

    if (!updatedLog) return;

    // Handle retry logic
    if (updatedLog.status === DeliveryStatus.FAILED) {
      if (updatedLog.attemptNumber < updatedLog.maxAttempts) {
        // Schedule retry
        const retryDelay = this.outgoingWebhookService.getRetryDelay(updatedLog.attemptNumber);

        // Update delivery log for retry
        updatedLog.status = DeliveryStatus.RETRYING;
        updatedLog.attemptNumber += 1;
        updatedLog.nextRetryAt = new Date(Date.now() + retryDelay);
        await this.deliveryLogRepo.save(updatedLog);

        // Add delayed job
        await this.deliveryQueue.add('deliver', {
          webhookId,
          deliveryLogId,
        }, {
          delay: retryDelay,
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 500,
        });

        this.logger.debug(
          `Scheduled retry for delivery ${deliveryLogId}, attempt ${updatedLog.attemptNumber}, delay ${retryDelay}ms`,
        );
      } else {
        // Max attempts reached - keep as failed
        this.logger.warn(
          `Webhook delivery ${deliveryLogId} permanently failed after ${updatedLog.attemptNumber} attempts`,
        );
      }
    }
  }
}
