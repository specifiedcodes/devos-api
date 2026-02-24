import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  PermissionAuditEvent,
  PermissionAuditEventType,
} from '../../../database/entities/permission-audit-event.entity';

/**
 * Service for managing the permission audit trail.
 *
 * Key responsibilities:
 * - Record permission-related audit events (role CRUD, permission changes,
 *   member role assignments, IP/geo access denials)
 * - Query audit events with filtering, pagination, and search
 * - Export audit events to CSV/JSON
 * - Enforce 2-year retention (730 days) with cleanup
 *
 * Design notes:
 * - Write methods are fire-and-forget (never throw on failure)
 * - Separate from the generic AuditService to provide richer schema
 *   (before_state/after_state snapshots, target_user_id, target_role_id)
 * - Events cannot be deleted by workspace admins (compliance)
 * - User agent strings are truncated to 500 chars to prevent storage bloat
 */
@Injectable()
export class PermissionAuditService {
  private readonly logger = new Logger(PermissionAuditService.name);
  private readonly MAX_USER_AGENT_LENGTH = 500;
  private readonly RETENTION_DAYS = 730; // 2 years
  private readonly MAX_EXPORT_LIMIT = 10000;
  private readonly CSV_FORMULA_PREFIXES = ['=', '+', '-', '@'];

  constructor(
    @InjectRepository(PermissionAuditEvent)
    private readonly auditRepo: Repository<PermissionAuditEvent>,
  ) {}

  // ==================== WRITE OPERATIONS ====================

  /**
   * Record a permission audit event. Fire-and-forget: never throws.
   */
  async record(params: {
    workspaceId: string;
    eventType: PermissionAuditEventType;
    actorId: string;
    targetUserId?: string | null;
    targetRoleId?: string | null;
    beforeState?: Record<string, any> | null;
    afterState?: Record<string, any> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    try {
      const event = this.auditRepo.create({
        workspaceId: params.workspaceId,
        eventType: params.eventType,
        actorId: params.actorId,
        targetUserId: params.targetUserId ?? null,
        targetRoleId: params.targetRoleId ?? null,
        beforeState: params.beforeState ?? null,
        afterState: params.afterState ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent
          ? params.userAgent.substring(0, this.MAX_USER_AGENT_LENGTH)
          : null,
      });

      await this.auditRepo.save(event);

      this.logger.debug(
        `Permission audit: ${params.eventType} by ${params.actorId} in workspace ${params.workspaceId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to record permission audit event: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // ==================== READ OPERATIONS ====================

  /**
   * List permission audit events with filtering, pagination, and search.
   */
  async listEvents(
    workspaceId: string,
    filters: {
      eventType?: PermissionAuditEventType;
      eventTypes?: PermissionAuditEventType[];
      actorId?: string;
      targetUserId?: string;
      targetRoleId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      search?: string;
    },
    pagination: {
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ events: PermissionAuditEvent[]; total: number }> {
    const limit = Math.min(Math.max(pagination.limit ?? 50, 1), 100);
    const offset = Math.max(pagination.offset ?? 0, 0);

    const qb = this.auditRepo
      .createQueryBuilder('pae')
      .where('pae.workspace_id = :workspaceId', { workspaceId });

    this.applyFilters(qb, filters);

    const [events, total] = await qb
      .orderBy('pae.created_at', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { events, total };
  }

  /**
   * Get a single audit event by ID (for detail view expansion).
   */
  async getEvent(
    workspaceId: string,
    eventId: string,
  ): Promise<PermissionAuditEvent | null> {
    return this.auditRepo.findOne({
      where: { id: eventId, workspaceId },
    });
  }

  /**
   * Get summary statistics for a workspace's audit events.
   * Optimized: derives totalEvents and accessDenials from the events-by-type
   * grouping query, reducing 4 DB queries down to 2.
   */
  async getEventStats(
    workspaceId: string,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    topActors: Array<{ actorId: string; count: number }>;
    accessDenials: number;
  }> {
    // Run events-by-type and top-actors in parallel (2 queries instead of 4)
    const [typeCountsRaw, topActorsRaw] = await Promise.all([
      // Events by type (used to derive totalEvents and accessDenials too)
      this.auditRepo
        .createQueryBuilder('pae')
        .select('pae.event_type', 'eventType')
        .addSelect('COUNT(*)', 'count')
        .where('pae.workspace_id = :workspaceId', { workspaceId })
        .andWhere(dateFrom ? 'pae.created_at >= :dateFrom' : '1=1', { dateFrom })
        .andWhere(dateTo ? 'pae.created_at <= :dateTo' : '1=1', { dateTo })
        .groupBy('pae.event_type')
        .getRawMany(),

      // Top actors (top 10)
      this.auditRepo
        .createQueryBuilder('pae')
        .select('pae.actor_id', 'actorId')
        .addSelect('COUNT(*)', 'count')
        .where('pae.workspace_id = :workspaceId', { workspaceId })
        .andWhere(dateFrom ? 'pae.created_at >= :dateFrom' : '1=1', { dateFrom })
        .andWhere(dateTo ? 'pae.created_at <= :dateTo' : '1=1', { dateTo })
        .groupBy('pae.actor_id')
        .orderBy('COUNT(*)', 'DESC')
        .limit(10)
        .getRawMany(),
    ]);

    // Derive eventsByType, totalEvents, and accessDenials from the single grouping query
    const eventsByType: Record<string, number> = {};
    let totalEvents = 0;
    let accessDenials = 0;
    const denialTypes = new Set([
      PermissionAuditEventType.ACCESS_DENIED_IP,
      PermissionAuditEventType.ACCESS_DENIED_GEO,
      PermissionAuditEventType.ACCESS_DENIED_PERMISSION,
    ]);

    for (const row of typeCountsRaw) {
      const count = parseInt(row.count, 10);
      eventsByType[row.eventType] = count;
      totalEvents += count;
      if (denialTypes.has(row.eventType as PermissionAuditEventType)) {
        accessDenials += count;
      }
    }

    const topActors = topActorsRaw.map((row) => ({
      actorId: row.actorId,
      count: parseInt(row.count, 10),
    }));

    return { totalEvents, eventsByType, topActors, accessDenials };
  }

  // ==================== EXPORT ====================

  /**
   * Export audit events to CSV format.
   * Includes CSV injection protection for formula-prefix characters.
   */
  async exportCSV(
    workspaceId: string,
    filters: {
      eventType?: PermissionAuditEventType;
      eventTypes?: PermissionAuditEventType[];
      actorId?: string;
      targetUserId?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
  ): Promise<string> {
    const qb = this.auditRepo
      .createQueryBuilder('pae')
      .where('pae.workspace_id = :workspaceId', { workspaceId });

    this.applyFilters(qb, filters);

    const events = await qb
      .orderBy('pae.created_at', 'DESC')
      .take(this.MAX_EXPORT_LIMIT)
      .getMany();

    const headers = [
      'Timestamp',
      'Event Type',
      'Actor ID',
      'Target User ID',
      'Target Role ID',
      'IP Address',
      'Before State',
      'After State',
    ];

    const rows = events.map((event) =>
      [
        event.createdAt.toISOString(),
        event.eventType,
        event.actorId,
        event.targetUserId || '',
        event.targetRoleId || '',
        event.ipAddress || '',
        JSON.stringify(event.beforeState || {}),
        JSON.stringify(event.afterState || {}),
      ].map((field) => this.escapeCSVField(field)),
    );

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  /**
   * Export audit events to JSON format.
   */
  async exportJSON(
    workspaceId: string,
    filters: {
      eventType?: PermissionAuditEventType;
      eventTypes?: PermissionAuditEventType[];
      actorId?: string;
      targetUserId?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
  ): Promise<string> {
    const qb = this.auditRepo
      .createQueryBuilder('pae')
      .where('pae.workspace_id = :workspaceId', { workspaceId });

    this.applyFilters(qb, filters);

    const events = await qb
      .orderBy('pae.created_at', 'DESC')
      .take(this.MAX_EXPORT_LIMIT)
      .getMany();

    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        workspaceId,
        totalEvents: events.length,
        events: events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          actorId: event.actorId,
          targetUserId: event.targetUserId,
          targetRoleId: event.targetRoleId,
          beforeState: event.beforeState,
          afterState: event.afterState,
          ipAddress: event.ipAddress,
          createdAt: event.createdAt.toISOString(),
        })),
      },
      null,
      2,
    );
  }

  // ==================== RETENTION ====================

  /**
   * Clean up audit events older than retention period (2 years).
   * Called by a scheduled job.
   * Returns the number of deleted events.
   */
  async cleanupExpiredEvents(retentionDays?: number): Promise<number> {
    const days = retentionDays ?? this.RETENTION_DAYS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Use batched delete to prevent long-running transactions
    const BATCH_SIZE = 1000;
    let totalDeleted = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await this.auditRepo
        .createQueryBuilder()
        .delete()
        .from(PermissionAuditEvent)
        .where('created_at < :cutoffDate', { cutoffDate })
        .limit(BATCH_SIZE)
        .execute();

      const deleted = result.affected || 0;
      totalDeleted += deleted;

      if (deleted < BATCH_SIZE) {
        break; // No more to delete
      }
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `Cleaned up ${totalDeleted} permission audit events older than ${days} days`,
      );
    }

    return totalDeleted;
  }

  // ==================== PRIVATE HELPERS ====================

  private applyFilters(
    qb: SelectQueryBuilder<PermissionAuditEvent>,
    filters: {
      eventType?: PermissionAuditEventType;
      eventTypes?: PermissionAuditEventType[];
      actorId?: string;
      targetUserId?: string;
      targetRoleId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      search?: string;
    },
  ): void {
    if (filters.eventType) {
      qb.andWhere('pae.event_type = :eventType', {
        eventType: filters.eventType,
      });
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      qb.andWhere('pae.event_type IN (:...eventTypes)', {
        eventTypes: filters.eventTypes,
      });
    }

    if (filters.actorId) {
      qb.andWhere('pae.actor_id = :actorId', { actorId: filters.actorId });
    }

    if (filters.targetUserId) {
      qb.andWhere('pae.target_user_id = :targetUserId', {
        targetUserId: filters.targetUserId,
      });
    }

    if (filters.targetRoleId) {
      qb.andWhere('pae.target_role_id = :targetRoleId', {
        targetRoleId: filters.targetRoleId,
      });
    }

    if (filters.dateFrom) {
      qb.andWhere('pae.created_at >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    }

    if (filters.dateTo) {
      qb.andWhere('pae.created_at <= :dateTo', { dateTo: filters.dateTo });
    }

    if (filters.search) {
      // Search in before_state and after_state JSONB, and event_type
      // Escape ILIKE wildcards to prevent injection
      qb.andWhere(
        '(pae.event_type ILIKE :search OR CAST(pae.before_state AS TEXT) ILIKE :search OR CAST(pae.after_state AS TEXT) ILIKE :search)',
        {
          search: `%${filters.search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`,
        },
      );
    }
  }

  /**
   * Escape a CSV field to prevent injection.
   * Formula-prefix fields (=, +, -, @) are always wrapped in double quotes
   * with a leading single quote to ensure Excel/Sheets don't interpret them
   * as formulas even when the CSV is opened directly.
   */
  private escapeCSVField(value: string): string {
    if (!value) return '';

    let escaped = value;

    // CSV injection protection: prepend single quote AND always double-quote wrap
    // formula-prefix characters. The double-quote wrap ensures the single quote
    // is preserved as literal content in all CSV parsers.
    if (
      this.CSV_FORMULA_PREFIXES.some((prefix) => escaped.startsWith(prefix))
    ) {
      escaped = `'${escaped}`;
      // Always wrap in double quotes to ensure the leading quote is preserved
      return `"${escaped.replace(/"/g, '""')}"`;
    }

    // Escape quotes and wrap in quotes if contains delimiter, newline, or quote
    if (
      escaped.includes(',') ||
      escaped.includes('\n') ||
      escaped.includes('"')
    ) {
      escaped = `"${escaped.replace(/"/g, '""')}"`;
    }

    return escaped;
  }
}
