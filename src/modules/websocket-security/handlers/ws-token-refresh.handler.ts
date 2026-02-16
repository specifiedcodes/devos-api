import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../redis/redis.service';
import { WS_EVENTS, WS_TIMEOUTS } from '../ws-security.constants';
import { WsTokenRefreshPayload } from '../interfaces/ws-security.interfaces';

/**
 * WebSocket Token Refresh Handler
 * Story 15.7: WebSocket Security Hardening (AC3)
 *
 * Handles token refresh for long-lived WebSocket connections,
 * schedules expiry warnings, and disconnects on grace period expiration.
 */
@Injectable()
export class WsTokenRefreshHandler {
  private readonly logger = new Logger(WsTokenRefreshHandler.name);

  /**
   * NOTE: In-memory timer maps are scoped to a single process instance.
   * In a horizontally scaled deployment (multiple API instances), sticky
   * sessions must be configured so that a socket always connects to the
   * same instance. If sticky sessions are not feasible, consider migrating
   * to Redis-based expiry tracking (e.g., Redis keyspace notifications).
   */
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Handles a token refresh request from the client.
   *
   * @param socket - The authenticated socket
   * @param payload - Contains the refresh token
   */
  async handleRefresh(
    socket: { id: string; data: Record<string, unknown>; emit: Function; disconnect: Function },
    payload: WsTokenRefreshPayload,
  ): Promise<void> {
    try {
      // Verify the refresh token
      const decoded = await this.jwtService.verifyAsync(payload.refreshToken);

      // Check blacklist
      if (decoded.jti) {
        const isBlacklisted = await this.redisService.get(
          `blacklist:token:${decoded.jti}`,
        );
        if (isBlacklisted) {
          socket.emit(WS_EVENTS.AUTH_REFRESH_FAILED, {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Refresh token has been revoked',
          });
          return;
        }
      }

      // Generate new access token
      const newPayload = {
        sub: decoded.sub || decoded.userId,
        workspaceId: decoded.workspaceId,
        role: decoded.role,
        jti: `ws-${Date.now()}`,
      };

      const accessToken = await this.jwtService.signAsync(newPayload, {
        expiresIn: '24h',
      });

      // Update socket.data
      socket.data.userId = newPayload.sub;
      socket.data.workspaceId = newPayload.workspaceId;
      socket.data.role = newPayload.role;

      // Clear any existing grace period timer
      this.clearGraceTimer(socket.id);

      // Emit refreshed event
      const expiresIn = 86400; // 24 hours in seconds
      socket.emit(WS_EVENTS.AUTH_REFRESHED, {
        accessToken,
        expiresIn,
      });

      // Schedule expiry warning
      this.scheduleExpiryWarning(socket, expiresIn);

      this.logger.debug(`Token refreshed for socket ${socket.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Token refresh failed';
      socket.emit(WS_EVENTS.AUTH_REFRESH_FAILED, {
        code: 'INVALID_REFRESH_TOKEN',
        message,
      });
      this.logger.warn(
        `Token refresh failed for socket ${socket.id}: ${message}`,
      );
    }
  }

  /**
   * Schedules an auth:expiring warning before token expiry.
   * Also sets up the grace period disconnect.
   */
  scheduleExpiryWarning(
    socket: { id: string; emit: Function; disconnect: Function },
    expiresInSeconds: number,
  ): void {
    // Clear existing timers
    this.clearExpiryTimer(socket.id);
    this.clearGraceTimer(socket.id);

    const warningMs = Math.max(
      0,
      expiresInSeconds * 1000 - WS_TIMEOUTS.TOKEN_EXPIRY_WARNING,
    );
    const graceMs = expiresInSeconds * 1000 + WS_TIMEOUTS.TOKEN_EXPIRY_GRACE;

    // Schedule expiry warning
    const warningTimer = setTimeout(() => {
      socket.emit(WS_EVENTS.AUTH_EXPIRING, {
        expiresIn: Math.floor(WS_TIMEOUTS.TOKEN_EXPIRY_WARNING / 1000),
      });
    }, warningMs);

    this.expiryTimers.set(socket.id, warningTimer);

    // Schedule grace period disconnect
    const graceTimer = setTimeout(() => {
      this.logger.warn(
        `Token expired with grace period for socket ${socket.id}, disconnecting`,
      );
      socket.disconnect(true);
    }, graceMs);

    this.graceTimers.set(socket.id, graceTimer);
  }

  /**
   * Cleans up all timers for a disconnecting socket.
   */
  cleanup(socketId: string): void {
    this.clearExpiryTimer(socketId);
    this.clearGraceTimer(socketId);
  }

  private clearExpiryTimer(socketId: string): void {
    const timer = this.expiryTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(socketId);
    }
  }

  private clearGraceTimer(socketId: string): void {
    const timer = this.graceTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(socketId);
    }
  }
}
