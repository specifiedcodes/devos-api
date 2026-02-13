import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
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

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * CLI Sessions Service
 * Story 8.5: CLI Session History and Replay
 *
 * Handles CRUD operations for CLI session history with
 * compression/decompression support.
 */
@Injectable()
export class CliSessionsService {
  private readonly logger = new Logger(CliSessionsService.name);

  constructor(
    @InjectRepository(CliSession)
    private readonly cliSessionRepository: Repository<CliSession>,
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

    // Execute query
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
      ],
    });

    // Map to summary DTOs
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

    // Decompress the output
    const decompressedOutput = await this.decompressOutput(session.outputText);
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
   */
  async deleteSession(workspaceId: string, sessionId: string): Promise<void> {
    const session = await this.cliSessionRepository.findOne({
      where: { id: sessionId, workspaceId },
    });

    if (!session) {
      throw new NotFoundException(`CLI session ${sessionId} not found`);
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

    const result = await this.cliSessionRepository.delete({
      createdAt: LessThan(thirtyDaysAgo),
    });

    const deletedCount = result.affected || 0;
    if (deletedCount > 0) {
      this.logger.log(`Cleaned up ${deletedCount} CLI sessions older than 30 days`);
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
