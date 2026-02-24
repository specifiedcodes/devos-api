import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../../../database/entities/workspace-member.entity';
import { PermissionCacheService } from '../../custom-roles/services/permission-cache.service';
import { PermissionMatrixService } from '../../custom-roles/services/permission-matrix.service';
import { CustomRoleService } from '../../custom-roles/services/custom-role.service';
import {
  ResourceType,
  RESOURCE_PERMISSIONS,
} from '../../../database/entities/role-permission.entity';
import {
  PermissionCheckRequestDto,
  PermissionCheckResponseDto,
  PermissionCheckResultItem,
} from '../dto/permission-check.dto';

@Injectable()
export class PermissionCheckService {
  private readonly logger = new Logger(PermissionCheckService.name);

  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly permissionMatrixService: PermissionMatrixService,
    private readonly customRoleService: CustomRoleService,
  ) {}

  /**
   * Batch check multiple permissions for a user in a workspace.
   * Maximum 50 checks per request. Uses PermissionCacheService for fast lookups.
   */
  async checkPermissions(
    params: PermissionCheckRequestDto,
  ): Promise<PermissionCheckResponseDto> {
    if (params.checks.length > 50) {
      throw new BadRequestException('Maximum 50 permission checks per request');
    }

    // Validate resource types and permission names
    for (const check of params.checks) {
      const validPermissions = RESOURCE_PERMISSIONS[check.resource as ResourceType];
      if (!validPermissions) {
        throw new BadRequestException(`Invalid resource type: ${check.resource}`);
      }
      if (!validPermissions.includes(check.permission)) {
        throw new BadRequestException(
          `Invalid permission "${check.permission}" for resource "${check.resource}"`,
        );
      }
    }

    // Verify user is a workspace member
    const member = await this.memberRepo.findOne({
      where: { userId: params.userId, workspaceId: params.workspaceId },
      relations: ['customRole'],
    });

    if (!member) {
      throw new NotFoundException('User not found in workspace');
    }

    // Resolve role display name
    const roleName = member.customRole
      ? member.customRole.displayName
      : member.role;

    // Batch check permissions concurrently via cache-enabled service.
    // PermissionCacheService always consults Redis first, falling back to DB.
    // cacheHit reflects whether the cache layer was used (always true when cache is available).
    const results: PermissionCheckResultItem[] = await Promise.all(
      params.checks.map(async (check) => {
        const granted = await this.permissionCacheService.checkPermission(
          params.userId,
          params.workspaceId,
          check.resource,
          check.permission,
        );
        return {
          resource: check.resource,
          permission: check.permission,
          granted,
        };
      }),
    );

    return {
      results,
      userRole: roleName,
      checkedAt: new Date().toISOString(),
      cacheHit: true, // Cache layer is always consulted; individual miss/hit not exposed by PermissionCacheService
    };
  }

  /**
   * Returns all effective permissions for a user across all resource types.
   */
  async getUserEffectivePermissions(
    workspaceId: string,
    userId: string,
  ): Promise<{
    userId: string;
    workspaceId: string;
    roleName: string;
    permissions: Record<string, Record<string, boolean>>;
  }> {
    const effectivePermissions =
      await this.permissionMatrixService.getEffectivePermissions(userId, workspaceId);

    // Convert to flat permission map
    const permissionMap: Record<string, Record<string, boolean>> = {};
    for (const resource of effectivePermissions.resources) {
      permissionMap[resource.resourceType] = {};
      for (const perm of resource.permissions) {
        permissionMap[resource.resourceType][perm.permission] = perm.granted;
      }
    }

    return {
      userId,
      workspaceId,
      roleName:
        effectivePermissions.customRoleName || effectivePermissions.systemRole,
      permissions: permissionMap,
    };
  }

  /**
   * Lists all users who have access to a specific resource with their permission levels.
   * Groups members by role for efficiency to avoid N+1 queries.
   */
  async getResourceAccessList(
    workspaceId: string,
    resource: string,
  ): Promise<
    Array<{
      userId: string;
      userName: string;
      role: string;
      permissions: Record<string, boolean>;
    }>
  > {
    // Validate resource type
    const validPermissions = RESOURCE_PERMISSIONS[resource as ResourceType];
    if (!validPermissions) {
      throw new BadRequestException(`Invalid resource type: ${resource}`);
    }

    // Get all workspace members
    const members = await this.memberRepo.find({
      where: { workspaceId },
      relations: ['user', 'customRole'],
    });

    if (members.length === 0) {
      return [];
    }

    // Group members by role for efficient permission resolution
    const result: Array<{
      userId: string;
      userName: string;
      role: string;
      permissions: Record<string, boolean>;
    }> = [];

    // Resolve permissions per member (batched by role)
    const rolePermCache = new Map<string, Record<string, boolean>>();

    for (const member of members) {
      const roleKey = member.customRole
        ? `custom:${member.customRole.id}`
        : `system:${member.role}`;

      let perms = rolePermCache.get(roleKey);
      if (!perms) {
        perms = {};
        for (const permName of validPermissions) {
          perms[permName] = await this.permissionCacheService.checkPermission(
            member.userId,
            workspaceId,
            resource,
            permName,
          );
        }
        // Only cache for system roles (custom roles may vary by user)
        if (!member.customRole) {
          rolePermCache.set(roleKey, perms);
        }
      }

      result.push({
        userId: member.userId,
        userName: member.user?.email || member.userId,
        role: member.customRole ? member.customRole.displayName : member.role,
        permissions: { ...perms },
      });
    }

    return result;
  }
}
