/**
 * CustomAgentsController Tests
 *
 * Story 18-1: Agent Definition Schema
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { CustomAgentsController } from '../custom-agents.controller';
import { CustomAgentsService } from '../custom-agents.service';
import { AgentSandboxService } from '../agent-sandbox.service';
import { AgentVersionService } from '../agent-version.service';
import { AgentDefinitionValidatorService } from '../agent-definition-validator.service';
import { AgentDefinitionResponseDto, AgentDefinitionValidationResponseDto } from '../dto/agent-definition-response.dto';
import { AGENT_DEFINITION_CONSTANTS, AGENT_DEFINITION_JSON_SCHEMA } from '../constants/agent-definition.constants';

describe('CustomAgentsController', () => {
  let controller: CustomAgentsController;
  let service: jest.Mocked<CustomAgentsService>;
  let validatorService: jest.Mocked<AgentDefinitionValidatorService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockDefinitionId = '33333333-3333-3333-3333-333333333333';
  const mockActorId = '22222222-2222-2222-2222-222222222222';

  const mockReq = { user: { id: mockActorId } };

  const mockResponseDto: AgentDefinitionResponseDto = {
    id: mockDefinitionId,
    workspaceId: mockWorkspaceId,
    name: 'code-reviewer',
    displayName: 'Code Reviewer',
    description: 'Reviews code',
    version: '1.0.0',
    schemaVersion: 'v1',
    definition: {
      role: 'Expert reviewer',
      system_prompt: 'Review code.',
      model_preferences: { preferred: 'claude-sonnet-4-20250514' },
    },
    icon: 'bot',
    category: 'development',
    tags: ['code-quality'],
    isPublished: false,
    isActive: true,
    createdBy: mockActorId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomAgentsController],
      providers: [
        {
          provide: CustomAgentsService,
          useValue: {
            createDefinition: jest.fn(),
            updateDefinition: jest.fn(),
            deleteDefinition: jest.fn(),
            getDefinition: jest.fn(),
            listDefinitions: jest.fn(),
            activateDefinition: jest.fn(),
            deactivateDefinition: jest.fn(),
            validateDefinition: jest.fn(),
            exportDefinitionAsYaml: jest.fn(),
            exportDefinitionAsJson: jest.fn(),
            importDefinitionFromYaml: jest.fn(),
            importDefinitionFromJson: jest.fn(),
          },
        },
        {
          provide: AgentDefinitionValidatorService,
          useValue: {
            getSchemaForVersion: jest.fn(),
          },
        },
        {
          provide: AgentSandboxService,
          useValue: {
            createSession: jest.fn(),
            listTestScenarios: jest.fn(),
            createTestScenario: jest.fn(),
            startSession: jest.fn(),
            sendTestMessage: jest.fn(),
            getSessionStatus: jest.fn(),
            cancelSession: jest.fn(),
            getSessionResults: jest.fn(),
          },
        },
        {
          provide: AgentVersionService,
          useValue: {
            createVersion: jest.fn(),
            listVersions: jest.fn(),
            getVersion: jest.fn(),
            compareVersions: jest.fn(),
            publishVersion: jest.fn(),
            rollbackToVersion: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CustomAgentsController>(CustomAgentsController);
    service = module.get(CustomAgentsService) as jest.Mocked<CustomAgentsService>;
    validatorService = module.get(AgentDefinitionValidatorService) as jest.Mocked<AgentDefinitionValidatorService>;
  });

  describe('POST / (create)', () => {
    const createDto = {
      name: 'code-reviewer',
      displayName: 'Code Reviewer',
      definition: { role: 'test', system_prompt: 'test', model_preferences: { preferred: 'model' } },
      category: 'development',
    };

    it('should create agent definition (201)', async () => {
      service.createDefinition.mockResolvedValue(mockResponseDto);

      const result = await controller.create(mockWorkspaceId, createDto as any, mockReq);
      expect(result).toEqual(mockResponseDto);
      expect(service.createDefinition).toHaveBeenCalledWith(
        mockWorkspaceId,
        createDto,
        mockActorId,
      );
    });

    it('should propagate ForbiddenException for non-workspace-member users', async () => {
      service.createDefinition.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.create(mockWorkspaceId, createDto as any, mockReq),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate BadRequestException for validation errors', async () => {
      service.createDefinition.mockRejectedValue(
        new BadRequestException({ message: 'Validation failed', errors: [] }),
      );
      await expect(
        controller.create(mockWorkspaceId, createDto as any, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate ConflictException for duplicate name', async () => {
      service.createDefinition.mockRejectedValue(new ConflictException());
      await expect(
        controller.create(mockWorkspaceId, createDto as any, mockReq),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('GET / (list)', () => {
    it('should list all definitions for workspace (200) with pagination', async () => {
      service.listDefinitions.mockResolvedValue({
        items: [mockResponseDto],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.list(mockWorkspaceId, {});
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should apply query filters', async () => {
      service.listDefinitions.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.list(mockWorkspaceId, { category: 'development', isActive: true });
      expect(service.listDefinitions).toHaveBeenCalledWith(
        mockWorkspaceId,
        { category: 'development', isActive: true },
      );
    });
  });

  describe('GET /:definitionId (getOne)', () => {
    it('should return specific definition (200)', async () => {
      service.getDefinition.mockResolvedValue(mockResponseDto);

      const result = await controller.getOne(mockWorkspaceId, mockDefinitionId);
      expect(result).toEqual(mockResponseDto);
    });

    it('should return 404 for non-existent definition', async () => {
      service.getDefinition.mockRejectedValue(new NotFoundException());
      await expect(
        controller.getOne(mockWorkspaceId, mockDefinitionId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PUT /:definitionId (update)', () => {
    it('should update definition (200)', async () => {
      service.updateDefinition.mockResolvedValue({
        ...mockResponseDto,
        displayName: 'Updated Name',
      });

      const result = await controller.update(
        mockWorkspaceId,
        mockDefinitionId,
        { displayName: 'Updated Name' } as any,
        mockReq,
      );
      expect(result.displayName).toBe('Updated Name');
    });

    it('should propagate ForbiddenException for unauthorized users', async () => {
      service.updateDefinition.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.update(mockWorkspaceId, mockDefinitionId, {} as any, mockReq),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate BadRequestException for invalid definition on update', async () => {
      service.updateDefinition.mockRejectedValue(new BadRequestException());
      await expect(
        controller.update(mockWorkspaceId, mockDefinitionId, {} as any, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('DELETE /:definitionId (remove)', () => {
    it('should remove definition (204)', async () => {
      service.deleteDefinition.mockResolvedValue(undefined);

      await controller.remove(mockWorkspaceId, mockDefinitionId, mockReq);
      expect(service.deleteDefinition).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDefinitionId,
        mockActorId,
      );
    });

    it('should propagate ForbiddenException for unauthorized users', async () => {
      service.deleteDefinition.mockRejectedValue(new ForbiddenException());
      await expect(
        controller.remove(mockWorkspaceId, mockDefinitionId, mockReq),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /:definitionId/activate', () => {
    it('should activate definition (200)', async () => {
      service.activateDefinition.mockResolvedValue({ ...mockResponseDto, isActive: true });

      const result = await controller.activate(mockWorkspaceId, mockDefinitionId, mockReq);
      expect(result.isActive).toBe(true);
    });
  });

  describe('POST /:definitionId/deactivate', () => {
    it('should deactivate definition (200)', async () => {
      service.deactivateDefinition.mockResolvedValue({ ...mockResponseDto, isActive: false });

      const result = await controller.deactivate(mockWorkspaceId, mockDefinitionId, mockReq);
      expect(result.isActive).toBe(false);
    });
  });

  describe('POST /validate', () => {
    it('should validate definition without saving (200)', async () => {
      const validationResult: AgentDefinitionValidationResponseDto = {
        valid: true,
        errors: [],
        warnings: [],
      };
      service.validateDefinition.mockResolvedValue(validationResult);

      const result = await controller.validate(mockWorkspaceId, {
        definition: mockResponseDto.definition,
      });
      expect(result.valid).toBe(true);
    });

    it('should return errors for invalid definition (200 with errors)', async () => {
      const validationResult: AgentDefinitionValidationResponseDto = {
        valid: false,
        errors: [{ path: '/role', message: 'Missing', keyword: 'required' }],
        warnings: [],
      };
      service.validateDefinition.mockResolvedValue(validationResult);

      const result = await controller.validate(mockWorkspaceId, {
        definition: {},
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('GET /schema', () => {
    it('should return JSON Schema (200)', () => {
      validatorService.getSchemaForVersion.mockReturnValue(AGENT_DEFINITION_JSON_SCHEMA);

      const result = controller.getSchema(mockWorkspaceId);
      expect(result).toBeDefined();
      expect((result as any).$schema).toContain('json-schema');
    });

    it('should accept version query parameter', () => {
      validatorService.getSchemaForVersion.mockReturnValue(AGENT_DEFINITION_JSON_SCHEMA);

      controller.getSchema(mockWorkspaceId, 'v1');
      expect(validatorService.getSchemaForVersion).toHaveBeenCalledWith('v1');
    });
  });

  describe('GET /categories', () => {
    it('should return list of categories (200)', () => {
      const result = controller.getCategories(mockWorkspaceId);
      expect(result).toEqual(AGENT_DEFINITION_CONSTANTS.CATEGORIES);
      expect(result).toContain('development');
      expect(result).toContain('custom');
    });
  });

  describe('GET /tools', () => {
    it('should return list of available tools (200)', () => {
      const result = controller.getTools(mockWorkspaceId);
      expect(result).toBeDefined();
      expect(result.github).toBeDefined();
      expect(result.github).toContain('read_files');
    });
  });

  describe('POST /import', () => {
    it('should import YAML definition (201)', async () => {
      service.importDefinitionFromYaml.mockResolvedValue(mockResponseDto);

      const result = await controller.importDefinition(
        mockWorkspaceId,
        { content: 'yaml content', format: 'yaml' },
        mockReq,
      );
      expect(result).toEqual(mockResponseDto);
    });

    it('should import JSON definition (201)', async () => {
      service.importDefinitionFromJson.mockResolvedValue(mockResponseDto);

      const result = await controller.importDefinition(
        mockWorkspaceId,
        { content: '{}', format: 'json' },
        mockReq,
      );
      expect(result).toEqual(mockResponseDto);
    });
  });

  describe('GET /:definitionId/export', () => {
    it('should export as YAML by default', async () => {
      service.exportDefinitionAsYaml.mockResolvedValue('yaml content');

      const mockRes = {
        setHeader: jest.fn(),
      };

      const result = await controller.exportDefinition(
        mockWorkspaceId,
        mockDefinitionId,
        'yaml',
        mockRes as any,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/yaml');
      expect(result).toBe('yaml content');
    });

    it('should export as JSON when format=json', async () => {
      service.exportDefinitionAsJson.mockResolvedValue('{"key":"value"}');

      const mockRes = {
        setHeader: jest.fn(),
      };

      const result = await controller.exportDefinition(
        mockWorkspaceId,
        mockDefinitionId,
        'json',
        mockRes as any,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(result).toBe('{"key":"value"}');
    });
  });
});
