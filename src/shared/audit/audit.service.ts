import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

export enum AuditAction {
  BYOK_KEY_CREATED = 'byok_key_created',
  BYOK_KEY_DELETED = 'byok_key_deleted',
  BYOK_KEY_ACCESSED = 'byok_key_accessed',
  BYOK_KEY_UPDATED = 'byok_key_updated',
  USAGE_EXPORTED = 'usage_exported',
  WORKSPACE_SETTINGS_UPDATED = 'workspace_settings_updated',
}

export interface AuditMetadata {
  [key: string]: any;
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
      this.logger.error(`Failed to log audit event: ${error.message}`, error.stack);
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
}
