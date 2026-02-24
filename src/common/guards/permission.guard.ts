import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/permission.decorator';
import { PermissionCacheService } from '../../modules/custom-roles/services/permission-cache.service';
import { AuditService, AuditAction } from '../../shared/audit/audit.service';

export interface RequiredPermission {
  resource: string;
  action: string;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(forwardRef(() => PermissionCacheService))
    private readonly permissionCacheService: PermissionCacheService,
    @Inject(forwardRef(() => AuditService))
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Read required permission from decorator metadata
    const requiredPermission = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @Permission decorator, allow (guard is a no-op for undecorated endpoints)
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    // Extract workspaceId from params or body. Intentionally NOT falling back to
    // params.id to avoid treating non-workspace entity IDs (e.g., user ID, project ID)
    // as workspace context, which could cause permission checks against wrong workspaces.
    const workspaceId =
      request.params?.workspaceId ||
      request.body?.workspaceId ||
      request.query?.workspaceId;

    if (!userId || !workspaceId) {
      throw new ForbiddenException('Missing user or workspace context');
    }

    // 2. Check permission via cache-first service (Redis -> DB fallback)
    const granted = await this.permissionCacheService.checkPermission(
      userId,
      workspaceId,
      requiredPermission.resource,
      requiredPermission.action,
    );

    if (!granted) {
      // Use request.path (not request.url) to avoid logging query parameters
      // which may contain sensitive data (tokens, session IDs, etc.)
      const sanitizedPath = request.path || request.url?.split('?')[0] || 'unknown';

      // Log permission denial (fire-and-forget)
      this.auditService
        .log(
          workspaceId,
          userId,
          AuditAction.UNAUTHORIZED_ACCESS_ATTEMPT,
          'permission_enforcement',
          workspaceId,
          {
            reason: 'insufficient_permission',
            required: `${requiredPermission.resource}:${requiredPermission.action}`,
            endpoint: sanitizedPath,
            method: request.method,
            ipAddress: request.ip,
          },
        )
        .catch(() => {});

      this.logger.warn(
        `Permission denied: user=${userId} workspace=${workspaceId} ` +
        `required=${requiredPermission.resource}:${requiredPermission.action} ` +
        `endpoint=${request.method} ${sanitizedPath}`,
      );

      throw new ForbiddenException({
        error: 'Insufficient permissions',
        required: `${requiredPermission.resource}:${requiredPermission.action}`,
        message: 'You do not have permission to perform this action',
      });
    }

    // Attach permission info to request for downstream use
    request.checkedPermission = requiredPermission;

    return true;
  }
}
