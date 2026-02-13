import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RateLimiterService } from '../../../shared/cache/rate-limiter.service';

/**
 * ChatRateLimitGuard
 * Story 9.2: Send Message to Agent
 *
 * Applies rate limiting for chat message sending:
 * - 10 messages per minute per user per workspace
 * - 100 messages per hour per user per workspace
 * - 1000 messages per day per workspace (aggregate across all users)
 */
@Injectable()
export class ChatRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(ChatRateLimitGuard.name);

  // Rate limit configuration
  private static readonly MESSAGES_PER_MINUTE = 10;
  private static readonly MESSAGES_PER_HOUR = 100;
  private static readonly MESSAGES_PER_DAY_WORKSPACE = 1000;
  private static readonly ONE_MINUTE_MS = 60 * 1000;
  private static readonly ONE_HOUR_MS = 60 * 60 * 1000;
  private static readonly ONE_DAY_MS = 24 * 60 * 60 * 1000;

  constructor(private readonly rateLimiterService: RateLimiterService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const workspaceId = request.params.workspaceId;

    if (!user || !workspaceId) {
      // If no user or workspace, let other guards handle it
      return true;
    }

    const userId = user.sub || user.id;

    // Check per-minute rate limit
    const minuteKey = `chat:rate:min:${workspaceId}:${userId}`;
    try {
      await this.rateLimiterService.checkLimit(
        minuteKey,
        ChatRateLimitGuard.MESSAGES_PER_MINUTE,
        ChatRateLimitGuard.ONE_MINUTE_MS,
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        this.logger.warn(
          `Per-minute rate limit exceeded for user ${userId} in workspace ${workspaceId}`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Rate limit exceeded. Maximum 10 messages per minute.',
            error: 'Too Many Requests',
            errorCode: 'RATE_LIMIT_EXCEEDED',
            retryAfter: 60,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }

    // Check per-hour rate limit
    const hourKey = `chat:rate:hr:${workspaceId}:${userId}`;
    try {
      await this.rateLimiterService.checkLimit(
        hourKey,
        ChatRateLimitGuard.MESSAGES_PER_HOUR,
        ChatRateLimitGuard.ONE_HOUR_MS,
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        this.logger.warn(
          `Per-hour rate limit exceeded for user ${userId} in workspace ${workspaceId}`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Rate limit exceeded. Maximum 100 messages per hour.',
            error: 'Too Many Requests',
            errorCode: 'RATE_LIMIT_EXCEEDED',
            retryAfter: 3600,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }

    // Check per-day workspace aggregate rate limit
    const dayKey = `chat:rate:day:${workspaceId}`;
    try {
      await this.rateLimiterService.checkLimit(
        dayKey,
        ChatRateLimitGuard.MESSAGES_PER_DAY_WORKSPACE,
        ChatRateLimitGuard.ONE_DAY_MS,
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        this.logger.warn(
          `Per-day workspace rate limit exceeded for workspace ${workspaceId}`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Workspace daily message limit exceeded. Maximum 1000 messages per day.',
            error: 'Too Many Requests',
            errorCode: 'RATE_LIMIT_EXCEEDED',
            retryAfter: 86400,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }

    return true;
  }
}
