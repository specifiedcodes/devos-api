import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import * as crypto from 'crypto';
import { SsoAuditWebhook } from '../../../database/entities/sso-audit-webhook.entity';
import { SsoAuditWebhookDelivery } from '../../../database/entities/sso-audit-webhook-delivery.entity';
import { SsoAuditEvent } from '../../../database/entities/sso-audit-event.entity';
import { CreateWebhookParams, UpdateWebhookParams, WebhookDeliveryPayload } from '../interfaces/audit.interfaces';
import { SSO_AUDIT_CONSTANTS } from '../constants/audit.constants';

@Injectable()
export class SsoAuditWebhookService {
  private readonly logger = new Logger(SsoAuditWebhookService.name);

  constructor(
    @InjectRepository(SsoAuditWebhook)
    private readonly webhookRepository: Repository<SsoAuditWebhook>,
    @InjectRepository(SsoAuditWebhookDelivery)
    private readonly deliveryRepository: Repository<SsoAuditWebhookDelivery>,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Create a new webhook
   */
  async createWebhook(params: CreateWebhookParams): Promise<SsoAuditWebhook> {
    if (!params.url.startsWith('https://')) {
      throw new BadRequestException('Webhook URL must use HTTPS');
    }

    const webhook = this.webhookRepository.create({
      workspaceId: params.workspaceId,
      name: params.name,
      url: params.url,
      secret: params.secret || null,
      eventTypes: params.eventTypes || [],
      headers: params.headers || {},
      retryCount: params.retryCount ?? 3,
      timeoutMs: params.timeoutMs ?? 10000,
      createdBy: params.actorId,
    });

    return this.webhookRepository.save(webhook);
  }

  /**
   * Update a webhook
   */
  async updateWebhook(params: UpdateWebhookParams): Promise<SsoAuditWebhook> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: params.webhookId },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook ${params.webhookId} not found`);
    }

    if (webhook.workspaceId !== params.workspaceId) {
      throw new NotFoundException(`Webhook ${params.webhookId} not found in this workspace`);
    }

    if (params.url !== undefined) {
      if (!params.url.startsWith('https://')) {
        throw new BadRequestException('Webhook URL must use HTTPS');
      }
      webhook.url = params.url;
    }

    if (params.name !== undefined) webhook.name = params.name;
    if (params.secret !== undefined) webhook.secret = params.secret || null;
    if (params.eventTypes !== undefined) webhook.eventTypes = params.eventTypes;
    if (params.headers !== undefined) webhook.headers = params.headers;
    if (params.retryCount !== undefined) webhook.retryCount = params.retryCount;
    if (params.timeoutMs !== undefined) webhook.timeoutMs = params.timeoutMs;

    // Reset consecutive failures on re-activation
    if (params.isActive === true && !webhook.isActive) {
      webhook.consecutiveFailures = 0;
    }
    if (params.isActive !== undefined) webhook.isActive = params.isActive;

    return this.webhookRepository.save(webhook);
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string, workspaceId: string): Promise<void> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    if (webhook.workspaceId !== workspaceId) {
      throw new NotFoundException(`Webhook ${webhookId} not found in this workspace`);
    }

    await this.webhookRepository.remove(webhook);
  }

  /**
   * List webhooks for a workspace
   */
  async listWebhooks(workspaceId: string): Promise<SsoAuditWebhook[]> {
    return this.webhookRepository.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get a single webhook
   */
  async getWebhook(webhookId: string, workspaceId: string): Promise<SsoAuditWebhook> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, workspaceId },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    return webhook;
  }

  /**
   * Queue delivery for matching webhooks
   */
  async queueDelivery(event: SsoAuditEvent): Promise<void> {
    const webhooks = await this.webhookRepository.find({
      where: { workspaceId: event.workspaceId, isActive: true },
    });

    for (const webhook of webhooks) {
      // Empty eventTypes means all events
      if (webhook.eventTypes.length > 0 && !webhook.eventTypes.includes(event.eventType)) {
        continue;
      }

      const delivery = this.deliveryRepository.create({
        webhookId: webhook.id,
        eventId: event.id,
        status: 'pending',
        attemptNumber: 1,
      });

      await this.deliveryRepository.save(delivery);
    }
  }

  /**
   * Process pending webhook deliveries
   */
  async processDeliveries(): Promise<number> {
    const deliveries = await this.deliveryRepository.find({
      where: { status: 'pending' },
      relations: ['webhook', 'event'],
      order: { createdAt: 'ASC' },
      take: 100,
    });

    let processedCount = 0;

    for (const delivery of deliveries) {
      if (!delivery.webhook || !delivery.event) {
        delivery.status = 'failure';
        delivery.errorMessage = 'Associated webhook or event not found';
        await this.deliveryRepository.save(delivery);
        processedCount++;
        continue;
      }

      const webhook = delivery.webhook;
      const event = delivery.event;

      const payload: WebhookDeliveryPayload = {
        id: delivery.id,
        event: {
          id: event.id,
          eventType: event.eventType,
          workspaceId: event.workspaceId,
          actorId: event.actorId,
          targetUserId: event.targetUserId,
          ipAddress: event.ipAddress,
          details: event.details,
          createdAt: event.createdAt?.toISOString(),
        },
        deliveredAt: new Date().toISOString(),
      };

      const payloadString = JSON.stringify(payload);

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        [SSO_AUDIT_CONSTANTS.WEBHOOK_EVENT_HEADER]: event.eventType,
        [SSO_AUDIT_CONSTANTS.WEBHOOK_DELIVERY_ID_HEADER]: delivery.id,
        [SSO_AUDIT_CONSTANTS.WEBHOOK_TIMESTAMP_HEADER]: new Date().toISOString(),
        ...webhook.headers,
      };

      // Compute HMAC signature if secret is set
      if (webhook.secret) {
        const hmac = crypto.createHmac(SSO_AUDIT_CONSTANTS.WEBHOOK_HMAC_ALGORITHM, webhook.secret);
        hmac.update(payloadString);
        headers[SSO_AUDIT_CONSTANTS.WEBHOOK_SIGNATURE_HEADER] = `sha256=${hmac.digest('hex')}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), webhook.timeoutMs);

      try {
        const response = await this.httpService.axiosRef.post(webhook.url, payloadString, {
          headers,
          signal: controller.signal,
          validateStatus: () => true, // Don't throw on non-2xx
        });

        const statusCode = response.status;
        const isSuccess = statusCode >= 200 && statusCode < 300;

        delivery.statusCode = statusCode;
        delivery.deliveredAt = new Date();

        if (isSuccess) {
          delivery.status = 'success';
          webhook.lastDeliveryAt = new Date();
          webhook.lastDeliveryStatus = 'success';
          webhook.consecutiveFailures = 0;
        } else {
          delivery.status = 'failure';
          delivery.errorMessage = `HTTP ${statusCode}`;
          const responseBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          delivery.responseBody = responseBody?.substring(0, SSO_AUDIT_CONSTANTS.WEBHOOK_RESPONSE_BODY_MAX_LENGTH) || null;
          webhook.lastDeliveryAt = new Date();
          webhook.lastDeliveryStatus = 'failure';
          webhook.consecutiveFailures += 1;
        }

        await this.deliveryRepository.save(delivery);
        await this.webhookRepository.save(webhook);

        // Handle failure aftermath: auto-disable and retry
        if (!isSuccess) {
          await this.handleDeliveryFailureAftermath(webhook, delivery, event.id);
        }
      } catch (error: any) {
        delivery.status = error.name === 'AbortError' || error.code === 'ERR_CANCELED' ? 'timeout' : 'failure';
        delivery.errorMessage = error.message?.substring(0, SSO_AUDIT_CONSTANTS.WEBHOOK_RESPONSE_BODY_MAX_LENGTH) || 'Unknown error';
        delivery.deliveredAt = new Date();
        await this.deliveryRepository.save(delivery);

        webhook.lastDeliveryAt = new Date();
        webhook.lastDeliveryStatus = delivery.status;
        webhook.consecutiveFailures += 1;
        await this.webhookRepository.save(webhook);

        // Handle failure aftermath: auto-disable and retry
        await this.handleDeliveryFailureAftermath(webhook, delivery, event.id);
      } finally {
        clearTimeout(timeout);
      }

      processedCount++;
    }

    return processedCount;
  }

  /**
   * Handle post-failure logic: auto-disable webhook after max consecutive failures, and create retry delivery
   */
  private async handleDeliveryFailureAftermath(
    webhook: SsoAuditWebhook,
    delivery: SsoAuditWebhookDelivery,
    eventId: string,
  ): Promise<void> {
    // Auto-disable on too many consecutive failures
    if (webhook.consecutiveFailures >= webhook.maxConsecutiveFailures) {
      webhook.isActive = false;
      await this.webhookRepository.save(webhook);
      this.logger.warn(
        `Webhook "${webhook.name}" auto-disabled after ${webhook.consecutiveFailures} consecutive failures`,
      );
    }

    // Create retry if attempts remain
    if (delivery.attemptNumber < webhook.retryCount) {
      const retry = this.deliveryRepository.create({
        webhookId: webhook.id,
        eventId,
        status: 'pending',
        attemptNumber: delivery.attemptNumber + 1,
      });
      await this.deliveryRepository.save(retry);
    }
  }

  /**
   * List deliveries for a webhook
   */
  async listDeliveries(
    webhookId: string,
    workspaceId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ deliveries: SsoAuditWebhookDelivery[]; total: number }> {
    // Verify webhook belongs to workspace
    await this.getWebhook(webhookId, workspaceId);

    const normalizedPage = Math.max(1, page);
    const normalizedLimit = Math.min(200, Math.max(1, limit));
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [deliveries, total] = await this.deliveryRepository.findAndCount({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      skip,
      take: normalizedLimit,
    });

    return { deliveries, total };
  }

  /**
   * Test a webhook with a test payload
   */
  async testWebhook(
    webhookId: string,
    workspaceId: string,
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const webhook = await this.getWebhook(webhookId, workspaceId);

    const payload = {
      id: 'test-delivery',
      event: {
        id: 'test-event',
        eventType: 'webhook_test',
        workspaceId,
        actorId: null,
        targetUserId: null,
        ipAddress: null,
        details: { test: true },
        createdAt: new Date().toISOString(),
      },
      deliveredAt: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [SSO_AUDIT_CONSTANTS.WEBHOOK_EVENT_HEADER]: 'webhook_test',
      [SSO_AUDIT_CONSTANTS.WEBHOOK_DELIVERY_ID_HEADER]: 'test-delivery',
      [SSO_AUDIT_CONSTANTS.WEBHOOK_TIMESTAMP_HEADER]: new Date().toISOString(),
      ...webhook.headers,
    };

    if (webhook.secret) {
      const hmac = crypto.createHmac(SSO_AUDIT_CONSTANTS.WEBHOOK_HMAC_ALGORITHM, webhook.secret);
      hmac.update(payloadString);
      headers[SSO_AUDIT_CONSTANTS.WEBHOOK_SIGNATURE_HEADER] = `sha256=${hmac.digest('hex')}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), webhook.timeoutMs);

    try {
      const response = await this.httpService.axiosRef.post(webhook.url, payloadString, {
        headers,
        signal: controller.signal,
        validateStatus: () => true,
      });

      const isSuccess = response.status >= 200 && response.status < 300;
      return {
        success: isSuccess,
        statusCode: response.status,
        error: isSuccess ? undefined : `HTTP ${response.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Clean up old delivery logs
   */
  async cleanupDeliveryLogs(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.deliveryRepository
      .createQueryBuilder()
      .delete()
      .from(SsoAuditWebhookDelivery)
      .where('created_at < :cutoff', { cutoff: cutoffDate })
      .execute();

    return result.affected || 0;
  }
}
