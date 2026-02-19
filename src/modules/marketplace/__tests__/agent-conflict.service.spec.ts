/**
 * AgentConflictService Tests
 *
 * Story 18-8: Agent Installation Flow
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentConflictService, ConflictType } from '../agent-conflict.service';
import { InstalledAgent } from '../../../database/entities/installed-agent.entity';
import { AgentDefinition } from '../../../database/entities/agent-definition.entity';
import { MarketplaceAgent } from '../../../database/entities/marketplace-agent.entity';

describe('AgentConflictService', () => {
  let service: AgentConflictService;
  let installedAgentRepo: jest.Mocked<Repository<InstalledAgent>>;
  let definitionRepo: jest.Mocked<Repository<AgentDefinition>>;
  let marketplaceAgentRepo: jest.Mocked<Repository<MarketplaceAgent>>;

  const mockMarketplaceAgent = {
    id: 'agent-1',
    name: 'test-agent',
    displayName: 'Test Agent',
    agentDefinitionId: 'def-1',
    latestVersion: '1.0.0',
  };

  const mockDefinition = {
    id: 'def-1',
    definition: {
      spec: {
        tools: {
          allowed: ['read_file', 'write_file'],
        },
        permissions: ['file_access'],
        triggers: [{ type: 'webhook', event: 'push' }],
      },
    },
  };

  beforeEach(async () => {
    const mockRepo = () => ({
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentConflictService,
        {
          provide: getRepositoryToken(MarketplaceAgent),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(InstalledAgent),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(AgentDefinition),
          useValue: mockRepo(),
        },
      ],
    }).compile();

    service = module.get<AgentConflictService>(AgentConflictService);
    marketplaceAgentRepo = module.get(getRepositoryToken(MarketplaceAgent));
    installedAgentRepo = module.get(getRepositoryToken(InstalledAgent));
    definitionRepo = module.get(getRepositoryToken(AgentDefinition));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkConflicts', () => {
    it('should return critical conflict when agent not found', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(null);

      const result = await service.checkConflicts('non-existent', 'workspace-1');

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts[0].severity).toBe('critical');
      expect(result.canForceInstall).toBe(false);
    });

    it('should return critical conflict when definition not found', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(null);

      const result = await service.checkConflicts('agent-1', 'workspace-1');

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts[0].severity).toBe('critical');
    });

    it('should detect already installed conflict', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.findOne.mockResolvedValue({
        id: 'installed-1',
        installedVersion: '1.0.0',
      } as any);
      installedAgentRepo.find.mockResolvedValue([] as any);

      const result = await service.checkConflicts('agent-1', 'workspace-1');

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.some((c) => c.message.includes('already installed'))).toBe(true);
    });

    it('should return no conflicts for fresh installation', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.findOne.mockResolvedValue(null);
      installedAgentRepo.find.mockResolvedValue([] as any);

      const result = await service.checkConflicts('agent-1', 'workspace-1');

      // May have tool conflicts which are low severity
      const highConflicts = result.conflicts.filter((c) => c.severity === 'high' || c.severity === 'critical');
      expect(highConflicts).toHaveLength(0);
    });

    it('should detect older version installation warning', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        ...mockMarketplaceAgent,
        latestVersion: '2.0.0',
      } as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.findOne.mockResolvedValue(null);
      installedAgentRepo.find.mockResolvedValue([] as any);

      const result = await service.checkConflicts('agent-1', 'workspace-1', '1.0.0');

      expect(result.conflicts.some((c) => c.type === ConflictType.VERSION_CONFLICT)).toBe(true);
    });
  });

  describe('checkToolPermissionConflicts', () => {
    it('should detect tool overlap conflicts', async () => {
      installedAgentRepo.find.mockResolvedValue([
        {
          localDefinitionId: 'local-def-1',
          marketplaceAgentId: 'other-agent',
          marketplaceAgent: { displayName: 'Other Agent' },
        },
      ] as any);
      definitionRepo.find.mockResolvedValue([
        {
          id: 'local-def-1',
          definition: {
            spec: {
              tools: { allowed: ['read_file', 'execute_command'] },
              permissions: ['file_access'],
            },
          },
        },
      ] as any);

      const conflicts = await service.checkToolPermissionConflicts(
        mockDefinition as any,
        'workspace-1',
        'agent-1',
        'Test Agent',
      );

      expect(conflicts.some((c) => c.type === ConflictType.TOOL_PERMISSION_CONFLICT)).toBe(true);
    });

    it('should return empty conflicts when no installed agents', async () => {
      installedAgentRepo.find.mockResolvedValue([] as any);
      definitionRepo.find.mockResolvedValue([] as any);

      const conflicts = await service.checkToolPermissionConflicts(
        mockDefinition as any,
        'workspace-1',
        'agent-1',
        'Test Agent',
      );

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('checkTriggerConflicts', () => {
    it('should detect duplicate triggers', async () => {
      installedAgentRepo.find.mockResolvedValue([
        {
          localDefinitionId: 'local-def-1',
          marketplaceAgentId: 'other-agent',
          marketplaceAgent: { displayName: 'Other Agent' },
        },
      ] as any);
      definitionRepo.find.mockResolvedValue([
        {
          id: 'local-def-1',
          definition: {
            spec: {
              triggers: [{ type: 'webhook', event: 'push' }],
            },
          },
        },
      ] as any);

      const conflicts = await service.checkTriggerConflicts(
        mockDefinition as any,
        'workspace-1',
        'agent-1',
        'Test Agent',
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.TRIGGER_CONFLICT);
      expect(conflicts[0].severity).toBe('high');
    });

    it('should return empty when no triggers in new agent', async () => {
      const noTriggersDef = {
        definition: { spec: {} },
      };

      const conflicts = await service.checkTriggerConflicts(
        noTriggersDef as any,
        'workspace-1',
        'agent-1',
        'Test Agent',
      );

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('checkVersionConflicts', () => {
    it('should warn when installing older version', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        ...mockMarketplaceAgent,
        latestVersion: '2.0.0',
      } as any);

      const conflicts = await service.checkVersionConflicts(
        'agent-1',
        'workspace-1',
        '1.0.0',
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe(ConflictType.VERSION_CONFLICT);
      expect(conflicts[0].severity).toBe('medium');
    });

    it('should not warn when installing latest version', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);

      const conflicts = await service.checkVersionConflicts(
        'agent-1',
        'workspace-1',
        '1.0.0',
      );

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('getInstalledConflicts', () => {
    it('should return empty when installed agent not found', async () => {
      installedAgentRepo.findOne.mockResolvedValue(null);

      const conflicts = await service.getInstalledConflicts('non-existent');

      expect(conflicts).toHaveLength(0);
    });

    it('should return conflicts for installed agent', async () => {
      installedAgentRepo.findOne.mockResolvedValue({
        id: 'installed-1',
        workspaceId: 'workspace-1',
        marketplaceAgentId: 'agent-1',
        localDefinitionId: 'local-def-1',
        marketplaceAgent: { displayName: 'Test Agent' },
      } as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.find.mockResolvedValue([]);
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);

      const conflicts = await service.getInstalledConflicts('installed-1');

      // Should not throw and return an array
      expect(Array.isArray(conflicts)).toBe(true);
    });
  });
});
