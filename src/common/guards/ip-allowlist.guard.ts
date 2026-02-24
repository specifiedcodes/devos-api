import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IpAllowlistService } from '../../modules/ip-allowlist/services/ip-allowlist.service';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { extractClientIp } from '../utils/extract-client-ip';

export const SKIP_IP_CHECK_KEY = 'skip_ip_check';

/**
 * Guard that enforces IP allowlisting on workspace-scoped endpoints.
 *
 * Execution order in guard chain:
 *   JwtAuthGuard -> IpAllowlistGuard -> RoleGuard -> PermissionGuard -> Handler
 *
 * Behavior:
 * 1. If no workspaceId in request params/body, pass through (non-workspace endpoints)
 * 2. If @SkipIpCheck decorator is present, pass through
 * 3. If user is workspace owner, always allow (bypass for emergency access)
 * 4. Check IP via IpAllowlistService.checkIp()
 * 5. If not allowed, throw 403 and record blocked attempt
 * 6. If in grace period and would be denied, log warning but allow
 */
@Injectable()
export class IpAllowlistGuard implements CanActivate {
  private readonly logger = new Logger(IpAllowlistGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly ipAllowlistService: IpAllowlistService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check for @SkipIpCheck decorator
    const skipIpCheck = this.reflector.getAllAndOverride<boolean>(SKIP_IP_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipIpCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const workspaceId =
      request.params?.workspaceId ||
      request.params?.id ||
      request.body?.workspaceId;

    // No workspace context - pass through (auth endpoints, health checks, etc.)
    if (!workspaceId) {
      return true;
    }

    const userId = request.user?.id;
    const clientIp = extractClientIp(request);

    // Workspace owner always has access (emergency bypass)
    if (request.workspaceRole === WorkspaceRole.OWNER) {
      return true;
    }

    const result = await this.ipAllowlistService.checkIp(workspaceId, clientIp);

    if (result.allowed) {
      if (result.reason === 'grace_period_would_deny') {
        this.logger.warn(
          `IP ${clientIp} would be denied for workspace=${workspaceId} (grace period active)`,
        );
      }
      return true;
    }

    // IP not allowed - record and deny
    this.ipAllowlistService
      .recordBlockedAttempt(workspaceId, clientIp, userId, `${request.method} ${request.url}`)
      .catch(() => {});

    this.logger.warn(
      `IP denied: ip=${clientIp} workspace=${workspaceId} user=${userId} endpoint=${request.method} ${request.url}`,
    );

    throw new ForbiddenException({
      error: 'Access denied',
      message: 'Access denied: Your IP address is not allowed for this workspace',
      code: 'IP_NOT_ALLOWED',
    });
  }

}
