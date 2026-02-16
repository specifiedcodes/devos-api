import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CliSession } from '../../database/entities/cli-session.entity';
import { FileStorageService } from '../file-storage/file-storage.service';
import { STORAGE_BUCKETS } from '../file-storage/constants/buckets';
import { RedisService } from '../redis/redis.service';
import { AuditService, AuditAction } from '../../shared/audit/audit.service';

/**
 * Archive configuration loaded from environment variables
 * Story 16.3: CLI Session Archive Storage (AC3, AC10)
 */
export interface ArchiveConfig {
  archiveAfterHours: number;
  batchSize: number;
  retentionDays: number;
  cacheTtlSeconds: number;
  maxSizeMB: number;
  intervalMinutes: number;
}

const REDIS_CACHE_PREFIX = 'cli-session-cache:';

/**
 * CLI Session Archive Service
 * Story 16.3: CLI Session Archive Storage (AC3)
 *
 * Handles archiving CLI session output from PostgreSQL to MinIO S3-compatible storage,
 * with Redis caching for recently accessed sessions and configurable retention lifecycle.
 */
@Injectable()
export class CliSessionArchiveService {
  private readonly logger = new Logger(CliSessionArchiveService.name);
  private readonly config: ArchiveConfig;

  constructor(
    @InjectRepository(CliSession)
    private readonly cliSessionRepository: Repository<CliSession>,
    private readonly fileStorageService: FileStorageService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.config = this.loadConfig();
  }

  /**
   * Load archive configuration from environment variables with defaults
   */
  private loadConfig(): ArchiveConfig {
    return {
      archiveAfterHours: parseInt(
        this.configService.get('CLI_SESSION_ARCHIVE_AFTER_HOURS', '1'),
        10,
      ),
      batchSize: parseInt(
        this.configService.get('CLI_SESSION_ARCHIVE_BATCH_SIZE', '50'),
        10,
      ),
      retentionDays: parseInt(
        this.configService.get('CLI_SESSION_ARCHIVE_RETENTION_DAYS', '30'),
        10,
      ),
      cacheTtlSeconds: parseInt(
        this.configService.get('CLI_SESSION_ARCHIVE_CACHE_TTL_SECONDS', '3600'),
        10,
      ),
      maxSizeMB: parseInt(
        this.configService.get('CLI_SESSION_ARCHIVE_MAX_SIZE_MB', '50'),
        10,
      ),
      intervalMinutes: parseInt(
        this.configService.get('CLI_SESSION_ARCHIVE_INTERVAL_MINUTES', '5'),
        10,
      ),
    };
  }

  /**
   * Get current archive configuration (for testing and scheduler)
   */
  getConfig(): ArchiveConfig {
    return this.config;
  }

  /**
   * Archive a single CLI session to MinIO
   * - Validates session has output and is not already archived
   * - Uploads compressed data to MinIO
   * - Clears outputText from database to free storage
   * - Updates storageKey and archivedAt
   */
  async archiveSession(session: CliSession): Promise<void> {
    // Skip if already archived
    if (session.storageKey) {
      this.logger.debug(`Session ${session.id} already archived, skipping`);
      return;
    }

    // Skip if no output to archive
    if (!session.outputText || session.outputText.length === 0) {
      this.logger.debug(`Session ${session.id} has no output, skipping`);
      return;
    }

    // Validate compressed data size
    const dataBuffer = Buffer.from(session.outputText, 'base64');
    const maxSizeBytes = this.config.maxSizeMB * 1024 * 1024;
    if (dataBuffer.length > maxSizeBytes) {
      throw new BadRequestException(
        `Session ${session.id} compressed data (${dataBuffer.length} bytes) exceeds maximum allowed size of ${this.config.maxSizeMB}MB`,
      );
    }

    // Build MinIO storage key
    const storageKey = this.fileStorageService.buildKey(
      session.workspaceId,
      session.projectId ?? 'no-project',
      `${session.id}.gz`,
    );

    // Upload to MinIO
    await this.fileStorageService.upload(
      STORAGE_BUCKETS.CLI_SESSIONS,
      storageKey,
      dataBuffer,
      {
        contentType: 'application/gzip',
        metadata: {
          sessionId: session.id,
          agentType: session.agentType,
          lineCount: String(session.lineCount),
        },
      },
    );

    // Update session in database: set storageKey, archivedAt, clear outputText
    await this.cliSessionRepository.update(session.id, {
      storageKey,
      archivedAt: new Date(),
      outputText: '',
    });

    this.logger.log(
      `Archived CLI session ${session.id} to ${storageKey} (${session.outputSizeBytes} bytes)`,
    );

    // Audit trail
    await this.auditService.log(
      session.workspaceId,
      'system',
      AuditAction.SESSION_ARCHIVED,
      'cli_session',
      session.id,
      {
        sessionId: session.id,
        storageKey,
        sizeBytes: session.outputSizeBytes,
        agentType: session.agentType,
      },
    );
  }

  /**
   * Archive all pending sessions (batch operation)
   * Finds sessions that have ended more than archiveAfterHours ago and are not yet archived
   */
  async archivePendingSessions(): Promise<{
    archived: number;
    failed: number;
    skipped: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - this.config.archiveAfterHours);

    const sessions = await this.cliSessionRepository
      .createQueryBuilder('session')
      .where('session.archived_at IS NULL')
      .andWhere('session.ended_at IS NOT NULL')
      .andWhere('session.ended_at < :cutoffDate', { cutoffDate })
      .orderBy('session.ended_at', 'ASC')
      .take(this.config.batchSize)
      .getMany();

    let archived = 0;
    let failed = 0;
    let skipped = 0;

    for (const session of sessions) {
      try {
        if (!session.outputText || session.outputText.length === 0) {
          skipped++;
          continue;
        }
        await this.archiveSession(session);
        archived++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to archive session ${session.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Archive batch complete: ${archived} archived, ${failed} failed, ${skipped} skipped`,
    );

    return { archived, failed, skipped };
  }

  /**
   * Retrieve archived session output from MinIO with Redis caching
   * - Checks Redis cache first
   * - Falls back to MinIO download
   * - Caches result in Redis with TTL
   */
  async getArchivedSessionOutput(session: CliSession): Promise<string> {
    if (!session.storageKey) {
      throw new NotFoundException(
        `Session ${session.id} is not archived (no storage key)`,
      );
    }

    // Check Redis cache first
    const cacheKey = `${REDIS_CACHE_PREFIX}${session.id}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for session ${session.id}`);
      return cached;
    }

    // Download from MinIO
    const buffer = await this.fileStorageService.download(
      STORAGE_BUCKETS.CLI_SESSIONS,
      session.storageKey,
    );

    const base64Data = buffer.toString('base64');

    // Cache in Redis with TTL
    await this.redisService.set(
      cacheKey,
      base64Data,
      this.config.cacheTtlSeconds,
    );

    this.logger.debug(`Cache miss for session ${session.id}, fetched from MinIO and cached`);
    return base64Data;
  }

  /**
   * Clean up expired archived sessions (retention lifecycle)
   * Deletes sessions archived more than retentionDays ago from both MinIO and database
   */
  async cleanupExpiredArchives(): Promise<{
    deleted: number;
    failed: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    // Query only expired sessions directly in the database (not all archived sessions)
    const sessionsToDelete = await this.cliSessionRepository
      .createQueryBuilder('session')
      .where('session.archived_at IS NOT NULL')
      .andWhere('session.archived_at < :cutoffDate', { cutoffDate })
      .getMany();

    let deleted = 0;
    let failed = 0;

    for (const session of sessionsToDelete) {
      try {
        // Delete from MinIO
        if (session.storageKey) {
          await this.fileStorageService.delete(
            STORAGE_BUCKETS.CLI_SESSIONS,
            session.storageKey,
          );
        }

        // Delete database record
        await this.cliSessionRepository.remove(session);

        // Invalidate Redis cache
        await this.invalidateCache(session.id);

        deleted++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to delete expired archive for session ${session.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Expired archive cleanup: ${deleted} deleted, ${failed} failed`,
    );

    // Audit trail for cleanup - log per workspace for proper isolation
    if (deleted > 0 || failed > 0) {
      const workspaceIds = [...new Set(sessionsToDelete.map((s) => s.workspaceId))];
      for (const workspaceId of workspaceIds) {
        await this.auditService.log(
          workspaceId,
          'system',
          AuditAction.SESSION_ARCHIVE_CLEANUP,
          'cli_session',
          'batch',
          {
            deletedCount: deleted,
            failedCount: failed,
          },
        );
      }
    }

    return { deleted, failed };
  }

  /**
   * Get archive statistics for a workspace
   */
  async getArchiveStats(workspaceId: string): Promise<{
    totalArchived: number;
    totalSizeBytes: number;
    oldestArchive: Date | null;
    newestArchive: Date | null;
  }> {
    const result = await this.cliSessionRepository
      .createQueryBuilder('session')
      .select('COUNT(*)', 'totalArchived')
      .addSelect('COALESCE(SUM(session.output_size_bytes), 0)', 'totalSizeBytes')
      .addSelect('MIN(session.archived_at)', 'oldestArchive')
      .addSelect('MAX(session.archived_at)', 'newestArchive')
      .where('session.workspace_id = :workspaceId', { workspaceId })
      .andWhere('session.archived_at IS NOT NULL')
      .getRawOne();

    return {
      totalArchived: parseInt(result?.totalArchived || '0', 10),
      totalSizeBytes: parseInt(result?.totalSizeBytes || '0', 10),
      oldestArchive: result?.oldestArchive ? new Date(result.oldestArchive) : null,
      newestArchive: result?.newestArchive ? new Date(result.newestArchive) : null,
    };
  }

  /**
   * Invalidate Redis cache for a session
   */
  async invalidateCache(sessionId: string): Promise<void> {
    const cacheKey = `${REDIS_CACHE_PREFIX}${sessionId}`;
    await this.redisService.del(cacheKey);
    this.logger.debug(`Invalidated cache for session ${sessionId}`);
  }

  /**
   * Delete an archived session's storage and cache
   * Called when a session is manually deleted
   */
  async deleteArchivedSession(session: CliSession): Promise<void> {
    if (session.storageKey) {
      await this.fileStorageService.delete(
        STORAGE_BUCKETS.CLI_SESSIONS,
        session.storageKey,
      );
    }

    await this.invalidateCache(session.id);

    // Audit trail
    await this.auditService.log(
      session.workspaceId,
      'system',
      AuditAction.SESSION_ARCHIVE_DELETED,
      'cli_session',
      session.id,
      {
        sessionId: session.id,
        storageKey: session.storageKey,
      },
    );
  }

  /**
   * Get a session by ID (for processor use)
   */
  async getSessionById(sessionId: string): Promise<CliSession | null> {
    return this.cliSessionRepository.findOne({
      where: { id: sessionId },
    });
  }
}
