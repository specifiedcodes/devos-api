/**
 * CLIOutputStreamService
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * Streams CLI output to WebSocket rooms in real-time with 100ms batching.
 * Maintains a Redis circular buffer for late-joining clients.
 * Archives full output to CLI sessions database on completion.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../../redis/redis.service';
import { CliSessionsService } from '../../cli-sessions/cli-sessions.service';
import {
  StreamParams,
  CLIOutputBatch,
} from '../interfaces/pipeline-job.interfaces';

/** Maximum lines stored in Redis circular buffer */
const MAX_REDIS_BUFFER_LINES = 1000;

/** Maximum total lines kept in memory for archival (50,000 lines ~ 5MB) */
const MAX_TOTAL_LINES_IN_MEMORY = 50_000;

/** Flush interval in milliseconds */
const FLUSH_INTERVAL_MS = 100;

/** Redis buffer TTL after session end: 1 hour */
const REDIS_BUFFER_TTL_SECONDS = 3600;

/**
 * Internal state for an active output stream.
 */
interface ActiveStream {
  buffer: string[];
  timer: ReturnType<typeof setInterval>;
  totalLines: string[];
  lineOffset: number;
  params: StreamParams;
  startedAt: Date;
}

@Injectable()
export class CLIOutputStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(CLIOutputStreamService.name);

  /** Active streams tracked by sessionId */
  private readonly activeStreams = new Map<string, ActiveStream>();

  constructor(
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cliSessionsService: CliSessionsService,
  ) {}

  /**
   * Start streaming CLI output from a session to a WebSocket room.
   * Initializes Redis buffer and starts 100ms flush timer.
   */
  startStreaming(params: StreamParams): void {
    const { sessionId } = params;

    this.logger.log(
      `Starting output stream for session ${sessionId}`,
    );

    // Initialize Redis key - fire-and-forget but log errors
    this.redisService.del(`cli:output:${sessionId}`).catch((err) => {
      this.logger.warn(
        `Failed to clear Redis buffer for session ${sessionId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    });

    // Create active stream entry
    const stream: ActiveStream = {
      buffer: [],
      timer: setInterval(() => this.flush(sessionId), FLUSH_INTERVAL_MS),
      totalLines: [],
      lineOffset: 0,
      params,
      startedAt: new Date(),
    };

    this.activeStreams.set(sessionId, stream);
  }

  /**
   * Process a chunk of CLI output.
   * Called by the CLI session's stdout handler.
   * Buffers output and flushes every 100ms via timer.
   */
  onOutput(sessionId: string, data: Buffer): void {
    const stream = this.activeStreams.get(sessionId);
    if (!stream) return;

    const text = data.toString();
    const lines = text.split('\n').filter((line) => line.length > 0);

    stream.buffer.push(...lines);
    stream.totalLines.push(...lines);

    // Cap in-memory total lines to prevent unbounded memory growth
    // during long-running sessions. Keep the most recent lines.
    if (stream.totalLines.length > MAX_TOTAL_LINES_IN_MEMORY) {
      stream.totalLines = stream.totalLines.slice(-MAX_TOTAL_LINES_IN_MEMORY);
    }
  }

  /**
   * Stop streaming and archive final output.
   * Called when CLI session ends.
   */
  async stopStreaming(sessionId: string): Promise<void> {
    const stream = this.activeStreams.get(sessionId);
    if (!stream) return;

    this.logger.log(`Stopping output stream for session ${sessionId}`);

    // Flush remaining buffer
    this.flush(sessionId);

    // Clear flush timer
    clearInterval(stream.timer);

    // Set Redis key TTL to 1 hour for replay
    await this.redisService.expire(
      `cli:output:${sessionId}`,
      REDIS_BUFFER_TTL_SECONDS,
    );

    // Archive full output to CLI sessions database
    try {
      const outputText = stream.totalLines.join('\n');
      await this.cliSessionsService.createSession({
        id: sessionId,
        agentId: stream.params.agentId,
        agentType: stream.params.agentType as any,
        workspaceId: stream.params.workspaceId,
        outputText,
        status: 'completed' as any,
        startedAt: stream.startedAt.toISOString(),
        endedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to archive output for session ${sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Remove from active streams
    this.activeStreams.delete(sessionId);
  }

  /**
   * Get buffered output for late-joining clients.
   * Reads from Redis buffer.
   */
  async getBufferedOutput(sessionId: string): Promise<string[]> {
    try {
      const data = await this.redisService.get(
        `cli:output:${sessionId}`,
      );
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Cleanup on module destroy - clear all timers.
   */
  onModuleDestroy(): void {
    for (const [, stream] of this.activeStreams) {
      clearInterval(stream.timer);
    }
    this.activeStreams.clear();
  }

  /**
   * Flush buffered output to WebSocket and Redis.
   */
  private flush(sessionId: string): void {
    const stream = this.activeStreams.get(sessionId);
    if (!stream || stream.buffer.length === 0) return;

    const lines = [...stream.buffer];
    const lineOffset = stream.lineOffset;

    // Clear buffer
    stream.buffer = [];
    stream.lineOffset += lines.length;

    // Emit to WebSocket via EventEmitter2
    const batch: CLIOutputBatch = {
      sessionId,
      lines,
      timestamp: new Date(),
      lineOffset,
    };
    this.eventEmitter.emit('cli:output', batch);

    // Store in Redis (circular buffer, max 1000 lines)
    this.storeInRedis(sessionId, stream.totalLines);
  }

  /**
   * Store output lines in Redis as a JSON array, trimmed to MAX_REDIS_BUFFER_LINES.
   * Errors are logged but do not interrupt the streaming pipeline.
   */
  private storeInRedis(
    sessionId: string,
    totalLines: string[],
  ): void {
    // Keep only last MAX_REDIS_BUFFER_LINES
    const linesToStore =
      totalLines.length > MAX_REDIS_BUFFER_LINES
        ? totalLines.slice(-MAX_REDIS_BUFFER_LINES)
        : totalLines;

    this.redisService
      .set(
        `cli:output:${sessionId}`,
        JSON.stringify(linesToStore),
        REDIS_BUFFER_TTL_SECONDS,
      )
      .catch((err) => {
        this.logger.warn(
          `Failed to store output in Redis for session ${sessionId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      });
  }
}
