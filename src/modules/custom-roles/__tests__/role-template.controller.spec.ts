import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CustomRoleController } from '../controllers/custom-role.controller';
import { CustomRoleService } from '../services/custom-role.service';
import { RoleTemplateService, RoleTemplate } from '../services/role-template.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';
import { BaseRole } from '../../../database/entities/custom-role.entity';

describe('CustomRoleController - Template Endpoints', () => {
  let controller: CustomRoleController;
  let roleTemplateService: jest.Mocked<RoleTemplateService>;

  const mockTemplates: RoleTemplate[] = [
    {
      id: 'qa_lead',
      name: 'qa-lead',
      displayName: 'QA Lead',
      description: 'Quality assurance team lead',
      color: '#8b5cf6',
      icon: 'check-circle',
      baseRole: BaseRole.DEVELOPER,
      permissions: {
        stories: { create: true, read: true },
      },
    },
    {
      id: 'devops_engineer',
      name: 'devops-engineer',
      displayName: 'DevOps Engineer',
      description: 'DevOps engineer with deployment access',
      color: '#059669',
      icon: 'server',
      baseRole: BaseRole.DEVELOPER,
      permissions: {
        deployments: { view: true, trigger: true },
      },
    },
  ];

  const mockCreatedRole = {
    id: 'role-uuid-1',
    name: 'qa-lead',
    displayName: 'QA Lead',
    workspaceId: 'ws-1',
    baseRole: BaseRole.DEVELOPER,
    templateId: 'qa_lead',
  };

  beforeEach(async () => {
    const mockGuard = { canActivate: jest.fn().mockReturnValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomRoleController],
      providers: [
        {
          provide: CustomRoleService,
          useValue: {
            getAvailableIcons: jest.fn().mockReturnValue(['shield', 'key']),
            listRoles: jest.fn().mockResolvedValue({ systemRoles: [], customRoles: [] }),
            getRole: jest.fn(),
            createRole: jest.fn(),
            updateRole: jest.fn(),
            deleteRole: jest.fn(),
            cloneRole: jest.fn(),
            reorderRoles: jest.fn(),
            getRoleMembers: jest.fn(),
          },
        },
        {
          provide: RoleTemplateService,
          useValue: {
            listTemplates: jest.fn().mockReturnValue(mockTemplates),
            getTemplate: jest.fn().mockImplementation((id: string) => {
              const t = mockTemplates.find((tmpl) => tmpl.id === id);
              if (!t) throw new NotFoundException(`Role template "${id}" not found`);
              return t;
            }),
            createRoleFromTemplate: jest.fn().mockResolvedValue(mockCreatedRole),
            resetRoleToTemplate: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(RoleGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<CustomRoleController>(CustomRoleController);
    roleTemplateService = module.get(RoleTemplateService);
  });

  // ---- GET /templates ----

  it('should list all templates', async () => {
    const result = await controller.listTemplates('ws-uuid');
    expect(result).toEqual({ templates: mockTemplates });
    expect(roleTemplateService.listTemplates).toHaveBeenCalled();
  });

  it('should return templates array in response', async () => {
    const result = await controller.listTemplates('ws-uuid');
    expect(result.templates).toHaveLength(2);
    expect(result.templates[0].id).toBe('qa_lead');
  });

  // ---- GET /templates/:templateId ----

  it('should return a single template by ID', async () => {
    const result = await controller.getTemplate('ws-uuid', 'qa_lead');
    expect(result).toEqual(mockTemplates[0]);
    expect(roleTemplateService.getTemplate).toHaveBeenCalledWith('qa_lead');
  });

  it('should throw 404 for invalid template ID', async () => {
    await expect(controller.getTemplate('ws-uuid', 'nonexistent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return template with all fields', async () => {
    const result = await controller.getTemplate('ws-uuid', 'devops_engineer');
    expect(result.id).toBe('devops_engineer');
    expect(result.displayName).toBe('DevOps Engineer');
    expect(result.color).toBe('#059669');
    expect(result.icon).toBe('server');
    expect(result.baseRole).toBe(BaseRole.DEVELOPER);
  });

  // ---- POST /from-template ----

  it('should create role from template', async () => {
    const req = { user: { id: 'user-1' } };
    const dto = { templateId: 'qa_lead' };

    const result = await controller.createRoleFromTemplate('ws-uuid', dto as any, req);

    expect(roleTemplateService.createRoleFromTemplate).toHaveBeenCalledWith(
      'ws-uuid',
      dto,
      'user-1',
    );
    expect(result).toEqual(mockCreatedRole);
  });

  it('should create role from template with custom name', async () => {
    const req = { user: { id: 'user-1' } };
    const dto = { templateId: 'qa_lead', name: 'my-qa-role', displayName: 'My QA' };

    await controller.createRoleFromTemplate('ws-uuid', dto as any, req);

    expect(roleTemplateService.createRoleFromTemplate).toHaveBeenCalledWith(
      'ws-uuid',
      dto,
      'user-1',
    );
  });

  it('should propagate NotFoundException from service for invalid template', async () => {
    (roleTemplateService.createRoleFromTemplate as jest.Mock).mockRejectedValue(
      new NotFoundException('Role template "invalid" not found'),
    );
    const req = { user: { id: 'user-1' } };

    await expect(
      controller.createRoleFromTemplate('ws-uuid', { templateId: 'invalid' } as any, req),
    ).rejects.toThrow(NotFoundException);
  });

  // ---- POST /:roleId/reset-to-template ----

  it('should reset role to template defaults', async () => {
    const req = { user: { id: 'user-1' } };
    await controller.resetToTemplate('ws-uuid', 'role-uuid-1', req);

    expect(roleTemplateService.resetRoleToTemplate).toHaveBeenCalledWith(
      'role-uuid-1',
      'ws-uuid',
      'user-1',
    );
  });

  it('should propagate NotFoundException from service for reset', async () => {
    (roleTemplateService.resetRoleToTemplate as jest.Mock).mockRejectedValue(
      new NotFoundException('Custom role not found'),
    );
    const req = { user: { id: 'user-1' } };

    await expect(
      controller.resetToTemplate('ws-uuid', 'nonexistent', req),
    ).rejects.toThrow(NotFoundException);
  });

  // ---- Existing endpoints still work ----

  it('should still list icons via existing endpoint', async () => {
    const result = await controller.getAvailableIcons('ws-uuid');
    expect(result.icons).toEqual(['shield', 'key']);
  });

  it('should still list roles via existing endpoint', async () => {
    const result = await controller.listRoles('ws-uuid');
    expect(result).toEqual({ systemRoles: [], customRoles: [] });
  });
});
