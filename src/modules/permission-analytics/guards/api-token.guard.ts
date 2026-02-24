import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  SetMetadata,
  applyDecorators,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTokenService } from '../services/api-token.service';
import { RedisService } from '../../redis/redis.service';
import { ApiTokenScope } from '../dto/create-api-token.dto';

/** Token prefix used to identify API tokens vs JWTs */
const TOKEN_PREFIX = 'dvos_';

/** Rate limit: max requests per minute per token */
const RATE_LIMIT_MAX = 1000;

/** Rate limit window in seconds */
const RATE_LIMIT_WINDOW = 60;

/** Redis key prefix for rate limiting */
const RATE_LIMIT_PREFIX = 'api_token_rate:';

/** Metadata key for scope requirement */
export const API_TOKEN_SCOPE_KEY = 'api_token_scope';

/**
 * Decorator to specify the required API token scope for an endpoint.
 */
export const RequiresScope = (scope: ApiTokenScope) =>
  SetMetadata(API_TOKEN_SCOPE_KEY, scope);

/**
 * Decorator to mark an endpoint as API-token authenticated.
 * Combines UseGuards with ApiTokenGuard.
 */
export const ApiTokenAuth = () =>
  applyDecorators(UseGuards(ApiTokenGuard));

/**
 * Guard that authenticates requests using API tokens (dvos_ prefixed).
 * For endpoints designed for machine-to-machine communication.
 *
 * Logic:
 * 1. Extract Bearer token from Authorization header
 * 2. Check if token starts with dvos_ prefix
 * 3. Validate against stored hashes via ApiTokenService
 * 4. Check token has required scope
 * 5. Enforce rate limit (1000 req/min per token)
 * 6. Attach workspaceId and tokenId to request
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly logger = new Logger(ApiTokenGuard.name);

  constructor(
    private readonly apiTokenService: ApiTokenService,
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    const rawToken = parts[1];

    // If token doesn't start with dvos_, it's not an API token
    // Let other guards handle it
    if (!rawToken.startsWith(TOKEN_PREFIX)) {
      throw new UnauthorizedException('Invalid API token');
    }

    // Validate the token
    const result = await this.apiTokenService.validateToken(rawToken);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired API token');
    }

    const { token, workspaceId } = result;

    // Check required scope
    const requiredScope = this.reflector.get<ApiTokenScope>(
      API_TOKEN_SCOPE_KEY,
      context.getHandler(),
    );

    if (requiredScope && !token.scopes.includes(requiredScope)) {
      throw new ForbiddenException(
        `Token does not have required scope: ${requiredScope}`,
      );
    }

    // Rate limiting
    try {
      const rateLimitKey = `${RATE_LIMIT_PREFIX}${token.id}`;
      const currentCount = await this.redisService.get(rateLimitKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      if (count >= RATE_LIMIT_MAX) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Rate limit exceeded',
            retryAfter: RATE_LIMIT_WINDOW,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Increment counter
      const newCount = await this.redisService.increment(rateLimitKey);
      if (count === 0 || newCount === 1) {
        // Set TTL on first request in window
        await this.redisService.expire(rateLimitKey, RATE_LIMIT_WINDOW);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Redis failure: fail-open (allow the request)
      this.logger.warn('Rate limit check failed (Redis error), allowing request');
    }

    // Attach token info to request
    request.apiTokenId = token.id;
    request.apiTokenWorkspaceId = workspaceId;

    return true;
  }
}
