/**
 * AgentDefinitionAuditService
 *
 * Story 18-1: Agent Definition Schema
 *
 * Fire-and-forget audit event logging for agent definition changes.
 * Never throws from audit logging to avoid blocking the main operation.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentDefinitionAuditEvent,
  AgentDefinitionAuditEventType,
} from '../../database/entities/agent-definition-audit-event.entity';

@Injectable()
export class AgentDefinitionAuditService {
  private readonly logger = new Logger(AgentDefinitionAuditService.name);

  constructor(
    @InjectRepository(AgentDefinitionAuditEvent)
    private readonly auditEventRepository: Repository<AgentDefinitionAuditEvent>,
  ) {}

  /**
   * Log an audit event. Fire-and-forget: catches and logs errors.
   */
  async logEvent(params: {
    workspaceId: string;
    eventType: AgentDefinitionAuditEventType;
    agentDefinitionId?: string;
    actorId?: string;
    details?: Record<string, unknown>;
  }): Promise<AgentDefinitionAuditEvent | null> {
    try {
      const event = this.auditEventRepository.create({
        workspaceId: params.workspaceId,
        eventType: params.eventType,
        agentDefinitionId: params.agentDefinitionId || null,
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
   * List audit events with optional filters and pagination.
   */
  async listEvents(
    workspaceId: string,
    filters: {
      eventType?: AgentDefinitionAuditEventType;
      agentDefinitionId?: string;
      actorId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    events: AgentDefinitionAuditEvent[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 200);
    const skip = (page - 1) * limit;

    const qb = this.auditEventRepository
      .createQueryBuilder('event')
      .where('event.workspaceId = :workspaceId', { workspaceId });

    if (filters.eventType) {
      qb.andWhere('event.eventType = :eventType', { eventType: filters.eventType });
    }

    if (filters.agentDefinitionId) {
      qb.andWhere('event.agentDefinitionId = :agentDefinitionId', {
        agentDefinitionId: filters.agentDefinitionId,
      });
    }

    if (filters.actorId) {
      qb.andWhere('event.actorId = :actorId', { actorId: filters.actorId });
    }

    if (filters.dateFrom) {
      qb.andWhere('event.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      qb.andWhere('event.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    qb.orderBy('event.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [events, total] = await qb.getManyAndCount();

    return { events, total, page, limit };
  }
}
