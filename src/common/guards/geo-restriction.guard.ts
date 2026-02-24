import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GeoRestrictionService } from '../../modules/geo-restriction/services/geo-restriction.service';
import { PermissionAuditService } from '../../modules/permission-audit/services/permission-audit.service';
import { PermissionAuditEventType } from '../../database/entities/permission-audit-event.entity';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { extractClientIp } from '../utils/extract-client-ip';

export const SKIP_GEO_CHECK_KEY = 'skip_geo_check';

/**
 * Guard that enforces geo-restriction on workspace-scoped endpoints.
 *
 * Execution order in guard chain:
 *   JwtAuthGuard -> IpAllowlistGuard -> GeoRestrictionGuard -> RoleGuard -> PermissionGuard -> Handler
 *
 * Behavior:
 * 1. If no workspaceId in request params/body, pass through (non-workspace endpoints)
 * 2. If @SkipGeoCheck decorator is present, pass through
 * 3. If user is workspace owner, always allow (bypass for emergency access)
 * 4. Check geo via GeoRestrictionService.checkGeo()
 * 5. If not allowed, throw 403 and record blocked attempt
 * 6. If in log-only mode and would be denied, log warning but allow
 */
@Injectable()
export class GeoRestrictionGuard implements CanActivate {
  private readonly logger = new Logger(GeoRestrictionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly geoRestrictionService: GeoRestrictionService,
    private readonly permissionAuditService: PermissionAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check for @SkipGeoCheck decorator
    const skipGeoCheck = this.reflector.getAllAndOverride<boolean>(SKIP_GEO_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipGeoCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    // Only extract workspaceId from URL params to prevent body injection attacks
    const workspaceId =
      request.params?.workspaceId ||
      request.params?.id;

    // No workspace context - pass through (auth endpoints, health checks, etc.)
    if (!workspaceId) {
      return true;
    }

    const userId = request.user?.id;
    const clientIp = extractClientIp(request);

    // Workspace owner always has access (bypass for emergency access)
    if (request.workspaceRole === WorkspaceRole.OWNER) {
      return true;
    }

    const result = await this.geoRestrictionService.checkGeo(workspaceId, clientIp);

    if (result.allowed) {
      if (result.reason === 'log_only_would_deny') {
        this.logger.warn(
          `Geo would deny: ip=${clientIp} country=${result.detectedCountry} workspace=${workspaceId} (log-only mode)`,
        );
        // Record as a "would be blocked" attempt for monitoring
        this.geoRestrictionService
          .recordBlockedAttempt(workspaceId, clientIp, userId, result.detectedCountry, `${request.method} ${request.url}`)
          .catch(() => {});
      }
      return true;
    }

    // Geo not allowed - record and deny
    this.geoRestrictionService
      .recordBlockedAttempt(workspaceId, clientIp, userId, result.detectedCountry, `${request.method} ${request.url}`)
      .catch(() => {});

    // Permission audit trail (fire-and-forget)
    this.permissionAuditService
      .record({
        workspaceId,
        eventType: PermissionAuditEventType.ACCESS_DENIED_GEO,
        actorId: userId || 'unknown',
        beforeState: null,
        afterState: {
          clientIp,
          detectedCountry: result.detectedCountry,
          endpoint: `${request.method} ${request.url}`,
        },
        ipAddress: clientIp,
      })
      .catch(() => {});

    this.logger.warn(
      `Geo denied: ip=${clientIp} country=${result.detectedCountry} workspace=${workspaceId} user=${userId} endpoint=${request.method} ${request.url}`,
    );

    throw new ForbiddenException({
      error: 'Access denied',
      message: 'Access restricted from your location',
      code: 'GEO_RESTRICTED',
    });
  }
}
