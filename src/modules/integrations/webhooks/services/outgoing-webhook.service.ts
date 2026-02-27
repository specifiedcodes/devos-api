/**
 * OutgoingWebhookService
 * Story 21-8: Webhook Management (AC6)
 *
 * Manages the lifecycle of outgoing webhooks: creation with auto-generated
 * HMAC secrets, CRUD operations, delivery dispatching via BullMQ,
 * HMAC-SHA256 signing, retry logic with exponential backoff, and
 * auto-disable after consecutive failures.
 */

import {
  Injectable, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as crypto from 'crypto';
import { OutgoingWebhook } from '../../../../database/entities/outgoing-webhook.entity';
import { WebhookDeliveryLog, DeliveryStatus } from '../../../../database/entities/webhook-delivery-log.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import { isValidWebhookEventType } from '../constants/webhook-events';
import {
  CreateWebhookDto, UpdateWebhookDto, WebhookResponseDto,
  DeliveryLogQueryDto, DeliveryLogResponseDto, TestWebhookDto,
} from '../dto/webhook.dto';

const CACHE_KEY_PREFIX = 'outgoing-webhooks:active:';
const CACHE_TTL = 120; // 120 seconds
const MAX_WEBHOOKS_PER_WORKSPACE = 10;
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB
const MAX_RESPONSE_BODY_SIZE = 1024; // 1KB
const DELIVERY_TIMEOUT_MS = 10000; // 10 seconds

@Injectable()
export class OutgoingWebhookService {
  private readonly logger = new Logger(OutgoingWebhookService.name);

  constructor(
    @InjectRepository(OutgoingWebhook)
    private readonly webhookRepo: Repository<OutgoingWebhook>,
    @InjectRepository(WebhookDeliveryLog)
    private readonly deliveryLogRepo: Repository<WebhookDeliveryLog>,
    @InjectQueue('webhook-delivery')
    private readonly deliveryQueue: Queue,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Create a new outgoing webhook with auto-generated HMAC secret.
   */
  async createWebhook(
    workspaceId: string,
    dto: CreateWebhookDto,
    userId: string,
  ): Promise<{ webhook: WebhookResponseDto; secret: string }> {
    // Validate event types
    const invalidEvents = dto.events.filter((e) => !isValidWebhookEventType(e));
    if (invalidEvents.length > 0) {
      throw new BadRequestException(
        `Invalid event types: ${invalidEvents.join(', ')}`,
      );
    }

    // Enforce max webhooks per workspace
    const existingCount = await this.webhookRepo.count({ where: { workspaceId } });
    if (existingCount >= MAX_WEBHOOKS_PER_WORKSPACE) {
      throw new BadRequestException(
        `Workspace already has the maximum of ${MAX_WEBHOOKS_PER_WORKSPACE} webhooks`,
      );
    }

    // Generate HMAC secret
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const encryptedSecret = this.encryptionService.encrypt(rawSecret);

    // Encrypt headers if provided - wrap encrypted string in object for JSONB storage
    const encryptedHeaders: Record<string, string> = dto.headers && Object.keys(dto.headers).length > 0
      ? { _encrypted: this.encryptionService.encrypt(JSON.stringify(dto.headers)) }
      : {};

    const webhook = this.webhookRepo.create({
      workspaceId,
      name: dto.name,
      url: dto.url,
      events: dto.events,
      headers: encryptedHeaders,
      secretHash: encryptedSecret,
      createdBy: userId,
      isActive: true,
      failureCount: 0,
      consecutiveFailures: 0,
      maxConsecutiveFailures: 3,
    });

    const saved = await this.webhookRepo.save(webhook);

    // Invalidate cache
    await this.invalidateCache(workspaceId);

    return {
      webhook: this.toResponseDto(saved),
      secret: rawSecret,
    };
  }

  /**
   * List all webhooks for a workspace.
   */
  async listWebhooks(workspaceId: string): Promise<WebhookResponseDto[]> {
    const webhooks = await this.webhookRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
    return webhooks.map((w) => this.toResponseDto(w));
  }

  /**
   * Get a single webhook by ID.
   */
  async getWebhook(workspaceId: string, webhookId: string): Promise<WebhookResponseDto> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, workspaceId },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }
    return this.toResponseDto(webhook);
  }

  /**
   * Update a webhook.
   */
  async updateWebhook(
    workspaceId: string,
    webhookId: string,
    dto: UpdateWebhookDto,
  ): Promise<WebhookResponseDto> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, workspaceId },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    // Validate event types if provided
    if (dto.events) {
      const invalidEvents = dto.events.filter((e) => !isValidWebhookEventType(e));
      if (invalidEvents.length > 0) {
        throw new BadRequestException(
          `Invalid event types: ${invalidEvents.join(', ')}`,
        );
      }
    }

    // Create updated webhook object (avoid mutating the entity directly)
    const updates: Partial<OutgoingWebhook> = {};

    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.events !== undefined) updates.events = dto.events;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    if (dto.url !== undefined) {
      updates.url = dto.url;
      // Reset consecutive failures when URL changes
      updates.consecutiveFailures = 0;
    }

    if (dto.headers !== undefined) {
      updates.headers = Object.keys(dto.headers).length > 0
        ? { _encrypted: this.encryptionService.encrypt(JSON.stringify(dto.headers)) }
        : {};
    }

    await this.webhookRepo.update({ id: webhookId }, updates);

    // Invalidate cache
    await this.invalidateCache(workspaceId);

    const updated = await this.webhookRepo.findOne({
      where: { id: webhookId },
    });
    return this.toResponseDto(updated!);
  }

  /**
   * Delete a webhook and all its delivery logs (cascading).
   */
  async deleteWebhook(workspaceId: string, webhookId: string): Promise<void> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, workspaceId },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    await this.webhookRepo.remove(webhook);

    // Invalidate cache
    await this.invalidateCache(workspaceId);
  }

  /**
   * Rotate the HMAC secret for a webhook.
   */
  async rotateSecret(
    workspaceId: string,
    webhookId: string,
  ): Promise<{ secret: string }> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, workspaceId },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    const rawSecret = crypto.randomBytes(32).toString('hex');
    const encryptedSecret = this.encryptionService.encrypt(rawSecret);

    await this.webhookRepo.update({ id: webhookId }, { secretHash: encryptedSecret });

    return { secret: rawSecret };
  }

  /**
   * Send a test payload to a webhook (synchronous, not queued).
   */
  async testWebhook(
    workspaceId: string,
    webhookId: string,
    dto: TestWebhookDto,
  ): Promise<DeliveryLogResponseDto> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, workspaceId },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    const eventType = dto.eventType || 'test.ping';
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery from DevOS',
        webhookId: webhook.id,
        workspaceId: webhook.workspaceId,
      },
    };

    // Create delivery log
    const deliveryLog = this.deliveryLogRepo.create({
      webhookId: webhook.id,
      eventType,
      payload,
      status: DeliveryStatus.PENDING,
      attemptNumber: 1,
      maxAttempts: 1, // No retries for test deliveries
    });
    const savedLog = await this.deliveryLogRepo.save(deliveryLog);

    // Execute delivery synchronously
    await this.executeDelivery(webhook, savedLog);

    // Fetch updated log
    const updatedLog = await this.deliveryLogRepo.findOne({
      where: { id: savedLog.id },
    });
    return this.toDeliveryLogDto(updatedLog!);
  }

  /**
   * Get delivery logs for a webhook with pagination.
   */
  async getDeliveryLogs(
    workspaceId: string,
    webhookId: string,
    query: DeliveryLogQueryDto,
  ): Promise<{ items: DeliveryLogResponseDto[]; total: number }> {
    // Validate ownership
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, workspaceId },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    const limit = query.limit || 20;
    const offset = query.offset || 0;

    const qb = this.deliveryLogRepo
      .createQueryBuilder('log')
      .where('log.webhookId = :webhookId', { webhookId })
      .orderBy('log.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (query.status) {
      qb.andWhere('log.status = :status', { status: query.status });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((log) => this.toDeliveryLogDto(log)),
      total,
    };
  }

  /**
   * Retry a specific failed delivery.
   */
  async retryDelivery(
    workspaceId: string,
    webhookId: string,
    deliveryId: string,
  ): Promise<DeliveryLogResponseDto> {
    // Validate ownership
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, workspaceId },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    const deliveryLog = await this.deliveryLogRepo.findOne({
      where: { id: deliveryId, webhookId },
    });
    if (!deliveryLog) {
      throw new NotFoundException('Delivery log not found');
    }

    if (deliveryLog.status !== DeliveryStatus.FAILED) {
      throw new BadRequestException('Only failed deliveries can be retried');
    }

    // Update delivery log for retry
    deliveryLog.status = DeliveryStatus.RETRYING;
    deliveryLog.attemptNumber += 1;
    await this.deliveryLogRepo.save(deliveryLog);

    // Queue retry
    await this.deliveryQueue.add('deliver', {
      webhookId: webhook.id,
      deliveryLogId: deliveryLog.id,
    }, {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 500,
    });

    return this.toDeliveryLogDto(deliveryLog);
  }

  /**
   * Dispatch an event to all active webhooks subscribed to the event type.
   */
  async dispatchEvent(
    workspaceId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // Get active webhooks (try cache first)
    const webhooks = await this.getActiveWebhooks(workspaceId);

    // Filter by event subscription
    const subscribedWebhooks = webhooks.filter(
      (w) => w.events.includes(eventType),
    );

    // Queue delivery for each webhook
    for (const webhook of subscribedWebhooks) {
      // Truncate payload if too large - store a safe summary instead of broken JSON parse
      const payloadStr = JSON.stringify(payload);
      let finalPayload: Record<string, unknown> = payload;
      if (payloadStr.length > MAX_PAYLOAD_SIZE) {
        finalPayload = {
          _truncated: true,
          _originalSize: payloadStr.length,
          event: payload.event || eventType,
          timestamp: payload.timestamp || new Date().toISOString(),
        };
      }

      // Create delivery log
      const deliveryLog = this.deliveryLogRepo.create({
        webhookId: webhook.id,
        eventType,
        payload: finalPayload,
        status: DeliveryStatus.PENDING,
        attemptNumber: 1,
        maxAttempts: 4,
      });
      const savedLog = await this.deliveryLogRepo.save(deliveryLog);

      // Queue delivery job
      await this.deliveryQueue.add('deliver', {
        webhookId: webhook.id,
        deliveryLogId: savedLog.id,
      }, {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    }
  }

  /**
   * Execute an HTTP POST to the webhook URL with signed payload.
   * Public for use by the processor.
   */
  async executeDelivery(
    webhook: OutgoingWebhook,
    deliveryLog: WebhookDeliveryLog,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Decrypt secret
      const secret = this.encryptionService.decrypt(webhook.secretHash);

      // Prepare payload
      const payloadStr = JSON.stringify(deliveryLog.payload || {});

      // Sign payload
      const signature = this.signPayload(secret, payloadStr);

      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-DevOS-Signature': `sha256=${signature}`,
        'X-DevOS-Event': deliveryLog.eventType,
        'X-DevOS-Delivery': deliveryLog.id,
        'X-DevOS-Timestamp': String(Math.floor(Date.now() / 1000)),
      };

      // Add custom headers (decrypt if encrypted)
      if (webhook.headers && Object.keys(webhook.headers).length > 0) {
        try {
          const decryptedHeaders = this.decryptHeaders(webhook.headers);
          Object.assign(headers, decryptedHeaders);
        } catch {
          this.logger.warn(`Failed to decrypt custom headers for webhook ${webhook.id}`);
        }
      }

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payloadStr,
          signal: controller.signal,
        });

        const durationMs = Date.now() - startTime;
        let responseBody: string | null = null;
        try {
          const rawBody = await response.text();
          responseBody = rawBody.substring(0, MAX_RESPONSE_BODY_SIZE);
        } catch {
          // Ignore response body read errors
        }

        if (response.ok) {
          // Success
          deliveryLog.status = DeliveryStatus.SUCCESS;
          deliveryLog.responseCode = response.status;
          deliveryLog.responseBody = responseBody;
          deliveryLog.durationMs = durationMs;
          deliveryLog.errorMessage = null;
          await this.deliveryLogRepo.save(deliveryLog);

          // Update webhook: reset consecutive failures, update last triggered
          await this.webhookRepo.update({ id: webhook.id }, {
            consecutiveFailures: 0,
            lastTriggeredAt: new Date(),
            lastDeliveryStatus: 'success',
          });

          // Invalidate cache on success (status changed)
          await this.invalidateCache(webhook.workspaceId);
        } else {
          // HTTP error
          deliveryLog.status = DeliveryStatus.FAILED;
          deliveryLog.responseCode = response.status;
          deliveryLog.responseBody = responseBody;
          deliveryLog.durationMs = durationMs;
          deliveryLog.errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          await this.deliveryLogRepo.save(deliveryLog);

          await this.handleDeliveryFailure(webhook);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      deliveryLog.status = DeliveryStatus.FAILED;
      deliveryLog.durationMs = durationMs;
      deliveryLog.errorMessage = errorMessage;
      await this.deliveryLogRepo.save(deliveryLog);

      await this.handleDeliveryFailure(webhook);
    }
  }

  /**
   * Handle webhook delivery failure: atomically increment failures, auto-disable if threshold reached.
   * Uses atomic SQL SET col = col + 1 to avoid TOCTOU race conditions under concurrent deliveries.
   */
  private async handleDeliveryFailure(webhook: OutgoingWebhook): Promise<void> {
    // Atomic increment to avoid race conditions when multiple deliveries fail concurrently
    await this.webhookRepo
      .createQueryBuilder()
      .update(OutgoingWebhook)
      .set({
        consecutiveFailures: () => 'consecutive_failures + 1',
        failureCount: () => 'failure_count + 1',
        lastTriggeredAt: new Date(),
        lastDeliveryStatus: 'failed',
      } as any)
      .where('id = :id', { id: webhook.id })
      .execute();

    // Re-read to check auto-disable threshold
    const updated = await this.webhookRepo.findOne({ where: { id: webhook.id } });
    if (updated && updated.consecutiveFailures >= updated.maxConsecutiveFailures && updated.isActive) {
      await this.webhookRepo.update({ id: webhook.id }, { isActive: false });
      this.logger.warn(
        `Webhook ${webhook.id} auto-disabled after ${updated.consecutiveFailures} consecutive failures`,
      );
    }

    // Invalidate cache on failure (status or active state changed)
    await this.invalidateCache(webhook.workspaceId);
  }

  /**
   * Sign a payload using HMAC-SHA256.
   */
  signPayload(secret: string, payload: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Calculate next retry delay using exponential backoff.
   */
  getRetryDelay(attemptNumber: number): number {
    switch (attemptNumber) {
      case 1: return 1000;    // 1s
      case 2: return 10000;   // 10s
      case 3: return 60000;   // 60s
      default: return 60000;  // Cap at 60s
    }
  }

  /**
   * Get active webhooks for a workspace (with caching).
   */
  private async getActiveWebhooks(workspaceId: string): Promise<OutgoingWebhook[]> {
    const cacheKey = `${CACHE_KEY_PREFIX}${workspaceId}`;

    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Cache read failure, proceed to DB
    }

    const webhooks = await this.webhookRepo.find({
      where: { workspaceId, isActive: true },
    });

    try {
      await this.redisService.set(cacheKey, JSON.stringify(webhooks), CACHE_TTL);
    } catch {
      // Cache write failure, proceed anyway
    }

    return webhooks;
  }

  /**
   * Invalidate cached active webhooks for a workspace.
   */
  private async invalidateCache(workspaceId: string): Promise<void> {
    const cacheKey = `${CACHE_KEY_PREFIX}${workspaceId}`;
    try {
      await this.redisService.del(cacheKey);
    } catch {
      this.logger.warn(`Failed to invalidate webhook cache for workspace ${workspaceId}`);
    }
  }

  /**
   * Decrypt custom headers from storage.
   * Headers are stored as { _encrypted: "encrypted_string" } in JSONB.
   */
  private decryptHeaders(headers: Record<string, string>): Record<string, string> {
    if (headers._encrypted) {
      const decrypted = this.encryptionService.decrypt(headers._encrypted);
      return JSON.parse(decrypted);
    }
    // Legacy or unencrypted headers - return as-is (excluding internal keys)
    return headers;
  }

  /**
   * Convert an OutgoingWebhook entity to WebhookResponseDto.
   */
  private toResponseDto(webhook: OutgoingWebhook): WebhookResponseDto {
    return {
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      failureCount: webhook.failureCount,
      consecutiveFailures: webhook.consecutiveFailures,
      lastTriggeredAt: webhook.lastTriggeredAt?.toISOString() ?? null,
      lastDeliveryStatus: webhook.lastDeliveryStatus,
      createdBy: webhook.createdBy,
      createdAt: webhook.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: webhook.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  /**
   * Convert a WebhookDeliveryLog entity to DeliveryLogResponseDto.
   */
  private toDeliveryLogDto(log: WebhookDeliveryLog): DeliveryLogResponseDto {
    return {
      id: log.id,
      webhookId: log.webhookId,
      eventType: log.eventType,
      status: log.status,
      responseCode: log.responseCode,
      errorMessage: log.errorMessage,
      attemptNumber: log.attemptNumber,
      maxAttempts: log.maxAttempts,
      durationMs: log.durationMs,
      nextRetryAt: log.nextRetryAt?.toISOString() ?? null,
      createdAt: log.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
