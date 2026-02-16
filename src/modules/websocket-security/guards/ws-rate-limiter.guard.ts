import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  WS_RATE_LIMITS,
  WS_REDIS_KEYS,
  WS_REDIS_TTLS,
  WS_EVENTS,
} from '../ws-security.constants';

/**
 * WebSocket Per-Connection Rate Limiter Guard
 * Story 15.7: WebSocket Security Hardening (AC5)
 *
 * Sliding window rate limiting for messages, room joins, and broadcasts.
 * Uses escalating enforcement: warning -> drop -> ban.
 * Redis-backed state with auto-cleanup TTLs.
 */
@Injectable()
export class WsRateLimiterGuard {
  private readonly logger = new Logger(WsRateLimiterGuard.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Checks message rate limit for a socket.
   * Returns true if allowed, false if rate limited.
   */
  async checkMessageRate(
    socket: { id: string; emit: Function; disconnect: Function },
  ): Promise<boolean> {
    return this.checkRate(
      socket,
      `${WS_REDIS_KEYS.RATE_MSG}:${socket.id}`,
      WS_RATE_LIMITS.MESSAGES_PER_MINUTE,
      60000, // 1 minute window
      'message',
    );
  }

  /**
   * Checks room join rate limit for a socket.
   */
  async checkJoinRate(
    socket: { id: string; emit: Function; disconnect: Function },
  ): Promise<boolean> {
    return this.checkRate(
      socket,
      `${WS_REDIS_KEYS.RATE_JOIN}:${socket.id}`,
      WS_RATE_LIMITS.ROOM_JOINS_PER_MINUTE,
      60000, // 1 minute window
      'join',
    );
  }

  /**
   * Checks broadcast rate limit for a room.
   */
  async checkBroadcastRate(
    socket: { id: string; emit: Function; disconnect: Function },
    room: string,
  ): Promise<boolean> {
    return this.checkRate(
      socket,
      `${WS_REDIS_KEYS.RATE_BROADCAST}:${room}`,
      WS_RATE_LIMITS.BROADCASTS_PER_SECOND,
      1000, // 1 second window
      'broadcast',
    );
  }

  /**
   * Checks if a socket is banned.
   */
  async isBanned(socketId: string): Promise<boolean> {
    const banned = await this.redisService.get(
      `${WS_REDIS_KEYS.BANNED}:${socketId}`,
    );
    return banned === '1';
  }

  /**
   * Generic sliding window rate check using Redis sorted sets.
   * Order: prune old entries -> count -> check limit -> add entry only if allowed.
   */
  private async checkRate(
    socket: { id: string; emit: Function; disconnect: Function },
    key: string,
    limit: number,
    windowMs: number,
    type: 'message' | 'join' | 'broadcast',
  ): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Remove entries outside the window first
    await this.redisService.zremrangebyscore(key, '-inf', windowStart);

    // Count entries currently in window
    const count = await this.redisService.zcard(key);

    if (count >= limit) {
      // Rate limit exceeded - do NOT add entry, apply escalating enforcement
      return this.handleViolation(socket, type, limit, now + windowMs);
    }

    // Under limit - add current request to sorted set
    await this.redisService.zadd(key, now, `${now}-${Math.random()}`);

    // Set TTL on the key for auto-cleanup
    await this.redisService.expire(
      key,
      Math.ceil(windowMs / 1000) + WS_REDIS_TTLS.RATE_WINDOW,
    );

    return true;
  }

  /**
   * Handles rate limit violations with escalating enforcement.
   * 1st violation: warning
   * 2nd violation within 1 minute: drop
   * 3rd violation within 5 minutes: ban
   */
  private async handleViolation(
    socket: { id: string; emit: Function; disconnect: Function },
    type: 'message' | 'join' | 'broadcast',
    limit: number,
    resetAt: number,
  ): Promise<boolean> {
    const violationKey = `${WS_REDIS_KEYS.VIOLATIONS}:${socket.id}`;
    const now = Date.now();

    // Track violation
    await this.redisService.zadd(violationKey, now, `${now}`);
    await this.redisService.expire(violationKey, 300); // 5 minute window

    // Remove violations older than 5 minutes
    await this.redisService.zremrangebyscore(
      violationKey,
      '-inf',
      now - 300000,
    );

    // Count violations
    const violationCount = await this.redisService.zcard(violationKey);

    if (violationCount >= 3) {
      // 3rd violation: ban
      await this.redisService.set(
        `${WS_REDIS_KEYS.BANNED}:${socket.id}`,
        '1',
        WS_REDIS_TTLS.BAN_DURATION,
      );
      socket.emit(WS_EVENTS.RATE_LIMIT_BANNED, {
        type,
        message: 'Connection banned for excessive rate limit violations',
        banDuration: WS_REDIS_TTLS.BAN_DURATION,
      });
      this.logger.warn(
        `Socket ${socket.id} banned for ${WS_REDIS_TTLS.BAN_DURATION}s due to rate limit violations`,
      );
      socket.disconnect(true);
      return false;
    }

    if (violationCount >= 2) {
      // 2nd violation: drop silently
      socket.emit(WS_EVENTS.RATE_LIMIT_EXCEEDED, {
        type,
        message: 'Message dropped due to rate limit',
      });
      return false;
    }

    // 1st violation: warning
    socket.emit(WS_EVENTS.RATE_LIMIT_WARNING, {
      type,
      limit,
      remaining: 0,
      resetAt,
    });
    return false;
  }

  /**
   * Cleans up rate limit state for a disconnecting socket.
   */
  async cleanup(socketId: string): Promise<void> {
    await this.redisService.del(
      `${WS_REDIS_KEYS.RATE_MSG}:${socketId}`,
      `${WS_REDIS_KEYS.RATE_JOIN}:${socketId}`,
      `${WS_REDIS_KEYS.VIOLATIONS}:${socketId}`,
    );
  }
}
