import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../../database/entities/workspace-member.entity';
import {
  SecurityEvent,
  SecurityEventType,
} from '../../database/entities/security-event.entity';
import { AuditService, AuditAction } from '../../shared/audit/audit.service';
import { Inject, forwardRef } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const RequireRole = (...roles: WorkspaceRole[]) =>
  SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(WorkspaceMember)
    private workspaceMemberRepository: Repository<WorkspaceMember>,
    @InjectRepository(SecurityEvent)
    private securityEventRepository: Repository<SecurityEvent>,
    @Inject(forwardRef(() => AuditService))
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<WorkspaceRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true; // No role requirement
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const workspaceId = request.params.workspaceId || request.params.id || request.body?.workspaceId;

    if (!userId || !workspaceId) {
      throw new ForbiddenException('Missing user or workspace context');
    }

    // Check workspace membership
    const membership = await this.workspaceMemberRepository.findOne({
      where: { userId, workspaceId },
    });

    if (!membership) {
      // Log permission denial
      await this.securityEventRepository.save({
        user_id: userId,
        event_type: SecurityEventType.PERMISSION_DENIED,
        reason: 'not_workspace_member',
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
        metadata: {
          workspaceId,
          requiredRoles,
        },
      } as any);

      throw new ForbiddenException('You are not a member of this workspace');
    }

    // Check role permission
    if (!requiredRoles.includes(membership.role)) {
      // Log permission denial
      await this.securityEventRepository.save({
        user_id: userId,
        event_type: SecurityEventType.PERMISSION_DENIED,
        reason: 'insufficient_role',
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
        metadata: {
          workspaceId,
          userRole: membership.role,
          requiredRoles,
        },
      } as any);

      // Log to audit log (Task 6.2)
      this.auditService
        .log(
          workspaceId,
          userId,
          AuditAction.UNAUTHORIZED_ACCESS_ATTEMPT,
          'workspace',
          workspaceId,
          {
            reason: 'insufficient_role',
            userRole: membership.role,
            requiredRoles,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            endpoint: request.url,
          },
        )
        .catch(() => {}); // Don't fail main operation

      throw new ForbiddenException('Insufficient permissions for this action');
    }

    // Attach role to request for later use
    request.workspaceRole = membership.role;

    return true;
  }
}
