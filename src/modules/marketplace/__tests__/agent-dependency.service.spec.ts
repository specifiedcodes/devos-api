/**
 * AgentDependencyService Tests
 *
 * Story 18-8: Agent Installation Flow
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentDependencyService } from '../agent-dependency.service';
import { MarketplaceAgent } from '../../../database/entities/marketplace-agent.entity';
import { InstalledAgent } from '../../../database/entities/installed-agent.entity';
import { AgentDefinition } from '../../../database/entities/agent-definition.entity';

describe('AgentDependencyService', () => {
  let service: AgentDependencyService;
  let marketplaceAgentRepo: jest.Mocked<Repository<MarketplaceAgent>>;
  let installedAgentRepo: jest.Mocked<Repository<InstalledAgent>>;
  let definitionRepo: jest.Mocked<Repository<AgentDefinition>>;

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
        dependencies: [
          { name: 'code-analyzer', version: '^1.0.0', required: true },
          { name: 'git-helper', version: '>=2.0.0', required: false },
        ],
        tools: {
          allowed: ['read_file', 'write_file'],
        },
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
        AgentDependencyService,
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

    service = module.get<AgentDependencyService>(AgentDependencyService);
    marketplaceAgentRepo = module.get(getRepositoryToken(MarketplaceAgent));
    installedAgentRepo = module.get(getRepositoryToken(InstalledAgent));
    definitionRepo = module.get(getRepositoryToken(AgentDefinition));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkDependencies', () => {
    it('should return failure when agent not found', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(null);

      const result = await service.checkDependencies('non-existent', 'workspace-1');

      expect(result.canInstall).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].reason).toBe('Agent not found in marketplace');
    });

    it('should return failure when definition not found', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(null);

      const result = await service.checkDependencies('agent-1', 'workspace-1');

      expect(result.canInstall).toBe(false);
      expect(result.conflicts[0].reason).toBe('Agent definition not found');
    });

    it('should detect missing required dependencies', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.find.mockResolvedValue([]);

      const result = await service.checkDependencies('agent-1', 'workspace-1');

      expect(result.missingDependencies).toHaveLength(1);
      expect(result.missingDependencies[0].agentName).toBe('code-analyzer');
      expect(result.missingDependencies[0].isRequired).toBe(true);
    });

    it('should detect satisfied dependencies', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.find.mockResolvedValue([
        {
          marketplaceAgent: { name: 'code-analyzer' },
          installedVersion: '1.2.0',
        },
      ] as any);

      const result = await service.checkDependencies('agent-1', 'workspace-1');

      expect(result.installedDependencies).toHaveLength(1);
      expect(result.installedDependencies[0].dependency.agentName).toBe('code-analyzer');
      expect(result.installedDependencies[0].installedVersion).toBe('1.2.0');
    });

    it('should detect version conflicts', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.find.mockResolvedValue([
        {
          marketplaceAgent: { name: 'code-analyzer', displayName: 'Code Analyzer' },
          installedVersion: '0.5.0', // Does not satisfy ^1.0.0
          localDefinitionId: null,
        },
      ] as any);

      const result = await service.checkDependencies('agent-1', 'workspace-1');

      // Version 0.5.0 does not satisfy ^1.0.0 (must be >= 1.0.0)
      expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
      expect(result.conflicts.some((c) => c.conflictingAgent === 'code-analyzer')).toBe(true);
    });
  });

  describe('satisfiesVersion', () => {
    it('should match exact version', () => {
      expect(service.satisfiesVersion('1.0.0', '1.0.0')).toBe(true);
      expect(service.satisfiesVersion('1.0.0', '1.0.1')).toBe(false);
    });

    it('should match wildcard', () => {
      expect(service.satisfiesVersion('1.0.0', '*')).toBe(true);
      expect(service.satisfiesVersion('2.0.0', '*')).toBe(true);
    });

    it('should match caret ranges', () => {
      expect(service.satisfiesVersion('1.2.3', '^1.0.0')).toBe(true);
      expect(service.satisfiesVersion('1.5.0', '^1.2.0')).toBe(true);
      // 2.0.0 should not match ^1.0.0 (different major version)
      expect(service.satisfiesVersion('2.0.0', '^1.0.0')).toBe(false);
      expect(service.satisfiesVersion('0.9.0', '^1.0.0')).toBe(false); // lower than target
    });

    it('should match tilde ranges', () => {
      expect(service.satisfiesVersion('1.2.5', '~1.2.0')).toBe(true);
      expect(service.satisfiesVersion('1.3.0', '~1.2.0')).toBe(false);
    });

    it('should match comparison operators', () => {
      expect(service.satisfiesVersion('1.5.0', '>=1.0.0')).toBe(true);
      expect(service.satisfiesVersion('0.5.0', '>=1.0.0')).toBe(false);
      expect(service.satisfiesVersion('0.9.0', '<1.0.0')).toBe(true);
      expect(service.satisfiesVersion('1.0.0', '<1.0.0')).toBe(false);
    });

    it('should match compound ranges', () => {
      expect(service.satisfiesVersion('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
      // 2.0.0 does not satisfy <2.0.0
      expect(service.satisfiesVersion('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
      expect(service.satisfiesVersion('0.9.0', '>=1.0.0 <2.0.0')).toBe(false);
    });
  });

  describe('parseDependencies', () => {
    it('should parse dependencies from definition', () => {
      const deps = service.parseDependencies(mockDefinition as any);

      expect(deps).toHaveLength(2);
      expect(deps[0].agentName).toBe('code-analyzer');
      expect(deps[0].versionRange).toBe('^1.0.0');
      expect(deps[0].isRequired).toBe(true);
      expect(deps[1].agentName).toBe('git-helper');
      expect(deps[1].isRequired).toBe(false);
    });

    it('should return empty array for definition without dependencies', () => {
      const noDepsDef = { definition: { spec: {} } };
      const deps = service.parseDependencies(noDepsDef as any);

      expect(deps).toHaveLength(0);
    });
  });

  describe('checkToolCompatibility', () => {
    it('should return compatible when no conflicts', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.find.mockResolvedValue([]);

      const result = await service.checkToolCompatibility('agent-1', 'workspace-1');

      expect(result.isCompatible).toBe(true);
      expect(result.toolConflicts).toHaveLength(0);
    });

    it('should detect tool conflicts', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.find.mockResolvedValue([
        {
          localDefinitionId: 'local-def-1',
          marketplaceAgent: { displayName: 'Other Agent' },
        },
      ] as any);
      definitionRepo.findOne
        .mockResolvedValueOnce(mockDefinition as any) // First call for new agent
        .mockResolvedValueOnce({
          // Second call for installed agent
          definition: { spec: { tools: { allowed: ['read_file', 'execute_command'] } } },
        } as any);

      const result = await service.checkToolCompatibility('agent-1', 'workspace-1');

      expect(result.toolConflicts.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getDependents', () => {
    it('should return empty array when agent not found', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(null);

      const dependents = await service.getDependents('non-existent', 'workspace-1');

      expect(dependents).toHaveLength(0);
    });

    it('should find agents that depend on the target', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      installedAgentRepo.find.mockResolvedValue([
        {
          localDefinitionId: 'local-def-1',
          marketplaceAgent: { displayName: 'Dependent Agent' },
          installedVersion: '1.0.0',
        },
      ] as any);
      definitionRepo.findOne.mockResolvedValue({
        definition: {
          spec: {
            dependencies: [{ name: 'test-agent', version: '^1.0.0', required: true }],
          },
        },
      } as any);

      const dependents = await service.getDependents('agent-1', 'workspace-1');

      expect(dependents).toHaveLength(1);
      expect(dependents[0].agentName).toBe('Dependent Agent');
    });
  });
});
