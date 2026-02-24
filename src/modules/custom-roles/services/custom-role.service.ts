import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import {
  CustomRole,
  BaseRole,
} from '../../../database/entities/custom-role.entity';
import { RolePermission } from '../../../database/entities/role-permission.entity';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../../../database/entities/workspace-member.entity';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { PermissionCacheService } from './permission-cache.service';
import { CreateCustomRoleDto } from '../dto/create-custom-role.dto';
import { UpdateCustomRoleDto } from '../dto/update-custom-role.dto';
import { CloneCustomRoleDto } from '../dto/clone-custom-role.dto';

/** Maximum custom roles per workspace */
const MAX_CUSTOM_ROLES_PER_WORKSPACE = 20;

/** System role names that cannot be used for custom roles */
const RESERVED_ROLE_NAMES = ['owner', 'admin', 'developer', 'viewer'];

/** Available icon names for role selection */
export const AVAILABLE_ICONS = [
  'shield',
  'key',
  'lock',
  'user',
  'users',
  'star',
  'crown',
  'settings',
  'code',
  'eye',
  'edit',
  'terminal',
  'database',
  'server',
  'globe',
  'briefcase',
  'clipboard',
  'check-circle',
  'alert-triangle',
  'zap',
] as const;

export interface CustomRoleWithMemberCount extends CustomRole {
  memberCount: number;
}

export interface SystemRoleInfo {
  name: string;
  displayName: string;
  description: string;
  color: string;
  icon: string;
  isSystem: true;
  memberCount: number;
}

@Injectable()
export class CustomRoleService {
  private readonly logger = new Logger(CustomRoleService.name);

  constructor(
    @InjectRepository(CustomRole)
    private readonly customRoleRepo: Repository<CustomRole>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepo: Repository<WorkspaceMember>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => PermissionCacheService))
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  /**
   * List all roles for a workspace (system roles + custom roles).
   * System roles are always listed first, followed by custom roles in priority order.
   * Each role includes a member count.
   */
  async listRoles(workspaceId: string): Promise<{
    systemRoles: SystemRoleInfo[];
    customRoles: CustomRoleWithMemberCount[];
  }> {
    const [systemRoles, customRoles] = await Promise.all([
      this.buildSystemRoles(workspaceId),
      this.getCustomRolesWithMemberCounts(workspaceId),
    ]);

    return { systemRoles, customRoles };
  }

  /**
   * Get a single custom role by ID with member count.
   * Throws NotFoundException if role not found or belongs to different workspace.
   */
  async getRole(
    roleId: string,
    workspaceId: string,
  ): Promise<CustomRoleWithMemberCount> {
    const role = await this.customRoleRepo.findOne({
      where: { id: roleId, workspaceId },
      relations: ['creator'],
    });

    if (!role) {
      throw new NotFoundException(`Custom role not found`);
    }

    const memberCount = await this.workspaceMemberRepo.count({
      where: { workspaceId, customRoleId: roleId },
    });

    return {
      ...role,
      memberCount,
      creatorName: role.creator?.email,
    } as CustomRoleWithMemberCount;
  }

  /**
   * Create a new custom role in a workspace.
   */
  async createRole(
    workspaceId: string,
    dto: CreateCustomRoleDto,
    actorId: string,
  ): Promise<CustomRole> {
    // Validate role name (can be checked outside transaction since unique constraint is the real guard)
    await this.validateRoleName(dto.name, workspaceId);

    // Use transaction to prevent TOCTOU race on role count
    const saved = await this.dataSource.transaction(async (manager) => {
      const currentCount = await manager.count(CustomRole, {
        where: { workspaceId },
      });
      if (currentCount >= MAX_CUSTOM_ROLES_PER_WORKSPACE) {
        throw new BadRequestException(
          `Maximum of ${MAX_CUSTOM_ROLES_PER_WORKSPACE} custom roles per workspace reached`,
        );
      }

      // Determine next priority order
      const maxPriority = await manager
        .createQueryBuilder(CustomRole, 'role')
        .select('MAX(role.priority)', 'maxPriority')
        .where('role.workspaceId = :workspaceId', { workspaceId })
        .getRawOne();

      const nextPriority = (maxPriority?.maxPriority ?? -1) + 1;

      const role = manager.create(CustomRole, {
        workspaceId,
        name: dto.name,
        displayName: dto.displayName,
        description: dto.description || null,
        color: dto.color || '#6366f1',
        icon: dto.icon || 'shield',
        baseRole: dto.baseRole || null,
        isSystem: false,
        isActive: true,
        priority: nextPriority,
        createdBy: actorId,
      });

      return manager.save(role);
    });

    // Audit log (fire-and-forget, outside transaction)
    this.auditService
      .log(workspaceId, actorId, AuditAction.CREATE, 'custom_role', saved.id, {
        roleName: saved.name,
        displayName: saved.displayName,
        baseRole: saved.baseRole,
      })
      .catch(() => {});

    this.logger.log(
      `Created custom role "${saved.name}" (${saved.id}) in workspace ${workspaceId}`,
    );

    return saved;
  }

  /**
   * Update an existing custom role.
   */
  async updateRole(
    roleId: string,
    workspaceId: string,
    dto: UpdateCustomRoleDto,
    actorId: string,
  ): Promise<CustomRole> {
    const role = await this.customRoleRepo.findOne({
      where: { id: roleId, workspaceId },
    });

    if (!role) {
      throw new NotFoundException(`Custom role not found`);
    }

    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be modified');
    }

    // If name changed, validate new name
    if (dto.name && dto.name !== role.name) {
      await this.validateRoleName(dto.name, workspaceId, roleId);
    }

    // Capture before state for audit
    const beforeState = { ...role };

    // Apply updates
    if (dto.name !== undefined) role.name = dto.name;
    if (dto.displayName !== undefined) role.displayName = dto.displayName;
    if (dto.description !== undefined) role.description = dto.description || null;
    if (dto.color !== undefined) role.color = dto.color;
    if (dto.icon !== undefined) role.icon = dto.icon;
    if (dto.baseRole !== undefined) role.baseRole = dto.baseRole || null;
    if (dto.isActive !== undefined) role.isActive = dto.isActive;

    const saved = await this.customRoleRepo.save(role);

    // Audit log with before/after
    this.auditService
      .log(workspaceId, actorId, AuditAction.UPDATE, 'custom_role', saved.id, {
        before: {
          name: beforeState.name,
          displayName: beforeState.displayName,
          description: beforeState.description,
          color: beforeState.color,
          icon: beforeState.icon,
          baseRole: beforeState.baseRole,
          isActive: beforeState.isActive,
        },
        after: {
          name: saved.name,
          displayName: saved.displayName,
          description: saved.description,
          color: saved.color,
          icon: saved.icon,
          baseRole: saved.baseRole,
          isActive: saved.isActive,
        },
      })
      .catch(() => {});

    // Invalidate permission cache if baseRole changed (permissions effectively change)
    if (dto.baseRole !== undefined && beforeState.baseRole !== saved.baseRole) {
      this.permissionCacheService
        .invalidateRolePermissions(workspaceId)
        .catch(() => {});
    }

    this.logger.log(
      `Updated custom role "${saved.name}" (${saved.id}) in workspace ${workspaceId}`,
    );

    return saved;
  }

  /**
   * Delete a custom role.
   */
  async deleteRole(
    roleId: string,
    workspaceId: string,
    actorId: string,
  ): Promise<void> {
    const role = await this.customRoleRepo.findOne({
      where: { id: roleId, workspaceId },
    });

    if (!role) {
      throw new NotFoundException(`Custom role not found`);
    }

    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be deleted');
    }

    // Check for assigned members
    const memberCount = await this.workspaceMemberRepo.count({
      where: { workspaceId, customRoleId: roleId },
    });

    if (memberCount > 0) {
      throw new BadRequestException(
        `Cannot delete role with ${memberCount} assigned member(s). Reassign members first.`,
      );
    }

    await this.customRoleRepo.remove(role);

    // Audit log
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.DELETE,
        'custom_role',
        roleId,
        {
          roleName: role.name,
          displayName: role.displayName,
        },
      )
      .catch(() => {});

    // Invalidate permission cache for the workspace (fire-and-forget)
    this.permissionCacheService
      .invalidateRolePermissions(workspaceId)
      .catch(() => {});

    this.logger.log(
      `Deleted custom role "${role.name}" (${roleId}) from workspace ${workspaceId}`,
    );
  }

  /**
   * Clone an existing role (custom or system base) as a new custom role.
   */
  async cloneRole(
    sourceRoleId: string,
    workspaceId: string,
    dto: CloneCustomRoleDto,
    actorId: string,
  ): Promise<CustomRole> {
    const sourceRole = await this.customRoleRepo.findOne({
      where: { id: sourceRoleId, workspaceId },
    });

    if (!sourceRole) {
      throw new NotFoundException(`Source role not found`);
    }

    // Validate new name (can be checked outside transaction since unique constraint is the real guard)
    await this.validateRoleName(dto.name, workspaceId);

    // Use transaction to prevent TOCTOU race on role count
    const { savedClone: saved, permissionsCopiedCount } = await this.dataSource.transaction(async (manager) => {
      const currentCount = await manager.count(CustomRole, {
        where: { workspaceId },
      });
      if (currentCount >= MAX_CUSTOM_ROLES_PER_WORKSPACE) {
        throw new BadRequestException(
          `Maximum of ${MAX_CUSTOM_ROLES_PER_WORKSPACE} custom roles per workspace reached`,
        );
      }

      // Determine next priority order
      const maxPriority = await manager
        .createQueryBuilder(CustomRole, 'role')
        .select('MAX(role.priority)', 'maxPriority')
        .where('role.workspaceId = :workspaceId', { workspaceId })
        .getRawOne();

      const nextPriority = (maxPriority?.maxPriority ?? -1) + 1;

      const cloned = manager.create(CustomRole, {
        workspaceId,
        name: dto.name,
        displayName: dto.displayName,
        description: dto.description || sourceRole.description,
        color: sourceRole.color,
        icon: sourceRole.icon,
        baseRole: sourceRole.baseRole,
        isSystem: false,
        isActive: true,
        priority: nextPriority,
        createdBy: actorId,
      });

      const savedClone = await manager.save(cloned);

      // Copy explicit permissions from source role to cloned role
      const sourcePermissions = await manager.find(RolePermission, {
        where: { roleId: sourceRoleId },
      });

      if (sourcePermissions.length > 0) {
        const clonedPermissions = sourcePermissions.map((perm) =>
          manager.create(RolePermission, {
            roleId: savedClone.id,
            resourceType: perm.resourceType,
            permission: perm.permission,
            granted: perm.granted,
          }),
        );
        await manager.save(clonedPermissions);
      }

      return { savedClone, permissionsCopiedCount: sourcePermissions.length };
    });

    // Audit log (fire-and-forget, outside transaction)
    this.auditService
      .log(workspaceId, actorId, AuditAction.CREATE, 'custom_role', saved.id, {
        action: 'clone',
        sourceRoleId,
        sourceRoleName: sourceRole.name,
        clonedRoleName: saved.name,
        permissionsCopied: permissionsCopiedCount > 0,
        permissionsCopiedCount,
      })
      .catch(() => {});

    this.logger.log(
      `Cloned custom role "${sourceRole.name}" as "${saved.name}" (${saved.id}) in workspace ${workspaceId}`,
    );

    return saved;
  }

  /**
   * Reorder custom roles by priority.
   */
  async reorderRoles(
    workspaceId: string,
    roleIds: string[],
    actorId: string,
  ): Promise<void> {
    // Validate all role IDs belong to the workspace and no duplicates
    const uniqueRoleIds = new Set(roleIds);
    if (uniqueRoleIds.size !== roleIds.length) {
      throw new BadRequestException('Duplicate role IDs are not allowed');
    }

    const roles = await this.customRoleRepo.find({
      where: { workspaceId },
    });

    const workspaceRoleIds = new Set(roles.map((r) => r.id));
    for (const roleId of roleIds) {
      if (!workspaceRoleIds.has(roleId)) {
        throw new BadRequestException(
          `Role ID ${roleId} does not belong to this workspace`,
        );
      }
    }

    // Update priorities in transaction using Promise.all for parallel execution
    await this.dataSource.transaction(async (manager) => {
      await Promise.all(
        roleIds.map((id, i) =>
          manager.update(CustomRole, id, { priority: i }),
        ),
      );
    });

    // Audit log
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'custom_role',
        'reorder',
        {
          action: 'reorder',
          roleIds,
        },
      )
      .catch(() => {});

    this.logger.log(
      `Reordered ${roleIds.length} custom roles in workspace ${workspaceId}`,
    );
  }

  /**
   * List members assigned to a specific custom role.
   */
  async getRoleMembers(
    roleId: string,
    workspaceId: string,
  ): Promise<WorkspaceMember[]> {
    // Verify role exists
    const role = await this.customRoleRepo.findOne({
      where: { id: roleId, workspaceId },
    });

    if (!role) {
      throw new NotFoundException(`Custom role not found`);
    }

    return this.workspaceMemberRepo.find({
      where: { workspaceId, customRoleId: roleId },
      relations: ['user'],
    });
  }

  /**
   * Get available icons for role creation.
   */
  getAvailableIcons(): string[] {
    return [...AVAILABLE_ICONS];
  }

  /**
   * Count custom roles for a workspace (for limit validation).
   */
  async countCustomRoles(workspaceId: string): Promise<number> {
    return this.customRoleRepo.count({ where: { workspaceId } });
  }

  /**
   * Validate that a role name is not reserved and is unique within workspace.
   */
  private async validateRoleName(
    name: string,
    workspaceId: string,
    excludeRoleId?: string,
  ): Promise<void> {
    // Check reserved names
    if (RESERVED_ROLE_NAMES.includes(name.toLowerCase())) {
      throw new BadRequestException(
        `Role name "${name}" is reserved for system roles`,
      );
    }

    // Check uniqueness within workspace
    const whereClause: Record<string, any> = { workspaceId, name };
    if (excludeRoleId) {
      whereClause.id = Not(excludeRoleId);
    }

    const existing = await this.customRoleRepo.findOne({
      where: whereClause,
    });

    if (existing) {
      throw new ConflictException(
        `A role with name "${name}" already exists in this workspace`,
      );
    }
  }

  /**
   * Build system role info list with member counts for a workspace.
   */
  private async buildSystemRoles(
    workspaceId: string,
  ): Promise<SystemRoleInfo[]> {
    const systemRoleDefs: Omit<SystemRoleInfo, 'memberCount'>[] = [
      {
        name: 'owner',
        displayName: 'Owner',
        description: 'Full access to all workspace features and settings',
        color: '#ef4444',
        icon: 'crown',
        isSystem: true,
      },
      {
        name: 'admin',
        displayName: 'Admin',
        description: 'Manage workspace settings, members, and projects',
        color: '#f59e0b',
        icon: 'shield',
        isSystem: true,
      },
      {
        name: 'developer',
        displayName: 'Developer',
        description: 'Create and manage projects and agents',
        color: '#3b82f6',
        icon: 'code',
        isSystem: true,
      },
      {
        name: 'viewer',
        displayName: 'Viewer',
        description: 'Read-only access to workspace content',
        color: '#6b7280',
        icon: 'eye',
        isSystem: true,
      },
    ];

    // Batch query member counts for all system roles
    const memberCounts = await this.workspaceMemberRepo
      .createQueryBuilder('member')
      .select('member.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .where('member.workspaceId = :workspaceId', { workspaceId })
      .groupBy('member.role')
      .getRawMany();

    const countMap = new Map<string, number>();
    for (const row of memberCounts) {
      countMap.set(row.role, parseInt(row.count, 10));
    }

    return systemRoleDefs.map((def) => ({
      ...def,
      memberCount: countMap.get(def.name) || 0,
    }));
  }

  /**
   * Get custom roles with member counts for a workspace.
   */
  private async getCustomRolesWithMemberCounts(
    workspaceId: string,
  ): Promise<CustomRoleWithMemberCount[]> {
    const roles = await this.customRoleRepo.find({
      where: { workspaceId },
      relations: ['creator'],
      order: { priority: 'ASC' },
    });

    if (roles.length === 0) {
      return [];
    }

    // Batch query member counts for all custom roles
    const memberCounts = await this.workspaceMemberRepo
      .createQueryBuilder('member')
      .select('member.customRoleId', 'customRoleId')
      .addSelect('COUNT(*)', 'count')
      .where('member.workspaceId = :workspaceId', { workspaceId })
      .andWhere('member.customRoleId IS NOT NULL')
      .groupBy('member.customRoleId')
      .getRawMany();

    const countMap = new Map<string, number>();
    for (const row of memberCounts) {
      countMap.set(row.customRoleId, parseInt(row.count, 10));
    }

    return roles.map((role) => ({
      ...role,
      memberCount: countMap.get(role.id) || 0,
      creatorName: role.creator?.email,
    })) as CustomRoleWithMemberCount[];
  }
}
