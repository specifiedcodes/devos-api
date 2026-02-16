import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScimToken } from '../../../../database/entities/scim-token.entity';
import { ScimConfiguration } from '../../../../database/entities/scim-configuration.entity';
import { SsoAuditService } from '../../sso-audit.service';
import { SsoAuditEventType } from '../../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../../redis/redis.service';
import { SCIM_CONSTANTS } from '../../constants/scim.constants';
import { ScimTokenService } from '../scim-token.service';

@Injectable()
export class ScimAuthGuard implements CanActivate {
  private readonly logger = new Logger(ScimAuthGuard.name);

  constructor(
    private readonly scimTokenService: ScimTokenService,
    @InjectRepository(ScimConfiguration)
    private readonly scimConfigRepository: Repository<ScimConfiguration>,
    private readonly ssoAuditService: SsoAuditService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 1. Extract Bearer token
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
        status: '401',
        detail: 'Missing or invalid Authorization header. Expected: Bearer <token>',
      });
    }

    const bearerToken = authHeader.substring(7);
    if (!bearerToken) {
      throw new UnauthorizedException({
        schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
        status: '401',
        detail: 'Empty bearer token',
      });
    }

    // 2. Validate token
    const tokenRecord = await this.scimTokenService.validateToken(bearerToken);

    if (!tokenRecord) {
      // Log auth failure
      void this.ssoAuditService.logEvent({
        workspaceId: 'unknown',
        eventType: SsoAuditEventType.SCIM_AUTH_FAILURE,
        ipAddress: this.getIpAddress(request),
        details: { reason: 'invalid_or_expired_token' },
      });

      throw new UnauthorizedException({
        schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
        status: '401',
        detail: 'Invalid or expired SCIM token',
      });
    }

    const workspaceId = tokenRecord.workspaceId;

    // 3. Verify SCIM is enabled for this workspace
    const scimConfig = await this.scimConfigRepository.findOne({
      where: { workspaceId },
    });

    if (!scimConfig || !scimConfig.enabled) {
      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.SCIM_AUTH_FAILURE,
        ipAddress: this.getIpAddress(request),
        details: { reason: 'scim_not_enabled' },
      });

      throw new UnauthorizedException({
        schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
        status: '401',
        detail: 'SCIM provisioning is not enabled for this workspace',
      });
    }

    // 4. Rate limiting
    const rateLimitKey = `${SCIM_CONSTANTS.RATE_LIMIT_KEY_PREFIX}${workspaceId}`;
    const currentCount = await this.redisService.increment(rateLimitKey, 1);

    if (currentCount === null) {
      // Redis unavailable - log warning but allow request (fail-open for availability)
      this.logger.warn(`Rate limiting unavailable for workspace ${workspaceId}: Redis returned null`);
    }

    if (currentCount === 1) {
      // First request in window - set expiry
      await this.redisService.expire(rateLimitKey, SCIM_CONSTANTS.RATE_LIMIT_WINDOW_SECONDS);
    }

    if (currentCount !== null && currentCount > SCIM_CONSTANTS.RATE_LIMIT_MAX_REQUESTS) {
      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.SCIM_RATE_LIMITED,
        ipAddress: this.getIpAddress(request),
        details: { currentCount },
      });

      throw new HttpException(
        {
          schemas: [SCIM_CONSTANTS.SCHEMAS.ERROR],
          status: '429',
          detail: 'Rate limit exceeded. Maximum 100 requests per minute.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 5. Update last_used_at (fire-and-forget)
    void this.scimTokenService.updateLastUsed(tokenRecord.id);

    // 6. Attach workspace context to request
    (request as any).scimWorkspaceId = workspaceId;
    (request as any).scimConfig = scimConfig;

    return true;
  }

  private getIpAddress(request: Request): string {
    return (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.socket.remoteAddress ||
      '';
  }
}
