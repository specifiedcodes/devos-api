import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuditService, AuditAction } from '../audit/audit.service';

/**
 * Guard to validate that authenticated user has access to the requested workspace
 *
 * This guard checks that:
 * 1. User is authenticated (req.user exists)
 * 2. The :workspaceId URL parameter matches the user's workspace
 *
 * Apply to controllers/routes that have :workspaceId parameter
 */
@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    @Inject(forwardRef(() => AuditService))
    private readonly auditService: AuditService,
  ) {}
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const workspaceIdParam = request.params.workspaceId;

    // Check if user is authenticated
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Check if workspace ID parameter exists
    if (!workspaceIdParam) {
      // If no workspace param, allow (not all routes need workspace validation)
      return true;
    }

    // Validate user has access to this workspace
    // Option 1: User belongs to a single workspace
    if (user.workspaceId && user.workspaceId !== workspaceIdParam) {
      // Log permission denied (Task 6.1)
      this.auditService
        .log(
          workspaceIdParam,
          user.sub || user.id,
          AuditAction.PERMISSION_DENIED,
          'workspace',
          workspaceIdParam,
          {
            reason: 'User does not belong to workspace',
            attemptedWorkspaceId: workspaceIdParam,
            userWorkspaceId: user.workspaceId,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
        )
        .catch(() => {}); // Don't fail main operation

      throw new ForbiddenException(
        'Access denied: You do not have permission to access this workspace',
      );
    }

    // Option 2: User belongs to multiple workspaces (check array)
    if (
      user.workspaces &&
      Array.isArray(user.workspaces) &&
      !user.workspaces.includes(workspaceIdParam)
    ) {
      // Log permission denied (Task 6.1)
      this.auditService
        .log(
          workspaceIdParam,
          user.sub || user.id,
          AuditAction.PERMISSION_DENIED,
          'workspace',
          workspaceIdParam,
          {
            reason: 'User does not belong to workspace (multi-workspace check)',
            attemptedWorkspaceId: workspaceIdParam,
            userWorkspaces: user.workspaces,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
        )
        .catch(() => {}); // Don't fail main operation

      throw new ForbiddenException(
        'Access denied: You do not have permission to access this workspace',
      );
    }

    // If neither check fails, allow access
    return true;
  }
}
