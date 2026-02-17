import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { SsoAuditEvent } from '../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../redis/redis.service';
import { AuditExportFilters, AuditExportResult, ComplianceReport } from '../interfaces/audit.interfaces';
import { SSO_AUDIT_CONSTANTS } from '../constants/audit.constants';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';

@Injectable()
export class SsoAuditExportService {
  private readonly logger = new Logger(SsoAuditExportService.name);

  constructor(
    @InjectRepository(SsoAuditEvent)
    private readonly auditEventRepository: Repository<SsoAuditEvent>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Export audit events as CSV or JSON
   */
  async exportEvents(filters: AuditExportFilters, format: 'csv' | 'json'): Promise<AuditExportResult> {
    const qb = this.auditEventRepository.createQueryBuilder('event')
      .where('event.workspaceId = :workspaceId', { workspaceId: filters.workspaceId })
      .orderBy('event.createdAt', 'DESC')
      .take(SSO_AUDIT_CONSTANTS.MAX_EXPORT_ROWS);

    if (filters.eventType) {
      qb.andWhere('event.eventType = :eventType', { eventType: filters.eventType });
    }
    if (filters.actorId) {
      qb.andWhere('event.actorId = :actorId', { actorId: filters.actorId });
    }
    if (filters.targetUserId) {
      qb.andWhere('event.targetUserId = :targetUserId', { targetUserId: filters.targetUserId });
    }
    if (filters.dateFrom) {
      qb.andWhere('event.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('event.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    const events = await qb.getMany();
    const now = new Date();
    const dateStr = now.toISOString().replace(/[T:]/g, '').replace(/\..+/, '').replace(/-/g, '').slice(0, 15);
    const filename = `sso-audit-${filters.workspaceId}-${dateStr}.${format}`;

    if (format === 'csv') {
      const data = this.buildCsv(events);
      return { format, data, filename, rowCount: events.length };
    }

    const data = JSON.stringify(events.map(e => this.eventToExportRow(e)));
    return { format, data, filename, rowCount: events.length };
  }

  /**
   * Generate a compliance report for a workspace
   */
  async generateComplianceReport(
    workspaceId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<ComplianceReport> {
    const fromStr = dateFrom.toISOString();
    const toStr = dateTo.toISOString();
    const cacheKey = `sso:audit:compliance:${workspaceId}:${fromStr}:${toStr}`;

    // Try Redis cache first
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Cache corrupted, continue to compute
      }
    }

    // Compute report from database
    const qb = this.auditEventRepository.createQueryBuilder('event')
      .where('event.workspaceId = :workspaceId', { workspaceId })
      .andWhere('event.createdAt >= :dateFrom', { dateFrom })
      .andWhere('event.createdAt <= :dateTo', { dateTo });

    const events = await qb.getMany();

    const loginSuccessTypes = [
      SsoAuditEventType.SAML_LOGIN_SUCCESS,
      SsoAuditEventType.OIDC_LOGIN_SUCCESS,
    ];
    const loginFailureTypes = [
      SsoAuditEventType.SAML_LOGIN_FAILURE,
      SsoAuditEventType.OIDC_LOGIN_FAILURE,
    ];

    const successfulLogins = events.filter(e => loginSuccessTypes.includes(e.eventType)).length;
    const failedLogins = events.filter(e => loginFailureTypes.includes(e.eventType)).length;
    const totalLogins = successfulLogins + failedLogins;
    const uniqueUsers = new Set(events.filter(e => e.actorId).map(e => e.actorId)).size;
    const loginSuccessRate = totalLogins > 0 ? Math.round((successfulLogins / totalLogins) * 10000) / 100 : 100;

    // Provisioning report
    const jitProvisioned = events.filter(e => e.eventType === SsoAuditEventType.JIT_USER_PROVISIONED).length;
    const scimProvisioned = events.filter(e => e.eventType === SsoAuditEventType.SCIM_USER_CREATED).length;
    const deactivated = events.filter(e => e.eventType === SsoAuditEventType.SCIM_USER_DEACTIVATED).length;
    const updated = events.filter(e =>
      e.eventType === SsoAuditEventType.JIT_USER_PROFILE_UPDATED ||
      e.eventType === SsoAuditEventType.SCIM_USER_UPDATED
    ).length;

    // Enforcement report
    const enforcementChanges = events.filter(e =>
      e.eventType === SsoAuditEventType.ENFORCEMENT_ENABLED ||
      e.eventType === SsoAuditEventType.ENFORCEMENT_DISABLED ||
      e.eventType === SsoAuditEventType.ENFORCEMENT_UPDATED
    ).length;
    const blockedLogins = events.filter(e => e.eventType === SsoAuditEventType.ENFORCEMENT_LOGIN_BLOCKED).length;
    const bypassedLogins = events.filter(e => e.eventType === SsoAuditEventType.ENFORCEMENT_LOGIN_BYPASSED).length;
    const enforcementEnabled = events.some(e => e.eventType === SsoAuditEventType.ENFORCEMENT_ENABLED);

    const report: ComplianceReport = {
      workspaceId,
      period: { from: fromStr, to: toStr },
      summary: {
        totalEvents: events.length,
        totalLogins,
        successfulLogins,
        failedLogins,
        uniqueUsers,
        loginSuccessRate,
      },
      providerHealth: [],
      provisioningReport: {
        totalProvisioned: jitProvisioned + scimProvisioned,
        jitProvisioned,
        scimProvisioned,
        deactivated,
        updated,
      },
      enforcementReport: {
        enforcementEnabled,
        enforcementChanges,
        blockedLogins,
        bypassedLogins,
      },
    };

    // Cache the report
    await this.redisService.set(
      cacheKey,
      JSON.stringify(report),
      SSO_AUDIT_CONSTANTS.COMPLIANCE_REPORT_CACHE_TTL_SECONDS,
    );

    return report;
  }

  /**
   * Clean up expired audit events
   */
  async cleanupExpiredEvents(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let totalDeleted = 0;
    let batchDeleted: number;

    do {
      // Use subquery to batch deletes since TypeORM DeleteQueryBuilder does not support .limit()
      const result = await this.auditEventRepository.query(
        `DELETE FROM sso_audit_events WHERE id IN (
          SELECT id FROM sso_audit_events WHERE created_at < $1 LIMIT $2
        )`,
        [cutoffDate, SSO_AUDIT_CONSTANTS.RETENTION_BATCH_SIZE],
      );

      // PostgreSQL returns array with rowCount for raw queries
      batchDeleted = Array.isArray(result) ? result.length : (result?.rowCount ?? result?.affected ?? 0);
      totalDeleted += batchDeleted;
    } while (batchDeleted >= SSO_AUDIT_CONSTANTS.RETENTION_BATCH_SIZE);

    if (totalDeleted > 0) {
      this.logger.log(`Cleaned up ${totalDeleted} expired audit events (older than ${retentionDays} days)`);
    }

    return totalDeleted;
  }

  private buildCsv(events: SsoAuditEvent[]): string {
    const headers = ['id', 'eventType', 'actorId', 'targetUserId', 'ipAddress', 'userAgent', 'details', 'createdAt'];
    const rows = events.map(e => {
      return [
        this.escapeCsvField(e.id),
        this.escapeCsvField(e.eventType),
        this.escapeCsvField(e.actorId || ''),
        this.escapeCsvField(e.targetUserId || ''),
        this.escapeCsvField(e.ipAddress || ''),
        this.escapeCsvField(e.userAgent || ''),
        this.escapeCsvField(JSON.stringify(e.details || {})),
        this.escapeCsvField(e.createdAt?.toISOString() || ''),
      ].join(SSO_AUDIT_CONSTANTS.CSV_DELIMITER);
    });

    return [headers.join(SSO_AUDIT_CONSTANTS.CSV_DELIMITER), ...rows].join('\n');
  }

  private escapeCsvField(value: string): string {
    // CSV injection protection: prefix formula-triggering characters with a single quote
    // to prevent spreadsheet apps from executing formulas in exported data
    let sanitized = value;
    if (/^[=+\-@\t\r]/.test(sanitized)) {
      sanitized = `'${sanitized}`;
    }
    // Wrap in double quotes and escape internal quotes by doubling them
    const escaped = sanitized.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private eventToExportRow(event: SsoAuditEvent): Record<string, unknown> {
    return {
      id: event.id,
      eventType: event.eventType,
      actorId: event.actorId,
      targetUserId: event.targetUserId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      details: event.details,
      createdAt: event.createdAt?.toISOString(),
    };
  }
}
