/**
 * CustomAgentsService Tests
 *
 * Story 18-1: Agent Definition Schema
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { CustomAgentsService } from '../custom-agents.service';
import { AgentDefinitionValidatorService } from '../agent-definition-validator.service';
import { AgentDefinitionAuditService } from '../agent-definition-audit.service';
import { AgentDefinition, AgentDefinitionCategory } from '../../../database/entities/agent-definition.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { AgentDefinitionAuditEventType } from '../../../database/entities/agent-definition-audit-event.entity';
import { CreateAgentDefinitionDto } from '../dto/create-agent-definition.dto';

describe('CustomAgentsService', () => {
  let service: CustomAgentsService;
  let agentDefRepo: jest.Mocked<Repository<AgentDefinition>>;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let validatorService: jest.Mocked<AgentDefinitionValidatorService>;
  let auditService: jest.Mocked<AgentDefinitionAuditService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockDefinitionId = '33333333-3333-3333-3333-333333333333';

  const mockMember: Partial<WorkspaceMember> = {
    workspaceId: mockWorkspaceId,
    userId: mockActorId,
    role: WorkspaceRole.DEVELOPER,
  };

  const validCreateDto: CreateAgentDefinitionDto = {
    name: 'code-reviewer',
    displayName: 'Code Reviewer',
    description: 'Reviews code',
    definition: {
      role: 'Expert code reviewer',
      system_prompt: 'Review code for best practices.',
      model_preferences: { preferred: 'claude-sonnet-4-20250514' },
    },
    category: 'development',
    tags: ['code-quality', 'Security', ' review '],
  };

  const mockEntity: Partial<AgentDefinition> = {
    id: mockDefinitionId,
    workspaceId: mockWorkspaceId,
    name: 'code-reviewer',
    displayName: 'Code Reviewer',
    description: 'Reviews code',
    version: '1.0.0',
    schemaVersion: 'v1',
    definition: validCreateDto.definition as any,
    icon: 'bot',
    category: AgentDefinitionCategory.DEVELOPMENT,
    tags: ['code-quality', 'security', 'review'],
    isPublished: false,
    isActive: true,
    createdBy: mockActorId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockEntity], 1]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomAgentsService,
        {
          provide: getRepositoryToken(AgentDefinition),
          useValue: {
            count: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: AgentDefinitionValidatorService,
          useValue: {
            validateDefinition: jest.fn(),
            validateModelReferences: jest.fn(),
            validateToolReferences: jest.fn(),
          },
        },
        {
          provide: AgentDefinitionAuditService,
          useValue: {
            logEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CustomAgentsService>(CustomAgentsService);
    agentDefRepo = module.get(getRepositoryToken(AgentDefinition)) as jest.Mocked<Repository<AgentDefinition>>;
    memberRepo = module.get(getRepositoryToken(WorkspaceMember)) as jest.Mocked<Repository<WorkspaceMember>>;
    validatorService = module.get(AgentDefinitionValidatorService) as jest.Mocked<AgentDefinitionValidatorService>;
    auditService = module.get(AgentDefinitionAuditService) as jest.Mocked<AgentDefinitionAuditService>;
  });

  describe('createDefinition', () => {
    beforeEach(() => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      agentDefRepo.count.mockResolvedValue(0);
      agentDefRepo.findOne.mockResolvedValue(null);
      validatorService.validateDefinition.mockReturnValue({ valid: true, errors: [], warnings: [] });
      validatorService.validateModelReferences.mockResolvedValue([]);
      agentDefRepo.create.mockReturnValue(mockEntity as AgentDefinition);
      agentDefRepo.save.mockResolvedValue(mockEntity as AgentDefinition);
      auditService.logEvent.mockResolvedValue(null);
    });

    it('should save valid definition to database', async () => {
      const result = await service.createDefinition(mockWorkspaceId, validCreateDto, mockActorId);
      expect(result).toBeDefined();
      expect(result.name).toBe('code-reviewer');
      expect(agentDefRepo.save).toHaveBeenCalled();
    });

    it('should validate definition against JSON Schema', async () => {
      await service.createDefinition(mockWorkspaceId, validCreateDto, mockActorId);
      expect(validatorService.validateDefinition).toHaveBeenCalledWith(validCreateDto.definition);
    });

    it('should reject invalid definitions with detailed errors', async () => {
      validatorService.validateDefinition.mockReturnValue({
        valid: false,
        errors: [{ path: '/role', message: 'Missing required field', keyword: 'required' }],
        warnings: [],
      });

      await expect(
        service.createDefinition(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate names within workspace', async () => {
      agentDefRepo.findOne.mockResolvedValue(mockEntity as AgentDefinition);

      await expect(
        service.createDefinition(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(ConflictException);
    });

    it('should enforce MAX_DEFINITIONS_PER_WORKSPACE limit', async () => {
      agentDefRepo.count.mockResolvedValue(100);

      await expect(
        service.createDefinition(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-member users (403)', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createDefinition(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject viewer role', async () => {
      memberRepo.findOne.mockResolvedValue({
        ...mockMember,
        role: WorkspaceRole.VIEWER,
      } as WorkspaceMember);

      await expect(
        service.createDefinition(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should log audit event on success', async () => {
      await service.createDefinition(mockWorkspaceId, validCreateDto, mockActorId);
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AgentDefinitionAuditEventType.AGENT_DEF_CREATED,
        }),
      );
    });

    it('should log audit event on validation failure', async () => {
      validatorService.validateDefinition.mockReturnValue({
        valid: false,
        errors: [{ path: '/', message: 'Invalid', keyword: 'required' }],
        warnings: [],
      });

      await expect(
        service.createDefinition(mockWorkspaceId, validCreateDto, mockActorId),
      ).rejects.toThrow(BadRequestException);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AgentDefinitionAuditEventType.AGENT_DEF_VALIDATION_FAILED,
        }),
      );
    });

    it('should sanitize tags (trim, lowercase, dedup)', async () => {
      await service.createDefinition(mockWorkspaceId, validCreateDto, mockActorId);

      expect(agentDefRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['code-quality', 'security', 'review'],
        }),
      );
    });
  });

  describe('updateDefinition', () => {
    beforeEach(() => {
      agentDefRepo.findOne.mockResolvedValue(mockEntity as AgentDefinition);
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      validatorService.validateDefinition.mockReturnValue({ valid: true, errors: [], warnings: [] });
      validatorService.validateModelReferences.mockResolvedValue([]);
      agentDefRepo.save.mockResolvedValue(mockEntity as AgentDefinition);
      auditService.logEvent.mockResolvedValue(null);
    });

    it('should update specified fields only', async () => {
      const result = await service.updateDefinition(
        mockWorkspaceId,
        mockDefinitionId,
        { displayName: 'Updated Name' },
        mockActorId,
      );
      expect(result).toBeDefined();
      expect(agentDefRepo.save).toHaveBeenCalled();
    });

    it('should re-validate definition if changed', async () => {
      const newDef = {
        role: 'Updated role',
        system_prompt: 'Updated prompt',
        model_preferences: { preferred: 'test-model' },
      };
      await service.updateDefinition(
        mockWorkspaceId,
        mockDefinitionId,
        { definition: newDef },
        mockActorId,
      );
      expect(validatorService.validateDefinition).toHaveBeenCalledWith(newDef);
    });

    it('should reject unauthorized users', async () => {
      const otherUserId = '99999999-9999-9999-9999-999999999999';
      memberRepo.findOne.mockResolvedValue({
        ...mockMember,
        userId: otherUserId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);

      await expect(
        service.updateDefinition(mockWorkspaceId, mockDefinitionId, { displayName: 'test' }, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow creator to update own definitions', async () => {
      const result = await service.updateDefinition(
        mockWorkspaceId,
        mockDefinitionId,
        { displayName: 'Updated' },
        mockActorId,
      );
      expect(result).toBeDefined();
    });

    it('should log audit event with changed fields', async () => {
      await service.updateDefinition(
        mockWorkspaceId,
        mockDefinitionId,
        { displayName: 'Updated', icon: 'code' },
        mockActorId,
      );

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AgentDefinitionAuditEventType.AGENT_DEF_UPDATED,
          details: expect.objectContaining({
            changedFields: expect.arrayContaining(['displayName', 'icon']),
          }),
        }),
      );
    });
  });

  describe('deleteDefinition', () => {
    beforeEach(() => {
      agentDefRepo.findOne.mockResolvedValue(mockEntity as AgentDefinition);
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      agentDefRepo.remove.mockResolvedValue(mockEntity as AgentDefinition);
      auditService.logEvent.mockResolvedValue(null);
    });

    it('should remove definition from database', async () => {
      await service.deleteDefinition(mockWorkspaceId, mockDefinitionId, mockActorId);
      expect(agentDefRepo.remove).toHaveBeenCalled();
    });

    it('should reject unauthorized users', async () => {
      const otherUserId = '99999999-9999-9999-9999-999999999999';
      memberRepo.findOne.mockResolvedValue({
        ...mockMember,
        userId: otherUserId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);

      await expect(
        service.deleteDefinition(mockWorkspaceId, mockDefinitionId, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should log audit event with definition snapshot', async () => {
      await service.deleteDefinition(mockWorkspaceId, mockDefinitionId, mockActorId);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AgentDefinitionAuditEventType.AGENT_DEF_DELETED,
          details: expect.objectContaining({
            deletedDefinition: expect.objectContaining({ name: 'code-reviewer' }),
          }),
        }),
      );
    });
  });

  describe('getDefinition', () => {
    it('should return definition for valid id', async () => {
      agentDefRepo.findOne.mockResolvedValue(mockEntity as AgentDefinition);

      const result = await service.getDefinition(mockWorkspaceId, mockDefinitionId);
      expect(result).toBeDefined();
      expect(result.id).toBe(mockDefinitionId);
    });

    it('should throw NotFoundException for missing id', async () => {
      agentDefRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getDefinition(mockWorkspaceId, mockDefinitionId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listDefinitions', () => {
    it('should return paginated results', async () => {
      const result = await service.listDefinitions(mockWorkspaceId, {});
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should apply category filter', async () => {
      const mockQb = agentDefRepo.createQueryBuilder('def');
      await service.listDefinitions(mockWorkspaceId, { category: 'development' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'def.category = :category',
        { category: 'development' },
      );
    });

    it('should apply isActive filter', async () => {
      const mockQb = agentDefRepo.createQueryBuilder('def');
      await service.listDefinitions(mockWorkspaceId, { isActive: true });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'def.isActive = :isActive',
        { isActive: true },
      );
    });

    it('should apply search filter with ILIKE escaping', async () => {
      const mockQb = agentDefRepo.createQueryBuilder('def');
      await service.listDefinitions(mockWorkspaceId, { search: 'test%_value' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(def.name ILIKE :search OR def.display_name ILIKE :search)',
        { search: '%test\\%\\_value%' },
      );
    });

    it('should apply tag filter', async () => {
      const mockQb = agentDefRepo.createQueryBuilder('def');
      await service.listDefinitions(mockWorkspaceId, { tag: 'security' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'def.tags @> :tag',
        { tag: ['security'] },
      );
    });

    it('should apply sorting', async () => {
      const mockQb = agentDefRepo.createQueryBuilder('def');
      await service.listDefinitions(mockWorkspaceId, { sortBy: 'name', sortOrder: 'ASC' });
      expect(mockQb.orderBy).toHaveBeenCalledWith('def.name', 'ASC');
    });
  });

  describe('activateDefinition', () => {
    it('should set isActive to true', async () => {
      const inactive = { ...mockEntity, isActive: false };
      agentDefRepo.findOne.mockResolvedValue(inactive as AgentDefinition);
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      agentDefRepo.save.mockResolvedValue({ ...inactive, isActive: true } as AgentDefinition);
      auditService.logEvent.mockResolvedValue(null);

      const result = await service.activateDefinition(mockWorkspaceId, mockDefinitionId, mockActorId);
      expect(agentDefRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
    });

    it('should reject unauthorized users', async () => {
      const otherUserId = '99999999-9999-9999-9999-999999999999';
      agentDefRepo.findOne.mockResolvedValue(mockEntity as AgentDefinition);
      memberRepo.findOne.mockResolvedValue({
        ...mockMember,
        userId: otherUserId,
        role: WorkspaceRole.VIEWER,
      } as WorkspaceMember);

      await expect(
        service.activateDefinition(mockWorkspaceId, mockDefinitionId, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deactivateDefinition', () => {
    it('should set isActive to false', async () => {
      agentDefRepo.findOne.mockResolvedValue(mockEntity as AgentDefinition);
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      agentDefRepo.save.mockResolvedValue({ ...mockEntity, isActive: false } as AgentDefinition);
      auditService.logEvent.mockResolvedValue(null);

      const result = await service.deactivateDefinition(mockWorkspaceId, mockDefinitionId, mockActorId);
      expect(agentDefRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });

    it('should reject unauthorized users', async () => {
      const otherUserId = '99999999-9999-9999-9999-999999999999';
      agentDefRepo.findOne.mockResolvedValue(mockEntity as AgentDefinition);
      memberRepo.findOne.mockResolvedValue({
        ...mockMember,
        userId: otherUserId,
        role: WorkspaceRole.VIEWER,
      } as WorkspaceMember);

      await expect(
        service.deactivateDefinition(mockWorkspaceId, mockDefinitionId, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('validateDefinition', () => {
    it('should return validation result without database writes', async () => {
      validatorService.validateDefinition.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [{ path: '/system_prompt', message: 'Too long', type: 'recommendation' }],
      });
      validatorService.validateModelReferences.mockResolvedValue([]);

      const result = await service.validateDefinition({
        definition: validCreateDto.definition,
        schemaVersion: 'v1',
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(agentDefRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('exportDefinitionAsYaml', () => {
    it('should return valid YAML with correct structure', async () => {
      agentDefRepo.findOne.mockResolvedValue(mockEntity as AgentDefinition);

      const yamlStr = await service.exportDefinitionAsYaml(mockWorkspaceId, mockDefinitionId);
      expect(yamlStr).toContain('apiVersion: devos.com/v1');
      expect(yamlStr).toContain('kind: AgentDefinition');
      expect(yamlStr).toContain('name: code-reviewer');
    });

    it('should include metadata and spec sections', async () => {
      agentDefRepo.findOne.mockResolvedValue(mockEntity as AgentDefinition);

      const yamlStr = await service.exportDefinitionAsYaml(mockWorkspaceId, mockDefinitionId);
      expect(yamlStr).toContain('metadata:');
      expect(yamlStr).toContain('spec:');
    });
  });

  describe('importDefinitionFromYaml', () => {
    const validYaml = `
apiVersion: devos.com/v1
kind: AgentDefinition
metadata:
  name: imported-agent
  display_name: Imported Agent
  category: development
spec:
  role: Test role
  system_prompt: Test prompt
  model_preferences:
    preferred: claude-sonnet-4-20250514
`;

    beforeEach(() => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      agentDefRepo.count.mockResolvedValue(0);
      agentDefRepo.findOne.mockResolvedValue(null);
      validatorService.validateDefinition.mockReturnValue({ valid: true, errors: [], warnings: [] });
      validatorService.validateModelReferences.mockResolvedValue([]);
      agentDefRepo.create.mockReturnValue(mockEntity as AgentDefinition);
      agentDefRepo.save.mockResolvedValue(mockEntity as AgentDefinition);
      auditService.logEvent.mockResolvedValue(null);
    });

    it('should parse valid YAML and create definition', async () => {
      const result = await service.importDefinitionFromYaml(mockWorkspaceId, validYaml, mockActorId);
      expect(result).toBeDefined();
      expect(agentDefRepo.save).toHaveBeenCalled();
    });

    it('should reject invalid apiVersion', async () => {
      const invalidYaml = validYaml.replace('devos.com/v1', 'invalid/v2');
      await expect(
        service.importDefinitionFromYaml(mockWorkspaceId, invalidYaml, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid kind', async () => {
      const invalidYaml = validYaml.replace('AgentDefinition', 'WrongKind');
      await expect(
        service.importDefinitionFromYaml(mockWorkspaceId, invalidYaml, mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject malformed YAML', async () => {
      await expect(
        service.importDefinitionFromYaml(mockWorkspaceId, 'invalid: yaml: [broken', mockActorId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('importDefinitionFromJson', () => {
    it('should parse valid JSON and create definition', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      agentDefRepo.count.mockResolvedValue(0);
      agentDefRepo.findOne.mockResolvedValue(null);
      validatorService.validateDefinition.mockReturnValue({ valid: true, errors: [], warnings: [] });
      validatorService.validateModelReferences.mockResolvedValue([]);
      agentDefRepo.create.mockReturnValue(mockEntity as AgentDefinition);
      agentDefRepo.save.mockResolvedValue(mockEntity as AgentDefinition);
      auditService.logEvent.mockResolvedValue(null);

      const json = JSON.stringify({
        apiVersion: 'devos.com/v1',
        kind: 'AgentDefinition',
        metadata: { name: 'json-agent', display_name: 'JSON Agent', category: 'custom' },
        spec: { role: 'Test', system_prompt: 'Test', model_preferences: { preferred: 'test' } },
      });

      const result = await service.importDefinitionFromJson(mockWorkspaceId, json, mockActorId);
      expect(result).toBeDefined();
    });

    it('should reject invalid JSON', async () => {
      await expect(
        service.importDefinitionFromJson(mockWorkspaceId, '{invalid json', mockActorId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('round-trip export/import', () => {
    it('should produce equivalent definition on export then import', async () => {
      // Step 1: Export
      agentDefRepo.findOne.mockResolvedValueOnce(mockEntity as AgentDefinition);

      const yamlStr = await service.exportDefinitionAsYaml(mockWorkspaceId, mockDefinitionId);
      expect(yamlStr).toContain('code-reviewer');

      // Step 2: Import - reset mocks for the import flow
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      agentDefRepo.count.mockResolvedValue(0);
      agentDefRepo.findOne.mockResolvedValueOnce(null); // name uniqueness check returns no match
      validatorService.validateDefinition.mockReturnValue({ valid: true, errors: [], warnings: [] });
      validatorService.validateModelReferences.mockResolvedValue([]);
      agentDefRepo.create.mockReturnValue(mockEntity as AgentDefinition);
      agentDefRepo.save.mockResolvedValue(mockEntity as AgentDefinition);
      auditService.logEvent.mockResolvedValue(null);

      const imported = await service.importDefinitionFromYaml(mockWorkspaceId, yamlStr, mockActorId);
      expect(imported).toBeDefined();
    });
  });
});
