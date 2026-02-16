import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScimSyncLog, ScimOperation, ScimResourceType, ScimSyncStatus } from '../../../database/entities/scim-sync-log.entity';

export interface LogSyncParams {
  workspaceId: string;
  operation: ScimOperation;
  resourceType: ScimResourceType;
  resourceId?: string;
  externalId?: string;
  status: ScimSyncStatus;
  errorMessage?: string;
  requestBody?: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class ScimSyncLogService {
  private readonly logger = new Logger(ScimSyncLogService.name);

  constructor(
    @InjectRepository(ScimSyncLog)
    private readonly syncLogRepository: Repository<ScimSyncLog>,
  ) {}

  /**
   * Log a SCIM sync operation (fire-and-forget pattern).
   */
  async log(params: LogSyncParams): Promise<ScimSyncLog> {
    try {
      // Sanitize request body - remove sensitive fields
      const sanitizedBody = params.requestBody
        ? this.sanitizeBody(params.requestBody)
        : null;

      const entry = this.syncLogRepository.create({
        workspaceId: params.workspaceId,
        operation: params.operation,
        resourceType: params.resourceType,
        resourceId: params.resourceId || null,
        externalId: params.externalId || null,
        status: params.status,
        errorMessage: params.errorMessage || null,
        requestBody: sanitizedBody,
        responseBody: params.responseBody || null,
        ipAddress: params.ipAddress || null,
      });

      return await this.syncLogRepository.save(entry);
    } catch (error) {
      this.logger.error('Failed to log SCIM sync event', error);
      // Fire-and-forget: never throw from sync logging
      return {} as ScimSyncLog;
    }
  }

  /**
   * List sync logs for a workspace with pagination and filters.
   */
  async listLogs(
    workspaceId: string,
    filters?: {
      resourceType?: string;
      operation?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ logs: ScimSyncLog[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(200, Math.max(1, filters?.limit || 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { workspaceId };

    if (filters?.resourceType) {
      where.resourceType = filters.resourceType;
    }

    if (filters?.operation) {
      where.operation = filters.operation;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const [logs, total] = await this.syncLogRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { logs, total, page, limit };
  }

  /**
   * Sanitize request body by removing password fields (recursively).
   */
  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['password', 'token', 'secret', 'passwordHash', 'tokenHash'];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (sensitiveKeys.includes(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeBody(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item) =>
          item !== null && typeof item === 'object'
            ? this.sanitizeBody(item as Record<string, unknown>)
            : item,
        );
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
