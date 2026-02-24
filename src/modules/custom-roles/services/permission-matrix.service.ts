import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  RolePermission,
  ResourceType,
  RESOURCE_PERMISSIONS,
  BASE_ROLE_DEFAULTS,
} from '../../../database/entities/role-permission.entity';
import { CustomRole } from '../../../database/entities/custom-role.entity';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../../../database/entities/workspace-member.entity';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { SetPermissionDto } from '../dto/set-permission.dto';
import {
  PermissionMatrixResponseDto,
  PermissionEntryDto,
  ResourcePermissionsDto,
  EffectivePermissionsResponseDto,
} from '../dto/permission-matrix-response.dto';

@Injectable()
export class PermissionMatrixService {
  private readonly logger = new Logger(PermissionMatrixService.name);

  constructor(
    @InjectRepository(RolePermission)
    private readonly permissionRepo: Repository<RolePermission>,
    @InjectRepository(CustomRole)
    private readonly customRoleRepo: Repository<CustomRole>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepo: Repository<WorkspaceMember>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get the full permission matrix for a custom role.
   * Merges explicit role_permissions with inherited base_role defaults.
   * Permission resolution: Explicit > Inherited > Default Deny.
   */
  async getPermissionMatrix(
    roleId: string,
    workspaceId: string,
  ): Promise<PermissionMatrixResponseDto> {
    const role = await this.loadAndValidateRole(roleId, workspaceId, false);

    // Load all explicit permissions for this role
    const explicitPermissions = await this.permissionRepo.find({
      where: { roleId },
    });

    // Build a lookup map: `${resourceType}:${permission}` -> RolePermission
    const explicitMap = new Map<string, RolePermission>();
    for (const perm of explicitPermissions) {
      explicitMap.set(`${perm.resourceType}:${perm.permission}`, perm);
    }

    // Build the matrix by iterating over all resource types and permissions
    const resources: ResourcePermissionsDto[] = [];

    for (const resourceType of Object.values(ResourceType)) {
      const permissionNames = RESOURCE_PERMISSIONS[resourceType];
      const permissions: PermissionEntryDto[] = [];

      for (const permName of permissionNames) {
        const key = `${resourceType}:${permName}`;
        const explicit = explicitMap.get(key);

        if (explicit) {
          // Explicit permission overrides inherited
          permissions.push({
            permission: permName,
            granted: explicit.granted,
            inherited: false,
          });
        } else {
          // Use inherited from base role
          const inherited = this.getInheritedPermission(
            role.baseRole,
            resourceType,
            permName,
          );
          permissions.push({
            permission: permName,
            granted: inherited.granted,
            inherited: inherited.inherited,
            inheritedFrom: inherited.inheritedFrom,
          });
        }
      }

      resources.push({ resourceType, permissions });
    }

    return {
      roleId: role.id,
      roleName: role.name,
      displayName: role.displayName,
      baseRole: role.baseRole,
      resources,
    };
  }

  /**
   * Set a single permission for a custom role.
   */
  async setPermission(
    roleId: string,
    workspaceId: string,
    dto: SetPermissionDto,
    actorId: string,
  ): Promise<RolePermission> {
    const role = await this.loadAndValidateRole(roleId, workspaceId);

    // Validate the permission combination
    this.validatePermission(dto.resourceType, dto.permission);

    // Check if an explicit permission already exists
    let existing = await this.permissionRepo.findOne({
      where: {
        roleId,
        resourceType: dto.resourceType,
        permission: dto.permission,
      },
    });

    const beforeState = existing ? { granted: existing.granted } : null;

    if (existing) {
      existing.granted = dto.granted;
      existing = await this.permissionRepo.save(existing);
    } else {
      existing = this.permissionRepo.create({
        roleId,
        resourceType: dto.resourceType,
        permission: dto.permission,
        granted: dto.granted,
      });
      existing = await this.permissionRepo.save(existing);
    }

    // Audit log (fire-and-forget)
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'role_permission',
        roleId,
        {
          action: 'set_permission',
          roleName: role.name,
          resourceType: dto.resourceType,
          permission: dto.permission,
          before: beforeState,
          after: { granted: dto.granted },
        },
      )
      .catch(() => {});

    this.logger.log(
      `Set permission ${dto.resourceType}:${dto.permission}=${dto.granted} for role "${role.name}" (${roleId})`,
    );

    return existing;
  }

  /**
   * Set multiple permissions for a custom role in bulk.
   * All-or-nothing within transaction.
   */
  async setBulkPermissions(
    roleId: string,
    workspaceId: string,
    permissions: SetPermissionDto[],
    actorId: string,
  ): Promise<RolePermission[]> {
    if (!permissions || permissions.length === 0) {
      throw new BadRequestException('At least one permission is required for bulk update');
    }

    const role = await this.loadAndValidateRole(roleId, workspaceId);

    // Validate all permissions before applying any
    for (const perm of permissions) {
      this.validatePermission(perm.resourceType, perm.permission);
    }

    const results = await this.dataSource.transaction(async (manager) => {
      const saved: RolePermission[] = [];

      for (const perm of permissions) {
        let existing = await manager.findOne(RolePermission, {
          where: {
            roleId,
            resourceType: perm.resourceType,
            permission: perm.permission,
          },
        });

        if (existing) {
          existing.granted = perm.granted;
          saved.push(await manager.save(existing));
        } else {
          const newPerm = manager.create(RolePermission, {
            roleId,
            resourceType: perm.resourceType,
            permission: perm.permission,
            granted: perm.granted,
          });
          saved.push(await manager.save(newPerm));
        }
      }

      return saved;
    });

    // Audit log (fire-and-forget)
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'role_permission',
        roleId,
        {
          action: 'set_bulk_permissions',
          roleName: role.name,
          permissionCount: permissions.length,
          permissions: permissions.map((p) => ({
            resourceType: p.resourceType,
            permission: p.permission,
            granted: p.granted,
          })),
        },
      )
      .catch(() => {});

    this.logger.log(
      `Set ${permissions.length} bulk permissions for role "${role.name}" (${roleId})`,
    );

    return results;
  }

  /**
   * Set all permissions for a specific resource type to allow or deny.
   */
  async bulkResourceAction(
    roleId: string,
    workspaceId: string,
    resourceType: ResourceType,
    action: 'allow_all' | 'deny_all',
    actorId: string,
  ): Promise<void> {
    const role = await this.loadAndValidateRole(roleId, workspaceId);

    // Validate resource type
    if (!RESOURCE_PERMISSIONS[resourceType]) {
      throw new BadRequestException(`Invalid resource type: ${resourceType}`);
    }

    const permissionNames = RESOURCE_PERMISSIONS[resourceType];
    const granted = action === 'allow_all';

    await this.dataSource.transaction(async (manager) => {
      // Batch load all existing permissions for this resource type to avoid N+1 queries
      const existingPermissions = await manager.find(RolePermission, {
        where: { roleId, resourceType },
      });
      const existingMap = new Map<string, RolePermission>();
      for (const perm of existingPermissions) {
        existingMap.set(perm.permission, perm);
      }

      const toSave: RolePermission[] = [];
      for (const permName of permissionNames) {
        const existing = existingMap.get(permName);
        if (existing) {
          existing.granted = granted;
          toSave.push(existing);
        } else {
          toSave.push(
            manager.create(RolePermission, {
              roleId,
              resourceType,
              permission: permName,
              granted,
            }),
          );
        }
      }
      await manager.save(toSave);
    });

    // Audit log (fire-and-forget)
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'role_permission',
        roleId,
        {
          action: 'bulk_resource_action',
          roleName: role.name,
          resourceType,
          bulkAction: action,
          permissionCount: permissionNames.length,
        },
      )
      .catch(() => {});

    this.logger.log(
      `Applied ${action} for resource "${resourceType}" on role "${role.name}" (${roleId})`,
    );
  }

  /**
   * Reset permissions for a role back to base role defaults.
   * Deletes explicit overrides so inherited defaults take effect.
   */
  async resetPermissions(
    roleId: string,
    workspaceId: string,
    resourceType: string | undefined,
    actorId: string,
  ): Promise<void> {
    const role = await this.loadAndValidateRole(roleId, workspaceId);

    await this.dataSource.transaction(async (manager) => {
      if (resourceType) {
        // Validate resource type
        if (!RESOURCE_PERMISSIONS[resourceType as ResourceType]) {
          throw new BadRequestException(`Invalid resource type: ${resourceType}`);
        }
        // Delete explicit permissions for this resource type only
        await manager.delete(RolePermission, { roleId, resourceType });
      } else {
        // Delete all explicit permissions for this role
        await manager.delete(RolePermission, { roleId });
      }
    });

    // Audit log (fire-and-forget)
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'role_permission',
        roleId,
        {
          action: 'reset_permissions',
          roleName: role.name,
          resourceType: resourceType || 'all',
        },
      )
      .catch(() => {});

    this.logger.log(
      `Reset permissions for role "${role.name}" (${roleId}), resource: ${resourceType || 'all'}`,
    );
  }

  /**
   * Get effective permissions for a user in a workspace.
   * Resolution: Custom role explicit > Custom role inherited > System role defaults > Deny.
   * Owner system role ALWAYS has full access.
   */
  async getEffectivePermissions(
    userId: string,
    workspaceId: string,
  ): Promise<EffectivePermissionsResponseDto> {
    const member = await this.workspaceMemberRepo.findOne({
      where: { userId, workspaceId },
      relations: ['customRole'],
    });

    if (!member) {
      throw new NotFoundException('User not found in workspace');
    }

    const systemRole = member.role;
    const customRole = member.customRole || null;

    const resources: ResourcePermissionsDto[] = [];

    // Owner always has full access
    if (systemRole === WorkspaceRole.OWNER) {
      for (const resourceType of Object.values(ResourceType)) {
        const permissionNames = RESOURCE_PERMISSIONS[resourceType];
        const permissions: PermissionEntryDto[] = permissionNames.map((p) => ({
          permission: p,
          granted: true,
          inherited: true,
          inheritedFrom: 'owner',
        }));
        resources.push({ resourceType, permissions });
      }

      return {
        userId,
        workspaceId,
        systemRole,
        customRoleId: customRole?.id || null,
        customRoleName: customRole?.displayName || null,
        resources,
      };
    }

    if (customRole) {
      // Load explicit permissions for the custom role
      const explicitPermissions = await this.permissionRepo.find({
        where: { roleId: customRole.id },
      });

      const explicitMap = new Map<string, RolePermission>();
      for (const perm of explicitPermissions) {
        explicitMap.set(`${perm.resourceType}:${perm.permission}`, perm);
      }

      for (const resourceType of Object.values(ResourceType)) {
        const permissionNames = RESOURCE_PERMISSIONS[resourceType];
        const permissions: PermissionEntryDto[] = [];

        for (const permName of permissionNames) {
          const key = `${resourceType}:${permName}`;
          const explicit = explicitMap.get(key);

          if (explicit) {
            permissions.push({
              permission: permName,
              granted: explicit.granted,
              inherited: false,
            });
          } else {
            const inherited = this.getInheritedPermission(
              customRole.baseRole,
              resourceType,
              permName,
            );
            permissions.push({
              permission: permName,
              granted: inherited.granted,
              inherited: inherited.inherited,
              inheritedFrom: inherited.inheritedFrom,
            });
          }
        }

        resources.push({ resourceType, permissions });
      }
    } else {
      // No custom role - use system role defaults
      for (const resourceType of Object.values(ResourceType)) {
        const permissionNames = RESOURCE_PERMISSIONS[resourceType];
        const permissions: PermissionEntryDto[] = [];

        for (const permName of permissionNames) {
          const inherited = this.getInheritedPermission(
            systemRole,
            resourceType,
            permName,
          );
          permissions.push({
            permission: permName,
            granted: inherited.granted,
            inherited: inherited.inherited,
            inheritedFrom: inherited.inheritedFrom,
          });
        }

        resources.push({ resourceType, permissions });
      }
    }

    return {
      userId,
      workspaceId,
      systemRole,
      customRoleId: customRole?.id || null,
      customRoleName: customRole?.displayName || null,
      resources,
    };
  }

  /**
   * Check if a user has a specific permission in a workspace.
   * Resolution: Owner always true > Custom role explicit > Custom role inherited > System role default > Deny.
   */
  async checkPermission(
    userId: string,
    workspaceId: string,
    resourceType: string,
    permission: string,
  ): Promise<boolean> {
    const member = await this.workspaceMemberRepo.findOne({
      where: { userId, workspaceId },
      relations: ['customRole'],
    });

    if (!member) {
      return false;
    }

    // 1. System Owner role -> always true
    if (member.role === WorkspaceRole.OWNER) {
      return true;
    }

    // 2. Custom role with explicit permission
    if (member.customRole) {
      const explicit = await this.permissionRepo.findOne({
        where: {
          roleId: member.customRole.id,
          resourceType,
          permission,
        },
      });

      if (explicit) {
        return explicit.granted;
      }

      // 3. Custom role base_role inherited
      const baseRole = member.customRole.baseRole;
      if (baseRole && BASE_ROLE_DEFAULTS[baseRole]) {
        const resourceDefaults = BASE_ROLE_DEFAULTS[baseRole][resourceType];
        if (resourceDefaults && permission in resourceDefaults) {
          return resourceDefaults[permission];
        }
      }

      // No base role or no default -> deny
      return false;
    }

    // 4. System role (no custom role) -> return system role default
    const systemRole = member.role;
    if (BASE_ROLE_DEFAULTS[systemRole]) {
      const resourceDefaults = BASE_ROLE_DEFAULTS[systemRole][resourceType];
      if (resourceDefaults && permission in resourceDefaults) {
        return resourceDefaults[permission];
      }
    }

    // 5. Default -> deny
    return false;
  }

  /**
   * Get available resource types and their permissions.
   * Returns a deep copy to prevent mutation of the original RESOURCE_PERMISSIONS.
   */
  getResourceDefinitions(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(RESOURCE_PERMISSIONS)) {
      result[key] = [...value];
    }
    return result;
  }

  /**
   * Get base role defaults for display in UI.
   * Returns a deep copy to prevent mutation of the original BASE_ROLE_DEFAULTS.
   */
  getBaseRoleDefaults(): Record<string, Record<string, Record<string, boolean>>> {
    return JSON.parse(JSON.stringify(BASE_ROLE_DEFAULTS));
  }

  /**
   * Validate that a resourceType and permission combination is valid.
   */
  private validatePermission(resourceType: string, permission: string): void {
    const validPermissions = RESOURCE_PERMISSIONS[resourceType as ResourceType];
    if (!validPermissions) {
      throw new BadRequestException(
        `Invalid resource type: ${resourceType}. Valid types: ${Object.values(ResourceType).join(', ')}`,
      );
    }

    if (!validPermissions.includes(permission)) {
      throw new BadRequestException(
        `Invalid permission "${permission}" for resource type "${resourceType}". Valid permissions: ${validPermissions.join(', ')}`,
      );
    }
  }

  /**
   * Get the inherited permission value from a base role.
   */
  private getInheritedPermission(
    baseRole: string | null,
    resourceType: string,
    permission: string,
  ): { granted: boolean; inherited: boolean; inheritedFrom?: string } {
    if (!baseRole || !BASE_ROLE_DEFAULTS[baseRole]) {
      return { granted: false, inherited: false };
    }

    const resourceDefaults = BASE_ROLE_DEFAULTS[baseRole][resourceType];
    if (!resourceDefaults || !(permission in resourceDefaults)) {
      return { granted: false, inherited: false };
    }

    return {
      granted: resourceDefaults[permission],
      inherited: true,
      inheritedFrom: baseRole,
    };
  }

  /**
   * Load a custom role and validate it belongs to the workspace.
   * Optionally validates it is not a system role (default true).
   */
  private async loadAndValidateRole(
    roleId: string,
    workspaceId: string,
    rejectSystem: boolean = true,
  ): Promise<CustomRole> {
    const role = await this.customRoleRepo.findOne({
      where: { id: roleId, workspaceId },
    });

    if (!role) {
      throw new NotFoundException('Custom role not found');
    }

    if (rejectSystem && role.isSystem) {
      throw new BadRequestException(
        'System role permissions cannot be modified. System roles use fixed permission defaults.',
      );
    }

    return role;
  }
}
