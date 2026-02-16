import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../redis/redis.service';

/**
 * WebSocket JWT Authentication Middleware
 * Story 15.7: WebSocket Security Hardening (AC1)
 *
 * Socket.io middleware that verifies JWT on handshake, populates
 * socket.data with user claims, checks Redis blacklist for revoked
 * tokens, and logs authentication failures.
 */

const logger = new Logger('WsAuthMiddleware');

export interface WsAuthMiddlewareSocket {
  id: string;
  data: Record<string, unknown>;
  handshake: {
    auth: { token?: string };
    address: string;
    query: Record<string, string>;
  };
}

export type WsNextFunction = (err?: Error) => void;

/**
 * Creates a Socket.io middleware function for JWT authentication.
 *
 * @param jwtService - NestJS JwtService for token verification
 * @param redisService - RedisService for blacklist checks
 * @returns Socket.io middleware function
 */
export function createWsAuthMiddleware(
  jwtService: JwtService,
  redisService: RedisService,
) {
  return async (socket: WsAuthMiddlewareSocket, next: WsNextFunction): Promise<void> => {
    const token = socket.handshake.auth.token;

    if (!token) {
      logger.warn(
        `WebSocket auth failed: missing token, IP: ${socket.handshake.address}`,
      );
      next(new Error('Authentication failed'));
      return;
    }

    try {
      // Verify JWT signature and expiration
      const payload = await jwtService.verifyAsync(token);

      // Check Redis blacklist for revoked tokens
      if (payload.jti) {
        const isBlacklisted = await redisService.get(
          `blacklist:token:${payload.jti}`,
        );
        if (isBlacklisted) {
          logger.warn(
            `WebSocket auth failed: blacklisted token, IP: ${socket.handshake.address}`,
          );
          next(new Error('Authentication failed'));
          return;
        }
      }

      // Populate socket.data with JWT claims
      socket.data.userId = payload.sub || payload.userId;
      socket.data.workspaceId = payload.workspaceId;
      socket.data.role = payload.role;

      next();
    } catch (error) {
      const reason =
        error instanceof Error ? error.name : 'unknown';
      logger.warn(
        `WebSocket auth failed: ${reason}, IP: ${socket.handshake.address}`,
      );
      next(new Error('Authentication failed'));
    }
  };
}
