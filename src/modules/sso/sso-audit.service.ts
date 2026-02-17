import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { SsoAuditEvent, SsoAuditEventType } from '../../database/entities/sso-audit-event.entity';

export interface LogEventParams {
  workspaceId: string;
  eventType: SsoAuditEventType;
  actorId?: string;
  targetUserId?: string;
  samlConfigId?: string;
  oidcConfigId?: string;
  domainId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

export interface ListEventsFilters {
  eventType?: SsoAuditEventType;
  actorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedAuditEvents {
  events: SsoAuditEvent[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class SsoAuditService {
  private readonly logger = new Logger(SsoAuditService.name);

  // Lazy-loaded references to avoid circular dependency
  // Typed as partial interfaces to preserve type safety without importing concrete classes
  private alertService: { evaluateAlertRules(event: SsoAuditEvent): Promise<unknown[]> } | null = null;
  private webhookService: { queueDelivery(event: SsoAuditEvent): Promise<void> } | null = null;

  constructor(
    @InjectRepository(SsoAuditEvent)
    private readonly auditEventRepository: Repository<SsoAuditEvent>,
  ) {}

  /**
   * Set the alert service reference (called by module initialization)
   */
  setAlertService(alertService: { evaluateAlertRules(event: SsoAuditEvent): Promise<unknown[]> }): void {
    this.alertService = alertService;
  }

  /**
   * Set the webhook service reference (called by module initialization)
   */
  setWebhookService(webhookService: { queueDelivery(event: SsoAuditEvent): Promise<void> }): void {
    this.webhookService = webhookService;
  }

  /**
   * Log an SSO audit event (fire-and-forget)
   * After saving, triggers alert evaluation and webhook queuing asynchronously.
   */
  async logEvent(params: LogEventParams): Promise<SsoAuditEvent> {
    try {
      const event = this.auditEventRepository.create({
        workspaceId: params.workspaceId,
        eventType: params.eventType,
        actorId: params.actorId || null,
        targetUserId: params.targetUserId || null,
        samlConfigId: params.samlConfigId || null,
        oidcConfigId: params.oidcConfigId || null,
        domainId: params.domainId || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        details: params.details || {},
      });

      const savedEvent = await this.auditEventRepository.save(event);

      // Fire-and-forget: trigger alert evaluation and webhook queuing
      this.processEventAsync(savedEvent);

      return savedEvent;
    } catch (error) {
      this.logger.error('Failed to log SSO audit event', error);
      // Fire-and-forget: never throw from audit logging
      return {} as SsoAuditEvent;
    }
  }

  /**
   * Asynchronously process event for alerts and webhooks (fire-and-forget)
   */
  private processEventAsync(event: SsoAuditEvent): void {
    if (this.alertService) {
      Promise.resolve(this.alertService.evaluateAlertRules(event)).catch((error: any) => {
        this.logger.error('Failed to evaluate alert rules for audit event', error);
      });
    }

    if (this.webhookService) {
      Promise.resolve(this.webhookService.queueDelivery(event)).catch((error: any) => {
        this.logger.error('Failed to queue webhook delivery for audit event', error);
      });
    }
  }

  /**
   * List SSO audit events with optional filters and pagination
   */
  async listEvents(
    workspaceId: string,
    filters: ListEventsFilters = {},
  ): Promise<PaginatedAuditEvents> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { workspaceId };

    if (filters.eventType) {
      where.eventType = filters.eventType;
    }

    if (filters.actorId) {
      where.actorId = filters.actorId;
    }

    if (filters.dateFrom && filters.dateTo) {
      where.createdAt = Between(filters.dateFrom, filters.dateTo);
    } else if (filters.dateFrom) {
      where.createdAt = MoreThanOrEqual(filters.dateFrom);
    } else if (filters.dateTo) {
      where.createdAt = LessThanOrEqual(filters.dateTo);
    }

    const [events, total] = await this.auditEventRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { events, total, page, limit };
  }
}
