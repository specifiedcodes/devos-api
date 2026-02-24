/**
 * TemplateAuditService
 *
 * Story 19-1: Template Registry Backend
 *
 * Fire-and-forget audit event logging for template changes.
 * Never throws from audit logging to avoid blocking the main operation.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TemplateAuditEvent,
  TemplateAuditEventType,
} from '../../../database/entities/template-audit-event.entity';
import { TemplateAuditEventInput } from '../interfaces/template.interfaces';

@Injectable()
export class TemplateAuditService {
  private readonly logger = new Logger(TemplateAuditService.name);

  constructor(
    @InjectRepository(TemplateAuditEvent)
    private readonly auditEventRepository: Repository<TemplateAuditEvent>,
  ) {}

  /**
   * Log an audit event. Fire-and-forget: catches and logs errors.
   */
  async logEvent(params: TemplateAuditEventInput): Promise<TemplateAuditEvent | null> {
    try {
      const event = this.auditEventRepository.create({
        workspaceId: params.workspaceId,
        eventType: params.eventType as TemplateAuditEventType,
        templateId: params.templateId || null,
        actorId: params.actorId || null,
        details: params.details || {},
      });

      return await this.auditEventRepository.save(event);
    } catch (error) {
      this.logger.error(
        `Failed to log audit event: ${params.eventType}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /**
   * Log template created event
   */
  async logTemplateCreated(
    workspaceId: string | null,
    templateId: string,
    actorId: string,
    details?: Record<string, unknown>,
  ): Promise<TemplateAuditEvent | null> {
    return this.logEvent({
      workspaceId,
      eventType: TemplateAuditEventType.TEMPLATE_CREATED,
      templateId,
      actorId,
      details: { ...details, templateId },
    });
  }

  /**
   * Log template updated event
   */
  async logTemplateUpdated(
    workspaceId: string | null,
    templateId: string,
    actorId: string,
    changedFields: string[],
    details?: Record<string, unknown>,
  ): Promise<TemplateAuditEvent | null> {
    return this.logEvent({
      workspaceId,
      eventType: TemplateAuditEventType.TEMPLATE_UPDATED,
      templateId,
      actorId,
      details: { ...details, changedFields, templateId },
    });
  }

  /**
   * Log template deleted event
   */
  async logTemplateDeleted(
    workspaceId: string | null,
    templateId: string,
    actorId: string,
    deletedTemplate: Record<string, unknown>,
  ): Promise<TemplateAuditEvent | null> {
    return this.logEvent({
      workspaceId,
      eventType: TemplateAuditEventType.TEMPLATE_DELETED,
      templateId,
      actorId,
      details: { deletedTemplate, templateId },
    });
  }

  /**
   * Log template published event
   */
  async logTemplatePublished(
    workspaceId: string | null,
    templateId: string,
    actorId: string,
    version: string,
  ): Promise<TemplateAuditEvent | null> {
    return this.logEvent({
      workspaceId,
      eventType: TemplateAuditEventType.TEMPLATE_PUBLISHED,
      templateId,
      actorId,
      details: { version, templateId },
    });
  }

  /**
   * Log template unpublished event
   */
  async logTemplateUnpublished(
    workspaceId: string | null,
    templateId: string,
    actorId: string,
  ): Promise<TemplateAuditEvent | null> {
    return this.logEvent({
      workspaceId,
      eventType: TemplateAuditEventType.TEMPLATE_UNPUBLISHED,
      templateId,
      actorId,
      details: { templateId },
    });
  }

  /**
   * Log template used event
   */
  async logTemplateUsed(
    workspaceId: string | null,
    templateId: string,
    projectId?: string,
  ): Promise<TemplateAuditEvent | null> {
    return this.logEvent({
      workspaceId,
      eventType: TemplateAuditEventType.TEMPLATE_USED,
      templateId,
      details: { templateId, projectId },
    });
  }

  /**
   * Log template rating updated event
   */
  async logTemplateRatingUpdated(
    workspaceId: string | null,
    templateId: string,
    oldRating: number,
    newRating: number,
    ratingCount: number,
  ): Promise<TemplateAuditEvent | null> {
    return this.logEvent({
      workspaceId,
      eventType: TemplateAuditEventType.TEMPLATE_RATING_UPDATED,
      templateId,
      details: { templateId, oldRating, newRating, ratingCount },
    });
  }

  /**
   * Log template featured event (Story 19-8)
   */
  async logTemplateFeatured(
    workspaceId: string | null,
    templateId: string,
    actorId: string,
    featuredOrder: number,
  ): Promise<TemplateAuditEvent | null> {
    return this.logEvent({
      workspaceId,
      eventType: TemplateAuditEventType.TEMPLATE_FEATURED,
      templateId,
      actorId,
      details: { templateId, featuredOrder },
    });
  }

  /**
   * Log template unfeatured event (Story 19-8)
   */
  async logTemplateUnfeatured(
    workspaceId: string | null,
    templateId: string,
    actorId: string,
  ): Promise<TemplateAuditEvent | null> {
    return this.logEvent({
      workspaceId,
      eventType: TemplateAuditEventType.TEMPLATE_UNFEATURED,
      templateId,
      actorId,
      details: { templateId },
    });
  }

  /**
   * Log templates reordered event (Story 19-8)
   */
  async logTemplatesReordered(
    workspaceId: string | null,
    actorId: string,
    items: Array<{ id: string; featuredOrder: number }>,
  ): Promise<TemplateAuditEvent | null> {
    return this.logEvent({
      workspaceId,
      eventType: TemplateAuditEventType.TEMPLATES_REORDERED,
      actorId,
      details: { items, count: items.length },
    });
  }

  /**
   * List audit events with optional filters and pagination.
   */
  async listEvents(
    workspaceId: string | null,
    filters: {
      eventType?: TemplateAuditEventType;
      templateId?: string;
      actorId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    events: TemplateAuditEvent[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 200);
    const skip = (page - 1) * limit;

    const qb = this.auditEventRepository
      .createQueryBuilder('event');

    if (workspaceId) {
      qb.where('event.workspace_id = :workspaceId', { workspaceId });
    } else {
      qb.where('event.workspace_id IS NULL');
    }

    if (filters.eventType) {
      qb.andWhere('event.event_type = :eventType', { eventType: filters.eventType });
    }

    if (filters.templateId) {
      qb.andWhere('event.template_id = :templateId', {
        templateId: filters.templateId,
      });
    }

    if (filters.actorId) {
      qb.andWhere('event.actor_id = :actorId', { actorId: filters.actorId });
    }

    if (filters.dateFrom) {
      qb.andWhere('event.created_at >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      qb.andWhere('event.created_at <= :dateTo', { dateTo: filters.dateTo });
    }

    qb.orderBy('event.created_at', 'DESC');
    qb.skip(skip).take(limit);

    const [events, total] = await qb.getManyAndCount();

    return { events, total, page, limit };
  }
}
