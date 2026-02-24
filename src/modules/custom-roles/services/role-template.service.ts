import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  CustomRole,
  BaseRole,
} from '../../../database/entities/custom-role.entity';
import {
  RolePermission,
  ResourceType,
  RESOURCE_PERMISSIONS,
  BASE_ROLE_DEFAULTS,
} from '../../../database/entities/role-permission.entity';
import { CustomRoleService } from './custom-role.service';
import { PermissionMatrixService } from './permission-matrix.service';
import { PermissionCacheService } from './permission-cache.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { PermissionAuditService } from '../../permission-audit/services/permission-audit.service';
import { PermissionAuditEventType } from '../../../database/entities/permission-audit-event.entity';
import { CreateRoleFromTemplateDto } from '../dto/create-from-template.dto';
import { CreateCustomRoleDto } from '../dto/create-custom-role.dto';
import { SetPermissionDto } from '../dto/set-permission.dto';

/**
 * Interface for a role template definition.
 */
export interface RoleTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string;
  color: string;
  icon: string;
  baseRole: BaseRole;
  permissions: Record<string, Record<string, boolean>>;
}

/**
 * 6 pre-built role templates.
 */
const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'qa_lead',
    name: 'qa-lead',
    displayName: 'QA Lead',
    description:
      'Quality assurance team lead with test management, agent oversight, and deployment approval access',
    color: '#8b5cf6',
    icon: 'check-circle',
    baseRole: BaseRole.DEVELOPER,
    permissions: {
      stories: {
        create: true,
        read: true,
        update: true,
        delete: false,
        assign: true,
        change_status: true,
      },
      agents: {
        view: true,
        create_custom: false,
        assign_tasks: true,
        pause_cancel: true,
        configure: false,
      },
      deployments: {
        view: true,
        trigger: false,
        approve: true,
        rollback: true,
        configure: false,
      },
      projects: {
        create: false,
        read: true,
        update: false,
        delete: false,
        manage_settings: false,
      },
      workspace: {
        view_members: true,
        invite_members: false,
        remove_members: false,
        manage_roles: false,
        manage_billing: false,
        view_audit_log: true,
        manage_settings: false,
      },
    },
  },
  {
    id: 'devops_engineer',
    name: 'devops-engineer',
    displayName: 'DevOps Engineer',
    description:
      'DevOps engineer with full deployment, integration, and secret management access',
    color: '#059669',
    icon: 'server',
    baseRole: BaseRole.DEVELOPER,
    permissions: {
      deployments: {
        view: true,
        trigger: true,
        approve: true,
        rollback: true,
        configure: true,
      },
      integrations: {
        view: true,
        connect: true,
        disconnect: true,
        configure: true,
      },
      secrets: {
        view_masked: true,
        create: true,
        update: true,
        delete: true,
        view_plaintext: false,
      },
      stories: {
        create: false,
        read: true,
        update: false,
        delete: false,
        assign: false,
        change_status: false,
      },
      agents: {
        view: true,
        create_custom: false,
        assign_tasks: false,
        pause_cancel: false,
        configure: false,
      },
    },
  },
  {
    id: 'contractor',
    name: 'contractor',
    displayName: 'Contractor / External',
    description:
      'External contractor with limited read access and story status updates only',
    color: '#d97706',
    icon: 'briefcase',
    baseRole: BaseRole.VIEWER,
    permissions: {
      projects: {
        create: false,
        read: true,
        update: false,
        delete: false,
        manage_settings: false,
      },
      stories: {
        create: false,
        read: true,
        update: true,
        delete: false,
        assign: false,
        change_status: true,
      },
      agents: {
        view: true,
        create_custom: false,
        assign_tasks: false,
        pause_cancel: false,
        configure: false,
      },
      deployments: {
        view: false,
        trigger: false,
        approve: false,
        rollback: false,
        configure: false,
      },
      secrets: {
        view_masked: false,
        create: false,
        update: false,
        delete: false,
        view_plaintext: false,
      },
      workspace: {
        view_members: false,
        invite_members: false,
        remove_members: false,
        manage_roles: false,
        manage_billing: false,
        view_audit_log: false,
        manage_settings: false,
      },
    },
  },
  {
    id: 'project_manager',
    name: 'project-manager',
    displayName: 'Project Manager',
    description:
      'Project manager with full story management, agent oversight, and cost reporting access',
    color: '#0284c7',
    icon: 'clipboard',
    baseRole: BaseRole.DEVELOPER,
    permissions: {
      stories: {
        create: true,
        read: true,
        update: true,
        delete: true,
        assign: true,
        change_status: true,
      },
      projects: {
        create: false,
        read: true,
        update: true,
        delete: false,
        manage_settings: false,
      },
      agents: {
        view: true,
        create_custom: false,
        assign_tasks: true,
        pause_cancel: false,
        configure: false,
      },
      cost_management: {
        view_own_usage: true,
        view_workspace_usage: true,
        set_budgets: false,
        export_reports: true,
      },
      deployments: {
        view: true,
        trigger: false,
        approve: false,
        rollback: false,
        configure: false,
      },
      secrets: {
        view_masked: false,
        create: false,
        update: false,
        delete: false,
        view_plaintext: false,
      },
    },
  },
  {
    id: 'billing_admin',
    name: 'billing-admin',
    displayName: 'Billing Admin',
    description:
      'Billing administrator with full cost management and workspace billing access',
    color: '#dc2626',
    icon: 'settings',
    baseRole: BaseRole.VIEWER,
    permissions: {
      cost_management: {
        view_own_usage: true,
        view_workspace_usage: true,
        set_budgets: true,
        export_reports: true,
      },
      workspace: {
        view_members: true,
        invite_members: false,
        remove_members: false,
        manage_roles: false,
        manage_billing: true,
        view_audit_log: true,
        manage_settings: false,
      },
      projects: {
        create: false,
        read: false,
        update: false,
        delete: false,
        manage_settings: false,
      },
      agents: {
        view: false,
        create_custom: false,
        assign_tasks: false,
        pause_cancel: false,
        configure: false,
      },
      deployments: {
        view: false,
        trigger: false,
        approve: false,
        rollback: false,
        configure: false,
      },
    },
  },
  {
    id: 'read_only_stakeholder',
    name: 'read-only-stakeholder',
    displayName: 'Read-Only Stakeholder',
    description:
      'View-only access to projects, stories, and deployments with no modification permissions',
    color: '#6b7280',
    icon: 'eye',
    baseRole: BaseRole.VIEWER,
    permissions: {
      projects: {
        create: false,
        read: true,
        update: false,
        delete: false,
        manage_settings: false,
      },
      stories: {
        create: false,
        read: true,
        update: false,
        delete: false,
        assign: false,
        change_status: false,
      },
      agents: {
        view: true,
        create_custom: false,
        assign_tasks: false,
        pause_cancel: false,
        configure: false,
      },
      deployments: {
        view: true,
        trigger: false,
        approve: false,
        rollback: false,
        configure: false,
      },
      secrets: {
        view_masked: false,
        create: false,
        update: false,
        delete: false,
        view_plaintext: false,
      },
      integrations: {
        view: true,
        connect: false,
        disconnect: false,
        configure: false,
      },
      cost_management: {
        view_own_usage: false,
        view_workspace_usage: false,
        set_budgets: false,
        export_reports: false,
      },
    },
  },
];

@Injectable()
export class RoleTemplateService {
  private readonly logger = new Logger(RoleTemplateService.name);
  private readonly templateMap: Map<string, RoleTemplate>;

  constructor(
    private readonly customRoleService: CustomRoleService,
    private readonly permissionMatrixService: PermissionMatrixService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly auditService: AuditService,
    private readonly permissionAuditService: PermissionAuditService,
    @InjectRepository(CustomRole)
    private readonly customRoleRepo: Repository<CustomRole>,
    @InjectRepository(RolePermission)
    private readonly permissionRepo: Repository<RolePermission>,
    private readonly dataSource: DataSource,
  ) {
    this.templateMap = new Map();
    for (const template of ROLE_TEMPLATES) {
      this.templateMap.set(template.id, template);
    }
  }

  /**
   * Returns all available role templates.
   * Returns deep copies to prevent mutation of the internal template registry.
   */
  listTemplates(): RoleTemplate[] {
    return ROLE_TEMPLATES.map((t) => this.deepCopyTemplate(t));
  }

  /**
   * Returns a single template by ID.
   * Throws NotFoundException if not found.
   */
  getTemplate(templateId: string): RoleTemplate {
    const template = this.templateMap.get(templateId);
    if (!template) {
      throw new NotFoundException(
        `Role template "${templateId}" not found`,
      );
    }
    return this.deepCopyTemplate(template);
  }

  /**
   * Returns the explicit permission overrides for a template.
   * Only includes permissions that DIFFER from the base role defaults.
   * Delegates to computeOverrides to avoid duplicated logic.
   */
  getTemplatePermissions(templateId: string): SetPermissionDto[] {
    const template = this.getTemplate(templateId);
    return this.computeOverrides(template.baseRole, template.permissions);
  }

  /**
   * Creates a custom role from a template with optional customizations.
   */
  async createRoleFromTemplate(
    workspaceId: string,
    dto: CreateRoleFromTemplateDto,
    actorId: string,
  ): Promise<CustomRole> {
    const template = this.getTemplate(dto.templateId);

    // Validate customizations keys against RESOURCE_PERMISSIONS
    if (dto.customizations) {
      this.validateCustomizations(dto.customizations);
    }

    // Determine the role name
    const roleName = dto.name || template.name;
    const uniqueName = await this.generateUniqueName(roleName, workspaceId);

    // Create the custom role via CustomRoleService with properly typed DTO
    const createDto = new CreateCustomRoleDto();
    createDto.name = uniqueName;
    createDto.displayName = dto.displayName || template.displayName;
    createDto.description = dto.description || template.description;
    createDto.color = dto.color || template.color;
    createDto.icon = dto.icon || template.icon;
    createDto.baseRole = template.baseRole;

    const role = await this.customRoleService.createRole(
      workspaceId,
      createDto,
      actorId,
    );

    // Set templateId on the role
    await this.customRoleRepo.update(role.id, {
      templateId: template.id,
    });
    role.templateId = template.id;

    // Compute explicit permissions: merge template + customizations
    const mergedPermissions = this.mergePermissions(
      template.permissions,
      dto.customizations,
    );

    // Compute only overrides (diffs from base role defaults)
    const overrides = this.computeOverrides(
      template.baseRole,
      mergedPermissions,
    );

    // Apply permissions via bulk if there are any
    if (overrides.length > 0) {
      await this.permissionMatrixService.setBulkPermissions(
        role.id,
        workspaceId,
        overrides,
        actorId,
      );
    }

    // Permission audit trail (fire-and-forget)
    this.permissionAuditService
      .record({
        workspaceId,
        eventType: PermissionAuditEventType.ROLE_CREATED,
        actorId,
        targetRoleId: role.id,
        beforeState: null,
        afterState: {
          templateId: template.id,
          templateName: template.displayName,
          permissionsApplied: overrides.length,
        },
      })
      .catch(() => {});

    this.logger.log(
      `Created role "${role.name}" from template "${template.id}" in workspace ${workspaceId}`,
    );

    return role;
  }

  /**
   * Resets a role's permissions to its template defaults.
   */
  async resetRoleToTemplate(
    roleId: string,
    workspaceId: string,
    actorId: string,
  ): Promise<void> {
    const role = await this.customRoleRepo.findOne({
      where: { id: roleId, workspaceId },
    });

    if (!role) {
      throw new NotFoundException('Custom role not found');
    }

    if (!role.templateId) {
      throw new BadRequestException(
        'This role was not created from a template',
      );
    }

    const template = this.getTemplate(role.templateId);

    // Compute template overrides before starting transaction
    const overrides = this.computeOverrides(
      template.baseRole,
      template.permissions,
    );

    // Delete all existing explicit permissions and re-apply atomically
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId });

      // Re-apply template permissions within the same transaction
      if (overrides.length > 0) {
        const permissionEntities = overrides.map((override) => {
          const perm = new RolePermission();
          perm.roleId = roleId;
          perm.resourceType = override.resourceType;
          perm.permission = override.permission;
          perm.granted = override.granted;
          return perm;
        });
        await manager.save(RolePermission, permissionEntities);
      }
    });

    // Invalidate permission cache
    this.permissionCacheService
      .invalidateRolePermissions(workspaceId)
      .catch(() => {});

    // Audit log
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'custom_role',
        roleId,
        {
          action: 'reset_to_template',
          templateId: template.id,
          templateName: template.displayName,
          permissionsReset: overrides.length,
        },
      )
      .catch(() => {});

    this.logger.log(
      `Reset role "${role.name}" (${roleId}) to template "${template.id}" defaults in workspace ${workspaceId}`,
    );
  }

  /**
   * Generate a unique role name within a workspace.
   * If the base name exists, appends -2, -3, etc.
   * Uses a single query to find all existing names matching the pattern.
   */
  private async generateUniqueName(
    baseName: string,
    workspaceId: string,
  ): Promise<string> {
    // Fetch all existing role names matching baseName or baseName-N in one query
    const existingRoles = await this.customRoleRepo
      .createQueryBuilder('role')
      .select('role.name')
      .where('role.workspaceId = :workspaceId', { workspaceId })
      .andWhere('(role.name = :baseName OR role.name LIKE :pattern)', {
        baseName,
        pattern: `${baseName}-%`,
      })
      .getMany();

    const existingNames = new Set(existingRoles.map((r) => r.name));

    if (!existingNames.has(baseName)) {
      return baseName;
    }

    // Find the first available suffix
    for (let i = 2; i <= 100; i++) {
      const candidateName = `${baseName}-${i}`;
      if (!existingNames.has(candidateName)) {
        return candidateName;
      }
    }

    throw new BadRequestException(
      `Could not generate unique name for role "${baseName}"`,
    );
  }

  /**
   * Merge template permissions with optional customizations.
   * Customizations override template values.
   */
  private mergePermissions(
    templatePermissions: Record<string, Record<string, boolean>>,
    customizations?: Record<string, Record<string, boolean>>,
  ): Record<string, Record<string, boolean>> {
    // Deep copy template permissions
    const merged: Record<string, Record<string, boolean>> = {};
    for (const [resource, perms] of Object.entries(templatePermissions)) {
      merged[resource] = { ...perms };
    }

    if (!customizations) {
      return merged;
    }

    // Merge customizations on top
    for (const [resource, perms] of Object.entries(customizations)) {
      if (!merged[resource]) {
        merged[resource] = {};
      }
      for (const [perm, value] of Object.entries(perms)) {
        merged[resource][perm] = value;
      }
    }

    return merged;
  }

  /**
   * Compute explicit overrides by comparing merged permissions against base role defaults.
   * Only returns permissions that differ from the base role.
   */
  private computeOverrides(
    baseRole: BaseRole,
    mergedPermissions: Record<string, Record<string, boolean>>,
  ): SetPermissionDto[] {
    const baseDefaults = BASE_ROLE_DEFAULTS[baseRole] || {};
    const overrides: SetPermissionDto[] = [];

    for (const [resourceType, permissions] of Object.entries(
      mergedPermissions,
    )) {
      const baseResourceDefaults = baseDefaults[resourceType] || {};

      for (const [permName, granted] of Object.entries(permissions)) {
        const baseValue = baseResourceDefaults[permName];
        if (baseValue === undefined || baseValue !== granted) {
          const dto = new SetPermissionDto();
          dto.resourceType = resourceType;
          dto.permission = permName;
          dto.granted = granted;
          overrides.push(dto);
        }
      }
    }

    return overrides;
  }

  /**
   * Deep-copy a template to prevent mutation of the internal registry.
   */
  private deepCopyTemplate(template: RoleTemplate): RoleTemplate {
    const permissions: Record<string, Record<string, boolean>> = {};
    for (const [resource, perms] of Object.entries(template.permissions)) {
      permissions[resource] = { ...perms };
    }
    return {
      ...template,
      permissions,
    };
  }

  /**
   * Validate customization keys against RESOURCE_PERMISSIONS.
   */
  private validateCustomizations(
    customizations: Record<string, Record<string, boolean>>,
  ): void {
    const validResourceTypes = Object.values(ResourceType) as string[];

    for (const [resourceType, permissions] of Object.entries(customizations)) {
      if (!validResourceTypes.includes(resourceType)) {
        throw new BadRequestException(
          `Invalid resource type in customizations: "${resourceType}". Valid types: ${validResourceTypes.join(', ')}`,
        );
      }

      const validPermissions =
        RESOURCE_PERMISSIONS[resourceType as ResourceType] || [];
      for (const permName of Object.keys(permissions)) {
        if (!validPermissions.includes(permName)) {
          throw new BadRequestException(
            `Invalid permission "${permName}" for resource type "${resourceType}". Valid permissions: ${validPermissions.join(', ')}`,
          );
        }
      }
    }
  }
}
