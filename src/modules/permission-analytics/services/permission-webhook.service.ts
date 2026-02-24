import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { PermissionWebhook } from '../../../database/entities/permission-webhook.entity';
import {
  CreatePermissionWebhookDto,
  WebhookEventType,
} from '../dto/create-permission-webhook.dto';
import { UpdatePermissionWebhookDto } from '../dto/update-permission-webhook.dto';

/** Maximum webhooks per workspace */
const MAX_WEBHOOKS_PER_WORKSPACE = 10;

/** Maximum consecutive failures before auto-disable */
const MAX_CONSECUTIVE_FAILURES = 10;

/** Maximum retry attempts for webhook delivery */
const MAX_RETRIES = 3;

/** Webhook delivery timeout in ms */
const DELIVERY_TIMEOUT_MS = 10000;

/**
 * Webhook payload structure for permission events.
 */
export interface PermissionWebhookPayload {
  event: string;
  timestamp: string;
  workspace_id: string;
  data: {
    user_id?: string;
    role_id?: string;
    changes?: Array<{
      resource: string;
      permission: string;
      old_value: boolean;
      new_value: boolean;
    }>;
  };
}

@Injectable()
export class PermissionWebhookService {
  private readonly logger = new Logger(PermissionWebhookService.name);

  constructor(
    @InjectRepository(PermissionWebhook)
    private readonly webhookRepo: Repository<PermissionWebhook>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a new webhook. Returns the signing secret (only shown once).
   */
  async createWebhook(
    workspaceId: string,
    dto: CreatePermissionWebhookDto,
    actorId: string,
  ): Promise<{ webhook: PermissionWebhook; signingSecret: string }> {
    // Validate URL is HTTPS (before entering transaction)
    if (!dto.url.startsWith('https://')) {
      throw new BadRequestException('Webhook URL must use HTTPS');
    }

    // Validate event types (before entering transaction)
    const validEventTypes = Object.values(WebhookEventType);
    for (const eventType of dto.eventTypes) {
      if (!validEventTypes.includes(eventType as WebhookEventType)) {
        throw new BadRequestException(`Invalid event type: ${eventType}`);
      }
    }

    // Generate signing secret.
    // NOTE: The secret is stored as-is (not bcrypt-hashed) because HMAC-SHA256 signing
    // requires the original key on both sides. Bcrypt is a one-way hash and cannot be
    // reversed to produce the HMAC key. The secretHash column stores the raw hex secret
    // server-side for signing outbound payloads.
    const signingSecret = crypto.randomBytes(32).toString('hex');

    // Wrap count+save in a transaction to prevent TOCTOU race on workspace webhook limit
    const saved = await this.dataSource.transaction(async (manager) => {
      const existingCount = await manager.count(PermissionWebhook, { where: { workspaceId } });
      if (existingCount >= MAX_WEBHOOKS_PER_WORKSPACE) {
        throw new BadRequestException(
          `Workspace webhook limit reached (maximum ${MAX_WEBHOOKS_PER_WORKSPACE})`,
        );
      }

      const webhook = manager.create(PermissionWebhook, {
        workspaceId,
        url: dto.url,
        secretHash: signingSecret,
        eventTypes: dto.eventTypes,
        isActive: true,
        failureCount: 0,
        createdBy: actorId,
      });

      return manager.save(webhook);
    });

    this.logger.log(
      `Created permission webhook for workspace ${workspaceId}: ${dto.url}`,
    );

    return { webhook: saved, signingSecret };
  }

  /**
   * List all webhooks for a workspace (excludes secretHash).
   */
  async listWebhooks(workspaceId: string): Promise<PermissionWebhook[]> {
    const webhooks = await this.webhookRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });

    // Strip secretHash from response
    return webhooks.map((w) => {
      const { secretHash: _hash, ...rest } = w;
      return { ...rest, secretHash: '' } as PermissionWebhook;
    });
  }

  /**
   * Update a webhook's configuration.
   */
  async updateWebhook(
    workspaceId: string,
    webhookId: string,
    dto: UpdatePermissionWebhookDto,
    actorId: string,
  ): Promise<PermissionWebhook> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, workspaceId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    if (dto.url !== undefined) {
      if (!dto.url.startsWith('https://')) {
        throw new BadRequestException('Webhook URL must use HTTPS');
      }
      webhook.url = dto.url;
    }

    if (dto.eventTypes !== undefined) {
      const validEventTypes = Object.values(WebhookEventType);
      for (const eventType of dto.eventTypes) {
        if (!validEventTypes.includes(eventType as WebhookEventType)) {
          throw new BadRequestException(`Invalid event type: ${eventType}`);
        }
      }
      webhook.eventTypes = dto.eventTypes;
    }

    if (dto.isActive !== undefined) {
      webhook.isActive = dto.isActive;
      // Reset failure count when re-enabling
      if (dto.isActive) {
        webhook.failureCount = 0;
      }
    }

    const saved = await this.webhookRepo.save(webhook);

    this.logger.log(
      `Updated permission webhook ${webhookId} for workspace ${workspaceId}`,
    );

    // Return a copy with secretHash stripped (do not mutate the entity in-memory
    // as it may be reused by TypeORM's identity map in the same request lifecycle)
    const { secretHash: _hash, ...rest } = saved;
    return { ...rest, secretHash: '' } as PermissionWebhook;
  }

  /**
   * Permanently delete a webhook.
   */
  async deleteWebhook(
    workspaceId: string,
    webhookId: string,
    actorId: string,
  ): Promise<void> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, workspaceId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    await this.webhookRepo.remove(webhook);

    this.logger.log(
      `Deleted permission webhook ${webhookId} for workspace ${workspaceId}`,
    );
  }

  /**
   * Dispatch a permission change event to all matching active webhooks.
   * Signs payload with HMAC-SHA256.
   * Retries up to 3 times with exponential backoff.
   * Disables webhook after 10 consecutive failures.
   */
  async dispatchEvent(
    workspaceId: string,
    event: PermissionWebhookPayload,
  ): Promise<void> {
    const webhooks = await this.webhookRepo.find({
      where: { workspaceId, isActive: true },
    });

    const matchingWebhooks = webhooks.filter((w) =>
      w.eventTypes.includes(event.event),
    );

    // Fire-and-forget delivery to each webhook
    for (const webhook of matchingWebhooks) {
      this.deliverWithRetry(webhook, event).catch((error) => {
        this.logger.error(
          `Failed to deliver webhook ${webhook.id}: ${error.message}`,
        );
      });
    }
  }

  /**
   * Send a test ping to a webhook URL.
   */
  async testWebhook(
    workspaceId: string,
    webhookId: string,
  ): Promise<{ success: boolean; statusCode: number; responseTime: number }> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, workspaceId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    const testPayload: PermissionWebhookPayload = {
      event: 'test.ping',
      timestamp: new Date().toISOString(),
      workspace_id: workspaceId,
      data: {},
    };

    const startTime = Date.now();
    try {
      const body = JSON.stringify(testPayload);
      const signature = this.signPayload(body, webhook.secretHash);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-DevOS-Signature': signature,
            'X-DevOS-Event': 'test.ping',
          },
          body,
          signal: controller.signal,
        });

        const responseTime = Date.now() - startTime;

        return {
          success: response.ok,
          statusCode: response.status,
          responseTime,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        statusCode: 0,
        responseTime,
      };
    }
  }

  /**
   * Deliver a webhook payload with retry logic.
   */
  private async deliverWithRetry(
    webhook: PermissionWebhook,
    event: PermissionWebhookPayload,
  ): Promise<void> {
    const body = JSON.stringify(event);
    const signature = this.signPayload(body, webhook.secretHash);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

        try {
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-DevOS-Signature': signature,
              'X-DevOS-Event': event.event,
            },
            body,
            signal: controller.signal,
          });

          if (response.ok) {
            // Reset failure count on success
            await this.webhookRepo.update(webhook.id, {
              failureCount: 0,
              lastTriggeredAt: new Date(),
            });
            return;
          }
        } finally {
          clearTimeout(timeout);
        }

        // Non-2xx response - retry
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(4, attempt) * 1000; // 1s, 4s, 16s
          await this.sleep(delay);
        }
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(4, attempt) * 1000;
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted - increment failure count
    const newFailureCount = webhook.failureCount + 1;
    const updates: Partial<PermissionWebhook> = {
      failureCount: newFailureCount,
      lastTriggeredAt: new Date(),
    };

    // Auto-disable after MAX_CONSECUTIVE_FAILURES
    if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
      updates.isActive = false;
      this.logger.warn(
        `Webhook ${webhook.id} disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`,
      );
    }

    await this.webhookRepo.update(webhook.id, updates);
  }

  /**
   * Sign a payload with HMAC-SHA256.
   */
  private signPayload(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Sleep for a given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
