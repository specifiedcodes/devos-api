import { Injectable, NotFoundException, Logger, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { CliSession } from '../../database/entities/cli-session.entity';
import {
  CreateCliSessionDto,
  GetSessionsOptions,
  CliSessionSummaryDto,
  PaginatedCliSessionsResult,
  CliSessionReplayDto,
} from './dto';
import { CliSessionArchiveService } from './cli-session-archive.service';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * CLI Sessions Service
 * Story 8.5: CLI Session History and Replay
 * Story 16.3: CLI Session Archive Storage (AC6)
 *
 * Handles CRUD operations for CLI session history with
 * compression/decompression support and archive-aware replay.
 */
@Injectable()
export class CliSessionsService {
  private readonly logger = new Logger(CliSessionsService.name);

  constructor(
    @InjectRepository(CliSession)
    private readonly cliSessionRepository: Repository<CliSession>,
    @Optional()
    @Inject(CliSessionArchiveService)
    private readonly archiveService?: CliSessionArchiveService,
  ) {}

  /**
   * Compresses output text using gzip and returns base64 encoded string
   */
  async compressOutput(text: string): Promise<string> {
    const buffer = await gzip(Buffer.from(text, 'utf-8'));
    return buffer.toString('base64');
  }

  /**
   * Decompresses base64 gzip encoded string back to original text
   * Handles corrupted or invalid data gracefully
   */
  async decompressOutput(compressed: string): Promise<string> {
    try {
      if (!compressed || compressed.length === 0) {
        return '';
      }
      const buffer = Buffer.from(compressed, 'base64');
      const decompressed = await gunzip(buffer);
      return decompressed.toString('utf-8');
    } catch (error) {
      this.logger.error(`Failed to decompress session output: ${error}`);
      throw new Error('Session output data is corrupted or invalid');
    }
  }

  /**
   * Splits decompressed output into lines for replay
   */
  splitOutputToLines(text: string): string[] {
    return text.split('\n');
  }

  /**
   * Creates a new CLI session record
   * Compresses the output text before storage
   */
  async createSession(dto: CreateCliSessionDto): Promise<CliSession> {
    const { outputText, startedAt, endedAt, ...rest } = dto;

    // Compress the output
    const compressedOutput = await this.compressOutput(outputText);
    const lineCount = this.splitOutputToLines(outputText).length;
    const outputSizeBytes = Buffer.byteLength(compressedOutput, 'base64');

    // Calculate duration if both timestamps provided
    let durationSeconds: number | null = null;
    if (startedAt && endedAt) {
      const start = new Date(startedAt);
      const end = new Date(endedAt);
      durationSeconds = Math.round((end.getTime() - start.getTime()) / 1000);
    }

    const session = this.cliSessionRepository.create({
      ...rest,
      outputText: compressedOutput,
      lineCount,
      outputSizeBytes,
      startedAt: new Date(startedAt),
      endedAt: endedAt ? new Date(endedAt) : null,
      durationSeconds,
    });

    const saved = await this.cliSessionRepository.save(session);
    this.logger.log(`Created CLI session ${saved.id} for workspace ${saved.workspaceId}`);
    return saved;
  }

  /**
   * Gets paginated sessions for a workspace
   * Returns summary data without output text
   * Story 16.3: Includes isArchived and archivedAt fields
   */
  async getWorkspaceSessions(
    options: GetSessionsOptions,
  ): Promise<PaginatedCliSessionsResult> {
    const {
      workspaceId,
      projectId,
      agentType,
      status,
      storyKey,
      startDate,
      endDate,
      limit,
      offset,
    } = options;

    // Build query conditions
    const whereConditions: Record<string, unknown> = { workspaceId };

    if (projectId) {
      whereConditions.projectId = projectId;
    }

    if (agentType) {
      whereConditions.agentType = agentType;
    }

    if (status) {
      whereConditions.status = status;
    }

    if (storyKey) {
      whereConditions.storyKey = storyKey;
    }

    // Date range filtering
    if (startDate && endDate) {
      whereConditions.startedAt = Between(startDate, endDate);
    } else if (startDate) {
      whereConditions.startedAt = Between(startDate, new Date());
    }

    // Execute query - Story 16.3: include archivedAt and storageKey
    const [sessions, total] = await this.cliSessionRepository.findAndCount({
      where: whereConditions,
      order: { startedAt: 'DESC' },
      take: limit,
      skip: offset,
      select: [
        'id',
        'agentId',
        'agentType',
        'storyKey',
        'status',
        'startedAt',
        'endedAt',
        'durationSeconds',
        'lineCount',
        'archivedAt',
        'storageKey',
      ],
    });

    // Map to summary DTOs - Story 16.3: include isArchived and archivedAt
    const data: CliSessionSummaryDto[] = sessions.map((session) => ({
      id: session.id,
      agentId: session.agentId,
      agentType: session.agentType,
      storyKey: session.storyKey,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      durationSeconds: session.durationSeconds,
      lineCount: session.lineCount,
      isArchived: !!session.storageKey,
      archivedAt: session.archivedAt ? session.archivedAt.toISOString() : null,
    }));

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  }

  /**
   * Gets a single session with decompressed output for replay
   * Story 16.3: Archive-aware - fetches from MinIO if session is archived
   */
  async getSessionForReplay(
    workspaceId: string,
    sessionId: string,
  ): Promise<CliSessionReplayDto> {
    const session = await this.cliSessionRepository.findOne({
      where: { id: sessionId, workspaceId },
    });

    if (!session) {
      throw new NotFoundException(`CLI session ${sessionId} not found`);
    }

    let compressedOutput: string;

    if (session.storageKey && session.archivedAt && this.archiveService) {
      // Story 16.3: Session is archived - fetch from MinIO (with Redis cache)
      compressedOutput = await this.archiveService.getArchivedSessionOutput(session);
    } else {
      // Session is still in database
      compressedOutput = session.outputText;
    }

    // Decompress the output
    const decompressedOutput = await this.decompressOutput(compressedOutput);
    const outputLines = this.splitOutputToLines(decompressedOutput);

    return {
      id: session.id,
      agentId: session.agentId,
      agentType: session.agentType,
      storyKey: session.storyKey,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      durationSeconds: session.durationSeconds,
      lineCount: session.lineCount,
      isArchived: !!session.storageKey,
      archivedAt: session.archivedAt ? session.archivedAt.toISOString() : null,
      outputLines,
    };
  }

  /**
   * Gets a session by ID (workspace scoped)
   */
  async getSession(workspaceId: string, sessionId: string): Promise<CliSession | null> {
    return this.cliSessionRepository.findOne({
      where: { id: sessionId, workspaceId },
    });
  }

  /**
   * Deletes a session (admin only)
   * Story 16.3: Also cleans up MinIO archive and Redis cache if session is archived
   */
  async deleteSession(workspaceId: string, sessionId: string): Promise<void> {
    const session = await this.cliSessionRepository.findOne({
      where: { id: sessionId, workspaceId },
    });

    if (!session) {
      throw new NotFoundException(`CLI session ${sessionId} not found`);
    }

    // Story 16.3: If archived, delete from MinIO and invalidate cache
    if (session.storageKey && this.archiveService) {
      try {
        await this.archiveService.deleteArchivedSession(session);
      } catch (error) {
        this.logger.warn(
          `Failed to delete archived session from storage: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with DB deletion even if storage cleanup fails
      }
    }

    await this.cliSessionRepository.remove(session);
    this.logger.log(`Deleted CLI session ${sessionId} from workspace ${workspaceId}`);
  }

  /**
   * Deletes old sessions (30 day retention)
   * Called by cleanup service cron job
   */
  async cleanupOldSessions(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Story 16.3: Only delete non-archived sessions.
    // Archived sessions have their own cleanup lifecycle via cleanupExpiredArchives()
    // which properly removes MinIO objects before deleting DB records.
    const result = await this.cliSessionRepository
      .createQueryBuilder()
      .delete()
      .from(CliSession)
      .where('created_at < :thirtyDaysAgo', { thirtyDaysAgo })
      .andWhere('archived_at IS NULL')
      .execute();

    const deletedCount = result.affected || 0;
    if (deletedCount > 0) {
      this.logger.log(`Cleaned up ${deletedCount} non-archived CLI sessions older than 30 days`);
    }

    return deletedCount;
  }

  /**
   * Gets total session count for a workspace (for quota tracking)
   */
  async getWorkspaceSessionCount(workspaceId: string): Promise<number> {
    return this.cliSessionRepository.count({ where: { workspaceId } });
  }

  /**
   * Gets total storage used by workspace sessions (in bytes)
   */
  async getWorkspaceStorageUsage(workspaceId: string): Promise<number> {
    const result = await this.cliSessionRepository
      .createQueryBuilder('session')
      .select('SUM(session.output_size_bytes)', 'totalBytes')
      .where('session.workspace_id = :workspaceId', { workspaceId })
      .getRawOne();

    return parseInt(result?.totalBytes || '0', 10);
  }
}
