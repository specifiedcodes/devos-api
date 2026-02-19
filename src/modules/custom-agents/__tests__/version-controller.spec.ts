/**
 * CustomAgentsController Version Endpoints Unit Tests
 *
 * Story 18-4: Agent Versioning
 *
 * Tests for version management REST API endpoints.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CustomAgentsController } from '../custom-agents.controller';
import { AgentVersionService } from '../agent-version.service';
import { CustomAgentsService } from '../custom-agents.service';
import { AgentSandboxService } from '../agent-sandbox.service';
import { AgentDefinitionValidatorService } from '../agent-definition-validator.service';
import { VersionIncrementType } from '../dto/create-agent-version.dto';

describe('CustomAgentsController - Version Endpoints', () => {
  let controller: CustomAgentsController;
  let versionService: jest.Mocked<AgentVersionService>;

  const mockWorkspaceId = 'workspace-123';
  const mockDefinitionId = 'definition-123';
  const mockUserId = 'user-123';

  const mockRequest = {
    user: { id: mockUserId, userId: mockUserId },
  };

  const mockVersionResponse = {
    id: 'version-123',
    agentDefinitionId: mockDefinitionId,
    version: '1.0.0',
    definitionSnapshot: {},
    changelog: 'Test changelog',
    isPublished: false,
    publishedAt: null,
    createdBy: mockUserId,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockVersionService = {
      createVersion: jest.fn(),
      listVersions: jest.fn(),
      getVersion: jest.fn(),
      compareVersions: jest.fn(),
      publishVersion: jest.fn(),
      rollbackToVersion: jest.fn(),
    };

    const mockCustomAgentsService = {
      validateDefinition: jest.fn(),
      createDefinition: jest.fn(),
      listDefinitions: jest.fn(),
      getDefinition: jest.fn(),
      updateDefinition: jest.fn(),
      deleteDefinition: jest.fn(),
      activateDefinition: jest.fn(),
      deactivateDefinition: jest.fn(),
      exportDefinitionAsYaml: jest.fn(),
      exportDefinitionAsJson: jest.fn(),
      importDefinitionFromYaml: jest.fn(),
      importDefinitionFromJson: jest.fn(),
    };

    const mockSandboxService = {
      createSession: jest.fn(),
      listTestScenarios: jest.fn(),
      createTestScenario: jest.fn(),
      startSession: jest.fn(),
      sendTestMessage: jest.fn(),
      getSessionStatus: jest.fn(),
      cancelSession: jest.fn(),
      getSessionResults: jest.fn(),
    };

    const mockValidatorService = {
      getSchemaForVersion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomAgentsController],
      providers: [
        { provide: AgentVersionService, useValue: mockVersionService },
        { provide: CustomAgentsService, useValue: mockCustomAgentsService },
        { provide: AgentSandboxService, useValue: mockSandboxService },
        { provide: AgentDefinitionValidatorService, useValue: mockValidatorService },
      ],
    }).compile();

    controller = module.get(CustomAgentsController);
    versionService = module.get(AgentVersionService);
  });

  describe('listVersions', () => {
    it('should return paginated version list', async () => {
      const mockPaginatedResult = {
        items: [mockVersionResponse],
        total: 1,
        page: 1,
        limit: 20,
      };

      versionService.listVersions.mockResolvedValue(mockPaginatedResult as any);

      const result = await controller.listVersions(
        mockWorkspaceId,
        mockDefinitionId,
        { page: 1, limit: 20 },
      );

      expect(result).toEqual(mockPaginatedResult);
      expect(versionService.listVersions).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDefinitionId,
        { page: 1, limit: 20 },
      );
    });

    it('should pass publishedOnly filter', async () => {
      versionService.listVersions.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.listVersions(
        mockWorkspaceId,
        mockDefinitionId,
        { page: 1, limit: 20, publishedOnly: true },
      );

      expect(versionService.listVersions).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDefinitionId,
        { page: 1, limit: 20, publishedOnly: true },
      );
    });
  });

  describe('createVersion', () => {
    it('should create a new version', async () => {
      versionService.createVersion.mockResolvedValue(mockVersionResponse as any);

      const result = await controller.createVersion(
        mockWorkspaceId,
        mockDefinitionId,
        { version: '1.0.0', changelog: 'Initial version' },
        mockRequest,
      );

      expect(result).toEqual(mockVersionResponse);
      expect(versionService.createVersion).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDefinitionId,
        { version: '1.0.0', changelog: 'Initial version' },
        mockUserId,
      );
    });

    it('should pass increment type for auto-versioning', async () => {
      versionService.createVersion.mockResolvedValue({
        ...mockVersionResponse,
        version: '1.0.1',
      } as any);

      await controller.createVersion(
        mockWorkspaceId,
        mockDefinitionId,
        { incrementType: VersionIncrementType.PATCH },
        mockRequest,
      );

      expect(versionService.createVersion).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDefinitionId,
        { incrementType: VersionIncrementType.PATCH },
        mockUserId,
      );
    });
  });

  describe('getVersion', () => {
    it('should return a specific version', async () => {
      versionService.getVersion.mockResolvedValue(mockVersionResponse as any);

      const result = await controller.getVersion(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
      );

      expect(result).toEqual(mockVersionResponse);
      expect(versionService.getVersion).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
      );
    });
  });

  describe('compareVersions', () => {
    it('should return version diff', async () => {
      const mockDiff = {
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        changes: [
          {
            path: 'definition.role',
            type: 'modified' as const,
            oldValue: 'Old role',
            newValue: 'New role',
          },
        ],
        summary: { added: 0, modified: 1, removed: 0 },
      };

      versionService.compareVersions.mockResolvedValue(mockDiff as any);

      const result = await controller.compareVersions(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
        '1.1.0',
      );

      expect(result).toEqual(mockDiff);
      expect(versionService.compareVersions).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
        '1.1.0',
      );
    });
  });

  describe('publishVersion', () => {
    it('should publish a version', async () => {
      const publishedVersion = {
        ...mockVersionResponse,
        isPublished: true,
        publishedAt: new Date(),
      };

      versionService.publishVersion.mockResolvedValue(publishedVersion as any);

      const result = await controller.publishVersion(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
        mockRequest,
      );

      expect(result.isPublished).toBe(true);
      expect(versionService.publishVersion).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
        mockUserId,
      );
    });
  });

  describe('rollbackToVersion', () => {
    it('should rollback to a version', async () => {
      const rollbackVersion = {
        ...mockVersionResponse,
        version: '1.1.1',
        changelog: 'Rollback to version 1.0.0',
      };

      versionService.rollbackToVersion.mockResolvedValue(rollbackVersion as any);

      const result = await controller.rollbackToVersion(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
        mockRequest,
      );

      expect(result.changelog).toContain('Rollback');
      expect(versionService.rollbackToVersion).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
        mockUserId,
      );
    });
  });
});
