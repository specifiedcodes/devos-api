import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

export enum AuditAction {
  // BYOK actions
  BYOK_KEY_CREATED = 'byok_key_created',
  BYOK_KEY_DELETED = 'byok_key_deleted',
  BYOK_KEY_ACCESSED = 'byok_key_accessed',
  BYOK_KEY_UPDATED = 'byok_key_updated',
  BYOK_KEY_USED = 'byok_key_used',
  BYOK_KEY_VALIDATION_FAILED = 'byok_key_validation_failed',

  // Usage actions (existing)
  USAGE_EXPORTED = 'usage_exported',

  // Workspace settings (existing)
  WORKSPACE_SETTINGS_UPDATED = 'workspace_settings_updated',

  // Generic actions
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',

  // Member actions (NEW - Task 3.1)
  MEMBER_INVITED = 'member_invited',
  MEMBER_REMOVED = 'member_removed',
  MEMBER_ROLE_CHANGED = 'member_role_changed',
  MEMBER_ACCEPTED_INVITATION = 'member_accepted_invitation',

  // Project actions (NEW - Task 3.2)
  PROJECT_CREATED = 'project_created',
  PROJECT_UPDATED = 'project_updated',
  PROJECT_DELETED = 'project_deleted',
  PROJECT_ARCHIVED = 'project_archived',
  PROJECT_UNARCHIVED = 'project_unarchived',

  // Deployment actions (NEW - Task 3.3)
  DEPLOYMENT_TRIGGERED = 'deployment_triggered',
  DEPLOYMENT_SUCCESS = 'deployment_success',
  DEPLOYMENT_FAILED = 'deployment_failed',

  // Settings actions (NEW - Task 3.4)
  PROJECT_SETTINGS_UPDATED = 'project_settings_updated',

  // Security events (NEW - Task 3.5)
  PERMISSION_DENIED = 'permission_denied',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'unauthorized_access_attempt',
  LOGIN_FAILED = 'login_failed',

  // Workspace actions (NEW)
  WORKSPACE_CREATED = 'workspace_created',
  WORKSPACE_DELETED = 'workspace_deleted',
  WORKSPACE_RENAMED = 'workspace_renamed',

  // Onboarding actions (Story 4.1)
  ONBOARDING_STARTED = 'onboarding_started',
  ONBOARDING_COMPLETED = 'onboarding_completed',
  ONBOARDING_STEP_UPDATED = 'onboarding_step_updated',

  // Deployment approval actions (Story 6.9)
  DEPLOYMENT_APPROVAL_SETTINGS_UPDATED = 'deployment.approval_settings_updated',
  DEPLOYMENT_APPROVAL_REQUESTED = 'deployment.approval_requested',
  DEPLOYMENT_APPROVED = 'deployment.approved',
  DEPLOYMENT_REJECTED = 'deployment.rejected',

  // Deployment rollback actions (Story 6.10)
  DEPLOYMENT_ROLLBACK_INITIATED = 'deployment.rollback_initiated',
  DEPLOYMENT_ROLLBACK_COMPLETED = 'deployment.rollback_completed',
  DEPLOYMENT_ROLLBACK_FAILED = 'deployment.rollback_failed',

  // Chat export actions (Story 9.5) - HIGH-4 FIX: Audit logging for data export
  CHAT_EXPORT_REQUESTED = 'chat.export_requested',

  // Admin user management actions (Story 14.6)
  ADMIN_USER_VIEWED = 'admin.user_viewed',
  ADMIN_USER_SUSPENDED = 'admin.user_suspended',
  ADMIN_USER_UNSUSPENDED = 'admin.user_unsuspended',
  ADMIN_USER_DELETED = 'admin.user_deleted',
  ADMIN_USER_LISTED = 'admin.user_listed',

  // Admin analytics actions (Story 14.7)
  ADMIN_ANALYTICS_VIEWED = 'admin.analytics_viewed',
  ADMIN_ANALYTICS_EXPORTED = 'admin.analytics_exported',

  // Admin alert management actions (Story 14.8)
  ADMIN_ALERT_RULE_CREATED = 'admin.alert_rule_created',
  ADMIN_ALERT_RULE_UPDATED = 'admin.alert_rule_updated',
  ADMIN_ALERT_RULE_DELETED = 'admin.alert_rule_deleted',
  ADMIN_ALERT_RULE_TOGGLED = 'admin.alert_rule_toggled',
  ADMIN_ALERT_RULE_SILENCED = 'admin.alert_rule_silenced',
  ADMIN_ALERT_ACKNOWLEDGED = 'admin.alert_acknowledged',
  ADMIN_ALERT_RESOLVED = 'admin.alert_resolved',
  ADMIN_ALERT_HISTORY_VIEWED = 'admin.alert_history_viewed',

  // Admin incident management actions (Story 14.9)
  ADMIN_INCIDENT_CREATED = 'admin.incident_created',
  ADMIN_INCIDENT_UPDATED = 'admin.incident_updated',
  ADMIN_INCIDENT_UPDATE_ADDED = 'admin.incident_update_added',
  ADMIN_INCIDENT_RESOLVED = 'admin.incident_resolved',
  ADMIN_INCIDENT_LISTED = 'admin.incident_listed',

  // Admin audit log viewer actions (Story 14.10)
  ADMIN_AUDIT_LOG_VIEWED = 'admin.audit_log_viewed',
  ADMIN_AUDIT_LOG_EXPORTED = 'admin.audit_log_exported',
  ADMIN_AUDIT_LOG_SEARCH_SAVED = 'admin.audit_log_search_saved',
  ADMIN_AUDIT_LOG_SEARCH_DELETED = 'admin.audit_log_search_deleted',

  // File storage actions (Story 16.2)
  FILE_UPLOADED = 'file.uploaded',
  FILE_DOWNLOADED = 'file.downloaded',
  FILE_DELETED = 'file.deleted',
  FILE_UPDATED = 'file.updated',

  // CLI Session Archive actions (Story 16.3)
  SESSION_ARCHIVED = 'session.archived',
  SESSION_ARCHIVE_DELETED = 'session.archive_deleted',
  SESSION_ARCHIVE_CLEANUP = 'session.archive_cleanup',
}

/**
 * All BYOK-related audit actions for filtering
 */
export const BYOK_AUDIT_ACTIONS: AuditAction[] = [
  AuditAction.BYOK_KEY_CREATED,
  AuditAction.BYOK_KEY_DELETED,
  AuditAction.BYOK_KEY_ACCESSED,
  AuditAction.BYOK_KEY_UPDATED,
  AuditAction.BYOK_KEY_USED,
  AuditAction.BYOK_KEY_VALIDATION_FAILED,
];

export interface AuditMetadata {
  [key: string]: any;
}

export interface ByokAuditSummary {
  totalKeyAccessEvents: number;
  totalApiCallsViaByok: number;
  totalCostViaByok: number;
  uniqueUsersAccessingKeys: number;
  failedValidationAttempts: number;
  period: {
    start: string;
    end: string;
  };
}

export interface AuditLogFilters {
  userId?: string;
  userEmail?: string;
  actions?: AuditAction[];
  resourceType?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Log an audit event
   */
  async log(
    workspaceId: string,
    userId: string,
    action: AuditAction,
    resourceType: string,
    resourceId: string,
    metadata?: AuditMetadata,
  ): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        workspaceId,
        userId,
        action,
        resourceType,
        resourceId,
        metadata: metadata || {},
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      });

      await this.auditLogRepository.save(auditLog);

      this.logger.log(
        `Audit: ${action} by user ${userId} on ${resourceType}:${resourceId} in workspace ${workspaceId}`,
      );
    } catch (error) {
      // Don't fail the main operation if audit logging fails
      this.logger.error(
        `Failed to log audit event: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Get audit logs for a workspace
   */
  async getWorkspaceLogs(
    workspaceId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get audit logs for a specific resource
   */
  async getResourceLogs(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: {
        workspaceId,
        resourceType,
        resourceId,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get audit logs with advanced filtering (Task 8)
   */
  async getWorkspaceLogsWithFilters(
    workspaceId: string,
    filters: AuditLogFilters,
    limit: number = 100,
    offset: number = 0,
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.workspaceId = :workspaceId', { workspaceId });

    if (filters.userId) {
      queryBuilder.andWhere('audit.userId = :userId', {
        userId: filters.userId,
      });
    }

    if (filters.userEmail) {
      // Join with users table to filter by email
      queryBuilder
        .leftJoin('users', 'u', 'u.id = audit.userId')
        .andWhere('u.email ILIKE :email', { email: `%${filters.userEmail}%` });
    }

    if (filters.actions && filters.actions.length > 0) {
      queryBuilder.andWhere('audit.action IN (:...actions)', {
        actions: filters.actions,
      });
    }

    if (filters.resourceType) {
      queryBuilder.andWhere('audit.resourceType = :resourceType', {
        resourceType: filters.resourceType,
      });
    }

    if (filters.resourceId) {
      queryBuilder.andWhere('audit.resourceId = :resourceId', {
        resourceId: filters.resourceId,
      });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('audit.createdAt >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('audit.createdAt <= :endDate', {
        endDate: filters.endDate,
      });
    }

    const [logs, total] = await queryBuilder
      .orderBy('audit.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return { logs, total };
  }

  /**
   * Export audit logs to CSV with injection protection (Task 7)
   */
  async exportAuditLogsToCSV(
    workspaceId: string,
    filters: AuditLogFilters,
  ): Promise<string> {
    const { logs } = await this.getWorkspaceLogsWithFilters(
      workspaceId,
      filters,
      10000, // Max export limit
      0,
    );

    // CSV headers
    const headers = [
      'Timestamp',
      'User ID',
      'Action',
      'Resource Type',
      'Resource ID',
      'IP Address',
      'User Agent',
      'Metadata',
    ];

    // Escape CSV fields to prevent injection
    const escapeCSV = (field: any): string => {
      if (field === null || field === undefined) return '';

      let value = String(field);

      // CSV injection protection: escape formulas
      if (
        value.startsWith('=') ||
        value.startsWith('+') ||
        value.startsWith('-') ||
        value.startsWith('@')
      ) {
        value = `'${value}`;
      }

      // Escape quotes and wrap in quotes if contains comma/newline
      if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        value = `"${value.replace(/"/g, '""')}"`;
      }

      return value;
    };

    const rows = logs.map((log) =>
      [
        log.createdAt.toISOString(),
        log.userId,
        log.action,
        log.resourceType,
        log.resourceId,
        log.ipAddress || '',
        log.userAgent || '',
        JSON.stringify(log.metadata || {}),
      ].map(escapeCSV),
    );

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');

    return csv;
  }

  /**
   * Get BYOK audit summary statistics for a workspace
   */
  async getByokAuditSummary(
    workspaceId: string,
    days: number = 30,
  ): Promise<ByokAuditSummary> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Query counts for each BYOK action type
    const actionCounts = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('audit.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('audit.workspaceId = :workspaceId', { workspaceId })
      .andWhere('audit.action IN (:...actions)', {
        actions: BYOK_AUDIT_ACTIONS,
      })
      .andWhere('audit.createdAt >= :startDate', { startDate })
      .andWhere('audit.createdAt <= :endDate', { endDate })
      .groupBy('audit.action')
      .getRawMany();

    // Query distinct user count for BYOK actions
    const uniqueUsersResult = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select('COUNT(DISTINCT audit.userId)', 'count')
      .where('audit.workspaceId = :workspaceId', { workspaceId })
      .andWhere('audit.action IN (:...actions)', {
        actions: BYOK_AUDIT_ACTIONS,
      })
      .andWhere('audit.createdAt >= :startDate', { startDate })
      .andWhere('audit.createdAt <= :endDate', { endDate })
      .getRawOne();

    // Query total cost from byok_key_used metadata (sum of costUsd in metadata JSONB)
    const costResult = await this.auditLogRepository
      .createQueryBuilder('audit')
      .select("SUM((audit.metadata->>'costUsd')::decimal)", 'totalCost')
      .where('audit.workspaceId = :workspaceId', { workspaceId })
      .andWhere('audit.action = :action', {
        action: AuditAction.BYOK_KEY_USED,
      })
      .andWhere('audit.createdAt >= :startDate', { startDate })
      .andWhere('audit.createdAt <= :endDate', { endDate })
      .getRawOne();

    // Parse action counts
    const countsMap: Record<string, number> = {};
    for (const row of actionCounts) {
      countsMap[row.action] = parseInt(row.count, 10);
    }

    const totalKeyAccessEvents =
      (countsMap[AuditAction.BYOK_KEY_ACCESSED] || 0) +
      (countsMap[AuditAction.BYOK_KEY_CREATED] || 0) +
      (countsMap[AuditAction.BYOK_KEY_DELETED] || 0) +
      (countsMap[AuditAction.BYOK_KEY_UPDATED] || 0);

    const totalApiCallsViaByok =
      countsMap[AuditAction.BYOK_KEY_USED] || 0;

    const failedValidationAttempts =
      countsMap[AuditAction.BYOK_KEY_VALIDATION_FAILED] || 0;

    const parsedCost = parseFloat(costResult?.totalCost || '0');
    const parsedUniqueUsers = parseInt(
      uniqueUsersResult?.count || '0',
      10,
    );

    return {
      totalKeyAccessEvents,
      totalApiCallsViaByok,
      totalCostViaByok: isNaN(parsedCost) ? 0 : parsedCost,
      uniqueUsersAccessingKeys: isNaN(parsedUniqueUsers) ? 0 : parsedUniqueUsers,
      failedValidationAttempts,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    };
  }

  /**
   * Log an admin action (Story 14.6)
   * Convenience wrapper for platform-wide admin actions
   */
  async logAdminAction(
    adminId: string,
    action: AuditAction,
    targetUserId: string,
    metadata?: Record<string, any>,
    request?: any,
  ): Promise<void> {
    await this.log('platform', adminId, action, 'user', targetUserId, {
      ...metadata,
      adminId,
      targetUserId,
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent'],
    });
  }

  /**
   * Clean up old audit logs (90-day retention) - Task 9
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.auditLogRepository
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(
      `Cleaned up ${result.affected} audit logs older than ${retentionDays} days`,
    );

    return result.affected || 0;
  }
}
