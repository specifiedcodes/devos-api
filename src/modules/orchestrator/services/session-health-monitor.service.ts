/**
 * SessionHealthMonitorService
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * Monitors CLI session health by tracking output activity.
 * Detects stalled sessions (no output for 10+ minutes) and emits events.
 * Recovery is handled by Story 11.9; this service only detects stalls.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** Heartbeat check interval: 30 seconds */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Session considered stalled after 10 minutes of no activity */
const STALL_THRESHOLD_MS = 600_000;

/**
 * Internal tracking state for a monitored session.
 */
interface MonitoredSession {
  lastActivity: Date;
  interval: ReturnType<typeof setInterval>;
  stallEmitted: boolean;
}

@Injectable()
export class SessionHealthMonitorService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionHealthMonitorService.name);

  /** Monitored sessions tracked by sessionId */
  private readonly sessions = new Map<string, MonitoredSession>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Start monitoring a session's health.
   * Sets up a heartbeat interval that checks for activity every 30 seconds.
   */
  startMonitoring(sessionId: string): void {
    this.logger.log(`Starting health monitoring for session ${sessionId}`);

    const entry: MonitoredSession = {
      lastActivity: new Date(),
      interval: setInterval(
        () => this.checkHealth(sessionId),
        HEARTBEAT_INTERVAL_MS,
      ),
      stallEmitted: false,
    };

    this.sessions.set(sessionId, entry);
  }

  /**
   * Record activity for a session (called on stdout data).
   * Resets the stall detection timer.
   */
  recordActivity(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    entry.lastActivity = new Date();
    entry.stallEmitted = false; // Activity resumed, allow new stall event
  }

  /**
   * Check if a session is stalled (no output for configured threshold).
   * Default stall threshold: 10 minutes.
   */
  isStalled(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;

    const elapsed = Date.now() - entry.lastActivity.getTime();
    return elapsed > STALL_THRESHOLD_MS;
  }

  /**
   * Stop monitoring a session.
   * Clears heartbeat interval and removes from tracking.
   */
  stopMonitoring(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    this.logger.log(`Stopping health monitoring for session ${sessionId}`);

    clearInterval(entry.interval);
    this.sessions.delete(sessionId);
  }

  /**
   * Cleanup on module destroy - clear all intervals.
   */
  onModuleDestroy(): void {
    for (const [, entry] of this.sessions) {
      clearInterval(entry.interval);
    }
    this.sessions.clear();
  }

  /**
   * Perform a health check on a session.
   * Called by the heartbeat interval timer.
   */
  private checkHealth(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    if (this.isStalled(sessionId) && !entry.stallEmitted) {
      const stallDuration = Date.now() - entry.lastActivity.getTime();

      this.logger.warn(
        `Session ${sessionId} is stalled. No activity for ${Math.round(stallDuration / 1000)}s`,
      );

      this.eventEmitter.emit('cli:session:stalled', {
        sessionId,
        lastActivityTimestamp: entry.lastActivity,
        stallDuration,
      });

      entry.stallEmitted = true; // Prevent duplicate events
    }
  }
}
