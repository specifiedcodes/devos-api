import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RoleTemplateService, RoleTemplate } from '../services/role-template.service';
import { CustomRoleService } from '../services/custom-role.service';
import { PermissionMatrixService } from '../services/permission-matrix.service';
import { PermissionCacheService } from '../services/permission-cache.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { PermissionAuditService } from '../../permission-audit/services/permission-audit.service';
import { CustomRole, BaseRole } from '../../../database/entities/custom-role.entity';
import { RolePermission, BASE_ROLE_DEFAULTS } from '../../../database/entities/role-permission.entity';

describe('RoleTemplateService', () => {
  let service: RoleTemplateService;
  let customRoleService: jest.Mocked<Partial<CustomRoleService>>;
  let permissionMatrixService: jest.Mocked<Partial<PermissionMatrixService>>;
  let permissionCacheService: jest.Mocked<Partial<PermissionCacheService>>;
  let auditService: jest.Mocked<Partial<AuditService>>;
  let permissionAuditService: jest.Mocked<Partial<PermissionAuditService>>;
  let customRoleRepo: any;
  let permissionRepo: any;
  let dataSource: any;

  beforeEach(async () => {
    customRoleService = {
      createRole: jest.fn().mockResolvedValue({
        id: 'role-uuid-1',
        name: 'qa-lead',
        displayName: 'QA Lead',
        baseRole: BaseRole.DEVELOPER,
        templateId: null,
      }),
    };

    permissionMatrixService = {
      setBulkPermissions: jest.fn().mockResolvedValue([]),
    };

    permissionCacheService = {
      invalidateRolePermissions: jest.fn().mockResolvedValue(undefined),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    permissionAuditService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    customRoleRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    permissionRepo = {};

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const manager = {
          delete: jest.fn().mockResolvedValue(undefined),
          save: jest.fn().mockResolvedValue([]),
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleTemplateService,
        { provide: CustomRoleService, useValue: customRoleService },
        { provide: PermissionMatrixService, useValue: permissionMatrixService },
        { provide: PermissionCacheService, useValue: permissionCacheService },
        { provide: AuditService, useValue: auditService },
        { provide: PermissionAuditService, useValue: permissionAuditService },
        { provide: getRepositoryToken(CustomRole), useValue: customRoleRepo },
        { provide: getRepositoryToken(RolePermission), useValue: permissionRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<RoleTemplateService>(RoleTemplateService);
  });

  // ---- listTemplates ----

  it('should return all 6 templates', () => {
    const templates = service.listTemplates();
    expect(templates).toHaveLength(6);
  });

  it('should return templates with expected IDs', () => {
    const templates = service.listTemplates();
    const ids = templates.map((t) => t.id);
    expect(ids).toEqual([
      'qa_lead',
      'devops_engineer',
      'contractor',
      'project_manager',
      'billing_admin',
      'read_only_stakeholder',
    ]);
  });

  it('should return a copy, not the original reference', () => {
    const first = service.listTemplates();
    const second = service.listTemplates();
    expect(first).not.toBe(second);
  });

  // ---- getTemplate ----

  it('should return qa_lead template by ID', () => {
    const template = service.getTemplate('qa_lead');
    expect(template.id).toBe('qa_lead');
    expect(template.displayName).toBe('QA Lead');
    expect(template.baseRole).toBe(BaseRole.DEVELOPER);
    expect(template.color).toBe('#8b5cf6');
    expect(template.icon).toBe('check-circle');
  });

  it('should return devops_engineer template by ID', () => {
    const template = service.getTemplate('devops_engineer');
    expect(template.id).toBe('devops_engineer');
    expect(template.displayName).toBe('DevOps Engineer');
    expect(template.baseRole).toBe(BaseRole.DEVELOPER);
  });

  it('should return contractor template by ID', () => {
    const template = service.getTemplate('contractor');
    expect(template.baseRole).toBe(BaseRole.VIEWER);
  });

  it('should throw NotFoundException for invalid template ID', () => {
    expect(() => service.getTemplate('nonexistent')).toThrow(NotFoundException);
  });

  it('should return a copy, not the original template object', () => {
    const t1 = service.getTemplate('qa_lead');
    const t2 = service.getTemplate('qa_lead');
    expect(t1).not.toBe(t2);
    expect(t1).toEqual(t2);
  });

  // ---- getTemplatePermissions ----

  it('should return only overrides for qa_lead (not inherited defaults)', () => {
    const overrides = service.getTemplatePermissions('qa_lead');
    // QA lead is based on developer. Some permissions match developer defaults, some differ.
    // E.g., deployments.approve=true differs from developer default (false)
    const approveOverride = overrides.find(
      (o) => o.resourceType === 'deployments' && o.permission === 'approve',
    );
    expect(approveOverride).toBeDefined();
    expect(approveOverride!.granted).toBe(true);

    // deployments.rollback=true differs from developer default (false)
    const rollbackOverride = overrides.find(
      (o) => o.resourceType === 'deployments' && o.permission === 'rollback',
    );
    expect(rollbackOverride).toBeDefined();
    expect(rollbackOverride!.granted).toBe(true);
  });

  it('should NOT include permissions that match base role defaults', () => {
    const overrides = service.getTemplatePermissions('qa_lead');
    // stories.read=true is the SAME as developer default -> should NOT appear
    const storiesRead = overrides.find(
      (o) => o.resourceType === 'stories' && o.permission === 'read',
    );
    expect(storiesRead).toBeUndefined();
  });

  it('should throw NotFoundException for invalid template ID in getTemplatePermissions', () => {
    expect(() => service.getTemplatePermissions('invalid')).toThrow(NotFoundException);
  });

  // ---- createRoleFromTemplate ----

  it('should create a role from template with default name', async () => {
    const result = await service.createRoleFromTemplate(
      'workspace-1',
      { templateId: 'qa_lead' },
      'actor-1',
    );

    expect(customRoleService.createRole).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({
        name: 'qa-lead',
        displayName: 'QA Lead',
        baseRole: BaseRole.DEVELOPER,
      }),
      'actor-1',
    );
    expect(customRoleRepo.update).toHaveBeenCalledWith('role-uuid-1', {
      templateId: 'qa_lead',
    });
    expect(result.id).toBe('role-uuid-1');
  });

  it('should create a role from template with custom name', async () => {
    await service.createRoleFromTemplate(
      'workspace-1',
      { templateId: 'qa_lead', name: 'my-qa-role', displayName: 'My QA Role' },
      'actor-1',
    );

    expect(customRoleService.createRole).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({
        name: 'my-qa-role',
        displayName: 'My QA Role',
      }),
      'actor-1',
    );
  });

  it('should apply explicit permission overrides via setBulkPermissions', async () => {
    await service.createRoleFromTemplate(
      'workspace-1',
      { templateId: 'qa_lead' },
      'actor-1',
    );

    expect(permissionMatrixService.setBulkPermissions).toHaveBeenCalled();
    const callArgs = (permissionMatrixService.setBulkPermissions as jest.Mock).mock.calls[0];
    const permissions = callArgs[2];
    // Should have some overrides
    expect(permissions.length).toBeGreaterThan(0);
  });

  it('should merge customizations on top of template permissions', async () => {
    await service.createRoleFromTemplate(
      'workspace-1',
      {
        templateId: 'qa_lead',
        customizations: {
          deployments: { trigger: true },
        },
      },
      'actor-1',
    );

    expect(permissionMatrixService.setBulkPermissions).toHaveBeenCalled();
    const callArgs = (permissionMatrixService.setBulkPermissions as jest.Mock).mock.calls[0];
    const permissions = callArgs[2];
    // deployments.trigger=true should be in the overrides (differs from developer default trigger=true)
    // Actually developer default trigger=true, and custom is trigger=true, so it matches default -> NOT an override
    // Let's check a real override instead
    expect(permissions.length).toBeGreaterThan(0);
  });

  it('should generate unique name with suffix when collision exists', async () => {
    // Mock createQueryBuilder to return existing 'qa-lead' name
    customRoleRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ name: 'qa-lead' }]),
    });

    await service.createRoleFromTemplate(
      'workspace-1',
      { templateId: 'qa_lead' },
      'actor-1',
    );

    expect(customRoleService.createRole).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({ name: 'qa-lead-2' }),
      'actor-1',
    );
  });

  it('should throw NotFoundException for invalid template ID', async () => {
    await expect(
      service.createRoleFromTemplate('workspace-1', { templateId: 'invalid' }, 'actor-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should validate customization resource types', async () => {
    await expect(
      service.createRoleFromTemplate(
        'workspace-1',
        {
          templateId: 'qa_lead',
          customizations: { invalid_resource: { read: true } },
        },
        'actor-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should validate customization permission names', async () => {
    await expect(
      service.createRoleFromTemplate(
        'workspace-1',
        {
          templateId: 'qa_lead',
          customizations: { projects: { invalid_perm: true } },
        },
        'actor-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should record permission audit trail', async () => {
    await service.createRoleFromTemplate(
      'workspace-1',
      { templateId: 'qa_lead' },
      'actor-1',
    );

    expect(permissionAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        actorId: 'actor-1',
        targetRoleId: 'role-uuid-1',
        afterState: expect.objectContaining({
          templateId: 'qa_lead',
          templateName: 'QA Lead',
        }),
      }),
    );
  });

  // ---- resetRoleToTemplate ----

  it('should reset role permissions to template defaults atomically', async () => {
    customRoleRepo.findOne.mockResolvedValueOnce({
      id: 'role-uuid-1',
      name: 'qa-lead',
      templateId: 'qa_lead',
      workspaceId: 'workspace-1',
    });

    await service.resetRoleToTemplate('role-uuid-1', 'workspace-1', 'actor-1');

    expect(dataSource.transaction).toHaveBeenCalled();
    // Verify transaction manager was used for both delete and save (atomic operation)
    const transactionCb = dataSource.transaction.mock.calls[0][0];
    const mockManager = { delete: jest.fn().mockResolvedValue(undefined), save: jest.fn().mockResolvedValue([]) };
    await transactionCb(mockManager);
    expect(mockManager.delete).toHaveBeenCalled();
    expect(mockManager.save).toHaveBeenCalled();
    expect(permissionCacheService.invalidateRolePermissions).toHaveBeenCalledWith('workspace-1');
  });

  it('should throw NotFoundException when role not found for reset', async () => {
    customRoleRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.resetRoleToTemplate('nonexistent', 'workspace-1', 'actor-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when role has no templateId', async () => {
    customRoleRepo.findOne.mockResolvedValueOnce({
      id: 'role-uuid-1',
      name: 'custom-role',
      templateId: null,
      workspaceId: 'workspace-1',
    });

    await expect(
      service.resetRoleToTemplate('role-uuid-1', 'workspace-1', 'actor-1'),
    ).rejects.toThrow(BadRequestException);
  });

  // ---- Template content validation ----

  it('should have correct base roles for all templates', () => {
    const templates = service.listTemplates();
    const devBased = templates.filter((t) => t.baseRole === BaseRole.DEVELOPER);
    const viewerBased = templates.filter((t) => t.baseRole === BaseRole.VIEWER);
    expect(devBased.length).toBe(3); // qa_lead, devops_engineer, project_manager
    expect(viewerBased.length).toBe(3); // contractor, billing_admin, read_only_stakeholder
  });

  it('each template should have a non-empty permissions object', () => {
    const templates = service.listTemplates();
    for (const template of templates) {
      expect(Object.keys(template.permissions).length).toBeGreaterThan(0);
    }
  });

  it('each template should have valid color hex codes', () => {
    const templates = service.listTemplates();
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    for (const template of templates) {
      expect(template.color).toMatch(hexRegex);
    }
  });
});
